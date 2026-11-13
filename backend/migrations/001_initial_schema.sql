-- CoalGuard.AI — initial transactional schema (PostgreSQL 16)
--
-- Design notes
--  * Frontend identifiers are stable prefixed strings (e.g. mine-01, cmp-...).
--    Text primary keys are used deliberately so the API contract does not need
--    an identifier translation layer. Every generated identifier is opaque and
--    is never trusted without an authorization scope check.
--  * Latitude/longitude are stored as validated WGS84 numeric degrees. PostGIS
--    is optional in this environment; migration 002 adds geography columns and
--    GiST indexes when the extension is available.
--  * Time-series readings and audit events are append-oriented. Audit events
--    are protected by an append-only trigger and a SHA-256 hash chain computed
--    by the API inside the same transaction.
--  * No statutory deadline or legal threshold is hard-coded here. All values
--    are data supplied by configuration or the seeded development fixture.

CREATE TABLE organizations (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE subsidiaries (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  region text NOT NULL,
  headquarters text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX subsidiaries_region_idx ON subsidiaries (region);

CREATE TABLE users (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN (
    'mine_admin','mine_manager','safety_officer','environmental_officer',
    'compliance_officer','field_inspector','contractor_manager',
    'corporate_management','regulatory_user','system_admin'
  )),
  title text NOT NULL DEFAULT '',
  development_identity boolean NOT NULL DEFAULT false,
  deactivated_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (email = lower(email)),
  CHECK (email LIKE '%_@_%._%')
);
CREATE INDEX users_role_idx ON users (role);
CREATE INDEX users_active_idx ON users (deactivated_at);

CREATE TABLE mines (
  id text PRIMARY KEY,
  subsidiary_id text NOT NULL REFERENCES subsidiaries(id),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  region text NOT NULL,
  district text NOT NULL,
  state text NOT NULL,
  operational_status text NOT NULL CHECK (operational_status IN ('operational','partial','suspended','decommissioned')),
  approved_capacity_tpa numeric(14,2) CHECK (approved_capacity_tpa IS NULL OR approved_capacity_tpa >= 0),
  commissioned_on date,
  mine_manager_id text REFERENCES users(id),
  safety_officer_id text REFERENCES users(id),
  compliance_officer_id text REFERENCES users(id),
  environmental_officer_id text REFERENCES users(id),
  contact_phone text,
  note text,
  latitude double precision CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude double precision CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  geo_source text CHECK (geo_source IS NULL OR geo_source IN ('device_gps','manual_entry','mine_registry','sensor')),
  geo_accuracy_m double precision CHECK (geo_accuracy_m IS NULL OR geo_accuracy_m >= 0),
  geo_captured_at timestamptz,
  archived_at timestamptz,
  archive_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((latitude IS NULL AND longitude IS NULL) OR (latitude IS NOT NULL AND longitude IS NOT NULL))
);
CREATE INDEX mines_subsidiary_idx ON mines (subsidiary_id);
CREATE INDEX mines_status_idx ON mines (operational_status);
CREATE INDEX mines_region_idx ON mines (region);

CREATE TABLE user_mine_scopes (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mine_id text NOT NULL REFERENCES mines(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, mine_id)
);
CREATE INDEX user_mine_scopes_mine_idx ON user_mine_scopes (mine_id);

CREATE TABLE user_subsidiary_scopes (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subsidiary_id text NOT NULL REFERENCES subsidiaries(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, subsidiary_id)
);

CREATE TABLE user_sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  user_agent text,
  ip_hash text,
  CHECK (expires_at > issued_at)
);
CREATE INDEX user_sessions_user_idx ON user_sessions (user_id);
CREATE INDEX user_sessions_expiry_idx ON user_sessions (expires_at);

CREATE TABLE idempotency_keys (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  method text NOT NULL,
  path text NOT NULL,
  request_fingerprint text NOT NULL,
  response_status integer,
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, idempotency_key)
);
CREATE INDEX idempotency_keys_created_idx ON idempotency_keys (created_at);

CREATE TABLE documents (
  id text PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('compliance_evidence','inspection_report','contract','worker_record','environment_log','production_report','other')),
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  uploaded_by text NOT NULL REFERENCES users(id),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL CHECK (status IN ('uploaded','queued','processing','processed','needs_review','failed')),
  mine_id text REFERENCES mines(id),
  storage_key text,
  sha256 text,
  ocr_engine text,
  ocr_confidence numeric(5,4) CHECK (ocr_confidence IS NULL OR (ocr_confidence >= 0 AND ocr_confidence <= 1)),
  ocr_processed_at timestamptz,
  ocr_error text,
  extracted_text text,
  detected_language text,
  ledger_network text,
  ledger_transaction_id text,
  ledger_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX documents_mine_idx ON documents (mine_id);
CREATE INDEX documents_status_idx ON documents (status);
CREATE INDEX documents_type_idx ON documents (type);
CREATE INDEX documents_search_idx ON documents USING gin (to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(extracted_text,'')));

CREATE TABLE document_fields (
  id text PRIMARY KEY,
  document_id text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  label text NOT NULL,
  value text NOT NULL,
  confidence numeric(5,4) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  page_number integer CHECK (page_number IS NULL OR page_number > 0),
  confirmed boolean NOT NULL DEFAULT false,
  corrected_value text,
  sort_order integer NOT NULL DEFAULT 0
);
CREATE INDEX document_fields_document_idx ON document_fields (document_id);

CREATE TABLE document_compliance_links (
  document_id text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  compliance_id text NOT NULL,
  linked_at timestamptz NOT NULL DEFAULT now(),
  linked_by text NOT NULL REFERENCES users(id),
  PRIMARY KEY (document_id, compliance_id)
);

CREATE TABLE document_processing_jobs (
  id text PRIMARY KEY,
  document_id text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('queued','processing','processed','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  driver text NOT NULL,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX document_jobs_document_idx ON document_processing_jobs (document_id);
CREATE INDEX document_jobs_status_idx ON document_processing_jobs (status);

CREATE TABLE document_access_log (
  id text PRIMARY KEY,
  document_id text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id),
  action text NOT NULL CHECK (action IN ('metadata_view','download','upload','field_confirm','link')),
  at timestamptz NOT NULL DEFAULT now(),
  request_id text
);
CREATE INDEX document_access_document_idx ON document_access_log (document_id);
CREATE INDEX document_access_user_idx ON document_access_log (user_id);

CREATE TABLE statutory_sources (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  title text NOT NULL,
  publisher text,
  effective_from date,
  effective_to date,
  source_url text,
  version text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
);

CREATE TABLE compliance_requirements (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL CHECK (category IN ('mine_safety','environment','production','labour','contractor','other')),
  responsible_officer_id text REFERENCES users(id),
  source_reference text,
  statutory_source_id text REFERENCES statutory_sources(id),
  effective_from date,
  due_date date,
  status text NOT NULL CHECK (status IN ('draft','pending_submission','submitted','under_review','compliant','non_compliant','overdue','awaiting_verification')),
  priority text NOT NULL CHECK (priority IN ('low','medium','high','critical')),
  submission_frequency text CHECK (submission_frequency IS NULL OR submission_frequency IN ('once','monthly','quarterly','annual','event_based')),
  last_submitted_at timestamptz,
  last_verified_at timestamptz,
  verification_status text CHECK (verification_status IS NULL OR verification_status IN ('not_required','pending','verified','rejected')),
  notes text,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX compliance_status_due_idx ON compliance_requirements (status, due_date);
CREATE INDEX compliance_category_idx ON compliance_requirements (category);
CREATE INDEX compliance_officer_idx ON compliance_requirements (responsible_officer_id);
CREATE INDEX compliance_search_idx ON compliance_requirements USING gin (to_tsvector('simple', coalesce(code,'') || ' ' || coalesce(title,'') || ' ' || coalesce(description,'')));

CREATE TABLE compliance_requirement_mines (
  compliance_id text NOT NULL REFERENCES compliance_requirements(id) ON DELETE CASCADE,
  mine_id text NOT NULL REFERENCES mines(id) ON DELETE CASCADE,
  PRIMARY KEY (compliance_id, mine_id)
);
CREATE INDEX compliance_mines_mine_idx ON compliance_requirement_mines (mine_id);

CREATE TABLE compliance_evidence (
  compliance_id text NOT NULL REFERENCES compliance_requirements(id) ON DELETE CASCADE,
  document_id text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  attached_at timestamptz NOT NULL DEFAULT now(),
  attached_by text NOT NULL REFERENCES users(id),
  PRIMARY KEY (compliance_id, document_id)
);

CREATE TABLE compliance_status_history (
  id text PRIMARY KEY,
  compliance_id text NOT NULL REFERENCES compliance_requirements(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  actor_id text REFERENCES users(id),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX compliance_history_record_idx ON compliance_status_history (compliance_id, created_at);

CREATE TABLE inspections (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  mine_id text NOT NULL REFERENCES mines(id),
  type text NOT NULL CHECK (type IN ('statutory_safety','environment','production','labour','contractor','ad_hoc')),
  inspector_id text NOT NULL REFERENCES users(id),
  scheduled_date date NOT NULL,
  actual_date date,
  started_at timestamptz,
  submitted_at timestamptz,
  completed_at timestamptz,
  status text NOT NULL CHECK (status IN ('scheduled','in_progress','submitted','under_review','completed','cancelled')),
  scope text,
  reviewer_id text REFERENCES users(id),
  latitude double precision CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude double precision CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  geo_source text CHECK (geo_source IS NULL OR geo_source IN ('device_gps','manual_entry','mine_registry','sensor')),
  geo_accuracy_m double precision CHECK (geo_accuracy_m IS NULL OR geo_accuracy_m >= 0),
  geo_captured_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((latitude IS NULL AND longitude IS NULL) OR (latitude IS NOT NULL AND longitude IS NOT NULL))
);
CREATE INDEX inspections_mine_status_idx ON inspections (mine_id, status);
CREATE INDEX inspections_scheduled_idx ON inspections (scheduled_date);
CREATE INDEX inspections_inspector_idx ON inspections (inspector_id);
CREATE INDEX inspections_search_idx ON inspections USING gin (to_tsvector('simple', coalesce(code,'') || ' ' || coalesce(scope,'')));

CREATE TABLE inspection_findings (
  id text PRIMARY KEY,
  inspection_id text NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  description text NOT NULL,
  category text NOT NULL CHECK (category IN ('mine_safety','environment','production','labour','contractor','other')),
  severity text NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  is_violation boolean NOT NULL DEFAULT false,
  raised_at timestamptz NOT NULL DEFAULT now(),
  recorded_by text REFERENCES users(id),
  sort_order integer NOT NULL DEFAULT 0
);
CREATE INDEX inspection_findings_inspection_idx ON inspection_findings (inspection_id);

CREATE TABLE inspection_finding_compliance_links (
  finding_id text NOT NULL REFERENCES inspection_findings(id) ON DELETE CASCADE,
  compliance_id text NOT NULL REFERENCES compliance_requirements(id) ON DELETE CASCADE,
  PRIMARY KEY (finding_id, compliance_id)
);

CREATE TABLE inspection_evidence (
  inspection_id text NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  document_id text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  PRIMARY KEY (inspection_id, document_id)
);

CREATE TABLE inspection_compliance_links (
  inspection_id text NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  compliance_id text NOT NULL REFERENCES compliance_requirements(id) ON DELETE CASCADE,
  PRIMARY KEY (inspection_id, compliance_id)
);

CREATE TABLE inspection_status_history (
  id text PRIMARY KEY,
  inspection_id text NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  actor_id text REFERENCES users(id),
  actor_name text NOT NULL,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inspection_history_inspection_idx ON inspection_status_history (inspection_id, created_at);

CREATE TABLE violations (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  mine_id text NOT NULL REFERENCES mines(id),
  source_type text NOT NULL CHECK (source_type IN ('inspection','compliance')),
  source_id text NOT NULL,
  source_code text NOT NULL,
  description text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  category text NOT NULL CHECK (category IN ('mine_safety','environment','production','labour','contractor','other')),
  raised_at timestamptz NOT NULL DEFAULT now(),
  raised_by text NOT NULL REFERENCES users(id),
  due_date date,
  status text NOT NULL CHECK (status IN ('open','under_remediation','awaiting_verification','closed')),
  verified_at timestamptz,
  verified_by text REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX violations_mine_status_idx ON violations (mine_id, status);
CREATE INDEX violations_source_idx ON violations (source_type, source_id);
CREATE INDEX violations_due_idx ON violations (due_date);

CREATE TABLE compliance_violations (
  compliance_id text NOT NULL REFERENCES compliance_requirements(id) ON DELETE CASCADE,
  violation_id text NOT NULL REFERENCES violations(id) ON DELETE CASCADE,
  PRIMARY KEY (compliance_id, violation_id)
);

CREATE TABLE corrective_actions (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  source_type text NOT NULL CHECK (source_type IN ('inspection','incident','violation','observation')),
  source_id text NOT NULL,
  mine_id text NOT NULL REFERENCES mines(id),
  description text NOT NULL,
  assigned_to text REFERENCES users(id),
  priority text NOT NULL CHECK (priority IN ('low','medium','high','critical')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL REFERENCES users(id),
  due_date date,
  status text NOT NULL CHECK (status IN ('proposed','assigned','in_progress','submitted_for_verification','verified','rejected','closed')),
  completion_notes text,
  submitted_at timestamptz,
  verification_status text NOT NULL DEFAULT 'not_required' CHECK (verification_status IN ('not_required','pending','verified','rejected')),
  verified_at timestamptz,
  verified_by text REFERENCES users(id),
  rejection_reason text,
  closed_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX corrective_actions_mine_status_idx ON corrective_actions (mine_id, status);
CREATE INDEX corrective_actions_due_idx ON corrective_actions (due_date);
CREATE INDEX corrective_actions_assignee_idx ON corrective_actions (assigned_to);
CREATE INDEX corrective_actions_source_idx ON corrective_actions (source_type, source_id);

CREATE TABLE corrective_action_evidence (
  corrective_action_id text NOT NULL REFERENCES corrective_actions(id) ON DELETE CASCADE,
  document_id text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  attached_at timestamptz NOT NULL DEFAULT now(),
  attached_by text NOT NULL REFERENCES users(id),
  PRIMARY KEY (corrective_action_id, document_id)
);

CREATE TABLE corrective_action_status_history (
  id text PRIMARY KEY,
  corrective_action_id text NOT NULL REFERENCES corrective_actions(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  actor_id text REFERENCES users(id),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX corrective_history_action_idx ON corrective_action_status_history (corrective_action_id, created_at);

CREATE TABLE corrective_action_comments (
  id text PRIMARY KEY,
  corrective_action_id text NOT NULL REFERENCES corrective_actions(id) ON DELETE CASCADE,
  author_id text NOT NULL REFERENCES users(id),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE violation_corrective_actions (
  violation_id text NOT NULL REFERENCES violations(id) ON DELETE CASCADE,
  corrective_action_id text NOT NULL REFERENCES corrective_actions(id) ON DELETE CASCADE,
  PRIMARY KEY (violation_id, corrective_action_id)
);

CREATE TABLE safety_records (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  type text NOT NULL CHECK (type IN ('observation','hazard','near_miss','incident')),
  mine_id text NOT NULL REFERENCES mines(id),
  title text NOT NULL,
  description text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  status text NOT NULL CHECK (status IN ('open','under_investigation','action_assigned','resolved','closed')),
  reported_by text NOT NULL REFERENCES users(id),
  reported_at timestamptz NOT NULL DEFAULT now(),
  latitude double precision CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude double precision CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  geo_source text CHECK (geo_source IS NULL OR geo_source IN ('device_gps','manual_entry','mine_registry','sensor')),
  geo_accuracy_m double precision CHECK (geo_accuracy_m IS NULL OR geo_accuracy_m >= 0),
  geo_captured_at timestamptz,
  location_description text,
  assigned_to text REFERENCES users(id),
  investigation_opened_at timestamptz,
  investigation_closed_at timestamptz,
  related_inspection_id text REFERENCES inspections(id),
  preventive_actions text[],
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((latitude IS NULL AND longitude IS NULL) OR (latitude IS NOT NULL AND longitude IS NOT NULL))
);
CREATE INDEX safety_records_mine_status_idx ON safety_records (mine_id, status);
CREATE INDEX safety_records_type_idx ON safety_records (type);
CREATE INDEX safety_records_search_idx ON safety_records USING gin (to_tsvector('simple', coalesce(code,'') || ' ' || coalesce(title,'') || ' ' || coalesce(description,'')));

CREATE TABLE safety_record_documents (
  safety_record_id text NOT NULL REFERENCES safety_records(id) ON DELETE CASCADE,
  document_id text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  PRIMARY KEY (safety_record_id, document_id)
);

CREATE TABLE safety_record_corrective_actions (
  safety_record_id text NOT NULL REFERENCES safety_records(id) ON DELETE CASCADE,
  corrective_action_id text NOT NULL REFERENCES corrective_actions(id) ON DELETE CASCADE,
  PRIMARY KEY (safety_record_id, corrective_action_id)
);

CREATE TABLE safety_status_history (
  id text PRIMARY KEY,
  safety_record_id text NOT NULL REFERENCES safety_records(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  actor_id text REFERENCES users(id),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE incidents (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  mine_id text NOT NULL REFERENCES mines(id),
  title text NOT NULL,
  description text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  occurred_at timestamptz NOT NULL,
  reported_at timestamptz NOT NULL,
  reported_by text NOT NULL REFERENCES users(id),
  status text NOT NULL CHECK (status IN ('open','under_investigation','action_assigned','resolved','closed')),
  latitude double precision CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude double precision CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  geo_source text CHECK (geo_source IS NULL OR geo_source IN ('device_gps','manual_entry','mine_registry','sensor')),
  geo_accuracy_m double precision CHECK (geo_accuracy_m IS NULL OR geo_accuracy_m >= 0),
  geo_captured_at timestamptz,
  location_description text,
  injuries_reported integer NOT NULL DEFAULT 0 CHECK (injuries_reported >= 0),
  downtime_hours numeric(10,2) CHECK (downtime_hours IS NULL OR downtime_hours >= 0),
  assigned_to text REFERENCES users(id),
  related_inspection_id text REFERENCES inspections(id),
  investigation_summary text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (reported_at >= occurred_at),
  CHECK ((latitude IS NULL AND longitude IS NULL) OR (latitude IS NOT NULL AND longitude IS NOT NULL))
);
CREATE INDEX incidents_mine_status_idx ON incidents (mine_id, status);
CREATE INDEX incidents_occurred_idx ON incidents (occurred_at DESC);
CREATE INDEX incidents_search_idx ON incidents USING gin (to_tsvector('simple', coalesce(code,'') || ' ' || coalesce(title,'') || ' ' || coalesce(description,'')));

CREATE TABLE incident_documents (
  incident_id text NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  document_id text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  PRIMARY KEY (incident_id, document_id)
);

CREATE TABLE incident_corrective_actions (
  incident_id text NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  corrective_action_id text NOT NULL REFERENCES corrective_actions(id) ON DELETE CASCADE,
  PRIMARY KEY (incident_id, corrective_action_id)
);

CREATE TABLE incident_status_history (
  id text PRIMARY KEY,
  incident_id text NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  actor_id text REFERENCES users(id),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX incident_history_incident_idx ON incident_status_history (incident_id, created_at);

CREATE TABLE environmental_thresholds (
  id text PRIMARY KEY,
  indicator text NOT NULL CHECK (indicator IN ('air_quality_pm10','air_quality_pm25','dust_deposition','water_quality_ph','water_quality_tds','noise_level','stack_emission','waste_generation')),
  unit text NOT NULL,
  limit_value numeric(14,4),
  comparison text NOT NULL CHECK (comparison IN ('above','below')),
  label text NOT NULL,
  configured_by text REFERENCES users(id),
  provenance text NOT NULL,
  effective_from date,
  effective_to date,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (limit_value IS NULL OR limit_value >= 0),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
);
CREATE INDEX environmental_thresholds_indicator_idx ON environmental_thresholds (indicator);

CREATE TABLE environmental_measurements (
  id text PRIMARY KEY,
  mine_id text NOT NULL REFERENCES mines(id),
  indicator text NOT NULL CHECK (indicator IN ('air_quality_pm10','air_quality_pm25','dust_deposition','water_quality_ph','water_quality_tds','noise_level','stack_emission','waste_generation')),
  value numeric(14,4) NOT NULL,
  unit text NOT NULL,
  measured_at timestamptz NOT NULL,
  latitude double precision CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude double precision CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  geo_source text CHECK (geo_source IS NULL OR geo_source IN ('device_gps','manual_entry','mine_registry','sensor')),
  geo_accuracy_m double precision CHECK (geo_accuracy_m IS NULL OR geo_accuracy_m >= 0),
  geo_captured_at timestamptz,
  location_description text,
  source text NOT NULL CHECK (source IN ('sensor','manual','imported','sample','ai_estimate')),
  threshold_id text REFERENCES environmental_thresholds(id),
  threshold_version integer,
  status text NOT NULL CHECK (status IN ('within_limit','exceeds_limit','unknown')),
  sample_id text,
  inspection_id text REFERENCES inspections(id),
  stale boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES users(id),
  CHECK ((latitude IS NULL AND longitude IS NULL) OR (latitude IS NOT NULL AND longitude IS NOT NULL))
);
CREATE INDEX environmental_measurements_mine_time_idx ON environmental_measurements (mine_id, indicator, measured_at DESC);
CREATE INDEX environmental_measurements_status_idx ON environmental_measurements (status);

CREATE TABLE environmental_measurement_documents (
  measurement_id text NOT NULL REFERENCES environmental_measurements(id) ON DELETE CASCADE,
  document_id text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  PRIMARY KEY (measurement_id, document_id)
);

CREATE TABLE environmental_alerts (
  id text PRIMARY KEY,
  measurement_id text NOT NULL REFERENCES environmental_measurements(id) ON DELETE CASCADE,
  mine_id text NOT NULL REFERENCES mines(id),
  indicator text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  detail text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by text REFERENCES users(id),
  review_note text
);
CREATE INDEX environmental_alerts_mine_idx ON environmental_alerts (mine_id, created_at DESC);

CREATE TABLE production_records (
  id text PRIMARY KEY,
  mine_id text NOT NULL REFERENCES mines(id),
  date date NOT NULL,
  shift text NOT NULL CHECK (shift IN ('day','swing','night')),
  production_tonnes numeric(14,2) NOT NULL CHECK (production_tonnes >= 0),
  target_tonnes numeric(14,2) CHECK (target_tonnes IS NULL OR target_tonnes >= 0),
  value_kind text NOT NULL CHECK (value_kind IN ('reported','approved','estimated')),
  estimate_reason text,
  shift_supervisor_id text REFERENCES users(id),
  notes text,
  approved_by text REFERENCES users(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mine_id, date, shift),
  CHECK (value_kind <> 'estimated' OR estimate_reason IS NOT NULL)
);
CREATE INDEX production_records_mine_date_idx ON production_records (mine_id, date DESC);
CREATE INDEX production_records_date_idx ON production_records (date DESC);

CREATE TABLE production_record_documents (
  production_record_id text NOT NULL REFERENCES production_records(id) ON DELETE CASCADE,
  document_id text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  PRIMARY KEY (production_record_id, document_id)
);

CREATE TABLE production_anomalies (
  id text PRIMARY KEY,
  mine_id text NOT NULL REFERENCES mines(id),
  record_id text NOT NULL REFERENCES production_records(id) ON DELETE CASCADE,
  date date NOT NULL,
  metric text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('above','below')),
  z_score numeric(8,3),
  severity text NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  explanation text NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  detector text NOT NULL,
  review_status text NOT NULL DEFAULT 'unreviewed' CHECK (review_status IN ('unreviewed','acknowledged','dismissed','confirmed')),
  UNIQUE (record_id, metric)
);
CREATE INDEX production_anomalies_mine_idx ON production_anomalies (mine_id, detected_at DESC);

CREATE TABLE contractors (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('drilling','blasting','hauling','maintenance','civil_works','security','transport')),
  contact_person text NOT NULL,
  contact_email text NOT NULL,
  contact_phone text NOT NULL,
  registered_address text NOT NULL,
  compliance_status text NOT NULL CHECK (compliance_status IN ('compliant','non_compliant','under_review','unassessed')),
  registered_on date NOT NULL,
  pan_number text,
  gst_number text,
  archived_at timestamptz,
  archive_reason text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contractors_status_idx ON contractors (compliance_status);
CREATE INDEX contractors_type_idx ON contractors (type);
CREATE INDEX contractors_search_idx ON contractors USING gin (to_tsvector('simple', coalesce(code,'') || ' ' || coalesce(name,'') || ' ' || coalesce(registered_address,'')));

CREATE TABLE contractor_mines (
  contractor_id text NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
  mine_id text NOT NULL REFERENCES mines(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contractor_id, mine_id)
);

CREATE TABLE contractor_documents (
  contractor_id text NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
  document_id text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  required boolean NOT NULL DEFAULT false,
  verified boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  verified_by text REFERENCES users(id),
  PRIMARY KEY (contractor_id, document_id)
);

CREATE TABLE contracts (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  contractor_id text NOT NULL REFERENCES contractors(id),
  mine_id text NOT NULL REFERENCES mines(id),
  title text NOT NULL,
  scope text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  value_inr_lakhs numeric(14,2) CHECK (value_inr_lakhs IS NULL OR value_inr_lakhs >= 0),
  status text NOT NULL CHECK (status IN ('draft','active','expiring','expired','terminated')),
  approved_by text REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
CREATE INDEX contracts_contractor_idx ON contracts (contractor_id);
CREATE INDEX contracts_mine_idx ON contracts (mine_id);
CREATE INDEX contracts_end_date_idx ON contracts (end_date);

CREATE TABLE contract_documents (
  contract_id text NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  document_id text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  PRIMARY KEY (contract_id, document_id)
);

CREATE TABLE contractor_safety_records (
  contractor_id text NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
  safety_record_id text NOT NULL REFERENCES safety_records(id) ON DELETE CASCADE,
  PRIMARY KEY (contractor_id, safety_record_id)
);

CREATE TABLE contractor_inspections (
  contractor_id text NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
  inspection_id text NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  PRIMARY KEY (contractor_id, inspection_id)
);

CREATE TABLE contractor_corrective_actions (
  contractor_id text NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
  corrective_action_id text NOT NULL REFERENCES corrective_actions(id) ON DELETE CASCADE,
  PRIMARY KEY (contractor_id, corrective_action_id)
);

CREATE TABLE workforce_members (
  id text PRIMARY KEY,
  worker_ref text NOT NULL UNIQUE,
  display_name text NOT NULL,
  mine_id text NOT NULL REFERENCES mines(id),
  contractor_id text REFERENCES contractors(id),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX workforce_members_mine_idx ON workforce_members (mine_id);

CREATE TABLE attendance_records (
  id text PRIMARY KEY,
  worker_id text NOT NULL REFERENCES workforce_members(id),
  mine_id text NOT NULL REFERENCES mines(id),
  contractor_id text REFERENCES contractors(id),
  date date NOT NULL,
  shift text NOT NULL CHECK (shift IN ('day','swing','night')),
  status text NOT NULL CHECK (status IN ('present','absent','leave','half_day','not_recorded')),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by text REFERENCES users(id),
  UNIQUE (worker_id, date, shift)
);
CREATE INDEX attendance_records_mine_date_idx ON attendance_records (mine_id, date DESC);
CREATE INDEX attendance_records_status_idx ON attendance_records (status);

CREATE TABLE attendance_documents (
  attendance_id text NOT NULL REFERENCES attendance_records(id) ON DELETE CASCADE,
  document_id text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  PRIMARY KEY (attendance_id, document_id)
);

CREATE TABLE attendance_corrections (
  id text PRIMARY KEY,
  attendance_id text NOT NULL REFERENCES attendance_records(id) ON DELETE CASCADE,
  at timestamptz NOT NULL DEFAULT now(),
  original_status text NOT NULL CHECK (original_status IN ('present','absent','leave','half_day','not_recorded')),
  corrected_status text NOT NULL CHECK (corrected_status IN ('present','absent','leave','half_day','not_recorded')),
  reason text NOT NULL,
  requested_by text NOT NULL REFERENCES users(id),
  approved_by text REFERENCES users(id),
  approved_at timestamptz,
  status text NOT NULL CHECK (status IN ('pending','approved','rejected')),
  decision_reason text,
  CHECK (corrected_status <> original_status)
);
CREATE INDEX attendance_corrections_attendance_idx ON attendance_corrections (attendance_id);
CREATE INDEX attendance_corrections_status_idx ON attendance_corrections (status);

CREATE TABLE ai_insights (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  title text NOT NULL,
  category text NOT NULL CHECK (category IN ('compliance_risk','recurring_violations','safety_repeat_offences','environmental_anomaly','production_anomaly','contractor_risk','overdue_pattern')),
  mine_id text REFERENCES mines(id),
  subsidiary_id text REFERENCES subsidiaries(id),
  risk_level text NOT NULL CHECK (risk_level IN ('low','moderate','elevated','high','critical')),
  model_source text NOT NULL,
  generated_at timestamptz NOT NULL,
  data_freshness_hours integer CHECK (data_freshness_hours IS NULL OR data_freshness_hours >= 0),
  confidence numeric(5,4) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  explanation text NOT NULL,
  recommendation text,
  review_status text NOT NULL CHECK (review_status IN ('unreviewed','acknowledged','investigating','dismissed','escalated')),
  reviewed_by text REFERENCES users(id),
  reviewed_at timestamptz,
  review_note text,
  is_prediction boolean NOT NULL DEFAULT true CHECK (is_prediction = true),
  limitations text[],
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_insights_mine_idx ON ai_insights (mine_id);
CREATE INDEX ai_insights_risk_idx ON ai_insights (risk_level, review_status);

CREATE TABLE ai_insight_evidence (
  insight_id text NOT NULL REFERENCES ai_insights(id) ON DELETE CASCADE,
  label text NOT NULL,
  detail text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('observed_fact','statistical_indicator','prediction','recommendation')),
  weight numeric(8,4),
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (insight_id, label)
);

CREATE TABLE ai_insight_related_entities (
  insight_id text NOT NULL REFERENCES ai_insights(id) ON DELETE CASCADE,
  entity_id text NOT NULL,
  PRIMARY KEY (insight_id, entity_id)
);

CREATE TABLE ai_insight_reviews (
  id text PRIMARY KEY,
  insight_id text NOT NULL REFERENCES ai_insights(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('unreviewed','acknowledged','investigating','dismissed','escalated')),
  note text,
  actor_id text NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workflows (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL,
  trigger text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL REFERENCES users(id),
  version integer NOT NULL DEFAULT 1
);

CREATE TABLE workflow_stages (
  id text PRIMARY KEY,
  workflow_id text NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  stage_order integer NOT NULL CHECK (stage_order >= 0),
  label text NOT NULL,
  role text NOT NULL CHECK (role IN ('mine_admin','mine_manager','safety_officer','environmental_officer','compliance_officer','field_inspector','contractor_manager','corporate_management','regulatory_user','system_admin')),
  after_hours integer NOT NULL CHECK (after_hours >= 0),
  notify_channels text[] NOT NULL DEFAULT '{}',
  UNIQUE (workflow_id, stage_order)
);

CREATE TABLE notifications (
  id text PRIMARY KEY,
  type text NOT NULL CHECK (type IN ('compliance_deadline','compliance_overdue','inspection_assigned','review_request','corrective_action_reminder','contract_expiring','environmental_alert','safety_observation','approval_request','escalation','system')),
  severity text NOT NULL CHECK (severity IN ('info','success','warning','critical')),
  title text NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  recipient_id text NOT NULL REFERENCES users(id),
  related_type text,
  related_id text,
  related_label text,
  related_href text,
  action_label text,
  action_href text,
  dedupe_key text UNIQUE,
  created_by text REFERENCES users(id)
);
CREATE INDEX notifications_recipient_idx ON notifications (recipient_id, created_at DESC);
CREATE INDEX notifications_unread_idx ON notifications (recipient_id, read);

CREATE TABLE notification_deliveries (
  id text PRIMARY KEY,
  notification_id text NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('in_app','email','sms','whatsapp','push')),
  status text NOT NULL CHECK (status IN ('queued','sent','delivered','failed','not_configured')),
  at timestamptz,
  error text,
  provider_reference text,
  UNIQUE (notification_id, channel)
);

CREATE TABLE notification_preferences (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email_enabled boolean NOT NULL DEFAULT false,
  sms_enabled boolean NOT NULL DEFAULT false,
  whatsapp_enabled boolean NOT NULL DEFAULT false,
  push_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notification_escalations (
  id text PRIMARY KEY,
  workflow_id text NOT NULL REFERENCES workflows(id),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  stage_id text NOT NULL REFERENCES workflow_stages(id),
  recipient_id text NOT NULL REFERENCES users(id),
  notification_id text REFERENCES notifications(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, entity_type, entity_id, stage_id)
);

CREATE TABLE report_definitions (
  category text PRIMARY KEY CHECK (category IN ('statutory_compliance','inspection_summary','safety_observations','incidents','corrective_actions','environmental_monitoring','production','contractor_compliance','workforce','audit_history')),
  name text NOT NULL,
  description text NOT NULL,
  formats text[] NOT NULL,
  group_by text[] NOT NULL
);

CREATE TABLE report_definition_columns (
  category text NOT NULL REFERENCES report_definitions(category) ON DELETE CASCADE,
  column_key text NOT NULL,
  label text NOT NULL,
  sort_order integer NOT NULL,
  PRIMARY KEY (category, column_key)
);

CREATE TABLE report_jobs (
  id text PRIMARY KEY,
  category text NOT NULL REFERENCES report_definitions(category),
  title text NOT NULL,
  date_from date NOT NULL,
  date_to date NOT NULL,
  format text NOT NULL CHECK (format IN ('csv','pdf','xlsx')),
  group_by text CHECK (group_by IS NULL OR group_by IN ('mine','subsidiary','category','month','none')),
  requested_by text NOT NULL REFERENCES users(id),
  status text NOT NULL CHECK (status IN ('queued','processing','ready','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  file_name text,
  row_count integer,
  error text,
  idempotency_key text,
  CHECK (date_to >= date_from)
);
CREATE INDEX report_jobs_requester_idx ON report_jobs (requested_by, created_at DESC);

CREATE TABLE report_job_mines (
  report_job_id text NOT NULL REFERENCES report_jobs(id) ON DELETE CASCADE,
  mine_id text NOT NULL REFERENCES mines(id),
  PRIMARY KEY (report_job_id, mine_id)
);

CREATE TABLE report_job_subsidiaries (
  report_job_id text NOT NULL REFERENCES report_jobs(id) ON DELETE CASCADE,
  subsidiary_id text NOT NULL REFERENCES subsidiaries(id),
  PRIMARY KEY (report_job_id, subsidiary_id)
);

CREATE TABLE report_job_status_filters (
  report_job_id text NOT NULL REFERENCES report_jobs(id) ON DELETE CASCADE,
  status text NOT NULL,
  PRIMARY KEY (report_job_id, status)
);

CREATE TABLE report_artifacts (
  id text PRIMARY KEY,
  report_job_id text NOT NULL REFERENCES report_jobs(id) ON DELETE CASCADE,
  storage_key text NOT NULL,
  mime_type text NOT NULL,
  sha256 text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX report_artifacts_job_idx ON report_artifacts (report_job_id);

CREATE TABLE audit_events (
  id text PRIMARY KEY,
  seq bigserial NOT NULL UNIQUE,
  timestamp timestamptz NOT NULL DEFAULT now(),
  actor_id text NOT NULL,
  actor_name text NOT NULL,
  actor_role text NOT NULL,
  action text NOT NULL CHECK (action IN ('create','update','status_change','assign','verify','submit','archive','delete','export','login','logout')),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  entity_label text,
  previous_value jsonb,
  updated_value jsonb,
  reason text,
  workflow text,
  verification_method text,
  verified_at timestamptz,
  source text NOT NULL DEFAULT 'platform_log' CHECK (source IN ('platform_log','blockchain_ledger')),
  ledger_network text,
  ledger_transaction_id text,
  request_id text,
  ip_hash text,
  prev_hash text,
  integrity_hash text NOT NULL
);
CREATE INDEX audit_events_entity_idx ON audit_events (entity_type, entity_id, timestamp DESC);
CREATE INDEX audit_events_actor_idx ON audit_events (actor_id, timestamp DESC);
CREATE INDEX audit_events_time_idx ON audit_events (timestamp DESC);
CREATE INDEX audit_events_action_idx ON audit_events (action);

CREATE FUNCTION audit_events_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only; % is not permitted', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_events_no_update
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_append_only();

CREATE TRIGGER audit_events_no_truncate
  BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION audit_events_append_only();

CREATE TABLE integration_connections (
  id text PRIMARY KEY,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('identity','ocr','map','analytics','messaging','ledger','api')),
  status text NOT NULL CHECK (status IN ('healthy','degraded','unavailable','unknown')),
  detail text NOT NULL,
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  verified boolean NOT NULL DEFAULT false,
  config_ref text
);

CREATE TABLE system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text REFERENCES users(id)
);

CREATE TABLE outbox_events (
  id text PRIMARY KEY,
  event_type text NOT NULL,
  event_version integer NOT NULL DEFAULT 1,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  last_error text
);
CREATE INDEX outbox_events_pending_idx ON outbox_events (published_at, created_at);

CREATE TABLE job_runs (
  id text PRIMARY KEY,
  job_name text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL CHECK (status IN ('running','succeeded','failed')),
  detail jsonb,
  error text
);
CREATE INDEX job_runs_name_idx ON job_runs (job_name, started_at DESC);

CREATE TABLE data_quality_issues (
  id text PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  issue_type text NOT NULL,
  detail text NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by text REFERENCES users(id)
);

COMMENT ON TABLE audit_events IS 'Append-only governance audit trail. Integrity hashes form a SHA-256 chain; this is not a blockchain proof.';
COMMENT ON TABLE environmental_measurements IS 'Authoritative environmental readings with unit, provenance, threshold version and stale flag.';
COMMENT ON TABLE documents IS 'Document metadata. File bytes live outside PostgreSQL under a private storage root.';
COMMENT ON TABLE system_settings IS 'Small administrative configuration store. Not a substitute for relational domain data.';
