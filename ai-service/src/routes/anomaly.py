"""
CoalGuard.AI — Anomaly Detection Routes
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, desc
from typing import List, Optional
from datetime import datetime
from uuid import uuid4

from ..database import get_session
from .database import AnomalyFinding, AnomalyRuleDefinition, AnomalyEvidence, AnomalyCategory, AnomalySeverity, DetectionMethod, InvestigationStatus

router = APIRouter()


@router.get("/rules", response_model=List[dict])
async def list_rules(
    category: Optional[str] = None,
    enabled: Optional[bool] = None,
    session: AsyncSession = Depends(get_session),
):
    stmt = select(AnomalyRuleDefinition)
    if category:
        stmt = stmt.where(AnomalyRuleDefinition.category == category)
    if enabled is not None:
        stmt = stmt.where(AnomalyRuleDefinition.enabled == enabled)
    stmt = stmt.order_by(AnomalyRuleDefinition.rule_code)
    result = await session.execute(stmt)
    rules = result.scalars().all()
    return [
        {
            "id": r.id,
            "rule_code": r.rule_code,
            "name": r.name,
            "description": r.description,
            "category": r.category.value,
            "severity": r.severity.value,
            "enabled": r.enabled,
            "version": r.version,
        }
        for r in rules
    ]


@router.post("/rules", response_model=dict)
async def create_rule(
    rule_data: dict,
    session: AsyncSession = Depends(get_session),
):
    rule = AnomalyRuleDefinition(
        id=str(uuid4()),
        rule_code=rule_data["rule_code"],
        name=rule_data["name"],
        description=rule_data.get("description"),
        category=AnomalyCategory(rule_data["category"]),
        severity=AnomalySeverity(rule_data["severity"]),
        rule_expression=rule_data["rule_expression"],
        enabled=rule_data.get("enabled", True),
        applies_to_mine_ids=rule_data.get("applies_to_mine_ids", []),
    )
    session.add(rule)
    await session.commit()
    return {"id": rule.id, "rule_code": rule.rule_code, "name": rule.name}


@router.get("/findings", response_model=List[dict])
async def list_findings(
    mine_id: Optional[str] = None,
    category: Optional[str] = None,
    severity: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    session: AsyncSession = Depends(get_session),
):
    stmt = select(AnomalyFinding)
    if mine_id:
        stmt = stmt.where(AnomalyFinding.mine_id == mine_id)
    if category:
        stmt = stmt.where(AnomalyFinding.category == category)
    if severity:
        stmt = stmt.where(AnomalyFinding.severity == severity)
    if status:
        stmt = stmt.where(AnomalyFinding.investigation_status == status)
    stmt = stmt.order_by(desc(AnomalyFinding.detected_at)).limit(limit).offset(offset)
    result = await session.execute(stmt)
    findings = result.scalars().all()
    return [
        {
            "id": f.id,
            "mine_id": f.mine_id,
            "category": f.category.value,
            "severity": f.severity.value,
            "detection_method": f.detection_method.value,
            "detected_at": f.detected_at.isoformat() if f.detected_at else None,
            "investigation_status": f.investigation_status.value,
            "deviation_magnitude": f.deviation_magnitude,
            "confidence": f.confidence,
        }
        for f in findings
    ]


@router.get("/findings/{finding_id}", response_model=dict)
async def get_finding(
    finding_id: str,
    session: AsyncSession = Depends(get_session),
):
    stmt = select(AnomalyFinding).where(AnomalyFinding.id == finding_id)
    result = await session.execute(stmt)
    finding = result.scalar_one_or_none()
    if not finding:
        raise HTTPException(status_code=404, detail="Anomaly finding not found")
    return {
        "id": finding.id,
        "mine_id": finding.mine_id,
        "category": finding.category.value,
        "severity": finding.severity.value,
        "detection_method": finding.detection_method.value,
        "rule_id": finding.rule_id,
        "detected_at": finding.detected_at.isoformat() if finding.detected_at else None,
        "observation_period_start": finding.observation_period_start.isoformat() if finding.observation_period_start else None,
        "observation_period_end": finding.observation_period_end.isoformat() if finding.observation_period_end else None,
        "observed_values": finding.observed_values,
        "expected_baseline": finding.expected_baseline,
        "deviation_magnitude": finding.deviation_magnitude,
        "confidence": finding.confidence,
        "supporting_evidence": finding.supporting_evidence,
        "data_quality_warnings": finding.data_quality_warnings,
        "investigation_status": finding.investigation_status.value,
        "linked_investigation_id": finding.linked_investigation_id,
        "resolved_at": finding.resolved_at.isoformat() if finding.resolved_at else None,
    }


@router.patch("/findings/{finding_id}/status", response_model=dict)
async def update_finding_status(
    finding_id: str,
    status_update: dict,
    session: AsyncSession = Depends(get_session),
):
    from .database import AnomalyFinding, InvestigationStatus
    stmt = select(AnomalyFinding).where(AnomalyFinding.id == finding_id)
    result = await session.execute(stmt)
    finding = result.scalar_one_or_none()
    if not finding:
        raise HTTPException(status_code=404, detail="Anomaly finding not found")
    
    new_status = status_update.get("status")
    if new_status:
        finding.investigation_status = InvestigationStatus(new_status)
        if new_status in ["resolved", "dismissed", "false_positive"]:
            finding.resolved_at = datetime.utcnow()
        finding.updated_at = datetime.utcnow()
        await session.commit()
    
    return {"id": finding.id, "status": finding.investigation_status.value}


@router.get("/findings/{finding_id}/evidence", response_model=List[dict])
async def list_finding_evidence(
    finding_id: str,
    session: AsyncSession = Depends(get_session),
):
    from .database import AnomalyEvidence
    stmt = select(AnomalyEvidence).where(AnomalyEvidence.anomaly_id == finding_id)
    result = await session.execute(stmt)
    evidence = result.scalars().all()
    return [
        {
            "id": e.id,
            "entity_type": e.entity_type,
            "entity_id": e.entity_id,
            "entity_code": e.entity_code,
            "relevance_note": e.relevance_note,
            "linked_at": e.linked_at.isoformat() if e.linked_at else None,
        }
        for e in evidence
    ]


@router.post("/findings/{finding_id}/evidence", response_model=dict)
async def add_finding_evidence(
    finding_id: str,
    evidence_data: dict,
    session: AsyncSession = Depends(get_session),
):
    from .database import AnomalyEvidence, AnomalyFinding
    finding = await session.get(AnomalyFinding, finding_id)
    if not finding:
        raise HTTPException(status_code=404, detail="Anomaly finding not found")
    
    evidence = AnomalyEvidence(
        id=str(uuid4()),
        anomaly_id=finding_id,
        entity_type=evidence_data["entity_type"],
        entity_id=evidence_data["entity_id"],
        entity_code=evidence_data.get("entity_code"),
        relevance_note=evidence_data.get("relevance_note"),
    )
    session.add(evidence)
    await session.commit()
    return {"id": evidence.id, "entity_type": evidence.entity_type, "entity_id": evidence.entity_id}