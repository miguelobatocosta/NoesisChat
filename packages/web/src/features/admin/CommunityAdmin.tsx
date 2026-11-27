import { useState } from 'react';
import type { ImportRow, ImportSheet } from '@pausa/shared';
import { t } from '../../i18n';
import { readXlsx, sheetKind } from '../../lib/xlsx';
import { showDate } from '../community/selectors';
import { getStore, useChat } from '../../state/store';
import buttons from '../../ui/buttons.module.css';
import forms from '../../ui/forms.module.css';
import styles from './AdminPanel.module.css';

type OnError = (e: unknown) => void;

/** Admin → Bolos & Escritório (D-53/D-54): Excel import, guests, team, no-show limit. */
export function CommunityAdmin({ onError }: { onError: OnError }) {
  return (
    <>
      <Import onError={onError} />
      <Guests onError={onError} />
      <Team />
      <Limit onError={onError} />
    </>
  );
}

function Import({ onError }: { onError: OnError }) {
  const store = getStore();
  const [sheet, setSheet] = useState<ImportSheet>('cakes');
  // One text per sheet: pasted by hand, or filled from an uploaded .xlsx.
  const [texts, setTexts] = useState<Record<ImportSheet, string>>({
    cakes: '',
    birthdays: '',
    attendance: '',
  });
  const text = texts[sheet];
  const setText = (value: string) => setTexts((cur) => ({ ...cur, [sheet]: value }));
  const [loaded, setLoaded] = useState<string | null>(null);

  async function upload(file: File) {
    try {
      const sheets = await readXlsx(file);
      const next = { cakes: '', birthdays: '', attendance: '' } as Record<ImportSheet, string>;
      const found: string[] = [];
      for (const [name, tsv] of Object.entries(sheets)) {
        const kind = sheetKind(name);
        if (kind && tsv) {
          next[kind] = tsv;
          found.push(name);
        }
      }
      setTexts(next);
      setRows(null);
      setResult(null);
      setLoaded(
        found.length
          ? t('communityAdmin.fileLoaded', { sheets: found.join(', ') })
          : t('communityAdmin.fileEmpty'),
      );
      const first = (['cakes', 'birthdays', 'attendance'] as const).find((k) => next[k]);
      if (first) {
        setSheet(first);
        setRows(
          (await store.admin('admin:import:preview', { sheet: first, text: next[first] })).rows,
        );
      }
    } catch (err) {
      setLoaded(t('communityAdmin.fileError'));
      onError(err);
    }
  }
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [result, setResult] = useState<string | null>(null);

  return (
    <section>
      <h3 className={styles.sectionTitle}>{t('communityAdmin.importTitle')}</h3>
      <p className={forms.hint}>{t('communityAdmin.importHint')}</p>
      <label className={`${buttons.accent} ${styles.fileButton}`}>
        {t('communityAdmin.chooseFile')}
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className={styles.fileInput}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void upload(file);
          }}
        />
      </label>
      {loaded && (
        <p className={forms.hint} role="status">
          {loaded}
        </p>
      )}
      <label className={forms.field}>
        <span className={forms.label}>{t('communityAdmin.sheet')}</span>
        <select
          className={forms.select}
          value={sheet}
          onChange={(e) => {
            const next = e.target.value as ImportSheet;
            setSheet(next);
            setRows(null);
            if (texts[next])
              void store
                .admin('admin:import:preview', { sheet: next, text: texts[next] })
                .then((r) => setRows(r.rows))
                .catch(onError);
          }}
        >
          <option value="cakes">{t('communityAdmin.sheetCakes')}</option>
          <option value="birthdays">{t('communityAdmin.sheetBirthdays')}</option>
          <option value="attendance">{t('communityAdmin.sheetAttendance')}</option>
        </select>
      </label>
      <label className={forms.field}>
        <span className={forms.label}>{t('communityAdmin.paste')}</span>
        <textarea
          className={forms.textarea}
          rows={6}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setRows(null);
            setResult(null);
          }}
        />
      </label>
      <div className={styles.buttonRow}>
        <button
          type="button"
          className={buttons.secondary}
          disabled={!text.trim()}
          onClick={() =>
            void store
              .admin('admin:import:preview', { sheet, text })
              .then((r) => setRows(r.rows))
              .catch(onError)
          }
        >
          {t('communityAdmin.preview')}
        </button>
        <button
          type="button"
          className={buttons.primary}
          disabled={!rows || rows.every((r) => r.error)}
          onClick={() =>
            void store
              .admin('admin:import:commit', { sheet, text })
              .then((r) => {
                setResult(t('communityAdmin.imported', r));
                setRows(null);
              })
              .catch(onError)
          }
        >
          {t('communityAdmin.commit')}
        </button>
      </div>
      {result && (
        <p className={forms.hint} role="status">
          {result}
        </p>
      )}
      {rows && (
        <ul className={styles.rows} aria-label={t('communityAdmin.preview')}>
          {rows.map((r) => (
            <li key={r.line} className={styles.row}>
              <div className={styles.rowMain}>
                <span className={styles.rowTitle}>
                  {r.name || '?'}{' '}
                  <span className={styles.role}>
                    {r.personId ? t('communityAdmin.matched') : t('communityAdmin.newGuest')}
                  </span>
                </span>
                <span className={`${styles.rowMeta} num`}>
                  {r.error
                    ? t('communityAdmin.rowError', { line: r.line, error: r.error })
                    : sheet === 'attendance'
                      ? t('communityAdmin.rowAttendance', {
                          reason: r.reason,
                          date: r.date ? showDate(r.date) : '',
                        })
                      : t('communityAdmin.rowOk', {
                          reason: r.reason,
                          date: r.date ? showDate(r.date) : '',
                          status: t(`cards.status.${r.status === 'paid' ? 'paid' : 'owed'}`),
                        })}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Guests({ onError }: { onError: OnError }) {
  const store = getStore();
  const people = useChat((s) => s.community?.people ?? []);
  const guests = people.filter((p) => !p.userId);
  const members = people.filter((p) => p.userId);
  const [name, setName] = useState('');
  const [mergeInto, setMergeInto] = useState<Record<string, string>>({});

  return (
    <section>
      <h3 className={styles.sectionTitle}>{t('communityAdmin.guestsTitle')}</h3>
      <p className={forms.hint}>{t('communityAdmin.guestsHint')}</p>
      <ul className={styles.rows}>
        {guests.length === 0 && <li className={styles.empty}>{t('communityAdmin.noGuests')}</li>}
        {guests.map((g) => (
          <li key={g.id} className={styles.row}>
            <div className={styles.rowMain}>
              <span className={styles.rowTitle}>{g.name}</span>
            </div>
            <select
              className={forms.select}
              aria-label={t('communityAdmin.mergeInto', { name: g.name })}
              value={mergeInto[g.id] ?? ''}
              onChange={(e) => setMergeInto({ ...mergeInto, [g.id]: e.target.value })}
            >
              <option value="">{t('communityAdmin.pickMember')}</option>
              {members.map((m) => (
                <option key={m.id} value={m.userId!}>
                  {m.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={buttons.secondary}
              disabled={!mergeInto[g.id]}
              onClick={() =>
                void store
                  .admin('admin:people:merge', { guestId: g.id, userId: mergeInto[g.id]! })
                  .catch(onError)
              }
            >
              {t('communityAdmin.merge')}
            </button>
          </li>
        ))}
      </ul>
      <form
        className={styles.inviteForm}
        onSubmit={(e) => {
          e.preventDefault();
          void store
            .admin('admin:people:addGuest', { name: name.trim() })
            .then(() => setName(''))
            .catch(onError);
        }}
      >
        <label className={forms.field}>
          <span className={forms.label}>{t('communityAdmin.guestName')}</span>
          <input
            className={forms.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            minLength={2}
            maxLength={32}
            required
          />
        </label>
        <button type="submit" className={buttons.secondary}>
          {t('communityAdmin.addGuest')}
        </button>
      </form>
    </section>
  );
}

function Team() {
  const store = getStore();
  const people = useChat((s) => s.community?.people ?? []);
  return (
    <section>
      <h3 className={styles.sectionTitle}>{t('communityAdmin.teamTitle')}</h3>
      <p className={forms.hint}>{t('communityAdmin.teamHint')}</p>
      <ul className={styles.rows}>
        {people.map((p) => (
          <li key={p.id} className={styles.row}>
            <label className={forms.check}>
              <input
                type="checkbox"
                checked={p.inTeam}
                onChange={(e) =>
                  void store.act('admin:people:setTeam', {
                    personId: p.id,
                    inTeam: e.target.checked,
                  })
                }
              />
              <span>{p.name}</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Limit({ onError }: { onError: OnError }) {
  const store = getStore();
  const current = useChat((s) => s.community?.settings.noshowLimit ?? 3);
  const [value, setValue] = useState(current);
  return (
    <section>
      <h3 className={styles.sectionTitle}>{t('communityAdmin.limitTitle')}</h3>
      <form
        className={styles.inviteForm}
        onSubmit={(e) => {
          e.preventDefault();
          void store.admin('admin:settings:update', { noshowLimit: value }).catch(onError);
        }}
      >
        <label className={forms.field}>
          <span className={forms.label}>{t('communityAdmin.limit')}</span>
          <input
            className={forms.input}
            type="number"
            min={1}
            max={20}
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
          />
        </label>
        <button type="submit" className={buttons.secondary}>
          {t('moderation.save')}
        </button>
      </form>
    </section>
  );
}
