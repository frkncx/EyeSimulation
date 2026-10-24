// How many color channels the eye has, as a 3×3 matrix on linear RGB, or a made-up color shift.
//
// Red-green colorblindness: Machado, Oliveira & Fernandes (2009), "A Physiologically-based Model
// for Simulation of Color Vision Deficiency", deuteranomaly, severity 0.0 to 1.0 in steps of 0.1.
const DEUTAN = [
  [1, 0, 0, 0, 1, 0, 0, 0, 1],
  [0.866435, 0.177704, -0.044139, 0.049567, 0.939063, 0.011370, -0.003453, 0.007233, 0.996220],
  [0.760729, 0.319078, -0.079807, 0.090568, 0.889315, 0.020117, -0.006027, 0.013325, 0.992702],
  [0.675425, 0.433850, -0.109275, 0.125303, 0.847755, 0.026942, -0.007950, 0.018572, 0.989378],
  [0.605511, 0.528560, -0.134071, 0.155318, 0.812366, 0.032316, -0.009376, 0.023176, 0.986200],
  [0.547494, 0.607765, -0.155259, 0.181692, 0.781742, 0.036566, -0.010410, 0.027275, 0.983136],
  [0.498864, 0.674741, -0.173604, 0.205199, 0.754872, 0.039929, -0.011131, 0.030969, 0.980162],
  [0.457771, 0.731899, -0.189670, 0.226409, 0.731012, 0.042579, -0.011595, 0.034333, 0.977261],
  [0.422823, 0.781057, -0.203881, 0.245752, 0.709602, 0.044646, -0.011843, 0.037423, 0.974421],
  [0.392952, 0.823610, -0.216562, 0.263559, 0.690210, 0.046232, -0.011910, 0.040281, 0.971630],
  [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.011820, 0.042940, 0.968881],
];

function deutan(severity) {
  const s = Math.min(1, Math.max(0, severity)) * 10;
  const i = Math.min(9, Math.floor(s));
  const f = s - i;
  return DEUTAN[i].map((v, k) => v + (DEUTAN[i + 1][k] - v) * f);
}

const LUMA = [0.2126, 0.7152, 0.0722];

/**
 * The color step for the current settings:
 *   { kind: 'matrix', m }           1 to 3 colors (real simulation)
 *   { kind: 'shift', channels: n }  4 or 5 colors (made-up colors, since screens can't show them)
 */
export function colorStep(settings) {
  const n = Number(settings.colors ?? 3);
  if (n === 1) return { kind: 'matrix', m: [...LUMA, ...LUMA, ...LUMA] };
  if (n === 2) return { kind: 'matrix', m: deutan(1) };
  if (n === 3 && settings.colorblind === 'redGreen') {
    return { kind: 'matrix', m: deutan(0.3 + 0.7 * (settings.colorblindStrength ?? 0.5)) };
  }
  if (n >= 4) return { kind: 'shift', channels: n };
  return null;
}

/**
 * Made-up colors for 4 or 5 channels. The extra channel is guessed from the picture (mostly blue light),
 * then every color is moved over one step (4) or two steps (5) so the extra one gets a screen color.
 * Works on linear r, g, b and writes into `out`.
 */
export function shiftColors(r, g, b, channels, out) {
  const extra = 0.75 * b + 0.25 * (LUMA[0] * r + LUMA[1] * g + LUMA[2] * b);
  if (channels === 4) {
    out[0] = g; out[1] = b; out[2] = extra;
  } else {
    out[0] = b; out[1] = extra; out[2] = r;
  }
}
