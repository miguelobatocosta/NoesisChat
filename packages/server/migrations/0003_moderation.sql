-- Mascots moderate topics (D-51). The 15 topics are seeded at startup by ensureTopics() from
-- src/moderation/topics.pt-PT.json; after that the admin portal owns them (edit, switch off, never delete).
CREATE TABLE topics (
  id          TEXT PRIMARY KEY,
  position    INTEGER NOT NULL,
  name        TEXT NOT NULL,
  keywords    TEXT NOT NULL,              -- JSON array of words/phrases
  label       TEXT NOT NULL,
  label_at    INTEGER NOT NULL DEFAULT 15,
  mute_at     INTEGER NOT NULL DEFAULT 30,
  mute_hours  INTEGER NOT NULL DEFAULT 24,
  enabled     INTEGER NOT NULL DEFAULT 1,
  line_warn   TEXT,                       -- NULL = the mascot's own default line
  line_label  TEXT,
  line_mute   TEXT,
  updated_at  INTEGER NOT NULL
);

-- One counter per person, room and topic.
CREATE TABLE strikes (
  user_id     TEXT NOT NULL REFERENCES users(id),
  room_id     TEXT NOT NULL REFERENCES rooms(id),
  topic_id    TEXT NOT NULL REFERENCES topics(id),
  count       INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, room_id, topic_id)
);

-- A mute ends when `until` passes or an admin lifts it; either way `ended_at` is set and the
-- topic's strikes in that room go back to 0.
CREATE TABLE mutes (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  room_id     TEXT NOT NULL REFERENCES rooms(id),
  topic_id    TEXT NOT NULL REFERENCES topics(id),
  until       INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  ended_at    INTEGER,
  lifted_by   TEXT REFERENCES users(id)
);
CREATE INDEX mutes_active ON mutes (user_id, room_id) WHERE ended_at IS NULL;
