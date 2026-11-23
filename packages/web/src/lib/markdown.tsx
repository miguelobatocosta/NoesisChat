import { Fragment, type ReactNode } from 'react';

/**
 * The message markdown subset (SPEC §3.3), rendered straight to React elements. There is no HTML
 * string anywhere: React escapes all text, links are only ever http(s), and there's no
 * dangerouslySetInnerHTML (CLAUDE.md rule 5).
 *
 *   ```fenced code```   `inline code`   **bold**   _italic_   https://auto.links   <@USER_ULID>   line breaks
 */

export interface RenderOptions {
  nameOf: (userId: string) => string;
  meId?: string;
}

const FENCE = /```(?:[a-zA-Z0-9_+-]*\n)?([\s\S]*?)```/g;

// Order matters: code first (its content is literal), then mentions and links, then emphasis.
const INLINE =
  /(`[^`\n]+`)|(<@[0-9A-HJKMNP-TV-Z]{26}>)|(https?:\/\/[^\s<>"'`]+)|(\*\*(?=\S)[\s\S]*?\S\*\*)|((?<![\p{L}\p{N}_])_(?=\S)[^_\n]*?\S_(?![\p{L}\p{N}_]))/gu;

/** Trailing punctuation usually belongs to the sentence, not the URL. */
function splitTrailing(url: string): [string, string] {
  let end = url.length;
  while (end > 0 && /[.,!?;:)\]}]/.test(url[end - 1]!)) {
    if (
      url[end - 1] === ')' &&
      (url.slice(0, end).match(/\(/g)?.length ?? 0) >= (url.slice(0, end).match(/\)/g)?.length ?? 0)
    ) {
      break;
    }
    end--;
  }
  return [url.slice(0, end), url.slice(end)];
}

export function safeHttpUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function withBreaks(text: string, key: string): ReactNode[] {
  const lines = text.split('\n');
  return lines.flatMap((line, i) => (i === 0 ? [line] : [<br key={`${key}-br${i}`} />, line]));
}

function renderInline(
  text: string,
  opts: RenderOptions,
  keyPrefix: string,
  depth = 0,
): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const match of text.matchAll(INLINE)) {
    const start = match.index;
    if (start > last) out.push(...withBreaks(text.slice(last, start), `${keyPrefix}-t${i}`));
    const key = `${keyPrefix}-${i++}`;
    const [whole, code, mention, url, bold, italic] = match;

    if (code) {
      out.push(<code key={key}>{code.slice(1, -1)}</code>);
    } else if (mention) {
      const id = mention.slice(2, -1);
      out.push(
        <span
          key={key}
          className={id === opts.meId ? 'mention mention-me' : 'mention'}
          data-user-id={id}
        >
          @{opts.nameOf(id)}
        </span>,
      );
    } else if (url) {
      const [href, trailing] = splitTrailing(url);
      const safe = safeHttpUrl(href);
      if (safe) {
        out.push(
          <a key={key} href={safe} target="_blank" rel="noopener noreferrer">
            {href}
          </a>,
        );
      } else out.push(href);
      if (trailing) out.push(trailing);
    } else if (bold && depth < 4) {
      out.push(<strong key={key}>{renderInline(bold.slice(2, -2), opts, key, depth + 1)}</strong>);
    } else if (italic && depth < 4) {
      out.push(<em key={key}>{renderInline(italic.slice(1, -1), opts, key, depth + 1)}</em>);
    } else {
      out.push(whole);
    }
    last = start + whole.length;
  }
  if (last < text.length) out.push(...withBreaks(text.slice(last), `${keyPrefix}-tail`));
  return out;
}

export function renderMarkdown(body: string, opts: RenderOptions): ReactNode {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const match of body.matchAll(FENCE)) {
    if (match.index > last)
      out.push(...renderInline(trimFenceGap(body.slice(last, match.index)), opts, `b${i}`));
    out.push(
      <pre key={`pre${i}`}>
        <code>{match[1]!.replace(/\n$/, '')}</code>
      </pre>,
    );
    last = match.index + match[0].length;
    i++;
  }
  if (last < body.length) out.push(...renderInline(trimFenceGap(body.slice(last)), opts, `b${i}`));
  return <Fragment>{out}</Fragment>;
}

/** Drop the single newline that separates text from a code block, so there's no blank line. */
function trimFenceGap(text: string): string {
  return text.replace(/^\n/, '').replace(/\n$/, '');
}

const EMOJI_ONLY =
  /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|\p{Regional_Indicator}|‍|️|\s)+$/u;

/** 1–3 emoji and nothing else: shown bigger. */
export function isJumboEmoji(body: string): boolean {
  const trimmed = body.trim();
  if (!trimmed || !EMOJI_ONLY.test(trimmed) || /[0-9#*]/.test(trimmed)) return false;
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const count = [...segmenter.segment(trimmed)].filter((s) => s.segment.trim()).length;
  return count >= 1 && count <= 3;
}
