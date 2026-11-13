"""
CoalGuard.AI — Agent Investigation Routes
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional, Dict, Any
from datetime import datetime
from uuid import uuid4

from ..database import get_session
from ..agent import investigation_agent, InvestigationAgent

router = APIRouter()


@router.post("/investigations", response_model=Dict[str, Any])
async def start_investigation(
    request: Dict[str, Any],
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
):
    """Start an autonomous investigation workflow."""
    investigation_id = request.get("investigation_id") or f"inv-{uuid4().hex[:12]}"

    result = await investigation_agent.run_investigation(
        investigation_id=investigation_id,
        mine_id=request["mine_id"],
        trigger_event_type=request["trigger_event_type"],
        trigger_event_id=request.get("trigger_event_id"),
        anomaly_id=request.get("anomaly_id"),
        prediction_id=request.get("prediction_id"),
        correlation_id=request.get("correlation_id"),
    )

    return result


@router.get("/investigations/{investigation_id}/status", response_model=Dict[str, Any])
async def get_investigation_status(
    investigation_id: str,
    session: AsyncSession = Depends(get_session),
):
    """Get the current status of an investigation."""
    from ..database import InvestigationRecord
    from sqlalchemy import select

    result = await session.execute(
        select(InvestigationRecord).where(InvestigationRecord.id == investigation_id)
    )
    inv = result.scalar_one_or_none()

    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")

    return {
        "investigation_id": inv.id,
        "mine_id": inv.mine_id,
        "current_stage": inv.current_stage,
        "started_at": inv.started_at.isoformat() if inv.started_at else None,
        "completed_at": inv.completed_at.isoformat() if inv.completed_at else None,
        "risk_assessment": inv.risk_assessment,
        "human_review_required": inv.human_review_required,
        "human_review_completed": inv.human_review_completed,
        "retry_count": inv.retry_count,
        "final_outcome": inv.final_outcome,
    }


@router.post("/investigations/{investigation_id}/approve", response_model=Dict[str, Any])
async def approve_human_review(
    investigation_id: str,
    request: Dict[str, Any],
):
    """Approve a human review and resume the workflow."""
    approved_by = request.get("approved_by", "system")

    result = await investigation_agent.approve_review(
        investigation_id=investigation_id,
        approved_by=approved_by,
    )

    return result


@router.post("/investigations/{investigation_id}/resume", response_model=Dict[str, Any])
async def resume_investigation(
    investigation_id: str,
    background_tasks: BackgroundTasks,
):
    """Resume a paused investigation (e.g., after human review)."""

    async def _resume():
        from ..database import InvestigationRecord
        async with get_session() as session:
            result = await session.execute(
                select(InvestigationRecord).where(InvestigationRecord.id == investigation_id)
            )
            inv = result.scalar_one_or_none()
            if inv:
                # Re-run the agent
                await investigation_agent.run_investigation(
                    investigation_id=inv.id,
                    mine_id=inv.mine_id,
                    trigger_event_type=inv.trigger_event_type,
                    trigger_event_id=inv.trigger_event_id,
                    anomaly_id=inv.anomaly_id,
                    prediction_id=inv.prediction_id,
                    correlation_id=inv.correlation_id,
                )

    background_tasks.add_task(_resume)

    return {"investigation_id": investigation_id, "status": "resuming"}


@router.get("/investigations", response_model=List[Dict[str, Any]])
async def list_investigations(
    mine_id: Optional[str] = Query(None),
    stage: Optional[str] = Query(None),
    limit: int = Query(50),
    offset: int = Query(0),
    session: AsyncSession = Depends(get_session),
):
    """List investigations with optional filtering."""
    from ..database import InvestigationRecord
    from sqlalchemy import select, desc

    stmt = select(InvestigationRecord)
    if mine_id:
        stmt = stmt.where(InvestigationRecord.mine_id == mine_id)
    if stage:
        stmt = stmt.where(InvestigationRecord.current_stage == stage)
    stmt = stmt.order_by(desc(InvestigationRecord.started_at)).limit(limit).offset(offset)

    result = await session.execute(stmt)
    invs = result.scalars().all()

    return [
        {
            "investigation_id": inv.id,
            "mine_id": inv.mine_id,
            "current_stage": inv.current_stage,
            "trigger_event_type": inv.trigger_event_type,
            "correlation_id": inv.correlation_id,
            "started_at": inv.started_at.isoformat() if inv.started_at else None,
            "human_review_required": inv.human_review_required,
            "final_outcome": inv.final_outcome,
        }
        for inv in invs
    ]


@router.get("/agent/health", response_model=Dict[str, Any])
async def agent_health():
    """Check agent health status."""
    return {
        "agent": "investigation_agent",
        "status": "healthy",
        "workflow_nodes": [
            "validate", "context_gathering", "historical_analysis",
            "predictive_assessment", "external_research", "factor_comparison",
            "risk_evaluation", "human_review", "action_planning",
            "notification", "monitoring", "finalize"
        ],
        "timestamp": datetime.utcnow().isoformat(),
    }
