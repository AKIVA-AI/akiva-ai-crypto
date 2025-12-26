"""
Meme Venture Service - Opportunity scoring and project lifecycle.
"""
import structlog
from typing import Dict, List, Optional
from uuid import UUID, uuid4
from datetime import datetime

from app.models.domain import MemeProject, MemeProjectStage
from app.config import settings
from app.database import get_supabase, audit_log, create_alert

logger = structlog.get_logger()


class MemeVentureService:
    """
    Manages meme coin venture projects.
    
    Responsibilities:
    - Viral opportunity scoring
    - Launch project workflow with approvals
    - Post-launch monitoring
    - Compliance-first risk controls
    
    NOTE: This service does NOT implement manipulative behavior.
    It provides monitoring and risk management only.
    """
    
    # Scoring thresholds
    MIN_VIRAL_SCORE = 50  # Minimum score to consider
    MIN_LIQUIDITY_USD = 50000  # Minimum liquidity
    MAX_HOLDER_CONCENTRATION = 30  # Max % held by top 10
    
    def __init__(self):
        pass
    
    async def get_projects(
        self,
        stage: Optional[MemeProjectStage] = None,
        limit: int = 50
    ) -> List[Dict]:
        """Get meme projects, optionally filtered by stage."""
        supabase = get_supabase()
        
        query = supabase.table("meme_projects").select("*")
        
        if stage:
            query = query.eq("stage", stage.value)
        
        result = query.order("created_at", desc=True).limit(limit).execute()
        return result.data
    
    async def get_project(self, project_id: UUID) -> Optional[Dict]:
        """Get a specific project by ID."""
        supabase = get_supabase()
        result = supabase.table("meme_projects").select("*").eq("id", str(project_id)).single().execute()
        return result.data if result.data else None
    
    async def create_project(
        self,
        name: str,
        ticker: str,
        narrative_tags: List[str] = None,
        user_id: Optional[str] = None
    ) -> Dict:
        """Create a new meme project opportunity."""
        supabase = get_supabase()
        
        project_id = str(uuid4())
        project_data = {
            "id": project_id,
            "name": name,
            "ticker": ticker.upper(),
            "stage": MemeProjectStage.OPPORTUNITY.value,
            "narrative_tags": narrative_tags or [],
            "viral_score": 0,
            "social_velocity": 0,
            "holder_concentration": 0,
            "go_no_go_approved": False
        }
        
        result = supabase.table("meme_projects").insert(project_data).execute()
        
        await audit_log(
            action="meme_project_created",
            resource_type="meme_project",
            resource_id=project_id,
            user_id=user_id,
            after_state=project_data
        )
        
        logger.info("meme_project_created", project_id=project_id, ticker=ticker)
        
        return result.data[0] if result.data else project_data
    
    async def update_scores(
        self,
        project_id: UUID,
        viral_score: Optional[float] = None,
        social_velocity: Optional[float] = None,
        holder_concentration: Optional[float] = None,
        liquidity_signal: Optional[str] = None
    ) -> Dict:
        """Update project scoring metrics."""
        supabase = get_supabase()
        
        updates = {"updated_at": datetime.utcnow().isoformat()}
        
        if viral_score is not None:
            updates["viral_score"] = viral_score
        if social_velocity is not None:
            updates["social_velocity"] = social_velocity
        if holder_concentration is not None:
            updates["holder_concentration"] = holder_concentration
        if liquidity_signal is not None:
            updates["liquidity_signal"] = liquidity_signal
        
        result = supabase.table("meme_projects").update(updates).eq("id", str(project_id)).execute()
        
        logger.info(
            "meme_scores_updated",
            project_id=str(project_id),
            updates=updates
        )
        
        return result.data[0] if result.data else {}
    
    async def advance_stage(
        self,
        project_id: UUID,
        new_stage: MemeProjectStage,
        user_id: Optional[str] = None
    ) -> Dict:
        """Advance a project to the next stage."""
        supabase = get_supabase()
        
        # Get current project
        current = await self.get_project(project_id)
        if not current:
            raise ValueError(f"Project {project_id} not found")
        
        old_stage = current["stage"]
        
        # Validate transition
        if not self._validate_stage_transition(old_stage, new_stage.value):
            raise ValueError(f"Invalid transition from {old_stage} to {new_stage.value}")
        
        # Update stage
        updates = {
            "stage": new_stage.value,
            "updated_at": datetime.utcnow().isoformat()
        }
        
        result = supabase.table("meme_projects").update(updates).eq("id", str(project_id)).execute()
        
        await audit_log(
            action="meme_stage_advanced",
            resource_type="meme_project",
            resource_id=str(project_id),
            user_id=user_id,
            before_state={"stage": old_stage},
            after_state={"stage": new_stage.value}
        )
        
        logger.info(
            "meme_stage_advanced",
            project_id=str(project_id),
            old_stage=old_stage,
            new_stage=new_stage.value
        )
        
        return result.data[0] if result.data else {}
    
    async def approve_go_no_go(
        self,
        project_id: UUID,
        user_id: str,
        approved: bool
    ) -> Dict:
        """Record go/no-go decision for a project."""
        supabase = get_supabase()
        
        updates = {
            "go_no_go_approved": approved,
            "approved_by": user_id if approved else None,
            "updated_at": datetime.utcnow().isoformat()
        }
        
        if approved:
            updates["stage"] = MemeProjectStage.APPROVED.value
        
        result = supabase.table("meme_projects").update(updates).eq("id", str(project_id)).execute()
        
        await audit_log(
            action="meme_go_no_go_decision",
            resource_type="meme_project",
            resource_id=str(project_id),
            user_id=user_id,
            after_state={"approved": approved}
        )
        
        if approved:
            await create_alert(
                title=f"Meme Project Approved",
                message=f"Project {project_id} has been approved for launch",
                severity="info",
                source="meme_venture"
            )
        
        logger.info(
            "meme_go_no_go",
            project_id=str(project_id),
            approved=approved,
            user_id=user_id
        )
        
        return result.data[0] if result.data else {}
    
    async def get_project_metrics(self, project_id: UUID) -> List[Dict]:
        """Get historical metrics for a project."""
        supabase = get_supabase()
        result = supabase.table("meme_metrics").select("*").eq(
            "project_id", str(project_id)
        ).order("recorded_at", desc=True).limit(100).execute()
        
        return result.data
    
    async def record_metrics(
        self,
        project_id: UUID,
        pnl: float,
        liquidity_health: float,
        slippage: float,
        exit_progress: float = 0,
        incident_count: int = 0
    ):
        """Record metrics snapshot for a project."""
        supabase = get_supabase()
        
        supabase.table("meme_metrics").insert({
            "project_id": str(project_id),
            "pnl": pnl,
            "liquidity_health": liquidity_health,
            "slippage": slippage,
            "exit_progress": exit_progress,
            "incident_count": incident_count
        }).execute()
        
        # Check for concerning metrics
        if liquidity_health < 50:
            await create_alert(
                title="Low Liquidity Health",
                message=f"Meme project {project_id} liquidity at {liquidity_health}%",
                severity="warning",
                source="meme_venture"
            )
        
        if slippage > 5:
            await create_alert(
                title="High Slippage Detected",
                message=f"Meme project {project_id} slippage at {slippage}%",
                severity="warning",
                source="meme_venture"
            )
    
    async def get_launch_checklist(self, project_id: UUID) -> Dict:
        """Get launch readiness checklist for a project."""
        project = await self.get_project(project_id)
        if not project:
            return {"ready": False, "checks": []}
        
        checks = [
            {
                "name": "Minimum viral score",
                "required": self.MIN_VIRAL_SCORE,
                "actual": project.get("viral_score", 0),
                "passed": project.get("viral_score", 0) >= self.MIN_VIRAL_SCORE
            },
            {
                "name": "Holder concentration",
                "required": f"< {self.MAX_HOLDER_CONCENTRATION}%",
                "actual": project.get("holder_concentration", 100),
                "passed": project.get("holder_concentration", 100) <= self.MAX_HOLDER_CONCENTRATION
            },
            {
                "name": "Go/No-Go approval",
                "required": True,
                "actual": project.get("go_no_go_approved", False),
                "passed": project.get("go_no_go_approved", False)
            },
            {
                "name": "Due diligence complete",
                "required": True,
                "actual": project.get("stage") != MemeProjectStage.OPPORTUNITY.value,
                "passed": project.get("stage") != MemeProjectStage.OPPORTUNITY.value
            }
        ]
        
        all_passed = all(c["passed"] for c in checks)
        
        return {
            "project_id": str(project_id),
            "ready": all_passed,
            "checks": checks
        }
    
    def _validate_stage_transition(self, current: str, target: str) -> bool:
        """Validate stage transition is allowed."""
        valid_transitions = {
            MemeProjectStage.OPPORTUNITY.value: [MemeProjectStage.DUE_DILIGENCE.value],
            MemeProjectStage.DUE_DILIGENCE.value: [MemeProjectStage.APPROVED.value, MemeProjectStage.CLOSED.value],
            MemeProjectStage.APPROVED.value: [MemeProjectStage.LIVE.value, MemeProjectStage.CLOSED.value],
            MemeProjectStage.LIVE.value: [MemeProjectStage.EXITING.value],
            MemeProjectStage.EXITING.value: [MemeProjectStage.CLOSED.value],
            MemeProjectStage.CLOSED.value: []
        }
        
        allowed = valid_transitions.get(current, [])
        return target in allowed


# Singleton instance
meme_service = MemeVentureService()
