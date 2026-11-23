import { type FormEvent, useMemo, useState } from 'react';
import { APP_NAME, InviteCode, LIMITS, type SessionUser } from '@pausa/shared';
import { errorCode } from '../../api/errors';
import { join } from '../../api/http';
import { t } from '../../i18n';
import buttons from '../../ui/buttons.module.css';
import forms from '../../ui/forms.module.css';
import { RulesContent } from '../settings/RulesDialog';
import styles from './Onboarding.module.css';

/** /join#<code>: house rules + privacy note, pick a name, get a session cookie (SPEC §3.1). */
export function JoinPage({ onJoined }: { onJoined: (me: SessionUser) => void }) {
  const code = useMemo(() => window.location.hash.slice(1), []);
  const validCode = InviteCode.safeParse(code).success;
  const [name, setName] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const me = await join(code, name.trim());
      // The code has done its job: remove it from the address bar and history.
      window.history.replaceState(null, '', '/');
      onJoined(me);
    } catch (err) {
      setError(t(`errors.${errorCode(err)}`));
      setBusy(false);
    }
  }

  if (!validCode) {
    return (
      <section className={styles.card}>
        <p>{t('join.noCode', { app: APP_NAME })}</p>
      </section>
    );
  }

  return (
    <section className={styles.card} aria-labelledby="join-title">
      <h1 id="join-title" className={styles.title}>
        {t('join.title')}
      </h1>
      <p className={styles.subtitle}>{t('join.subtitle', { app: APP_NAME })}</p>

      <div className={styles.rules}>
        <RulesContent />
      </div>

      <form onSubmit={(e) => void submit(e)}>
        <label className={forms.field}>
          <span className={forms.label}>{t('join.nameLabel')}</span>
          <input
            className={forms.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('join.namePlaceholder')}
            minLength={2}
            maxLength={LIMITS.displayName}
            autoComplete="name"
            required
          />
          <span className={forms.hint}>{t('join.nameHint')}</span>
        </label>
        <label className={forms.check}>
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            required
          />
          <span>{t('join.accept')}</span>
        </label>
        {error && (
          <p className={forms.error} role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          className={`${buttons.accent} ${styles.submit}`}
          disabled={busy || !accepted || name.trim().length < 2}
        >
          {busy ? t('join.submitting') : t('join.submit')}
        </button>
      </form>
    </section>
  );
}
