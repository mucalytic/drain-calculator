import document_ from '../data/drains.json';
import { toDrainCatalog } from './data/catalog';
import type { Trader } from './domain/ladder';
import { parseSkillPoints, type SkillPoints } from './domain/skill';
import { renderLadderDiagram } from './ui/diagram';
import { renderFooter, renderOutOfReach, renderSteps, renderSummary } from './ui/render';
import { buildLadderView } from './ui/view';

const STORAGE_KEY = 'trader-drain-ladder:inputs';

const catalog = toDrainCatalog(document_);

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`#${id} is missing from the page`);
  return found as T;
}

const skillInput = element<HTMLInputElement>('skill');
const buffInput = element<HTMLInputElement>('buff');
const flagInput = element<HTMLInputElement>('flag');
const diagram = element('diagram');

let selectedDrainId: number | null = null;

/** Parse one field, showing or clearing its error. Returns null when invalid. */
function readSkill(input: HTMLInputElement, errorId: string): SkillPoints | null {
  const error = element(errorId);
  try {
    const value = parseSkillPoints(input.value);
    error.textContent = '';
    input.removeAttribute('aria-invalid');
    return value;
  } catch {
    error.textContent = 'Enter a whole number, 0 or more.';
    input.setAttribute('aria-invalid', 'true');
    return null;
  }
}

function readTrader(): Trader | null {
  const skill = readSkill(skillInput, 'skill-error');
  const temporaryBuff = readSkill(buffInput, 'buff-error');
  if (skill === null || temporaryBuff === null) return null;
  return { skill, temporaryBuff, meetsUnevaluatedRequirements: flagInput.checked };
}

function saveInputs(): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ skill: skillInput.value, buff: buffInput.value, flag: flagInput.checked }),
    );
  } catch {
    // Storage can be unavailable (private mode); the page works without it.
  }
}

function restoreInputs(): void {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (typeof saved !== 'object' || saved === null) return;
    const { skill, buff, flag } = saved as Record<string, unknown>;
    if (typeof skill === 'string') skillInput.value = skill;
    if (typeof buff === 'string') buffInput.value = buff;
    if (typeof flag === 'boolean') flagInput.checked = flag;
  } catch {
    // Ignore unreadable saved inputs and keep the defaults.
  }
}

function render(): void {
  const trader = readTrader();
  if (!trader) return; // keep the last valid result on screen
  const view = buildLadderView(catalog, trader, selectedDrainId);
  element('summary').innerHTML = renderSummary(view);
  diagram.innerHTML = renderLadderDiagram(catalog, view);
  element('steps').innerHTML = renderSteps(view);
  element('out-of-reach').innerHTML = renderOutOfReach(view);
}

function select(drainId: number | null, refocus: boolean): void {
  selectedDrainId = drainId === selectedDrainId ? null : drainId;
  render();
  if (refocus && drainId !== null) {
    diagram.querySelector<SVGGElement>(`[data-drain-id="${drainId}"]`)?.focus();
  }
}

function drainIdOf(target: EventTarget | null): number | null {
  const rung = target instanceof Element ? target.closest('[data-drain-id]') : null;
  const id = Number(rung?.getAttribute('data-drain-id'));
  return rung && Number.isInteger(id) ? id : null;
}

element('controls').addEventListener('input', () => {
  saveInputs();
  render();
});
element('controls').addEventListener('submit', (event) => event.preventDefault());

diagram.addEventListener('click', (event) => {
  const id = drainIdOf(event.target);
  if (id !== null) select(id, false);
});
diagram.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const id = drainIdOf(event.target);
  if (id === null) return;
  event.preventDefault();
  select(id, true);
});
element('steps').addEventListener('click', (event) => {
  if (event.target instanceof Element && event.target.closest('[data-action="show-best"]')) select(null, false);
});

restoreInputs();
element('footer').innerHTML = renderFooter(catalog, document_.meta);
render();
