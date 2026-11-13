-- Near misses are a distinct reporting artefact in the frontend contract
-- (separate from safety observations) and are stored separately to preserve
-- that meaning. They can still be linked to corrective actions.

CREATE TABLE near_misses (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  mine_id text NOT NULL REFERENCES mines(id),
  title text NOT NULL,
  description text NOT NULL,
  reported_by text NOT NULL REFERENCES users(id),
  reported_at timestamptz NOT NULL,
  latitude double precision CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude double precision CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  geo_source text CHECK (geo_source IS NULL OR geo_source IN ('device_gps','manual_entry','mine_registry','sensor')),
  geo_accuracy_m double precision CHECK (geo_accuracy_m IS NULL OR geo_accuracy_m >= 0),
  geo_captured_at timestamptz,
  location_description text,
  preventive_actions text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','under_investigation','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((latitude IS NULL AND longitude IS NULL) OR (latitude IS NOT NULL AND longitude IS NOT NULL))
);
CREATE INDEX near_misses_mine_idx ON near_misses (mine_id, reported_at DESC);
CREATE INDEX near_misses_search_idx ON near_misses USING gin (to_tsvector('simple', coalesce(code,'') || ' ' || coalesce(title,'') || ' ' || coalesce(description,'')));

CREATE TABLE near_miss_corrective_actions (
  near_miss_id text NOT NULL REFERENCES near_misses(id) ON DELETE CASCADE,
  corrective_action_id text NOT NULL REFERENCES corrective_actions(id) ON DELETE CASCADE,
  PRIMARY KEY (near_miss_id, corrective_action_id)
);

CREATE TABLE near_miss_documents (
  near_miss_id text NOT NULL REFERENCES near_misses(id) ON DELETE CASCADE,
  document_id text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  PRIMARY KEY (near_miss_id, document_id)
);
