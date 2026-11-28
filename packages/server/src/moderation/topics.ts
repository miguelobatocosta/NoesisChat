import type { ClientEventPayload, Topic } from '@pausa/shared';
import type { Db } from '../db';
import { AppError } from '../errors';
import { newId } from '../ids';
import seed from './topics.pt-PT.json';

export interface TopicRow {
  id: string;
  position: number;
  name: string;
  keywords: string;
  label: string;
  label_at: number;
  mute_at: number;
  mute_hours: number;
  enabled: number;
  line_warn: string | null;
  line_label: string | null;
  line_mute: string | null;
  updated_at: number;
}

export function toTopic(r: TopicRow): Topic {
  return {
    id: r.id,
    position: r.position,
    name: r.name,
    keywords: JSON.parse(r.keywords) as string[],
    label: r.label,
    labelAt: r.label_at,
    muteAt: r.mute_at,
    muteHours: r.mute_hours,
    enabled: r.enabled === 1,
    lines: { warn: r.line_warn ?? '', label: r.line_label ?? '', mute: r.line_mute ?? '' },
  };
}

/**
 * Seeds the 15 starter topics the first time only (D-51). Afterwards the admin portal owns them:
 * they're edited or switched off, never added or deleted, so an empty table means "never seeded".
 */
export function ensureTopics(db: Db): void {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM topics').get() as { n: number };
  if (n > 0) return;
  const insert = db.prepare(
    `INSERT INTO topics (id, position, name, keywords, label, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  db.transaction(() => {
    seed.forEach((t, i) =>
      insert.run(newId(), i + 1, t.name, JSON.stringify(t.keywords), t.label, Date.now()),
    );
  })();
}

export function listTopicRows(db: Db, onlyEnabled = false): TopicRow[] {
  return db
    .prepare(`SELECT * FROM topics ${onlyEnabled ? 'WHERE enabled = 1' : ''} ORDER BY position`)
    .all() as TopicRow[];
}

function getTopicRow(db: Db, id: string): TopicRow | undefined {
  return db.prepare('SELECT * FROM topics WHERE id = ?').get(id) as TopicRow | undefined;
}

export function updateTopic(db: Db, input: ClientEventPayload<'admin:topics:update'>): Topic {
  if (!getTopicRow(db, input.topicId)) throw new AppError('NOT_FOUND', 'Topic not found');
  const keywords = [...new Set(input.keywords.map((k) => k.toLowerCase()))];
  db.prepare(
    `UPDATE topics SET name = ?, keywords = ?, label = ?, label_at = ?, mute_at = ?, mute_hours = ?,
       enabled = ?, line_warn = ?, line_label = ?, line_mute = ?, updated_at = ? WHERE id = ?`,
  ).run(
    input.name,
    JSON.stringify(keywords),
    input.label,
    input.labelAt,
    input.muteAt,
    input.muteHours,
    input.enabled ? 1 : 0,
    input.lines.warn || null,
    input.lines.label || null,
    input.lines.mute || null,
    Date.now(),
    input.topicId,
  );
  return toTopic(getTopicRow(db, input.topicId)!);
}
