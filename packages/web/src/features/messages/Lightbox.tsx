import type { Attachment } from '@pausa/shared';
import { t } from '../../i18n';
import { getStore } from '../../state/store';
import { Dialog } from '../../ui/Dialog';
import styles from './Lightbox.module.css';

export function Lightbox({
  attachment,
  authorId,
  onClose,
}: {
  attachment: Attachment;
  authorId: string;
  onClose: () => void;
}) {
  const alt = t('message.image', { name: getStore().nameOf(authorId) });
  return (
    <Dialog open onClose={onClose} title={alt} closeLabel={t('rules.close')} size="lg">
      <a href={attachment.url} target="_blank" rel="noopener noreferrer" className={styles.link}>
        <img src={attachment.url} alt={alt} className={styles.image} />
      </a>
    </Dialog>
  );
}
