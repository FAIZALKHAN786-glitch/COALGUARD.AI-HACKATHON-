-- Geofencing-based attendance module
-- Authorized attendance boundaries and worker tracking

-- Attendance geofence zones (authorized mine worksite boundaries)
CREATE TABLE attendance_geofences (
  id text PRIMARY KEY,
  mine_id text NOT NULL REFERENCES mines(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  boundary_wkt text NOT NULL,
  center_lat double precision CHECK (center_lat IS NULL OR center_lat BETWEEN -90 AND 90),
  center_lng double precision CHECK (center_lng IS NULL OR center_lng BETWEEN -180 AND 180),
  radius_m double precision CHECK (radius_m IS NULL OR radius_m > 0),
  boundary_tolerance_m double precision NOT NULL DEFAULT 50 CHECK (boundary_tolerance_m >= 0),
  is_active boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES users(id),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
);
CREATE INDEX attendance_geofences_mine_idx ON attendance_geofences (mine_id);
CREATE INDEX attendance_geofences_active_idx ON attendance_geofences (is_active);

-- Worker geofence assignments (which geofences a worker is authorized to check into)
CREATE TABLE worker_geofence_assignments (
  id text PRIMARY KEY,
  worker_id text NOT NULL REFERENCES workforce_members(id) ON DELETE CASCADE,
  geofence_id text NOT NULL REFERENCES attendance_geofences(id) ON DELETE CASCADE,
  assigned_from date NOT NULL DEFAULT CURRENT_DATE,
  assigned_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES users(id),
  UNIQUE (worker_id, geofence_id)
);
CREATE INDEX worker_geofence_assignments_worker_idx ON worker_geofence_assignments (worker_id);

-- Enhanced attendance records with geofence validation
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_in_lat double precision CHECK (check_in_lat IS NULL OR check_in_lat BETWEEN -90 AND 90);
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_in_lng double precision CHECK (check_in_lng IS NULL OR check_in_lng BETWEEN -180 AND 180);
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_in_accuracy_m double precision CHECK (check_in_accuracy_m IS NULL OR check_in_accuracy_m >= 0);
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_in_geofence_id text REFERENCES attendance_geofences(id);
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_in_geofence_valid boolean;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_in_method text CHECK (check_in_method IN ('gps','qr_code','supervisor','manual'));
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_in_device_info jsonb DEFAULT '{}';
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_in_ip_hash text;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_out_lat double precision CHECK (check_out_lat IS NULL OR check_out_lat BETWEEN -90 AND 90);
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_out_lng double precision CHECK (check_out_lng IS NULL OR check_out_lng BETWEEN -180 AND 180);
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_out_accuracy_m double precision CHECK (check_out_accuracy_m IS NULL OR check_out_accuracy_m >= 0);
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_out_geofence_id text REFERENCES attendance_geofences(id);
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_out_geofence_valid boolean;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_out_method text CHECK (check_out_method IN ('gps','qr_code','supervisor','manual'));
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_out_device_info jsonb DEFAULT '{}';
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_out_ip_hash text;

CREATE INDEX attendance_records_geofence_idx ON attendance_geofences (mine_id, is_active);

-- Document intelligence / OCR processing tracking
CREATE TABLE document_processing_ocr (
  id text PRIMARY KEY,
  document_id text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  ocr_engine text NOT NULL,
  ocr_engine_version text,
  page_count integer,
  total_confidence numeric(5,4) CHECK (total_confidence IS NULL OR (total_confidence >= 0 AND total_confidence <= 1)),
  processing_time_ms integer,
  language_detected text,
  extracted_text_length integer,
  table_count integer,
  image_count integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX document_processing_ocr_doc_idx ON document_processing_ocr (document_id);

-- Document extraction fields with provenance (enhanced)
CREATE TABLE document_extraction_fields (
  id text PRIMARY KEY,
  document_id text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  extracted_value text,
  corrected_value text,
  confidence numeric(5,4) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  page_number integer CHECK (page_number IS NULL OR page_number > 0),
  bbox jsonb, -- bounding box [x1, y1, x2, y2]
  extraction_method text CHECK (extraction_method IN ('native','ocr','manual','hybrid')),
  source_provenance jsonb DEFAULT '{}',
  is_confirmed boolean NOT NULL DEFAULT false,
  confirmed_by text REFERENCES users(id),
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX document_extraction_fields_doc_idx ON document_extraction_fields (document_id);
CREATE INDEX document_extraction_fields_field_idx ON document_extraction_fields (field_name);
