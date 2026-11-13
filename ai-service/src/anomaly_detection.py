"""
CoalGuard.AI — ML-Based Anomaly Detection

Implements Isolation Forest, statistical outlier detection, and time-series
anomaly detection for mining governance data.
"""

from __future__ import annotations

from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timedelta
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import DBSCAN
from sklearn.metrics import precision_score, recall_score, f1_score
import joblib
import os
import json
import hashlib

from .config import get_settings
from .database import get_session, async_session
from .database import AnomalyFinding, AnomalySeverity, DetectionMethod

settings = get_settings()


class MLAnomalyDetector:
    """ML-based anomaly detection using Isolation Forest and DBSCAN."""

    def __init__(self, model_path: str = "./models", contamination: float = 0.1):
        self.model_path = model_path
        self.contamination = contamination
        self.isolation_forest: Optional[IsolationForest] = None
        self.dbscan: Optional[DBSCAN] = None
        self.scaler: Optional[StandardScaler] = None
        self.feature_names: List[str] = []
        self.is_trained = False
        self.model_version: str = "v1.0"
        self.training_metadata: Dict[str, Any] = {}

        os.makedirs(model_path, exist_ok=True)

    def prepare_features(
        self,
        records: List[Dict[str, Any]],
        feature_columns: List[str],
    ) -> Tuple[np.ndarray, List[str]]:
        """Prepare feature matrix from records."""
        df = pd.DataFrame(records)

        # Ensure all feature columns exist
        for col in feature_columns:
            if col not in df.columns:
                df[col] = 0

        X = df[feature_columns].values
        ids = df.get("id", pd.Series([f"record_{i}" for i in range(len(df))])).tolist()

        return X, ids

    async def train(
        self,
        records: List[Dict[str, Any]],
        feature_columns: List[str],
        model_name: str = "isolation_forest_mining",
    ) -> Dict[str, Any]:
        """Train the anomaly detection model."""
        X, ids = self.prepare_features(records, feature_columns)

        # Scale features
        self.scaler = StandardScaler()
        X_scaled = self.scaler.fit_transform(X)

        # Train Isolation Forest
        self.isolation_forest = IsolationForest(
            contamination=self.contamination,
            random_state=42,
            n_estimators=100,
            max_samples='auto',
        )
        self.isolation_forest.fit(X_scaled)

        # Train DBSCAN for clustering-based anomaly detection
        self.dbscan = DBSCAN(eps=0.5, min_samples=5)
        self.dbscan.fit(X_scaled)

        self.feature_names = feature_columns
        self.is_trained = True

        # Compute anomaly scores on training data
        anomaly_scores = self.isolation_forest.decision_function(X_scaled)
        predictions = self.isolation_forest.predict(X_scaled)  # -1 = anomaly, 1 = normal

        anomaly_rate = (predictions == -1).mean()

        self.model_version = f"v{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"

        self.training_metadata = {
            "model_name": model_name,
            "model_version": self.model_version,
            "training_date": datetime.utcnow().isoformat(),
            "n_samples": len(records),
            "n_features": len(feature_columns),
            "feature_columns": feature_columns,
            "contamination": self.contamination,
            "anomaly_rate": float(anomaly_rate),
            "mean_anomaly_score": float(anomaly_scores.mean()),
            "min_anomaly_score": float(anomaly_scores.min()),
            "max_anomaly_score": float(anomaly_scores.max()),
        }

        # Save model
        self._save_model()

        return self.training_metadata

    def detect(
        self,
        records: List[Dict[str, Any]],
        feature_columns: List[str],
        threshold: Optional[float] = None,
    ) -> List[Dict[str, Any]]:
        """Detect anomalies in new records."""
        if not self.is_trained:
            raise ValueError("Model not trained. Call train() first.")

        X, ids = self.prepare_features(records, feature_columns)
        X_scaled = self.scaler.transform(X)

        # Isolation Forest predictions
        predictions = self.isolation_forest.predict(X_scaled)  # -1 = anomaly
        anomaly_scores = self.isolation_forest.decision_function(X_scaled)

        # DBSCAN cluster labels (-1 = noise/outlier)
        dbscan_labels = self.dbscan.fit_predict(X_scaled)

        results = []
        for i, (record_id, pred, score, dbscan_label) in enumerate(zip(
            ids, predictions, anomaly_scores, dbscan_labels
        )):
            is_anomaly = pred == -1 or dbscan_label == -1
            anomaly_score = float(score)

            # Determine severity based on score
            if anomaly_score < -0.5:
                severity = AnomalySeverity.critical.value
            elif anomaly_score < -0.2:
                severity = AnomalySeverity.high.value
            elif anomaly_score < 0:
                severity = AnomalySeverity.medium.value
            else:
                severity = AnomalySeverity.low.value

            results.append({
                "record_id": record_id,
                "is_anomaly": bool(is_anomaly),
                "anomaly_score": anomaly_score,
                "severity": severity,
                "detection_method": DetectionMethod.ml.value,
                "isolation_forest_prediction": int(pred),
                "dbscan_cluster": int(dbscan_label),
                "record_index": i,
            })

        return results

    def detect_single(
        self,
        record: Dict[str, Any],
        feature_columns: List[str],
    ) -> Dict[str, Any]:
        """Detect anomaly in a single record."""
        results = self.detect([record], feature_columns)
        return results[0] if results else {
            "is_anomaly": False,
            "anomaly_score": 0.0,
            "severity": AnomalySeverity.low.value,
        }

    def _save_model(self) -> None:
        """Save trained model to disk."""
        model_data = {
            "isolation_forest": self.isolation_forest,
            "dbscan": self.dbscan,
            "scaler": self.scaler,
            "feature_names": self.feature_names,
            "model_version": self.model_version,
            "training_metadata": self.training_metadata,
            "is_trained": self.is_trained,
        }
        model_file = os.path.join(self.model_path, f"anomaly_model_{self.model_version}.pkl")
        joblib.dump(model_data, model_file)

        # Save metadata as JSON
        meta_file = os.path.join(self.model_path, f"model_metadata_{self.model_version}.json")
        with open(meta_file, "w") as f:
            json.dump(self.training_metadata, f, indent=2)

    def load_model(self, model_version: str) -> bool:
        """Load a trained model from disk."""
        model_file = os.path.join(self.model_path, f"anomaly_model_{model_version}.pkl")
        if not os.path.exists(model_file):
            return False

        model_data = joblib.load(model_file)
        self.isolation_forest = model_data["isolation_forest"]
        self.dbscan = model_data["dbscan"]
        self.scaler = model_data["scaler"]
        self.feature_names = model_data["feature_names"]
        self.model_version = model_data["model_version"]
        self.training_metadata = model_data.get("training_metadata", {})
        self.is_trained = model_data.get("is_trained", True)
        return True

    def list_models(self) -> List[str]:
        """List available trained models."""
        if not os.path.exists(self.model_path):
            return []
        files = [f for f in os.listdir(self.model_path) if f.startswith("anomaly_model_") and f.endswith(".pkl")]
        versions = [f.replace("anomaly_model_", "").replace(".pkl", "") for f in files]
        return versions


class StatisticalAnomalyDetector:
    """Statistical anomaly detection using z-scores and IQR."""

    def __init__(self, z_threshold: float = 3.0, iqr_multiplier: float = 1.5):
        self.z_threshold = z_threshold
        self.iqr_multiplier = iqr_multiplier
        self.baseline_stats: Dict[str, Dict[str, float]] = {}

    def compute_baseline(
        self,
        records: List[Dict[str, Any]],
        feature_columns: List[str],
    ) -> Dict[str, Dict[str, float]]:
        """Compute baseline statistics for each feature."""
        df = pd.DataFrame(records)
        stats = {}

        for col in feature_columns:
            if col in df.columns:
                values = df[col].dropna()
                if len(values) > 0:
                    q1 = values.quantile(0.25)
                    q3 = values.quantile(0.75)
                    iqr = q3 - q1
                    stats[col] = {
                        "mean": float(values.mean()),
                        "std": float(values.std()),
                        "median": float(values.median()),
                        "q1": float(q1),
                        "q3": float(q3),
                        "iqr": float(iqr),
                        "min": float(values.min()),
                        "max": float(values.max()),
                        "lower_bound": float(q1 - self.iqr_multiplier * iqr),
                        "upper_bound": float(q3 + self.iqr_multiplier * iqr),
                    }

        self.baseline_stats = stats
        return stats

    def detect(
        self,
        records: List[Dict[str, Any]],
        feature_columns: List[str],
    ) -> List[Dict[str, Any]]:
        """Detect statistical anomalies."""
        if not self.baseline_stats:
            self.compute_baseline(records, feature_columns)

        results = []
        for record in records:
            record_id = record.get("id", "unknown")
            anomalies = []
            max_severity = "low"

            for col, stats in self.baseline_stats.items():
                if col not in record or record[col] is None:
                    continue

                value = float(record[col])

                # Z-score check
                if stats["std"] > 0:
                    z_score = abs((value - stats["mean"]) / stats["std"])
                    if z_score > self.z_threshold:
                        anomalies.append({
                            "feature": col,
                            "value": value,
                            "baseline_mean": stats["mean"],
                            "z_score": float(z_score),
                            "method": "z_score",
                        })
                        if z_score > 4:
                            max_severity = "critical"
                        elif z_score > 3:
                            max_severity = max(max_severity, "high")
                        else:
                            max_severity = max(max_severity, "medium")

                # IQR check
                if value < stats["lower_bound"] or value > stats["upper_bound"]:
                    anomalies.append({
                        "feature": col,
                        "value": value,
                        "baseline_q1": stats["q1"],
                        "baseline_q3": stats["q3"],
                        "method": "iqr",
                    })
                    if max_severity not in ("critical", "high"):
                        max_severity = "medium"

            results.append({
                "record_id": record_id,
                "is_anomaly": len(anomalies) > 0,
                "anomalies": anomalies,
                "severity": max_severity,
                "detection_method": DetectionMethod.statistical.value,
            })

        return results


class TimeSeriesAnomalyDetector:
    """Time-series anomaly detection using rolling statistics."""

    def __init__(self, window_size: int = 24, threshold: float = 2.0):
        self.window_size = window_size
        self.threshold = threshold

    def detect(
        self,
        time_series: List[Dict[str, Any]],
        value_column: str,
        timestamp_column: str = "timestamp",
    ) -> List[Dict[str, Any]]:
        """Detect anomalies in time series data."""
        df = pd.DataFrame(time_series)
        df[timestamp_column] = pd.to_datetime(df[timestamp_column])
        df = df.sort_values(timestamp_column)

        # Rolling mean and std
        df["rolling_mean"] = df[value_column].rolling(window=self.window_size, min_periods=1).mean()
        df["rolling_std"] = df[value_column].rolling(window=self.window_size, min_periods=1).std()

        # Z-score relative to rolling window
        df["z_score"] = (df[value_column] - df["rolling_mean"]) / df["rolling_std"].replace(0, 1)

        # Mark anomalies
        df["is_anomaly"] = df["z_score"].abs() > self.threshold

        results = []
        for _, row in df.iterrows():
            results.append({
                "record_id": row.get("id", "unknown"),
                "timestamp": row[timestamp_column].isoformat(),
                "value": float(row[value_column]),
                "rolling_mean": float(row["rolling_mean"]),
                "z_score": float(row["z_score"]),
                "is_anomaly": bool(row["is_anomaly"]),
                "severity": "high" if abs(row["z_score"]) > 3 else ("medium" if abs(row["z_score"]) > 2 else "low"),
                "detection_method": DetectionMethod.statistical.value,
            })

        return results


# ---------------------------------------------------------------------------
# Anomaly Detection Service
# ---------------------------------------------------------------------------

class AnomalyDetectionService:
    """High-level anomaly detection service combining ML and statistical methods."""

    def __init__(self):
        self.ml_detector = MLAnomalyDetector()
        self.stat_detector = StatisticalAnomalyDetector()
        self.ts_detector = TimeSeriesAnomalyDetector()

    async def train_ml_model(
        self,
        records: List[Dict[str, Any]],
        feature_columns: List[str],
    ) -> Dict[str, Any]:
        """Train the ML anomaly detection model."""
        return await self.ml_detector.train(records, feature_columns)

    async def detect_anomalies(
        self,
        records: List[Dict[str, Any]],
        feature_columns: List[str],
        method: str = "hybrid",
    ) -> List[Dict[str, Any]]:
        """Detect anomalies using specified method."""
        results = []

        if method in ("ml", "hybrid"):
            try:
                ml_results = self.ml_detector.detect(records, feature_columns)
                results.extend(ml_results)
            except ValueError:
                # Model not trained, fall back to statistical
                pass

        if method in ("statistical", "hybrid"):
            stat_results = self.stat_detector.detect(records, feature_columns)
            results.extend(stat_results)

        # Merge results if hybrid
        if method == "hybrid" and len(results) > len(records):
            # Merge by record_id
            merged = {}
            for r in results:
                rid = r.get("record_id", "unknown")
                if rid not in merged:
                    merged[rid] = r
                else:
                    # Combine: if either says anomaly, it's an anomaly
                    existing = merged[rid]
                    existing["is_anomaly"] = existing["is_anomaly"] or r["is_anomaly"]
                    # Take higher severity
                    sev_order = {"low": 0, "medium": 1, "high": 2, "critical": 3}
                    if sev_order.get(r.get("severity", "low"), 0) > sev_order.get(existing.get("severity", "low"), 0):
                        existing["severity"] = r["severity"]
            results = list(merged.values())

        return results

    async def persist_anomaly(
        self,
        mine_id: str,
        category: str,
        severity: str,
        detection_method: str,
        observed_values: Dict[str, Any],
        expected_baseline: Optional[Dict[str, Any]] = None,
        deviation_magnitude: Optional[float] = None,
        confidence: Optional[float] = None,
    ) -> str:
        """Persist anomaly finding to database."""
        import uuid
        anomaly_id = f"anom-{uuid.uuid4().hex[:12]}"

        async with async_session() as session:
            finding = AnomalyFinding(
                id=anomaly_id,
                mine_id=mine_id,
                category=category,
                severity=severity,
                detection_method=detection_method,
                observed_values=observed_values,
                expected_baseline=expected_baseline or {},
                deviation_magnitude=deviation_magnitude,
                confidence=confidence,
                investigation_status="open",
            )
            session.add(finding)
            await session.commit()

        return anomaly_id


# Singleton
anomaly_service = AnomalyDetectionService()
