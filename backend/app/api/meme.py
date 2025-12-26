"""
API routes for meme venture management.
"""
from fastapi import APIRouter, HTTPException, Header
from typing import Optional, List
from pydantic import BaseModel

from app.database import get_supabase
from app.services.meme_venture import meme_service

router = APIRouter(prefix="/api/meme", tags=["meme"])


class CreateProjectRequest(BaseModel):
    name: str
    ticker: str
    narrative_tags: List[str] = []


class UpdateScoresRequest(BaseModel):
    viral_score: Optional[float] = None
    social_velocity: Optional[float] = None
    holder_concentration: Optional[float] = None
    liquidity_signal: Optional[str] = None


class AdvanceStageRequest(BaseModel):
    new_stage: str


@router.get("/projects")
async def get_projects(stage: Optional[str] = None, limit: int = 50):
    """Get meme projects, optionally filtered by stage."""
    from app.models.domain import MemeProjectStage
    stage_enum = MemeProjectStage(stage) if stage else None
    return await meme_service.get_projects(stage=stage_enum, limit=limit)


@router.post("/projects")
async def create_project(
    req: CreateProjectRequest,
    x_user_id: str = Header(None)
):
    """Create a new meme project opportunity."""
    return await meme_service.create_project(
        name=req.name,
        ticker=req.ticker,
        narrative_tags=req.narrative_tags,
        user_id=x_user_id
    )


@router.get("/projects/{project_id}")
async def get_project(project_id: str):
    """Get a specific project."""
    from uuid import UUID
    project = await meme_service.get_project(UUID(project_id))
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.put("/projects/{project_id}/scores")
async def update_scores(project_id: str, req: UpdateScoresRequest):
    """Update project scoring metrics."""
    from uuid import UUID
    return await meme_service.update_scores(
        project_id=UUID(project_id),
        viral_score=req.viral_score,
        social_velocity=req.social_velocity,
        holder_concentration=req.holder_concentration,
        liquidity_signal=req.liquidity_signal
    )


@router.post("/projects/{project_id}/advance")
async def advance_stage(
    project_id: str,
    req: AdvanceStageRequest,
    x_user_id: str = Header(None)
):
    """Advance project to next stage."""
    from uuid import UUID
    from app.models.domain import MemeProjectStage
    
    try:
        new_stage = MemeProjectStage(req.new_stage)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid stage: {req.new_stage}")
    
    return await meme_service.advance_stage(
        project_id=UUID(project_id),
        new_stage=new_stage,
        user_id=x_user_id
    )


@router.get("/projects/{project_id}/checklist")
async def get_launch_checklist(project_id: str):
    """Get launch readiness checklist for a project."""
    from uuid import UUID
    return await meme_service.get_launch_checklist(UUID(project_id))


@router.get("/projects/{project_id}/metrics")
async def get_project_metrics(project_id: str, limit: int = 100):
    """Get historical metrics for a project."""
    from uuid import UUID
    return await meme_service.get_project_metrics(UUID(project_id))


@router.get("/tasks")
async def get_meme_tasks(project_id: Optional[str] = None, is_completed: Optional[bool] = None):
    """Get meme tasks with optional filters."""
    supabase = get_supabase()
    query = supabase.table("meme_tasks").select("*, meme_projects(name, ticker)")
    
    if project_id:
        query = query.eq("project_id", project_id)
    if is_completed is not None:
        query = query.eq("is_completed", is_completed)
    
    result = query.order("created_at", desc=True).execute()
    return result.data
