import { describe, expect, it } from 'vitest';
import document from '../../data/drains.json';
import { toDrainCatalog } from '../data/catalog';
import { parseSkillPoints } from './skill';
import { findOutOfReach, planBestLadder, planLadderTo, type LadderPlan, type Trader } from './ladder';

// Every expected value below was worked out by hand from data/drains.json
// (see the table in the README): requirement / drain / self-buff per nano.
const catalog = toDrainCatalog(document);

const trader = (skill: number, options: { buff?: number; meets?: boolean } = {}): Trader => ({
  skill: parseSkillPoints(skill),
  temporaryBuff: parseSkillPoints(options.buff ?? 0),
  meetsUnevaluatedRequirements: options.meets ?? false,
});

const casts = (plan: LadderPlan): string[] => plan.steps.map((step) => step.drain.name);

describe('planBestLadder', () => {
  it('casts nothing when she cannot afford the weakest drain', () => {
    const plan = planBestLadder(catalog, trader(35));

    expect(plan.steps).toEqual([]);
    expect(plan.running).toEqual({ divest: null, plunder: null });
    expect(plan.finalSkill).toBe(35);
    expect(plan.totalTargetDrain).toBe(0);
    expect(plan.totalSelfBuff).toBe(0);
  });

  it('stops at Deprive (Weak) when its buff does not reach Ransack (Weak)', () => {
    // 36 >= 36, buff +5 = 41; Ransack (Weak) needs 58.
    const plan = planBestLadder(catalog, trader(36));

    expect(casts(plan)).toEqual(['Deprive Skills (Weak)']);
    expect(plan.finalSkill).toBe(41);
    expect(plan.running.plunder).toBeNull();
  });

  it('uses the Deprive buff to reach a Ransack she could not cast unaided', () => {
    // 216: Deprive (Lesser) +29 = 245 >= 241 Ransack Skills, +47 = 292
    //      >= 278 Deprive (Major), whose +55 replaces +29: 216 + 55 + 47 = 318.
    // Ransack (Major) needs 324, so that is the top.
    const plan = planBestLadder(catalog, trader(216));

    expect(casts(plan)).toEqual(['Deprive Skills (Lesser)', 'Ransack Skills', 'Deprive Skills (Major)']);
    expect(plan.steps.map((s) => [s.skillBefore, s.skillAfter])).toEqual([
      [216, 245],
      [245, 292],
      [292, 318],
    ]);
    expect(plan.finalSkill).toBe(318);
    expect(plan.totalSelfBuff).toBe(55 + 47);
    expect(plan.totalTargetDrain).toBe(76 + 69);
    expect(plan.totalNanoCost).toBe(57 + 85 + 107);
  });

  it('records which drain each cast replaces', () => {
    const plan = planBestLadder(catalog, trader(216));

    expect(plan.steps.map((s) => s.replaces?.name ?? null)).toEqual([null, null, 'Deprive Skills (Lesser)']);
    expect(plan.steps[2]?.runningAfter.divest?.name).toBe('Deprive Skills (Major)');
    expect(plan.steps[2]?.runningAfter.plunder?.name).toBe('Ransack Skills');
  });

  it('climbs from 300 to Divest (Weak) plus Ransack (Advanced) in five casts', () => {
    // 300 -> Deprive (Major) 355 -> Ransack (Major) 418 -> Deprive (Advanced) 435
    //     -> Divest (Weak) [needs exactly 435] 451 -> Ransack (Advanced) 467.
    // Plunder (Weak) needs 474. No ladder gets there in fewer than five casts.
    const plan = planBestLadder(catalog, trader(300));

    expect(plan.steps).toHaveLength(5);
    expect(plan.running.divest?.name).toBe('Divest Skills (Weak)');
    expect(plan.running.plunder?.name).toBe('Ransack Skills (Advanced)');
    expect(plan.finalSkill).toBe(300 + 88 + 79);
    expect(plan.totalTargetDrain).toBe(115 + 105);
    expect(plan.totalSelfBuff).toBe(167);
  });

  it('never casts a drain she cannot afford at that moment', () => {
    for (const skill of [36, 100, 216, 300, 435, 600, 827, 1001]) {
      const plan = planBestLadder(catalog, trader(skill));
      for (const step of plan.steps) {
        expect(step.skillBefore).toBeGreaterThanOrEqual(step.drain.skillRequired);
      }
    }
  });

  it('needs only one Advanced drain to step up to both Nanite Enhanced drains', () => {
    // 853 -> Plunder (Advanced) [853] +178 = 1031 >= 1001 Divest (Nanite Enhanced),
    // +210 = 1241 >= 1001 Plunder (Nanite Enhanced): 853 + 210 + 210 = 1273.
    // Divest (Advanced) is never needed, so three casts, not four.
    const plan = planBestLadder(catalog, trader(853));

    expect(casts(plan)).toEqual([
      'Plunder Skills (Advanced)',
      'Divest Skills (Nanite Enhanced)',
      'Plunder Skills (Nanite Enhanced)',
    ]);
    expect(plan.finalSkill).toBe(853 + 210 + 210);
  });

  it('counts temporary buffs towards requirements', () => {
    // 290 + 10 behaves as 300 does.
    const plan = planBestLadder(catalog, trader(290, { buff: 10 }));

    expect(plan.startingSkill).toBe(300);
    expect(plan.finalSkill).toBe(467);
  });

  it('leaves out the Nanite Improved drains unless she meets their extra requirement', () => {
    // 1801 unaided. Without the flag the top is the Nanite Enhanced pair.
    const without = planBestLadder(catalog, trader(1801));
    const withFlag = planBestLadder(catalog, trader(1801, { meets: true }));

    expect(without.running.divest?.name).toBe('Divest Skills (Nanite Enhanced)');
    expect(withFlag.running.divest?.name).toBe('Divest Skills (Nanite Improved)');
    expect(withFlag.running.plunder?.name).toBe('Plunder Skills (Nanite Improved)');
    expect(withFlag.steps).toHaveLength(2);
    expect(withFlag.totalTargetDrain).toBe(650);
  });
});

describe('planLadderTo', () => {
  it('finds the cheapest ladder to a drain below the top', () => {
    // 216 -> Ransack Skills needs 241, so 25 more. The cheapest single cast that
    // gives it is Ransack (Average): needs 148, +25 = 241, 43 nano. (Deprive
    // (Lesser) +29 also works but costs 57; Deprive (Average) +21 falls short.)
    const plan = planLadderTo(catalog, trader(216), 85863);

    expect(plan && casts(plan)).toEqual(['Ransack Skills (Average)', 'Ransack Skills']);
    expect(plan?.steps[1]?.replaces?.name).toBe('Ransack Skills (Average)');
  });

  it('is a single cast for a drain she can already afford', () => {
    const plan = planLadderTo(catalog, trader(216), 85864);

    expect(plan && casts(plan)).toEqual(['Deprive Skills']);
  });

  it('is null for a drain she cannot reach', () => {
    expect(planLadderTo(catalog, trader(216), 85861)).toBeNull();
  });
});

describe('findOutOfReach', () => {
  it('lists every drain above the top of her ladder, lowest first in each line', () => {
    const out = findOutOfReach(catalog, trader(300));

    expect(out).toHaveLength(8 + 9);
    expect(out[0]?.drain.name).toBe('Divest Skills (Minor)');
    expect(out[8]?.drain.name).toBe('Plunder Skills (Weak)');
  });

  it('reports how far short her laddered skill is', () => {
    // At 300 the ladder tops out at 467; Plunder (Weak) needs 474.
    const plunderWeak = findOutOfReach(catalog, trader(300)).find((o) => o.drain.id === 85857);

    expect(plunderWeak).toMatchObject({ reason: 'skill', skillAtTopOfLadder: 467, shortfall: 7 });
  });

  it('reports the fewest extra points of her own skill that would reach it', () => {
    // 216 tops out at 318. Ransack (Major) needs 324 while Deprive (Major) +55
    // and Ransack Skills +47 are running, so she needs 324 - 102 = 222 herself.
    const ransackMajor = findOutOfReach(catalog, trader(216)).find((o) => o.drain.id === 85861);

    expect(ransackMajor).toMatchObject({ shortfall: 6, extraSkillNeeded: 6 });
  });

  it('gets past a rung she is one point short of by climbing the other line first', () => {
    // 299: Deprive (Major) 354, Ransack (Major) 417, Deprive (Advanced) 434.
    // Divest (Weak) needs 435: one short. Ransack (Advanced) 402 -> 299+72+79 = 450,
    // and now Divest (Weak) is castable: 299 + 88 + 79 = 466.
    const plan = planBestLadder(catalog, trader(299));
    const out = findOutOfReach(catalog, trader(299));

    expect(plan.running.divest?.name).toBe('Divest Skills (Weak)');
    expect(plan.finalSkill).toBe(466);
    expect(out.find((o) => o.drain.id === 85857)).toMatchObject({ shortfall: 8, extraSkillNeeded: 8 });
  });

  it('marks a Nanite Improved drain as blocked by its extra requirement, not by skill', () => {
    const top = findOutOfReach(catalog, trader(1801)).find((o) => o.drain.id === 275030);

    expect(top).toMatchObject({ reason: 'unevaluated-requirement', extraSkillNeeded: 0 });
  });

  it('still reports the skill a blocked Nanite Improved drain would need', () => {
    // 1001 casts both Nanite Enhanced drains: 1001 + 210 + 210 = 1421, 380 short of 1801.
    const top = findOutOfReach(catalog, trader(1001)).find((o) => o.drain.id === 275030);

    expect(top).toMatchObject({
      reason: 'unevaluated-requirement',
      skillAtTopOfLadder: 1421,
      shortfall: 380,
      extraSkillNeeded: 380,
    });
  });

  it('is empty when she is running the top of both lines', () => {
    expect(findOutOfReach(catalog, trader(1801, { meets: true }))).toEqual([]);
  });
});
