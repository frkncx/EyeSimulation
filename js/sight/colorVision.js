// How many color channels the eye has, as a 3×3 matrix on linear RGB, or a made-up color shift.
import { sensitivity, effectivePeaks, BAR_MIN, BAR_MAX } from '../model/spectrum.js';
import { TUNING } from '../model/constants.js';

// What each of these does is in js/model/constants.js.
const { PRIMARIES, LENS_YELLOW, HUMAN, FLOOR, FLOOR_SOFT, UV_SENSOR_NM, ROD_PEAK } = TUNING;

const LUMA = [0.2126, 0.7152, 0.0722];

// --- Colors from the sensor peaks ---
//
// Each screen pixel's red, green and blue are treated as three smooth bands of light. Each sensor's
// response to them comes from its sensitivity curve. The responses are turned into brightness plus
// color differences, then back into screen colors the way a normal human eye would read them.
// A normal human gives back exactly what went in; any other set of sensors shows what it tells apart.

const WAVES = Array.from({ length: (BAR_MAX - BAR_MIN) / 5 + 1 }, (_, i) => BAR_MIN + 5 * i);
// A screen's red, green and blue are bands of light (PRIMARIES), fitted so that the human and red-green
// deficiency results come out close to Machado et al. (2009).

/** How much light at `nm` gets through the lens: a soft cutoff plus a yellow tint below 480 nm. */
const lensPass = (nm, cutoff) => (cutoff
  ? Math.exp(-LENS_YELLOW * Math.max(0, (480 - nm) / 80) ** 1.5) / (1 + Math.exp(-(nm - cutoff) / 4))
  : 1);

/** How each sensor responds to the screen's red, green and blue. */
function sensorRows(peaks, cutoff) {
  return peaks.map(peak => PRIMARIES.map(([mid, width]) => WAVES.reduce((sum, nm) =>
    sum + Math.exp(-0.5 * ((nm - mid) / width) ** 2) * sensitivity(peak, nm) * lensPass(nm, cutoff), 0)));
}

// Ingling & Tsou (1977) opponent stage, as used by Machado et al. (2009): brightness, yellow-blue
// and red-green from the long, middle and short sensors (columns: L, M, S).
const OPPONENT = [
  [0.6, 0.4, 0],
  [0.24, 0.105, -0.7],
  [1.2, -1.6, 0.4],
];

const sum = row => row[0] + row[1] + row[2];
/** How strongly each channel (brightness, yellow-blue, red-green) responds to white, from sensor rows S, M, L. */
const channelsOf = (S, M, L) => OPPONENT.map(([wl, wm, ws]) => [0, 1, 2].map(k => wl * L[k] + wm * M[k] + ws * S[k]));
const HUMAN_ROWS = sensorRows(HUMAN.peaks, HUMAN.lensCutoffNm);
const HUMAN_WHITE = channelsOf(...HUMAN_ROWS).map(sum);
const HUMAN_SHORT_WHITE = sum(HUMAN_ROWS[0]);
// Keeps a channel's scale from collapsing: never far below the human's (a smooth floor, so colors
// don't jump while a peak is dragged).
const floored = r => FLOOR + FLOOR_SOFT * Math.log(1 + Math.exp((r - FLOOR) / FLOOR_SOFT));

/**
 * Brightness, yellow-blue and red-green (3×3, on linear RGB) from the sensors, so white gives 1 in each.
 * Two sensors fill short and long, with the middle merged into the long.
 * The short sensor is first scaled to respond to white like a human's, as eyes adjust to the light they get.
 * Each color channel is then divided by how strongly it responds to white (as in Machado et al. 2009),
 * but by the size only, and never much less than a human's: a sensor set far from the human's would
 * otherwise flip a channel (sky turning yellow) or blow it up.
 * A channel with nothing to compare (one sensor) comes out grey.
 */
function opponent(peaks, cutoff) {
  const rows = sensorRows([...peaks].sort((a, b) => a - b), cutoff);
  const n = rows.length;
  if (n > 1) {
    const gain = HUMAN_SHORT_WHITE / sum(rows[0]);
    rows[0] = rows[0].map(v => v * gain);
  }
  const [S, M, L] = n === 1 ? [rows[0], rows[0], rows[0]] : n === 2 ? [rows[0], rows[1], rows[1]] : rows;
  const channels = channelsOf(S, M, L);
  const whites = channels.map(sum);
  const bright = channels[0].map(v => v / whites[0]);
  return channels.flatMap((c, i) => {
    if (i === 0) return bright;
    const scale = HUMAN_WHITE[i] * floored(Math.abs(whites[i] / HUMAN_WHITE[i]));
    return c.map((v, k) => (v - whites[i] * bright[k]) / scale + bright[k]);
  });
}

function invert3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map(v => v / det);
}

const mul3 = (p, q) => Array.from({ length: 9 }, (_, k) => {
  const r = Math.floor(k / 3), c = k % 3;
  return p[r * 3] * q[c] + p[r * 3 + 1] * q[3 + c] + p[r * 3 + 2] * q[6 + c];
});

const HUMAN_INVERSE = invert3(opponent(HUMAN.peaks, HUMAN.lensCutoffNm));

/** How much rods respond to the screen's red, green and blue, scaled so white gives 1. */
export const ROD_WEIGHTS = (() => {
  const [row] = sensorRows([ROD_PEAK], null);
  const white = row[0] + row[1] + row[2];
  return row.map(v => v / white);
})();

/** The 3×3 matrix on linear RGB for an eye with one to three sensors at these peaks, and its lens. */
export function peakMatrix(peaks, lensCutoffNm, uvLens) {
  return mul3(HUMAN_INVERSE, opponent(peaks, uvLens === 'on' ? lensCutoffNm : null));
}

/**
 * The color step for the current settings:
 *   { kind: 'matrix', m }           1 to 3 sensors, worked out from their peaks
 *   { kind: 'shift', channels: n }  4 or 5 sensors (made-up colors, since screens can't show them)
 */
export function colorStep(settings) {
  const peaks = effectivePeaks(settings);
  if (!peaks) return null;
  if (peaks.length >= 4) return { kind: 'shift', channels: peaks.length };
  // Three sensors starting in ultraviolet (like a bee's) aren't a person's red, green and blue either.
  if (peaks.length === 3 && Math.min(...peaks) < UV_SENSOR_NM) return { kind: 'shift', channels: 3 };
  return { kind: 'matrix', m: peakMatrix(peaks, settings.lensCutoffNm, settings.uvLens) };
}

/**
 * Made-up colors for 4 or 5 channels, or 3 that start in ultraviolet. The extra channel is guessed from the picture (mostly blue light),
 * then every color is moved over one step (4) or two steps (5) so the extra one gets a screen color.
 * Works on linear r, g, b and writes into `out`.
 */
export function shiftColors(r, g, b, channels, out) {
  const extra = 0.75 * b + 0.25 * (LUMA[0] * r + LUMA[1] * g + LUMA[2] * b);
  if (channels === 3) {
    // Ultraviolet, blue and green shown as blue, green and red: the green sensor barely sees red, so red goes dark.
    out[0] = 0.75 * g + 0.25 * r; out[1] = 0.85 * b + 0.15 * g; out[2] = extra;
  } else if (channels === 4) {
    out[0] = g; out[1] = b; out[2] = extra;
  } else {
    out[0] = b; out[1] = extra; out[2] = r;
  }
}
