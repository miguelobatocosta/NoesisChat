import { type Member, MENTION_TOKEN_RE, mentionToken } from '@pausa/shared';
import { expandShortcodes } from './emoji';

const WORD_CHAR = /[\p{L}\p{N}_]/u;

/**
 * Composer text → wire body: "@Ana Rita" becomes <@id> for active members (longest names first, so
 * "Ana Rita" wins over "Ana"), and :shortcodes: become emoji (D-32).
 */
export function toWire(text: string, members: Member[]): string {
  const names = members
    .filter((m) => m.active)
    .sort((a, b) => b.displayName.length - a.displayName.length);
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] === '@' && (i === 0 || !WORD_CHAR.test(text[i - 1]!))) {
      const rest = text.slice(i + 1);
      const hit = names.find(
        (m) =>
          rest.slice(0, m.displayName.length).toLocaleLowerCase('pt-PT') ===
            m.displayName.toLocaleLowerCase('pt-PT') &&
          !WORD_CHAR.test(rest[m.displayName.length] ?? ''),
      );
      if (hit) {
        out += mentionToken(hit.id);
        i += 1 + hit.displayName.length;
        continue;
      }
    }
    out += text[i];
    i++;
  }
  return expandShortcodes(out);
}

/** Wire body → editable composer text (tokens back to @Name). */
export function fromWire(body: string, nameOf: (id: string) => string): string {
  return body.replace(MENTION_TOKEN_RE, (_m, id: string) => `@${nameOf(id)}`);
}

export type Trigger = { kind: 'mention' | 'emoji'; query: string; start: number };

/** The autocomplete trigger right before the caret, if any. */
export function findTrigger(text: string, caret: number): Trigger | null {
  const before = text.slice(0, caret);
  const mention = /(?:^|\s)@([\p{L}\p{N}._-]{0,32})$/u.exec(before);
  if (mention)
    return { kind: 'mention', query: mention[1]!, start: caret - mention[1]!.length - 1 };
  const emoji = /(?:^|\s):([a-z0-9_+-]{2,30})$/.exec(before);
  if (emoji) return { kind: 'emoji', query: emoji[1]!, start: caret - emoji[1]!.length - 1 };
  return null;
}
