// Phones and narrow windows: one section at a time (3D eye, how it sees, settings) picked from a tab bar at
// the bottom, and the eye types in a list that opens from the current one. Wider screens are left as they are.
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
