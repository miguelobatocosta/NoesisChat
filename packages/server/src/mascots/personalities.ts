import type { MascotKey } from '@pausa/shared';

/**
 * How each mascot behaves, beyond what it says (Phase 18). Lines live in lines.pt-PT.json; this is
 * the temperament: how often it chimes in, how fast it types, whether it ignores you, and the emoji
 * it leaves on messages now and then.
 */
export interface Personality {
  /** Multiplies MASCOT_CHANCE for keyword reactions. */
  chance: number;
  /** Multiplies MASCOT_DELAY_MS: the granny types slowly, the squirrel instantly. */
  delay: number;
  /** Chance it ignores an @mention on purpose (the grumpy cat). */
  ignore: number;
  /** Chance it leaves a reaction on a message it didn't answer (also cooled down per room). */
  react: number;
  emojis: readonly string[];
}

export const PERSONALITIES: Record<MascotKey, Personality> = {
  // Mãe implicativa: comments a lot, quick to notice, side-eye.
  lurdes: { chance: 1.3, delay: 0.8, ignore: 0, react: 0.08, emojis: ['👀', '🙄', '❤️'] },
  // Avó fofinha: slow, never ignores you, hearts everywhere.
  ferreira: { chance: 1, delay: 2.2, ignore: 0, react: 0.12, emojis: ['❤️', '🥰', '😘'] },
  // Resmungão: rarely bothers, sometimes doesn't answer at all.
  nuvem: { chance: 0.5, delay: 1.5, ignore: 0.3, react: 0.06, emojis: ['🙄', '😾', '💤'] },
  // Alegre: in on everything, instantly, with fireworks.
  faisca: { chance: 1.6, delay: 0.3, ignore: 0, react: 0.15, emojis: ['🎉', '🔥', '⚡', '🙌'] },
  // Contente bonacheirão: happy to be there.
  bolacha: { chance: 1.2, delay: 0.7, ignore: 0, react: 0.12, emojis: ['🐶', '💛', '😊'] },
  // Tio das piadas secas: laughs at his own jokes, and yours.
  pixel: { chance: 1.1, delay: 1, ignore: 0, react: 0.1, emojis: ['😂', '🐙', '🤓'] },
};

/** The grumpy cat sometimes answers an ignored mention with just this. */
export const GRUMPY_SILENCE = '…';
