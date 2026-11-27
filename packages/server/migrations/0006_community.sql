-- Cakes and people (D-53). Office days follow in 0007.

-- Everyone cakes and office days are about: members (user_id set) and guests who don't use Pausa.
CREATE TABLE people (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,              -- guests only; members show their display name
  name_key    TEXT NOT NULL,
  user_id     TEXT UNIQUE REFERENCES users (id),
  birthday_md TEXT,                       -- 'MM-DD'
  in_team     INTEGER NOT NULL DEFAULT 1, -- expected on office days
  created_at  INTEGER NOT NULL
);
CREATE INDEX people_name_key ON people (name_key);

-- One cake owed. Dates are local 'YYYY-MM-DD'.
CREATE TABLE cake_debts (
  id                TEXT PRIMARY KEY,
  person_id         TEXT NOT NULL REFERENCES people (id),
  reason            TEXT NOT NULL,
  kind              TEXT NOT NULL CHECK (kind IN ('milestone', 'birthday', 'noshow', 'import')),
  occurred_on       TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('pending', 'owed', 'paid', 'cancelled')),
  recorded_by       TEXT REFERENCES users (id),   -- NULL = the app (birthdays, no-shows, import)
  confirmed_by      TEXT REFERENCES users (id),
  pledged_on        TEXT,                          -- the day it's promised for
  pledge_kind       TEXT CHECK (pledge_kind IN ('volunteer', 'nominated')),
  paid_on           TEXT,
  paid_confirmed_by TEXT REFERENCES users (id),
  created_at        INTEGER NOT NULL
);
CREATE INDEX cake_debts_person ON cake_debts (person_id, status);

CREATE TABLE app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO app_settings (key, value) VALUES ('noshow_limit', '3');

-- Interactive cards the mascots post (D-53): { "type": "...", "ref": "<id or date>" }.
ALTER TABLE messages ADD COLUMN card TEXT;
