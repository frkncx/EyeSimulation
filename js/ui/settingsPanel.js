// The settings panel: big buttons and sliders built from data, showing only what fits the eye.
import { escapeHtml } from './glossary.js';
import { REFRACTION_MAX_D } from '../model/optics.js';

/** Focus slider 0..1 is spread evenly in focusing power: 0 = 10 cm, 1 = far away. */
export function focusDistanceM(t) {
  const diopters = 10 * (1 - t);
  return diopters < 0.05 ? Infinity : 1 / diopters;
}

function focusText(t) {
  const m = focusDistanceM(t);
  if (m === Infinity) return 'Far away';
  return m < 1 ? `${Math.round(m * 100)} cm` : `${m.toFixed(1)} m`;
}

/** Rods and cones slider 0..1 is spread evenly on a log scale: 0 = 10 cones per rod, 1 = about 300 rods per cone. */
export function rodsPerCone(t) {
  return 10 ** (-1 + 3.5 * t);
}

function rodsText(t) {
  const ratio = rodsPerCone(t);
  const nice = x => (x < 10 ? Math.round(x) : x < 100 ? Math.round(x / 5) * 5 : Math.round(x / 10) * 10);
  if (ratio >= 1.5) return `About ${nice(ratio)} rods for every cone`;
  if (ratio > 1 / 1.5) return 'About 1 rod for every cone';
  return `About ${nice(1 / ratio)} cones for every rod`;
}

/**
 * What the current type and example allow: their settings, slider limits, and choice options.
 * The example can only narrow what its type allows, never widen it, and can hide settings it doesn't have.
 */
export function eyeConfig(type, example) {
  const hidden = example.hide ?? [];
  return {
    key: `${type.id}/${example.id}`,
    settings: type.settings.filter(id => !hidden.includes(id)),
    allowed: { ...type.allowed, ...example.allowed },
  };
}

/** Slider limits for this eye; the pupil can't be wider than about a third of a round eye, half of a tube eye. */
export function rangeFor(setting, eye, settings) {
  let [min, max] = eye.allowed?.[setting.id] ?? [setting.min, setting.max];
  if (setting.maxPerEyeMm) {
    const perMm = settings.eyeShape === 'tube' ? setting.tubeMaxPerEyeMm : setting.maxPerEyeMm;
    max = Math.min(max, Math.floor((settings.eyeSizeMm * perMm) / setting.step) * setting.step);
  }
  return [min, max];
}

const strengthText = v => (v < 0.34 ? 'Mild' : v < 0.67 ? 'Moderate' : 'Severe');

// The eye's focal length is about 0.7 of its length (17 mm in a 24 mm human eye).
const fNumber = (pupilMm, eyeSizeMm) => (0.7 * eyeSizeMm) / pupilMm;

function valueText(setting, value, settings) {
  if (setting.id === 'pupilMm') return `${value} mm · f/${fNumber(value, settings.eyeSizeMm).toFixed(1)}`;
  if (setting.id === 'focus') return focusText(value);
  if (setting.id === 'rods') return rodsText(value);
  // Written like a glasses prescription: myopia is minus, hyperopia plus.
  if (setting.id === 'refraction') return `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value * REFRACTION_MAX_D).toFixed(2)} D`;
  if (setting.id.endsWith('Strength')) return strengthText(value);
  return `${value} ${setting.unit ?? ''}`.trim();
}

export const shows = (setting, settings) =>
  !setting.showWhen || Object.entries(setting.showWhen).every(([k, v]) => settings[k] === v);

/** Choice options this eye allows. With only one left, it shows alone, already selected. */
const optionsFor = (setting, eye) => {
  const allowed = eye.allowed?.[setting.id];
  return allowed ? setting.options.filter(o => allowed.includes(o.id)) : setting.options;
};

/**
 * A group of settings for one place on the page: `place` matches each setting's "panel"
 * ("settings" when it has none), so one eye's settings can be split between the two side panels.
 */
export function createSettings(root, data, onChange, place = 'settings') {
  const here = eye => eye.settings.filter(id => (byId[id].panel ?? 'settings') === place);
  const byId = Object.fromEntries(data.settings.map(s => [s.id, s]));
  let builtFor = null;

  root.addEventListener('input', e => {
    if (e.target.type === 'range') onChange(e.target.dataset.setting, Number(e.target.value));
  });
  root.addEventListener('click', e => {
    const btn = e.target.closest('[data-option]');
    if (btn) onChange(btn.dataset.setting, btn.dataset.option);
  });

  const row = (s, eye) => `
      <section class="setting" data-row="${s.id}">
        <div class="setting-head">
          <span class="setting-name" tabindex="0" data-tip="${escapeHtml(s.tip)}">${escapeHtml(s.label)}</span>
          ${s.type === 'range' ? '<output class="setting-value"></output>' : ''}
        </div>
        ${s.type === 'range'
          ? `<input type="range" data-setting="${s.id}" step="${s.step}" aria-label="${escapeHtml(s.label)}">
             ${s.ends ? `<div class="setting-ends" aria-hidden="true">${s.ends.map(t => `<span>${escapeHtml(t)}</span>`).join('')}</div>` : ''}`
          : `<div class="choices" role="group" aria-label="${escapeHtml(s.label)}" style="--cols:${s.columns ?? 2}">
               ${optionsFor(s, eye).map(o => `<button type="button" class="choice" data-setting="${s.id}" data-option="${o.id}"
                 aria-pressed="false" data-tip="${escapeHtml(o.tip)}">${escapeHtml(o.label)}</button>`).join('')}
             </div>`}
      </section>`;

  /** Settings that share a `section` sit together under its heading. */
  function build(eye) {
    let html = '';
    let open = null;
    for (const s of here(eye).map(id => byId[id])) {
      if ((s.section ?? null) !== open) {
        if (open) html += '</div>';
        open = s.section ?? null;
        if (open) html += `<div class="setting-group"><h3>${escapeHtml(open)}</h3>`;
      }
      html += row(s, eye);
    }
    root.innerHTML = html + (open ? '</div>' : '');
    builtFor = eye.key;
  }

  return {
    /** Show a short message instead of settings (the panel rebuilds on the next update). */
    clear(message) {
      root.innerHTML = message ? `<p class="placeholder">${escapeHtml(message)}</p>` : '';
      builtFor = null;
    },
    update(eye, settings) {
      if (builtFor !== eye.key) {
        build(eye);
        root.style.minHeight = '';
      }
      // A row that hides must not make the panel shorter, or it scrolls away from the button just clicked.
      const heightBefore = root.offsetHeight;
      for (const id of here(eye)) {
        const s = byId[id];
        const row = root.querySelector(`[data-row="${id}"]`);
        row.hidden = !shows(s, settings);
        const value = settings[id];
        if (s.type === 'range') {
          const input = row.querySelector('input');
          const [min, max] = rangeFor(s, eye, settings);
          input.min = min;
          input.max = max;
          if (document.activeElement !== input) input.value = value;
          row.querySelector('output').textContent = valueText(s, value, settings);
        } else {
          for (const btn of row.querySelectorAll('.choice')) btn.setAttribute('aria-pressed', String(btn.dataset.option === value));
        }
      }
      if (root.offsetHeight < heightBefore) root.style.minHeight = `${heightBefore}px`;
    },
  };
}
