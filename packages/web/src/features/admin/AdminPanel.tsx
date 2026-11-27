import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Copy } from 'lucide-react';
import {
  type AdminLogEntry,
  type InviteExpiry,
  type InviteView,
  type Member,
  mascotByKey,
  MASCOT_KEYS,
} from '@pausa/shared';
import { errorCode } from '../../api/errors';
import { t } from '../../i18n';
import { formatFull, formatRelative } from '../../lib/format';
import { getStore, useChat } from '../../state/store';
import buttons from '../../ui/buttons.module.css';
import { Dialog } from '../../ui/Dialog';
import forms from '../../ui/forms.module.css';
import styles from './AdminPanel.module.css';
import { Punishments, Topics } from './Moderation';

type Tab = 'invites' | 'members' | 'topics' | 'punishments' | 'log';

export function AdminPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('invites');
  const [error, setError] = useState<string | null>(null);
  const report = useCallback((err: unknown) => setError(t(`errors.${errorCode(err)}`)), []);

  return (
    <Dialog open onClose={onClose} title={t('admin.title')} closeLabel={t('admin.close')} size="lg">
      <div className={styles.tabs} role="tablist">
        {(['invites', 'members', 'topics', 'punishments', 'log'] as const).map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            className={styles.tab}
            onClick={() => {
              setTab(name);
              setError(null);
            }}
          >
            {t(`admin.${name}`)}
          </button>
        ))}
      </div>
      {error && (
        <p className={forms.error} role="alert">
          {error}
        </p>
      )}
      <div role="tabpanel">
        {tab === 'invites' && <Invites onError={report} />}
        {tab === 'members' && <Members onError={report} />}
        {tab === 'topics' && <Topics onError={report} />}
        {tab === 'punishments' && <Punishments onError={report} />}
        {tab === 'log' && <Log onError={report} />}
      </div>
    </Dialog>
  );
}

function Invites({ onError }: { onError: (e: unknown) => void }) {
  const [name, setName] = useState('');
  const [expiresIn, setExpiresIn] = useState<InviteExpiry>('7d');
  const [invites, setInvites] = useState<InviteView[]>([]);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const store = getStore();

  const refresh = useCallback(
    () =>
      store
        .admin('admin:invites:list', {})
        .then((res) => setInvites(res.invites))
        .catch(onError),
    [store, onError],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await store.admin(
        'admin:invites:create',
        name.trim() ? { intendedName: name.trim(), expiresIn } : { expiresIn },
      );
      setLink(res.link);
      setCopied(false);
      setName('');
      await refresh();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      /* clipboard blocked: the link is selectable */
    }
  }

  return (
    <div>
      <form className={styles.inviteForm} onSubmit={(e) => void create(e)}>
        <label className={forms.field}>
          <span className={forms.label}>{t('admin.inviteName')}</span>
          <input
            className={forms.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={32}
          />
          <span className={forms.hint}>{t('admin.inviteNameHint')}</span>
        </label>
        <label className={forms.field}>
          <span className={forms.label}>{t('admin.expiry')}</span>
          <select
            className={forms.select}
            value={expiresIn}
            onChange={(e) => setExpiresIn(e.target.value as InviteExpiry)}
          >
            <option value="24h">{t('admin.expiry24h')}</option>
            <option value="7d">{t('admin.expiry7d')}</option>
          </select>
        </label>
        <button type="submit" className={buttons.accent} disabled={busy}>
          {t('admin.create')}
        </button>
      </form>

      {link && (
        <div className={styles.link}>
          <span className={forms.label}>{t('admin.newLink')}</span>
          <div className={styles.linkRow}>
            <input
              className={forms.input}
              value={link}
              readOnly
              onFocus={(e) => e.currentTarget.select()}
              aria-label={t('admin.newLink')}
            />
            <button type="button" className={buttons.primary} onClick={() => void copy()}>
              <Copy size={16} strokeWidth={1.75} aria-hidden />
              {copied ? t('admin.copied') : t('admin.copy')}
            </button>
          </div>
        </div>
      )}

      <ul className={styles.rows}>
        {invites.length === 0 && <li className={styles.empty}>{t('admin.noInvites')}</li>}
        {invites.map((inv) => (
          <li key={inv.id} className={styles.row}>
            <div className={styles.rowMain}>
              <span className={styles.rowTitle}>
                {inv.intendedName
                  ? t('admin.forName', { name: inv.intendedName })
                  : t('admin.anyone')}
              </span>
              <span className={styles.rowMeta}>
                {inv.redemptions.length
                  ? inv.redemptions
                      .map((r) => t('admin.redeemedBy', { name: r.displayName }))
                      .join(', ')
                  : t('admin.expiresAt', { date: formatRelative(inv.expiresAt) })}
              </span>
            </div>
            <span className={styles.status} data-status={inv.status}>
              {t(`admin.status.${inv.status}`)}
            </span>
            {inv.status === 'active' && (
              <button
                type="button"
                className={buttons.secondary}
                onClick={() =>
                  void store
                    .admin('admin:invites:revoke', { inviteId: inv.id })
                    .then(refresh)
                    .catch(onError)
                }
              >
                {t('admin.revoke')}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Members({ onError }: { onError: (e: unknown) => void }) {
  const members = useChat((s) => s.members);
  const me = useChat((s) => s.me);
  const [confirm, setConfirm] = useState<Member | null>(null);
  const store = getStore();
  const list = useMemo(
    () =>
      Object.values(members)
        .filter((m) => m.active && !m.isBot)
        .sort((a, b) => a.displayName.localeCompare(b.displayName, 'pt-PT')),
    [members],
  );

  const canRevoke = (m: Member) =>
    m.id !== me.id && m.role !== 'host' && (me.role === 'host' || m.role === 'member');

  return (
    <>
      <ul className={styles.rows}>
        {list.map((m) => (
          <li key={m.id} className={styles.row}>
            <div className={styles.rowMain}>
              <span className={styles.rowTitle}>
                {m.displayName} <span className={styles.role}>{t(`roles.${m.role}`)}</span>
              </span>
              <span className={styles.rowMeta}>
                {m.online
                  ? t('admin.online')
                  : m.lastSeenAt
                    ? t('admin.lastSeen', { date: formatRelative(m.lastSeenAt) })
                    : t('admin.neverSeen')}
              </span>
            </div>
            {me.role === 'host' && m.role !== 'host' && (
              <button
                type="button"
                className={buttons.secondary}
                onClick={() =>
                  void store
                    .admin('admin:members:setRole', {
                      userId: m.id,
                      role: m.role === 'admin' ? 'member' : 'admin',
                    })
                    .catch(onError)
                }
              >
                {m.role === 'admin' ? t('admin.demote') : t('admin.promote')}
              </button>
            )}
            {canRevoke(m) && (
              <button type="button" className={buttons.secondary} onClick={() => setConfirm(m)}>
                {t('admin.revokeMember')}
              </button>
            )}
          </li>
        ))}
      </ul>
      {confirm && (
        <Dialog
          open
          onClose={() => setConfirm(null)}
          title={t('admin.revokeTitle', { name: confirm.displayName })}
          closeLabel={t('admin.cancel')}
          size="sm"
          footer={
            <>
              <button type="button" className={buttons.secondary} onClick={() => setConfirm(null)}>
                {t('admin.cancel')}
              </button>
              <button
                type="button"
                className={buttons.danger}
                onClick={() => {
                  void store.admin('admin:members:revoke', { userId: confirm.id }).catch(onError);
                  setConfirm(null);
                }}
              >
                {t('admin.revokeConfirm')}
              </button>
            </>
          }
        >
          <p>{t('admin.revokeBody')}</p>
        </Dialog>
      )}
    </>
  );
}

function Log({ onError }: { onError: (e: unknown) => void }) {
  const [entries, setEntries] = useState<AdminLogEntry[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const store = getStore();

  const load = useCallback(
    (before?: string) =>
      store
        .admin('admin:log:list', before ? { before } : {})
        .then((res) => {
          setEntries((cur) => (before ? [...cur, ...res.entries] : res.entries));
          setHasMore(res.hasMore);
        })
        .catch(onError),
    [store, onError],
  );

  useEffect(() => {
    void load();
  }, [load]);

  function describe(e: AdminLogEntry): string {
    const key = `admin.actions.${e.action}` as const;
    const target = e.targetType === 'user' ? store.nameOf(e.targetId) : '';
    const role =
      typeof e.detail?.['to'] === 'string'
        ? t(`roles.${e.detail['to'] as 'admin' | 'member'}`)
        : '';
    const topic = typeof e.detail?.['topic'] === 'string' ? e.detail['topic'] : '';
    const name = typeof e.detail?.['name'] === 'string' ? e.detail['name'] : '';
    const text = t(key as Parameters<typeof t>[0], { target, role, topic, name });
    return text === key ? e.action : text;
  }

  /** Who did it: a person, a mascot (D-51), or the terminal. */
  function actor(e: AdminLogEntry): string {
    if (e.actorName) return e.actorName;
    const key = e.detail?.['mascot'];
    if (typeof key === 'string' && (MASCOT_KEYS as readonly string[]).includes(key))
      return mascotByKey(key as (typeof MASCOT_KEYS)[number]).name;
    return t('admin.system');
  }

  return (
    <>
      <ul className={styles.rows}>
        {entries.length === 0 && <li className={styles.empty}>{t('admin.noLog')}</li>}
        {entries.map((e) => (
          <li key={e.id} className={styles.row}>
            <div className={styles.rowMain}>
              <span className={styles.rowTitle}>
                {actor(e)} {describe(e)}
              </span>
              <span className={`${styles.rowMeta} num`}>{formatFull(e.createdAt)}</span>
            </div>
          </li>
        ))}
      </ul>
      {hasMore && (
        <button
          type="button"
          className={buttons.secondary}
          onClick={() => void load(entries.at(-1)?.id)}
        >
          {t('admin.loadMore')}
        </button>
      )}
    </>
  );
}
