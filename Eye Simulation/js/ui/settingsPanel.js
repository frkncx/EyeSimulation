// The settings panel: big buttons and sliders built from data, showing only what fits the eye.
import { escapeHtml } from './glossary.js';

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

/** Slider limits for this eye; the pupil can't be wider than about a third of the eye. */
export function rangeFor(setting, eye, settings) {
  let [min, max] = eye.ranges?.[setting.id] ?? [setting.min, setting.max];
  if (setting.maxPerEyeMm) {
    max = Math.min(max, Math.floor((settings.eyeSizeMm * setting.maxPerEyeMm) / setting.step) * setting.step);
  }
  return [min, max];
}

function valueText(setting, value) {
  if (setting.id === 'focus') return focusText(value);
  if (setting.id === 'colorblindStrength') return value < 0.34 ? 'Mild' : value < 0.67 ? 'Medium' : 'Strong';
  return `${value} ${setting.unit ?? ''}`.trim();
}

const shows = (setting, settings) =>
  !setting.showWhen || Object.entries(setting.showWhen).every(([k, v]) => settings[k] === v);

export function createSettings(root, data, onChange) {
  const byId = Object.fromEntries(data.settings.map(s => [s.id, s]));
  let builtFor = null;

  root.addEventListener('input', e => {
    if (e.target.type === 'range') onChange(e.target.dataset.setting, Number(e.target.value));
  });
  root.addEventListener('click', e => {
    const btn = e.target.closest('[data-option]');
    if (btn) onChange(btn.dataset.setting, btn.dataset.option);
  });

  function build(eye) {
    root.innerHTML = eye.settings.map(id => byId[id]).map(s => `
      <section class="setting" data-row="${s.id}">
        <div class="setting-head">
          <span class="setting-name" tabindex="0" data-tip="${escapeHtml(s.tip)}">${escapeHtml(s.label)}</span>
          ${s.type === 'range' ? '<output class="setting-value"></output>' : ''}
        </div>
        ${s.type === 'range'
          ? `<input type="range" data-setting="${s.id}" step="${s.step}" aria-label="${escapeHtml(s.label)}">
             ${s.ends ? `<div class="setting-ends" aria-hidden="true"><span>${escapeHtml(s.ends[0])}</span><span>${escapeHtml(s.ends[1])}</span></div>` : ''}`
          : `<div class="choices" role="group" aria-label="${escapeHtml(s.label)}" style="--cols:${s.columns ?? 2}">
               ${s.options.map(o => `<button type="button" class="choice" data-setting="${s.id}" data-option="${o.id}"
                 aria-pressed="false" data-tip="${escapeHtml(o.tip)}">${escapeHtml(o.label)}</button>`).join('')}
             </div>`}
      </section>`).join('');
    builtFor = eye.id;
  }

  return {
    /** Show a short message instead of settings (the panel rebuilds on the next update). */
    clear(message) {
      root.innerHTML = `<p class="placeholder">${escapeHtml(message)}</p>`;
      builtFor = null;
    },
    update(eye, settings) {
      if (builtFor !== eye.id) build(eye);
      for (const id of eye.settings) {
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
          row.querySelector('output').textContent = valueText(s, value);
        } else {
          for (const btn of row.querySelectorAll('.choice')) btn.setAttribute('aria-pressed', String(btn.dataset.option === value));
        }
      }
    },
  };
}
