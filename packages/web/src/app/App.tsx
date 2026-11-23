import { useCallback, useEffect, useState } from 'react';
import type { SessionUser } from '@pausa/shared';
import { fetchSession } from '../api/http';
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
  | { kind: 'join' }
  | { kind: 'none' }
  | { kind: 'chat'; me: SessionUser };

/** Decides what to show: the join page, "you need an invite", or the chat. */
export function App() {
  const [boot, setBoot] = useState<Boot>({ kind: 'loading' });

  const load = useCallback(() => {
    fetchSession()
      .then((me) => {
        if (me) {
          if (window.location.pathname === '/join') window.history.replaceState(null, '', '/');
          setBoot({ kind: 'chat', me });
        } else setBoot({ kind: window.location.pathname === '/join' ? 'join' : 'none' });
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
        {boot.kind === 'join' && <JoinPage onJoined={(me) => setBoot({ kind: 'chat', me })} />}
        {boot.kind === 'none' && <NoAccess />}
      </main>
    </div>
  );
}
