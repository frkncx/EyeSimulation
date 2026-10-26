// The right panel, "How it sees": scene buttons, the scene as the current eye sees it, the Light slider,
// and below it the eye's own settings that belong with the scene (Focus), filled in by main.js.
import { escapeHtml } from './glossary.js';
import { SCENES, imageScene, drawPlain } from '../scenes/scenes.js';
import { SightRenderer, sightParams, smallestDetail, blindSpotInView, fitView, FULL_VIEW, VIEW_W, VIEW_H } from '../sight/sightPipeline.js';

const THUMB_W = 128;
const THUMB_H = 80;

const LIGHT_TIP = 'How much light there is, from a sunny day to a dark night.';
const MADE_UP_NOTE = 'Screens can’t show the extra colors.';
const MADE_UP_TIP = 'Made-up colors: every color is shifted to make room for the extra ones. They show which things this eye can tell apart, not the real colors.';
const BANDS_TIP = 'Made-up colors: this eye sees light screens can’t show, so it is painted in a stand-in color: ultraviolet as violet, infrared as red-orange.';
const IR_NOISE_NOTE = 'Body heat sets off red-tuned sensors by mistake, adding noise.';
const IR_BLUR_NOTE = 'Longer light blurs more. A bigger pupil helps.';
const PHOTO_NOTE = 'Photos only record visible light, so this one has no UV or infrared to show.';

const SHARPNESS_TIP = 'Eye chart score from 20 feet (6 m). 20/40 means this eye must be at 20 feet to read what a typical eye reads from 40.';
const DETAIL_TIP = 'The finest gap this eye can make out. A typical human eye manages about 1 arcminute.';

const ENLARGE_TIP = 'Show the view large, over the 3D eye, so you can change settings while looking closely. Esc goes back.';
const SHRINK_TIP = 'Put the view back in this panel.';

// Zoom narrows the 60° view and draws it again at the view's size, so fine detail shows at true size.
// Zoomed in, dragging the view looks around the rest of it.
const ZOOMS = [
  { zoom: 1, tip: 'The whole view, 60° across.' },
  { zoom: 2, tip: '30° of the view, drawn again at full size: detail is shown as it really is. Drag to look around.' },
  { zoom: 4, tip: '15° of the view, drawn again at full size: detail is shown as it really is. Drag to look around.' },
];

const lightText = v => (v >= 0.8 ? 'Day' : v >= 0.55 ? 'Dim' : v >= 0.3 ? 'Dusk' : 'Night');

/** "20/40" and "2 arcminutes (1/30 of a degree)" for a smallest detail of `arcmin`. */
function sharpnessText(arcmin) {
  const score = 20 * arcmin;
  const step = score < 100 ? 5 : 10;
  const am = arcmin < 10 ? Math.round(arcmin * 10) / 10 : Math.round(arcmin);
  // A degree or more (compound eyes) is written in degrees instead of a fraction of one.
  const deg = am >= 60 ? `${Math.round(am / 6) / 10} degree${am === 60 ? '' : 's'}` : `1/${Math.round(60 / am)} of a degree`;
  return {
    score: `20/${Math.max(step, Math.round(score / step) * step)}`,
    detail: `${am} arcminute${am === 1 ? '' : 's'} (${deg})`,
  };
}

/** `defaultsOf(exampleId)` gives an example's own settings, where its sharpness is its measured acuity. */
/** `bigOver` is the element the enlarged view covers (the 3D eye's stage). */
export function createSight(root, { parts, defaultsOf, bigOver, onScene, onLight, onImage }) {
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
      <div class="sight-tools">
        <div class="sight-zoom" role="group" aria-label="Zoom">
          ${ZOOMS.map(z => `<button type="button" data-zoom="${z.zoom}" aria-pressed="${z.zoom === 1}"
            data-tip="${escapeHtml(z.tip)}">${z.zoom}×</button>`).join('')}
        </div>
        <button type="button" class="sight-enlarge" aria-pressed="false" data-tip="${escapeHtml(ENLARGE_TIP)}">Enlarge</button>
      </div>
      <div class="sight-notes"></div>
      <p class="sight-missing" hidden></p>
    </div>
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
    </div>
    <dl class="sharpness">
      <div>
        <dt><span class="setting-name" tabindex="0" data-tip="${escapeHtml(SHARPNESS_TIP)}">Sharpness</span></dt>
        <dd class="setting-value" data-sharpness="score"></dd>
      </div>
      <div>
        <dt><span class="setting-name" tabindex="0" data-tip="${escapeHtml(DETAIL_TIP)}">Smallest detail</span></dt>
        <dd class="setting-value" data-sharpness="detail"></dd>
      </div>
    </dl>`;

  for (const s of SCENES) drawPlain(root.querySelector(`[data-scene="${s.id}"] canvas`), s);
  const ownButton = root.querySelector('[data-scene="own"]');
  drawEmptyThumb(ownButton.querySelector('canvas'));

  const fileInput = root.querySelector('input[type="file"]');
  const lightInput = root.querySelector('input[type="range"]');
  const view = root.querySelector('.sight-view canvas');
  const blindTag = root.querySelector('.sight-tag--blind');
  const madeUpTag = root.querySelector('.sight-tag--made-up');
  const missing = root.querySelector('.sight-missing');
  const viewNotes = root.querySelector('.sight-notes');
  const sharpness = root.querySelector('.sharpness');

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

  // Enlarged, the view sits over the 3D eye's stage: as big as fits there at its own shape, centered on a dark
  // backdrop. The settings on both sides stay where they are.
  const viewBox = root.querySelector('.sight-view');
  const enlarge = root.querySelector('.sight-enlarge');
  const backdrop = document.createElement('div');
  backdrop.className = 'sight-backdrop';
  backdrop.hidden = true;
  document.body.append(backdrop);
  let big = false;
  const place = () => {
    if (!big) return;
    const r = bigOver.getBoundingClientRect();
    Object.assign(backdrop.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    const pad = 12;
    const w = Math.min(r.width - 2 * pad, (r.height - 2 * pad) * VIEW_W / VIEW_H);
    const h = w * VIEW_H / VIEW_W;
    Object.assign(viewBox.style, {
      left: `${r.left + (r.width - w) / 2}px`, top: `${r.top + (r.height - h) / 2}px`, width: `${w}px`,
    });
  };
  const setBig = on => {
    big = on;
    viewBox.classList.toggle('sight-view--big', on);
    backdrop.hidden = !on;
    enlarge.textContent = on ? 'Shrink' : 'Enlarge';
    enlarge.setAttribute('aria-pressed', String(on));
    enlarge.dataset.tip = on ? SHRINK_TIP : ENLARGE_TIP;
    if (on) place();
    else viewBox.style.left = viewBox.style.top = viewBox.style.width = '';
  };
  enlarge.addEventListener('click', () => setBig(!big));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && big) setBig(false); });
  new ResizeObserver(place).observe(bigOver);
  window.addEventListener('resize', place);

  const renderer = new SightRenderer();
  let pending = null;
  let thumbFor = null;
  let shown = FULL_VIEW; // the part of the view shown: zoom, and where it is centered
  let blindSpot = null; // this eye's blind spot at 1× zoom, for placing its tag

  // Drawing waits for the next frame, so a dragged slider redraws at most once per frame.
  const redraw = () => { if (current) pending ??= requestAnimationFrame(draw); };

  // The scene is drawn at the view's own size in screen pixels, not stretched from a smaller picture.
  function draw() {
    pending = null;
    const s = current;
    const w = Math.round(view.clientWidth * (window.devicePixelRatio || 1));
    const h = Math.round(w * VIEW_H / VIEW_W);
    if (w > 0 && (view.width !== w || view.height !== h)) {
      view.width = w;
      view.height = h;
    }
    const scene = s.sceneId === 'own' && s.ownImage ? imageScene(s.ownImage) : SCENES.find(x => x.id === s.sceneId);
    renderer.render(view, scene, sightParams(s.settings, s.light), shown);
  }
  new ResizeObserver(redraw).observe(view);

  /** The blind spot's tag: under the spot, or above it when it reaches the bottom of the view; hidden when zoomed out of sight. */
  function placeBlindTag() {
    const spot = blindSpotInView(blindSpot, shown);
    blindTag.hidden = !spot;
    if (!spot) return;
    const below = spot.y + spot.ry < 0.85;
    blindTag.style.left = `${Math.min(92, Math.max(8, spot.x * 100))}%`;
    blindTag.style.top = `${(below ? Math.max(0, spot.y + spot.ry) * 100 + 2 : (spot.y - spot.ry) * 100 - 10)}%`;
  }

  const zoomButtons = root.querySelectorAll('[data-zoom]');
  root.querySelector('.sight-zoom').addEventListener('click', e => {
    const btn = e.target.closest('[data-zoom]');
    if (!btn) return;
    shown = fitView({ ...shown, zoom: Number(btn.dataset.zoom) });
    for (const b of zoomButtons) b.setAttribute('aria-pressed', String(b === btn));
    viewBox.classList.toggle('sight-view--zoomed', shown.zoom > 1);
    placeBlindTag();
    redraw();
  });

  // Zoomed in, dragging moves the picture with the pointer.
  let dragFrom = null;
  view.addEventListener('pointerdown', e => {
    if (shown.zoom === 1) return;
    dragFrom = { x: e.clientX, y: e.clientY, shown };
    view.setPointerCapture(e.pointerId);
    viewBox.classList.add('sight-view--dragging');
  });
  view.addEventListener('pointermove', e => {
    if (!dragFrom) return;
    const { zoom, x, y } = dragFrom.shown;
    shown = fitView({
      zoom,
      x: x - (e.clientX - dragFrom.x) / (view.clientWidth * zoom),
      y: y - (e.clientY - dragFrom.y) / (view.clientHeight * zoom),
    });
    placeBlindTag();
    redraw();
  });
  const endDrag = () => {
    dragFrom = null;
    viewBox.classList.remove('sight-view--dragging');
  };
  view.addEventListener('pointerup', endDrag);
  view.addEventListener('pointercancel', endDrag);

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
      sharpness.hidden = !built;
      if (!built) {
        blindSpot = null;
        blindTag.hidden = madeUpTag.hidden = true;
        viewNotes.innerHTML = '';
        return;
      }
      const p = sightParams(s.settings, s.light);
      // A compound eye's finest detail comes straight from its facets; a camera eye's from its measured acuity.
      const text = sharpnessText(smallestDetail(s.settings, s.light, defaultsOf(s.exampleId)));
      for (const dd of sharpness.querySelectorAll('[data-sharpness]')) dd.textContent = text[dd.dataset.sharpness];
      blindSpot = p.blindSpot;
      placeBlindTag();
      const shift = p.color?.kind === 'shift' ? p.color.channels : 0;
      // UV or infrared reaching the eye, in a scene that has them (photos don't; underwater has no infrared).
      const photo = s.sceneId === 'own';
      const bands = !photo && (p.uv > 0 || (p.ir > 0 && s.sceneId !== 'underwater'));
      madeUpTag.hidden = !shift && !bands;
      madeUpTag.dataset.tip = shift ? MADE_UP_TIP : BANDS_TIP;
      const notes = shift ? [MADE_UP_NOTE] : [];
      if (photo && (p.uv > 0 || p.ir > 0)) notes.push(PHOTO_NOTE);
      // The noise comes from the eye's own warmth, so it shows in every scene; the blur only where there's infrared.
      if (p.ir > 0) notes.push(IR_NOISE_NOTE);
      if (p.ir > 0 && !photo && s.sceneId !== 'underwater') notes.push(IR_BLUR_NOTE);
      viewNotes.innerHTML = notes.map(t => `<span>${escapeHtml(t)}</span>`).join('');
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
