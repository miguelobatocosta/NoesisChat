import { type FormEvent, useCallback, useEffect, useState } from 'react';
import type { MuteView, StrikeView, Topic } from '@pausa/shared';
import { t } from '../../i18n';
import { formatFull } from '../../lib/format';
import { getStore, useChat } from '../../state/store';
import buttons from '../../ui/buttons.module.css';
import forms from '../../ui/forms.module.css';
import styles from './AdminPanel.module.css';

type OnError = (e: unknown) => void;

/** The 15 topics the mascots moderate (D-51): switch on/off, edit words, label, thresholds, lines. */
export function Topics({ onError }: { onError: OnError }) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const store = getStore();

  useEffect(() => {
    store
      .admin('admin:topics:list', {})
      .then((res) => setTopics(res.topics))
      .catch(onError);
  }, [store, onError]);

  const save = useCallback(
    async (topic: Topic) => {
      const { id, position: _p, ...rest } = topic;
      const res = await store.admin('admin:topics:update', { topicId: id, ...rest });
      setTopics((cur) => cur.map((x) => (x.id === res.topic.id ? res.topic : x)));
    },
    [store],
  );

  return (
    <>
      <p className={forms.hint}>{t('moderation.topicsIntro')}</p>
      <ul className={styles.rows}>
        {topics.map((topic) => (
          <li key={topic.id} className={styles.topic}>
            <div className={styles.row}>
              <label className={forms.check}>
                <input
                  type="checkbox"
                  checked={topic.enabled}
                  aria-label={t('moderation.enabled', { name: topic.name })}
                  onChange={(e) =>
                    void save({ ...topic, enabled: e.target.checked }).catch(onError)
                  }
                />
              </label>
              <div className={styles.rowMain}>
                <span className={styles.rowTitle}>
                  {topic.name} <span className={styles.role}>{topic.label}</span>
                </span>
                <span className={`${styles.rowMeta} num`}>
                  {t('moderation.thresholds', {
                    label: topic.labelAt,
                    mute: topic.muteAt,
                    hours: topic.muteHours,
                    words: topic.keywords.length,
                  })}
                </span>
              </div>
              <button
                type="button"
                className={buttons.secondary}
                aria-expanded={editing === topic.id}
                onClick={() => setEditing(editing === topic.id ? null : topic.id)}
              >
                {editing === topic.id ? t('admin.cancel') : t('moderation.edit')}
              </button>
            </div>
            {editing === topic.id && (
              <TopicForm
                topic={topic}
                onSave={(next) =>
                  save(next)
                    .then(() => setEditing(null))
                    .catch(onError)
                }
              />
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function TopicForm({ topic, onSave }: { topic: Topic; onSave: (t: Topic) => void }) {
  const [draft, setDraft] = useState({
    ...topic,
    words: topic.keywords.join('\n'),
  });
  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const setLine = (key: keyof Topic['lines'], value: string) =>
    setDraft((d) => ({ ...d, lines: { ...d.lines, [key]: value } }));

  function submit(e: FormEvent) {
    e.preventDefault();
    const { words, ...rest } = draft;
    const keywords = words
      .split(/[\n,]/)
      .map((w) => w.trim())
      .filter((w) => w.length >= 2);
    onSave({ ...rest, keywords });
  }

  const number = (key: 'labelAt' | 'muteAt' | 'muteHours', label: string, max: number) => (
    <label className={forms.field}>
      <span className={forms.label}>{label}</span>
      <input
        className={forms.input}
        type="number"
        min={1}
        max={max}
        value={draft[key]}
        onChange={(e) => set(key, Number(e.target.value))}
        required
      />
    </label>
  );

  return (
    <form className={styles.topicForm} onSubmit={submit}>
      <div className={styles.topicGrid}>
        <label className={forms.field}>
          <span className={forms.label}>{t('moderation.name')}</span>
          <input
            className={forms.input}
            value={draft.name}
            onChange={(e) => set('name', e.target.value)}
            minLength={2}
            maxLength={30}
            required
          />
        </label>
        <label className={forms.field}>
          <span className={forms.label}>{t('moderation.label')}</span>
          <input
            className={forms.input}
            value={draft.label}
            onChange={(e) => set('label', e.target.value)}
            maxLength={24}
            required
          />
        </label>
        {number('labelAt', t('moderation.labelAt'), 499)}
        {number('muteAt', t('moderation.muteAt'), 500)}
        {number('muteHours', t('moderation.muteHours'), 168)}
      </div>
      <label className={forms.field}>
        <span className={forms.label}>{t('moderation.keywords')}</span>
        <textarea
          className={forms.textarea}
          rows={5}
          value={draft.words}
          onChange={(e) => set('words', e.target.value)}
          required
        />
        <span className={forms.hint}>{t('moderation.keywordsHint')}</span>
      </label>
      {(['warn', 'label', 'mute'] as const).map((kind) => (
        <label key={kind} className={forms.field}>
          <span className={forms.label}>{t(`moderation.line.${kind}`)}</span>
          <textarea
            className={forms.textarea}
            rows={2}
            maxLength={300}
            value={draft.lines[kind]}
            placeholder={t('moderation.linePlaceholder')}
            onChange={(e) => setLine(kind, e.target.value)}
          />
        </label>
      ))}
      <p className={forms.hint}>{t('moderation.lineHint')}</p>
      <button type="submit" className={buttons.primary}>
        {t('moderation.save')}
      </button>
    </form>
  );
}

/** Active mutes (lift early) and strike counts (reset), across rooms. */
export function Punishments({ onError }: { onError: OnError }) {
  const [mutes, setMutes] = useState<MuteView[]>([]);
  const [strikes, setStrikes] = useState<StrikeView[]>([]);
  const rooms = useChat((s) => s.rooms);
  const store = getStore();
  const roomName = (id: string) => `#${rooms[id]?.slug ?? '?'}`;

  const load = useCallback(
    () =>
      store
        .admin('admin:moderation:list', {})
        .then((res) => {
          setMutes(res.mutes);
          setStrikes(res.strikes);
        })
        .catch(onError),
    [store, onError],
  );
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <h3 className={styles.sectionTitle}>{t('moderation.activeMutes')}</h3>
      <ul className={styles.rows}>
        {mutes.length === 0 && <li className={styles.empty}>{t('moderation.noMutes')}</li>}
        {mutes.map((m) => (
          <li key={m.id} className={styles.row}>
            <div className={styles.rowMain}>
              <span className={styles.rowTitle}>
                {store.nameOf(m.userId)} <span className={styles.role}>{roomName(m.roomId)}</span>
              </span>
              <span className={`${styles.rowMeta} num`}>
                {t('moderation.muteMeta', { topic: m.topicName, date: formatFull(m.until) })}
              </span>
            </div>
            <button
              type="button"
              className={buttons.secondary}
              onClick={() =>
                void store
                  .admin('admin:moderation:lift', { muteId: m.id })
                  .then(load)
                  .catch(onError)
              }
            >
              {t('moderation.lift')}
            </button>
          </li>
        ))}
      </ul>

      <h3 className={styles.sectionTitle}>{t('moderation.strikes')}</h3>
      <ul className={styles.rows}>
        {strikes.length === 0 && <li className={styles.empty}>{t('moderation.noStrikes')}</li>}
        {strikes.map((s) => (
          <li key={`${s.userId}:${s.roomId}:${s.topicId}`} className={styles.row}>
            <div className={styles.rowMain}>
              <span className={styles.rowTitle}>
                {store.nameOf(s.userId)} <span className={styles.role}>{roomName(s.roomId)}</span>
              </span>
              <span className={`${styles.rowMeta} num`}>
                {t('moderation.strikeMeta', {
                  topic: s.topicName,
                  count: s.count,
                  label: s.labelAt,
                  mute: s.muteAt,
                })}
              </span>
            </div>
            <button
              type="button"
              className={buttons.secondary}
              onClick={() =>
                void store
                  .admin('admin:moderation:reset', {
                    userId: s.userId,
                    roomId: s.roomId,
                    topicId: s.topicId,
                  })
                  .then(load)
                  .catch(onError)
              }
            >
              {t('moderation.reset')}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
