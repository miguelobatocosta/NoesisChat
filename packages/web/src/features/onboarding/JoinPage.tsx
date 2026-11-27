import { type FormEvent, useState } from 'react';
import { APP_NAME, InviteCode, LIMITS, type SessionUser } from '@pausa/shared';
import { errorCode } from '../../api/errors';
import { accessJoin, join } from '../../api/http';
import { t } from '../../i18n';
import buttons from '../../ui/buttons.module.css';
import forms from '../../ui/forms.module.css';
import { RulesContent } from '../settings/RulesDialog';
import { clearInvite } from './invite';
import styles from './Onboarding.module.css';

/** /join#<code>: house rules + privacy note, pick a name, get a session cookie (SPEC §3.1). */
export function JoinPage({
  code,
  email,
  onJoined,
}: {
  /** From the address or the email-gate hand-off (invite.ts). */
  code: string | null;
  /** A Cloudflare Access verified email (D-52): joins without an invite. */
  email?: string | undefined;
  onJoined: (me: SessionUser) => void;
}) {
  const validCode = email !== undefined || (code !== null && InviteCode.safeParse(code).success);
  const [name, setName] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const me = email ? await accessJoin(name.trim()) : await join(code!, name.trim());
      clearInvite();
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
      <p className={styles.subtitle}>
        {email
          ? t('join.subtitleEmail', { app: APP_NAME, email })
          : t('join.subtitle', { app: APP_NAME })}
      </p>

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
