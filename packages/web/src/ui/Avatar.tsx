import { avatarColor, initials } from '../lib/avatar';
import styles from './Avatar.module.css';

export function Avatar({
  userId,
  name,
  size = 32,
}: {
  userId: string;
  name: string;
  size?: 24 | 32 | 36;
}) {
  return (
    <span
      className={styles.avatar}
      style={{
        width: size,
        height: size,
        fontSize: size <= 24 ? 10 : 13,
        background: avatarColor(userId),
      }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
