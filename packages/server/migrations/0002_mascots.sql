-- Room mascots (D-49). The bot users themselves are created at startup by ensureMascots(),
-- which checks display-name collisions with the same nameKey() the invite path uses.
ALTER TABLE users ADD COLUMN is_bot INTEGER NOT NULL DEFAULT 0;

ALTER TABLE rooms ADD COLUMN mascot_key TEXT;
ALTER TABLE rooms ADD COLUMN mascot_enabled INTEGER NOT NULL DEFAULT 1;

UPDATE rooms SET mascot_key = 'lurdes' WHERE is_main = 1;
