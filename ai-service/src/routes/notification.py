"""
CoalGuard.AI — AI Notification Routes
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, desc
from typing import List, Optional
from datetime import datetime
from uuid import uuid4

from ..database import get_session
from ..database import (
    AINotificationRecord, NotificationType, RiskBand, NotificationStatus
)

router = APIRouter()


@router.post("/records", response_model=dict)
async def create_notification(
    notif_data: dict,
    session: AsyncSession = Depends(get_session),
):
    notif = AINotificationRecord(
        id=str(uuid4()),
        investigation_id=notif_data.get("investigation_id"),
        anomaly_id=notif_data.get("anomaly_id"),
        prediction_id=notif_data.get("prediction_id"),
        mine_id=notif_data["mine_id"],
        notification_type=NotificationType(notif_data["notification_type"]),
        risk_classification=RiskBand(notif_data["risk_classification"]),
        title=notif_data["title"],
        explanation=notif_data["explanation"],
        evidence_references=notif_data.get("evidence_references", []),
        recommended_next_step=notif_data.get("recommended_next_step"),
        action_deadline=datetime.fromisoformat(notif_data["action_deadline"]) if notif_data.get("action_deadline") else None,
        recipient_ids=notif_data.get("recipient_ids", []),
    )
    session.add(notif)
    await session.commit()
    return {"id": notif.id, "title": notif.title, "status": notif.delivery_status.value}


@router.get("/records", response_model=List[dict])
async def list_notifications(
    mine_id: Optional[str] = None,
    status: Optional[str] = None,
    notification_type: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    session: AsyncSession = Depends(get_session),
):
    stmt = select(AINotificationRecord)
    if mine_id:
        stmt = stmt.where(AINotificationRecord.mine_id == mine_id)
    if status:
        stmt = stmt.where(AINotificationRecord.delivery_status == status)
    if notification_type:
        stmt = stmt.where(AINotificationRecord.notification_type == notification_type)
    stmt = stmt.order_by(desc(AINotificationRecord.created_at)).limit(limit).offset(offset)
    result = await session.execute(stmt)
    notifs = result.scalars().all()
    return [
        {
            "id": n.id,
            "investigation_id": n.investigation_id,
            "anomaly_id": n.anomaly_id,
            "prediction_id": n.prediction_id,
            "mine_id": n.mine_id,
            "notification_type": n.notification_type.value,
            "risk_classification": n.risk_classification.value,
            "title": n.title,
            "delivery_status": n.delivery_status.value,
            "acknowledged": n.acknowledged,
            "created_at": n.created_at.isoformat() if n.created_at else None,
        }
        for n in notifs
    ]


@router.get("/records/{notif_id}", response_model=dict)
async def get_notification(
    notif_id: str,
    session: AsyncSession = Depends(get_session),
):
    notif = await session.get(AINotificationRecord, notif_id)
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {
        "id": notif.id,
        "investigation_id": notif.investigation_id,
        "anomaly_id": notif.anomaly_id,
        "prediction_id": notif.prediction_id,
        "mine_id": notif.mine_id,
        "notification_type": notif.notification_type.value,
        "risk_classification": notif.risk_classification.value,
        "title": notif.title,
        "explanation": notif.explanation,
        "evidence_references": notif.evidence_references,
        "recommended_next_step": notif.recommended_next_step,
        "action_deadline": notif.action_deadline.isoformat() if notif.action_deadline else None,
        "recipient_ids": notif.recipient_ids,
        "delivery_status": notif.delivery_status.value,
        "acknowledged": notif.acknowledged,
        "acknowledged_by": notif.acknowledged_by,
        "acknowledged_at": notif.acknowledged_at.isoformat() if notif.acknowledged_at else None,
        "created_at": notif.created_at.isoformat() if notif.created_at else None,
    }


@router.patch("/records/{notif_id}/acknowledge", response_model=dict)
async def acknowledge_notification(
    notif_id: str,
    ack_data: dict,
    session: AsyncSession = Depends(get_session),
):
    notif = await session.get(AINotificationRecord, notif_id)
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    notif.acknowledged = True
    notif.acknowledged_by = ack_data.get("acknowledged_by", "system")
    notif.acknowledged_at = datetime.utcnow()
    await session.commit()
    return {"id": notif.id, "acknowledged": notif.acknowledged, "acknowledged_at": notif.acknowledged_at.isoformat()}


@router.patch("/records/{notif_id}/status", response_model=dict)
async def update_notification_status(
    notif_id: str,
    status_data: dict,
    session: AsyncSession = Depends(get_session),
):
    from ..database import NotificationStatus
    notif = await session.get(AINotificationRecord, notif_id)
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    new_status = status_data.get("status")
    if new_status:
        notif.delivery_status = NotificationStatus(new_status)
        await session.commit()
    
    return {"id": notif.id, "delivery_status": notif.delivery_status.value}