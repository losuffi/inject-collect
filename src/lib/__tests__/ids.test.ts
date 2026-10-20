import { describe, it, expect } from 'vitest';
import { nextCaseId } from '../ids';

describe('病例编号', () => {
  it('C + YYMMDD + 当日序号', () => {
    const d = new Date(2026, 9, 16, 10, 0);
    expect(nextCaseId(d, [])).toBe('C261016-01');
    expect(nextCaseId(d, ['C261016-01', 'C261016-03', 'C261015-07'])).toBe('C261016-04');
  });
});
