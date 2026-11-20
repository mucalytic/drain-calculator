import { describe, expect, it } from 'vitest';
import { parseSkillPoints } from './skill';

describe('parseSkillPoints', () => {
  it('accepts a whole number', () => {
    expect(parseSkillPoints(300)).toBe(300);
  });

  it('accepts text with surrounding spaces', () => {
    expect(parseSkillPoints(' 1801 ')).toBe(1801);
  });

  it('accepts zero', () => {
    expect(parseSkillPoints('0')).toBe(0);
  });

  it.each(['', 'abc', '12.5', '-1', '1e3', 'NaN'])('rejects %j', (input) => {
    expect(() => parseSkillPoints(input)).toThrow(/whole number/);
  });

  it.each([-5, 2.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects the number %d', (input) => {
    expect(() => parseSkillPoints(input)).toThrow(/whole number/);
  });
});
