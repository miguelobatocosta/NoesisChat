import { APP_NAME } from '@pausa/shared';
import { t } from '../../i18n';
import { Dialog } from '../../ui/Dialog';
import styles from './Rules.module.css';

/** House rules and privacy note (SPEC §3.7), shared by the join page and the user menu. */
export function RulesContent() {
  return (
    <div className={styles.rules}>
      <p>{t('rules.intro')}</p>
      <ul>
        <li>{t('rules.rule1')}</li>
        <li>{t('rules.rule2')}</li>
        <li>{t('rules.rule3')}</li>
        <li>{t('rules.rule4')}</li>
      </ul>
      <h3 className={styles.heading}>{t('rules.privacyTitle')}</h3>
      <ul>
        <li>{t('rules.privacy1', { app: APP_NAME })}</li>
        <li>
          <strong>{t('rules.privacy2')}</strong>
        </li>
        <li>{t('rules.privacy3')}</li>
        <li>{t('rules.privacy4')}</li>
      </ul>
    </div>
  );
}

export function RulesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title={t('rules.title')} closeLabel={t('rules.close')}>
      <RulesContent />
    </Dialog>
  );
}
