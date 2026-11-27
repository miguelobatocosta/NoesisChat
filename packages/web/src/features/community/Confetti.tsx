import styles from './Community.module.css';

const PIECES = ['🎂', '🎉', '🍰', '✨', '🎂', '🧁', '🎉', '✨', '🍰', '🎂', '🎊', '🧁'];

/**
 * A one-second shower of cake when a debt is paid: the one animated moment on the Bolos page.
 * Pure CSS, decorative (aria-hidden), and gone under prefers-reduced-motion.
 */
export function Confetti({ burst }: { burst: number }) {
  if (!burst) return null;
  return (
    <div key={burst} className={styles.confetti} aria-hidden="true">
      {PIECES.map((p, i) => (
        <span
          key={i}
          className={styles.piece}
          style={{ left: `${6 + ((i * 83) % 88)}%`, animationDelay: `${(i % 6) * 60}ms` }}
        >
          {p}
        </span>
      ))}
    </div>
  );
}
