"""
CoalGuard.AI — ML Anomaly Detection Routes
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional, Dict, Any
from datetime import datetime

from ..database import get_session
from ..anomaly_detection import anomaly_service, MLAnomalyDetector, StatisticalAnomalyDetector, TimeSeriesAnomalyDetector

router = APIRouter()


@router.post("/detect", response_model=List[Dict[str, Any]])
async def detect_anomalies(
    request: Dict[str, Any],
):
    """Detect anomalies in records using ML or statistical methods."""
    records = request.get("records", [])
    feature_columns = request.get("feature_columns", [])
    method = request.get("method", "hybrid")

    if not records:
        raise HTTPException(status_code=400, detail="No records provided")
    if not feature_columns:
        raise HTTPException(status_code=400, detail="No feature columns specified")

    results = await anomaly_service.detect_anomalies(
        records=records,
        feature_columns=feature_columns,
        method=method,
    )

    return results


@router.post("/detect/single", response_model=Dict[str, Any])
async def detect_single_anomaly(
    request: Dict[str, Any],
):
    """Detect anomaly in a single record."""
    record = request.get("record", {})
    feature_columns = request.get("feature_columns", [])
    method = request.get("method", "hybrid")

    if not record:
        raise HTTPException(status_code=400, detail="No record provided")
    if not feature_columns:
        raise HTTPException(status_code=400, detail="No feature columns specified")

    results = await anomaly_service.detect_anomalies(
        records=[record],
        feature_columns=feature_columns,
        method=method,
    )

    return results[0] if results else {"is_anomaly": False}


@router.post("/train", response_model=Dict[str, Any])
async def train_anomaly_model(
    request: Dict[str, Any],
):
    """Train the ML anomaly detection model."""
    records = request.get("records", [])
    feature_columns = request.get("feature_columns", [])

    if not records:
        raise HTTPException(status_code=400, detail="No training records provided")
    if not feature_columns:
        raise HTTPException(status_code=400, detail="No feature columns specified")

    result = await anomaly_service.train_ml_model(
        records=records,
        feature_columns=feature_columns,
    )

    return result


@router.get("/models", response_model=List[str])
async def list_anomaly_models():
    """List available trained anomaly detection models."""
    return anomaly_service.ml_detector.list_models()


@router.post("/models/{model_version}/load", response_model=Dict[str, Any])
async def load_anomaly_model(
    model_version: str,
):
    """Load a trained anomaly detection model."""
    success = anomaly_service.ml_detector.load_model(model_version)
    return {
        "model_version": model_version,
        "loaded": success,
    }


@router.post("/persist", response_model=Dict[str, str])
async def persist_anomaly(
    request: Dict[str, Any],
):
    """Persist an anomaly finding to the database."""
    anomaly_id = await anomaly_service.persist_anomaly(
        mine_id=request["mine_id"],
        category=request["category"],
        severity=request["severity"],
        detection_method=request.get("detection_method", "statistical"),
        observed_values=request.get("observed_values", {}),
        expected_baseline=request.get("expected_baseline"),
        deviation_magnitude=request.get("deviation_magnitude"),
        confidence=request.get("confidence"),
    )
    return {"anomaly_id": anomaly_id}


@router.get("/health", response_model=Dict[str, Any])
async def anomaly_health():
    """Check anomaly detection service health."""
    return {
        "service": "anomaly_detection",
        "ml_model_trained": anomaly_service.ml_detector.is_trained,
        "ml_model_version": anomaly_service.ml_detector.model_version,
        "statistical_detector_ready": bool(anomaly_service.stat_detector.baseline_stats),
        "available_models": anomaly_service.ml_detector.list_models(),
        "timestamp": datetime.utcnow().isoformat(),
    }
