-- Message search (backlog 4). Full-text index of message bodies; "café" matches "cafe".
-- Self-contained (keeps its own copy keyed by message id) rather than external content, because
-- messages has a TEXT primary key and its implicit rowids may change on VACUUM.
CREATE VIRTUAL TABLE messages_fts USING fts5(
  body,
  message_id UNINDEXED,
  tokenize = 'unicode61 remove_diacritics 2'
);

INSERT INTO messages_fts (body, message_id)
  SELECT body, id FROM messages WHERE body IS NOT NULL AND deleted_at IS NULL;

CREATE TRIGGER messages_fts_insert AFTER INSERT ON messages WHEN NEW.body IS NOT NULL BEGIN
  INSERT INTO messages_fts (body, message_id) VALUES (NEW.body, NEW.id);
END;

-- Edits re-index; a delete (body set to NULL, D-34) drops it from the index.
CREATE TRIGGER messages_fts_update AFTER UPDATE OF body ON messages BEGIN
  DELETE FROM messages_fts WHERE message_id = OLD.id;
  INSERT INTO messages_fts (body, message_id)
    SELECT NEW.body, NEW.id WHERE NEW.body IS NOT NULL;
END;

CREATE TRIGGER messages_fts_delete AFTER DELETE ON messages BEGIN
  DELETE FROM messages_fts WHERE message_id = OLD.id;
END;
