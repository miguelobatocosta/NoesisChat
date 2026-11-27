import { DEFAULT_DND, saveDnd, tomorrowMorning, useDnd } from '../../lib/dnd';
import { t } from '../../i18n';
import buttons from '../../ui/buttons.module.css';
import { Dialog } from '../../ui/Dialog';
import forms from '../../ui/forms.module.css';
import styles from './DndDialog.module.css';

/** Do not disturb on this device: quick pauses, daily quiet hours, quiet weekends. */
export function DndDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dnd = useDnd();
  const pause = (until: number | null) => saveDnd({ ...dnd, until });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('dnd.title')}
      closeLabel={t('rules.close')}
      size="sm"
    >
      <p className={forms.hint}>{t('dnd.intro')}</p>
      <div className={styles.quick}>
        <button
          type="button"
          className={buttons.secondary}
          onClick={() => pause(Date.now() + 3_600_000)}
        >
          {t('dnd.hour')}
        </button>
        <button
          type="button"
          className={buttons.secondary}
          onClick={() => pause(tomorrowMorning(Date.now()))}
        >
          {t('dnd.tomorrow')}
        </button>
        <button type="button" className={buttons.secondary} onClick={() => saveDnd(DEFAULT_DND)}>
          {t('dnd.off')}
        </button>
      </div>

      <label className={forms.check}>
        <input
          type="checkbox"
          checked={dnd.schedule.enabled}
          onChange={(e) =>
            saveDnd({ ...dnd, schedule: { ...dnd.schedule, enabled: e.target.checked } })
          }
        />
        <span>{t('dnd.schedule')}</span>
      </label>
      <div className={styles.times}>
        <label className={forms.field}>
          <span className={forms.label}>{t('dnd.from')}</span>
          <input
            className={forms.input}
            type="time"
            value={dnd.schedule.from}
            disabled={!dnd.schedule.enabled}
            onChange={(e) =>
              e.target.value &&
              saveDnd({ ...dnd, schedule: { ...dnd.schedule, from: e.target.value } })
            }
          />
        </label>
        <label className={forms.field}>
          <span className={forms.label}>{t('dnd.to')}</span>
          <input
            className={forms.input}
            type="time"
            value={dnd.schedule.to}
            disabled={!dnd.schedule.enabled}
            onChange={(e) =>
              e.target.value &&
              saveDnd({ ...dnd, schedule: { ...dnd.schedule, to: e.target.value } })
            }
          />
        </label>
      </div>
      <label className={forms.check}>
        <input
          type="checkbox"
          checked={dnd.weekends}
          onChange={(e) => saveDnd({ ...dnd, weekends: e.target.checked })}
        />
        <span>{t('dnd.weekends')}</span>
      </label>
    </Dialog>
  );
}
