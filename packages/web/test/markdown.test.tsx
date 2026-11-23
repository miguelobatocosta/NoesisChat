import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { isJumboEmoji, renderMarkdown, safeHttpUrl } from '../src/lib/markdown';

const ANA = '01JA0000000000000000000000';
const html = (body: string) =>
  renderToStaticMarkup(
    <>{renderMarkdown(body, { nameOf: (id) => (id === ANA ? 'Ana' : '?'), meId: ANA })}</>,
  );

describe('markdown subset', () => {
  it('bold, italic, inline code, line breaks', () => {
    expect(html('**olá** _mundo_ `x = 1`\nfim')).toBe(
      '<strong>olá</strong> <em>mundo</em> <code>x = 1</code><br/>fim',
    );
  });

  it('nested emphasis', () => {
    expect(html('**muito _bom_**')).toBe('<strong>muito <em>bom</em></strong>');
  });

  it('leaves snake_case words alone', () => {
    expect(html('use my_var_name aqui')).toBe('use my_var_name aqui');
  });

  it('fenced code is literal, including markdown and mentions inside', () => {
    expect(html('antes\n```js\n**não** <@' + ANA + '>\n```\ndepois')).toBe(
      'antes<pre><code>**não** &lt;@' + ANA + '&gt;</code></pre>depois',
    );
  });

  it('auto-links http(s) and keeps trailing punctuation outside', () => {
    expect(html('vê https://example.com/a?b=1.')).toBe(
      'vê <a href="https://example.com/a?b=1" target="_blank" rel="noopener noreferrer">https://example.com/a?b=1</a>.',
    );
  });

  it('keeps balanced parentheses in URLs', () => {
    expect(html('(https://pt.wikipedia.org/wiki/Bacalhau_(peixe))')).toContain(
      'href="https://pt.wikipedia.org/wiki/Bacalhau_(peixe)"',
    );
  });

  it('renders mentions with the current display name, marking mine', () => {
    expect(html(`olá <@${ANA}>`)).toBe(
      `olá <span class="mention mention-me" data-user-id="${ANA}">@Ana</span>`,
    );
  });
});

describe('XSS: nothing becomes markup', () => {
  it.each([
    ['<img src=x onerror=alert(1)>', '&lt;img src=x onerror=alert(1)&gt;'],
    ['<script>alert(1)</script>', '&lt;script&gt;alert(1)&lt;/script&gt;'],
    ['[clica](javascript:alert(1))', '[clica](javascript:alert(1))'],
    ['javascript:alert(1)', 'javascript:alert(1)'],
    [
      '**<b onmouseover=alert(1)>x</b>**',
      '<strong>&lt;b onmouseover=alert(1)&gt;x&lt;/b&gt;</strong>',
    ],
    ['`<svg onload=alert(1)>`', '<code>&lt;svg onload=alert(1)&gt;</code>'],
  ])('%s', (input, expected) => {
    expect(html(input)).toBe(expected);
  });

  it('a link never gets a non-http href', () => {
    expect(html('https://x.com/"onmouseover="alert(1)')).not.toContain('onmouseover="alert');
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpUrl('data:text/html,<script>')).toBeNull();
  });
});

describe('jumbo emoji', () => {
  it.each([
    ['👍', true],
    ['🎉🎉🎉', true],
    ['👍 👍', true],
    ['🎉🎉🎉🎉', false],
    ['ok 👍', false],
    ['123', false],
  ])('%s → %s', (body, expected) => expect(isJumboEmoji(body)).toBe(expected));
});
