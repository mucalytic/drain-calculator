import type { Drain, DrainCatalog, DrainLine } from './drain';
import type { SkillPoints } from './skill';

export interface Trader {
  /** Her Psychological modifications / Time and space (the lower of the two) with no drain running. */
  readonly skill: SkillPoints;
  /** Other temporary buffs to those skills, e.g. a wrangle. */
  readonly temporaryBuff: SkillPoints;
  /** Whether she meets requirements the calculator cannot evaluate. */
  readonly meetsUnevaluatedRequirements: boolean;
}

export type RunningDrains = Readonly<Record<DrainLine, Drain | null>>;

export interface LadderStep {
  readonly drain: Drain;
  /** The drain of the same line this cast replaces, if any. */
  readonly replaces: Drain | null;
  readonly skillBefore: number;
  readonly skillAfter: number;
  readonly runningBefore: RunningDrains;
  readonly runningAfter: RunningDrains;
}

export interface LadderPlan {
  readonly steps: readonly LadderStep[];
  readonly running: RunningDrains;
  /** Skill with no drain running: base plus temporary buffs. */
  readonly startingSkill: number;
  readonly finalSkill: number;
  readonly totalSelfBuff: number;
  readonly totalTargetDrain: number;
  readonly totalNanoCost: number;
}

export type OutOfReachReason = 'skill' | 'unevaluated-requirement';

export interface OutOfReachDrain {
  readonly drain: Drain;
  readonly reason: OutOfReachReason;
  /** Her skill at the top of the best ladder. */
  readonly skillAtTopOfLadder: number;
  /** skillRequired minus skillAtTopOfLadder. */
  readonly shortfall: number;
  /**
   * Fewest extra points of her own skill that make this drain reachable by
   * laddering, taking any unevaluated requirement as met.
   */
  readonly extraSkillNeeded: number;
}

export function planBestLadder(_catalog: DrainCatalog, _trader: Trader): LadderPlan {
  throw new Error('not implemented');
}

export function planLadderTo(_catalog: DrainCatalog, _trader: Trader, _drainId: number): LadderPlan | null {
  throw new Error('not implemented');
}

export function findOutOfReach(_catalog: DrainCatalog, _trader: Trader): readonly OutOfReachDrain[] {
  throw new Error('not implemented');
}
