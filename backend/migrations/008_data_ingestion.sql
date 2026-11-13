-- Data ingestion infrastructure for official Indian coal-sector sources
-- Supports REST APIs, CSV, Excel, JSON, XML, HTML tables, text-based PDFs, scanned PDFs (OCR)

-- Official data sources registry
CREATE TABLE data_sources (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  source_type text NOT NULL CHECK (source_type IN ('government_api','downloadable_dataset','machine_readable_report','pdf_document','official_website','other')),
  publisher text NOT NULL,
  jurisdiction text NOT NULL DEFAULT 'India',
  base_url text,
  category text NOT NULL CHECK (category IN ('mine_identification','production','safety_compliance','environmental','workforce_contractor','statutory_regulatory','other')),
  region_coverage text[] DEFAULT '{}',
  granularity text CHECK (granularity IN ('mine','subsidiary','company','state','national','other')),
  license text,
  terms_url text,
  automated_retrieval boolean NOT NULL DEFAULT false,
  rate_limit_requests_per_minute integer,
  credentials_required boolean NOT NULL DEFAULT false,
  credential_ref text,
  active boolean NOT NULL DEFAULT true,
  last_successful_retrieval timestamptz,
  last_attempted_retrieval timestamptz,
  next_scheduled_retrieval timestamptz,
  refresh_interval_minutes integer,
  failure_count integer NOT NULL DEFAULT 0,
  consecutive_failures integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES users(id),
  updated_by text REFERENCES users(id)
);
CREATE INDEX data_sources_category_idx ON data_sources (category);
CREATE INDEX data_sources_active_idx ON data_sources (active);
CREATE INDEX data_sources_next_retrieval_idx ON data_sources (next_scheduled_retrieval);

-- Dataset catalog (what each source provides)
CREATE TABLE dataset_catalog (
  id text PRIMARY KEY,
  source_id text NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
  dataset_name text NOT NULL,
  dataset_title text,
  description text,
  format text NOT NULL CHECK (format IN ('rest_api','csv','excel','json','xml','html_table','text_pdf','scanned_pdf','other')),
  reporting_period_start date,
  reporting_period_end date,
  publication_date date,
  download_url text,
  api_endpoint text,
  api_method text DEFAULT 'GET',
  api_params jsonb DEFAULT '{}',
  api_headers jsonb DEFAULT '{}',
  field_mappings jsonb DEFAULT '{}',
  unit_normalizations jsonb DEFAULT '{}',
  record_count integer,
  size_bytes bigint,
  checksum_sha256 text,
  last_downloaded_at timestamptz,
  download_status text CHECK (download_status IN ('pending','success','failed','partial')),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dataset_catalog_source_idx ON dataset_catalog (source_id);
CREATE INDEX dataset_catalog_format_idx ON dataset_catalog (format);
CREATE INDEX dataset_catalog_download_status_idx ON dataset_catalog (download_status);

-- Ingestion jobs (durable, retryable ingestion operations)
CREATE TABLE ingestion_jobs (
  id text PRIMARY KEY,
  dataset_id text NOT NULL REFERENCES dataset_catalog(id) ON DELETE CASCADE,
  source_id text NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
  job_type text NOT NULL CHECK (job_type IN ('initial_load','incremental','full_reconciliation','retry')),
  status text NOT NULL CHECK (status IN ('queued','running','completed','failed','cancelled')),
  started_at timestamptz,
  completed_at timestamptz,
  records_discovered integer NOT NULL DEFAULT 0,
  records_validated integer NOT NULL DEFAULT 0,
  records_inserted integer NOT NULL DEFAULT 0,
  records_updated integer NOT NULL DEFAULT 0,
  records_skipped integer NOT NULL DEFAULT 0,
  records_failed integer NOT NULL DEFAULT 0,
  error_message text,
  error_details jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES users(id)
);
CREATE INDEX ingestion_jobs_dataset_idx ON ingestion_jobs (dataset_id);
CREATE INDEX ingestion_jobs_source_idx ON ingestion_jobs (source_id);
CREATE INDEX ingestion_jobs_status_idx ON ingestion_jobs (status);
CREATE INDEX ingestion_jobs_created_idx ON ingestion_jobs (created_at DESC);

-- Ingestion runs (individual execution attempts with retry history)
CREATE TABLE ingestion_runs (
  id text PRIMARY KEY,
  job_id text NOT NULL REFERENCES ingestion_jobs(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL DEFAULT 1,
  status text NOT NULL CHECK (status IN ('running','completed','failed','timeout')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms integer,
  records_processed integer NOT NULL DEFAULT 0,
  records_successful integer NOT NULL DEFAULT 0,
  records_failed integer NOT NULL DEFAULT 0,
  error_message text,
  retry_after_seconds integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ingestion_runs_job_idx ON ingestion_runs (job_id);
CREATE INDEX ingestion_runs_status_idx ON ingestion_runs (status);

-- Source documents (raw downloaded files)
CREATE TABLE source_documents (
  id text PRIMARY KEY,
  dataset_id text NOT NULL REFERENCES dataset_catalog(id) ON DELETE CASCADE,
  ingestion_run_id text REFERENCES ingestion_runs(id) ON DELETE SET NULL,
  original_filename text NOT NULL,
  storage_key text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  checksum_sha256 text NOT NULL,
  source_url text,
  download_timestamp timestamptz NOT NULL DEFAULT now(),
  extraction_status text NOT NULL CHECK (extraction_status IN ('pending','completed','failed','ocr_required')),
  extraction_error text,
  extracted_text text,
  extracted_tables jsonb DEFAULT '[]',
  page_count integer,
  language text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX source_documents_dataset_idx ON source_documents (dataset_id);
CREATE INDEX source_documents_checksum_idx ON source_documents (checksum_sha256);
CREATE INDEX source_documents_extraction_status_idx ON source_documents (extraction_status);

-- Document versions (immutable history)
CREATE TABLE document_versions (
  id text PRIMARY KEY,
  document_id text NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  checksum_sha256 text NOT NULL,
  storage_key text NOT NULL,
  size_bytes bigint NOT NULL,
  change_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version_number)
);
CREATE INDEX document_versions_document_idx ON document_versions (document_id);

-- Mine registry (authoritative mine locations from official sources)
CREATE TABLE mine_registry (
  id text PRIMARY KEY,
  official_mine_id text NOT NULL,
  mine_name text NOT NULL,
  operating_company text NOT NULL,
  subsidiary text,
  mine_type text CHECK (mine_type IN ('underground','opencast','mixed','other')),
  district text NOT NULL,
  state text NOT NULL,
  region text NOT NULL,
  latitude double precision CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude double precision CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  coordinate_source text CHECK (coordinate_source IS NULL OR coordinate_source IN ('surveyed','registry','approximate','device_gps')),
  boundary_wkt text,
  boundary_accuracy_m double precision,
  lease_area_hectares double precision CHECK (lease_area_hectares IS NULL OR lease_area_hectares >= 0),
  commissioned_on date,
  operational_status text CHECK (operational_status IN ('operational','partial','suspended','decommissioned')),
  approved_capacity_tpa double precision CHECK (approved_capacity_tpa IS NULL OR approved_capacity_tpa >= 0),
  statutory_source_id text REFERENCES statutory_sources(id),
  provenance text NOT NULL,
  verification_status text NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified','verified','disputed')),
  verification_date date,
  verified_by text REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((latitude IS NULL AND longitude IS NULL) OR (latitude IS NOT NULL AND longitude IS NOT NULL))
);
CREATE INDEX mine_registry_official_id_idx ON mine_registry (official_mine_id);
CREATE INDEX mine_registry_state_idx ON mine_registry (state);
CREATE INDEX mine_registry_district_idx ON mine_registry (district);
CREATE INDEX mine_registry_verification_idx ON mine_registry (verification_status);

-- Mine identifier mappings (cross-reference between sources and internal IDs)
CREATE TABLE mine_identifiers (
  id text PRIMARY KEY,
  mine_registry_id text NOT NULL REFERENCES mine_registry(id) ON DELETE CASCADE,
  internal_mine_id text REFERENCES mines(id),
  source_system text NOT NULL,
  source_identifier text NOT NULL,
  match_confidence numeric(5,4) CHECK (match_confidence IS NULL OR (match_confidence >= 0 AND match_confidence <= 1)),
  match_method text NOT NULL CHECK (match_method IN ('exact','fuzzy','manual','geographic')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_system, source_identifier)
);
CREATE INDEX mine_identifiers_internal_idx ON mine_identifiers (internal_mine_id);
CREATE INDEX mine_identifiers_source_idx ON mine_identifiers (source_system, source_identifier);

-- Production observations (from official sources)
CREATE TABLE production_observations (
  id text PRIMARY KEY,
  mine_registry_id text NOT NULL REFERENCES mine_registry(id),
  source_document_id text REFERENCES source_documents(id),
  reporting_period_start date NOT NULL,
  reporting_period_end date NOT NULL,
  production_tonnes double precision NOT NULL CHECK (production_tonnes >= 0),
  target_tonnes double precision CHECK (target_tonnes IS NULL OR target_tonnes >= 0),
  dispatch_tonnes double precision CHECK (dispatch_tonnes IS NULL OR dispatch_tonnes >= 0),
  unit text NOT NULL DEFAULT 'tonnes',
  value_kind text NOT NULL CHECK (value_kind IN ('reported','approved','estimated')),
  provenance text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX production_observations_mine_idx ON production_observations (mine_registry_id, reporting_period_end DESC);

-- Safety incidents (from official sources)
CREATE TABLE safety_incidents (
  id text PRIMARY KEY,
  mine_registry_id text NOT NULL REFERENCES mine_registry(id),
  source_document_id text REFERENCES source_documents(id),
  incident_date date NOT NULL,
  incident_type text NOT NULL,
  description text NOT NULL,
  severity text CHECK (severity IN ('low','medium','high','critical')),
  injuries_reported integer DEFAULT 0 CHECK (injuries_reported >= 0),
  fatalities_reported integer DEFAULT 0 CHECK (fatalities_reported >= 0),
  downtime_hours double precision CHECK (downtime_hours IS NULL OR downtime_hours >= 0),
  location_description text,
  provenance text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX safety_incidents_mine_idx ON safety_incidents (mine_registry_id, incident_date DESC);

-- Compliance requirements (from official statutory sources)
CREATE TABLE compliance_requirements_ext (
  id text PRIMARY KEY,
  mine_registry_id text REFERENCES mine_registry(id),
  source_document_id text REFERENCES source_documents(id),
  statutory_source_id text REFERENCES statutory_sources(id),
  requirement_code text NOT NULL,
  requirement_title text NOT NULL,
  requirement_description text,
  category text NOT NULL CHECK (category IN ('mine_safety','environment','production','labour','contractor','other')),
  effective_from date,
  effective_to date,
  due_date date,
  status text NOT NULL CHECK (status IN ('draft','pending_submission','submitted','under_review','compliant','non_compliant','overdue','awaiting_verification')),
  priority text NOT NULL CHECK (priority IN ('low','medium','high','critical')),
  provenance text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX compliance_requirements_ext_mine_idx ON compliance_requirements_ext (mine_registry_id);
CREATE INDEX compliance_requirements_ext_statutory_idx ON compliance_requirements_ext (statutory_source_id);

-- Environmental observations (from official sources)
CREATE TABLE environmental_observations_ext (
  id text PRIMARY KEY,
  mine_registry_id text NOT NULL REFERENCES mine_registry(id),
  source_document_id text REFERENCES source_documents(id),
  indicator text NOT NULL CHECK (indicator IN ('air_quality_pm10','air_quality_pm25','dust_deposition','water_quality_ph','water_quality_tds','noise_level','stack_emission','waste_generation')),
  value double precision NOT NULL,
  unit text NOT NULL,
  measured_at date NOT NULL,
  location_description text,
  threshold_limit double precision,
  exceedance boolean NOT NULL DEFAULT false,
  provenance text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX environmental_observations_ext_mine_idx ON environmental_observations_ext (mine_registry_id, measured_at DESC);

-- Source citations (provenance for every data point)
CREATE TABLE source_citations (
  id text PRIMARY KEY,
  entity_type text NOT NULL CHECK (entity_type IN ('mine','production_observation','safety_incident','compliance_requirement','environmental_observation','prediction','anomaly','risk_assessment')),
  entity_id text NOT NULL,
  source_document_id text REFERENCES source_documents(id),
  source_url text,
  publication_date date,
  retrieval_timestamp timestamptz NOT NULL DEFAULT now(),
  relevant_passage text,
  reliability text NOT NULL CHECK (reliability IN ('high','medium','low','unverified')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX source_citations_entity_idx ON source_citations (entity_type, entity_id);

-- Data quality issues (detected during ingestion)
CREATE TABLE data_quality_issues_ext (
  id text PRIMARY KEY,
  source_document_id text REFERENCES source_documents(id),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  issue_type text NOT NULL CHECK (issue_type IN ('missing_value','invalid_coordinate','duplicate_record','conflicting_measurement','unknown_mine_identifier','schema_change','stale_data','ocr_uncertainty','unit_mismatch','other')),
  severity text NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  description text NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by text REFERENCES users(id),
  resolution text
);
CREATE INDEX data_quality_issues_ext_entity_idx ON data_quality_issues_ext (entity_type, entity_id);
CREATE INDEX data_quality_issues_ext_unresolved_idx ON data_quality_issues_ext (resolved_at IS NULL);

-- Data freshness tracking
CREATE TABLE data_freshness (
  id text PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  last_retrieved_at timestamptz,
  last_successful_sync timestamptz,
  next_sync_due timestamptz,
  refresh_interval_minutes integer,
  is_stale boolean NOT NULL DEFAULT false,
  staleness_reason text,
  source_id text REFERENCES data_sources(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id)
);
CREATE INDEX data_freshness_stale_idx ON data_freshness (is_stale);
CREATE INDEX data_freshness_next_sync_idx ON data_freshness (next_sync_due);

-- Indexes for performance
CREATE INDEX source_documents_download_timestamp_idx ON source_documents (download_timestamp DESC);
CREATE INDEX production_observations_period_idx ON production_observations (reporting_period_start, reporting_period_end);
CREATE INDEX safety_incidents_date_idx ON safety_incidents (incident_date);
