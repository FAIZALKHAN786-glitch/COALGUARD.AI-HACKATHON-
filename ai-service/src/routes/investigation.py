"""
CoalGuard.AI — Investigation Workflow Routes
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, desc
from typing import List, Optional
from datetime import datetime
from uuid import uuid4

from ..database import get_session
from ..database import (
    InvestigationRecord, InvestigationDecision, InvestigationEvidenceLink,
    RiskAssessmentRecord, InvestigationStage, InvestigationStatus
)

router = APIRouter()


VALID_TRANSITIONS = {
    "received": ["validating", "failed", "cancelled"],
    "validating": ["context_gathering", "failed", "cancelled"],
    "context_gathering": ["historical_analysis", "failed", "cancelled"],
    "historical_analysis": ["predictive_assessment", "external_research", "factor_correlation", "failed", "cancelled"],
    "predictive_assessment": ["external_research", "factor_correlation", "risk_evaluation", "failed", "cancelled"],
    "external_research": ["factor_correlation", "risk_evaluation", "failed", "cancelled"],
    "factor_correlation": ["risk_evaluation", "failed", "cancelled"],
    "risk_evaluation": ["human_review_required", "action_pending", "notification_pending", "monitoring", "failed", "cancelled"],
    "human_review_required": ["action_pending", "notification_pending", "monitoring", "failed", "cancelled"],
    "action_pending": ["notification_pending", "monitoring", "failed", "cancelled"],
    "notification_pending": ["monitoring", "failed", "cancelled"],
    "monitoring": ["completed", "failed", "cancelled"],
    "completed": [],
    "failed": ["received", "cancelled"],
    "cancelled": [],
}


@router.post("/records", response_model=dict)
async def create_investigation(
    inv_data: dict,
    session: AsyncSession = Depends(get_session),
):
    from ..database import InvestigationRecord
    inv = InvestigationRecord(
        id=str(uuid4()),
        mine_id=inv_data["mine_id"],
        anomaly_id=inv_data.get("anomaly_id"),
        prediction_id=inv_data.get("prediction_id"),
        trigger_event_type=inv_data["trigger_event_type"],
        trigger_event_id=inv_data.get("trigger_event_id"),
        correlation_id=inv_data["correlation_id"],
        risk_assessment=inv_data.get("risk_assessment", {}),
        model_version=inv_data.get("model_version"),
        policy_version=inv_data.get("policy_version"),
        data_quality_status=inv_data.get("data_quality_status"),
    )
    session.add(inv)
    await session.commit()
    return {"id": inv.id, "correlation_id": inv.correlation_id, "stage": inv.current_stage.value}


@router.get("/records", response_model=List[dict])
async def list_investigations(
    mine_id: Optional[str] = None,
    stage: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    session: AsyncSession = Depends(get_session),
):
    from ..database import InvestigationRecord, InvestigationStage
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
            "id": i.id,
            "mine_id": i.mine_id,
            "anomaly_id": i.anomaly_id,
            "prediction_id": i.prediction_id,
            "trigger_event_type": i.trigger_event_type,
            "correlation_id": i.correlation_id,
            "current_stage": i.current_stage.value,
            "started_at": i.started_at.isoformat() if i.started_at else None,
            "completed_at": i.completed_at.isoformat() if i.completed_at else None,
            "human_review_required": i.human_review_required,
            "human_review_completed": i.human_review_completed,
        }
        for i in invs
    ]


@router.get("/records/{inv_id}", response_model=dict)
async def get_investigation(
    inv_id: str,
    session: AsyncSession = Depends(get_session),
):
    from ..database import InvestigationRecord
    inv = await session.get(InvestigationRecord, inv_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    return {
        "id": inv.id,
        "mine_id": inv.mine_id,
        "anomaly_id": inv.anomaly_id,
        "prediction_id": inv.prediction_id,
        "trigger_event_type": inv.trigger_event_type,
        "trigger_event_id": inv.trigger_event_id,
        "correlation_id": inv.correlation_id,
        "current_stage": inv.current_stage.value,
        "started_at": inv.started_at.isoformat() if inv.started_at else None,
        "completed_at": inv.completed_at.isoformat() if inv.completed_at else None,
        "risk_assessment": inv.risk_assessment,
        "model_version": inv.model_version,
        "policy_version": inv.policy_version,
        "data_quality_status": inv.data_quality_status,
        "outstanding_questions": inv.outstanding_questions,
        "recommended_actions": inv.recommended_actions,
        "executed_action_references": inv.executed_action_references,
        "human_review_required": inv.human_review_required,
        "human_review_completed": inv.human_review_completed,
        "human_reviewed_by": inv.human_reviewed_by,
        "human_reviewed_at": inv.human_reviewed_at.isoformat() if inv.human_reviewed_at else None,
        "retry_count": inv.retry_count,
        "final_outcome": inv.final_outcome,
        "created_at": inv.created_at.isoformat() if inv.created_at else None,
        "updated_at": inv.updated_at.isoformat() if inv.updated_at else None,
    }


@router.post("/records/{inv_id}/transition", response_model=dict)
async def transition_stage(
    inv_id: str,
    transition: dict,
    session: AsyncSession = Depends(get_session),
):
    from ..database import InvestigationRecord, InvestigationStage, InvestigationDecision
    inv = await session.get(InvestigationRecord, inv_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    
    next_stage = transition.get("next_stage")
    if not next_stage:
        raise HTTPException(status_code=400, detail="next_stage required")
    
    try:
        next_stage_enum = InvestigationStage(next_stage)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid stage: {next_stage}")
    
    allowed = VALID_TRANSITIONS.get(inv.current_stage.value, [])
    if next_stage_enum not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot transition from {inv.current_stage.value} to {next_stage}",
        )
    
    old_stage = inv.current_stage
    inv.current_stage = next_stage_enum
    inv.updated_at = datetime.utcnow()
    
    if next_stage_enum == InvestigationStage.completed:
        inv.completed_at = datetime.utcnow()
    
    # Record decision if provided
    if transition.get("decision"):
        from ..database import InvestigationDecision
        decision = InvestigationDecision(
            id=str(uuid4()),
            investigation_id=inv_id,
            stage=old_stage,
            decision=transition["decision"],
            rationale=transition.get("rationale"),
            policy_applied=transition.get("policy_applied"),
            made_by=transition.get("made_by", "system"),
            requires_human_approval=transition.get("requires_human_approval", False),
            approved_by=transition.get("approved_by"),
            approved_at=datetime.utcnow() if transition.get("approved_by") else None,
        )
        session.add(InvestigationDecision)
    
    await session.commit()
    return {"id": inv.id, "old_stage": old_stage.value, "new_stage": next_stage_enum.value}


@router.post("/records/{inv_id}/evidence", response_model=dict)
async def add_evidence(
    inv_id: str,
    evidence_data: dict,
    session: AsyncSession = Depends(get_session),
):
    from ..database import InvestigationEvidenceLink, InvestigationRecord
    inv = await session.get(InvestigationRecord, inv_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    
    evidence = InvestigationEvidenceLink(
        id=str(uuid4()),
        investigation_id=inv_id,
        evidence_type=evidence_data["evidence_type"],
        evidence_id=evidence_data["evidence_id"],
        evidence_code=evidence_data.get("evidence_code"),
        relevance=evidence_data.get("relevance"),
        source_provenance=evidence_data.get("source_provenance", {}),
    )
    session.add(evidence)
    await session.commit()
    return {"id": evidence.id, "evidence_type": evidence.evidence_type, "evidence_id": evidence.evidence_id}


@router.get("/records/{inv_id}/evidence", response_model=List[dict])
async def list_evidence(
    inv_id: str,
    session: AsyncSession = Depends(get_session),
):
    from ..database import InvestigationEvidenceLink
    stmt = select(InvestigationEvidenceLink).where(InvestigationEvidenceLink.investigation_id == inv_id)
    result = await session.execute(stmt)
    evidence = result.scalars().all()
    return [
        {
            "id": e.id,
            "evidence_type": e.evidence_type,
            "evidence_id": e.evidence_id,
            "evidence_code": e.evidence_code,
            "relevance": e.relevance,
            "source_provenance": e.source_provenance,
            "linked_at": e.linked_at.isoformat() if e.linked_at else None,
        }
        for e in evidence
    ]


@router.post("/records/{inv_id}/risk-assessment", response_model=dict)
async def create_risk_assessment(
    inv_id: str,
    assessment_data: dict,
    session: AsyncSession = Depends(get_session),
):
    from ..database import RiskAssessmentRecord, InvestigationRecord, RiskBand
    inv = await session.get(InvestigationRecord, inv_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    
    assessment = RiskAssessmentRecord(
        id=str(uuid4()),
        investigation_id=inv_id,
        mine_id=assessment_data["mine_id"],
        event_category=assessment_data["event_category"],
        prediction_horizon_days=assessment_data.get("prediction_horizon_days"),
        estimated_probability=assessment_data.get("estimated_probability"),
        probability_calibrated=assessment_data.get("probability_calibrated", False),
        operational_risk_band=RiskBand(assessment_data["operational_risk_band"]),
        deterministic_findings=assessment_data.get("deterministic_findings", []),
        historical_references=assessment_data.get("historical_references", []),
        external_evidence_references=assessment_data.get("external_evidence_references", []),
        matched_factors=assessment_data.get("matched_factors", []),
        partial_matched_factors=assessment_data.get("partial_matched_factors", []),
        unmatched_factors=assessment_data.get("unmatched_factors", []),
        missing_evidence=assessment_data.get("missing_evidence", []),
        contradictory_evidence=assessment_data.get("contradictory_evidence", []),
        model_version=assessment_data.get("model_version"),
        policy_version=assessment_data.get("policy_version"),
        explanation=assessment_data.get("explanation"),
        recommended_next_steps=assessment_data.get("recommended_next_steps", []),
        required_approval=assessment_data.get("required_approval", False),
        notification_status=assessment_data.get("notification_status"),
        investigation_status=assessment_data.get("investigation_status"),
    )
    session.add(assessment)
    await session.commit()
    return {"id": assessment.id, "investigation_id": inv_id, "risk_band": assessment.operational_risk_band.value}


@router.get("/records/{inv_id}/risk-assessment", response_model=dict)
async def get_risk_assessment(
    inv_id: str,
    session: AsyncSession = Depends(get_session),
):
    from ..database import RiskAssessmentRecord
    stmt = select(RiskAssessmentRecord).where(RiskAssessmentRecord.investigation_id == inv_id)
    result = await session.execute(stmt)
    assessment = result.scalar_one_or_none()
    if not assessment:
        raise HTTPException(status_code=404, detail="Risk assessment not found")
    return {
        "id": assessment.id,
        "investigation_id": assessment.investigation_id,
        "mine_id": assessment.mine_id,
        "event_category": assessment.event_category,
        "prediction_horizon_days": assessment.prediction_horizon_days,
        "estimated_probability": assessment.estimated_probability,
        "probability_calibrated": assessment.probability_calibrated,
        "operational_risk_band": assessment.operational_risk_band.value,
        "deterministic_findings": assessment.deterministic_findings,
        "historical_references": assessment.historical_references,
        "external_evidence_references": assessment.external_evidence_references,
        "matched_factors": assessment.matched_factors,
        "partial_matched_factors": assessment.partial_matched_factors,
        "unmatched_factors": assessment.unmatched_factors,
        "missing_evidence": assessment.missing_evidence,
        "contradictory_evidence": assessment.contradictory_evidence,
        "model_version": assessment.model_version,
        "policy_version": assessment.policy_version,
        "explanation": assessment.explanation,
        "recommended_next_steps": assessment.recommended_next_steps,
        "required_approval": assessment.required_approval,
    }


@router.get("/records/{inv_id}/decisions", response_model=List[dict])
async def list_decisions(
    inv_id: str,
    session: AsyncSession = Depends(get_session),
):
    from ..database import InvestigationDecision, InvestigationStage
    stmt = select(InvestigationDecision).where(InvestigationDecision.investigation_id == inv_id).order_by(InvestigationDecision.made_at.desc())
    result = await session.execute(stmt)
    decisions = result.scalars().all()
    return [
        {
            "id": d.id,
            "stage": d.stage.value,
            "decision": d.decision,
            "rationale": d.rationale,
            "policy_applied": d.policy_applied,
            "made_by": d.made_by,
            "made_at": d.made_at.isoformat() if d.made_at else None,
            "requires_human_approval": d.requires_human_approval,
            "approved_by": d.approved_by,
            "approved_at": d.approved_at.isoformat() if d.approved_at else None,
        }
        for d in decisions
    ]