import { formatChartCreateTime, normalizeChartNameKeyword } from './viewUtils';

describe('MyChart view utils', () => {
  it('normalizes search keyword by trimming spaces', () => {
    expect(normalizeChartNameKeyword('  销量趋势  ')).toBe('销量趋势');
  });

  it('returns undefined for empty search keyword', () => {
    expect(normalizeChartNameKeyword('   ')).toBeUndefined();
    expect(normalizeChartNameKeyword(undefined)).toBeUndefined();
  });

  it('returns fallback text when createTime is missing or invalid', () => {
    expect(formatChartCreateTime(undefined)).toBe('时间未知');
    expect(formatChartCreateTime('not-a-date')).toBe('时间未知');
  });

  it('formats valid createTime', () => {
    expect(formatChartCreateTime('2026-02-25T08:00:00Z')).toBe('02/25 08:00');
  });
});
