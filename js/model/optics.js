// Focus math in diopters (1 / distance in meters), used by the scene view's blur.

// Real defocus at screen resolution is only a few pixels; we draw it larger so it's visible.
export const DEFOCUS_DISPLAY_GAIN = 4;

export const REFRACTION_MAX_D = 4; // strongest myopia or hyperopia on the slider, in diopters
export const CYLINDER_MAX_D = 3; // strongest astigmatism on the Cylinder slider, in diopters

export const vergence = meters => (meters == null || !isFinite(meters) ? 0 : 1 / meters);

/**
 * Blur-circle radius in screen pixels for an object at `objectM` when the eye focuses at `focusM`.
 * Geometric optics: angular blur diameter (radians) = pupil diameter (m) x defocus (diopters).
 */
export function defocusBlurPx(objectM, focusM, pupilMm, pxPerDeg) {
  return dioptersBlurPx(Math.abs(vergence(objectM) - vergence(focusM)), pupilMm, pxPerDeg);
}

/** Blur-circle radius in screen pixels for a focusing error of `diopters`. */
export function dioptersBlurPx(diopters, pupilMm, pxPerDeg) {
  const blurDiameterDeg = (pupilMm / 1000) * diopters * (180 / Math.PI);
  return 0.5 * blurDiameterDeg * pxPerDeg * DEFOCUS_DISPLAY_GAIN;
}

// --- Compound eyes ---
// The facets cover a half ball, packed like a honeycomb. Simplified, after Land & Nilsson, "Animal Eyes".

/** The angle between neighboring facets, in radians: half a ball (2π) shared out among `facets` hexagons. */
export const facetAngle = facets => Math.sqrt((4 * Math.PI) / (Math.sqrt(3) * facets));

/** One facet's width in micrometers, for a dome `eyeMm` across. */
export const facetWidthUm = (facets, eyeMm) => (eyeMm / 2) * 1000 * facetAngle(facets);

// How wide a cone of light one facet takes in (its acceptance angle), in radians: light spreading through the
// tiny lens (wavelength ÷ width, at 0.5 µm) plus the width of the sensors at its focus (about 0.75 ÷ width).
const ACCEPTANCE_UM = Math.hypot(0.5, 0.75);
export const facetAcceptance = (facets, eyeMm) => ACCEPTANCE_UM / facetWidthUm(facets, eyeMm);
