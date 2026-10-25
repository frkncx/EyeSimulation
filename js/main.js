// Entry point: load the eye list, keep one store, and let each part of the page redraw from it.
import { createStore } from './state.js';
import { escapeHtml } from './ui/glossary.js';
import { EYE_ICONS } from './ui/eyeIcons.js';
import { EyeStage } from './eye3d/eyeStage.js';
import { buildCameraEye } from './eye3d/cameraEye.js';
import { createSettings, rangeFor, eyeConfig, shows } from './ui/settingsPanel.js';
import { installTips } from './ui/tips.js';
import { createSight } from './ui/sightPanel.js';
import { createSpectrumBar } from './ui/spectrumBar.js';
import { peaksForCount, dragRange, bandReach } from './model/spectrum.js';

// 3D models that exist so far, by type `model`. The other types arrive one build step at a time.
const MODELS = { camera: buildCameraEye };
const CUSTOM = 'custom';
const BIG_EYE_MM = 30;

// Short notes above the 3D eye, shown while their setting is on. `when` gets the settings and the whole state.
const EYE_NOTES = [
  { when: s => s.amblyopia === 'on', text: 'The eye is healthy. The brain gives its signal less weight.' },
  { when: s => s.eyeSizeMm >= BIG_EYE_MM, text: 'Bigger eye, more light: but it takes up more of the head and costs more energy.' },
  { when: s => s.eyeShape === 'tube', text: 'Can’t move in its socket: the animal turns its head instead.' },
  { when: (s, st) => st.rays.uv && bandReach(s).uv, text: 'Seeing UV: the retina is exposed to light that damages it over a lifetime.' },
];

/** What the UV and IR rays are doing in this eye right now: hover text for the buttons and for the rays themselves. */
function rayTips(s, rays) {
  const reach = bandReach(s);
  const uvNow = reach.uv ? 'UV passes the clear lens and reaches the retina, where the bluest sensor picks some of it up.'
    : s.uvLens === 'on' && s.lensCutoffNm ? 'UV is stopped by the slightly yellow lens, so it never reaches the retina.'
    : 'UV gets through to the retina, but no sensor here is tuned blue enough to catch it.';
  const irNow = reach.ir ? 'Near-infrared reaches the retina, and the red-shifted reddest sensor picks it up.'
    : 'Near-infrared reaches the retina, but no sensor here is tuned red enough to catch it.';
  const faint = seen => (seen ? '' : ' That’s why the rays are faint.');
  return {
    uv: `${rays.uv ? 'Hide' : 'Show'} ultraviolet light rays. ${uvNow}`,
    ir: `${rays.ir ? 'Hide' : 'Show'} infrared light rays. ${irNow}`,
    uvRay: `Ultraviolet light, just past violet. ${uvNow}${faint(reach.uv)}`,
    irRay: `Near-infrared light, just past red. ${irNow}${faint(reach.ir)}`,
  };
}

const $ = sel => document.querySelector(sel);

async function main() {
  const res = await fetch('data/eyes.json');
  if (!res.ok) throw new Error(`Could not load data/eyes.json (${res.status})`);
  const data = await res.json();
  const typeById = Object.fromEntries(data.types.map(t => [t.id, t]));
  const exampleById = Object.fromEntries(data.examples.map(e => [e.id, e]));
  const settingById = Object.fromEntries(data.settings.map(s => [s.id, s]));

  const defaultsFor = id => ({ ...exampleById[id].defaults });
  const configFor = s => eyeConfig(typeById[s.typeId], exampleById[s.exampleId]);
  const startType = typeById[data.defaultType];
  const store = createStore({
    typeId: startType.id, exampleId: startType.defaultExample, settings: defaultsFor(startType.defaultExample),
    cut: 0, labels: true, sceneId: 'garden', light: 1, ownImage: null, spectrumNote: null, rays: { uv: false, ir: false },
  });
  const stage = new EyeStage($('#eyeView'), data.parts, $('#tooltip'));

  installTips($('#tooltip'));

  const pupilSetting = settingById.pupilMm;
  const changeSetting = (key, value) => store.set(s => {
    const settings = { ...s.settings, [key]: value };
    // A smaller eye can't keep a pupil wider than it allows.
    const [, maxPupil] = rangeFor(pupilSetting, configFor(s), settings);
    if (settings.pupilMm > maxPupil) settings.pupilMm = maxPupil;
    // The color buttons and the spectrum bar agree: a new number of sensors gets new peaks.
    // The example's own number brings back its real peaks and lens.
    if (key === 'colors') {
      const own = exampleById[s.exampleId].defaults;
      settings.peaks = peaksForCount(Number(value), s.settings.peaks, own.peaks);
      if (own.peaks?.length === Number(value)) settings.uvLens = own.uvLens;
    }
    return { settings, spectrumNote: null };
  });
  const settingsPanel = createSettings($('#settings'), data, changeSetting);

  /** "Custom" while any setting on screen, or the spectrum, differs from the example's own values. */
  const isCustom = s => {
    const example = exampleById[s.exampleId];
    return configFor(s).settings.some(id =>
      shows(settingById[id], s.settings) && s.settings[id] !== example.defaults[id]) ||
      String(s.settings.peaks) !== String(example.defaults.peaks) || s.settings.uvLens !== example.defaults.uvLens;
  };

  const colorsLocked = s => configFor(s).allowed.colors?.length === 1;
  const spectrum = createSpectrumBar($('#spectrum'), {
    onDrag: (end, nm, start) => store.set(s => {
      const { peaks, uvLens, note } = dragRange(end, nm, start);
      const colors = String(peaks.length);
      // A count with no button for this eye isn't allowed.
      const allowed = configFor(s).allowed.colors;
      if (allowed && !allowed.includes(colors)) return {};
      return { settings: { ...s.settings, peaks, uvLens, colors }, spectrumNote: note };
    }),
  });

  const sight = createSight($('#sight'), {
    parts: data.parts,
    onScene: sceneId => store.set({ sceneId }),
    onLight: light => store.set({ light }),
    onImage: ownImage => store.set({ ownImage, sceneId: 'own' }),
  });
  const sightSettings = createSettings($('#sight .sight-settings'), data, changeSetting, 'sight');

  const cutSlider = $('#cutSlider');
  cutSlider.addEventListener('input', () => store.set({ cut: Number(cutSlider.value) / 100 }));
  $('#labelsToggle').addEventListener('click', () => store.set(s => ({ labels: !s.labels })));
  const rayButtons = $('#rayButtons');
  rayButtons.addEventListener('click', e => {
    const btn = e.target.closest('[data-ray]');
    if (btn) store.set(s => ({ rays: { ...s.rays, [btn.dataset.ray]: !s.rays[btn.dataset.ray] } }));
  });

  const buttons = $('#eyeButtons');
  buttons.innerHTML = data.types.map(t => `
    <button type="button" class="eye-button" data-type="${t.id}" aria-pressed="false" data-tip="${escapeHtml(t.hint)}">
      ${EYE_ICONS[t.id] ?? ''}<span>${escapeHtml(t.label)}</span>
    </button>`).join('');
  buttons.addEventListener('click', e => {
    const btn = e.target.closest('[data-type]');
    if (!btn) return;
    const exampleId = typeById[btn.dataset.type].defaultExample;
    store.set({ typeId: btn.dataset.type, exampleId, settings: defaultsFor(exampleId), spectrumNote: null });
  });

  const exampleSelect = $('#exampleSelect');
  exampleSelect.addEventListener('change', () => {
    const exampleId = exampleSelect.value;
    if (exampleId !== CUSTOM) store.set({ exampleId, settings: defaultsFor(exampleId), spectrumNote: null });
  });

  $('#resetButton').addEventListener('click', () => store.set(s => ({ settings: defaultsFor(s.exampleId), sceneId: 'garden', light: 1, spectrumNote: null })));

  const render = (s, prev) => {
    for (const btn of buttons.querySelectorAll('[data-type]')) {
      btn.setAttribute('aria-pressed', String(btn.dataset.type === s.typeId));
    }
    const type = typeById[s.typeId];
    const example = exampleById[s.exampleId];
    const custom = isCustom(s);
    if (!prev || s.typeId !== prev.typeId) {
      exampleSelect.innerHTML = data.examples.filter(e => e.type === type.id)
        .map(e => `<option value="${e.id}">${escapeHtml(e.label)}</option>`).join('') +
        `<option value="${CUSTOM}" disabled>Custom</option>`;
    }
    exampleSelect.querySelector(`[value="${CUSTOM}"]`).hidden = !custom;
    exampleSelect.value = custom ? CUSTOM : example.id;
    if (example.tip) exampleSelect.dataset.tip = example.tip;
    else delete exampleSelect.dataset.tip;
    $('#resetButton').dataset.tip = `Put the ${example.label.toLowerCase()} settings, the flower garden and daylight back.`;

    const model = MODELS[type.model];
    if (!prev || s.typeId !== prev.typeId || s.exampleId !== prev.exampleId || s.settings !== prev.settings || s.rays !== prev.rays) {
      $('#eyeMissing').hidden = !!model;
      $('#eyeMissing').textContent = model ? '' : `The ${type.label.toLowerCase()} arrives in a later step`;
      rayButtons.hidden = !model;
      const tips = rayTips(s.settings, s.rays);
      for (const btn of rayButtons.querySelectorAll('[data-ray]')) {
        btn.setAttribute('aria-pressed', String(s.rays[btn.dataset.ray]));
        btn.dataset.tip = tips[btn.dataset.ray];
        // The button just clicked keeps its hover text, updated.
        if (btn.matches(':hover')) btn.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
      }
      data.parts.uvLight.tip = tips.uvRay;
      data.parts.irLight.tip = tips.irRay;
      if (model) {
        stage.setEye(model({ ...s.settings, irisColor: example.look?.iris, rays: s.rays }));
        settingsPanel.update(configFor(s), s.settings);
        sightSettings.update(configFor(s), s.settings);
      } else {
        settingsPanel.clear('Arrives in a later step');
        sightSettings.clear('');
      }
      $('#eyeView').hidden = !model;
      const notes = model ? EYE_NOTES.filter(n => n.when(s.settings, s)).map(n => n.text) : [];
      $('#eyeNote').hidden = !notes.length;
      $('#eyeNote').innerHTML = notes.map(t => `<span>${escapeHtml(t)}</span>`).join('');
    }
    if (!prev || s.settings !== prev.settings || s.exampleId !== prev.exampleId || s.typeId !== prev.typeId || s.spectrumNote !== prev.spectrumNote) {
      spectrum.update(s.settings, { shown: !!model, locked: colorsLocked(s), lensTip: example.lensTip, note: s.spectrumNote });
    }
    if (!prev || ['typeId', 'exampleId', 'settings', 'sceneId', 'light', 'ownImage'].some(k => s[k] !== prev[k])) {
      sight.update(s, !!model, type.label);
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
