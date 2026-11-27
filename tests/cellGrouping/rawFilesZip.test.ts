/**
 * The raw LFP per-cell files are saved with each run as one ZIP (database/24_cell_grouping_raw_inputs.sql).
 */
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { rawFilesZip } from '../../src/lib/cellGrouping/reportFiles.ts';

const bytes = (s: string) => new TextEncoder().encode(s);
const text = (b: Uint8Array) => new TextDecoder().decode(b);

describe('rawFilesZip', () => {
  it('keeps every file byte for byte, under its own name', () => {
    const binary = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0x00, 0xff, 0x7f]); // start of an .xls
    const zip = rawFilesZip([
      { name: '01-2-1.xls', data: binary },
      { name: '01-2-2.csv', data: bytes('Cycle,Capacity\n1,2.61\n') },
    ]);
    const out = unzipSync(zip);
    expect(Object.keys(out).sort()).toEqual(['01-2-1.xls', '01-2-2.csv']);
    expect([...out['01-2-1.xls']]).toEqual([...binary]);
    expect(text(out['01-2-2.csv'])).toBe('Cycle,Capacity\n1,2.61\n');
  });

  it('numbers a repeated name instead of overwriting it', () => {
    const out = unzipSync(
      rawFilesZip([
        { name: 'ch1.xlsx', data: bytes('a') },
        { name: 'ch1.xlsx', data: bytes('b') },
        { name: 'ch1.xlsx', data: bytes('c') },
        { name: 'README', data: bytes('d') },
        { name: 'README', data: bytes('e') },
      ]),
    );
    expect(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, text(v)]))).toEqual({
      'ch1.xlsx': 'a',
      'ch1 (2).xlsx': 'b',
      'ch1 (3).xlsx': 'c',
      README: 'd',
      'README (2)': 'e',
    });
  });

  it('drops any folder part of the name', () => {
    const out = unzipSync(rawFilesZip([{ name: 'C:\\exports\\day1/ch7.xls', data: bytes('x') }]));
    expect(Object.keys(out)).toEqual(['ch7.xls']);
  });
});
