-- AI Intelligence Subsystem
-- Anomaly detection rule definitions (versioned, deterministic rules)
CREATE TABLE anomaly_rule_definitions (
  id text PRIMARY KEY,
  rule_code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  category text NOT NULL CHECK (category IN ('mine_safety','environment','production','labour','contractor','compliance','equipment')),
  severity text NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  rule_expression jsonb NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  applies_to_mine_ids text[] DEFAULT '{}',
  version integer NOT NULL DEFAULT 1,
  approved_by text REFERENCES users(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Detected anomaly findings
CREATE TABLE anomaly_findings (
  id text PRIMARY KEY,
  mine_id text NOT NULL REFERENCES mines(id),
  category text NOT NULL CHECK (category IN ('mine_safety','environment','production','labour','contractor','compliance','equipment')),
  severity text NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  detection_method text NOT NULL CHECK (detection_method IN ('rule','statistical','ml','hybrid')),
  rule_id text REFERENCES anomaly_rule_definitions(id),
  detected_at timestamptz NOT NULL DEFAULT now(),
  observation_period_start timestamptz,
  observation_period_end timestamptz,
  observed_values jsonb,
  expected_baseline jsonb,
  deviation_magnitude numeric,
  confidence numeric CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  supporting_evidence jsonb DEFAULT '[]',
  data_quality_warnings jsonb DEFAULT '[]',
  investigation_status text NOT NULL DEFAULT 'open' CHECK (investigation_status IN ('open','under_investigation','resolved','dismissed','false_positive')),
  linked_investigation_id text,
  resolved_at timestamptz,
  resolved_by text REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Evidence linked to anomalies
CREATE TABLE anomaly_evidence (
  id text PRIMARY KEY,
  anomaly_id text NOT NULL REFERENCES anomaly_findings(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('inspection','incident','violation','corrective_action','measurement','document','compliance_requirement')),
  entity_id text NOT NULL,
  entity_code text,
  relevance_note text,
  linked_at timestamptz NOT NULL DEFAULT now(),
  linked_by text REFERENCES users(id)
);

-- Feature pipeline definitions
CREATE TABLE feature_definitions (
  id text PRIMARY KEY,
  feature_name text NOT NULL UNIQUE,
  description text,
  source_table text NOT NULL,
  source_column text,
  transformation sql_expression jsonb NOT NULL,
  time_window text NOT NULL CHECK (time_window IN ('1d','7d','30d','90d')),
  unit text,
  version integer NOT NULL DEFAULT 1,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Computed feature snapshots (per mine, per time window)
CREATE TABLE feature_snapshots (
  id text PRIMARY KEY,
  mine_id text NOT NULL REFERENCES mines(id),
  feature_id text NOT NULL REFERENCES feature_definitions(id),
  computed_at timestamptz NOT NULL DEFAULT now(),
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  value numeric NOT NULL,
  data_quality jsonb DEFAULT '{}',
  UNIQUE (mine_id, feature_id, window_start, window_end)
);

-- Prediction targets
CREATE TABLE prediction_targets (
  id text PRIMARY KEY,
  target_name text NOT NULL UNIQUE,
  description text,
  event_category text NOT NULL,
  prediction_horizon_days integer NOT NULL CHECK (prediction_horizon_days > 0),
  eligible_population jsonb NOT NULL,
  label_definition text NOT NULL,
  required_features jsonb NOT NULL DEFAULT '[]',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Model predictions
CREATE TABLE prediction_records (
  id text PRIMARY KEY,
  target_id text NOT NULL REFERENCES prediction_targets(id),
  mine_id text NOT NULL REFERENCES mines(id),
  predicted_at timestamptz NOT NULL DEFAULT now(),
  horizon_start timestamptz NOT NULL,
  horizon_end timestamptz NOT NULL,
  estimated_probability numeric CHECK (estimated_probability IS NULL OR (estimated_probability >= 0 AND estimated_probability <= 1)),
  probability_calibrated boolean NOT NULL DEFAULT false,
  risk_band text NOT NULL CHECK (risk_band IN ('low','moderate','high','critical')),
  model_id text REFERENCES model_versions(id),
  model_version text NOT NULL,
  input_data_freshness timestamptz,
  data_completeness numeric CHECK (data_completeness IS NULL OR (data_completeness >= 0 AND data_completeness <= 1)),
  contributing_factors jsonb DEFAULT '[]',
  explanation text,
  limitations text,
  insufficient_evidence boolean NOT NULL DEFAULT false,
  linked_investigation_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Actual outcomes for prediction evaluation
CREATE TABLE prediction_outcomes (
  id text PRIMARY KEY,
  prediction_id text NOT NULL REFERENCES prediction_records(id) ON DELETE CASCADE,
  target_id text NOT NULL REFERENCES prediction_targets(id),
  mine_id text NOT NULL REFERENCES mines(id),
  occurred boolean NOT NULL,
  occurred_at timestamptz,
  actual_event_category text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by text REFERENCES users(id),
  source text NOT NULL CHECK (source IN ('system','manual','inspection','incident','compliance')),
  UNIQUE (prediction_id)
);

-- Model registry entries
CREATE TABLE model_registry_entries (
  id text PRIMARY KEY,
  model_name text NOT NULL,
  model_type text NOT NULL CHECK (model_type IN ('logistic_regression','random_forest','xgboost','isolation_forest','autoencoder','heuristic')),
  prediction_target text NOT NULL,
  description text,
  owner text,
  status text NOT NULL DEFAULT 'development' CHECK (status IN ('development','staging','production','archived','rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Model versions
CREATE TABLE model_versions (
  id text PRIMARY KEY,
  model_id text NOT NULL REFERENCES model_registry_entries(id),
  version text NOT NULL UNIQUE,
  artifact_path text,
  input_schema jsonb,
  training_dataset_id text,
  feature_schema_version text,
  hyperparameters jsonb DEFAULT '{}',
  random_seed text,
  trained_at timestamptz,
  training_duration_ms integer,
  approved_by text REFERENCES users(id),
  approved_at timestamptz,
  deployment_status text NOT NULL DEFAULT 'staging' CHECK (deployment_status IN ('staging','production','retired')),
  deployed_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Model training runs
CREATE TABLE model_training_runs (
  id text PRIMARY KEY,
  model_id text NOT NULL REFERENCES model_registry_entries(id),
  version_id text REFERENCES model_versions(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  training_rows integer,
  validation_rows integer,
  metrics jsonb DEFAULT '{}',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Model evaluation metrics
CREATE TABLE model_evaluation_metrics (
  id text PRIMARY KEY,
  model_id text NOT NULL REFERENCES model_registry_entries(id),
  version_id text REFERENCES model_versions(id),
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  evaluation_window_start timestamptz NOT NULL,
  evaluation_window_end timestamptz NOT NULL,
  precision numeric,
  recall numeric,
  f1_score numeric,
  pr_auc numeric,
  roc_auc numeric,
  brier_score numeric,
  false_positive_rate numeric,
  false_negative_rate numeric,
  calibration_error numeric,
  mine_group jsonb DEFAULT '[]',
  notes text,
  UNIQUE (version_id, evaluation_window_start, evaluation_window_end)
);

-- Model drift events
CREATE TABLE model_drift_events (
  id text PRIMARY KEY,
  model_id text NOT NULL REFERENCES model_registry_entries(id),
  version_id text REFERENCES model_versions(id),
  detected_at timestamptz NOT NULL DEFAULT now(),
  drift_type text NOT NULL CHECK (drift_type IN ('input_data','feature','prediction_distribution','calibration','performance')),
  severity text NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  metric_name text,
  current_value numeric,
  baseline_value numeric,
  drift_magnitude numeric,
  description text,
  acknowledged boolean NOT NULL DEFAULT false,
  acknowledged_by text REFERENCES users(id),
  acknowledged_at timestamptz
);

-- Investigation records (agentic workflow)
CREATE TABLE investigation_records (
  id text PRIMARY KEY,
  mine_id text NOT NULL REFERENCES mines(id),
  anomaly_id text REFERENCES anomaly_findings(id),
  prediction_id text REFERENCES prediction_records(id),
  trigger_event_type text NOT NULL,
  trigger_event_id text,
  correlation_id text NOT NULL,
  current_stage text NOT NULL DEFAULT 'received' CHECK (current_stage IN ('received','validating','context_gathering','historical_analysis','predictive_assessment','external_research','factor_correlation','risk_evaluation','human_review_required','action_pending','notification_pending','monitoring','completed','failed','cancelled')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  risk_assessment jsonb DEFAULT '{}',
  model_version text,
  policy_version text,
  data_quality_status text,
  outstanding_questions jsonb DEFAULT '[]',
  recommended_actions jsonb DEFAULT '[]',
  executed_action_references jsonb DEFAULT '[]',
  human_review_required boolean NOT NULL DEFAULT false,
  human_review_completed boolean NOT NULL DEFAULT false,
  human_reviewed_by text REFERENCES users(id),
  human_reviewed_at timestamptz,
  retry_count integer NOT NULL DEFAULT 0,
  final_outcome text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Investigation evidence links
CREATE TABLE investigation_evidence_links (
  id text PRIMARY KEY,
  investigation_id text NOT NULL REFERENCES investigation_records(id) ON DELETE CASCADE,
  evidence_type text NOT NULL CHECK (evidence_type IN ('historical_incident','internal_record','external_source','prediction_output','rule_finding','measurement','document')),
  evidence_id text NOT NULL,
  evidence_code text,
  relevance text,
  source_provenance jsonb DEFAULT '{}',
  linked_at timestamptz NOT NULL DEFAULT now()
);

-- Investigation decisions
CREATE TABLE investigation_decisions (
  id text PRIMARY KEY,
  investigation_id text NOT NULL REFERENCES investigation_records(id) ON DELETE CASCADE,
  stage text NOT NULL,
  decision text NOT NULL,
  rationale text,
  policy_applied text,
  made_by text REFERENCES users(id),
  made_at timestamptz NOT NULL DEFAULT now(),
  requires_human_approval boolean NOT NULL DEFAULT false,
  approved_by text REFERENCES users(id),
  approved_at timestamptz
);

-- Risk assessment records
CREATE TABLE risk_assessment_records (
  id text PRIMARY KEY,
  investigation_id text NOT NULL REFERENCES investigation_records(id) ON DELETE CASCADE,
  mine_id text NOT NULL REFERENCES mines(id),
  event_category text NOT NULL,
  prediction_horizon_days integer,
  estimated_probability numeric CHECK (estimated_probability IS NULL OR (estimated_probability >= 0 AND estimated_probability <= 1)),
  probability_calibrated boolean NOT NULL DEFAULT false,
  operational_risk_band text NOT NULL CHECK (operational_risk_band IN ('low','moderate','high','critical')),
  deterministic_findings jsonb DEFAULT '[]',
  historical_references jsonb DEFAULT '[]',
  external_evidence_references jsonb DEFAULT '[]',
  matched_factors jsonb DEFAULT '[]',
  partial_matched_factors jsonb DEFAULT '[]',
  unmatched_factors jsonb DEFAULT '[]',
  missing_evidence jsonb DEFAULT '[]',
  contradictory_evidence jsonb DEFAULT '[]',
  model_version text,
  policy_version text,
  explanation text,
  recommended_next_steps jsonb DEFAULT '[]',
  required_approval boolean NOT NULL DEFAULT false,
  notification_status text,
  investigation_status text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Web research queries
CREATE TABLE research_queries (
  id text PRIMARY KEY,
  investigation_id text REFERENCES investigation_records(id),
  query_text text NOT NULL,
  source_category text NOT NULL CHECK (source_category IN ('regulatory','safety_advisory','incident_report','technical_report','equipment_failure','environmental')),
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','failed','no_results','provider_unavailable')),
  results_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  error_message text
);

-- External source registry (approved sources)
CREATE TABLE external_source_registry (
  id text PRIMARY KEY,
  source_name text NOT NULL,
  publisher text,
  source_type text NOT NULL CHECK (source_type IN ('government','regulatory','scientific','technical','industry')),
  base_url text,
  jurisdiction text,
  credibility_score numeric CHECK (credibility_score IS NULL OR (credibility_score >= 0 AND credibility_score <= 1)),
  requires_credentials boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- External evidence records
CREATE TABLE external_evidence_records (
  id text PRIMARY KEY,
  research_query_id text NOT NULL REFERENCES research_queries(id) ON DELETE CASCADE,
  source_id text REFERENCES external_source_registry(id),
  source_title text NOT NULL,
  source_url text,
  publisher text,
  publication_date date,
  retrieval_timestamp timestamptz NOT NULL DEFAULT now(),
  relevant_passage text,
  reliability text NOT NULL CHECK (reliability IN ('high','medium','low','unverified')),
  relevance text NOT NULL CHECK (relevance IN ('direct','partial','indirect','not_applicable')),
  limitation text,
  stored_content_hash text
);

-- Factor comparison results
CREATE TABLE factor_comparison_results (
  id text PRIMARY KEY,
  investigation_id text NOT NULL REFERENCES investigation_records(id) ON DELETE CASCADE,
  external_evidence_id text REFERENCES external_evidence_records(id),
  factor_name text NOT NULL,
  factor_category text NOT NULL,
  comparison_result text NOT NULL CHECK (comparison_result IN ('match','partial_match','no_match','unknown','conflicting_evidence','not_applicable')),
  internal_field text,
  internal_value text,
  external_value text,
  match_reasoning text,
  data_available boolean NOT NULL DEFAULT false,
  current_within_limits boolean,
  limitation text,
  compared_at timestamptz NOT NULL DEFAULT now()
);

-- AI-generated notification records
CREATE TABLE ai_notification_records (
  id text PRIMARY KEY,
  investigation_id text REFERENCES investigation_records(id),
  anomaly_id text REFERENCES anomaly_findings(id),
  prediction_id text REFERENCES prediction_records(id),
  mine_id text NOT NULL REFERENCES mines(id),
  notification_type text NOT NULL CHECK (notification_type IN ('anomaly_alert','risk_prediction','investigation_update','corrective_action_recommendation','escalation','model_health_warning')),
  risk_classification text NOT NULL CHECK (risk_classification IN ('low','moderate','high','critical')),
  title text NOT NULL,
  explanation text NOT NULL,
  evidence_references jsonb DEFAULT '[]',
  recommended_next_step text,
  action_deadline timestamptz,
  recipient_ids text[] DEFAULT '{}',
  delivery_status text NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending','sent','delivered','failed')),
  acknowledged boolean NOT NULL DEFAULT false,
  acknowledged_by text REFERENCES users(id),
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX anomaly_findings_mine_idx ON anomaly_findings(mine_id);
CREATE INDEX anomaly_findings_status_idx ON anomaly_findings(investigation_status);
CREATE INDEX anomaly_findings_category_idx ON anomaly_findings(category);
CREATE INDEX anomaly_findings_detected_idx ON anomaly_findings(detected_at);
CREATE INDEX anomaly_evidence_anomaly_idx ON anomaly_evidence(anomaly_id);
CREATE INDEX feature_snapshots_mine_idx ON feature_snapshots(mine_id);
CREATE INDEX feature_snapshots_feature_idx ON feature_snapshots(feature_id);
CREATE INDEX prediction_records_mine_idx ON prediction_records(mine_id);
CREATE INDEX prediction_records_target_idx ON prediction_records(target_id);
CREATE INDEX prediction_records_model_idx ON prediction_records(model_version);
CREATE INDEX prediction_outcomes_prediction_idx ON prediction_outcomes(prediction_id);
CREATE INDEX model_versions_model_idx ON model_versions(model_id);
CREATE INDEX model_evaluation_metrics_model_idx ON model_evaluation_metrics(model_id);
CREATE INDEX investigation_records_mine_idx ON investigation_records(mine_id);
CREATE INDEX investigation_records_stage_idx ON investigation_records(current_stage);
CREATE INDEX investigation_evidence_links_investigation_idx ON investigation_evidence_links(investigation_id);
CREATE INDEX risk_assessment_records_investigation_idx ON risk_assessment_records(investigation_id);
CREATE INDEX research_queries_investigation_idx ON research_queries(investigation_id);
CREATE INDEX external_evidence_records_query_idx ON external_evidence_records(research_query_id);
CREATE INDEX factor_comparison_results_investigation_idx ON factor_comparison_results(investigation_id);
CREATE INDEX ai_notification_records_mine_idx ON ai_notification_records(mine_id);
CREATE INDEX ai_notification_records_status_idx ON ai_notification_records(delivery_status);
