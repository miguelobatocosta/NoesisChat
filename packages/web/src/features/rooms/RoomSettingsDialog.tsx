import { type FormEvent, useState } from 'react';
import { LIMITS, type NotifyLevel } from '@pausa/shared';
import { errorCode } from '../../api/errors';
import { t } from '../../i18n';
import { getStore, useChat } from '../../state/store';
import buttons from '../../ui/buttons.module.css';
import { Dialog } from '../../ui/Dialog';
import forms from '../../ui/forms.module.css';
import { EmojiField } from './EmojiField';
import styles from './RoomSettings.module.css';

const LEVELS: NotifyLevel[] = ['all', 'mentions', 'none'];
const LEVEL_LABEL = {
  all: 'roomSettings.notifyAll',
  mentions: 'roomSettings.notifyMentions',
  none: 'roomSettings.notifyNone',
} as const;

export function RoomSettingsDialog({ roomId, onClose }: { roomId: string; onClose: () => void }) {
  const room = useChat((s) => s.rooms[roomId]);
  const me = useChat((s) => s.me);
  const [name, setName] = useState(room?.name ?? '');
  const [emoji, setEmoji] = useState<string | null>(room?.emoji ?? null);
  const [description, setDescription] = useState(room?.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  if (!room) return null;

  const canManage = room.isMain
    ? me.role === 'host'
    : me.role !== 'member' || room.createdBy === me.id;
  const store = getStore();

  async function run(fn: () => Promise<void>) {
    setError(null);
    setSaved(false);
    try {
      await fn();
      setSaved(true);
    } catch (err) {
      setError(t(`errors.${errorCode(err)}`));
    }
  }

  function save(e: FormEvent) {
    e.preventDefault();
    void run(() =>
      store.updateRoom({
        roomId,
        name: name.trim(),
        emoji,
        description: description.trim() || null,
      }),
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('roomSettings.title', { name: room.name })}
      closeLabel={t('roomSettings.close')}
      label={t('room.settings')}
    >
      <form onSubmit={save} className={styles.section}>
        <h3 className={styles.heading}>{t('roomSettings.details')}</h3>
        {!canManage && <p className={forms.hint}>{t('roomSettings.readOnly')}</p>}
        <label className={forms.field}>
          <span className={forms.label}>{t('newRoom.name')}</span>
          <input
            className={forms.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={LIMITS.roomName}
            disabled={!canManage}
            required
          />
        </label>
        <EmojiField
          label={t('newRoom.emoji')}
          value={emoji}
          onChange={setEmoji}
          disabled={!canManage}
        />
        <label className={forms.field}>
          <span className={forms.label}>{t('newRoom.description')}</span>
          <input
            className={forms.input}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={LIMITS.roomDescription}
            disabled={!canManage}
          />
        </label>
        {canManage && (
          <button type="submit" className={buttons.primary}>
            {t('roomSettings.save')}
          </button>
        )}
      </form>

      <fieldset className={styles.section}>
        <legend className={styles.heading}>{t('roomSettings.notify')}</legend>
        <div className={forms.radios}>
          {LEVELS.map((level) => (
            <label key={level} className={forms.check}>
              <input
                type="radio"
                name="notify"
                checked={room.notify === level}
                onChange={() => void run(() => store.updatePrefs(roomId, { notify: level }))}
              />
              <span>{t(LEVEL_LABEL[level])}</span>
            </label>
          ))}
        </div>
        {!room.isMain && (
          <label className={`${forms.check} ${styles.hide}`}>
            <input
              type="checkbox"
              checked={room.hidden}
              onChange={(e) =>
                void run(() => store.updatePrefs(roomId, { hidden: e.target.checked }))
              }
            />
            <span>{t('roomSettings.hide')}</span>
          </label>
        )}
      </fieldset>

      {canManage && !room.isMain && (
        <div className={styles.section}>
          <p className={forms.hint}>{t('roomSettings.archiveHint')}</p>
          <button
            type="button"
            className={buttons.secondary}
            onClick={() => void run(() => store.archiveRoom(roomId, !room.archivedAt))}
          >
            {room.archivedAt ? t('roomSettings.unarchive') : t('roomSettings.archive')}
          </button>
        </div>
      )}

      {error && (
        <p className={forms.error} role="alert">
          {error}
        </p>
      )}
      {saved && !error && (
        <p className={forms.hint} role="status">
          {t('roomSettings.saved')}
        </p>
      )}
    </Dialog>
  );
}
