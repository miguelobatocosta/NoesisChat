import { useState } from 'react';
import { type MascotKey, MASCOTS } from '@pausa/shared';
import { t } from '../../i18n';
import { getStore, useChat } from '../../state/store';
import buttons from '../../ui/buttons.module.css';
import forms from '../../ui/forms.module.css';
import { Mascot } from '../mascots/Mascot';
import styles from './AdminPanel.module.css';

/** Admin → Mascotes (Phase 18): the host renames the mascots. Their personalities stay. */
export function MascotsAdmin({ onError }: { onError: (e: unknown) => void }) {
  return (
    <>
      <p className={forms.hint}>{t('mascotsAdmin.intro')}</p>
      <ul className={styles.rows}>
        {MASCOTS.map((m) => (
          <MascotRow key={m.key} mascotKey={m.key} userId={m.userId} onError={onError} />
        ))}
      </ul>
    </>
  );
}

function MascotRow({
  mascotKey,
  userId,
  onError,
}: {
  mascotKey: MascotKey;
  userId: string;
  onError: (e: unknown) => void;
}) {
  const current = useChat((s) => s.members[userId]?.displayName ?? '');
  const [name, setName] = useState(current);
  const [saved, setSaved] = useState(false);
  const store = getStore();

  return (
    <li className={styles.row}>
      <Mascot mascot={mascotKey} size={44} />
      <div className={styles.rowMain}>
        <span className={styles.rowTitle}>{current}</span>
        <span className={styles.rowMeta}>{t(`mascots.${mascotKey}.personality`)}</span>
      </div>
      <form
        className={styles.inviteForm}
        onSubmit={(e) => {
          e.preventDefault();
          void store
            .admin('admin:mascots:rename', { key: mascotKey, name: name.trim() })
            .then(() => setSaved(true))
            .catch(onError);
        }}
      >
        <label className={forms.field}>
          <span className={forms.label}>{t('mascotsAdmin.name')}</span>
          <input
            className={forms.input}
            value={name}
            minLength={2}
            maxLength={32}
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
            }}
            required
          />
        </label>
        <button type="submit" className={buttons.secondary} disabled={name.trim() === current}>
          {saved ? t('mascotsAdmin.saved') : t('moderation.save')}
        </button>
      </form>
    </li>
  );
}
