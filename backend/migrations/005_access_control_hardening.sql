-- Access control hardening
-- Extend audit actions to include denied attempts
ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check;
ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action IN (
  'create','update','status_change','assign','verify','submit','archive','delete','export','login','logout','authorization_denied'
));

-- Ensure sessions can be revoked and logged properly
CREATE INDEX IF NOT EXISTS user_sessions_user_idx ON user_sessions (user_id, revoked_at, expires_at);
CREATE INDEX IF NOT EXISTS audit_events_action_time_idx ON audit_events (action, timestamp DESC);
