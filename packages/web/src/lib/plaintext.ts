import { MENTION_TOKEN_RE } from '@pausa/shared';

/** One-line preview for notifications and reply quotes: mentions → @Name, markdown markers stripped. */
export function plainText(
  body: string | null,
  nameOf: (userId: string) => string,
  max = 140,
): string {
  if (!body) return '';
  const text = body
    .replace(/```[a-zA-Z0-9]*\n?([\s\S]*?)```/g, '$1')
    .replace(MENTION_TOKEN_RE, (_m, id: string) => `@${nameOf(id)}`)
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(^|\W)_(.+?)_(?=\W|$)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
