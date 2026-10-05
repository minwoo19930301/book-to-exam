CREATE TABLE IF NOT EXISTS appeals (
  id TEXT PRIMARY KEY,
  received_at TEXT NOT NULL,
  subject TEXT NOT NULL,
  question_type TEXT,
  question_id TEXT,
  category TEXT NOT NULL,
  message TEXT NOT NULL,
  expected_answer TEXT NOT NULL DEFAULT '',
  context_json TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  operator_note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS appeals_status_received ON appeals(status, received_at DESC);
CREATE INDEX IF NOT EXISTS appeals_question ON appeals(subject, question_type, question_id);
CREATE TABLE IF NOT EXISTS appeal_limits (
  bucket TEXT PRIMARY KEY,
  requests INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS appeal_limits_expiry ON appeal_limits(expires_at);
