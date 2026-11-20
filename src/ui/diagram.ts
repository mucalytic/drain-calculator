import { DRAIN_LINES, type Drain, type DrainCatalog, type DrainLine } from '../domain/drain';
import { escapeHtml, LINE_TITLE, shortName } from './format';
import type { LadderView, Rung } from './view';

/**
 * The two-ladder diagram, as an SVG string. One ladder per drain line, weakest
 * rung at the bottom; the casts of the shown ladder are numbered and joined by
 * a path that zig-zags between the ladders.
 */

const WIDTH = 920;
const TOP = 64;
const PITCH = 46;
const RUNG_HEIGHT = 36;
const BOTTOM = 58;
/** x of the outer and inner rail of each ladder. */
const RAILS: Readonly<Record<DrainLine, { outer: number; inner: number }>> = {
  divest: { outer: 30, inner: 356 },
  plunder: { outer: 890, inner: 564 },
};
const CENTRE = WIDTH / 2;
const BADGE_RADIUS = 13;

interface Point {
  readonly x: number;
  readonly y: number;
}

const rungCount = (catalog: DrainCatalog): number => Math.max(...DRAIN_LINES.map((line) => catalog[line].length));

function rungCentre(drain: Drain, rungs: number): Point {
  return { x: RAILS[drain.line].inner, y: TOP + (rungs - 1 - drain.tier) * PITCH + PITCH / 2 };
}

function rungNote(rung: Rung): string {
  if (rung.status === 'cast') return `skill after ${rung.skillAfter}`;
  if (rung.status === 'blocked') return 'extra requirement';
  if (rung.status === 'out') return `${rung.outOfReach?.extraSkillNeeded} more skill`;
  return '';
}

function rungLabel(rung: Rung): string {
  const { drain } = rung;
  const state =
    rung.status === 'cast'
      ? `cast number ${rung.stepNumber}, skill after ${rung.skillAfter}`
      : rung.status === 'reachable'
        ? 'within reach, not needed'
        : rung.status === 'blocked'
          ? 'out of reach: extra requirement'
          : `out of reach: ${rung.outOfReach?.extraSkillNeeded} more skill needed`;
  return `${drain.name}. Needs ${drain.skillRequired}. Drains ${drain.targetDrain}, buffs you ${drain.selfBuff}. ${state}.`;
}

function renderRung(rung: Rung, rungs: number): string {
  const { drain } = rung;
  const rails = RAILS[drain.line];
  const left = Math.min(rails.outer, rails.inner) + 8;
  const width = Math.abs(rails.inner - rails.outer) - 16;
  const { y } = rungCentre(drain, rungs);
  const top = y - RUNG_HEIGHT / 2;
  const classes = [
    'rung',
    `rung-${rung.status}`,
    `line-${drain.line}`,
    rung.isRunningAtEnd ? 'rung-running' : '',
    rung.isSelected ? 'rung-selected' : '',
  ].join(' ');
  // Text sits away from the inner rail, where the step badge goes.
  const textLeft = drain.line === 'divest' ? left + 12 : left + 28;
  const textRight = drain.line === 'divest' ? left + width - 28 : left + width - 12;

  return `
    <g class="${classes}" data-drain-id="${drain.id}" tabindex="0" role="button" aria-pressed="${rung.isSelected}" aria-label="${escapeHtml(rungLabel(rung))}">
      <rect class="rung-bar" x="${left}" y="${top}" width="${width}" height="${RUNG_HEIGHT}" rx="7" />
      <text class="rung-name" x="${textLeft}" y="${y - 3}">${escapeHtml(shortName(drain))}</text>
      <text class="rung-need" x="${textRight}" y="${y - 3}" text-anchor="end">needs ${drain.skillRequired}</text>
      <text class="rung-effect" x="${textLeft}" y="${y + 12}">&#8722;${drain.targetDrain} target &#183; +${drain.selfBuff} you</text>
      <text class="rung-note" x="${textRight}" y="${y + 12}" text-anchor="end">${escapeHtml(rungNote(rung))}</text>
    </g>`;
}

function renderRails(line: DrainLine, catalog: DrainCatalog, view: LadderView, rungs: number): string {
  const rails = RAILS[line];
  const top = TOP - 6;
  const bottom = TOP + rungs * PITCH + 6;
  const running = view.shown.running[line];
  const litFrom = running ? rungCentre(running, rungs).y - RUNG_HEIGHT / 2 - 4 : bottom;
  const count = catalog[line].length;
  const titleX = (rails.outer + rails.inner) / 2;
  return `
    <text class="ladder-title line-${line}" x="${titleX}" y="26" text-anchor="middle">${escapeHtml(LINE_TITLE[line])}</text>
    <text class="ladder-subtitle" x="${titleX}" y="44" text-anchor="middle">${count} drains &#183; one can run at a time</text>
    ${[rails.outer, rails.inner]
      .map(
        (x) => `
    <line class="rail" x1="${x}" y1="${top}" x2="${x}" y2="${bottom}" />
    <line class="rail rail-lit line-${line}" x1="${x}" y1="${litFrom}" x2="${x}" y2="${bottom}" />`,
      )
      .join('')}`;
}

/** A curve from one badge to the next: across the gap, or bulging into it when staying on one ladder. */
function connector(from: Point, to: Point): string {
  if (from.x !== to.x) {
    return `M ${from.x} ${from.y} C ${CENTRE} ${from.y}, ${CENTRE} ${to.y}, ${to.x} ${to.y}`;
  }
  const bulge = from.x < CENTRE ? from.x + 90 : from.x - 90;
  return `M ${from.x} ${from.y} C ${bulge} ${from.y}, ${bulge} ${to.y}, ${to.x} ${to.y}`;
}

function renderPath(view: LadderView, rungs: number): string {
  const start: Point = { x: CENTRE, y: TOP + rungs * PITCH + 30 };
  const points = view.shown.steps.map((step) => rungCentre(step.drain, rungs));
  const segments = points.map((point, index) => connector(points[index - 1] ?? start, point));
  const badges = view.shown.steps.map((step, index) => {
    const point = points[index] as Point;
    return `
    <g class="badge line-${step.drain.line}">
      <circle cx="${point.x}" cy="${point.y}" r="${BADGE_RADIUS}" />
      <text x="${point.x}" y="${point.y + 4.5}" text-anchor="middle">${index + 1}</text>
    </g>`;
  });
  const final = view.shown;
  return `
    <path class="climb-shadow" d="${segments.join(' ')}" />
    <path class="climb" d="${segments.join(' ')}" />
    ${badges.join('')}
    <g class="start-marker">
      <rect x="${CENTRE - 76}" y="${start.y - 14}" width="152" height="28" rx="14" />
      <text x="${CENTRE}" y="${start.y + 4.5}" text-anchor="middle">start: skill ${final.startingSkill}</text>
    </g>
    <g class="finish-marker">
      <text class="finish-label" x="${CENTRE}" y="24" text-anchor="middle">skill at the top</text>
      <text class="finish-value" x="${CENTRE}" y="50" text-anchor="middle">${final.finalSkill}</text>
    </g>`;
}

export function renderLadderDiagram(catalog: DrainCatalog, view: LadderView): string {
  const rungs = rungCount(catalog);
  const height = TOP + rungs * PITCH + BOTTOM;
  const summary = view.shown.steps.length
    ? `Ladder of ${view.shown.steps.length} casts: ${view.shown.steps.map((s) => s.drain.name).join(', then ')}.`
    : 'No drain can be cast.';
  return `
  <svg class="ladder-diagram" viewBox="0 0 ${WIDTH} ${height}" role="group" aria-labelledby="diagram-title diagram-desc">
    <desc id="diagram-desc">${escapeHtml(summary)}</desc>
    ${DRAIN_LINES.map((line) => renderRails(line, catalog, view, rungs)).join('')}
    ${[...view.rungs.values()].map((rung) => renderRung(rung, rungs)).join('')}
    ${renderPath(view, rungs)}
  </svg>`;
}
