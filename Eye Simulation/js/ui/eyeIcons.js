// Simple line icons for the eye type buttons. They use currentColor, so they follow the text color.

const svg = body => `<svg viewBox="0 0 64 40" width="64" height="40" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const almond = '<path d="M4 20 Q32 -2 60 20 Q32 42 4 20 Z"/>';

export const EYE_ICONS = {
  // A shallow pit with sensors along its floor, light coming in from above.
  cup: svg('<path d="M8 8 Q8 34 32 34 Q56 34 56 8"/>' + [[14, 24], [22, 30], [32, 32], [42, 30], [50, 24]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.2" fill="currentColor"/>`).join('')),
  // A deep round chamber with a tiny gap at the front.
  pinhole: svg('<path d="M47 9 A15 15 0 1 0 47 31"/><circle cx="20" cy="20" r="3" fill="currentColor"/><path d="M52 20 h8"/>'),
  camera: svg(`${almond}<circle cx="32" cy="20" r="9"/><circle cx="32" cy="20" r="3.5" fill="currentColor"/>`),
  compound: svg([[22, 12], [32, 12], [42, 12], [17, 20.5], [27, 20.5], [37, 20.5], [47, 20.5], [22, 29], [32, 29], [42, 29]]
    .map(([x, y]) => `<path d="M${x - 5} ${y} l2.5 -4.3 h5 l2.5 4.3 l-2.5 4.3 h-5 Z"/>`).join('')),
  mirror: svg('<path d="M6 34 Q32 -6 58 34 Z"/>' + [12, 20, 28, 36, 44, 52].map(x => `<circle cx="${x}" cy="31" r="2.2" fill="currentColor"/>`).join('')),
};
