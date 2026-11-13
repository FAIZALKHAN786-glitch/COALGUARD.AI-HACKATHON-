-- Evidence-based workflows and anti-pencil-whipping controls
-- Inspection checklists
CREATE TABLE inspection_checklists (
  id text PRIMARY KEY,
  inspection_type text NOT NULL CHECK (inspection_type IN ('statutory_safety','environment','production','labour','contractor','ad_hoc')),
  mine_id text REFERENCES mines(id),
  version integer NOT NULL DEFAULT 1,
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE inspection_checklist_items (
  id text PRIMARY KEY,
  checklist_id text NOT NULL REFERENCES inspection_checklists(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  question text NOT NULL,
  category text NOT NULL CHECK (category IN ('mine_safety','environment','production','labour','contractor','other')),
  risk_level text NOT NULL DEFAULT 'medium' CHECK (risk_level IN ('low','medium','high','critical')),
  required boolean NOT NULL DEFAULT true,
  evidence_required boolean NOT NULL DEFAULT false,
  evidence_types text[],
  allow_na boolean NOT NULL DEFAULT true,
  allow_not_inspected boolean NOT NULL DEFAULT true,
  guidance text,
  regulation_ref text
);

CREATE TABLE inspection_item_results (
  id text PRIMARY KEY,
  inspection_id text NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  checklist_item_id text NOT NULL REFERENCES inspection_checklist_items(id),
  result text NOT NULL CHECK (result IN ('compliant','non_compliant','na','not_inspected')),
  observations text,
  measurements jsonb,
  recorded_by text REFERENCES users(id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (inspection_id, checklist_item_id)
);

CREATE TABLE inspection_item_evidence (
  inspection_item_result_id text NOT NULL REFERENCES inspection_item_results(id) ON DELETE CASCADE,
  document_id text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  attached_at timestamptz NOT NULL DEFAULT now(),
  attached_by text NOT NULL REFERENCES users(id),
  PRIMARY KEY (inspection_item_result_id, document_id)
);

-- Evidence requirements for record types
CREATE TABLE evidence_requirements (
  id text PRIMARY KEY,
  entity_type text NOT NULL CHECK (entity_type IN ('inspection','compliance','corrective_action','incident','safety_record')),
  entity_subtype text,
  risk_level text CHECK (risk_level IN ('low','medium','high','critical')),
  requirement_key text NOT NULL,
  description text NOT NULL,
  required boolean NOT NULL DEFAULT true,
  min_count integer NOT NULL DEFAULT 1,
  allowed_types text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_subtype, risk_level, requirement_key)
);

-- Revisions/amendments
CREATE TABLE record_revisions (
  id text PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  revision_number integer NOT NULL,
  reason text NOT NULL,
  changed_by text NOT NULL REFERENCES users(id),
  changed_at timestamptz NOT NULL DEFAULT now(),
  snapshot jsonb NOT NULL,
  UNIQUE (entity_type, entity_id, revision_number)
);

-- Anomaly detection signals
CREATE TABLE anomaly_signals (
  id text PRIMARY KEY,
  signal_type text NOT NULL CHECK (signal_type IN ('rapid_completion','identical_responses','bulk_status_change','missing_evidence','reused_evidence','frequent_approvals_no_review','post_approval_edit','perfect_pattern')),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  mine_id text REFERENCES mines(id),
  severity text NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  details jsonb NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  reviewed boolean NOT NULL DEFAULT false,
  reviewed_by text REFERENCES users(id),
  reviewed_at timestamptz,
  review_note text
);

CREATE INDEX anomaly_signals_entity_idx ON anomaly_signals (entity_type, entity_id);
CREATE INDEX anomaly_signals_mine_idx ON anomaly_signals (mine_id, detected_at DESC);
CREATE INDEX anomaly_signals_unreviewed_idx ON anomaly_signals (reviewed, detected_at DESC);

-- Exceptions
CREATE TABLE workflow_exceptions (
  id text PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  exception_type text NOT NULL,
  reason text NOT NULL,
  granted_by text NOT NULL REFERENCES users(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  secondary_approval_required boolean NOT NULL DEFAULT false,
  secondary_approved_by text REFERENCES users(id),
  secondary_approved_at timestamptz,
  affects jsonb
);

-- Inspection attestation
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS attested_by text REFERENCES users(id);
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS attested_at timestamptz;
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS attestation_text text;

-- Evidence provenance
ALTER TABLE documents ADD COLUMN IF NOT EXISTS uploaded_ip_hash text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS device_info jsonb;

-- Prevent audit deletion/update already exists, but ensure integrity
CREATE INDEX IF NOT EXISTS audit_events_chain_idx ON audit_events (seq, integrity_hash);
CREATE INDEX IF NOT EXISTS record_revisions_entity_idx ON record_revisions (entity_type, entity_id, revision_number);
CREATE INDEX IF NOT EXISTS inspection_item_results_inspection_idx ON inspection_item_results (inspection_id);
