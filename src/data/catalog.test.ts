import { describe, expect, it } from 'vitest';
import document from '../../data/drains.json';
import { toDrainCatalog } from './catalog';

const clone = (): any => JSON.parse(JSON.stringify(document));

describe('toDrainCatalog', () => {
  it('puts Deprive and Divest in one line and Ransack and Plunder in the other', () => {
    const catalog = toDrainCatalog(document);

    expect(catalog.divest).toHaveLength(16);
    expect(catalog.plunder).toHaveLength(16);
    expect(catalog.divest[0]?.name).toBe('Deprive Skills (Weak)');
    expect(catalog.divest[15]?.name).toBe('Divest Skills (Nanite Improved)');
    expect(catalog.plunder[0]?.name).toBe('Ransack Skills (Weak)');
    expect(catalog.plunder[15]?.name).toBe('Plunder Skills (Nanite Improved)');
  });

  it('reads Deprive Skills as on its auno.org page', () => {
    const deprive = toDrainCatalog(document).divest.find((d) => d.id === 85864);

    expect(deprive).toMatchObject({
      name: 'Deprive Skills',
      line: 'divest',
      tier: 4,
      ql: 43,
      skillRequired: 216,
      targetDrain: 60,
      selfBuff: 40,
      stackingOrder: 14,
      selfBuffStackingOrder: 11,
      ncu: 14,
      nanoCost: 80,
      durationSeconds: 180,
      offenceDrain: 30,
      offenceDrainNpcOnly: true,
      unevaluatedRequirement: null,
      sourceUrl: 'https://auno.org/ao/db.php?id=85864',
      dataPatch: '15.9',
    });
  });

  it('keeps the requirement it cannot evaluate on the Nanite Improved drains', () => {
    const top = toDrainCatalog(document).plunder[15];

    expect(top).toMatchObject({
      skillRequired: 1801,
      targetDrain: 325,
      selfBuff: 275,
      offenceDrain: 150,
      offenceDrainNpcOnly: false,
      unevaluatedRequirement: 'Cyberdeck & 6',
      otherTargetEffects: ['Critical chance -15'],
      otherSelfEffects: ['Critical chance +12'],
    });
  });

  it('orders each line so requirement, drain, buff and stacking order all rise with tier', () => {
    const catalog = toDrainCatalog(document);

    for (const line of [catalog.divest, catalog.plunder]) {
      line.forEach((drain, index) => {
        expect(drain.tier).toBe(index);
        const below = line[index - 1];
        if (!below) return;
        expect(drain.skillRequired).toBeGreaterThanOrEqual(below.skillRequired);
        expect(drain.targetDrain).toBeGreaterThan(below.targetDrain);
        expect(drain.selfBuff).toBeGreaterThan(below.selfBuff);
        expect(drain.stackingOrder).toBeGreaterThan(below.stackingOrder);
        expect(drain.selfBuffStackingOrder).toBeGreaterThanOrEqual(below.selfBuffStackingOrder);
      });
    }
  });

  it('rejects a drain whose two nanoskill requirements differ', () => {
    const broken = clone();
    broken.drains[0].requirements[1].value = 999;

    expect(() => toDrainCatalog(broken)).toThrow(/Deprive Skills \(Weak\).*requirement/);
  });

  it('rejects a drain whose self-buff has no amount', () => {
    const broken = clone();
    broken.drains[0].selfBuffs[0].modifiers = null;

    expect(() => toDrainCatalog(broken)).toThrow(/Deprive Skills \(Weak\).*self-buff/);
  });

  it('rejects a drain from an unknown nanoline', () => {
    const broken = clone();
    broken.drains[0].nanolineStrainId = 999;

    expect(() => toDrainCatalog(broken)).toThrow(/Deprive Skills \(Weak\).*nanoline/);
  });
});
