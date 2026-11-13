"""
CoalGuard.AI — Model Training Pipeline

Reproducible ML model training, evaluation, and model registry management.
"""

from __future__ import annotations

from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timedelta
import os
import json
import hashlib
import uuid

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    precision_score, recall_score, f1_score, roc_auc_score,
    average_precision_score, brier_score_loss, confusion_matrix,
    classification_report
)
from sklearn.calibration import CalibratedClassifierCV
from sklearn.preprocessing import StandardScaler, LabelEncoder
import joblib
import xgboost as xgb

from .config import get_settings
from .database import get_session, async_session
from .database import (
    ModelRegistryEntry,
    ModelVersion,
    ModelTrainingRun,
    ModelEvaluationMetrics,
    PredictionTarget,
    PredictionRecord,
    PredictionOutcome,
    ModelType,
    ModelStatus,
    DeploymentStatus,
)

settings = get_settings()


class ModelTrainingPipeline:
    """End-to-end model training pipeline with evaluation and registry."""

    def __init__(self, model_registry_path: str = "./models"):
        self.model_registry_path = model_registry_path
        os.makedirs(model_registry_path, exist_ok=True)

    async def create_prediction_target(
        self,
        target_name: str,
        description: str,
        event_category: str,
        prediction_horizon_days: int,
        eligible_population: Dict[str, Any],
        label_definition: str,
        required_features: List[str],
    ) -> str:
        """Register a new prediction target."""
        import uuid
        target_id = f"target-{uuid.uuid4().hex[:12]}"

        async with async_session() as session:
            target = PredictionTarget(
                id=target_id,
                target_name=target_name,
                description=description,
                event_category=event_category,
                prediction_horizon_days=prediction_horizon_days,
                eligible_population=eligible_population,
                label_definition=label_definition,
                required_features=required_features,
                enabled=True,
            )
            session.add(target)
            await session.commit()

        return target_id

    async def train_model(
        self,
        target_id: str,
        model_type: str = "xgboost",
        training_data: Optional[List[Dict[str, Any]]] = None,
        feature_columns: Optional[List[str]] = None,
        label_column: str = "label",
        test_size: float = 0.2,
        random_state: int = 42,
        hyperparameters: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Train a predictive model for a given target."""

        # Register model in registry
        import uuid
        model_id = f"model-{uuid.uuid4().hex[:12]}"
        version = f"v{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"

        async with async_session() as session:
            # Create registry entry
            registry_entry = ModelRegistryEntry(
                id=model_id,
                model_name=f"{target_id}_{model_type}",
                model_type=model_type,
                prediction_target=target_id,
                description=f"Model for {target_id} trained on {datetime.utcnow().isoformat()}",
                owner="system",
                status=ModelStatus.development,
            )
            session.add(registry_entry)

            # Create training run record
            training_run = ModelTrainingRun(
                id=f"run-{uuid.uuid4().hex[:12]}",
                model_id=model_id,
                status="running",
                started_at=datetime.utcnow(),
            )
            session.add(training_run)
            await session.commit()

        try:
            # Prepare training data
            if training_data is None:
                # Fetch from prediction outcomes (historical labels)
                training_data = await self._fetch_training_data(target_id, session)

            if len(training_data) < 10:
                raise ValueError(f"Insufficient training data: {len(training_data)} samples (minimum 10)")

            df = pd.DataFrame(training_data)

            if feature_columns is None:
                # Auto-select numeric columns excluding label and IDs
                exclude_cols = {label_column, "id", "mine_id", "target_id", "created_at", "updated_at"}
                feature_columns = [c for c in df.select_dtypes(include=[np.number]).columns
                                   if c not in exclude_cols]

            if label_column not in df.columns:
                raise ValueError(f"Label column '{label_column}' not found in training data")

            # Prepare features and labels
            X = df[feature_columns].fillna(0)
            y = df[label_column].fillna(0)

            # Encode labels if needed
            if y.dtype == object:
                le = LabelEncoder()
                y = le.fit_transform(y)

            # Split data
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=test_size, random_state=random_state, stratify=y if len(np.unique(y)) > 1 else None
            )

            # Scale features
            scaler = StandardScaler()
            X_train_scaled = scaler.fit_transform(X_train)
            X_test_scaled = scaler.transform(X_test)

            # Train model
            model = self._create_model(model_type, hyperparameters or {})
            model.fit(X_train_scaled, y_train)

            # Evaluate
            y_pred = model.predict(X_test_scaled)
            y_pred_proba = model.predict_proba(X_test_scaled)[:, 1] if hasattr(model, "predict_proba") else y_pred

            metrics = self._compute_metrics(y_test, y_pred, y_pred_proba)

            # Calibrate if possible
            try:
                calibrated = CalibratedClassifierCV(model, method="sigmoid", cv=3)
                calibrated.fit(X_train_scaled, y_train)
                y_pred_cal_proba = calibrated.predict_proba(X_test_scaled)[:, 1]
                metrics["brier_score"] = float(brier_score_loss(y_test, y_pred_cal_proba))
                metrics["calibrated"] = True
            except Exception:
                metrics["calibrated"] = False

            # Save model artifact
            artifact_path = os.path.join(
                self.model_registry_path,
                f"{model_id}_{version}.pkl"
            )
            model_artifact = {
                "model": model,
                "scaler": scaler,
                "feature_columns": feature_columns,
                "model_type": model_type,
                "model_version": version,
                "metrics": metrics,
            }
            joblib.dump(model_artifact, artifact_path)

            # Compute model hash for integrity
            model_hash = self._compute_model_hash(artifact_path)

            # Create model version record
            model_version = ModelVersion(
                id=f"version-{uuid.uuid4().hex[:12]}",
                model_id=model_id,
                version=version,
                artifact_path=artifact_path,
                input_schema={"features": feature_columns, "label": label_column},
                feature_schema_version="v1",
                hyperparameters=hyperparameters or {},
                random_seed=str(random_state),
                trained_at=datetime.utcnow(),
                training_duration_ms=0,  # Would track actual duration
                deployment_status=DeploymentStatus.staging,
                created_at=datetime.utcnow(),
            )
            session.add(model_version)

            # Create evaluation metrics record
            eval_metrics = ModelEvaluationMetrics(
                id=f"eval-{uuid.uuid4().hex[:12]}",
                model_id=model_id,
                version_id=model_version.id,
                evaluated_at=datetime.utcnow(),
                evaluation_window_start=(datetime.utcnow() - timedelta(days=30)),
                evaluation_window_end=datetime.utcnow(),
                precision=metrics.get("precision"),
                recall=metrics.get("recall"),
                f1_score=metrics.get("f1_score"),
                pr_auc=metrics.get("pr_auc"),
                roc_auc=metrics.get("roc_auc"),
                brier_score=metrics.get("brier_score"),
                false_positive_rate=metrics.get("false_positive_rate"),
                false_negative_rate=metrics.get("false_negative_rate"),
                calibration_error=metrics.get("calibration_error"),
                mine_group=[],
                notes=f"Auto-trained {model_type} model for target {target_id}",
            )
            session.add(eval_metrics)

            # Update training run
            training_run.status = "completed"
            training_run.completed_at = datetime.utcnow()
            training_run.training_rows = len(X_train)
            training_run.validation_rows = len(X_test)
            training_run.metrics = metrics

            # Update registry status based on performance
            if metrics.get("f1_score", 0) > 0.7:
                registry_entry.status = ModelStatus.staging
            else:
                registry_entry.status = ModelStatus.development

            await session.commit()

        except Exception as e:
            # Update training run as failed
            async with async_session() as session:
                training_run = await session.get(ModelTrainingRun, training_run.id)
                if training_run:
                    training_run.status = "failed"
                    training_run.error_message = str(e)
                    training_run.completed_at = datetime.utcnow()
                    await session.commit()
            raise

        return {
            "model_id": model_id,
            "model_version": version,
            "artifact_path": artifact_path,
            "model_hash": model_hash,
            "metrics": metrics,
            "training_metadata": {
                "n_samples": len(df),
                "n_features": len(feature_columns),
                "feature_columns": feature_columns,
                "train_test_split": {"train": len(X_train), "test": len(X_test)},
                "model_type": model_type,
                "hyperparameters": hyperparameters or {},
            },
        }

    def _create_model(self, model_type: str, hyperparameters: Dict[str, Any]):
        """Create ML model instance based on type."""
        default_params = {
            "xgboost": {
                "n_estimators": 100,
                "max_depth": 6,
                "learning_rate": 0.1,
                "subsample": 0.8,
                "colsample_bytree": 0.8,
                "random_state": 42,
                "eval_metric": "logloss",
            },
            "random_forest": {
                "n_estimators": 100,
                "max_depth": 10,
                "min_samples_split": 5,
                "random_state": 42,
            },
            "logistic_regression": {
                "max_iter": 1000,
                "random_state": 42,
            },
            "gradient_boosting": {
                "n_estimators": 100,
                "max_depth": 5,
                "learning_rate": 0.1,
                "random_state": 42,
            },
        }

        params = {**default_params.get(model_type, {}), **hyperparameters}

        if model_type == "xgboost":
            return xgb.XGBClassifier(**params)
        elif model_type == "random_forest":
            return RandomForestClassifier(**params)
        elif model_type == "logistic_regression":
            return LogisticRegression(**params)
        elif model_type == "gradient_boosting":
            return GradientBoostingClassifier(**params)
        else:
            raise ValueError(f"Unsupported model type: {model_type}")

    def _compute_metrics(
        self,
        y_true: np.ndarray,
        y_pred: np.ndarray,
        y_pred_proba: np.ndarray,
    ) -> Dict[str, float]:
        """Compute classification metrics."""
        metrics = {}

        try:
            metrics["precision"] = float(precision_score(y_true, y_pred, zero_division=0))
            metrics["recall"] = float(recall_score(y_true, y_pred, zero_division=0))
            metrics["f1_score"] = float(f1_score(y_true, y_pred, zero_division=0))
        except Exception:
            metrics["precision"] = 0.0
            metrics["recall"] = 0.0
            metrics["f1_score"] = 0.0

        try:
            if len(np.unique(y_true)) > 1:
                metrics["roc_auc"] = float(roc_auc_score(y_true, y_pred_proba))
                metrics["pr_auc"] = float(average_precision_score(y_true, y_pred_proba))
        except Exception:
            metrics["roc_auc"] = 0.0
            metrics["pr_auc"] = 0.0

        try:
            tn, fp, fn, tp = confusion_matrix(y_true, y_pred).ravel()
            total = tn + fp + fn + tp
            metrics["false_positive_rate"] = float(fp / (fp + tn)) if (fp + tn) > 0 else 0.0
            metrics["false_negative_rate"] = float(fn / (fn + tp)) if (fn + tp) > 0 else 0.0
            metrics["accuracy"] = float((tp + tn) / total) if total > 0 else 0.0
        except Exception:
            metrics["false_positive_rate"] = 0.0
            metrics["false_negative_rate"] = 0.0
            metrics["accuracy"] = 0.0

        try:
            metrics["brier_score"] = float(brier_score_loss(y_true, y_pred_proba))
        except Exception:
            metrics["brier_score"] = 0.0

        return metrics

    def _compute_model_hash(self, artifact_path: str) -> str:
        """Compute SHA-256 hash of model artifact for integrity verification."""
        sha256 = hashlib.sha256()
        with open(artifact_path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                sha256.update(chunk)
        return sha256.hexdigest()

    async def _fetch_training_data(
        self,
        target_id: str,
        session,
    ) -> List[Dict[str, Any]]:
        """Fetch historical training data from prediction outcomes."""
        result = await session.execute(
            """
            SELECT po.id, po.mine_id, po.occurred, po.occurred_at,
                   po.actual_event_category, po.recorded_at, po.source
            FROM prediction_outcomes po
            WHERE po.target_id = :target_id
            """,
            {"target_id": target_id}
        )
        rows = result.fetchall()

        return [
            {
                "id": row.id,
                "mine_id": row.mine_id,
                "label": 1 if row.occurred else 0,
                "actual_event_category": row.actual_event_category,
                "source": row.source,
                "occurred_at": row.occurred_at.isoformat() if row.occurred_at else None,
            }
            for row in rows
        ]

    async def evaluate_model(
        self,
        model_id: str,
        version_id: str,
        evaluation_window_start: datetime,
        evaluation_window_end: datetime,
    ) -> Dict[str, Any]:
        """Evaluate a model version on a time window."""
        async with async_session() as session:
            # Get predictions in window
            result = await session.execute(
                """
                SELECT pr.id, pr.mine_id, pr.estimated_probability,
                       pr.risk_band, pr.predicted_at, pr.insufficient_evidence
                FROM prediction_records pr
                WHERE pr.model_version = :version_id
                  AND pr.predicted_at >= :start
                  AND pr.predicted_at <= :end
                """,
                {
                    "version_id": version_id,
                    "start": evaluation_window_start,
                    "end": evaluation_window_end,
                }
            )
            predictions = result.fetchall()

            if not predictions:
                return {"error": "No predictions found in evaluation window"}

            # Get outcomes for these predictions
            pred_ids = [p.id for p in predictions]
            outcome_result = await session.execute(
                """
                SELECT po.prediction_id, po.occurred, po.occurred_at
                FROM prediction_outcomes po
                WHERE po.prediction_id = ANY(:pred_ids)
                """,
                {"pred_ids": pred_ids}
            )
            outcomes = {row.prediction_id: row.occurred for row in outcome_result.fetchall()}

            # Compute metrics
            y_true = []
            y_pred = []
            y_proba = []

            for p in predictions:
                if p.id in outcomes:
                    y_true.append(1 if outcomes[p.id] else 0)
                    y_pred.append(1 if p.estimated_probability and p.estimated_probability > 0.5 else 0)
                    y_proba.append(p.estimated_probability or 0.0)

            if not y_true:
                return {"error": "No outcomes found for predictions in window"}

            metrics = self._compute_metrics(np.array(y_true), np.array(y_pred), np.array(y_proba))

            # Save evaluation
            eval_metrics = ModelEvaluationMetrics(
                id=f"eval-{uuid.uuid4().hex[:12]}",
                model_id=model_id,
                version_id=version_id,
                evaluated_at=datetime.utcnow(),
                evaluation_window_start=evaluation_window_start,
                evaluation_window_end=evaluation_window_end,
                precision=metrics.get("precision"),
                recall=metrics.get("recall"),
                f1_score=metrics.get("f1_score"),
                pr_auc=metrics.get("pr_auc"),
                roc_auc=metrics.get("roc_auc"),
                brier_score=metrics.get("brier_score"),
                false_positive_rate=metrics.get("false_positive_rate"),
                false_negative_rate=metrics.get("false_negative_rate"),
                calibration_error=metrics.get("brier_score", 0),
                mine_group=[],
                notes=f"Evaluation on {len(predictions)} predictions",
            )
            session.add(eval_metrics)
            await session.commit()

        return {
            "model_id": model_id,
            "version_id": version_id,
            "evaluation_window": {
                "start": evaluation_window_start.isoformat(),
                "end": evaluation_window_end.isoformat(),
            },
            "n_predictions": len(predictions),
            "n_outcomes": len(y_true),
            "metrics": metrics,
        }

    async def promote_model(
        self,
        model_id: str,
        version_id: str,
        approved_by: str,
    ) -> Dict[str, Any]:
        """Promote a model version to production."""
        async with async_session() as session:
            # Get the version
            version = await session.get(ModelVersion, version_id)
            if not version or version.model_id != model_id:
                raise ValueError(f"Model version {version_id} not found for model {model_id}")

            # Demote any existing production versions for this model
            await session.execute(
                """
                UPDATE model_versions
                SET deployment_status = 'retired', retired_at = now()
                WHERE model_id = :model_id
                  AND deployment_status = 'production'
                """,
                {"model_id": model_id}
            )

            # Promote this version
            version.deployment_status = DeploymentStatus.production
            version.deployed_at = datetime.utcnow()
            version.approved_by = approved_by
            version.approved_at = datetime.utcnow()

            # Update registry entry
            registry = await session.get(ModelRegistryEntry, model_id)
            if registry:
                registry.status = ModelStatus.production

            await session.commit()

        return {
            "model_id": model_id,
            "version_id": version_id,
            "status": "promoted_to_production",
            "approved_by": approved_by,
            "deployed_at": datetime.utcnow().isoformat(),
        }

    async def rollback_model(
        self,
        model_id: str,
        reason: str,
    ) -> Dict[str, Any]:
        """Rollback production model to staging."""
        async with async_session() as session:
            await session.execute(
                """
                UPDATE model_versions
                SET deployment_status = 'retired', retired_at = now()
                WHERE model_id = :model_id
                  AND deployment_status = 'production'
                """,
                {"model_id": model_id}
            )
            await session.commit()

        return {
            "model_id": model_id,
            "status": "rolled_back",
            "reason": reason,
            "rolled_back_at": datetime.utcnow().isoformat(),
        }


# Singleton
training_pipeline = ModelTrainingPipeline()
