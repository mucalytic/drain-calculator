import type { Drain, DrainCatalog, DrainLine } from '../domain/drain';

/**
 * Adapter from the scraped auno.org document (data/drains.json) to the domain
 * catalog. It derives nothing that is not in the data, and throws when the
 * data does not have the shape the calculator relies on.
 */

interface RawRequirement {
  stat: string;
  operator: string;
  value: number | string | null;
}

interface RawModifierGroup {
  action: string;
  amount: number | null;
  condition: string | null;
  stats: string[];
}

interface RawSelfBuff {
  name: string;
  stackingOrder: number | null;
  ncu: number | null;
  modifiers: RawModifierGroup[] | null;
}

interface RawDrain {
  id: number;
  name: string;
  aunoUrl: string;
  dataPatch: string;
  nanolineStrainId: number | null;
  stackingOrder: number | null;
  ncu: number | null;
  durationSeconds: number | null;
  ql: number | null;
  nanoCost: number | null;
  requirements: RawRequirement[];
  targetModifiers: RawModifierGroup[];
  selfBuffs: RawSelfBuff[];
}

const PM = 'Psychological modifications';
const TS = 'Time and space';
const OFFENCE = 'Offense modifier';
const NPC_ONLY = 'NPC type >= 1';

/** auno strain id of the debuff nanoline -> line. */
const LINE_BY_STRAIN: Readonly<Record<number, DrainLine>> = { 135: 'divest', 136: 'plunder' };

class DrainDataError extends Error {
  constructor(drain: RawDrain, problem: string) {
    super(`${drain.name} (${drain.id}): ${problem}`);
    this.name = 'DrainDataError';
  }
}

function present<T>(drain: RawDrain, field: string, value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw new DrainDataError(drain, `${field} is missing`);
  }
  return value;
}

function skillRequirement(drain: RawDrain): number {
  const valueOf = (stat: string): unknown =>
    drain.requirements.find((r) => r.stat === stat && r.operator === '>=')?.value;
  const pm = valueOf(PM);
  const ts = valueOf(TS);
  if (typeof pm !== 'number' || pm !== ts) {
    throw new DrainDataError(drain, `expected one equal ${PM} and ${TS} requirement, found ${pm} and ${ts}`);
  }
  return pm;
}

function unevaluatedRequirement(drain: RawDrain): string | null {
  const isEvaluated = (r: RawRequirement): boolean =>
    r.stat === PM || r.stat === TS || (r.stat.endsWith('rofession') && r.value === 'Trader');
  const others = drain.requirements.filter((r) => !isEvaluated(r));
  return others.length === 0 ? null : others.map((r) => `${r.stat} ${r.operator} ${r.value ?? ''}`.trim()).join(', ');
}

/** The amount applied to both PM and TS, which is what laddering depends on. */
function nanoskillAmount(drain: RawDrain, groups: readonly RawModifierGroup[], what: string): RawModifierGroup {
  const group = groups.find(
    (g) => g.action === 'Modify' && g.condition === null && g.stats.includes(PM) && g.stats.includes(TS),
  );
  if (!group || group.amount === null) {
    throw new DrainDataError(drain, `${what} has no unconditional amount for ${PM} and ${TS}`);
  }
  return group;
}

const signed = (amount: number): string => (amount > 0 ? `+${amount}` : `${amount}`);

function describeOthers(groups: readonly RawModifierGroup[], skip: readonly RawModifierGroup[]): string[] {
  return groups
    .filter((g) => !skip.includes(g) && g.amount !== null)
    .map((g) => `${g.stats.join(', ')} ${signed(g.amount as number)}${g.condition ? ` if ${g.condition}` : ''}`);
}

function toDrain(raw: RawDrain): Omit<Drain, 'tier'> {
  const line = raw.nanolineStrainId === null ? undefined : LINE_BY_STRAIN[raw.nanolineStrainId];
  if (!line) {
    throw new DrainDataError(raw, `nanoline strain ${raw.nanolineStrainId} is not a known drain nanoline`);
  }
  const [selfBuff, ...extraBuffs] = raw.selfBuffs;
  if (!selfBuff || extraBuffs.length > 0 || !selfBuff.modifiers) {
    throw new DrainDataError(raw, 'expected exactly one self-buff with its amounts');
  }

  const drained = nanoskillAmount(raw, raw.targetModifiers, 'the target debuff');
  const buffed = nanoskillAmount(raw, selfBuff.modifiers, 'the self-buff');
  const offence = raw.targetModifiers.find((g) => g.stats.length === 1 && g.stats[0] === OFFENCE);
  if (offence && offence.condition !== null && offence.condition !== NPC_ONLY) {
    throw new DrainDataError(raw, `unexpected condition on ${OFFENCE}: ${offence.condition}`);
  }

  return {
    id: raw.id,
    name: raw.name,
    line,
    ql: present(raw, 'ql', raw.ql),
    skillRequired: skillRequirement(raw),
    targetDrain: -(drained.amount as number),
    selfBuff: buffed.amount as number,
    stackingOrder: present(raw, 'stackingOrder', raw.stackingOrder),
    selfBuffStackingOrder: present(raw, 'self-buff stackingOrder', selfBuff.stackingOrder),
    ncu: present(raw, 'ncu', raw.ncu),
    selfBuffNcu: present(raw, 'self-buff ncu', selfBuff.ncu),
    nanoCost: present(raw, 'nanoCost', raw.nanoCost),
    durationSeconds: present(raw, 'durationSeconds', raw.durationSeconds),
    offenceDrain: offence?.amount ? -offence.amount : 0,
    offenceDrainNpcOnly: offence?.condition === NPC_ONLY,
    otherTargetEffects: describeOthers(raw.targetModifiers, offence ? [drained, offence] : [drained]),
    otherSelfEffects: describeOthers(selfBuff.modifiers, [buffed]),
    unevaluatedRequirement: unevaluatedRequirement(raw),
    sourceUrl: raw.aunoUrl,
    dataPatch: raw.dataPatch,
  };
}

export function toDrainCatalog(document: unknown): DrainCatalog {
  const raws = (document as { drains: RawDrain[] }).drains;
  const drains = raws.map(toDrain);
  const lineOf = (line: DrainLine): Drain[] =>
    drains
      .filter((d) => d.line === line)
      .sort((a, b) => a.skillRequired - b.skillRequired || a.stackingOrder - b.stackingOrder)
      .map((d, tier) => Object.freeze({ ...d, tier }));
  return Object.freeze({ divest: lineOf('divest'), plunder: lineOf('plunder') });
}
