import { type FormEvent, useState } from 'react';
import { LIMITS, slugify } from '@pausa/shared';
import { errorCode } from '../../api/errors';
import { t } from '../../i18n';
import { getStore } from '../../state/store';
import buttons from '../../ui/buttons.module.css';
import { Dialog } from '../../ui/Dialog';
import forms from '../../ui/forms.module.css';
import { EmojiField } from './EmojiField';

export function NewRoomDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const slug = slugify(name);

  function close() {
    setName('');
    setEmoji(null);
    setDescription('');
    setError(null);
    onClose();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await getStore().createRoom({
        name: name.trim(),
        emoji,
        description: description.trim() || null,
      });
      close();
    } catch (err) {
      setError(t(`errors.${errorCode(err)}`));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={t('newRoom.title')}
      closeLabel={t('newRoom.cancel')}
      size="sm"
      footer={
        <>
          <button type="button" className={buttons.secondary} onClick={close}>
            {t('newRoom.cancel')}
          </button>
          <button
            type="submit"
            form="new-room"
            className={buttons.primary}
            disabled={busy || !slug}
          >
            {t('newRoom.create')}
          </button>
        </>
      }
    >
      <form id="new-room" onSubmit={(e) => void submit(e)}>
        <label className={forms.field}>
          <span className={forms.label}>{t('newRoom.name')}</span>
          <input
            className={forms.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('newRoom.namePlaceholder')}
            maxLength={LIMITS.roomName}
            required
            autoFocus
          />
          {slug && <span className={forms.hint}>{t('newRoom.slug', { slug })}</span>}
        </label>
        <EmojiField label={t('newRoom.emoji')} value={emoji} onChange={setEmoji} />
        <label className={forms.field}>
          <span className={forms.label}>{t('newRoom.description')}</span>
          <input
            className={forms.input}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('newRoom.descriptionPlaceholder')}
            maxLength={LIMITS.roomDescription}
          />
        </label>
        {error && (
          <p className={forms.error} role="alert">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}
