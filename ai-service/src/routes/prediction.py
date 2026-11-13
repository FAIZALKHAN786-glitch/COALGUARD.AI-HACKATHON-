"""
CoalGuard.AI — Prediction Routes
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, desc
from typing import List, Optional
from datetime import datetime
from uuid import uuid4

from ..database import get_session
from ..database import (
    PredictionRecord, PredictionTarget, PredictionOutcome,
    ModelRegistryEntry, ModelVersion, ModelEvaluationMetrics,
    RiskBand, ModelType, ModelStatus, DeploymentStatus
)

router = APIRouter()


@router.get("/targets", response_model=List[dict])
async def list_targets(
    enabled: Optional[bool] = None,
    session: AsyncSession = Depends(get_session),
):
    stmt = select(PredictionTarget)
    if enabled is not None:
        stmt = stmt.where(PredictionTarget.enabled == enabled)
    stmt = stmt.order_by(PredictionTarget.target_name)
    result = await session.execute(stmt)
    targets = result.scalars().all()
    return [
        {
            "id": t.id,
            "target_name": t.target_name,
            "description": t.description,
            "event_category": t.event_category,
            "prediction_horizon_days": t.prediction_horizon_days,
            "enabled": t.enabled,
        }
        for t in targets
    ]


@router.post("/targets", response_model=dict)
async def create_target(
    target_data: dict,
    session: AsyncSession = Depends(get_session),
):
    target = PredictionTarget(
        id=str(uuid4()),
        target_name=target_data["target_name"],
        description=target_data.get("description"),
        event_category=target_data["event_category"],
        prediction_horizon_days=target_data["prediction_horizon_days"],
        eligible_population=target_data["eligible_population"],
        label_definition=target_data["label_definition"],
        required_features=target_data.get("required_features", []),
        enabled=target_data.get("enabled", True),
    )
    session.add(target)
    await session.commit()
    return {"id": target.id, "target_name": target.target_name}


@router.get("/records", response_model=List[dict])
async def list_predictions(
    mine_id: Optional[str] = None,
    target_id: Optional[str] = None,
    risk_band: Optional[str] = None,
    model_version: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    session: AsyncSession = Depends(get_session),
):
    stmt = select(PredictionRecord)
    if mine_id:
        stmt = stmt.where(PredictionRecord.mine_id == mine_id)
    if target_id:
        stmt = stmt.where(PredictionRecord.target_id == target_id)
    if risk_band:
        stmt = stmt.where(PredictionRecord.risk_band == risk_band)
    if model_version:
        stmt = stmt.where(PredictionRecord.model_version == model_version)
    stmt = stmt.order_by(desc(PredictionRecord.predicted_at)).limit(limit).offset(offset)
    result = await session.execute(stmt)
    predictions = result.scalars().all()
    return [
        {
            "id": p.id,
            "target_id": p.target_id,
            "mine_id": p.mine_id,
            "predicted_at": p.predicted_at.isoformat() if p.predicted_at else None,
            "horizon_start": p.horizon_start.isoformat() if p.horizon_start else None,
            "horizon_end": p.horizon_end.isoformat() if p.horizon_end else None,
            "estimated_probability": p.estimated_probability,
            "probability_calibrated": p.probability_calibrated,
            "risk_band": p.risk_band.value,
            "model_version": p.model_version,
            "insufficient_evidence": p.insufficient_evidence,
            "linked_investigation_id": p.linked_investigation_id,
        }
        for p in predictions
    ]


@router.get("/records/{record_id}", response_model=dict)
async def get_prediction(
    record_id: str,
    session: AsyncSession = Depends(get_session),
):
    stmt = select(PredictionRecord).where(PredictionRecord.id == record_id)
    result = await session.execute(stmt)
    prediction = result.scalar_one_or_none()
    if not prediction:
        raise HTTPException(status_code=404, detail="Prediction record not found")
    return {
        "id": prediction.id,
        "target_id": prediction.target_id,
        "mine_id": prediction.mine_id,
        "predicted_at": prediction.predicted_at.isoformat() if prediction.predicted_at else None,
        "horizon_start": prediction.horizon_start.isoformat() if prediction.horizon_start else None,
        "horizon_end": prediction.horizon_end.isoformat() if prediction.horizon_end else None,
        "estimated_probability": prediction.estimated_probability,
        "probability_calibrated": prediction.probability_calibrated,
        "risk_band": prediction.risk_band.value,
        "model_version": prediction.model_version,
        "input_data_freshness": prediction.input_data_freshness.isoformat() if prediction.input_data_freshness else None,
        "data_completeness": prediction.data_completeness,
        "contributing_factors": prediction.contributing_factors,
        "explanation": prediction.explanation,
        "limitations": prediction.limitations,
        "insufficient_evidence": prediction.insufficient_evidence,
        "linked_investigation_id": prediction.linked_investigation_id,
    }


@router.post("/records/{record_id}/outcome", response_model=dict)
async def link_outcome(
    record_id: str,
    outcome_data: dict,
    session: AsyncSession = Depends(get_session),
):
    from ..database import PredictionOutcome, PredictionRecord
    record = await session.get(PredictionRecord, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Prediction record not found")
    
    outcome = PredictionOutcome(
        id=str(uuid4()),
        prediction_id=record_id,
        target_id=outcome_data["target_id"],
        mine_id=outcome_data["mine_id"],
        occurred=outcome_data["occurred"],
        occurred_at=datetime.fromisoformat(outcome_data["occurred_at"]) if outcome_data.get("occurred_at") else None,
        actual_event_category=outcome_data.get("actual_event_category"),
        recorded_by=outcome_data.get("recorded_by"),
        source=outcome_data.get("source", "manual"),
    )
    session.add(Outcome)
    await session.commit()
    return {"id": outcome.id, "prediction_id": record_id, "occurred": outcome.occurred}


@router.get("/models", response_model=List[dict])
async def list_models(
    status: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
):
    from ..database import ModelRegistryEntry, ModelStatus
    stmt = select(ModelRegistryEntry)
    if status:
        stmt = stmt.where(ModelRegistryEntry.status == status)
    stmt = stmt.order_by(ModelRegistryEntry.created_at.desc())
    result = await session.execute(stmt)
    models = result.scalars().all()
    return [
        {
            "id": m.id,
            "model_name": m.model_name,
            "model_type": m.model_type.value,
            "prediction_target": m.prediction_target,
            "status": m.status.value,
        }
        for m in models
    ]


@router.get("/models/{model_id}/versions", response_model=List[dict])
async def list_model_versions(
    model_id: str,
    session: AsyncSession = Depends(get_session),
):
    from ..database import ModelVersion, DeploymentStatus
    stmt = select(ModelVersion).where(ModelVersion.model_id == model_id).order_by(ModelVersion.version.desc())
    result = await session.execute(stmt)
    versions = result.scalars().all()
    return [
        {
            "id": v.id,
            "version": v.version,
            "deployment_status": v.deployment_status.value,
            "trained_at": v.trained_at.isoformat() if v.trained_at else None,
            "deployed_at": v.deployed_at.isoformat() if v.deployed_at else None,
            "retired_at": v.retired_at.isoformat() if v.retired_at else None,
        }
        for v in versions
    ]


@router.get("/evaluation/{model_id}", response_model=List[dict])
async def list_evaluations(
    model_id: str,
    session: AsyncSession = Depends(get_session),
):
    stmt = select(ModelEvaluationMetrics).where(
        ModelEvaluationMetrics.model_id == model_id
    ).order_by(desc(ModelEvaluationMetrics.evaluated_at))
    result = await session.execute(stmt)
    metrics = result.scalars().all()
    return [
        {
            "id": m.id,
            "evaluated_at": m.evaluated_at.isoformat() if m.evaluated_at else None,
            "window_start": m.evaluation_window_start.isoformat() if m.evaluation_window_start else None,
            "window_end": m.evaluation_window_end.isoformat() if m.evaluation_window_end else None,
            "precision": m.precision,
            "recall": m.recall,
            "f1_score": m.f1_score,
            "pr_auc": m.pr_auc,
            "roc_auc": m.roc_auc,
            "brier_score": m.brier_score,
            "calibration_error": m.calibration_error,
        }
        for m in metrics
    ]


@router.post("/evaluation", response_model=dict)
async def record_evaluation(
    eval_data: dict,
    session: AsyncSession = Depends(get_session),
):
    from ..database import ModelEvaluationMetrics
    eval_record = ModelEvaluationMetrics(
        id=str(uuid4()),
        model_id=eval_data["model_id"],
        version_id=eval_data.get("version_id"),
        evaluation_window_start=datetime.fromisoformat(eval_data["window_start"]),
        evaluation_window_end=datetime.fromisoformat(eval_data["window_end"]),
        precision=eval_data.get("precision"),
        recall=eval_data.get("recall"),
        f1_score=eval_data.get("f1_score"),
        pr_auc=eval_data.get("pr_auc"),
        roc_auc=eval_data.get("roc_auc"),
        brier_score=eval_data.get("brier_score"),
        false_positive_rate=eval_data.get("false_positive_rate"),
        false_negative_rate=eval_data.get("false_negative_rate"),
        calibration_error=eval_data.get("calibration_error"),
        mine_group=eval_data.get("mine_group", []),
        notes=eval_data.get("notes"),
    )
    session.add(eval_record)
    await session.commit()
    return {"id": eval_record.id}