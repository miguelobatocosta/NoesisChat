import { t } from '../i18n';
import { getStore, useChat } from '../state/store';
import styles from './Toast.module.css';

export function Toast() {
  const toast = useChat((s) => s.toast);
  if (!toast) return null;
  return (
    <div
      className={styles.toast}
      role="alert"
      key={toast.id}
      onClick={() => getStore().dismissToast()}
    >
      {t(`errors.${toast.code}`)}
    </div>
  );
}
