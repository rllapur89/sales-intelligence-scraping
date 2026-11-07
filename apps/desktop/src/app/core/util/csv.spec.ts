import { csvField, leadsToCsv, LEAD_CSV_HEADER } from './csv';
import { makeLead } from '../../../testing/factories';

describe('csv', () => {
  it('escapes commas, quotes and newlines', () => {
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('l1\nl2')).toBe('"l1\nl2"');
  });

  it('neutralises spreadsheet formulas in text', () => {
    expect(csvField('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvField(-5)).toBe('-5');
  });

  it('renders null and undefined as empty', () => {
    expect(csvField(null)).toBe('');
    expect(csvField(undefined)).toBe('');
  });

  it('exports company columns only (no personal fields)', () => {
    const csv = leadsToCsv([
      makeLead({
        id: '1',
        score: 77,
        stage: 'qualified',
        signalTypes: ['hiring', 'funding'],
        signalCount: 4,
        company: { name: 'Acme, Inc', domain: 'acme.com', industry: 'Tech', region: 'EU', size: 'smb' },
      }),
    ]);
    const [header, row] = csv.split('\n');
    expect(header).toBe(LEAD_CSV_HEADER.join(','));
    expect(header).not.toMatch(/email|phone|linkedin|first|last/i);
    expect(row).toBe('"Acme, Inc",acme.com,Tech,EU,smb,hiring|funding,4,77,qualified,2024-01-01T00:00:00.000Z');
  });
});
