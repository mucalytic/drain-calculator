import { DRAIN_LINES, type Drain, type DrainCatalog } from '../domain/drain';
import {
  findOutOfReach,
  planBestLadder,
  planLadderTo,
  type LadderPlan,
  type OutOfReachDrain,
  type Trader,
} from '../domain/ladder';

export type RungStatus = 'cast' | 'reachable' | 'out' | 'blocked';

/** Everything one rung of the diagram shows. */
export interface Rung {
  readonly drain: Drain;
  readonly status: RungStatus;
  /** 1-based position in the shown ladder, when this drain is cast in it. */
  readonly stepNumber: number | null;
  readonly skillAfter: number | null;
  readonly isRunningAtEnd: boolean;
  readonly isSelected: boolean;
  readonly outOfReach: OutOfReachDrain | null;
}

/** What the page shows for one set of inputs and one selected drain. */
export interface LadderView {
  readonly trader: Trader;
  readonly best: LadderPlan;
  /** The ladder being shown: the best one, or the one to the selected drain. */
  readonly shown: LadderPlan;
  readonly selected: Drain | null;
  /** Set when a selected drain cannot be reached. */
  readonly selectedOutOfReach: OutOfReachDrain | null;
  readonly rungs: ReadonlyMap<number, Rung>;
  readonly outOfReach: readonly OutOfReachDrain[];
}

export function buildLadderView(catalog: DrainCatalog, trader: Trader, selectedId: number | null): LadderView {
  const drains = DRAIN_LINES.flatMap((line) => catalog[line]);
  const best = planBestLadder(catalog, trader);
  const outOfReach = findOutOfReach(catalog, trader);
  const selected = drains.find((drain) => drain.id === selectedId) ?? null;
  const toSelected = selected ? planLadderTo(catalog, trader, selected.id) : null;
  const shown = toSelected ?? best;

  const rungs = new Map<number, Rung>();
  for (const drain of drains) {
    const stepIndex = shown.steps.findIndex((step) => step.drain.id === drain.id);
    const missing = outOfReach.find((entry) => entry.drain.id === drain.id) ?? null;
    const status: RungStatus =
      stepIndex >= 0 ? 'cast' : !missing ? 'reachable' : missing.reason === 'skill' ? 'out' : 'blocked';
    rungs.set(drain.id, {
      drain,
      status,
      stepNumber: stepIndex >= 0 ? stepIndex + 1 : null,
      skillAfter: shown.steps[stepIndex]?.skillAfter ?? null,
      isRunningAtEnd: shown.running[drain.line]?.id === drain.id,
      isSelected: selected?.id === drain.id,
      outOfReach: missing,
    });
  }

  return {
    trader,
    best,
    shown,
    selected,
    selectedOutOfReach: selected && !toSelected ? (rungs.get(selected.id)?.outOfReach ?? null) : null,
    rungs,
    outOfReach,
  };
}
