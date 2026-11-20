import type { Drain, DrainLine } from '../domain/drain';

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export const escapeHtml = (text: string | number): string =>
  String(text).replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);

/** "Deprive Skills (Major)" -> "Deprive (Major)". */
export const shortName = (drain: Drain): string => drain.name.replace(' Skills', '');

export const LINE_TITLE: Readonly<Record<DrainLine, string>> = {
  divest: 'Deprive / Divest',
  plunder: 'Ransack / Plunder',
};

export const drainLink = (drain: Drain, text = drain.name): string =>
  `<a href="${escapeHtml(drain.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`;

export const duration = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
};

/**
 * Plain-words meaning of requirements the calculator cannot evaluate, keyed by
 * the text the source prints. "Cyberdeck & 6" is the flag set by wearing the
 * Trader Nanodeck (see data/GAPS.md).
 */
const REQUIREMENT_MEANING: Readonly<Record<string, string>> = {
  'Cyberdeck & 6': 'the Trader Nanodeck worn',
};

/** e.g. "the Trader Nanodeck worn (<code>Cyberdeck &amp; 6</code>)". */
export const describeRequirement = (requirement: string): string => {
  const meaning = REQUIREMENT_MEANING[requirement];
  const code = `<code>${escapeHtml(requirement)}</code>`;
  return meaning ? `${escapeHtml(meaning)} (${code})` : code;
};
