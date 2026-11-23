import type { MascotKey } from '@pausa/shared';
import lines from './lines.pt-PT.json';

/** A mascot's script. Placeholders: {name} = the person it answers, {room} = #slug. */
export interface MascotScript {
  /** Words in a message that count as calling it by name. */
  names: string[];
  /** Said once, when it arrives in a new room. */
  intro: string[];
  /** Answer to an @mention or its name. */
  mention: string[];
  /** Keyword groups: the first group with a match wins. */
  triggers: { words: string[]; lines: string[] }[];
}

/** pt-PT only for now; another locale is one more JSON file (CLAUDE.md rule 7, applied server-side). */
export const MASCOT_LINES: Record<MascotKey, MascotScript> = lines;
