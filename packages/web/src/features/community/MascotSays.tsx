import { MAIN_MASCOT, MAIN_ROOM_ID, type MascotKey } from '@pausa/shared';
import { useChat } from '../../state/store';
import { Mascot } from '../mascots/Mascot';
import styles from './Community.module.css';

/** The #geral mascot (the voice of cakes and office days, D-55) and its key, for the bubble lines. */
export function useHostMascot(): MascotKey {
  return useChat((s) => s.rooms[MAIN_ROOM_ID]?.mascotKey ?? MAIN_MASCOT);
}

/**
 * The page's signature (Phase 19): the #geral mascot, big, with a speech bubble that comments on
 * what's going on right now, in its own voice.
 */
export function MascotSays({
  mascot,
  line,
  name,
}: {
  mascot: MascotKey;
  line: string;
  name: string;
}) {
  return (
    <figure className={styles.says}>
      <Mascot mascot={mascot} size={112} className={styles.saysArt} />
      <blockquote className={styles.bubble}>
        <p>{line}</p>
        <footer className={styles.bubbleWho}>{name}</footer>
      </blockquote>
    </figure>
  );
}
