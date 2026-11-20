import { describe, expect, it } from 'vitest';
import document from '../../data/drains.json';
import { toDrainCatalog } from '../data/catalog';
import type { Trader } from '../domain/ladder';
import { parseSkillPoints } from '../domain/skill';
import { renderOutOfReach, renderSteps, renderSummary } from './render';
import { buildLadderView } from './view';

const catalog = toDrainCatalog(document);

const trader = (skill: number, buff = 0): Trader => ({
  skill: parseSkillPoints(skill),
  temporaryBuff: parseSkillPoints(buff),
  meetsUnevaluatedRequirements: false,
});

/** The text of each step of the ladder to the given drain, markup removed. */
const stepTexts = (who: Trader, drainId: number): string[] =>
  renderSteps(buildLadderView(catalog, who, drainId))
    .split('<li class="step')
    .slice(1)
    .map((html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));

describe('renderSteps: why a cast is castable', () => {
  it('says she meets it on her own skill, and quotes her own skill without other buffs', () => {
    // Own 290 + 10 other buffs; Deprive Skills needs 216.
    const [step] = stepTexts(trader(290, 10), 85864);

    expect(step).toContain('You meet this on your own skill (290).');
  });

  it('credits her other buffs when they alone close the gap', () => {
    // Own 30 + 6 other buffs = 36 = Deprive (Weak). On her own she is 6 short.
    const [step] = stepTexts(trader(30, 6), 85872);

    expect(step).toContain('Needs 36, you have 36');
    expect(step).toContain('On your own you are 6 short. Your other buffs (+6) make it castable.');
  });

  it('credits a running drain when it alone closes the gap', () => {
    // Own 216: Ransack Skills needs 241, 25 short; Ransack (Average) gives +25.
    const steps = stepTexts(trader(216), 85863);

    expect(steps[1]).toContain(
      'On your own you are 25 short. The buff from Ransack (Average) (+25) makes it castable.',
    );
  });

  it('credits her other buffs and the running drain together when both are needed', () => {
    // Own 200 + 10 other buffs = 210. Deprive Skills needs 216: 16 short on her
    // own. Ransack (Weak) (needs 58) adds +9: 200 + 10 + 9 = 219.
    const steps = stepTexts(trader(200, 10), 85864);

    expect(steps).toHaveLength(2);
    expect(steps[1]).toContain('Needs 216, you have 219');
    expect(steps[1]).toContain(
      'On your own you are 16 short. Your other buffs (+10) and the buff from Ransack (Weak) (+9) make it castable.',
    );
  });
});

describe('renderSummary', () => {
  it('names the weakest drain from the data when nothing is castable', () => {
    const html = renderSummary(buildLadderView(catalog, trader(35), null));

    expect(html).toContain('Deprive Skills (Weak), needs 36');
  });
});

describe('renderOutOfReach', () => {
  it('says in plain words what the Nanite Improved requirement is', () => {
    // data: "Cyberdeck & 6" is the flag set by wearing the Trader Nanodeck (auno id 270769).
    const html = renderOutOfReach(buildLadderView(catalog, trader(1801), null));

    expect(html).toContain('also needs the Trader Nanodeck worn');
    expect(html).toContain('Cyberdeck &amp; 6');
  });
});
