// Canvas and pixel helpers shared by the sight pipeline stages.

export function createCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

let filterSupport = null;
/** Canvas `ctx.filter = 'blur()'` is fast but missing in some browsers; detect once. */
export function supportsCanvasFilter() {
  if (filterSupport === null) {
    const ctx = createCanvas(1, 1).getContext('2d');
    ctx.filter = 'blur(2px)';
    filterSupport = ctx.filter === 'blur(2px)';
  }
  return filterSupport;
}

/** Draw `src` onto `ctx` with a gaussian-like blur of standard deviation `sigma` px. */
export function drawBlurred(ctx, src, sigma) {
  if (sigma < 0.25) {
    ctx.drawImage(src, 0, 0);
    return;
  }
  if (supportsCanvasFilter()) {
    ctx.save();
    ctx.filter = `blur(${sigma.toFixed(2)}px)`;
    ctx.drawImage(src, 0, 0);
    ctx.restore();
    return;
  }
  const tmp = createCanvas(src.width, src.height);
  const tctx = tmp.getContext('2d');
  tctx.drawImage(src, 0, 0);
  const img = tctx.getImageData(0, 0, tmp.width, tmp.height);
  boxBlur(img, Math.max(1, Math.round(sigma * 0.9)), 3);
  tctx.putImageData(img, 0, 0);
  ctx.drawImage(tmp, 0, 0);
}

/** Repeated box blur (approximates a gaussian). Works in place on opaque ImageData. */
export function boxBlur(img, r, passes = 3) {
  const { width: w, height: h, data } = img;
  const tmp = new Float32Array(data.length);
  for (let p = 0; p < passes; p++) {
    blurPass(data, tmp, w, h, r, 4, w * 4);
    blurPass(tmp, data, h, w, r, w * 4, 4);
  }
}

// One 1D pass along "lines": `step` moves along a line, `lineStep` moves to the next line.
function blurPass(src, dst, lineLen, lines, r, step, lineStep) {
  const norm = 1 / (2 * r + 1);
  for (let line = 0; line < lines; line++) {
    const base = line * lineStep;
    for (let ch = 0; ch < 4; ch++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += src[base + clampIdx(k, lineLen) * step + ch];
      for (let i = 0; i < lineLen; i++) {
        dst[base + i * step + ch] = acc * norm;
        acc += src[base + clampIdx(i + r + 1, lineLen) * step + ch] - src[base + clampIdx(i - r, lineLen) * step + ch];
      }
    }
  }
}

const clampIdx = (i, n) => (i < 0 ? 0 : i >= n ? n - 1 : i);

// sRGB <-> linear lookup tables. Color math (Machado matrices, channel sums) must happen in linear light.
export const SRGB_TO_LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  SRGB_TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
const LIN_STEPS = 4096;
const LINEAR_TO_SRGB = new Uint8ClampedArray(LIN_STEPS + 1);
for (let i = 0; i <= LIN_STEPS; i++) {
  const c = i / LIN_STEPS;
  LINEAR_TO_SRGB[i] = Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055));
}
export function linearToSrgb(v) {
  return LINEAR_TO_SRGB[Math.round((v < 0 ? 0 : v > 1 ? 1 : v) * LIN_STEPS)];
}
