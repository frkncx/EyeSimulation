// Entry point: load the eye list, keep one store, and let each part of the page redraw from it.
import { createStore } from './state.js';
import { escapeHtml } from './ui/glossary.js';
import { EYE_ICONS } from './ui/eyeIcons.js';
import { EyeStage } from './eye3d/eyeStage.js';
import { buildCameraEye } from './eye3d/cameraEye.js';
import { createSettings, rangeFor } from './ui/settingsPanel.js';
import { installTips } from './ui/tips.js';
import { createSight } from './ui/sightPanel.js';

const BUILT_EYES = new Set(['human']); // the other seven arrive in build step 5

const $ = sel => document.querySelector(sel);

async function main() {
  const res = await fetch('data/eyes.json');
  if (!res.ok) throw new Error(`Could not load data/eyes.json (${res.status})`);
  const data = await res.json();
  const eyeById = Object.fromEntries(data.eyes.map(e => [e.id, e]));

  const defaultsFor = id => ({ ...(eyeById[id].defaults ?? {}) });
  const store = createStore({
    eyeId: 'human', settings: defaultsFor('human'), cut: 0, labels: true,
    sceneId: 'garden', light: 1, ownImage: null,
  });
  const stage = new EyeStage($('#eyeView'), data.parts, $('#tooltip'));

  installTips($('#tooltip'));

  const pupilSetting = data.settings.find(s => s.id === 'pupilMm');
  const settingsPanel = createSettings($('#settings'), data, (key, value) => store.set(s => {
    const settings = { ...s.settings, [key]: value };
    // A smaller eye can't keep a pupil wider than it allows.
    const [, maxPupil] = rangeFor(pupilSetting, eyeById[s.eyeId], settings);
    if (settings.pupilMm > maxPupil) settings.pupilMm = maxPupil;
    return { settings };
  }));

  const sight = createSight($('#sight'), {
    parts: data.parts,
    onScene: sceneId => store.set({ sceneId }),
    onLight: light => store.set({ light }),
    onImage: ownImage => store.set({ ownImage, sceneId: 'own' }),
  });

  const cutSlider = $('#cutSlider');
  cutSlider.addEventListener('input', () => store.set({ cut: Number(cutSlider.value) / 100 }));
  $('#labelsToggle').addEventListener('click', () => store.set(s => ({ labels: !s.labels })));

  const buttons = $('#eyeButtons');
  buttons.innerHTML = data.eyes.map(e => `
    <button type="button" class="eye-button" data-eye="${e.id}" aria-pressed="false" data-tip="${escapeHtml(e.hint)}">
      ${EYE_ICONS[e.id] ?? ''}<span>${escapeHtml(e.label)}</span>
    </button>`).join('');
  buttons.addEventListener('click', e => {
    const btn = e.target.closest('[data-eye]');
    if (btn) store.set({ eyeId: btn.dataset.eye, settings: defaultsFor(btn.dataset.eye) });
  });
  $('#resetButton').addEventListener('click', () => store.set(s => ({ settings: defaultsFor(s.eyeId), sceneId: 'garden', light: 1 })));

  const render = (s, prev) => {
    for (const btn of buttons.querySelectorAll('[data-eye]')) {
      btn.setAttribute('aria-pressed', String(btn.dataset.eye === s.eyeId));
    }
    const eye = eyeById[s.eyeId];
    $('#resetButton').dataset.tip = `Put the ${eye.label.toLowerCase()} eye's settings, the scene and the light back to the start.`;

    if (!prev || s.eyeId !== prev.eyeId || s.settings !== prev.settings) {
      const built = BUILT_EYES.has(eye.id);
      $('#eyeMissing').hidden = built;
      $('#eyeMissing').textContent = built ? '' : `The ${eye.label.toLowerCase()} eye arrives in step 5`;
      if (built) {
        stage.setEye(buildCameraEye({ ...s.settings, irisColor: eye.look?.iris }));
        settingsPanel.update(eye, s.settings);
      } else {
        settingsPanel.clear('Arrives in step 5');
      }
      $('#eyeView').hidden = !built;
    }
    if (!prev || ['eyeId', 'settings', 'sceneId', 'light', 'ownImage'].some(k => s[k] !== prev[k])) {
      sight.update(s, BUILT_EYES.has(eye.id), eye.label);
    }
    stage.setCut(s.cut);
    stage.setLabels(s.labels);
    $('#cutValue').textContent = `${Math.round(s.cut * 100)}%`;
    $('#labelsToggle').setAttribute('aria-pressed', String(s.labels));
  };
  store.subscribe(render);
  render(store.get(), null);

  window.eyeSim = { data, store, stage };
}

main().catch(err => {
  console.error(err);
  document.body.insertAdjacentHTML('afterbegin', `<p style="padding:16px">Could not start: ${escapeHtml(err.message)}. Run <code>node serve.js</code> and open http://localhost:5173.</p>`);
});
