import { DRAIN_LINES, type Drain, type DrainCatalog } from '../domain/drain';
import type { LadderPlan, LadderStep, OutOfReachDrain } from '../domain/ladder';
import { describeRequirement, drainLink, duration, escapeHtml, LINE_TITLE, shortName } from './format';
import type { LadderView } from './view';

/** HTML for the sections around the diagram. All functions are pure: view in, markup out. */

const runningDrains = (plan: LadderPlan): Drain[] =>
  DRAIN_LINES.map((line) => plan.running[line]).filter((drain): drain is Drain => drain !== null);

export function renderSummary(view: LadderView): string {
  const plan = view.shown;
  const running = runningDrains(plan);
  if (running.length === 0) {
    return `<div class="tile tile-wide"><p class="tile-label">Nothing castable</p>
      <p class="tile-note">With ${plan.startingSkill} skill you can't cast any drain yet. The weakest, ${escapeHtml(view.weakest.name)}, needs ${view.weakest.skillRequired}.</p></div>`;
  }
  const npcOnly = running.filter((d) => d.offenceDrainNpcOnly).reduce((sum, d) => sum + d.offenceDrain, 0);
  const always = running.filter((d) => !d.offenceDrainNpcOnly).reduce((sum, d) => sum + d.offenceDrain, 0);
  const offence = [
    always ? `&#8722;${always} offence modifier` : '',
    npcOnly ? `&#8722;${always + npcOnly} offence modifier on NPCs` : '',
  ].filter(Boolean);
  // Listed per drain: the data does not say whether these add up across the two lines.
  const targetExtras = running.flatMap((d) => d.otherTargetEffects.map((e) => `${e} (${shortName(d)})`));
  const selfExtras = running.flatMap((d) => d.otherSelfEffects.map((e) => `${e} (${shortName(d)})`));
  const pair = running.map((d) => drainLink(d, shortName(d))).join(' + ');

  return `
    <div class="tile">
      <p class="tile-label">Drain on the target</p>
      <p class="tile-value tile-drain">&#8722;${plan.totalTargetDrain}</p>
      <p class="tile-note">off every attack and nano skill${[...offence, ...targetExtras.map(escapeHtml)].map((t) => `<br />${t}`).join('')}</p>
    </div>
    <div class="tile">
      <p class="tile-label">Buff on you</p>
      <p class="tile-value tile-buff">+${plan.totalSelfBuff}</p>
      <p class="tile-note">on every attack and nano skill${selfExtras.map((t) => `<br />${escapeHtml(t)}`).join('')}</p>
    </div>
    <div class="tile">
      <p class="tile-label">Your skill</p>
      <p class="tile-value">${plan.startingSkill} <span class="arrow">&#8594;</span> ${plan.finalSkill}</p>
      <p class="tile-note">${plan.steps.length} cast${plan.steps.length === 1 ? '' : 's'} &#183; ${plan.totalNanoCost} nano</p>
    </div>
    <div class="tile">
      <p class="tile-label">Running at the end</p>
      <p class="tile-pair">${pair}</p>
      <p class="tile-note">${running.map((d) => `${d.ncu} NCU on target, ${d.selfBuffNcu} on you, ${duration(d.durationSeconds)}`).join('<br />')}</p>
    </div>`;
}

function skillBreakdown(step: LadderStep, plan: LadderPlan, view: LadderView): string {
  const parts = [`${view.trader.skill} own`];
  if (view.trader.temporaryBuff > 0) parts.push(`${view.trader.temporaryBuff} other buffs`);
  for (const drain of runningDrains({ ...plan, running: step.runningBefore })) {
    parts.push(`${drain.selfBuff} from ${shortName(drain)}`);
  }
  return parts.join(' + ');
}

/** Why the cast is allowed, naming each source of skill separately. */
function whyCastable(step: LadderStep, plan: LadderPlan, view: LadderView): string {
  const need = step.drain.skillRequired;
  const own = view.trader.skill;
  if (own >= need) {
    return `You meet this on your own skill (${own}).`;
  }
  const helpers = runningDrains({ ...plan, running: step.runningBefore }).map(
    (d) => `the buff from ${escapeHtml(shortName(d))} (+${d.selfBuff})`,
  );
  if (view.trader.temporaryBuff > 0) helpers.unshift(`your other buffs (+${view.trader.temporaryBuff})`);
  const list = helpers.length > 1 ? `${helpers.slice(0, -1).join(', ')} and ${helpers.at(-1)}` : (helpers[0] ?? '');
  // "Your other buffs" is plural; a single drain buff is singular.
  const verb = helpers.length === 1 && view.trader.temporaryBuff === 0 ? 'makes' : 'make';
  return `On your own you are ${need - own} short. ${list.charAt(0).toUpperCase()}${list.slice(1)} ${verb} it castable.`;
}

function renderStep(step: LadderStep, index: number, plan: LadderPlan, view: LadderView): string {
  const { drain } = step;
  const replaced = step.replaces
    ? `Replaces ${escapeHtml(shortName(step.replaces))}: your buff from this line goes from +${step.replaces.selfBuff} to +${drain.selfBuff}.`
    : `First drain in the ${escapeHtml(LINE_TITLE[drain.line])} line: +${drain.selfBuff}.`;
  return `
    <li class="step line-${drain.line}">
      <span class="step-number">${index + 1}</span>
      <div class="step-body">
        <h3>Cast ${drainLink(drain)}</h3>
        <p><strong>Needs ${drain.skillRequired}, you have ${step.skillBefore}</strong>
          <span class="muted">(${escapeHtml(skillBreakdown(step, plan, view))})</span></p>
        <p>${whyCastable(step, plan, view)}</p>
        <p>${replaced}</p>
      </div>
      <div class="step-after">
        <span class="muted">skill after</span>
        <strong>${step.skillAfter}</strong>
        <span class="muted">target &#8722;${drain.targetDrain}</span>
      </div>
    </li>`;
}

function renderUnreachableSelection(entry: OutOfReachDrain, view: LadderView): string {
  const { drain } = entry;
  const blocked =
    entry.reason === 'unevaluated-requirement'
      ? `<p>It also needs ${describeRequirement(drain.unevaluatedRequirement ?? '')}. Tick the box above if you have that.</p>`
      : '';
  const skill =
    entry.extraSkillNeeded > 0
      ? `<p>It needs <strong>${drain.skillRequired}</strong>. Your best ladder tops out at ${entry.skillAtTopOfLadder}, which is ${entry.shortfall} short.
         Raising your own skill by <strong>${entry.extraSkillNeeded}</strong> (to ${view.trader.skill + entry.extraSkillNeeded}) would let you ladder to it.</p>`
      : `<p>Your skill is enough for it (needs ${drain.skillRequired}).</p>`;
  return `
    <div class="callout">
      <h3>${drainLink(drain)} is out of reach</h3>
      ${skill}${blocked}
      <p class="muted">Showing your best ladder below.</p>
    </div>`;
}

export function renderSteps(view: LadderView): string {
  const plan = view.shown;
  const showingSelection = view.selected !== null && view.selectedOutOfReach === null && plan !== view.best;
  const title = showingSelection ? `Ladder to ${escapeHtml(view.selected?.name ?? '')}` : 'Best ladder, step by step';
  const back = view.selected ? '<button type="button" class="link-button" data-action="show-best">Show the best ladder</button>' : '';
  const callout = view.selectedOutOfReach ? renderUnreachableSelection(view.selectedOutOfReach, view) : '';
  const steps = plan.steps.length
    ? `<ol class="steps">${plan.steps.map((step, index) => renderStep(step, index, plan, view)).join('')}</ol>`
    : '<p class="muted">No drain is castable at this skill.</p>';
  const intro = showingSelection
    ? 'The fewest casts that end with this drain running.'
    : 'The fewest casts that end with the strongest drain of each line running together. Where two ladders are equally short, this is the one that costs less nano.';
  return `
    <div class="section-head">
      <h2>${title}</h2>
      <p class="muted">${intro} ${back}</p>
    </div>
    ${callout}${steps}`;
}

function renderOutOfReachRow(entry: OutOfReachDrain, view: LadderView): string {
  const { drain } = entry;
  const extra =
    entry.extraSkillNeeded > 0
      ? `+${entry.extraSkillNeeded} <span class="muted">(to ${view.trader.skill + entry.extraSkillNeeded})</span>`
      : '<span class="muted">skill is enough</span>';
  const note =
    entry.reason === 'unevaluated-requirement'
      ? `<span class="chip">also needs ${describeRequirement(drain.unevaluatedRequirement ?? '')}</span>`
      : '';
  return `
    <tr>
      <th scope="row">${drainLink(drain, shortName(drain))} ${note}</th>
      <td>${drain.skillRequired}</td>
      <td>${entry.shortfall > 0 ? entry.shortfall : '<span class="muted">0</span>'}</td>
      <td>${extra}</td>
    </tr>`;
}

export function renderOutOfReach(view: LadderView): string {
  if (view.outOfReach.length === 0) {
    return `<div class="section-head"><h2>Still out of reach</h2>
      <p class="muted">Nothing. You are running the top drain of both lines.</p></div>`;
  }
  const tables = DRAIN_LINES.map((line) => {
    const entries = view.outOfReach.filter((entry) => entry.drain.line === line);
    if (entries.length === 0) return '';
    return `
      <div class="table-wrap">
        <table>
          <caption class="line-${line}">${escapeHtml(LINE_TITLE[line])}</caption>
          <thead><tr>
            <th scope="col">Drain</th>
            <th scope="col">Needs</th>
            <th scope="col">Short at top of ladder</th>
            <th scope="col">Own skill to gain</th>
          </tr></thead>
          <tbody>${entries.map((entry) => renderOutOfReachRow(entry, view)).join('')}</tbody>
        </table>
      </div>`;
  });
  return `
    <div class="section-head">
      <h2>Still out of reach</h2>
      <p class="muted">"Needs" is the Psychological Modifications and Time &amp; Space requirement. "Short at top of ladder" compares it with your skill at the top of your best ladder (${view.best.finalSkill}). "Own skill to gain" is the fewest points you must add to your own skill to ladder there, which can be less than the shortfall when a small gain unlocks a rung on the way.</p>
    </div>
    <div class="tables">${tables.join('')}</div>`;
}

export interface DataSource {
  readonly targetPatch: string;
  readonly source: string;
  readonly generatedOn: string;
}

export function renderFooter(catalog: DrainCatalog, source: DataSource): string {
  const patches = [...new Set(DRAIN_LINES.flatMap((line) => catalog[line]).map((d) => d.dataPatch))].sort(
    (a, b) => Number.parseFloat(a) - Number.parseFloat(b),
  );
  const lists = DRAIN_LINES.map(
    (line) => `
      <div>
        <h3 class="line-${line}">${escapeHtml(LINE_TITLE[line])}</h3>
        <ul class="nano-list">${catalog[line].map((drain) => `<li>${drainLink(drain)}</li>`).join('')}</ul>
      </div>`,
  );
  return `
    <p><strong>Data as of patch ${escapeHtml(source.targetPatch)}</strong> (the base of Project Rubi-Ka).
      Source: ${escapeHtml(source.source)}, read on ${escapeHtml(source.generatedOn)}.
      Each nano uses the item version in force at ${escapeHtml(source.targetPatch)} (versions from patches ${patches.map(escapeHtml).join(', ')}), not the live-server version.</p>
    <p class="muted">Assumed game rules, not in the item data: a drain replaces a lower one of the same line; the self-buffs of the two lines add; a cast is checked against the caster's skill including the buff it is about to replace. Project Rubi-Ka may differ from the original 18.4 values.</p>
    <div class="nano-lists">${lists.join('')}</div>
    <p class="muted">No tracking, no cookies, no external requests. Your inputs are kept only in this browser.</p>`;
}
