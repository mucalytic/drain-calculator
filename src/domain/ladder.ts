import { DRAIN_LINES, type Drain, type DrainCatalog, type DrainLine } from './drain';
import { parseSkillPoints, type SkillPoints } from './skill';

/**
 * Drain laddering, as pure functions.
 *
 * Rules (see README "Laddering rules"):
 *  - one drain per line can be running; their self-buffs add;
 *  - a cast is allowed when base skill + temporary buffs + both running
 *    self-buffs meets the drain's requirement (the buff about to be replaced
 *    still counts while casting);
 *  - within a line she only climbs: a higher tier replaces a lower one. Tiers
 *    are ordered so stacking order never goes down as tier goes up.
 */

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

const NOTHING_RUNNING: RunningDrains = { divest: null, plunder: null };

const startingSkill = (trader: Trader): number => trader.skill + trader.temporaryBuff;

const selfBuffOf = (running: RunningDrains): number =>
  DRAIN_LINES.reduce((sum, line) => sum + (running[line]?.selfBuff ?? 0), 0);

const targetDrainOf = (running: RunningDrains): number =>
  DRAIN_LINES.reduce((sum, line) => sum + (running[line]?.targetDrain ?? 0), 0);

const tierOf = (drain: Drain | null): number => drain?.tier ?? -1;

const keyOf = (running: RunningDrains): string => `${tierOf(running.divest)}/${tierOf(running.plunder)}`;

function canCast(drain: Drain, running: RunningDrains, trader: Trader): boolean {
  const climbs = drain.tier > tierOf(running[drain.line]);
  const allowed = drain.unevaluatedRequirement === null || trader.meetsUnevaluatedRequirements;
  return climbs && allowed && startingSkill(trader) + selfBuffOf(running) >= drain.skillRequired;
}

/** A reachable set of running drains and the cheapest sequence of casts that produces it. */
interface Route {
  readonly running: RunningDrains;
  readonly casts: readonly Drain[];
  readonly nanoCost: number;
}

const isCheaper = (a: Route, b: Route): boolean =>
  a.casts.length !== b.casts.length ? a.casts.length < b.casts.length : a.nanoCost < b.nanoCost;

/**
 * Every combination of running drains she can reach, each with its cheapest
 * route: fewest casts, then least nano. (Dijkstra over at most 17 x 17 states.)
 */
function exploreRoutes(catalog: DrainCatalog, trader: Trader): Route[] {
  const best = new Map<string, Route>();
  const settled = new Set<string>();
  best.set(keyOf(NOTHING_RUNNING), { running: NOTHING_RUNNING, casts: [], nanoCost: 0 });

  for (;;) {
    let current: Route | undefined;
    for (const [key, route] of best) {
      if (!settled.has(key) && (!current || isCheaper(route, current))) current = route;
    }
    if (!current) break;
    settled.add(keyOf(current.running));

    for (const line of DRAIN_LINES) {
      for (const drain of catalog[line]) {
        if (!canCast(drain, current.running, trader)) continue;
        const next: Route = {
          running: { ...current.running, [line]: drain },
          casts: [...current.casts, drain],
          nanoCost: current.nanoCost + drain.nanoCost,
        };
        const known = best.get(keyOf(next.running));
        if (!known || isCheaper(next, known)) best.set(keyOf(next.running), next);
      }
    }
  }
  return [...best.values()];
}

function toPlan(route: Route, trader: Trader): LadderPlan {
  const start = startingSkill(trader);
  const steps: LadderStep[] = [];
  let running = NOTHING_RUNNING;
  for (const drain of route.casts) {
    const runningAfter: RunningDrains = { ...running, [drain.line]: drain };
    steps.push({
      drain,
      replaces: running[drain.line],
      skillBefore: start + selfBuffOf(running),
      skillAfter: start + selfBuffOf(runningAfter),
      runningBefore: running,
      runningAfter,
    });
    running = runningAfter;
  }
  return {
    steps,
    running,
    startingSkill: start,
    finalSkill: start + selfBuffOf(running),
    totalSelfBuff: selfBuffOf(running),
    totalTargetDrain: targetDrainOf(running),
    totalNanoCost: route.nanoCost,
  };
}

/**
 * The top of the ladder. A higher drain in one line never stops her climbing
 * the other, so the highest tier of each line is reached in the same state,
 * and that state has the largest total drain.
 */
function topRoute(routes: readonly Route[]): Route {
  return routes.reduce((top, route) => (targetDrainOf(route.running) > targetDrainOf(top.running) ? route : top));
}

function routeTo(routes: readonly Route[], drain: Drain): Route | undefined {
  return routes
    .filter((route) => route.running[drain.line]?.id === drain.id)
    .reduce<Route | undefined>((best, route) => (!best || isCheaper(route, best) ? route : best), undefined);
}

/** The shortest ladder to the strongest pair of drains she can have running together. */
export function planBestLadder(catalog: DrainCatalog, trader: Trader): LadderPlan {
  return toPlan(topRoute(exploreRoutes(catalog, trader)), trader);
}

/** The shortest ladder that ends with the given drain running, or null if she cannot reach it. */
export function planLadderTo(catalog: DrainCatalog, trader: Trader, drainId: number): LadderPlan | null {
  const drain = DRAIN_LINES.flatMap((line) => catalog[line]).find((d) => d.id === drainId);
  const route = drain && routeTo(exploreRoutes(catalog, trader), drain);
  return route ? toPlan(route, trader) : null;
}

function extraSkillNeeded(catalog: DrainCatalog, trader: Trader, drain: Drain): number {
  const reachesWith = (extra: number): boolean => {
    const stronger: Trader = {
      ...trader,
      skill: parseSkillPoints(trader.skill + extra),
      meetsUnevaluatedRequirements: true,
    };
    return routeTo(exploreRoutes(catalog, stronger), drain) !== undefined;
  };
  // More skill never hurts, so search for the smallest amount that works.
  // Meeting the requirement outright always works.
  let low = 0;
  let high = Math.max(0, drain.skillRequired - startingSkill(trader));
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (reachesWith(middle)) high = middle;
    else low = middle + 1;
  }
  return low;
}

/** Every drain above the top of her ladder, line by line, lowest first. */
export function findOutOfReach(catalog: DrainCatalog, trader: Trader): readonly OutOfReachDrain[] {
  const top = planBestLadder(catalog, trader);
  return DRAIN_LINES.flatMap((line) =>
    catalog[line]
      .filter((drain) => drain.tier > tierOf(top.running[line]))
      .map((drain): OutOfReachDrain => {
        const blocked = drain.unevaluatedRequirement !== null && !trader.meetsUnevaluatedRequirements;
        return {
          drain,
          reason: blocked ? 'unevaluated-requirement' : 'skill',
          skillAtTopOfLadder: top.finalSkill,
          shortfall: drain.skillRequired - top.finalSkill,
          extraSkillNeeded: extraSkillNeeded(catalog, trader, drain),
        };
      }),
  );
}
