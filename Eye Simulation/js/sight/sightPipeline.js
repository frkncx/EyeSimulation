// "How it sees": turns a scene into what the current eye would deliver.
//
// Steps, in order:
//   1. blur     each scene layer by its distance: focus and pupil (defocus), eye size (detail), pupil (diffraction)
//   2. light    day to night, pupil size and the night reflector change how bright it is; night fades color
//   3. colors   1 to 3 colors simulated, 4 and 5 shown as made-up colors
//   4. glare    the night reflector scatters light
//   5. gap      the blind spot, when the retina faces away from the light
import { createCanvas, drawBlurred, supportsCanvasFilter, SRGB_TO_LINEAR, linearToSrgb } from './imageOps.js';
import { defocusBlurPx } from '../model/optics.js';
import { colorStep, shiftColors } from './colorVision.js';
import { focusDistanceM } from '../ui/settingsPanel.js';
import { PUPIL_ASPECT } from '../eye3d/cameraEye.js';
import { SCENE_W, SCENE_H } from '../scenes/scenes.js';

export const VIEW_W = 640;
export const VIEW_H = 400;
const FIELD_DEG = 60; // the view spans 60° across
const PX_PER_DEG = VIEW_W / FIELD_DEG;

/** Where the blind spot falls, as fractions of the view: 15° out from the center, a little below. */
export const BLIND_SPOT = {
  x: 0.5 + 15 / FIELD_DEG,
  y: 0.5 + 1.5 / (FIELD_DEG * VIEW_H / VIEW_W),
  rx: 2.75 / FIELD_DEG,
  ry: 3.75 / (FIELD_DEG * VIEW_H / VIEW_W),
};

const GLOW_LEVEL = 0.0008; // how bright lamps are compared with daylight
const LUMA = [0.2126, 0.7152, 0.0722];

/** Everything the renderer needs, worked out once from the settings and the Light slider. */
export function sightParams(settings, light) {
  const [ax, ay] = PUPIL_ASPECT[settings.pupilShape] ?? PUPIL_ASPECT.round;
  const pupilW = settings.pupilMm * ax;
  const pupilH = settings.pupilMm * ay;
  const tapetum = settings.tapetum === 'on';
  // Light falls 10 000 times from day to night; the eye adapts, but not all the way.
  const illum = 10 ** (-4 * (1 - light));
  const sens = ((pupilW * pupilH) / 16) ** 0.6 * (tapetum ? 1.8 : 1);
  const night = Math.min(1, Math.max(0, -Math.log10(illum * sens) / 4));
  return {
    pupilW, pupilH, tapetum, night,
    focusM: focusDistanceM(settings.focus),
    exposure: illum ** 0.22 * sens,
    glowGain: GLOW_LEVEL * illum ** -0.78 * sens,
    detailBlur: (24 / settings.eyeSizeMm) ** 2,
    blindSpot: settings.retina === 'away',
    color: colorStep(settings),
    light,
  };
}

export class SightRenderer {
  constructor() {
    this.layer = createCanvas(VIEW_W, VIEW_H);
    this.base = createCanvas(VIEW_W, VIEW_H);
    this.glow = createCanvas(VIEW_W, VIEW_H);
    this.work = createCanvas(VIEW_W, VIEW_H);
    this.squash = createCanvas(VIEW_W, VIEW_H);
  }

  render(out, scene, p) {
    const bctx = this.base.getContext('2d', { willReadFrequently: true });
    const gctx = this.glow.getContext('2d', { willReadFrequently: true });
    bctx.clearRect(0, 0, VIEW_W, VIEW_H);
    gctx.clearRect(0, 0, VIEW_W, VIEW_H);
    gctx.globalCompositeOperation = 'lighter';
    let anyGlow = false;

    for (const layer of scene.layers) {
      const [sx, sy] = blurFor(layer.distanceM, p);
      this.paint(ctx => layer.draw(ctx, p.light));
      this.blurXY(bctx, sx, sy);
      if (layer.glow) {
        this.paint(ctx => layer.glow(ctx, p.light));
        this.blurXY(gctx, sx, sy);
        anyGlow = true;
      }
    }
    gctx.globalCompositeOperation = 'source-over';

    this.light(bctx, anyGlow ? gctx : null, p);
    if (p.tapetum) this.glare(p);
    if (p.blindSpot) gap(this.work.getContext('2d'));

    const octx = out.getContext('2d');
    octx.drawImage(this.work, 0, 0, out.width, out.height);
  }

  paint(draw) {
    const ctx = this.layer.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    ctx.setTransform(VIEW_W / SCENE_W, 0, 0, VIEW_H / SCENE_H, 0, 0);
    draw(ctx);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /**
   * Blur the layer canvas by sx across and sy up-down, and draw it onto ctx.
   * Uneven blur (from a slit pupil) squeezes the picture along the blurrier side, blurs evenly, then stretches it back.
   */
  blurXY(ctx, sx, sy) {
    const src = this.layer;
    const hi = Math.max(sx, sy);
    const lo = Math.max(1, Math.min(sx, sy));
    if (hi < 0.3) {
      ctx.drawImage(src, 0, 0);
      return;
    }
    if (hi / lo < 1.15 || !supportsCanvasFilter()) {
      drawBlurred(ctx, src, hi);
      return;
    }
    const sq = this.squash;
    sq.width = Math.max(1, Math.round(VIEW_W * (sx > sy ? lo / sx : 1)));
    sq.height = Math.max(1, Math.round(VIEW_H * (sy > sx ? lo / sy : 1)));
    const qctx = sq.getContext('2d');
    qctx.imageSmoothingQuality = 'high';
    qctx.filter = `blur(${lo.toFixed(2)}px)`;
    qctx.drawImage(src, 0, 0, sq.width, sq.height);
    qctx.filter = 'none';
    ctx.drawImage(sq, 0, 0, VIEW_W, VIEW_H);
  }

  /** Brightness and colors. Works per pixel in linear light. */
  light(bctx, gctx, p) {
    const img = bctx.getImageData(0, 0, VIEW_W, VIEW_H);
    const d = img.data;
    const g = gctx?.getImageData(0, 0, VIEW_W, VIEW_H).data;
    const m = p.color?.kind === 'matrix' ? p.color.m : null;
    const shift = p.color?.kind === 'shift' ? p.color.channels : 0;
    const shifted = [0, 0, 0];
    // Rods take over in the dark: color fades.
    const desat = smoothstep(0.45, 0.95, p.night);
    for (let i = 0; i < d.length; i += 4) {
      // Pixels are read un-premultiplied, so soft blurred edges keep their color; alpha is dropped.
      let r = SRGB_TO_LINEAR[d[i]] * p.exposure;
      let gr = SRGB_TO_LINEAR[d[i + 1]] * p.exposure;
      let b = SRGB_TO_LINEAR[d[i + 2]] * p.exposure;
      if (g && g[i + 3]) {
        const a = (g[i + 3] / 255) * p.glowGain;
        r += SRGB_TO_LINEAR[g[i]] * a;
        gr += SRGB_TO_LINEAR[g[i + 1]] * a;
        b += SRGB_TO_LINEAR[g[i + 2]] * a;
      }
      if (m) {
        const r2 = m[0] * r + m[1] * gr + m[2] * b;
        const g2 = m[3] * r + m[4] * gr + m[5] * b;
        const b2 = m[6] * r + m[7] * gr + m[8] * b;
        r = r2; gr = g2; b = b2;
      } else if (shift) {
        shiftColors(r, gr, b, shift, shifted);
        [r, gr, b] = shifted;
      }
      const y = LUMA[0] * r + LUMA[1] * gr + LUMA[2] * b;
      if (desat > 0) {
        r += (y - r) * desat;
        gr += (y - gr) * desat;
        b += (y - b) * desat;
      }
      r = shoulder(r);
      gr = shoulder(gr);
      b = shoulder(b);
      d[i] = linearToSrgb(r);
      d[i + 1] = linearToSrgb(gr);
      d[i + 2] = linearToSrgb(b);
      d[i + 3] = 255;
    }
    this.work.getContext('2d').putImageData(img, 0, 0);
  }

  /** The night reflector bounces light around inside the eye: a soft haze over everything bright. */
  glare(p) {
    const ctx = this.work.getContext('2d');
    const tctx = this.squash.getContext('2d');
    this.squash.width = VIEW_W;
    this.squash.height = VIEW_H;
    drawBlurred(tctx, this.work, 10);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.25 + 0.45 * p.night;
    ctx.drawImage(this.squash, 0, 0);
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.restore();
  }
}

/** Blur in view pixels for something at `distanceM`, across and up-down (they differ for slit pupils). */
export function blurFor(distanceM, p) {
  const axis = pupilMm => {
    const defocus = Math.min(28, 0.5 * defocusBlurPx(distanceM, p.focusM, pupilMm, PX_PER_DEG));
    const diffraction = 1.2 / pupilMm;
    const night = 1.4 * p.night ** 2;
    const scatter = p.tapetum ? 0.7 : 0;
    return Math.hypot(defocus, diffraction, p.detailBlur, night, scatter);
  };
  return [axis(p.pupilW), axis(p.pupilH)];
}

/** No light sensors where the nerve leaves the eye: a gap in the picture. */
function gap(ctx) {
  const s = BLIND_SPOT;
  ctx.save();
  ctx.setTransform(s.rx * VIEW_W, 0, 0, s.ry * VIEW_H, s.x * VIEW_W, s.y * VIEW_H);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, '#1b1d22');
  g.addColorStop(0.8, '#1b1d22');
  g.addColorStop(1, 'rgba(27,29,34,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function shoulder(x) {
  if (x <= 0.8) return x < 0 ? 0 : x;
  return 0.8 + 0.2 * (1 - Math.exp(-(x - 0.8) / 0.2));
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
