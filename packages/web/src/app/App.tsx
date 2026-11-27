import { useCallback, useEffect, useState } from 'react';
import type { SessionUser } from '@pausa/shared';
import { accessSignIn, fetchSession } from '../api/http';
import { clearInvite, pendingInvite } from '../features/onboarding/invite';
import { JoinPage } from '../features/onboarding/JoinPage';
import { NoAccess } from '../features/onboarding/NoAccess';
import { t } from '../i18n';
import { BrandHeader } from '../ui/BrandHeader';
import buttons from '../ui/buttons.module.css';
import styles from './App.module.css';
import { ChatApp } from './ChatApp';

type Boot =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'join'; code: string | null; email?: string }
  | { kind: 'revoked' }
  | { kind: 'none' }
  | { kind: 'chat'; me: SessionUser };

/** Decides what to show: the join page, "you need an invite", or the chat. */
export function App() {
  const [boot, setBoot] = useState<Boot>({ kind: 'loading' });

  const load = useCallback(() => {
    const enter = (me: SessionUser) => {
      clearInvite();
      if (window.location.pathname === '/join') window.history.replaceState(null, '', '/');
      setBoot({ kind: 'chat', me });
    };
    fetchSession()
      .then(async ({ user, access }) => {
        if (user) return enter(user);
        // Cloudflare Access vouches for a Noesis email (D-52): no invite needed.
        if (access?.status === 'registered') return enter(await accessSignIn());
        if (access?.status === 'new')
          return setBoot({ kind: 'join', code: null, email: access.email });
        if (access?.status === 'revoked') return setBoot({ kind: 'revoked' });
        const code = pendingInvite();
        if (code || window.location.pathname === '/join') setBoot({ kind: 'join', code });
        else setBoot({ kind: 'none' });
      })
      .catch(() => setBoot({ kind: 'error' }));
  }, []);

  useEffect(load, [load]);

  if (boot.kind === 'chat') return <ChatApp me={boot.me} />;

  return (
    <div className={styles.app}>
      <BrandHeader />
      <main className={styles.main}>
        {boot.kind === 'loading' && <p className={styles.muted}>{t('boot.loading')}</p>}
        {boot.kind === 'error' && (
          <section className={styles.card}>
            <p>{t('boot.failed')}</p>
            <button
              type="button"
              className={buttons.primary}
              onClick={() => {
                setBoot({ kind: 'loading' });
                load();
              }}
            >
              {t('boot.retry')}
            </button>
          </section>
        )}
        {boot.kind === 'join' && (
          <JoinPage
            code={boot.code}
            email={boot.email}
            onJoined={(me) => {
              clearInvite();
              setBoot({ kind: 'chat', me });
            }}
          />
        )}
        {boot.kind === 'none' && <NoAccess />}
        {boot.kind === 'revoked' && <NoAccess revoked />}
      </main>
    </div>
  );
}
