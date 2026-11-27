import { describe, expect, it } from 'vitest';
import { readXlsx, sheetKind } from '../src/lib/xlsx';

/** Builds a minimal zip (stored entries, no compression) — enough for the reader. */
function zip(files: Record<string, string>): Blob {
  const enc = new TextEncoder();
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const n = enc.encode(name);
    const data = enc.encode(content);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint32(18, data.length, true);
    lh.setUint32(22, data.length, true);
    lh.setUint16(26, n.length, true);
    local.push(new Uint8Array(lh.buffer), n, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint32(20, data.length, true);
    ch.setUint32(24, data.length, true);
    ch.setUint16(28, n.length, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), n);
    offset += 30 + n.length + data.length;
  }
  const size = central.reduce((s, c) => s + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, Object.keys(files).length, true);
  end.setUint16(10, Object.keys(files).length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  // TextEncoder output is typed as ArrayBufferLike-backed; Blob wants plain ArrayBuffer views.
  return new Blob([...local, ...central, new Uint8Array(end.buffer)] as BlobPart[]);
}

describe('readXlsx', () => {
  it('reads sheets as tab-separated text: shared, inline and numeric cells, gaps kept', async () => {
    const file = zip({
      'xl/workbook.xml':
        '<workbook><sheets><sheet name="Aniversários" sheetId="1" r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels':
        '<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>',
      'xl/sharedStrings.xml':
        '<sst><si><t>Data</t></si><si><r><t>Vítor </t></r><r><t>Castro</t></r></si><si><t>Ok &amp; pago</t></si></sst>',
      'xl/worksheets/sheet1.xml':
        '<worksheet><sheetData>' +
        '<row r="1"><c r="A1" t="s"><v>0</v></c></row>' +
        '<row r="2"><c r="A2"><v>46138</v></c><c r="B2" t="s"><v>1</v></c><c r="D2" t="inlineStr"><is><t>extra</t></is></c></row>' +
        '<row r="3"><c r="C3" t="s"><v>2</v></c></row>' +
        '</sheetData></worksheet>',
    });
    expect(await readXlsx(file)).toEqual({
      Aniversários: 'Data\n46138\tVítor Castro\t\textra\n\t\tOk & pago',
    });
  });

  it('rejects files that aren’t a zip', async () => {
    await expect(readXlsx(new Blob(['not an excel file']))).rejects.toThrow();
  });
});

describe('sheetKind', () => {
  it('maps the team’s sheet names, with or without accents', () => {
    expect(sheetKind('Bolos Outros')).toBe('cakes');
    expect(sheetKind('Aniversários')).toBe('birthdays');
    expect(sheetKind('Presencas')).toBe('attendance');
    expect(sheetKind('Presenças')).toBe('attendance');
    expect(sheetKind('Equipa')).toBeNull();
  });
});
