declare const brand: unique symbol;

/** A whole, non-negative number of nanoskill points. */
export type SkillPoints = number & { readonly [brand]: 'SkillPoints' };

export function parseSkillPoints(input: string | number): SkillPoints {
  const text = typeof input === 'number' ? String(input) : input.trim();
  if (!/^\d+$/.test(text)) {
    throw new Error(`'${input}' is not a whole number of skill points (0 or more)`);
  }
  return Number(text) as SkillPoints;
}
