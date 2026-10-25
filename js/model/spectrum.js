// The light spectrum an eye can see, worked out from its color sensors.
//
// Each sensor (cone or other photoreceptor) responds to a band of light around its peak wavelength.
// The visible range, how many sensors fit in it, and the colors the eye tells apart all follow from
// the sensor peaks and the lens. The margins and spacing limits are simplified rules, not measurements.

export const BAR_MIN = 300; // nm; shorter light is mostly blocked by the air, and damaging
export const BAR_MAX = 800; // nm; longer light is too weak to tell apart from the eye's own body heat
export const BLUE_MARGIN = 75; // the range starts about this far below the bluest sensor's peak
export const RED_MARGIN = 140; // and ends about this far above the reddest (sensor curves have a long weak red tail)
export const MIN_GAP = 25; // closer peaks give nearly the same signal
export const MAX_GAP = 130; // farther peaks leave a dim gap between them
export const MAX_SENSORS = 5;

/** The narrowest and widest visible range for `n` sensors, before the lens trims it. */
export const minWidth = n => BLUE_MARGIN + RED_MARGIN + MIN_GAP * (n - 1);
export const maxWidth = n => (n === 1 ? minWidth(1) : Math.min(BAR_MAX - BAR_MIN, BLUE_MARGIN + RED_MARGIN + MAX_GAP * (n - 1)));

// Spacing between neighboring peaks when a color button picks a new number of sensors.
const TYPICAL_GAP = { 2: 105, 3: 70, 4: 55, 5: 50 };

/**
 * How strongly a sensor with its peak at `peakNm` responds to light at `nm`, from 0 to 1.
 * Govardovskii et al. (2000), "In search of the visual pigment template", A1 pigments: main band plus beta band.
 */
export function sensitivity(peakNm, nm) {
  const x = peakNm / nm;
  const a = 0.8795 + 0.0459 * Math.exp(-((peakNm - 300) ** 2) / 11940);
  const alpha = 1 / (Math.exp(69.7 * (a - x)) + Math.exp(28 * (0.922 - x)) + Math.exp(-14.9 * (1.104 - x)) + 0.674);
  const betaPeak = 189 + 0.315 * peakNm;
  const betaWidth = -40.5 + 0.195 * peakNm;
  const beta = 0.26 * Math.exp(-(((nm - betaPeak) / betaWidth) ** 2));
  return alpha + beta;
}

/** The range the sensors themselves cover, before the lens trims it. */
export function sensorRange(peaks) {
  return { lo: Math.min(...peaks) - BLUE_MARGIN, hi: Math.max(...peaks) + RED_MARGIN };
}

/** What the eye actually sees: the sensors' range, cut by a UV-blocking lens when it is on. */
export function visibleRange(peaks, lensCutoffNm, uvLens) {
  const { lo, hi } = sensorRange(peaks);
  const cut = uvLens === 'on' && lensCutoffNm ? lensCutoffNm : BAR_MIN;
  return { lo: Math.max(BAR_MIN, cut, lo), hi: Math.min(BAR_MAX, hi) };
}

// Where ultraviolet and infrared start, for this simulation's effects (simplified lines).
export const UV_FROM_NM = 400;
export const IR_FROM_NM = 720;

/** Whether the eye's visible range reaches into UV and into infrared. */
export function bandReach(settings) {
  if (!settings.peaks) return { uv: false, ir: false };
  const { lo, hi } = visibleRange(settings.peaks, settings.lensCutoffNm, settings.uvLens);
  return { uv: lo < UV_FROM_NM, ir: hi > IR_FROM_NM, lo, hi };
}

/** `n` peaks spread evenly over a sensor range. */
function spread(lo, hi, n) {
  const first = lo + BLUE_MARGIN;
  const last = hi - RED_MARGIN;
  if (n === 1) return [Math.round((first + last) / 2)];
  return Array.from({ length: n }, (_, i) => Math.round(first + ((last - first) * i) / (n - 1)));
}

/**
 * The peaks after a color button picks `n` sensors: the example's own peaks when it has that many,
 * otherwise a typical spacing for `n`, centered where the range was. A wider spread doesn't push
 * the eye into infrared unless it already reached there.
 */
export function peaksForCount(n, peaks, examplePeaks) {
  if (examplePeaks?.length === n) return [...examplePeaks];
  const { lo, hi } = sensorRange(peaks);
  const width = minWidth(1) + (TYPICAL_GAP[n] ?? 0) * (n - 1);
  const top = hi > IR_FROM_NM ? BAR_MAX : IR_FROM_NM;
  let start = (lo + hi) / 2 - width / 2;
  start = Math.min(Math.max(start, BAR_MIN - BLUE_MARGIN), top - width);
  return spread(start, start + width, n);
}

const sensorWord = n => `${n} sensor${n === 1 ? '' : 's'}`;

/**
 * Drag one end of the visible range to `nm`, from the eye as it was when the drag started.
 * Keeps the number of sensors when it fits; too narrow drops one or more, too wide adds them.
 * With one sensor the width is fixed, so the window moves.
 * Returns { peaks, uvLens, note }.
 */
export function dragRange(end, nm, { peaks, lensCutoffNm, uvLens }) {
  const n = peaks.length;
  const shown = visibleRange(peaks, lensCutoffNm, uvLens);
  const target = Math.round(Math.min(BAR_MAX, Math.max(BAR_MIN, nm)));
  // Back where the drag started: nothing changes.
  if (target === shown[end]) return { peaks, uvLens, note: null };
  let { lo, hi } = sensorRange(peaks);
  let lens = uvLens;
  if (end === 'hi') {
    hi = target;
  } else if (lensCutoffNm && uvLens === 'on' && target < lensCutoffNm) {
    // Below the cutoff the UV-blocking lens switches off, and the range jumps to the sensors' own blue end.
    lens = 'off';
    lo = Math.min(lo, target);
  } else {
    lo = target;
    if (lensCutoffNm) lens = target < lensCutoffNm ? 'off' : 'on';
  }

  const width = hi - lo;
  let count = n;
  if (width > maxWidth(n)) {
    count = Math.min(MAX_SENSORS, [1, 2, 3, 4, 5].find(k => maxWidth(k) >= width) ?? MAX_SENSORS);
  } else if (width < minWidth(n)) {
    count = [5, 4, 3, 2, 1].find(k => minWidth(k) <= width) ?? 1;
  }
  // With one sensor, widening only adds a second one once two fit; until then the window just moves.
  if (n === 1 && width < minWidth(2)) count = 1;
  // Keep the width possible for the new count, moving the dragged end back if needed.
  const fixed = Math.min(Math.max(width, minWidth(count)), maxWidth(count));
  if (end === 'lo') lo = hi - fixed;
  else hi = lo + fixed;
  if (lo < BAR_MIN - BLUE_MARGIN) { hi += BAR_MIN - BLUE_MARGIN - lo; lo = BAR_MIN - BLUE_MARGIN; }
  if (hi > BAR_MAX) { lo -= hi - BAR_MAX; hi = BAR_MAX; }

  let note = null;
  if (count < n) note = `Too narrow for ${sensorWord(n)}, so this eye now has ${count}.`;
  if (count > n) note = `Too wide for ${sensorWord(n)}, so this eye now has ${count}.`;
  return { peaks: spread(lo, hi, count), uvLens: lens, note };
}

/**
 * The peaks the eye actually has: red-green deficiency (deuteranomaly) slides the green sensor
 * toward the red one. Mild is close, strong merges them. This slide ignores the spacing rules.
 */
export function effectivePeaks(settings) {
  const peaks = settings.peaks;
  if (!peaks) return null;
  if (settings.colors !== '3' || settings.colorblind !== 'redGreen' || peaks.length !== 3) return peaks;
  const shift = 0.3 + 0.7 * (settings.colorblindStrength ?? 0.5);
  const [s, m, l] = peaks;
  return [s, m + (l - m) * shift, l];
}

/** A screen color for a wavelength, for drawing the bar and the sensor curves (sRGB, 0..255). */
export function wavelengthColor(nm) {
  let r = 0, g = 0, b = 0;
  if (nm < 440) { r = (440 - nm) / 60; b = 1; }
  else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
  else if (nm < 510) { g = 1; b = (510 - nm) / 20; }
  else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
  else if (nm < 645) { r = 1; g = (645 - nm) / 65; }
  else r = 1;
  // Fade toward the ends, where eyes are less sensitive.
  const fade = nm < 420 ? 0.3 + (0.7 * (nm - 380)) / 40 : nm > 700 ? 0.3 + (0.7 * (780 - nm)) / 80 : 1;
  const f = Math.min(1, Math.max(0.3, fade));
  return [r, g, b].map(c => Math.round(255 * (Math.max(0, c) * f) ** 0.8));
}
