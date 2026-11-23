-- 0001: initial schema (SPEC §5). Never edit after it has been applied; add 0002_... instead.

CREATE TABLE users (
  id           TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  name_key     TEXT NOT NULL UNIQUE,              -- NFKD, no diacritics, lowercase (D-32)
  role         TEXT NOT NULL CHECK (role IN ('host', 'admin', 'member')),
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER,
  revoked_at   INTEGER
);
CREATE UNIQUE INDEX users_one_host ON users (role) WHERE role = 'host';

CREATE TABLE devices (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users (id),
  token_hash   TEXT NOT NULL UNIQUE,              -- SHA-256 of the 256-bit session token
  label        TEXT NOT NULL DEFAULT '',
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER,
  revoked_at   INTEGER
);
CREATE INDEX devices_user ON devices (user_id);

CREATE TABLE invites (
  id            TEXT PRIMARY KEY,
  code_hash     TEXT NOT NULL UNIQUE,             -- SHA-256 of the 128-bit invite code
  created_by    TEXT REFERENCES users (id),       -- NULL when issued by `pnpm server:init`
  intended_name TEXT,
  grant_role    TEXT NOT NULL DEFAULT 'member' CHECK (grant_role IN ('host', 'member')),
  for_user_id   TEXT REFERENCES users (id),       -- set: redeeming adds a device to this user
  max_uses      INTEGER NOT NULL DEFAULT 1,
  uses          INTEGER NOT NULL DEFAULT 0,
  expires_at    INTEGER NOT NULL,
  created_at    INTEGER NOT NULL,
  revoked_at    INTEGER
);

CREATE TABLE invite_redemptions (
  invite_id   TEXT NOT NULL REFERENCES invites (id),
  user_id     TEXT NOT NULL REFERENCES users (id),
  device_id   TEXT NOT NULL REFERENCES devices (id),
  redeemed_at INTEGER NOT NULL
);
CREATE INDEX invite_redemptions_invite ON invite_redemptions (invite_id);

CREATE TABLE rooms (
  id          TEXT PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  emoji       TEXT,
  description TEXT,
  is_main     INTEGER NOT NULL DEFAULT 0,
  created_by  TEXT REFERENCES users (id),
  created_at  INTEGER NOT NULL,
  archived_at INTEGER
);

CREATE TABLE messages (
  id          TEXT PRIMARY KEY,
  room_id     TEXT NOT NULL REFERENCES rooms (id),
  user_id     TEXT NOT NULL REFERENCES users (id),
  client_id   TEXT NOT NULL,
  body        TEXT,                               -- NULL once deleted (D-34)
  reply_to_id TEXT REFERENCES messages (id),
  seq         INTEGER NOT NULL,                   -- global change sequence (D-33)
  created_at  INTEGER NOT NULL,
  edited_at   INTEGER,
  deleted_at  INTEGER,
  UNIQUE (user_id, client_id)                     -- idempotent sends (D-38)
);
CREATE INDEX messages_room_id ON messages (room_id, id);
CREATE INDEX messages_room_seq ON messages (room_id, seq);
CREATE INDEX messages_user ON messages (user_id);

CREATE TABLE attachments (
  id          TEXT PRIMARY KEY,
  message_id  TEXT REFERENCES messages (id),      -- NULL until attached; orphans removed after 24h
  uploader_id TEXT NOT NULL REFERENCES users (id),
  mime        TEXT NOT NULL,
  size        INTEGER NOT NULL,
  sha256      TEXT NOT NULL,
  path        TEXT NOT NULL,                      -- random name inside uploads/, never the user's
  width       INTEGER,
  height      INTEGER,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
CREATE INDEX attachments_message ON attachments (message_id);

CREATE TABLE reactions (
  message_id TEXT NOT NULL REFERENCES messages (id),
  user_id    TEXT NOT NULL REFERENCES users (id),
  emoji      TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE TABLE read_state (
  user_id      TEXT NOT NULL REFERENCES users (id),
  room_id      TEXT NOT NULL REFERENCES rooms (id),
  last_read_id TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (user_id, room_id)
);

CREATE TABLE room_prefs (
  user_id TEXT NOT NULL REFERENCES users (id),
  room_id TEXT NOT NULL REFERENCES rooms (id),
  notify  TEXT NOT NULL DEFAULT 'mentions' CHECK (notify IN ('all', 'mentions', 'none')),
  hidden  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, room_id)
);

CREATE TABLE mentions (
  message_id TEXT NOT NULL REFERENCES messages (id),
  user_id    TEXT NOT NULL REFERENCES users (id),
  PRIMARY KEY (message_id, user_id)
);
CREATE INDEX mentions_user ON mentions (user_id);

CREATE TABLE admin_log (
  id          TEXT PRIMARY KEY,
  actor_id    TEXT REFERENCES users (id),
  action      TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id   TEXT NOT NULL,
  detail      TEXT,                               -- JSON
  created_at  INTEGER NOT NULL
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL                             -- JSON
);
INSERT INTO settings (key, value) VALUES ('change_seq', '0');

-- The protected main room (D-17). Fixed id so code and tests can refer to it.
INSERT INTO rooms (id, slug, name, emoji, description, is_main, created_by, created_at)
VALUES ('00000000000000000000000001', 'geral', 'geral', NULL, NULL, 1, NULL,
        CAST(strftime('%s', 'now') AS INTEGER) * 1000);
