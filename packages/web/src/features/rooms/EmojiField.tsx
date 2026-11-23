import { useState } from 'react';
import { t } from '../../i18n';
import buttons from '../../ui/buttons.module.css';
import forms from '../../ui/forms.module.css';
import { EmojiPicker } from '../composer/EmojiPicker';
import styles from './EmojiField.module.css';

export function EmojiField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={forms.field}>
      <span className={forms.label}>{label}</span>
      <div className={styles.row}>
        <span className={styles.anchor}>
          <button
            type="button"
            className={buttons.secondary}
            aria-label={label}
            disabled={disabled}
            onClick={() => setOpen((o) => !o)}
          >
            <span className={styles.preview}>{value ?? '#'}</span>
          </button>
          {open && (
            <EmojiPicker
              align="right"
              onPick={(e) => {
                onChange(e);
                setOpen(false);
              }}
              onClose={() => setOpen(false)}
            />
          )}
        </span>
        {value && !disabled && (
          <button type="button" className={buttons.ghost} onClick={() => onChange(null)}>
            {t('roomSettings.clearEmoji')}
          </button>
        )}
      </div>
    </div>
  );
}
