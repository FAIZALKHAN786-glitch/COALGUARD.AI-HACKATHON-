"""
CoalGuard.AI — Model Training Routes
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from uuid import uuid4

from ..database import get_session
from ..training import training_pipeline, ModelTrainingPipeline

router = APIRouter()


@router.post("/targets", response_model=Dict[str, str])
async def create_prediction_target(
    request: Dict[str, Any],
    session: AsyncSession = Depends(get_session),
):
    """Register a new prediction target."""
    target_id = await training_pipeline.create_prediction_target(
        target_name=request["target_name"],
        description=request.get("description", ""),
        event_category=request["event_category"],
        prediction_horizon_days=request["prediction_horizon_days"],
        eligible_population=request.get("eligible_population", {}),
        label_definition=request["label_definition"],
        required_features=request.get("required_features", []),
    )
    return {"target_id": target_id}


@router.get("/targets", response_model=List[Dict[str, Any]])
async def list_prediction_targets(
    enabled: Optional[bool] = Query(None),
    session: AsyncSession = Depends(get_session),
):
    """List prediction targets."""
    from ..database import PredictionTarget
    from sqlalchemy import select

    stmt = select(PredictionTarget)
    if enabled is not None:
        stmt = stmt.where(PredictionTarget.enabled == enabled)
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


@router.post("/train", response_model=Dict[str, Any])
async def train_model(
    request: Dict[str, Any],
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
):
    """Train a predictive model."""

    async def _train():
        await training_pipeline.train_model(
            target_id=request["target_id"],
            model_type=request.get("model_type", "xgboost"),
            training_data=request.get("training_data"),
            feature_columns=request.get("feature_columns"),
            label_column=request.get("label_column", "label"),
            test_size=request.get("test_size", 0.2),
            random_state=request.get("random_state", 42),
            hyperparameters=request.get("hyperparameters"),
        )

    background_tasks.add_task(_train)

    return {
        "status": "training_started",
        "target_id": request["target_id"],
        "model_type": request.get("model_type", "xgboost"),
    }


@router.get("/models", response_model=List[Dict[str, Any]])
async def list_models(
    status: Optional[str] = Query(None),
    session: AsyncSession = Depends(get_session),
):
    """List registered models."""
    from ..database import ModelRegistryEntry, ModelStatus
    from sqlalchemy import select

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
            "model_type": m.model_type,
            "prediction_target": m.prediction_target,
            "status": m.status,
            "owner": m.owner,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in models
    ]


@router.get("/models/{model_id}/versions", response_model=List[Dict[str, Any]])
async def list_model_versions(
    model_id: str,
    session: AsyncSession = Depends(get_session),
):
    """List versions of a model."""
    from ..database import ModelVersion, DeploymentStatus
    from sqlalchemy import select, desc

    stmt = select(ModelVersion).where(ModelVersion.model_id == model_id).order_by(desc(ModelVersion.version))
    result = await session.execute(stmt)
    versions = result.scalars().all()

    return [
        {
            "id": v.id,
            "version": v.version,
            "artifact_path": v.artifact_path,
            "deployment_status": v.deployment_status,
            "trained_at": v.trained_at.isoformat() if v.trained_at else None,
            "deployed_at": v.deployed_at.isoformat() if v.deployed_at else None,
            "retired_at": v.retired_at.isoformat() if v.retired_at else None,
            "approved_by": v.approved_by,
        }
        for v in versions
    ]


@router.post("/models/{model_id}/versions/{version_id}/promote", response_model=Dict[str, Any])
async def promote_model(
    model_id: str,
    version_id: str,
    request: Dict[str, Any],
    session: AsyncSession = Depends(get_session),
):
    """Promote a model version to production."""
    approved_by = request.get("approved_by", "system")

    result = await training_pipeline.promote_model(
        model_id=model_id,
        version_id=version_id,
        approved_by=approved_by,
    )
    return result


@router.post("/models/{model_id}/rollback", response_model=Dict[str, Any])
async def rollback_model(
    model_id: str,
    request: Dict[str, Any],
):
    """Rollback production model."""
    reason = request.get("reason", "Manual rollback")

    result = await training_pipeline.rollback_model(
        model_id=model_id,
        reason=reason,
    )
    return result


@router.post("/evaluate", response_model=Dict[str, Any])
async def evaluate_model(
    request: Dict[str, Any],
    session: AsyncSession = Depends(get_session),
):
    """Evaluate a model version on a time window."""
    model_id = request["model_id"]
    version_id = request["version_id"]
    window_start = datetime.fromisoformat(request["window_start"])
    window_end = datetime.fromisoformat(request["window_end"])

    result = await training_pipeline.evaluate_model(
        model_id=model_id,
        version_id=version_id,
        evaluation_window_start=window_start,
        evaluation_window_end=window_end,
    )
    return result


@router.get("/evaluation/{model_id}", response_model=List[Dict[str, Any]])
async def list_evaluations(
    model_id: str,
    session: AsyncSession = Depends(get_session),
):
    """List evaluation metrics for a model."""
    from ..database import ModelEvaluationMetrics
    from sqlalchemy import select, desc

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
            "false_positive_rate": m.false_positive_rate,
            "false_negative_rate": m.false_negative_rate,
            "calibration_error": m.calibration_error,
        }
        for m in metrics
    ]


@router.get("/training/runs", response_model=List[Dict[str, Any]])
async def list_training_runs(
    model_id: Optional[str] = Query(None),
    session: AsyncSession = Depends(get_session),
):
    """List model training runs."""
    from ..database import ModelTrainingRun
    from sqlalchemy import select, desc

    stmt = select(ModelTrainingRun)
    if model_id:
        stmt = stmt.where(ModelTrainingRun.model_id == model_id)
    stmt = stmt.order_by(desc(ModelTrainingRun.started_at))
    result = await session.execute(stmt)
    runs = result.scalars().all()

    return [
        {
            "id": r.id,
            "model_id": r.model_id,
            "version_id": r.version_id,
            "status": r.status,
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "completed_at": r.completed_at.isoformat() if r.completed_at else None,
            "training_rows": r.training_rows,
            "validation_rows": r.validation_rows,
            "metrics": r.metrics,
            "error_message": r.error_message,
        }
        for r in runs
    ]
