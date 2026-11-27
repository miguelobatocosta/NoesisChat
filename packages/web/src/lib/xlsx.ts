/**
 * Minimal .xlsx reader for the Excel import (D-53), with no dependency: an .xlsx is a zip of XML
 * files. Unzips with the browser's DecompressionStream('deflate-raw'), reads shared strings and
 * each sheet's cells, and returns every sheet as tab-separated text (what an Excel copy gives),
 * dates left as Excel serial numbers (the server understands those).
 */

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  localOffset: number;
}

function readEntries(buf: Uint8Array): ZipEntry[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a zip');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('bad zip directory');
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = decoder.decode(buf.subarray(p + 46, p + 46 + nameLen));
    entries.push({ name, method, compressedSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function readFile(buf: Uint8Array, e: ZipEntry): Promise<string> {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const start =
    e.localOffset +
    30 +
    view.getUint16(e.localOffset + 26, true) +
    view.getUint16(e.localOffset + 28, true);
  const data = buf.slice(start, start + e.compressedSize);
  if (e.method === 0) return new TextDecoder().decode(data);
  if (e.method !== 8) throw new Error('unsupported zip compression');
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

const unescapeXml = (s: string) =>
  s.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, e: string) => {
    if (e[0] === '#')
      return String.fromCodePoint(
        e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)),
      );
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e.toLowerCase()]!;
  });

/** Joins every <t>…</t> inside a fragment (rich text runs split a string into several). */
const texts = (xml: string) =>
  [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescapeXml(m[1]!)).join('');

const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function sheetToTsv(xml: string, shared: string[]): string {
  const rows: string[] = [];
  for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const c of row[1]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const tag = c[1]!;
      const body = c[2] ?? '';
      const ref = attr(tag, 'r');
      const type = attr(tag, 't');
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = '';
      if (type === 's' && v !== undefined) value = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') value = texts(body);
      else if (v !== undefined) value = unescapeXml(v);
      const i = ref ? columnIndex(ref) : cells.length;
      while (cells.length < i) cells.push('');
      cells[i] = value.replace(/[\t\r\n]+/g, ' ').trim();
    }
    if (cells.some((x) => x)) rows.push(cells.join('\t'));
  }
  return rows.join('\n');
}

/** Every sheet of an .xlsx as { name → tab-separated text }. */
export async function readXlsx(file: Blob): Promise<Record<string, string>> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const entries = readEntries(buf);
  const get = async (name: string) => {
    const e = entries.find((x) => x.name === name);
    return e ? readFile(buf, e) : '';
  };
  const shared = [...(await get('xl/sharedStrings.xml')).matchAll(/<si>([\s\S]*?)<\/si>/g)].map(
    (m) => texts(m[1]!),
  );
  const workbook = await get('xl/workbook.xml');
  const rels = await get('xl/_rels/workbook.xml.rels');
  const targets = new Map(
    [...rels.matchAll(/<Relationship\b([^>]*)\/?>/g)].map((m) => [
      attr(m[1]!, 'Id'),
      attr(m[1]!, 'Target'),
    ]),
  );
  const out: Record<string, string> = {};
  for (const m of workbook.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const name = unescapeXml(attr(m[1]!, 'name') ?? '');
    const target = targets.get(attr(m[1]!, 'r:id'));
    if (!name || !target) continue;
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
    out[name] = sheetToTsv(await get(path), shared);
  }
  return out;
}

const fold = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim();

/** Which import each sheet of the team's Excel feeds, by name ("Bolos Outros", "Aniversários", "Presenças"). */
export function sheetKind(name: string): 'cakes' | 'birthdays' | 'attendance' | null {
  const n = fold(name);
  if (n.startsWith('bolos')) return 'cakes';
  if (n.startsWith('aniversario')) return 'birthdays';
  if (n.startsWith('presenca')) return 'attendance';
  return null;
}
