/** The two skill-drain nanolines. A Trader can have one drain from each running. */
export type DrainLine = 'divest' | 'plunder';

export const DRAIN_LINES: readonly DrainLine[] = ['divest', 'plunder'];

export interface Drain {
  readonly id: number;
  readonly name: string;
  readonly line: DrainLine;
  /** Position within its line, 0 = weakest. */
  readonly tier: number;
  readonly ql: number;
  /** Psychological modifications and Time and space must both be at least this. */
  readonly skillRequired: number;
  /** Amount taken from each of the target's attack and nano skills (positive number). */
  readonly targetDrain: number;
  /** Amount added to each of the Trader's attack and nano skills. */
  readonly selfBuff: number;
  /** Stacking order of the debuff on the target. */
  readonly stackingOrder: number;
  /** Stacking order of the self-buff on the Trader. */
  readonly selfBuffStackingOrder: number;
  readonly ncu: number;
  readonly selfBuffNcu: number;
  readonly nanoCost: number;
  readonly durationSeconds: number;
  /** Offence modifier taken from the target, and whether that applies to NPCs only. */
  readonly offenceDrain: number;
  readonly offenceDrainNpcOnly: boolean;
  /** Effects beyond the skill drain/buff, as text (e.g. critical chance). */
  readonly otherTargetEffects: readonly string[];
  readonly otherSelfEffects: readonly string[];
  /** A requirement the calculator cannot evaluate, exactly as the source prints it. */
  readonly unevaluatedRequirement: string | null;
  readonly sourceUrl: string;
  readonly dataPatch: string;
}

export type DrainCatalog = Readonly<Record<DrainLine, readonly Drain[]>>;
