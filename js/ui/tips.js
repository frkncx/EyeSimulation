// One-sentence explanations for anything with a data-tip attribute, on hover or keyboard focus.
// On touch screens, tapping a name shows its tip and tapping anywhere else hides it. Tapping a button just
// works the button: a tip popping up over every tap would get in the way.
import { escapeHtml } from './glossary.js';

export function installTips(tooltip) {
  const show = el => {
    const name = el.classList.contains('choice') ? el.textContent.trim() : null;
    tooltip.innerHTML = `${name ? `<strong>${escapeHtml(name)}</strong>: ` : ''}${escapeHtml(el.dataset.tip)}`;
    tooltip.hidden = false;
    const r = el.getBoundingClientRect();
    const w = tooltip.offsetWidth;
    tooltip.style.left = `${Math.max(12, Math.min(r.left, window.innerWidth - w - 12))}px`;
    // Below the element, or above it when there's no room underneath.
    const h = tooltip.offsetHeight;
    const below = r.bottom + 8 + h <= window.innerHeight - 8;
    tooltip.style.top = `${below ? r.bottom + 8 : Math.max(8, r.top - 8 - h)}px`;
  };
  const hide = () => { tooltip.hidden = true; };
  const target = e => e.target.closest?.('[data-tip]');
  const mouse = e => e.pointerType === 'mouse';
  let touched = false; // the last pointer was a finger or pen, so focus that follows a tap shows no tip
  document.addEventListener('pointerover', e => { const el = mouse(e) && target(e); if (el) show(el); });
  document.addEventListener('pointerout', e => { if (mouse(e) && target(e)) hide(); });
  document.addEventListener('pointerdown', e => {
    touched = !mouse(e);
    if (touched) hide();
  }, true);
  document.addEventListener('click', e => {
    if (!touched) return;
    const el = target(e);
    if (el && !el.closest('button, input, select')) show(el);
  });
  document.addEventListener('focusin', e => { const el = !touched && target(e); if (el) show(el); });
  document.addEventListener('focusout', e => { if (target(e)) hide(); });
  document.addEventListener('keydown', e => { touched = false; if (e.key === 'Escape') hide(); });
  // A tip stays put on screen, so it goes once the page under it scrolls.
  document.addEventListener('scroll', hide, true);
}
