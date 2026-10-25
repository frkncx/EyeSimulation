// The light spectrum bar in the header: what the current eye can see, and a control for it.
// Drag either end of the highlighted range to change the eye; main.js turns the drag into new sensor peaks.
import { escapeHtml } from './glossary.js';
import { BAR_MIN, BAR_MAX, visibleRange, effectivePeaks, sensitivity, wavelengthColor } from '../model/spectrum.js';

const H = 40;
const LEFT_ZONE = 30; // px for the shaded zone below 300 nm (its label shows on hover)
const RIGHT_ZONE = 30; // px for the shaded zone above 800 nm
const BAR_TOP = 13;
const BAR_H = 14;
const CURVE_H = 11;
const KEY_STEP = 5; // nm per arrow key

const TITLE_TIP = 'The light this eye can see, from ultraviolet (UV) to infrared (IR). Each mark is a color sensor at the wavelength it responds to most, and the faint curve above it is its whole band. Drag either end of the range to change the eye. Simplified: the range runs about 75 nm below the bluest sensor to 140 nm above the reddest, and neighboring sensors stay 25–130 nm apart.';
const UV_ZONE_TIP = 'Mostly blocked by the air, and damaging. Light shorter than 300 nm hardly reaches the ground, and it harms living cells.';
const IR_ZONE_TIP = 'No eye sees here. Longer light is too weak to tell apart from the eye’s own body heat. Animals that sense heat, like some snakes, use separate pit organs, not eyes.';

/** The hover text for a range end: which end it is and where it sits. */
function handleTip(end, nm) {
  return end === 'lo'
    ? `UV end: ${nm} nm. Drag to change the shortest light this eye sees.`
    : `IR end: ${nm} nm. Drag to change the longest light this eye sees.`;
}
const LOCKED_TIP = 'This example’s range is fixed.';

const SVG_NS = 'http://www.w3.org/2000/svg';

function lensText(settings, lensTip) {
  const cut = settings.lensCutoffNm;
  const base = !cut ? 'This eye has no UV-blocking lens.'
    : settings.uvLens === 'on' ? `The lens blocks UV below ${cut} nm. Drag the blue end below it to take the filter away.`
    : 'The UV-blocking lens is off, so UV reaches the retina.';
  return lensTip ? `${base} ${lensTip}` : base;
}

export function createSpectrumBar(root, { onDrag }) {
  root.innerHTML = `
    <div class="spectrum-label">
      <span class="spectrum-title" tabindex="0" data-tip="${escapeHtml(TITLE_TIP)}">Spectrum:</span>
      <output class="spectrum-range" tabindex="0"></output>
    </div>
    <svg class="spectrum-svg" height="${H}" aria-label="Light spectrum this eye can see"></svg>
    <p class="spectrum-note" role="status" hidden></p>`;
  const svg = root.querySelector('svg');
  const rangeOut = root.querySelector('.spectrum-range');
  const note = root.querySelector('.spectrum-note');

  let current = null; // { settings, locked, lensTip, note }
  let drag = null; // { end, start }

  const width = () => svg.clientWidth || 600;
  const scale = () => (width() - LEFT_ZONE - RIGHT_ZONE) / (BAR_MAX - BAR_MIN);
  const x = nm => LEFT_ZONE + (nm - BAR_MIN) * scale();
  const nmAt = clientX => BAR_MIN + (clientX - svg.getBoundingClientRect().left - LEFT_ZONE) / scale();

  function draw() {
    if (!current) return;
    const { settings, locked } = current;
    const W = width();
    const { lo, hi } = visibleRange(settings.peaks, settings.lensCutoffNm, settings.uvLens);
    const peaks = effectivePeaks(settings);
    const stops = [];
    for (let nm = BAR_MIN; nm <= BAR_MAX; nm += 10) {
      stops.push(`<stop offset="${(nm - BAR_MIN) / (BAR_MAX - BAR_MIN)}" stop-color="rgb(${wavelengthColor(nm)})"/>`);
    }
    const curves = peaks.map(peak => {
      const pts = [];
      for (let nm = BAR_MIN; nm <= BAR_MAX; nm += 4) {
        pts.push(`${x(nm).toFixed(1)},${(BAR_TOP - CURVE_H * sensitivity(peak, nm)).toFixed(1)}`);
      }
      return `<polyline points="${pts.join(' ')}" fill="none" stroke="rgb(${wavelengthColor(peak)})" stroke-width="1.5" opacity="0.75"/>`;
    }).join('');
    const markers = peaks.map(peak => {
      const px = x(peak);
      return `<path d="M${px - 4},${BAR_TOP - 5} h8 l-4,5 z" fill="var(--ink)"/>
        <line x1="${px}" x2="${px}" y1="${BAR_TOP}" y2="${BAR_TOP + BAR_H}" stroke="var(--ink)" stroke-width="2"/>`;
    }).join('');
    const handle = (end, nm) => `
      <g class="spectrum-handle" data-end="${end}" tabindex="0" role="slider"
        aria-label="${end === 'lo' ? 'Blue end' : 'Red end'}" aria-valuemin="${BAR_MIN}" aria-valuemax="${BAR_MAX}"
        aria-valuenow="${nm}" data-tip="${escapeHtml(handleTip(end, nm))}">
        <rect x="${x(nm) - 11}" y="0" width="22" height="${H}" fill="transparent"/>
        <rect x="${x(nm) - 4}" y="${BAR_TOP - 4}" width="8" height="${BAR_H + 8}" rx="3" fill="var(--ink)"/>
        <line x1="${x(nm)}" x2="${x(nm)}" y1="${BAR_TOP}" y2="${BAR_TOP + BAR_H}" stroke="#fff" stroke-width="1.5"/>
      </g>`;
    const label = (nm, text) => `<text x="${x(nm)}" y="${H - 2}" text-anchor="middle">${text}</text>`;
    const tick = nm => `<line x1="${x(nm)}" x2="${x(nm)}" y1="${BAR_TOP + BAR_H}" y2="${BAR_TOP + BAR_H + 4}" stroke="var(--muted)"/>`;

    // The end being dragged or hovered keeps its hover text, updated to the new wavelength.
    const tipEnd = drag?.end ?? svg.querySelector('[data-end]:hover')?.dataset.end;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = `
      <defs>
        <linearGradient id="spectrumFill" x1="${x(BAR_MIN)}" x2="${x(BAR_MAX)}" gradientUnits="userSpaceOnUse">${stops.join('')}</linearGradient>
        <pattern id="spectrumHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="#eceae4"/><line x1="0" x2="0" y1="0" y2="6" stroke="#c9c6be" stroke-width="3"/>
        </pattern>
      </defs>
      <g class="spectrum-zone" tabindex="0" aria-label="Below 300 nm" data-tip="${escapeHtml(UV_ZONE_TIP)}">
        <rect x="0" y="0" width="${LEFT_ZONE - 4}" height="${H}" rx="6" fill="url(#spectrumHatch)"/>
      </g>
      <g class="spectrum-zone" tabindex="0" aria-label="Above 800 nm" data-tip="${escapeHtml(IR_ZONE_TIP)}">
        <rect x="${W - RIGHT_ZONE + 4}" y="0" width="${RIGHT_ZONE - 4}" height="${H}" rx="6" fill="url(#spectrumHatch)"/>
      </g>
      ${curves}
      <rect x="${x(BAR_MIN)}" y="${BAR_TOP}" width="${x(BAR_MAX) - x(BAR_MIN)}" height="${BAR_H}" fill="url(#spectrumFill)"/>
      <rect x="${x(BAR_MIN)}" y="${BAR_TOP}" width="${x(lo) - x(BAR_MIN)}" height="${BAR_H}" fill="#fff" opacity="0.72"/>
      <rect x="${x(hi)}" y="${BAR_TOP}" width="${x(BAR_MAX) - x(hi)}" height="${BAR_H}" fill="#fff" opacity="0.72"/>
      <rect x="${x(lo)}" y="${BAR_TOP - 1}" width="${x(hi) - x(lo)}" height="${BAR_H + 2}" fill="none" stroke="var(--ink)" stroke-width="2"/>
      ${markers}
      ${tick(400)}${tick(700)}
      ${label(350, 'UV')}${label(550, 'Visible to humans')}${label(750, 'IR')}
      ${locked ? '' : handle('lo', lo) + handle('hi', hi)}`;
    if (tipEnd && !locked) {
      svg.querySelector(`[data-end="${tipEnd}"]`).dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    }

    rangeOut.textContent = `${lo}–${hi} nm`;
    rangeOut.dataset.tip = lensText(settings, current.lensTip) + (locked ? ` ${LOCKED_TIP}` : '');
    svg.classList.toggle('is-locked', locked);
  }

  svg.addEventListener('pointerdown', e => {
    const handle = e.target.closest('[data-end]');
    if (!handle || !current || current.locked) return;
    e.preventDefault();
    drag = { end: handle.dataset.end, start: current.settings, last: null };
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener('pointermove', e => {
    if (!drag) return;
    const nm = Math.round(nmAt(e.clientX));
    if (nm === drag.last) return;
    drag.last = nm;
    onDrag(drag.end, nm, drag.start);
  });
  const stop = () => { drag = null; };
  svg.addEventListener('pointerup', stop);
  svg.addEventListener('pointercancel', stop);
  svg.addEventListener('keydown', e => {
    const handle = e.target.closest('[data-end]');
    const step = { ArrowLeft: -KEY_STEP, ArrowDown: -KEY_STEP, ArrowRight: KEY_STEP, ArrowUp: KEY_STEP }[e.key];
    if (!handle || !step || !current || current.locked) return;
    e.preventDefault();
    const end = handle.dataset.end;
    onDrag(end, visibleRange(current.settings.peaks, current.settings.lensCutoffNm, current.settings.uvLens)[end] + step, current.settings);
    svg.querySelector(`[data-end="${end}"]`)?.focus();
  });

  new ResizeObserver(draw).observe(svg);

  return {
    /** Redraw for these settings. `shown` is false for eyes that aren't made yet (the space stays). */
    update(settings, { shown, locked, lensTip, note: noteText }) {
      root.style.visibility = shown && settings.peaks ? '' : 'hidden';
      note.hidden = !noteText;
      note.textContent = noteText ?? '';
      if (!shown || !settings.peaks) return;
      current = { settings, locked, lensTip };
      draw();
    },
  };
}
