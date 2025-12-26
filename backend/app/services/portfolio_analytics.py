"""
Portfolio Analytics Service - Performance metrics, risk attribution, and exposure analysis.
"""
import structlog
from typing import Dict, List, Optional
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from uuid import UUID
import math

from app.database import get_supabase

logger = structlog.get_logger()


@dataclass
class PerformanceMetrics:
    """Portfolio performance metrics."""
    total_pnl: float = 0.0
    realized_pnl: float = 0.0
    unrealized_pnl: float = 0.0
    daily_pnl: float = 0.0
    weekly_pnl: float = 0.0
    monthly_pnl: float = 0.0
    ytd_pnl: float = 0.0
    
    # Returns
    daily_return_pct: float = 0.0
    weekly_return_pct: float = 0.0
    monthly_return_pct: float = 0.0
    ytd_return_pct: float = 0.0
    
    # Risk-adjusted metrics
    sharpe_ratio: float = 0.0
    sortino_ratio: float = 0.0
    calmar_ratio: float = 0.0
    max_drawdown: float = 0.0
    current_drawdown: float = 0.0
    
    # Win/loss metrics
    win_rate: float = 0.0
    profit_factor: float = 0.0
    avg_win: float = 0.0
    avg_loss: float = 0.0
    largest_win: float = 0.0
    largest_loss: float = 0.0
    
    # Activity metrics
    total_trades: int = 0
    winning_trades: int = 0
    losing_trades: int = 0


@dataclass
class ExposureBreakdown:
    """Exposure breakdown by various dimensions."""
    by_book: Dict[str, float] = field(default_factory=dict)
    by_asset: Dict[str, float] = field(default_factory=dict)
    by_venue: Dict[str, float] = field(default_factory=dict)
    by_direction: Dict[str, float] = field(default_factory=dict)
    by_risk_tier: Dict[int, float] = field(default_factory=dict)
    
    # Concentration metrics
    hhi_concentration: float = 0.0  # Herfindahl-Hirschman Index
    top_3_concentration: float = 0.0
    
    # Risk metrics
    gross_exposure: float = 0.0
    net_exposure: float = 0.0
    long_exposure: float = 0.0
    short_exposure: float = 0.0
    leverage: float = 0.0


@dataclass
class RiskAttribution:
    """Risk contribution by position/strategy."""
    position_id: str
    instrument: str
    book_name: str
    strategy_name: Optional[str]
    notional: float
    pnl: float
    pnl_contribution_pct: float
    var_contribution: float
    marginal_var: float
    beta: float
    correlation_to_portfolio: float


class PortfolioAnalytics:
    """Comprehensive portfolio analytics engine."""
    
    def __init__(self, risk_free_rate: float = 0.05):
        self.risk_free_rate = risk_free_rate
        self._price_cache: Dict[str, float] = {}
    
    async def get_portfolio_performance(
        self, 
        book_id: Optional[UUID] = None,
        days: int = 30
    ) -> PerformanceMetrics:
        """Calculate comprehensive performance metrics."""
        metrics = PerformanceMetrics()
        
        try:
            supabase = get_supabase()
            
            # Get positions
            query = supabase.table("positions").select("*").eq("is_open", True)
            if book_id:
                query = query.eq("book_id", str(book_id))
            
            positions = query.execute().data or []
            
            # Calculate PnL components
            for pos in positions:
                metrics.unrealized_pnl += pos.get("unrealized_pnl", 0)
                metrics.realized_pnl += pos.get("realized_pnl", 0)
            
            metrics.total_pnl = metrics.realized_pnl + metrics.unrealized_pnl
            
            # Get fills for trade metrics
            cutoff_date = (datetime.utcnow() - timedelta(days=days)).isoformat()
            fills_query = supabase.table("fills").select("*").gte("executed_at", cutoff_date)
            fills = fills_query.execute().data or []
            
            # Calculate trade metrics from fills
            trade_pnls = self._calculate_trade_pnls(fills)
            
            if trade_pnls:
                metrics.total_trades = len(trade_pnls)
                metrics.winning_trades = sum(1 for p in trade_pnls if p > 0)
                metrics.losing_trades = sum(1 for p in trade_pnls if p < 0)
                metrics.win_rate = metrics.winning_trades / metrics.total_trades if metrics.total_trades > 0 else 0
                
                wins = [p for p in trade_pnls if p > 0]
                losses = [p for p in trade_pnls if p < 0]
                
                metrics.avg_win = sum(wins) / len(wins) if wins else 0
                metrics.avg_loss = sum(losses) / len(losses) if losses else 0
                metrics.largest_win = max(wins) if wins else 0
                metrics.largest_loss = min(losses) if losses else 0
                
                total_wins = sum(wins)
                total_losses = abs(sum(losses))
                metrics.profit_factor = total_wins / total_losses if total_losses > 0 else float('inf')
            
            # Get historical PnL for time-based returns
            pnl_history = await self._get_pnl_history(book_id, days)
            
            if pnl_history:
                # Daily PnL (most recent)
                metrics.daily_pnl = pnl_history[-1] if pnl_history else 0
                
                # Weekly PnL
                if len(pnl_history) >= 7:
                    metrics.weekly_pnl = sum(pnl_history[-7:])
                
                # Monthly PnL
                metrics.monthly_pnl = sum(pnl_history)
                
                # Calculate risk-adjusted metrics
                returns = self._pnl_to_returns(pnl_history)
                if returns:
                    metrics.sharpe_ratio = self._calculate_sharpe(returns)
                    metrics.sortino_ratio = self._calculate_sortino(returns)
                    metrics.max_drawdown = self._calculate_max_drawdown(pnl_history)
            
            logger.info("portfolio_performance_calculated", 
                       total_pnl=metrics.total_pnl,
                       sharpe=metrics.sharpe_ratio)
            
        except Exception as e:
            logger.error("portfolio_performance_error", error=str(e))
        
        return metrics
    
    async def get_exposure_breakdown(
        self, 
        book_id: Optional[UUID] = None
    ) -> ExposureBreakdown:
        """Calculate exposure breakdown across dimensions."""
        exposure = ExposureBreakdown()
        
        try:
            supabase = get_supabase()
            
            # Get positions with book info
            query = supabase.table("positions").select(
                "*, books(name, type, risk_tier)"
            ).eq("is_open", True)
            
            if book_id:
                query = query.eq("book_id", str(book_id))
            
            positions = query.execute().data or []
            
            total_capital = await self._get_total_capital(book_id)
            
            for pos in positions:
                notional = abs(pos.get("size", 0) * pos.get("mark_price", 0))
                side = pos.get("side", "buy")
                is_long = side == "buy"
                
                # By book
                book = pos.get("books", {}) or {}
                book_name = book.get("name", "Unknown")
                exposure.by_book[book_name] = exposure.by_book.get(book_name, 0) + notional
                
                # By asset
                instrument = pos.get("instrument", "Unknown")
                exposure.by_asset[instrument] = exposure.by_asset.get(instrument, 0) + notional
                
                # By venue
                venue_id = pos.get("venue_id", "Unknown")
                exposure.by_venue[str(venue_id)] = exposure.by_venue.get(str(venue_id), 0) + notional
                
                # By direction
                direction = "long" if is_long else "short"
                exposure.by_direction[direction] = exposure.by_direction.get(direction, 0) + notional
                
                # By risk tier
                risk_tier = book.get("risk_tier", 1)
                exposure.by_risk_tier[risk_tier] = exposure.by_risk_tier.get(risk_tier, 0) + notional
                
                # Aggregate exposures
                exposure.gross_exposure += notional
                if is_long:
                    exposure.long_exposure += notional
                    exposure.net_exposure += notional
                else:
                    exposure.short_exposure += notional
                    exposure.net_exposure -= notional
            
            # Calculate leverage
            if total_capital > 0:
                exposure.leverage = exposure.gross_exposure / total_capital
            
            # Calculate concentration metrics
            if exposure.by_asset:
                total = sum(exposure.by_asset.values())
                if total > 0:
                    weights = [v / total for v in exposure.by_asset.values()]
                    exposure.hhi_concentration = sum(w ** 2 for w in weights)
                    sorted_weights = sorted(weights, reverse=True)
                    exposure.top_3_concentration = sum(sorted_weights[:3])
            
            logger.info("exposure_breakdown_calculated",
                       gross=exposure.gross_exposure,
                       net=exposure.net_exposure,
                       leverage=exposure.leverage)
            
        except Exception as e:
            logger.error("exposure_breakdown_error", error=str(e))
        
        return exposure
    
    async def get_risk_attribution(
        self, 
        book_id: Optional[UUID] = None
    ) -> List[RiskAttribution]:
        """Calculate risk attribution by position."""
        attributions = []
        
        try:
            supabase = get_supabase()
            
            query = supabase.table("positions").select(
                "*, books(name), strategies(name)"
            ).eq("is_open", True)
            
            if book_id:
                query = query.eq("book_id", str(book_id))
            
            positions = query.execute().data or []
            
            # Calculate total PnL for contribution percentages
            total_pnl = sum(
                pos.get("unrealized_pnl", 0) + pos.get("realized_pnl", 0) 
                for pos in positions
            )
            
            for pos in positions:
                pnl = pos.get("unrealized_pnl", 0) + pos.get("realized_pnl", 0)
                notional = abs(pos.get("size", 0) * pos.get("mark_price", 0))
                
                book = pos.get("books", {}) or {}
                strategy = pos.get("strategies", {}) or {}
                
                attr = RiskAttribution(
                    position_id=pos.get("id", ""),
                    instrument=pos.get("instrument", "Unknown"),
                    book_name=book.get("name", "Unknown"),
                    strategy_name=strategy.get("name"),
                    notional=notional,
                    pnl=pnl,
                    pnl_contribution_pct=abs(pnl / total_pnl * 100) if total_pnl != 0 else 0,
                    var_contribution=notional * 0.02,  # Simplified 2% VaR
                    marginal_var=notional * 0.015,  # Simplified marginal VaR
                    beta=1.0,  # Placeholder
                    correlation_to_portfolio=0.5,  # Placeholder
                )
                attributions.append(attr)
            
            # Sort by absolute PnL contribution
            attributions.sort(key=lambda x: abs(x.pnl), reverse=True)
            
        except Exception as e:
            logger.error("risk_attribution_error", error=str(e))
        
        return attributions
    
    async def get_book_summary(self) -> Dict[str, dict]:
        """Get summary metrics for each book."""
        summaries = {}
        
        try:
            supabase = get_supabase()
            
            books = supabase.table("books").select("*").execute().data or []
            
            for book in books:
                book_id = book.get("id")
                book_name = book.get("name", "Unknown")
                
                # Get positions for this book
                positions = supabase.table("positions").select("*").eq(
                    "book_id", book_id
                ).eq("is_open", True).execute().data or []
                
                total_pnl = sum(
                    p.get("unrealized_pnl", 0) + p.get("realized_pnl", 0) 
                    for p in positions
                )
                
                gross_exposure = sum(
                    abs(p.get("size", 0) * p.get("mark_price", 0)) 
                    for p in positions
                )
                
                capital = book.get("capital_allocated", 0)
                
                summaries[book_name] = {
                    "id": book_id,
                    "type": book.get("type"),
                    "status": book.get("status"),
                    "capital_allocated": capital,
                    "current_exposure": book.get("current_exposure", 0),
                    "gross_exposure": gross_exposure,
                    "total_pnl": total_pnl,
                    "position_count": len(positions),
                    "utilization": gross_exposure / capital if capital > 0 else 0,
                    "risk_tier": book.get("risk_tier", 1),
                }
            
        except Exception as e:
            logger.error("book_summary_error", error=str(e))
        
        return summaries
    
    def _calculate_trade_pnls(self, fills: List[dict]) -> List[float]:
        """Calculate PnL from fills (simplified)."""
        # Group fills by order and calculate PnL
        # This is a simplified version - real implementation would track entry/exit
        pnls = []
        
        # For now, return mock PnLs based on fill count
        for i, fill in enumerate(fills):
            # Simulate some wins and losses
            pnl = fill.get("size", 0) * 10 * (1 if i % 3 != 0 else -0.5)
            pnls.append(pnl)
        
        return pnls
    
    async def _get_pnl_history(
        self, 
        book_id: Optional[UUID], 
        days: int
    ) -> List[float]:
        """Get daily PnL history."""
        # In a real implementation, this would query historical snapshots
        # For now, return mock data
        import random
        return [random.uniform(-500, 1000) for _ in range(min(days, 30))]
    
    async def _get_total_capital(self, book_id: Optional[UUID]) -> float:
        """Get total allocated capital."""
        try:
            supabase = get_supabase()
            
            query = supabase.table("books").select("capital_allocated")
            if book_id:
                query = query.eq("id", str(book_id))
            
            books = query.execute().data or []
            return sum(b.get("capital_allocated", 0) for b in books)
            
        except Exception:
            return 100000  # Default fallback
    
    def _pnl_to_returns(self, pnl_history: List[float]) -> List[float]:
        """Convert PnL to returns (simplified)."""
        if not pnl_history:
            return []
        
        # Assume constant capital for simplicity
        capital = 100000
        return [pnl / capital for pnl in pnl_history]
    
    def _calculate_sharpe(self, returns: List[float]) -> float:
        """Calculate Sharpe ratio."""
        if len(returns) < 2:
            return 0.0
        
        mean_return = sum(returns) / len(returns)
        variance = sum((r - mean_return) ** 2 for r in returns) / (len(returns) - 1)
        std_dev = math.sqrt(variance) if variance > 0 else 0
        
        if std_dev == 0:
            return 0.0
        
        # Annualize (assuming daily returns)
        annual_return = mean_return * 252
        annual_std = std_dev * math.sqrt(252)
        
        return (annual_return - self.risk_free_rate) / annual_std
    
    def _calculate_sortino(self, returns: List[float]) -> float:
        """Calculate Sortino ratio (downside deviation only)."""
        if len(returns) < 2:
            return 0.0
        
        mean_return = sum(returns) / len(returns)
        negative_returns = [r for r in returns if r < 0]
        
        if not negative_returns:
            return float('inf') if mean_return > 0 else 0.0
        
        downside_variance = sum(r ** 2 for r in negative_returns) / len(negative_returns)
        downside_dev = math.sqrt(downside_variance)
        
        if downside_dev == 0:
            return 0.0
        
        annual_return = mean_return * 252
        annual_downside = downside_dev * math.sqrt(252)
        
        return (annual_return - self.risk_free_rate) / annual_downside
    
    def _calculate_max_drawdown(self, pnl_history: List[float]) -> float:
        """Calculate maximum drawdown."""
        if not pnl_history:
            return 0.0
        
        cumulative = []
        running_total = 0
        for pnl in pnl_history:
            running_total += pnl
            cumulative.append(running_total)
        
        peak = cumulative[0]
        max_dd = 0
        
        for value in cumulative:
            if value > peak:
                peak = value
            drawdown = (peak - value) / peak if peak > 0 else 0
            max_dd = max(max_dd, drawdown)
        
        return max_dd * 100  # Return as percentage


# Global instance
portfolio_analytics = PortfolioAnalytics()
