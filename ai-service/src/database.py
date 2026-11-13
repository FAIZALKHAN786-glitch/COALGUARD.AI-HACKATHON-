"""
CoalGuard.AI — AI Service Database Models & Connection
"""
from datetime import datetime
from typing import AsyncGenerator, Optional
from sqlalchemy import Column, String, Text, DateTime, Integer, Float, Boolean, JSON, ForeignKey, Index, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID, ARRAY, JSONB
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, declared_attr, relationship
import enum


class Base(DeclarativeBase):
    pass


class AnomalyCategory(str, enum.Enum):
    mine_safety = "mine_safety"
    environment = "environment"
    production = "production"
    labour = "labour"
    contractor = "contractor"
    compliance = "compliance"
    equipment = "equipment"


class AnomalySeverity(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class DetectionMethod(str, enum.Enum):
    rule = "rule"
    statistical = "statistical"
    ml = "ml"
    hybrid = "hybrid"


class InvestigationStatus(str, enum.Enum):
    open = "open"
    under_investigation = "under_investigation"
    resolved = "resolved"
    dismissed = "dismissed"
    false_positive = "false_positive"


class InvestigationStage(str, enum.Enum):
    received = "received"
    validating = "validating"
    context_gathering = "context_gathering"
    historical_analysis = "historical_analysis"
    predictive_assessment = "predictive_assessment"
    external_research = "external_research"
    factor_correlation = "factor_correlation"
    risk_evaluation = "risk_evaluation"
    human_review_required = "human_review_required"
    action_pending = "action_pending"
    notification_pending = "notification_pending"
    monitoring = "monitoring"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


class RiskBand(str, enum.Enum):
    low = "low"
    moderate = "moderate"
    high = "high"
    critical = "critical"


class ModelType(str, enum.Enum):
    logistic_regression = "logistic_regression"
    random_forest = "random_forest"
    xgboost = "xgboost"
    isolation_forest = "isolation_forest"
    autoencoder = "autoencoder"
    heuristic = "heuristic"


class ModelStatus(str, enum.Enum):
    development = "development"
    staging = "staging"
    production = "production"
    archived = "archived"
    rejected = "rejected"


class DeploymentStatus(str, enum.Enum):
    staging = "staging"
    production = "production"
    retired = "retired"


class ResearchStatus(str, enum.Enum):
    pending = "pending"
    completed = "completed"
    failed = "failed"
    no_results = "no_results"
    provider_unavailable = "provider_unavailable"


class SourceCategory(str, enum.Enum):
    regulatory = "regulatory"
    safety_advisory = "safety_advisory"
    incident_report = "incident_report"
    technical_report = "technical_report"
    equipment_failure = "equipment_failure"
    environmental = "environmental"


class SourceType(str, enum.Enum):
    government = "government"
    regulatory = "regulatory"
    scientific = "scientific"
    technical = "technical"
    industry = "industry"


class ResearchStatusEnum(str, enum.Enum):
    pending = "pending"
    completed = "completed"
    failed = "failed"
    no_results = "no_results"
    provider_unavailable = "provider_unavailable"


class Reliability(str, enum.Enum):
    high = "high"
    medium = "medium"
    low = "low"
    unverified = "unverified"


class Relevance(str, enum.Enum):
    direct = "direct"
    partial = "partial"
    indirect = "indirect"
    not_applicable = "not_applicable"


class ComparisonResult(str, enum.Enum):
    match = "match"
    partial_match = "partial_match"
    no_match = "no_match"
    unknown = "unknown"
    conflicting_evidence = "conflicting_evidence"
    not_applicable = "not_applicable"


class NotificationType(str, enum.Enum):
    anomaly_alert = "anomaly_alert"
    risk_prediction = "risk_prediction"
    investigation_update = "investigation_update"
    corrective_action_recommendation = "corrective_action_recommendation"
    escalation = "escalation"
    model_health_warning = "model_health_warning"


class NotificationStatus(str, enum.Enum):
    pending = "pending"
    sent = "sent"
    delivered = "delivered"
    failed = "failed"


class AnomalyRuleDefinition(Base):
    __tablename__ = "anomaly_rule_definitions"

    id = Column(String(36), primary_key=True)
    rule_code = Column(String(64), unique=True, nullable=False)
    name = Column(String(256), nullable=False)
    description = Column(Text)
    category = Column(SQLEnum(AnomalyCategory), nullable=False)
    severity = Column(SQLEnum(AnomalySeverity), nullable=False)
    rule_expression = Column(JSONB, nullable=False)
    enabled = Column(Boolean, default=True)
    applies_to_mine_ids = Column(ARRAY(String), default=[])
    version = Column(Integer, default=1)
    approved_by = Column(String(36), ForeignKey("users.id"))
    approved_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)


class AnomalyFinding(Base):
    __tablename__ = "anomaly_findings"

    id = Column(String(36), primary_key=True)
    mine_id = Column(String(36), ForeignKey("mines.id"), nullable=False)
    category = Column(SQLEnum(AnomalyCategory), nullable=False)
    severity = Column(SQLEnum(AnomalySeverity), nullable=False)
    detection_method = Column(SQLEnum(DetectionMethod), nullable=False)
    rule_id = Column(String(36), ForeignKey("anomaly_rule_definitions.id"))
    detected_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    observation_period_start = Column(DateTime(timezone=True))
    observation_period_end = Column(DateTime(timezone=True))
    observed_values = Column(JSONB, nullable=False)
    expected_baseline = Column(JSONB, nullable=False)
    deviation_magnitude = Column(Float)
    confidence = Column(Float)
    supporting_evidence = Column(JSONB, default=[])
    data_quality_warnings = Column(JSONB, default=[])
    investigation_status = Column(SQLEnum(InvestigationStatus), default=InvestigationStatus.open)
    linked_investigation_id = Column(String(36))
    resolved_at = Column(DateTime(timezone=True))
    resolved_by = Column(String(36), ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    mine = relationship("Mine", back_populates="anomaly_findings")
    rule = relationship("AnomalyRuleDefinition")


class AnomalyEvidence(Base):
    __tablename__ = "anomaly_evidence"

    id = Column(String(36), primary_key=True)
    anomaly_id = Column(String(36), ForeignKey("anomaly_findings.id", ondelete="CASCADE"), nullable=False)
    entity_type = Column(String(64), nullable=False)
    entity_id = Column(String(36), nullable=False)
    entity_code = Column(String(64))
    relevance_note = Column(Text)
    linked_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    linked_by = Column(String(36), ForeignKey("users.id"))


class FeatureDefinition(Base):
    __tablename__ = "feature_definitions"

    id = Column(String(36), primary_key=True)
    feature_name = Column(String(256), unique=True, nullable=False)
    description = Column(Text)
    source_table = Column(String(128), nullable=False)
    source_column = Column(String(128))
    transformation = Column(JSONB, nullable=False)
    time_window = Column(String(16), nullable=False)
    unit = Column(String(32))
    version = Column(Integer, default=1)
    enabled = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


class FeatureSnapshot(Base):
    __tablename__ = "feature_snapshots"

    id = Column(String(36), primary_key=True)
    mine_id = Column(String(36), ForeignKey("mines.id"), nullable=False)
    feature_id = Column(String(36), ForeignKey("feature_definitions.id"), nullable=False)
    computed_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    window_start = Column(DateTime(timezone=True), nullable=False)
    window_end = Column(DateTime(timezone=True), nullable=False)
    value = Column(Float, nullable=False)
    data_quality = Column(JSONB, default={})

    mine = relationship("Mine")
    feature = relationship("FeatureDefinition")


class PredictionTarget(Base):
    __tablename__ = "prediction_targets"

    id = Column(String(36), primary_key=True)
    target_name = Column(String(128), unique=True, nullable=False)
    description = Column(Text)
    event_category = Column(String(64), nullable=False)
    prediction_horizon_days = Column(Integer, nullable=False)
    eligible_population = Column(JSONB, nullable=False)
    label_definition = Column(Text, nullable=False)
    required_features = Column(JSONB, default=[])
    enabled = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


class PredictionRecord(Base):
    __tablename__ = "prediction_records"

    id = Column(String(36), primary_key=True)
    target_id = Column(String(36), ForeignKey("prediction_targets.id"), nullable=False)
    mine_id = Column(String(36), ForeignKey("mines.id"), nullable=False)
    predicted_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    horizon_start = Column(DateTime(timezone=True), nullable=False)
    horizon_end = Column(DateTime(timezone=True), nullable=False)
    estimated_probability = Column(Float)
    probability_calibrated = Column(Boolean, default=False)
    risk_band = Column(SQLEnum(RiskBand), nullable=False)
    model_id = Column(String(36), ForeignKey("model_versions.id"))
    model_version = Column(String(64), nullable=False)
    input_data_freshness = Column(DateTime(timezone=True))
    data_completeness = Column(Float)
    contributing_factors = Column(JSONB, default=[])
    explanation = Column(Text)
    limitations = Column(Text)
    insufficient_evidence = Column(Boolean, default=False)
    linked_investigation_id = Column(String(36))
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    target = relationship("PredictionTarget")
    mine = relationship("Mine")
    model_version = relationship("ModelVersion")


class PredictionOutcome(Base):
    __tablename__ = "prediction_outcomes"

    id = Column(String(36), primary_key=True)
    prediction_id = Column(String(36), ForeignKey("prediction_records.id", ondelete="CASCADE"), nullable=False, unique=True)
    target_id = Column(String(36), ForeignKey("prediction_targets.id"), nullable=False)
    mine_id = Column(String(36), ForeignKey("mines.id"), nullable=False)
    occurred = Column(Boolean, nullable=False)
    occurred_at = Column(DateTime(timezone=True))
    actual_event_category = Column(String(64))
    recorded_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    recorded_by = Column(String(36), ForeignKey("users.id"))
    source = Column(String(32), nullable=False)


class ModelRegistryEntry(Base):
    __tablename__ = "model_registry_entries"

    id = Column(String(36), primary_key=True)
    model_name = Column(String(128), nullable=False)
    model_type = Column(SQLEnum(ModelType), nullable=False)
    prediction_target = Column(String(64), nullable=False)
    description = Column(Text)
    owner = Column(String(128))
    status = Column(SQLEnum(ModelStatus), default=ModelStatus.development)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    versions = relationship("ModelVersion", back_populates="model")


class ModelVersion(Base):
    __tablename__ = "model_versions"

    id = Column(String(36), primary_key=True)
    model_id = Column(String(36), ForeignKey("model_registry_entries.id"), nullable=False)
    version = Column(String(32), unique=True, nullable=False)
    artifact_path = Column(String(512))
    input_schema = Column(JSONB)
    training_dataset_id = Column(String(36))
    feature_schema_version = Column(String(32))
    hyperparameters = Column(JSONB, default={})
    random_seed = Column(String(64))
    trained_at = Column(DateTime(timezone=True))
    training_duration_ms = Column(Integer)
    approved_by = Column(String(36), ForeignKey("users.id"))
    approved_at = Column(DateTime(timezone=True))
    deployment_status = Column(SQLEnum(DeploymentStatus), default=DeploymentStatus.staging)
    deployed_at = Column(DateTime(timezone=True))
    retired_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    model = relationship("ModelRegistryEntry", back_populates="versions")
    predictions = relationship("PredictionRecord", back_populates="model_version")


class ModelTrainingRun(Base):
    __tablename__ = "model_training_runs"

    id = Column(String(36), primary_key=True)
    model_id = Column(String(36), ForeignKey("model_registry_entries.id"), nullable=False)
    version_id = Column(String(36), ForeignKey("model_versions.id"))
    started_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    completed_at = Column(DateTime(timezone=True))
    status = Column(String(32), default="running")
    training_rows = Column(Integer)
    validation_rows = Column(Integer)
    metrics = Column(JSONB, default={})
    error_message = Column(Text)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


class ModelEvaluationMetrics(Base):
    __tablename__ = "model_evaluation_metrics"

    id = Column(String(36), primary_key=True)
    model_id = Column(String(36), ForeignKey("model_registry_entries.id"), nullable=False)
    version_id = Column(String(36), ForeignKey("model_versions.id"))
    evaluated_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    evaluation_window_start = Column(DateTime(timezone=True), nullable=False)
    evaluation_window_end = Column(DateTime(timezone=True), nullable=False)
    precision = Column(Float)
    recall = Column(Float)
    f1_score = Column(Float)
    pr_auc = Column(Float)
    roc_auc = Column(Float)
    brier_score = Column(Float)
    false_positive_rate = Column(Float)
    false_negative_rate = Column(Float)
    calibration_error = Column(Float)
    mine_group = Column(JSONB, default=[])
    notes = Column(Text)


class ModelDriftEvent(Base):
    __tablename__ = "model_drift_events"

    id = Column(String(36), primary_key=True)
    model_id = Column(String(36), ForeignKey("model_registry_entries.id"), nullable=False)
    version_id = Column(String(36), ForeignKey("model_versions.id"))
    detected_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    drift_type = Column(String(64), nullable=False)
    severity = Column(String(16), nullable=False)
    metric_name = Column(String(128))
    current_value = Column(Float)
    baseline_value = Column(Float)
    drift_magnitude = Column(Float)
    description = Column(Text)
    acknowledged = Column(Boolean, default=False)
    acknowledged_by = Column(String(36), ForeignKey("users.id"))
    acknowledged_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


class InvestigationRecord(Base):
    __tablename__ = "investigation_records"

    id = Column(String(36), primary_key=True)
    mine_id = Column(String(36), ForeignKey("mines.id"), nullable=False)
    anomaly_id = Column(String(36), ForeignKey("anomaly_findings.id"))
    prediction_id = Column(String(36), ForeignKey("prediction_records.id"))
    trigger_event_type = Column(String(64), nullable=False)
    trigger_event_id = Column(String(36))
    correlation_id = Column(String(64), nullable=False)
    current_stage = Column(SQLEnum(InvestigationStage), default=InvestigationStage.received)
    started_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    completed_at = Column(DateTime(timezone=True))
    risk_assessment = Column(JSONB, default={})
    model_version = Column(String(64))
    policy_version = Column(String(64))
    data_quality_status = Column(String(64))
    outstanding_questions = Column(JSONB, default=[])
    recommended_actions = Column(JSONB, default=[])
    executed_action_references = Column(JSONB, default=[])
    human_review_required = Column(Boolean, default=False)
    human_review_completed = Column(Boolean, default=False)
    human_reviewed_by = Column(String(36), ForeignKey("users.id"))
    human_reviewed_at = Column(DateTime(timezone=True))
    retry_count = Column(Integer, default=0)
    final_outcome = Column(Text)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    mine = relationship("Mine")
    anomaly = relationship("AnomalyFinding")
    prediction = relationship("PredictionRecord")


class InvestigationEvidenceLink(Base):
    __tablename__ = "investigation_evidence_links"

    id = Column(String(36), primary_key=True)
    investigation_id = Column(String(36), ForeignKey("investigation_records.id", ondelete="CASCADE"), nullable=False)
    evidence_type = Column(String(64), nullable=False)
    evidence_id = Column(String(36), nullable=False)
    evidence_code = Column(String(64))
    relevance = Column(Text)
    source_provenance = Column(JSONB, default={})
    linked_at = Column(DateTime(timezone=True), default=datetime.utcnow)


class InvestigationDecision(Base):
    __tablename__ = "investigation_decisions"

    id = Column(String(36), primary_key=True)
    investigation_id = Column(String(36), ForeignKey("investigation_records.id", ondelete="CASCADE"), nullable=False)
    stage = Column(SQLEnum(InvestigationStage), nullable=False)
    decision = Column(Text, nullable=False)
    rationale = Column(Text)
    policy_applied = Column(String(64))
    made_by = Column(String(36), ForeignKey("users.id"))
    made_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    requires_human_approval = Column(Boolean, default=False)
    approved_by = Column(String(36), ForeignKey("users.id"))
    approved_at = Column(DateTime(timezone=True))


class RiskAssessmentRecord(Base):
    __tablename__ = "risk_assessment_records"

    id = Column(String(36), primary_key=True)
    investigation_id = Column(String(36), ForeignKey("investigation_records.id", ondelete="CASCADE"), nullable=False)
    mine_id = Column(String(36), ForeignKey("mines.id"), nullable=False)
    event_category = Column(String(64), nullable=False)
    prediction_horizon_days = Column(Integer)
    estimated_probability = Column(Float)
    probability_calibrated = Column(Boolean, default=False)
    operational_risk_band = Column(SQLEnum(RiskBand), nullable=False)
    deterministic_findings = Column(JSONB, default=[])
    historical_references = Column(JSONB, default=[])
    external_evidence_references = Column(JSONB, default=[])
    matched_factors = Column(JSONB, default=[])
    partial_matched_factors = Column(JSONB, default=[])
    unmatched_factors = Column(JSONB, default=[])
    missing_evidence = Column(JSONB, default=[])
    contradictory_evidence = Column(JSONB, default=[])
    model_version = Column(String(64))
    policy_version = Column(String(64))
    explanation = Column(Text)
    recommended_next_steps = Column(JSONB, default=[])
    required_approval = Column(Boolean, default=False)
    notification_status = Column(String(32))
    investigation_status = Column(String(32))
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


class ExternalSourceRegistry(Base):
    __tablename__ = "external_source_registry"

    id = Column(String(36), primary_key=True)
    source_name = Column(String(256), nullable=False)
    publisher = Column(String(256))
    source_type = Column(SQLEnum(SourceType), nullable=False)
    base_url = Column(String(512))
    jurisdiction = Column(String(128))
    credibility_score = Column(Float)
    requires_credentials = Column(Boolean, default=False)
    active = Column(Boolean, default=True)
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


class ResearchQuery(Base):
    __tablename__ = "research_queries"

    id = Column(String(36), primary_key=True)
    investigation_id = Column(String(36), ForeignKey("investigation_records.id"))
    query_text = Column(Text, nullable=False)
    source_category = Column(SQLEnum(SourceCategory), nullable=False)
    provider = Column(String(64), nullable=False)
    status = Column(SQLEnum(ResearchStatusEnum), default=ResearchStatusEnum.pending)
    results_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    completed_at = Column(DateTime(timezone=True))
    error_message = Column(Text)


class ExternalEvidenceRecord(Base):
    __tablename__ = "external_evidence_records"

    id = Column(String(36), primary_key=True)
    research_query_id = Column(String(36), ForeignKey("research_queries.id", ondelete="CASCADE"), nullable=False)
    source_id = Column(String(36), ForeignKey("external_source_registry.id"))
    source_title = Column(String(512), nullable=False)
    source_url = Column(String(1024))
    publisher = Column(String(256))
    publication_date = Column(DateTime(timezone=True))
    retrieval_timestamp = Column(DateTime(timezone=True), default=datetime.utcnow)
    relevant_passage = Column(Text)
    reliability = Column(SQLEnum(Reliability), nullable=False)
    relevance = Column(SQLEnum(Relevance), nullable=False)
    limitation = Column(Text)
    stored_content_hash = Column(String(64))


class FactorComparisonResult(Base):
    __tablename__ = "factor_comparison_results"

    id = Column(String(36), primary_key=True)
    investigation_id = Column(String(36), ForeignKey("investigation_records.id", ondelete="CASCADE"), nullable=False)
    external_evidence_id = Column(String(36), ForeignKey("external_evidence_records.id"))
    factor_name = Column(String(128), nullable=False)
    factor_category = Column(String(64), nullable=False)
    comparison_result = Column(SQLEnum(ComparisonResult), nullable=False)
    internal_field = Column(String(128))
    internal_value = Column(Text)
    external_value = Column(Text)
    match_reasoning = Column(Text)
    data_available = Column(Boolean, default=False)
    current_within_limits = Column(Boolean)
    limitation = Column(Text)
    compared_at = Column(DateTime(timezone=True), default=datetime.utcnow)


class AINotificationRecord(Base):
    __tablename__ = "ai_notification_records"

    id = Column(String(36), primary_key=True)
    investigation_id = Column(String(36), ForeignKey("investigation_records.id"))
    anomaly_id = Column(String(36), ForeignKey("anomaly_findings.id"))
    prediction_id = Column(String(36), ForeignKey("prediction_records.id"))
    mine_id = Column(String(36), ForeignKey("mines.id"), nullable=False)
    notification_type = Column(SQLEnum(NotificationType), nullable=False)
    risk_classification = Column(SQLEnum(RiskBand), nullable=False)
    title = Column(String(256), nullable=False)
    explanation = Column(Text, nullable=False)
    evidence_references = Column(JSONB, default=[])
    recommended_next_step = Column(Text)
    action_deadline = Column(DateTime(timezone=True))
    recipient_ids = Column(ARRAY(String), default=[])
    delivery_status = Column(SQLEnum(NotificationStatus), default=NotificationStatus.pending)
    acknowledged = Column(Boolean, default=False)
    acknowledged_by = Column(String(36), ForeignKey("users.id"))
    acknowledged_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


# Indexes
Index("idx_anomaly_findings_mine", AnomalyFinding.mine_id)
Index("idx_anomaly_findings_status", AnomalyFinding.investigation_status)
Index("idx_anomaly_findings_category", AnomalyFinding.category)
Index("idx_anomaly_findings_detected", AnomalyFinding.detected_at)
Index("idx_anomaly_evidence_anomaly", AnomalyEvidence.anomaly_id)
Index("idx_feature_snapshots_mine", FeatureSnapshot.mine_id)
Index("idx_feature_snapshots_feature", FeatureSnapshot.feature_id)
Index("idx_prediction_records_mine", PredictionRecord.mine_id)
Index("idx_prediction_records_target", PredictionRecord.target_id)
Index("idx_prediction_records_model", PredictionRecord.model_version)
Index("idx_prediction_outcomes_prediction", PredictionOutcome.prediction_id)
Index("idx_model_versions_model", ModelVersion.model_id)
Index("idx_model_evaluation_metrics_model", ModelEvaluationMetrics.model_id)
Index("idx_investigation_records_mine", InvestigationRecord.mine_id)
Index("idx_investigation_records_stage", InvestigationRecord.current_stage)
Index("idx_investigation_evidence_links_investigation", InvestigationEvidenceLink.investigation_id)
Index("idx_risk_assessment_records_investigation", RiskAssessmentRecord.investigation_id)
Index("idx_research_queries_investigation", ResearchQuery.investigation_id)
Index("idx_external_evidence_records_query", ExternalEvidenceRecord.research_query_id)
Index("idx_factor_comparison_results_investigation", FactorComparisonResult.investigation_id)
Index("idx_ai_notification_records_mine", AINotificationRecord.mine_id)
Index("idx_ai_notification_records_status", AINotificationRecord.delivery_status)


# Database connection
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine, async_sessionmaker
from contextlib import asynccontextmanager
import os


_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        database_url = os.getenv("COALGUARD_AI_DATABASE_URL", "postgresql+asyncpg://postgres:postgres@127.0.0.1:55432/coalguard")
        _engine = create_async_engine(database_url, echo=False, pool_pre_ping=True)
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(get_engine(), class_=AsyncSession, expire_on_commit=False)
    return _session_factory


@asynccontextmanager
async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with get_session_factory()() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db() -> None:
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)