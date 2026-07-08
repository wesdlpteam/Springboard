CREATE TABLE IF NOT EXISTS events (
  id         SERIAL PRIMARY KEY,
  ts         TIMESTAMPTZ NOT NULL DEFAULT now(),
  event      TEXT NOT NULL,
  stimulus_type TEXT,
  curriculum TEXT,
  subject    TEXT,
  year_level TEXT,
  routine    TEXT,
  boosters   TEXT,
  language_mode TEXT,
  topic      TEXT
);
CREATE INDEX IF NOT EXISTS events_ts_idx ON events (ts);
CREATE INDEX IF NOT EXISTS events_event_idx ON events (event);
