import { describe, expect, it } from 'vitest';
import {
  businessDateKey,
  businessWeekStart,
  isSameBusinessDay,
  shiftBusinessDate,
} from './businessDate';

describe('Asia/Shanghai business dates', () => {
  it('changes dates exactly at Shanghai midnight', () => {
    const beforeMidnight = new Date('2026-07-22T15:59:59.999Z');
    const atMidnight = new Date('2026-07-22T16:00:00.000Z');

    expect(businessDateKey(beforeMidnight)).toBe('2026-07-22');
    expect(businessDateKey(atMidnight)).toBe('2026-07-23');
    expect(isSameBusinessDay(beforeMidnight, atMidnight)).toBe(false);
    expect(isSameBusinessDay(atMidnight, new Date('2026-07-23T15:59:59.999Z'))).toBe(true);
  });

  it('uses Monday as the start of the Shanghai business week', () => {
    expect(businessWeekStart(new Date('2026-07-19T16:00:00.000Z'))).toBe('2026-07-20');
    expect(businessWeekStart(new Date('2026-07-26T15:59:59.999Z'))).toBe('2026-07-20');
    expect(businessWeekStart(new Date('2026-07-26T16:00:00.000Z'))).toBe('2026-07-27');
  });

  it('shifts calendar dates without depending on the host timezone', () => {
    expect(shiftBusinessDate('2026-12-28', 13)).toBe('2027-01-10');
    expect(shiftBusinessDate('2024-02-28', 1)).toBe('2024-02-29');
  });
});
