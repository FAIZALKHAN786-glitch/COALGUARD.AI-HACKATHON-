-- Audit events are organisation-wide records, but the API must not leak records
-- from mines outside a scoped user's assignment. This join carries the mine
-- associations used solely for read-side authorization.
CREATE TABLE audit_event_mines (
  audit_id text NOT NULL REFERENCES audit_events(id) ON DELETE CASCADE,
  mine_id text NOT NULL REFERENCES mines(id) ON DELETE CASCADE,
  PRIMARY KEY (audit_id, mine_id)
);
CREATE INDEX audit_event_mines_mine_idx ON audit_event_mines (mine_id);
