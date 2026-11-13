-- Workflow association links required by the frontend contract.

CREATE TABLE inspection_corrective_actions (
  inspection_id text NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  corrective_action_id text NOT NULL REFERENCES corrective_actions(id) ON DELETE CASCADE,
  PRIMARY KEY (inspection_id, corrective_action_id)
);
CREATE INDEX inspection_actions_action_idx ON inspection_corrective_actions (corrective_action_id);

CREATE TABLE compliance_corrective_actions (
  compliance_id text NOT NULL REFERENCES compliance_requirements(id) ON DELETE CASCADE,
  corrective_action_id text NOT NULL REFERENCES corrective_actions(id) ON DELETE CASCADE,
  PRIMARY KEY (compliance_id, corrective_action_id)
);
CREATE INDEX compliance_actions_action_idx ON compliance_corrective_actions (corrective_action_id);

-- Optional spatial capability. The base schema stores validated WGS84
-- latitude/longitude for every deployment. When PostGIS is installed (see
-- docs/DATABASE.md) this block adds authoritative geography columns and GiST
-- indexes without changing the API contract.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'postgis') THEN
    CREATE EXTENSION IF NOT EXISTS postgis;

    ALTER TABLE mines ADD COLUMN IF NOT EXISTS location geography(Point, 4326);
    ALTER TABLE inspections ADD COLUMN IF NOT EXISTS location geography(Point, 4326);
    ALTER TABLE safety_records ADD COLUMN IF NOT EXISTS location geography(Point, 4326);
    ALTER TABLE incidents ADD COLUMN IF NOT EXISTS location geography(Point, 4326);
    ALTER TABLE environmental_measurements ADD COLUMN IF NOT EXISTS location geography(Point, 4326);

    CREATE INDEX IF NOT EXISTS mines_location_gist ON mines USING gist (location);
    CREATE INDEX IF NOT EXISTS inspections_location_gist ON inspections USING gist (location);
    CREATE INDEX IF NOT EXISTS safety_records_location_gist ON safety_records USING gist (location);
    CREATE INDEX IF NOT EXISTS incidents_location_gist ON incidents USING gist (location);
    CREATE INDEX IF NOT EXISTS environmental_measurements_location_gist ON environmental_measurements USING gist (location);

    INSERT INTO system_settings (key, value)
    VALUES ('postgis_enabled', 'true'::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = 'true'::jsonb, updated_at = now();
  END IF;
END $$;
