// One-sentence explanations for anything with a data-tip attribute, on hover or keyboard focus.
import { escapeHtml } from './glossary.js';

export function installTips(tooltip) {
  const show = el => {
    const name = el.classList.contains('choice') ? el.textContent.trim() : null;
    tooltip.innerHTML = `${name ? `<strong>${escapeHtml(name)}</strong>: ` : ''}${escapeHtml(el.dataset.tip)}`;
    tooltip.hidden = false;
    const r = el.getBoundingClientRect();
    const w = tooltip.offsetWidth;
    tooltip.style.left = `${Math.max(12, Math.min(r.left, window.innerWidth - w - 12))}px`;
    tooltip.style.top = `${r.bottom + 8}px`;
  };
  const hide = () => { tooltip.hidden = true; };
  const target = e => e.target.closest?.('[data-tip]');
  document.addEventListener('pointerover', e => { const el = target(e); if (el) show(el); });
  document.addEventListener('pointerout', e => { if (target(e)) hide(); });
  document.addEventListener('focusin', e => { const el = target(e); if (el) show(el); });
  document.addEventListener('focusout', e => { if (target(e)) hide(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
}
