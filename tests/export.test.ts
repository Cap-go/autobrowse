import { describe, expect, test } from 'bun:test';
import { parseCsv, safeFilename } from '../src/ui/export';

describe('export helpers', () => {
  test('parses quoted CSV with commas, quotes and newlines', () => {
    const rows = parseCsv('name,price\n"Mule, black",275\n"Say ""hi""","1\n2"\n');
    expect(rows).toEqual([['name', 'price'], ['Mule, black', '275'], ['Say "hi"', '1\n2']]);
  });

  test('sanitizes file names', () => {
    expect(safeFilename('a/b:c.csv')).toBe('a-b-c.csv');
    expect(safeFilename('report', 'csv')).toBe('report.csv');
  });
});
