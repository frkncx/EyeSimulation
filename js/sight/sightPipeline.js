// "How it sees": turns a scene into what the current eye would deliver.
//
// Steps, in order:
//   1. blur     each scene layer by its distance: focus and pupil (defocus), eye size (detail), pupil (diffraction),
//               plus the vision problems (near/farsighted shift the focus, astigmatism blurs across, amblyopia everywhere)
//   2. light    day to night, pupil size and the night reflector change how bright it is; night fades color
//   3. colors   1 to 3 colors simulated, 4 and 5 shown as made-up colors; UV and infrared, when the eye's
//               range reaches them, added in stand-in colors (infrared a little blurrier, with body-heat noise)
//   4. glare    the night reflector scatters light
//   5. gap      the blind spot, when the retina faces away from the light
import { createCanvas, drawBlurred, supportsCanvasFilter, SRGB_TO_LINEAR, linearToSrgb } from './imageOps.js';
import { defocusBlurPx, dioptersBlurPx, vergence, REFRACTION_MAX_D } from '../model/optics.js';
import { colorStep, shiftColors, ROD_WEIGHTS } from './colorVision.js';
import { bandReach, UV_FROM_NM, IR_FROM_NM } from '../model/spectrum.js';
import { focusDistanceM, rodsPerCone } from '../ui/settingsPanel.js';
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
const ASTIGMATISM_MAX_D = 3;
// How much of the light drop still shows after the eye adapts: 0 = fully adapted, 1 = not at all.
// At 0.6 a night without light sources is about 0.4% of day brightness: close to black, so only lamps stand out.
const ADAPTATION = 0.6;
const AMBLYOPIA_BLUR = 3.5; // px; the brain's lost sharpness, the same at every distance
const LUMA = [0.2126, 0.7152, 0.0722];
const MID_GREY = 118;
const HUMAN_RODS_PER_CONE = 20;
const CONE_BLUR = 1.6; // px of daytime blur for every 10× fewer cones than a human
const DAZZLE = 0.45; // how washed out a very rod-heavy eye looks in daylight
const GRAIN_LEVEL = 0.006; // grain strength at daylight with a 4 mm pupil
const GRAIN_MAX = 0.3;
const GRAIN_PX = 50; // grain strength in screen levels (0..255) at full grain on a white pixel
// UV and infrared (all simplified). UV counts once the range goes below 400 nm, fully at 320 nm;
// infrared once it goes past 720 nm, fully at 790 nm.
const UV_COLOR = [0.45, 0.05, 1]; // stand-in colors, in linear light: UV violet, infrared red-orange
const IR_COLOR = [1, 0.22, 0.08];
const greyOf = c => { const y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; return [y, y, y]; };
const UV_GREY = greyOf(UV_COLOR);
const IR_GREY = greyOf(IR_COLOR);
const UV_STRENGTH = 1.1;
const IR_STRENGTH = 0.5;
const IR_BLUR = 2.4; // px of extra blur on infrared at full reach, with a 4 mm pupil
const IR_NOISE_PX = 5; // body-heat noise in screen levels, soft and low-contrast
const COLD_BLOODED_NOISE = 0.35;

// One fixed grain pattern, so the picture doesn't flicker between redraws.
const NOISE = (() => {
  const n = new Float32Array(VIEW_W * VIEW_H);
  let seed = 12345;
  const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  for (let i = 0; i < n.length; i++) n[i] = (rand() + rand() + rand() - 1.5) * 2;
  return n;
})();

/** Everything the renderer needs, worked out once from the settings and the Light slider. */
export function sightParams(settings, light) {
  const [ax, ay] = PUPIL_ASPECT[settings.pupilShape] ?? PUPIL_ASPECT.round;
  const pupilW = settings.pupilMm * ax;
  const pupilH = settings.pupilMm * ay;
  const tapetum = settings.tapetum === 'on';
  // Light falls 10 000 times from day to night; the eye adapts, but not all the way.
  const illum = 10 ** (-4 * (1 - light));
  const nightFor = s => Math.min(1, Math.max(0, -Math.log10(illum * s) / 4));
  const pupilSens = ((pupilW * pupilH) / 16) ** 0.6 * (tapetum ? 1.8 : 1);
  // Rods and cones (eyes without them keep the plain model). Rods add sensitivity once the light is dim;
  // an eye with fewer cones than a human's is less sharp and less colorful in daylight, and a very
  // rod-heavy one is dazzled by bright light. All simplified.
  const ratio = settings.rods == null ? null : rodsPerCone(settings.rods);
  const rodGain = ratio ? (ratio / HUMAN_RODS_PER_CONE) ** 0.3 : 1;
  const coneLack = ratio ? Math.max(0, Math.log10(ratio / HUMAN_RODS_PER_CONE)) : 0;
  const dim = smoothstep(0.25, 0.7, nightFor(pupilSens));
  const day = 1 - smoothstep(0.1, 0.4, nightFor(pupilSens));
  const sens = pupilSens * (1 + (rodGain - 1) * dim);
  const night = nightFor(sens);
  // Photons from each point of the scene grow with the pupil's area in mm² (not its f-number): few photons, more grain.
  const photons = illum * ((pupilW * pupilH) / 16) * (tapetum ? 1.8 : 1) * (1 + (rodGain - 1) * dim);
  const grain = Math.min(GRAIN_MAX, GRAIN_LEVEL / Math.sqrt(photons));
  // Nearsighted (refraction < 0): the eye is too strong and can't relax enough for far things.
  // Farsighted (> 0): it is too weak, so it can't strain enough for near things.
  const focusD = vergence(focusDistanceM(settings.focus));
  const errorD = (settings.refraction ?? 0) * REFRACTION_MAX_D;
  const eyeFocusD = Math.max(0, focusD - errorD);
  const amblyopia = settings.amblyopia === 'on' ? settings.amblyopiaStrength : 0;
  const reach = bandReach(settings);
  const uv = reach.uv ? smoothstep(UV_FROM_NM, 320, reach.lo) : 0;
  const ir = reach.ir ? smoothstep(IR_FROM_NM, 790, reach.hi) : 0;
  return {
    pupilW, pupilH, tapetum, night,
    focusM: eyeFocusD < 0.05 ? Infinity : 1 / eyeFocusD,
    // An oval cornea focuses one direction (across) more strongly than the other.
    cylinderD: settings.astigmatism === 'on' ? ASTIGMATISM_MAX_D * (0.15 + 0.85 * settings.astigmatismStrength) : 0,
    amblyopiaBlur: AMBLYOPIA_BLUR * amblyopia,
    contrast: 1 - 0.45 * amblyopia,
    exposure: illum ** ADAPTATION * sens,
    glowGain: GLOW_LEVEL * illum ** -0.78 * sens,
    detailBlur: (24 / settings.eyeSizeMm) ** 2,
    rodBlur: ratio ? (ratio / HUMAN_RODS_PER_CONE) ** 0.25 : 1,
    coneBlur: CONE_BLUR * coneLack * day,
    coneFade: Math.min(0.5, 0.5 * coneLack) * day,
    dazzle: ratio ? DAZZLE * smoothstep(1.6, 2.4, Math.log10(ratio)) * day : 0,
    purkinje: ratio != null,
    // Color comes from the cones alone, so it fades with the light the cones get, not the rods.
    // An eye with few cones loses color sooner.
    coneNight: nightFor(pupilSens) + 0.2 * coneLack,
    grain: grain < 0.01 ? 0 : grain,
    tube: settings.eyeShape === 'tube',
    blindSpot: settings.retina === 'away',
    uv,
    ir,
    oneSensor: settings.peaks?.length === 1,
    // Longer light spreads more through the same pupil, so infrared blurs more; a bigger pupil helps.
    irBlur: IR_BLUR * ir * Math.sqrt(4 / Math.max(0.5, Math.min(pupilW, pupilH))),
    // A warm body glows in infrared too, and sets off red-tuned sensors by mistake.
    irNoise: ir * (settings.coldBlooded ? COLD_BLOODED_NOISE : 1),
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
    this.uv = createCanvas(VIEW_W, VIEW_H);
    this.ir = createCanvas(VIEW_W, VIEW_H);
    this.bands = new WeakMap(); // scene → each layer's UV and infrared pictures, made once
  }

  render(out, scene, p) {
    const bctx = this.base.getContext('2d', { willReadFrequently: true });
    const gctx = this.glow.getContext('2d', { willReadFrequently: true });
    bctx.clearRect(0, 0, VIEW_W, VIEW_H);
    gctx.clearRect(0, 0, VIEW_W, VIEW_H);
    gctx.globalCompositeOperation = 'lighter';
    let anyGlow = false;
    // UV and infrared only cost anything when the eye reaches them and the scene has them.
    const useUv = p.uv > 0;
    const useIr = p.ir > 0 && !scene.noIr;
    const bands = (useUv || useIr) && !scene.photo ? this.bandsFor(scene) : null;
    const uctx = bands && useUv ? this.uv.getContext('2d', { willReadFrequently: true }) : null;
    const ictx = bands && useIr ? this.ir.getContext('2d', { willReadFrequently: true }) : null;
    uctx?.clearRect(0, 0, VIEW_W, VIEW_H);
    ictx?.clearRect(0, 0, VIEW_W, VIEW_H);

    scene.layers.forEach((layer, k) => {
      const [sx, sy] = blurFor(layer.distanceM, p);
      this.paint(ctx => layer.draw(ctx, p.light));
      this.blurXY(bctx, sx, sy);
      if (layer.glow) {
        this.paint(ctx => layer.glow(ctx, p.light));
        this.blurXY(gctx, sx, sy);
        anyGlow = true;
      }
      if (uctx) this.blurXY(uctx, sx, sy, bands[k].uv);
      if (ictx) this.blurXY(ictx, Math.hypot(sx, p.irBlur), Math.hypot(sy, p.irBlur), bands[k].ir);
    });
    gctx.globalCompositeOperation = 'source-over';

    this.light(bctx, anyGlow ? gctx : null, p, {
      uv: uctx?.getImageData(0, 0, VIEW_W, VIEW_H).data,
      ir: ictx?.getImageData(0, 0, VIEW_W, VIEW_H).data,
      uvGain: p.uv * UV_STRENGTH * (scene.uvLevel ?? 1),
      irGain: p.ir * IR_STRENGTH,
    });
    if (p.tapetum) this.glare(0.25 + 0.45 * p.night);
    // Rods are overwhelmed by bright light: a very rod-heavy eye is dazzled.
    if (p.dazzle) this.glare(p.dazzle);
    if (p.tube) this.tubeEdges();
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
   * Each layer of the scene as it would look in UV and in near-infrared, in grey (white = reflects a lot).
   * A rough base comes from the layer's colors (simplified): in infrared, leaves and grass are bright,
   * sky and water dark, everything else about as bright as it looks; in UV most things are dark and
   * the sky a little bright. The layer's own `uv` paints its hand-made patterns on top.
   */
  bandsFor(scene) {
    let bands = this.bands.get(scene);
    if (bands) return bands;
    bands = scene.layers.map(layer => {
      this.paint(ctx => layer.draw(ctx, 1));
      const src = this.layer.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, VIEW_W, VIEW_H);
      const uv = new ImageData(VIEW_W, VIEW_H);
      const ir = new ImageData(VIEW_W, VIEW_H);
      const d = src.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const lum = 0.3 * r + 0.59 * g + 0.11 * b;
        const leafy = Math.max(0, g - Math.max(r, b));
        const bluish = Math.max(0, b - 0.9 * Math.max(r, g));
        const u = Math.min(255, 0.15 * lum + 0.8 * bluish);
        const n = Math.min(255, Math.max(0, 0.55 * lum + 3.5 * leafy - 1.2 * bluish));
        uv.data[i] = uv.data[i + 1] = uv.data[i + 2] = u;
        ir.data[i] = ir.data[i + 1] = ir.data[i + 2] = n;
        uv.data[i + 3] = ir.data[i + 3] = d[i + 3];
      }
      const uvCanvas = createCanvas(VIEW_W, VIEW_H);
      const irCanvas = createCanvas(VIEW_W, VIEW_H);
      uvCanvas.getContext('2d').putImageData(uv, 0, 0);
      irCanvas.getContext('2d').putImageData(ir, 0, 0);
      if (layer.uv) {
        const ctx = uvCanvas.getContext('2d');
        ctx.setTransform(VIEW_W / SCENE_W, 0, 0, VIEW_H / SCENE_H, 0, 0);
        layer.uv(ctx);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      return { uv: uvCanvas, ir: irCanvas };
    });
    this.bands.set(scene, bands);
    return bands;
  }

  /**
   * Blur a canvas (the layer canvas unless `src` is given) by sx across and sy up-down, and draw it onto ctx.
   * Uneven blur (from a slit pupil) squeezes the picture along the blurrier side, blurs evenly, then stretches it back.
   */
  blurXY(ctx, sx, sy, src = this.layer) {
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

  /** Brightness and colors, plus UV and infrared in their stand-in colors. Works per pixel in linear light. */
  light(bctx, gctx, p, { uv, ir, uvGain, irGain }) {
    const img = bctx.getImageData(0, 0, VIEW_W, VIEW_H);
    const d = img.data;
    const g = gctx?.getImageData(0, 0, VIEW_W, VIEW_H).data;
    const uvK = uvGain * p.exposure / 255;
    const irK = irGain * p.exposure / 255;
    const heat = p.irNoise * IR_NOISE_PX;
    const m = p.color?.kind === 'matrix' ? p.color.m : null;
    const shift = p.color?.kind === 'shift' ? p.color.channels : 0;
    const shifted = [0, 0, 0];
    // Rods take over in the dark: color fades, whatever the color sensors are. Rods see blue-green best,
    // so reds go dark first. A cone-poor eye is also paler in daylight.
    const desat = smoothstep(0.45, 0.95, p.purkinje ? p.coneNight : p.night);
    const fade = 1 - (1 - desat) * (1 - p.coneFade);
    const [wr, wg, wb] = p.purkinje ? ROD_WEIGHTS : LUMA;
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
      const u = uv ? uv[i] * (uv[i + 3] / 255) * uvK : 0;
      const n = ir ? ir[i] * (ir[i + 3] / 255) * irK : 0;
      const rod = p.purkinje ? wr * (r + u + n) + wg * (gr + u + n) + wb * (b + u + n) : 0;
      if (m) {
        const r2 = m[0] * r + m[1] * gr + m[2] * b;
        const g2 = m[3] * r + m[4] * gr + m[5] * b;
        const b2 = m[6] * r + m[7] * gr + m[8] * b;
        r = r2; gr = g2; b = b2;
      } else if (shift) {
        shiftColors(r, gr, b, shift, shifted);
        [r, gr, b] = shifted;
      }
      // UV and infrared go on after the color step, in their stand-in colors (grey for an eye with one sensor).
      if (u || n) {
        const [ur, ug, ub] = p.oneSensor ? UV_GREY : UV_COLOR;
        const [nr, ng, nb] = p.oneSensor ? IR_GREY : IR_COLOR;
        r += ur * u + nr * n;
        gr += ug * u + ng * n;
        b += ub * u + nb * n;
      }
      const y = LUMA[0] * r + LUMA[1] * gr + LUMA[2] * b;
      if (fade > 0) {
        // In daylight the grey is the cones' own brightness; in the dark it is what the rods see.
        const grey = y + (rod - y) * (p.purkinje ? desat : 0);
        r += (grey - r) * fade;
        gr += (grey - gr) * fade;
        b += (grey - b) * fade;
      }
      if (p.dazzle) {
        r += (1 - r) * p.dazzle * Math.min(1, r * 2);
        gr += (1 - gr) * p.dazzle * Math.min(1, gr * 2);
        b += (1 - b) * p.dazzle * Math.min(1, b * 2);
      }
      r = shoulder(r);
      gr = shoulder(gr);
      b = shoulder(b);
      // Amblyopia: the brain turns this eye's contrast down, toward a middle grey.
      const sr = MID_GREY + (linearToSrgb(r) - MID_GREY) * p.contrast;
      const sg = MID_GREY + (linearToSrgb(gr) - MID_GREY) * p.contrast;
      const sb = MID_GREY + (linearToSrgb(b) - MID_GREY) * p.contrast;
      // Photon grain grows with the light that is there: lit things sparkle, black stays black.
      let noise = p.grain ? NOISE[i >> 2] * p.grain * GRAIN_PX * Math.sqrt(Math.max(0, sr + sg + sb) / 765) : 0;
      // Body-heat noise shows even on black: soft, in 2×2 blobs, from another part of the fixed pattern.
      if (heat) {
        const px = i >> 2;
        const x = px % VIEW_W;
        const y = (px - x) / VIEW_W;
        noise += NOISE[((y >> 1) * VIEW_W + (x >> 1) + 7919) % NOISE.length] * heat;
      }
      d[i] = sr + noise;
      d[i + 1] = sg + noise;
      d[i + 2] = sb + noise;
      d[i + 3] = 255;
    }
    this.work.getContext('2d').putImageData(img, 0, 0);
  }

  /** A soft haze over everything bright, `alpha` strong (the night reflector bouncing light around, or dazzle). */
  glare(alpha) {
    const ctx = this.work.getContext('2d');
    const tctx = this.squash.getContext('2d');
    this.squash.width = VIEW_W;
    this.squash.height = VIEW_H;
    drawBlurred(tctx, this.work, 10);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = alpha;
    ctx.drawImage(this.squash, 0, 0);
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.restore();
  }

  /** A tube eye sees a narrower view: the edges go soft, then dark. */
  tubeEdges() {
    const ctx = this.work.getContext('2d');
    const tctx = this.squash.getContext('2d');
    this.squash.width = VIEW_W;
    this.squash.height = VIEW_H;
    drawBlurred(tctx, this.work, 6);
    // Keep only the blurred edges: fade the blurred copy out toward the middle.
    const ring = (c, inner, outer, stops) => {
      const g = c.createRadialGradient(0, 0, inner, 0, 0, outer);
      for (const [at, color] of stops) g.addColorStop(at, color);
      return g;
    };
    const oval = (c, fill) => {
      c.save();
      c.setTransform(VIEW_W / 2, 0, 0, VIEW_H / 2, VIEW_W / 2, VIEW_H / 2);
      c.fillStyle = fill;
      c.fillRect(-1, -1, 2, 2);
      c.restore();
    };
    tctx.globalCompositeOperation = 'destination-in';
    oval(tctx, ring(tctx, 0.55, 0.85, [[0, 'rgba(0,0,0,0)'], [1, '#000']]));
    tctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.squash, 0, 0);
    oval(ctx, ring(ctx, 0.72, 1.12, [[0, 'rgba(4,4,6,0)'], [0.6, 'rgba(4,4,6,0.85)'], [1, '#040406']]));
  }
}

/** Blur in view pixels for something at `distanceM`, across and up-down (they differ for slit pupils). */
export function blurFor(distanceM, p) {
  const axis = (pupilMm, cylinderD) => {
    const defocus = Math.min(28, 0.5 * defocusBlurPx(distanceM, p.focusM, pupilMm, PX_PER_DEG));
    const astigmatism = Math.min(28, 0.5 * dioptersBlurPx(cylinderD, pupilMm, PX_PER_DEG));
    const diffraction = 1.2 / pupilMm;
    // In the dark, rods pool their signals: more rods, blurrier.
    const night = 1.4 * p.night ** 2 * p.rodBlur;
    const scatter = p.tapetum ? 0.7 : 0;
    return Math.hypot(defocus, astigmatism, diffraction, p.detailBlur, night, scatter, p.amblyopiaBlur, p.coneBlur);
  };
  return [axis(p.pupilW, p.cylinderD), axis(p.pupilH, 0)];
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
