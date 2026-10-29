// Phones and narrow windows: one section at a time picked from a tab bar at the bottom, and the eye types in a
// list that opens from the current one. Wider screens are left as they are.
// The first tab, Compare, shows the 3D eye with the view as a small window on it, and a sheet under them with
// one setting, picked from a row of chips, so a change can be watched in both at once. Pulling the sheet down
// (or tapping its handle) closes it and gives the 3D eye the whole space. It reuses the settings' own rows
// (CSS hides the rest).
import { escapeHtml } from './glossary.js';

export const PHONE = matchMedia('(max-width: 1279.98px)');

/**
 * `toggle` shows the current eye type and opens `list` (the eye type buttons); `tabs` holds the tab buttons.
 * On phones the spectrum bar moves to the top of the settings, and back to the header on wider screens.
 */
export function installPhoneMenus({ toggle, list, tabs, spectrum, settings }) {
  // The toggle copies the current type's icon and name.
  const sync = () => {
    const current = list.querySelector('[aria-pressed="true"]');
    if (!current) return;
    toggle.innerHTML = `${current.querySelector('svg')?.outerHTML ?? ''}<span>${current.querySelector('span').textContent}</span>`;
  };
  new MutationObserver(sync).observe(list, { subtree: true, attributeFilter: ['aria-pressed'] });
  sync();

  // A dark layer behind the open list: tapping it closes the list without touching what's underneath.
  const backdrop = document.createElement('div');
  backdrop.className = 'eye-menu-backdrop';
  backdrop.hidden = true;
  document.body.append(backdrop);
  const setOpen = open => {
    list.classList.toggle('is-open', open);
    backdrop.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  };
  toggle.addEventListener('click', () => setOpen(!list.classList.contains('is-open')));
  backdrop.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });
  // Runs before the buttons' own click handler: picking the current type again only closes the list
  // (picking it would reset its settings).
  list.addEventListener('click', e => {
    if (!PHONE.matches) return;
    const btn = e.target.closest('[data-type]');
    if (!btn) return;
    if (btn.getAttribute('aria-pressed') === 'true') e.stopImmediatePropagation();
    setOpen(false);
  }, true);

  const show = tab => {
    document.body.dataset.tab = tab;
    for (const b of tabs.querySelectorAll('[data-tab]')) b.setAttribute('aria-pressed', String(b.dataset.tab === tab));
  };
  tabs.addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (b) show(b.dataset.tab);
  });
  show('eye');
  installCompare(settings.closest('.layout'), show);

  const home = spectrum.parentElement;
  const homeNext = spectrum.nextSibling;
  const place = () => {
    if (PHONE.matches) settings.before(spectrum);
    else home.insertBefore(spectrum, homeNext);
    if (!PHONE.matches) setOpen(false);
  };
  PHONE.addEventListener('change', place);
  place();
}

/** The chips that pick which setting the Compare tab shows, with "All settings" at the end. */
function installCompare(layout, show) {
  // The sheet's handle: a tap or a swipe opens or closes it.
  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'compare-handle';
  layout.append(handle);
  const setSheet = open => {
    document.body.classList.toggle('sheet-closed', !open);
    handle.setAttribute('aria-expanded', String(open));
    handle.innerHTML = `<span class="compare-grip" aria-hidden="true"></span>${open ? 'Full 3D view' : 'Settings and view'}`;
  };
  setSheet(true);
  let startY = null;
  handle.addEventListener('pointerdown', e => { startY = e.clientY; });
  handle.addEventListener('pointerup', e => {
    const dy = startY == null ? 0 : e.clientY - startY;
    startY = null;
    const open = !document.body.classList.contains('sheet-closed');
    setSheet(dy < -20 ? true : dy > 20 ? false : !open);
  });
  handle.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSheet(document.body.classList.contains('sheet-closed')); }
  });

  // The small view on the eye opens the full "How it sees" tab (its tags still explain themselves).
  layout.querySelector('.sight-view').addEventListener('click', e => {
    if (PHONE.matches && document.body.dataset.tab === 'eye' && !e.target.closest('.sight-tag')) show('sight');
  });

  const chips = document.createElement('div');
  chips.className = 'compare-chips';
  chips.setAttribute('role', 'group');
  chips.setAttribute('aria-label', 'Setting to adjust');
  layout.append(chips);
  let focus = null; // the shown row's data-row
  let picked = false; // until a chip is tapped, the first setting shows (the list fills in after this runs)
  let drawn = '';

  const rows = () => [...layout.querySelectorAll('.settings-panel .setting, .sight-panel .setting')].filter(r => !r.hidden);
  const render = () => {
    pending = null;
    const list = rows();
    if (!picked || !list.some(r => r.dataset.row === focus)) focus = list[0]?.dataset.row ?? null;
    for (const r of layout.querySelectorAll('.setting.is-focus')) if (r.dataset.row !== focus) r.classList.remove('is-focus');
    list.find(r => r.dataset.row === focus)?.classList.add('is-focus');
    const html = list.map(r => `<button type="button" data-row="${r.dataset.row}" aria-pressed="${r.dataset.row === focus}">${
      escapeHtml(r.querySelector('.setting-name').textContent)}</button>`).join('')
      + '<button type="button" class="compare-all">All settings</button>';
    if (html !== drawn) chips.innerHTML = drawn = html; // unchanged chips keep their scroll position
  };
  // Settings rebuild for each eye and rows hide with other settings: redraw the chips once per frame at most.
  let pending = null;
  const later = () => { pending ??= requestAnimationFrame(render); };
  for (const panel of layout.querySelectorAll('.settings-panel, .sight-panel')) {
    new MutationObserver(later).observe(panel, { childList: true, subtree: true, attributeFilter: ['hidden'] });
  }
  render();

  chips.addEventListener('click', e => {
    if (e.target.closest('.compare-all')) return show('settings');
    const chip = e.target.closest('[data-row]');
    if (!chip) return;
    focus = chip.dataset.row;
    picked = true;
    render();
    chips.querySelector(`[data-row="${focus}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
}
