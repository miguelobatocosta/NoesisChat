-- Office days (D-54): weekly vote, the chosen day, attendance and no-shows.

CREATE TABLE office_weeks (
  week_start TEXT PRIMARY KEY,               -- the Monday, 'YYYY-MM-DD'
  status     TEXT NOT NULL CHECK (status IN ('voting', 'decided')),
  chosen_on  TEXT,                           -- the office day once decided
  decided_by TEXT REFERENCES users (id),     -- NULL = decided by the vote
  opened_at  INTEGER NOT NULL
);

CREATE TABLE office_votes (
  week_start TEXT NOT NULL REFERENCES office_weeks (week_start),
  person_id  TEXT NOT NULL REFERENCES people (id),
  weekday    INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 5),   -- Mon = 1 … Fri = 5
  PRIMARY KEY (week_start, person_id, weekday)
);

CREATE TABLE office_days (
  date          TEXT PRIMARY KEY,
  week_start    TEXT NOT NULL,
  source        TEXT NOT NULL CHECK (source IN ('vote', 'admin', 'import')),
  nominated_at  INTEGER,                     -- day-before cake nomination done
  reminded_at   INTEGER,                     -- day-before reminder posted
  opened_at     INTEGER,                     -- morning card posted
  closed_at     INTEGER                      -- attendance settled
);

CREATE TABLE attendance (
  date          TEXT NOT NULL REFERENCES office_days (date),
  person_id     TEXT NOT NULL REFERENCES people (id),
  plan          TEXT CHECK (plan IN ('going', 'not_going')),
  plan_reason   TEXT,
  planned_at    INTEGER,
  status        TEXT CHECK (status IN ('present', 'absent')),
  excuse        TEXT,
  judgement     TEXT CHECK (judgement IN ('justified', 'unjustified', 'pending')),
  marked_by     TEXT REFERENCES users (id),
  noshow_debt   TEXT,                        -- the no-show cake it counted towards ('import' = never counts)
  PRIMARY KEY (date, person_id)
);
