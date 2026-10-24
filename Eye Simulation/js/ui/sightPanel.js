// The right panel, "How it sees": scene buttons, the scene as the current eye sees it, the Light slider,
// and below it the eye's own settings that belong with the scene (Focus), filled in by main.js.
import { escapeHtml } from './glossary.js';
import { SCENES, imageScene, drawPlain } from '../scenes/scenes.js';
import { SightRenderer, sightParams, VIEW_W, VIEW_H, BLIND_SPOT } from '../sight/sightPipeline.js';

const THUMB_W = 128;
const THUMB_H = 80;

const LIGHT_TIP = 'How much light there is, from a sunny day to a dark night.';
const MADE_UP_NOTE = 'Screens can’t show the extra colors.';
const MADE_UP_TIP = 'Made-up colors: every color is shifted to make room for the extra ones. They show which things this eye can tell apart, not the real colors.';

const lightText = v => (v >= 0.8 ? 'Day' : v >= 0.55 ? 'Dim' : v >= 0.3 ? 'Dusk' : 'Night');

export function createSight(root, { parts, onScene, onLight, onImage }) {
  root.innerHTML = `
    <div class="scene-picker" role="group" aria-label="Scene">
      ${SCENES.map(s => `
        <button type="button" class="scene-button" data-scene="${s.id}" aria-pressed="false">
          <canvas width="${THUMB_W}" height="${THUMB_H}" aria-hidden="true"></canvas><span>${escapeHtml(s.label)}</span>
        </button>`).join('')}
      <button type="button" class="scene-button scene-button--own" data-scene="own" aria-pressed="false"
        data-tip="Pick a photo from your computer. It never leaves your computer.">
        <canvas width="${THUMB_W * 2}" height="${THUMB_H}" aria-hidden="true"></canvas><span>Load your own image</span>
      </button>
      <input type="file" accept="image/*" hidden>
    </div>
    <div class="sight-view">
      <canvas width="${VIEW_W}" height="${VIEW_H}" aria-label="The scene as this eye sees it"></canvas>
      <span class="sight-tag sight-tag--blind" tabindex="0" data-tip="${escapeHtml(parts.blindSpot.tip)}">blind spot</span>
      <span class="sight-tag sight-tag--made-up" tabindex="0" data-tip="${escapeHtml(MADE_UP_TIP)}">False color</span>
      <p class="sight-missing" hidden></p>
    </div>
    <p class="sight-note" hidden></p>
    <div class="sight-controls">
      <section class="setting">
        <div class="setting-head">
          <span class="setting-name" tabindex="0" data-tip="${escapeHtml(LIGHT_TIP)}">Light</span>
          <output class="setting-value"></output>
        </div>
        <input type="range" min="0" max="1" step="0.01" aria-label="Light">
        <div class="setting-ends" aria-hidden="true"><span>Night</span><span>Day</span></div>
      </section>
      <div class="sight-settings"></div>
    </div>`;

  for (const s of SCENES) drawPlain(root.querySelector(`[data-scene="${s.id}"] canvas`), s);
  const ownButton = root.querySelector('[data-scene="own"]');
  drawEmptyThumb(ownButton.querySelector('canvas'));

  const fileInput = root.querySelector('input[type="file"]');
  const lightInput = root.querySelector('input[type="range"]');
  const view = root.querySelector('.sight-view canvas');
  const blindTag = root.querySelector('.sight-tag--blind');
  const madeUpTag = root.querySelector('.sight-tag--made-up');
  const note = root.querySelector('.sight-note');
  const missing = root.querySelector('.sight-missing');
  blindTag.style.left = `${BLIND_SPOT.x * 100}%`;
  blindTag.style.top = `${(BLIND_SPOT.y + BLIND_SPOT.ry) * 100 + 2}%`;

  let current = null;
  root.addEventListener('click', e => {
    const btn = e.target.closest('[data-scene]');
    if (!btn) return;
    // The own-image button picks a file the first time, and again once its picture is showing.
    if (btn.dataset.scene === 'own' && (!current?.ownImage || current.sceneId === 'own')) fileInput.click();
    else onScene(btn.dataset.scene);
  });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    try {
      onImage(await createImageBitmap(file));
    } catch {
      missing.hidden = false;
      missing.textContent = 'That file isn’t a picture this browser can open.';
    }
  });
  lightInput.addEventListener('input', () => onLight(Number(lightInput.value)));

  const renderer = new SightRenderer();
  let pending = null;
  let thumbFor = null;

  // Drawing waits for the next frame, so a dragged slider redraws at most once per frame.
  function draw() {
    pending = null;
    const s = current;
    const scene = s.sceneId === 'own' && s.ownImage ? imageScene(s.ownImage) : SCENES.find(x => x.id === s.sceneId);
    renderer.render(view, scene, sightParams(s.settings, s.light));
  }

  return {
    /** Redraw for this state (`built` is false for eyes that aren't made yet). */
    update(s, built, eyeLabel) {
      for (const btn of root.querySelectorAll('[data-scene]')) {
        btn.setAttribute('aria-pressed', String(btn.dataset.scene === s.sceneId));
      }
      if (s.ownImage && s.ownImage !== thumbFor) {
        thumbFor = s.ownImage;
        drawCover(ownButton.querySelector('canvas'), s.ownImage);
      }
      if (document.activeElement !== lightInput) lightInput.value = s.light;
      root.querySelector('.setting-value').textContent = lightText(s.light);

      missing.hidden = built;
      missing.textContent = built ? '' : `The ${eyeLabel.toLowerCase()}’s view arrives in a later step`;
      view.style.visibility = built ? '' : 'hidden';
      if (!built) {
        blindTag.hidden = madeUpTag.hidden = note.hidden = true;
        return;
      }
      const p = sightParams(s.settings, s.light);
      blindTag.hidden = !p.blindSpot;
      const shift = p.color?.kind === 'shift' ? p.color.channels : 0;
      madeUpTag.hidden = !shift;
      note.hidden = !shift;
      note.textContent = shift ? MADE_UP_NOTE : '';
      current = s;
      pending ??= requestAnimationFrame(draw);
    },
  };
}

/** The loaded picture, cropped to fill the thumbnail. */
function drawCover(canvas, image) {
  const ctx = canvas.getContext('2d');
  const k = Math.max(canvas.width / image.width, canvas.height / image.height);
  const w = image.width * k;
  const h = image.height * k;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
}

function drawEmptyThumb(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#eceae4';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#4a4f5a';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  ctx.beginPath();
  ctx.moveTo(cx - 14, cy);
  ctx.lineTo(cx + 14, cy);
  ctx.moveTo(cx, cy - 14);
  ctx.lineTo(cx, cy + 14);
  ctx.stroke();
}
