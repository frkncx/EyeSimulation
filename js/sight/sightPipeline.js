// "How it sees": turns a scene into what the current eye would deliver.
//
// Steps, in order:
//   1. blur     each scene layer by its distance: focus and pupil (defocus), eye size (detail), pupil (diffraction),
//               plus the vision problems (near/farsighted shift the focus, astigmatism blurs along its axis's right angle, amblyopia everywhere)
//   2. light    day to night, pupil size and the night reflector change how bright it is; night fades color
//   3. colors   1 to 3 colors simulated, 4 and 5 shown as made-up colors; UV and infrared, when the eye's
//               range reaches them, added in stand-in colors (infrared a little blurrier, with body-heat noise)
//   4. glare    the night reflector scatters light
//   5. gap      the blind spot, when the retina faces away from the light
// A compound eye blurs by its facets' acceptance angle instead (the same at every distance), skips the pupil,
// glare and blind spot, and ends with a mosaic: one dot per facet.
import { createCanvas, drawBlurred, supportsCanvasFilter, SRGB_TO_LINEAR, linearToSrgb } from './imageOps.js';
import { dioptersGapArcmin, vergence, REFRACTION_MAX_D, facetAngle, facetAcceptance } from '../model/optics.js';
import { colorStep, shiftColors, ROD_WEIGHTS } from './colorVision.js';
import { bandReach, UV_FROM_NM, IR_FROM_NM } from '../model/spectrum.js';
import { focusDistanceM, rodsPerCone } from '../ui/settingsPanel.js';
import { pupilSizeMm } from '../eye3d/cameraEye.js';
import { MEASURED, TUNING } from '../model/constants.js';
import { SCENE_W, SCENE_H } from '../scenes/scenes.js';

// Every number below is in js/model/constants.js, with what it does and where it comes from.
const { AMBLYOPIA_BANDS, HUMAN_CPD, CHART_M, DIFFRACTION_ARCMIN_MM, SUPERPOSITION_GAIN, WATER_INDEX } = MEASURED;
const {
  FIELD_DEG, LIGHT_DECADES, REF_PUPIL_MM, SENS_POWER, TAPETUM_GAIN, ADAPTATION, GLOW_LEVEL, GLOW_POWER, SHOULDER,
  HUMAN_RODS_PER_CONE, ROD_TAKEOVER, CONE_DAY, ROD_GAIN_POWER, ROD_BLUR_POWER, CONE_FADE_PER_DECADE,
  CONE_NIGHT_PER_DECADE, DAZZLE, DAZZLE_RODS_LOG10, SIGMA_PER_GAP, NIGHT_BLUR_OLD_PX, TAPETUM_SCATTER_OLD_PX,
  AMBLYOPIA_CONTRAST, MID_GREY, GRAIN_LEVEL, GRAIN_MIN, GRAIN_PX, GLARE_BLUR_OLD_PX, TAPETUM_GLARE, GLARE_VEIL,
  TUBE_EDGE_BLUR_OLD_PX, TUBE_EDGE, HUMAN_BLIND_SPOT, UV_FULL_NM, IR_FULL_NM, UV_COLOR, IR_COLOR, UV_STRENGTH,
  IR_STRENGTH, IR_BLUR_OLD_PX, IR_BLUR_MIN_PUPIL_MM, IR_NOISE_PX, COLD_BLOODED_NOISE, UV_BASE, IR_BASE, BLUISH_OVER,
  MOSAIC_EDGE_OLD_PX, MOSAIC_EDGE_ALPHA, COLOR_FADE, FAR_FOCUS_D, DEFOCUS_DISPLAY_GAIN,
} = TUNING;

// The view's shape, and the size the canvas starts at. It is drawn at whatever size it is shown, with every
// blur worked out in angles and turned into pixels for that size and zoom.
export const VIEW_W = 640;
export const VIEW_H = 400;
// Sizes tuned by eye on the old 640-pixel view (glare, haze, night blur…) are kept as the angles they covered there.
const REF_ARCMIN_PER_PX = 60 * FIELD_DEG / VIEW_W; // 5.625

const FIELD_H_DEG = FIELD_DEG * VIEW_H / VIEW_W;

/**
 * The blind spot as fractions of the view at 1× zoom: center x, y and radii rx, ry. With both eyes (`both`, the
 * animal's binocular field), the other eye also sees everything up to half their shared field past straight
 * ahead, toward this eye's side (the view's middle looks `lookDeg` that way); only the part of the spot beyond
 * that stays blind, from `from` on. Null when the other eye sees all of it.
 */
const blindSpotFor = ({ outDeg, downDeg, wDeg, hDeg } = HUMAN_BLIND_SPOT, both) => {
  const s = {
    x: 0.5 + outDeg / FIELD_DEG,
    y: 0.5 + downDeg / FIELD_H_DEG,
    rx: wDeg / 2 / FIELD_DEG,
    ry: hDeg / 2 / FIELD_H_DEG,
  };
  if (!both) return s;
  const from = 0.5 + (both.widthDeg / 2 - both.lookDeg) / FIELD_DEG;
  if (from >= s.x + s.rx) return null;
  return from > s.x - s.rx ? { ...s, from } : s;
};

/**
 * The part of the eye's 60° view that is shown: zoomed in `zoom` times on the point x, y (fractions of the whole
 * view; 0.5, 0.5 is its middle). Dragging moves x and y; they stay where the shown part fits inside the view.
 */
export const FULL_VIEW = { zoom: 1, x: 0.5, y: 0.5 };

export function fitView({ zoom, x, y }) {
  const half = 0.5 / zoom;
  return { zoom, x: Math.min(1 - half, Math.max(half, x)), y: Math.min(1 - half, Math.max(half, y)) };
}

/** A point of the whole view (fractions) as fractions of the shown part. */
const shownAt = (v, fx, fy) => [0.5 + (fx - v.x) * v.zoom, 0.5 + (fy - v.y) * v.zoom];

/**
 * The blind spot as fractions of the shown part, or null when it is out of sight. It belongs to the eye's view,
 * so it moves with the picture when zoomed in and dragged.
 */
export function blindSpotInView(s, v = FULL_VIEW) {
  if (!s) return null;
  const [x, y] = shownAt(v, s.x, s.y);
  const z = { x, y, rx: s.rx * v.zoom, ry: s.ry * v.zoom };
  if (s.from != null) z.from = shownAt(v, s.from, 0)[0];
  return z.x + z.rx < 0 || z.x - z.rx > 1 || z.y + z.ry < 0 || z.y - z.ry > 1 ? null : z;
}

const LUMA = [0.2126, 0.7152, 0.0722];
// Sharpness. Each eye's finest detail comes from its measured acuity in cycles per degree (`acuityCpd` in its
// defaults); HUMAN_CPD is the 20/20 standard. It scales with eye size (a bigger image over the same
// sensors) and coarsens as rods crowd out cones. The view draws all blur at true size; zooming in shows the
// finer differences.
// UV and infrared (all simplified). UV counts once the range goes below 400 nm, fully at UV_FULL_NM;
// infrared once it goes past 720 nm, fully at IR_FULL_NM.
const greyOf = c => { const y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; return [y, y, y]; };
const UV_GREY = greyOf(UV_COLOR);
const IR_GREY = greyOf(IR_COLOR);
const IR_BLUR = IR_BLUR_OLD_PX * REF_ARCMIN_PER_PX; // arcmin of extra blur on infrared at full reach, with a 4 mm pupil

const GLARE_BLUR = GLARE_BLUR_OLD_PX * REF_ARCMIN_PER_PX; // arcmin: how far the glare haze spreads
const TUBE_EDGE_BLUR = TUBE_EDGE_BLUR_OLD_PX * REF_ARCMIN_PER_PX; // arcmin: how soft a tube eye's far corners go
const TAPETUM_SCATTER = TAPETUM_SCATTER_OLD_PX * REF_ARCMIN_PER_PX; // arcmin: a night reflector's sideways scatter

// One fixed grain pattern per view size (one value per pixel), so the picture doesn't flicker between redraws.
let noise = new Float32Array(0);
function noiseFor(count) {
  if (noise.length === count) return noise;
  noise = new Float32Array(count);
  let seed = 12345;
  const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  for (let i = 0; i < noise.length; i++) noise[i] = (rand() + rand() + rand() - 1.5) * 2;
  return noise;
}

/** Everything the renderer needs, worked out once from the settings, the Light slider and whether the scene is underwater. */
export function sightParams(settings, light, inWater = false, nearM) {
  if (settings.facets != null) return compoundParams(settings, light);
  const tapetum = settings.tapetum === 'on';
  const tapetumGain = tapetum ? TAPETUM_GAIN : 1;
  // Light falls 10 000 times from day to night; the eye adapts, but not all the way.
  const illum = 10 ** (-LIGHT_DECADES * (1 - light));
  // The pupil at this light, the same one the 3D model draws.
  const { w: pupilW, h: pupilH, area, maxArea } = pupilSizeMm(settings, light);
  const pupilScale = Math.sqrt(area / maxArea);
  const nightFor = s => Math.min(1, Math.max(0, -Math.log10(illum * s) / LIGHT_DECADES));
  // In daylight the retina is adapted to the light the example's own daylight pupil (`adaptedPupilMm`, its
  // default) and night reflector let in, so at its defaults every eye's daylight view is normally exposed.
  // A pupil set wider than that is brighter and glarier, like after dilating eye drops; narrower is dimmer.
  // As the light falls the adaptation fades, and the widest pupil, rods and reflector set the brightness.
  const daySensAt = pupilMm => {
    const d = pupilSizeMm({ ...settings, pupilMm }, 1);
    return ((d.w * d.h) / REF_PUPIL_MM ** 2) ** SENS_POWER * tapetumGain;
  };
  const adaptedSens = daySensAt(settings.adaptedPupilMm ?? settings.pupilMm);
  const ownPupil = pupilSizeMm({ ...settings, pupilMm: settings.adaptedPupilMm ?? settings.pupilMm }, 1);
  const adapting = light ** TUNING.DAY_ADAPTATION_POWER;
  const pupilSens = ((pupilW * pupilH) / REF_PUPIL_MM ** 2) ** SENS_POWER * tapetumGain * adaptedSens ** -adapting;
  const dilated = Math.max(0, Math.log2(daySensAt(settings.pupilMm) / adaptedSens));
  // Rods and cones (eyes without them keep the plain model). Rods add sensitivity once the light is dim;
  // an eye with fewer cones than a human's is less sharp and less colorful in daylight, and a very
  // rod-heavy one is dazzled by bright light. All simplified.
  const ratio = settings.rods == null ? null : rodsPerCone(settings.rods);
  const rodGain = ratio ? (ratio / HUMAN_RODS_PER_CONE) ** ROD_GAIN_POWER : 1;
  const coneLack = ratio ? Math.max(0, Math.log10(ratio / HUMAN_RODS_PER_CONE)) : 0;
  const dim = smoothstep(...ROD_TAKEOVER, nightFor(pupilSens));
  const day = 1 - smoothstep(...CONE_DAY, nightFor(pupilSens));
  const sens = pupilSens * (1 + (rodGain - 1) * dim);
  const night = nightFor(sens);
  // Finest detail in arcminutes. Cones are spaced further apart as rods take their place: spacing grows with the
  // square root of the share of sensors that aren't cones (daylight only; at night the rods take over).
  const cpd = (settings.acuityCpd ?? HUMAN_CPD) * settings.eyeSizeMm / (settings.acuityEyeMm ?? settings.eyeSizeMm);
  const coneSpacing = ratio && settings.acuityRods != null
    ? Math.sqrt((1 + ratio) / (1 + rodsPerCone(settings.acuityRods))) : 1;
  const fineArcmin = (HUMAN_CPD / cpd) * (1 + (coneSpacing - 1) * day);
  // Photons from each point of the scene grow with the pupil's area in mm² (not its f-number): few photons, more grain.
  const photons = illum * ((pupilW * pupilH) / REF_PUPIL_MM ** 2) * tapetumGain * (1 + (rodGain - 1) * dim);
  const grain = GRAIN_LEVEL / Math.sqrt(photons);
  // The Focus slider is where the eye looks; it focuses there as well as it can (as the Sharpness readout does).
  // Nearsighted (refraction < 0): the eye is too strong and can't relax past its far point (25 cm at −4 D), so
  // things farther than that blur, the farthest most. Farsighted (> 0): it is too weak, so it strains even for far
  // things, and runs out of strain sooner for near ones (10 cm at full strain with no error).
  const lookD = vergence(focusDistanceM(settings.focus, nearM));
  const errorD = (settings.refraction ?? 0) * REFRACTION_MAX_D;
  const eyeFocusD = Math.min(Math.max(lookD, -errorD, 0), vergence(focusDistanceM(0)) - errorD);
  // Underwater the cornea loses nearly all its power (eyes with a curved cornea in air only; a whale's or an
  // octopus's round lens does its focusing, so they set none). The eye is left far too weak by this much.
  const waterD = inWater && settings.corneaRadiusMm ? (WATER_INDEX - 1) / (settings.corneaRadiusMm / 1000) : 0;
  // Amblyopia is in one eye: with both eyes open, the brain relies on the other, healthy one.
  const amblyopic = settings.amblyopia === 'on' && settings.eyes !== 'both';
  const amblyopia = amblyopic ? settings.amblyopiaStrength : 0;
  const reach = bandReach(settings);
  const uv = reach.uv ? smoothstep(UV_FROM_NM, UV_FULL_NM, reach.lo) : 0;
  const ir = reach.ir ? smoothstep(IR_FROM_NM, IR_FULL_NM, reach.hi) : 0;
  return {
    pupilW, pupilH, pupilScale, tapetum, night,
    // The example's own daylight pupil, which its measured acuity was found with.
    ownPupilW: ownPupil.w, ownPupilH: ownPupil.h,
    // Whether the eye its acuity was measured on had a night reflector.
    ownTapetum: settings.acuityTapetum == null ? undefined : settings.acuityTapetum === 'on',
    focusM: eyeFocusD < FAR_FOCUS_D ? Infinity : 1 / eyeFocusD,
    waterD,
    // An oval cornea focuses its steep direction, at a right angle to the prescription axis, more strongly.
    // The axis is measured as seen facing the eye, and the view looks out of it (mirrored), so in view
    // coordinates (y down) the blur runs along (sin axis, -cos axis): axis 180 blurs up-down, 90 sideways.
    cylinderD: settings.astigmatism === 'on' ? settings.cylinderD : 0,
    cylinderDir: settings.astigmatism === 'on'
      ? [Math.sin(settings.axisDeg * Math.PI / 180), -Math.cos(settings.axisDeg * Math.PI / 180)] : [1, 0],
    // The brain's lost sharpness, the same at every distance: the eye's finest gap times this.
    amblyopiaFactor: amblyopic ? 10 ** amblyopiaLogMar(amblyopia) : 1,
    contrast: 1 - AMBLYOPIA_CONTRAST * amblyopia,
    exposure: illum ** ADAPTATION * sens,
    glowGain: GLOW_LEVEL * illum ** -GLOW_POWER * sens,
    fineArcmin,
    // The same at the animal's measured eye size.
    ownFineArcmin: fineArcmin * settings.eyeSizeMm / (settings.acuityEyeMm ?? settings.eyeSizeMm),
    acuityArcmin: HUMAN_CPD / (settings.acuityCpd ?? HUMAN_CPD),
    rodBlur: ratio ? (ratio / HUMAN_RODS_PER_CONE) ** ROD_BLUR_POWER : 1,
    // 1 = no color left at all, as with no cones.
    coneFade: Math.min(1, CONE_FADE_PER_DECADE * coneLack) * day,
    dazzle: ratio ? DAZZLE * smoothstep(...DAZZLE_RODS_LOG10, Math.log10(ratio)) * day : 0,
    // A haze's opacity can't pass 1.
    dilationGlare: Math.min(1, TUNING.DILATION_GLARE * dilated * adapting),
    purkinje: ratio != null,
    // Color comes from the cones alone, so it fades with the light the cones get, not the rods.
    // An eye with few cones loses color sooner.
    coneNight: nightFor(pupilSens) + CONE_NIGHT_PER_DECADE * coneLack,
    grain: grain < GRAIN_MIN ? 0 : grain,
    tube: settings.eyeShape === 'tube',
    blindSpot: settings.retina === 'away'
      ? blindSpotFor(settings.blindSpot, settings.eyes === 'both' ? settings.binocular : null) : null,
    uv,
    ir,
    oneSensor: settings.peaks?.length === 1,
    // Longer light spreads more through the same pupil, so infrared blurs more; a bigger pupil helps.
    irBlur: IR_BLUR * ir * Math.sqrt(REF_PUPIL_MM / Math.max(IR_BLUR_MIN_PUPIL_MM, Math.min(pupilW, pupilH))),
    // A warm body glows in infrared too, and sets off red-tuned sensors by mistake.
    irNoise: ir * (settings.coldBlooded ? COLD_BLOODED_NOISE : 1),
    color: colorStep(settings),
    light,
  };
}

const DEG = 180 / Math.PI;
const FWHM_TO_SIGMA = 1 / 2.355; // a gaussian blur's standard deviation from its width at half height

/**
 * A compound eye: no pupil and no focusing (everything is in focus), so the light it gets is fixed
 * (simplified: about what a human eye gets in daylight, without a pupil to open at night).
 * Each facet averages the light over its acceptance angle into one dot; dots sit one facet angle apart.
 * A superposition eye's pigment pulls back as the light falls, so hundreds of facets pool their light onto each
 * sensor: it opens on a log scale across the Light slider, like a pupil, to its full gain at night. In daylight
 * it gathers what an apposition eye does, so every eye is normally exposed there. Its blur stays the
 * apposition facets' (simplified).
 */
function compoundParams(settings, light) {
  const illum = 10 ** (-LIGHT_DECADES * (1 - light));
  const gain = settings.compoundKind === 'superposition' ? SUPERPOSITION_GAIN ** (1 - light) : 1;
  // Brightness grows a little slower than the light gathered, as with a pupil.
  const sens = gain ** SENS_POWER;
  const nightFor = s => Math.min(1, Math.max(0, -Math.log10(illum * s) / LIGHT_DECADES));
  const night = nightFor(sens);
  const spacingDeg = facetAngle(settings.facets) * DEG;
  const acceptDeg = facetAcceptance(settings.facets, settings.facetEyeMm) * DEG;
  const grain = GRAIN_LEVEL / Math.sqrt(illum * gain);
  const reach = bandReach(settings);
  const uv = reach.uv ? smoothstep(UV_FROM_NM, UV_FULL_NM, reach.lo) : 0;
  const ir = reach.ir ? smoothstep(IR_FROM_NM, IR_FULL_NM, reach.hi) : 0;
  return {
    compound: { spacingDeg, blurArcmin: acceptDeg * 60 * FWHM_TO_SIGMA },
    // The finest gap it makes out: one facet apart, or wider when each facet's view is blurrier than that.
    detailArcmin: Math.max(spacingDeg, acceptDeg) * 60,
    pupilW: REF_PUPIL_MM, pupilH: REF_PUPIL_MM, pupilScale: 1, tapetum: false, night,
    focusM: Infinity, cylinderD: 0, cylinderDir: [1, 0], amblyopiaFactor: 1, contrast: 1,
    exposure: illum ** ADAPTATION * sens,
    glowGain: GLOW_LEVEL * illum ** -GLOW_POWER * sens,
    fineArcmin: 0, rodBlur: 1, coneFade: 0, dazzle: 0, purkinje: false, coneNight: night,
    grain: grain < GRAIN_MIN ? 0 : grain,
    tube: false, blindSpot: null,
    uv, ir,
    oneSensor: settings.peaks?.length === 1,
    irBlur: IR_BLUR * ir,
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
    this.turned = createCanvas(VIEW_W, VIEW_H); // the picture turned for slanted blur
    this.uv = createCanvas(VIEW_W, VIEW_H);
    this.ir = createCanvas(VIEW_W, VIEW_H);
    this.bands = new WeakMap(); // scene → each layer's UV and infrared pictures, made once per size and shown part
    this.w = VIEW_W;
    this.h = VIEW_H;
    this.view = FULL_VIEW;
  }

  /** Match the working canvases to the output's size. */
  resize(w, h) {
    if (w === this.w && h === this.h) return;
    for (const c of [this.layer, this.base, this.glow, this.work, this.uv, this.ir]) {
      c.width = w;
      c.height = h;
    }
    this.w = w;
    this.h = h;
  }

  /**
   * Draw the scene as this eye sees it into `out`, at the canvas's own size, showing the part `view` picks
   * (zoomed in, the 60° view narrows to 60° ÷ zoom). Blur is worked out in angles, then turned into
   * pixels at this size, so a bigger or zoomed view shows finer differences without drawing them larger.
   */
  render(out, scene, p, view = FULL_VIEW) {
    this.resize(out.width, out.height);
    this.view = fitView(view);
    const { zoom } = this.view;
    const W = this.w, H = this.h;
    // Pixels per arcminute at this size and zoom.
    const pxPerArcmin = W * zoom / (FIELD_DEG * 60);
    this.pxPerArcmin = pxPerArcmin;
    const bctx = this.base.getContext('2d', { willReadFrequently: true });
    const gctx = this.glow.getContext('2d', { willReadFrequently: true });
    bctx.clearRect(0, 0, W, H);
    gctx.clearRect(0, 0, W, H);
    gctx.globalCompositeOperation = 'lighter';
    let anyGlow = false;
    // UV and infrared only cost anything when the eye reaches them and the scene has them.
    const useUv = p.uv > 0;
    const useIr = p.ir > 0 && !scene.noIr;
    const bands = (useUv || useIr) && !scene.photo ? this.bandsFor(scene) : null;
    const uctx = bands && useUv ? this.uv.getContext('2d', { willReadFrequently: true }) : null;
    const ictx = bands && useIr ? this.ir.getContext('2d', { willReadFrequently: true }) : null;
    uctx?.clearRect(0, 0, W, H);
    ictx?.clearRect(0, 0, W, H);

    scene.layers.forEach((layer, k) => {
      const [along, across, angle] = (p.compound
        ? [p.compound.blurArcmin, p.compound.blurArcmin, 0] : blurFor(layer.distanceM, p))
        .map((v, i) => (i < 2 ? v * pxPerArcmin : v));
      this.paint(ctx => layer.draw(ctx, p.light));
      this.blurXY(bctx, along, across, angle);
      if (layer.glow) {
        this.paint(ctx => layer.glow(ctx, p.light));
        this.blurXY(gctx, along, across, angle);
        anyGlow = true;
      }
      const irBlur = p.irBlur * pxPerArcmin;
      if (uctx) this.blurXY(uctx, along, across, angle, bands[k].uv);
      if (ictx) this.blurXY(ictx, Math.hypot(along, irBlur), Math.hypot(across, irBlur), angle, bands[k].ir);
    });
    gctx.globalCompositeOperation = 'source-over';

    this.light(bctx, anyGlow ? gctx : null, p, {
      uv: uctx?.getImageData(0, 0, W, H).data,
      ir: ictx?.getImageData(0, 0, W, H).data,
      uvGain: p.uv * UV_STRENGTH * (scene.uvLevel ?? 1),
      irGain: p.ir * IR_STRENGTH,
    });
    if (p.tapetum) this.glare(TAPETUM_GLARE[0] + TAPETUM_GLARE[1] * p.night);
    // Rods are overwhelmed by bright light: a very rod-heavy eye is dazzled.
    if (p.dazzle) this.glare(p.dazzle);
    // A pupil opened wider than the eye is adapted to lets in too much light.
    if (p.dilationGlare) this.glare(p.dilationGlare);
    if (p.tube) this.tubeEdges();
    const spot = blindSpotInView(p.blindSpot, this.view);
    if (spot) gap(this.work.getContext('2d'), spot);
    if (p.compound) mosaic(this.work.getContext('2d', { willReadFrequently: true }), p.compound.spacingDeg * 60 * pxPerArcmin, this.view);

    const octx = out.getContext('2d');
    octx.drawImage(this.work, 0, 0, out.width, out.height);
  }

  /** Scene coordinates to view pixels: the scene fills the view at 1×; zoomed in, the shown part fills it. */
  sceneTransform(ctx) {
    const { zoom: z, x, y } = this.view;
    ctx.setTransform(z * this.w / SCENE_W, 0, 0, z * this.h / SCENE_H, this.w * (0.5 - x * z), this.h * (0.5 - y * z));
  }

  paint(draw) {
    const ctx = this.layer.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    this.sceneTransform(ctx);
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
    const { zoom, x, y } = this.view;
    const key = `${this.w}×${this.h}×${zoom}×${x}×${y}`;
    const made = this.bands.get(scene);
    if (made?.key === key) return made.bands;
    const W = this.w, H = this.h;
    const bands = scene.layers.map(layer => {
      this.paint(ctx => layer.draw(ctx, 1));
      const src = this.layer.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H);
      const uv = new ImageData(W, H);
      const ir = new ImageData(W, H);
      const d = src.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const lum = 0.3 * r + 0.59 * g + 0.11 * b;
        const leafy = Math.max(0, g - Math.max(r, b));
        const bluish = Math.max(0, b - BLUISH_OVER * Math.max(r, g));
        const u = Math.min(255, UV_BASE.lum * lum + UV_BASE.blue * bluish);
        const n = Math.min(255, Math.max(0, IR_BASE.lum * lum + IR_BASE.leaf * leafy - IR_BASE.blue * bluish));
        uv.data[i] = uv.data[i + 1] = uv.data[i + 2] = u;
        ir.data[i] = ir.data[i + 1] = ir.data[i + 2] = n;
        uv.data[i + 3] = ir.data[i + 3] = d[i + 3];
      }
      const uvCanvas = createCanvas(W, H);
      const irCanvas = createCanvas(W, H);
      uvCanvas.getContext('2d').putImageData(uv, 0, 0);
      irCanvas.getContext('2d').putImageData(ir, 0, 0);
      if (layer.uv) {
        const ctx = uvCanvas.getContext('2d');
        this.sceneTransform(ctx);
        layer.uv(ctx);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      return { uv: uvCanvas, ir: irCanvas };
    });
    this.bands.set(scene, { key, bands });
    return bands;
  }

  /**
   * Blur a canvas (the layer canvas unless `src` is given) into an oval, `along` at `angle` and `across` at a
   * right angle to it, and draw it onto ctx. Uneven blur squeezes the picture along the blurrier side, blurs
   * evenly, then stretches it back; at a slant the picture is turned first and turned back after.
   */
  blurXY(ctx, along, across, angle = 0, src = this.layer) {
    const hi = Math.max(along, across);
    const lo = Math.max(1, Math.min(along, across));
    if (hi < 0.3) {
      ctx.drawImage(src, 0, 0);
      return;
    }
    if (hi / lo < 1.15 || !supportsCanvasFilter()) {
      drawBlurred(ctx, src, hi);
      return;
    }
    const c = Math.abs(Math.cos(angle));
    const s = Math.abs(Math.sin(angle));
    if (s < 0.02 || c < 0.02) {
      const [sx, sy] = s < 0.02 ? [along, across] : [across, along];
      this.squashBlur(ctx, src, this.w, this.h, sx, sy, lo);
      return;
    }
    const size = Math.ceil(Math.hypot(this.w, this.h));
    const turned = this.turned;
    turned.width = turned.height = size;
    const tctx = turned.getContext('2d');
    tctx.translate(size / 2, size / 2);
    tctx.rotate(-angle);
    tctx.drawImage(src, -this.w / 2, -this.h / 2);
    ctx.save();
    ctx.translate(this.w / 2, this.h / 2);
    ctx.rotate(angle);
    ctx.translate(-size / 2, -size / 2);
    this.squashBlur(ctx, turned, size, size, along, across, lo);
    ctx.restore();
  }

  /** Blur `src` (w × h) by sx across and sy up-down, the smaller of them being `lo`, and draw it onto ctx. */
  squashBlur(ctx, src, w, h, sx, sy, lo) {
    const sq = this.squash;
    sq.width = Math.max(1, Math.round(w * (sx > sy ? lo / sx : 1)));
    sq.height = Math.max(1, Math.round(h * (sy > sx ? lo / sy : 1)));
    const qctx = sq.getContext('2d');
    qctx.imageSmoothingQuality = 'high';
    qctx.filter = `blur(${lo.toFixed(2)}px)`;
    qctx.drawImage(src, 0, 0, sq.width, sq.height);
    qctx.filter = 'none';
    ctx.drawImage(sq, 0, 0, w, h);
  }

  /** Brightness and colors, plus UV and infrared in their stand-in colors. Works per pixel in linear light. */
  light(bctx, gctx, p, { uv, ir, uvGain, irGain }) {
    const W = this.w;
    const img = bctx.getImageData(0, 0, W, this.h);
    const d = img.data;
    const g = gctx?.getImageData(0, 0, W, this.h).data;
    const NOISE = noiseFor(W * this.h);
    const uvK = uvGain * p.exposure / 255;
    const irK = irGain * p.exposure / 255;
    const heat = p.irNoise * IR_NOISE_PX;
    const m = p.color?.kind === 'matrix' ? p.color.m : null;
    const shift = p.color?.kind === 'shift' ? p.color.channels : 0;
    const shifted = [0, 0, 0];
    // Rods take over in the dark: color fades, whatever the color sensors are. Rods see blue-green best,
    // so reds go dark first. A cone-poor eye is also paler in daylight.
    const desat = smoothstep(...COLOR_FADE, p.purkinje ? p.coneNight : p.night);
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
        const x = px % W;
        const y = (px - x) / W;
        noise += NOISE[((y >> 1) * W + (x >> 1) + 7919) % NOISE.length] * heat;
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
    this.squash.width = this.w;
    this.squash.height = this.h;
    drawBlurred(tctx, this.work, GLARE_BLUR * this.pxPerArcmin);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = alpha;
    ctx.drawImage(this.squash, 0, 0);
    ctx.globalAlpha = GLARE_VEIL;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.restore();
  }

  /**
   * A tube eye sees a narrower field than a round one, but still wider than this 60° view,
   * so only the far corners go a little soft and dim. Zoomed in, those corners move out of sight.
   */
  tubeEdges() {
    const W = this.w, H = this.h, z = this.view.zoom;
    const [cx, cy] = shownAt(this.view, 0.5, 0.5); // the middle of the eye's view
    const ctx = this.work.getContext('2d');
    const tctx = this.squash.getContext('2d');
    this.squash.width = W;
    this.squash.height = H;
    drawBlurred(tctx, this.work, TUBE_EDGE_BLUR * this.pxPerArcmin);
    // Keep only the blurred edges: fade the blurred copy out toward the middle.
    const ring = (c, inner, outer, stops) => {
      const g = c.createRadialGradient(0, 0, inner, 0, 0, outer);
      for (const [at, color] of stops) g.addColorStop(at, color);
      return g;
    };
    const oval = (c, fill) => {
      c.save();
      c.setTransform(z * W / 2, 0, 0, z * H / 2, cx * W, cy * H);
      c.fillStyle = fill;
      c.fillRect(-1, -1, 2, 2);
      c.restore();
    };
    tctx.globalCompositeOperation = 'destination-in';
    oval(tctx, ring(tctx, TUBE_EDGE.blurFrom, TUBE_EDGE.blurTo, [[0, 'rgba(0,0,0,0)'], [1, '#000']]));
    tctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.squash, 0, 0);
    oval(ctx, ring(ctx, TUBE_EDGE.dimFrom, TUBE_EDGE.dimTo, [[0, 'rgba(4,4,6,0)'], [1, `rgba(4,4,6,${TUBE_EDGE.dim})`]]));
  }
}

/**
 * Blur in arcminutes for something at `distanceM`, as an oval: [along, across, angle]. `along` is the long
 * side, at `angle` (radians, view coordinates), `across` the short side. A slit pupil blurs more one way
 * (across or up-down); astigmatism adds blur along its steep direction, at any slant.
 * The view draws it at true size; for the eye-chart readout (`p.chart`) the focus, detail and amblyopia parts
 * are the finest gaps themselves.
 */
export function blurFor(distanceM, p) {
  // Everything is worked out as the finest gap the eye makes out, in arcminutes, as the readout shows it (focus
  // errors as Smith's gap); the view draws each gap as a blur SIGMA_PER_GAP wide per arcminute, so a problem
  // looks as bad as its readout says, whatever kind it is.
  const gap = p.chart ? 1 : SIGMA_PER_GAP;
  const focusBlur = dioptersGapArcmin;
  // Vision problems are drawn wider than true size so they show in the small view (the readout isn't).
  const shown = p.chart ? 1 : DEFOCUS_DISPLAY_GAIN;
  // Amblyopia multiplies the eye's finest gap; as a gap added to it (gaps add as squares) that is this much.
  const amblyopia = p.fineArcmin * Math.sqrt(p.amblyopiaFactor ** 2 - 1) * shown;
  const axis = (pupilMm, ownPupilMm) => {
    // Focusing far beyond what the lens can make up for (tens of diopters underwater) blurs at every distance;
    // it adds to the ordinary focus error (simplified: as squares).
    const off = Math.abs(vergence(distanceM) - vergence(p.focusM));
    const defocus = Math.hypot(focusBlur(off, pupilMm), focusBlur(p.waterD ?? 0, pupilMm)) * shown;
    // Light spreading through the pupil (diffraction), about 2.3 arcminutes ÷ pupil width in mm, and a night
    // reflector scattering light sideways a little.
    const now = Math.hypot(p.fineArcmin, DIFFRACTION_ARCMIN_MM / pupilMm, p.tapetum ? TAPETUM_SCATTER : 0);
    // The view: the measured acuity already includes the spreading through the animal's own daylight pupil and its
    // own reflector's scatter, so only a change of either changes it, the same way the readout works it out.
    const base = Math.hypot(p.fineArcmin, DIFFRACTION_ARCMIN_MM / (ownPupilMm ?? pupilMm),
      (p.ownTapetum ?? p.tapetum) ? TAPETUM_SCATTER : 0);
    const own = p.chart ? now
      : now < base ? p.fineArcmin * now / base : Math.sqrt(p.fineArcmin ** 2 + now ** 2 - base ** 2);
    // An eye smaller than the animal's own loses detail; that loss is drawn at the same gain as vision problems
    // so it shows (gaps add as squares). The eye's own detail stays at true size.
    const lost = p.chart ? 0 : Math.sqrt(Math.max(0, p.fineArcmin ** 2 - (p.ownFineArcmin ?? p.fineArcmin) ** 2)) * shown;
    const fine = Math.hypot(own, lost);
    // In the dark, rods pool their signals: more rods, blurrier (a human at night: about 20/160).
    const night = NIGHT_BLUR_OLD_PX * p.night ** 2 * p.rodBlur * REF_ARCMIN_PER_PX;
    return Math.hypot(Math.hypot(defocus, fine, amblyopia) * gap, night);
  };
  const bx = axis(p.pupilW, p.ownPupilW);
  const by = axis(p.pupilH, p.ownPupilH);
  const [ux, uy] = p.cylinderDir;
  // The pupil's width along the steep direction sets how much the astigmatism blurs.
  const a = p.cylinderD
    ? focusBlur(p.cylinderD, Math.hypot(p.pupilW * ux, p.pupilH * uy)) * shown * gap
    : 0;
  // Add the two ovals (as spreads, like hypot does for circles), then find the long side and its angle.
  const xx = bx * bx + a * a * ux * ux;
  const yy = by * by + a * a * uy * uy;
  const xy = a * a * ux * uy;
  const mid = (xx + yy) / 2;
  const half = Math.hypot((xx - yy) / 2, xy);
  return [Math.sqrt(mid + half), Math.sqrt(Math.max(0, mid - half)), 0.5 * Math.atan2(2 * xy, xx - yy)];
}

/**
 * How blurry an eye chart 6 m away looks, in arcminutes, with the eye focused on it as well as it can
 * (nearsightedness may stop it). The same blur the view uses.
 */
function chartBlur(settings, light, inWater = false) {
  const p = sightParams(settings, light, inWater);
  const errorD = (settings.refraction ?? 0) * REFRACTION_MAX_D;
  const nearestD = vergence(focusDistanceM(0));
  const d = Math.min(Math.max(vergence(CHART_M), -errorD, 0), nearestD - errorD);
  const [along, across] = blurFor(CHART_M, { ...p, chart: true, focusM: d < FAR_FOCUS_D ? Infinity : 1 / d });
  return (along + across) / 2;
}

/**
 * The smallest gap this eye makes out, in arcminutes. With its own default settings in daylight it is exactly
 * its measured acuity; any blur the settings or the light add on top adds to it (blurs add as squares).
 */
export function smallestDetail(settings, light, defaults, inWater = false) {
  const own = sightParams(settings, light, inWater);
  if (own.detailArcmin != null) return own.detailArcmin;
  const now = chartBlur(settings, light, inWater);
  const base = chartBlur(defaults, 1);
  const extra = now ** 2 - base ** 2;
  if (extra < 0) return own.acuityArcmin * now / base;
  return Math.sqrt(own.acuityArcmin ** 2 + extra);
}

/** No light sensors where the nerve leaves the eye: a gap in the picture. */
// Canvases for filling in the blind spot: the area around it at low resolution, and the fill at full size.
const AROUND = createCanvas(1, 1);
const SPREAD = createCanvas(1, 1);
const FILL_GRID = 80; // the fill is worked out on a grid this many pixels across (it is smooth anyway)
const FILL_STEPS = 150;

/**
 * The brain fills the blind spot in with what's around it, so anything inside it disappears.
 * Each row of the spot is first blended from its left edge to its right edge, then every pixel is
 * repeatedly set to the average of its neighbors, so the colors flow in evenly from all sides.
 * A thin dashed line marks where it is.
 */
function gap(ctx, s) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cx = s.x * W, cy = s.y * H, rx = s.rx * W, ry = s.ry * H;
  // The area around the spot, kept inside the view (a big spot can reach past its edge).
  const x0 = Math.max(0, Math.round(cx - rx * 2.5)), y0 = Math.max(0, Math.round(cy - ry * 2.5));
  const w = Math.min(W, Math.round(cx + rx * 2.5)) - x0, h = Math.min(H, Math.round(cy + ry * 2.5)) - y0;
  if (w < 1 || h < 1) return;
  const hole = (c, k) => {
    c.beginPath();
    c.ellipse(cx - x0, cy - y0, rx * k, ry * k, 0, 0, Math.PI * 2);
  };
  const scale = Math.min(1, FILL_GRID / Math.max(w, h));
  const gw = Math.max(2, Math.round(w * scale)), gh = Math.max(2, Math.round(h * scale));
  AROUND.width = gw;
  AROUND.height = gh;
  const actx = AROUND.getContext('2d', { willReadFrequently: true });
  actx.drawImage(ctx.canvas, x0, y0, w, h, 0, 0, gw, gh);
  const img = actx.getImageData(0, 0, gw, gh);
  const px = img.data;
  // Which grid pixels are inside the spot (with a little margin, since shrinking the picture smears its edge).
  const inside = new Uint8Array(gw * gh);
  const gcx = (cx - x0) * gw / w, gcy = (cy - y0) * gh / h, grx = rx * 1.12 * gw / w, gry = ry * 1.12 * gh / h;
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    inside[y * gw + x] = ((x + 0.5 - gcx) / grx) ** 2 + ((y + 0.5 - gcy) / gry) ** 2 < 1 ? 1 : 0;
  }
  // Each row: blend from the last pixel left of the spot to the first one right of it.
  for (let y = 0; y < gh; y++) {
    let x = 0;
    while (x < gw) {
      if (!inside[y * gw + x]) { x++; continue; }
      const a = x - 1;
      while (x < gw && inside[y * gw + x]) x++;
      const b = x < gw ? x : -1;
      for (let k = a + 1; k < x; k++) {
        const t = a < 0 || b < 0 ? (a < 0 ? 1 : 0) : (k - a) / (b - a);
        for (let c = 0; c < 3; c++) {
          const left = a < 0 ? px[(y * gw + b) * 4 + c] : px[(y * gw + a) * 4 + c];
          const right = b < 0 ? left : px[(y * gw + b) * 4 + c];
          px[(y * gw + k) * 4 + c] = left + (right - left) * t;
        }
      }
    }
  }
  // Then smooth it out: each pixel inside takes the average of its neighbors, many times over.
  const cells = [];
  for (let i = 0; i < inside.length; i++) if (inside[i]) cells.push(i);
  for (let step = 0; step < FILL_STEPS; step++) {
    for (const i of cells) {
      const x = i % gw, y = (i - x) / gw;
      const near = [];
      if (x > 0) near.push(i - 1);
      if (x < gw - 1) near.push(i + 1);
      if (y > 0) near.push(i - gw);
      if (y < gh - 1) near.push(i + gw);
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (const j of near) sum += px[j * 4 + c];
        px[i * 4 + c] = sum / near.length;
      }
    }
  }
  actx.putImageData(img, 0, 0);
  SPREAD.width = w;
  SPREAD.height = h;
  const sctx = SPREAD.getContext('2d');
  sctx.imageSmoothingEnabled = true;
  sctx.drawImage(AROUND, 0, 0, w, h);
  sctx.globalCompositeOperation = 'source-over';
  // Keep only the inside of the spot, with a soft edge.
  sctx.globalCompositeOperation = 'destination-in';
  sctx.setTransform(rx * 1.1, 0, 0, ry * 1.1, cx - x0, cy - y0);
  const g = sctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0.8, '#000');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  sctx.fillStyle = g;
  sctx.fillRect(-1, -1, 2, 2);
  ctx.save();
  // With both eyes, the part the other eye sees stays as it is.
  if (s.from != null) {
    ctx.beginPath();
    ctx.rect(s.from * W, 0, W, H);
    ctx.clip();
  }
  ctx.drawImage(SPREAD, x0, y0);
  ctx.translate(x0, y0);
  // The dashed line keeps the size it had on the 640-pixel view.
  const line = W / VIEW_W;
  ctx.setLineDash([4 * line, 4 * line]);
  ctx.lineWidth = 1.5 * line;
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  hole(ctx, 1);
  ctx.stroke();
  ctx.restore();
}

/**
 * One dot per facet, in a honeycomb `spacing` px apart: each hexagon takes the color at its center
 * (the picture is already blurred by each facet's view, so that is the facet's average).
 * Big dots get a faint edge so the honeycomb shows; the brain doesn't see edges, it's a guide.
 */
function mosaic(ctx, spacing, view) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const d = ctx.getImageData(0, 0, W, H).data;
  const r = spacing / Math.sqrt(3); // hexagon corner radius, pointy side up
  const rowH = 1.5 * r;
  // Edges on dots at least 10 pixels of the 640-pixel view apart.
  const line = W / VIEW_W;
  const edge = spacing >= MOSAIC_EDGE_OLD_PX * line;
  ctx.lineWidth = line;
  // The honeycomb belongs to the eye, not the screen: one dot sits at the top left corner of the eye's view,
  // wherever zooming and dragging have moved it (at 1× it is the screen's corner).
  const [fx, fy] = shownAt(view, 0, 0);
  const ox = fx * W, oy = fy * H;
  // From the first row and dot that reach into the view.
  for (let k = Math.floor((-r - oy) / rowH) + 1, y = oy + k * rowH; y < H + r; k++, y = oy + k * rowH) {
    const base = ox + (k & 1 ? spacing / 2 : 0);
    let first = base - spacing * Math.floor((base + spacing / 2) / spacing);
    if (first <= 1e-9 - spacing / 2) first += spacing;
    for (let x = first; x < W + spacing; x += spacing) {
      const px = Math.min(W - 1, Math.max(0, Math.round(x)));
      const py = Math.min(H - 1, Math.max(0, Math.round(y)));
      const i = (py * W + px) * 4;
      const color = `rgb(${d[i]},${d[i + 1]},${d[i + 2]})`;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = Math.PI / 6 + (k * Math.PI) / 3;
        ctx[k ? 'lineTo' : 'moveTo'](x + r * Math.cos(a), y + r * Math.sin(a));
      }
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      // A stroke in the same color closes the hairline seams between hexagons.
      ctx.strokeStyle = edge ? `rgba(0,0,0,${MOSAIC_EDGE_ALPHA})` : color;
      ctx.stroke();
    }
  }
}

function shoulder(x) {
  const { knee, room } = SHOULDER;
  if (x <= knee) return x < 0 ? 0 : x;
  return knee + room * (1 - Math.exp(-(x - knee) / room));
}

/** Amblyopia's logMAR at slider `strength` (0..1), from the PEDIG bands. */
function amblyopiaLogMar(strength) {
  const band = AMBLYOPIA_BANDS.find(b => strength < b.to) ?? AMBLYOPIA_BANDS[AMBLYOPIA_BANDS.length - 1];
  const t = (strength - band.from) / (band.to - band.from);
  return band.logMar[0] + (band.logMar[1] - band.logMar[0]) * Math.min(1, Math.max(0, t));
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
