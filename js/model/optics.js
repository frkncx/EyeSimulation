// Focus math in diopters (1 / distance in meters), used by the scene view's blur.

// Real defocus at screen resolution is only a few pixels; we draw it larger so it's visible.
export const DEFOCUS_DISPLAY_GAIN = 4;

export const REFRACTION_MAX_D = 4; // strongest myopia or hyperopia on the slider, in diopters

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
