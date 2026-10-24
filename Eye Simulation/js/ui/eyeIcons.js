// Simple line icons for the eye type buttons. They use currentColor, so they follow the text color.

const svg = body => `<svg viewBox="0 0 64 40" width="64" height="40" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const almond = '<path d="M4 20 Q32 -2 60 20 Q32 42 4 20 Z"/>';

export const EYE_ICONS = {
  human: svg(`${almond}<circle cx="32" cy="20" r="9"/><circle cx="32" cy="20" r="3.5" fill="currentColor"/>`),
  octopus: svg(`${almond}<circle cx="32" cy="20" r="10"/><rect x="24" y="17.5" width="16" height="5" rx="2.5" fill="currentColor"/>`),
  jumpingSpider: svg('<circle cx="21" cy="20" r="12"/><circle cx="43" cy="20" r="12"/><circle cx="21" cy="20" r="5" fill="currentColor"/><circle cx="43" cy="20" r="5" fill="currentColor"/>'),
  wasp: svg([[22, 12], [32, 12], [42, 12], [17, 20.5], [27, 20.5], [37, 20.5], [47, 20.5], [22, 29], [32, 29], [42, 29]]
    .map(([x, y]) => `<path d="M${x - 5} ${y} l2.5 -4.3 h5 l2.5 4.3 l-2.5 4.3 h-5 Z"/>`).join('')),
  scallop: svg('<path d="M6 34 Q32 -6 58 34 Z"/>' + [12, 20, 28, 36, 44, 52].map(x => `<circle cx="${x}" cy="31" r="2.2" fill="currentColor"/>`).join('')),
  cat: svg(`${almond}<circle cx="32" cy="20" r="11"/><path d="M32 10 Q28 20 32 30 Q36 20 32 10 Z" fill="currentColor"/>`),
  eagle: svg('<path d="M4 16 Q30 4 60 12"/><path d="M8 22 Q32 6 58 20 Q32 38 8 22 Z"/><circle cx="34" cy="21" r="7"/><circle cx="34" cy="21" r="3" fill="currentColor"/>'),
  whale: svg('<path d="M4 24 Q20 8 46 14 Q60 18 60 26 Q44 34 18 32 Q8 30 4 24 Z"/><circle cx="46" cy="22" r="2.5" fill="currentColor"/>'),
};
