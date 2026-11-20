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
