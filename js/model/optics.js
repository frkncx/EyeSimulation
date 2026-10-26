// Focus math in diopters (1 / distance in meters), used by the scene view's blur.
import { MEASURED } from './constants.js';

export const REFRACTION_MAX_D = 4; // strongest myopia or hyperopia on the slider, in diopters
export const CYLINDER_MAX_D = 3; // strongest astigmatism on the Cylinder slider, in diopters

export const vergence = meters => (meters == null || !isFinite(meters) ? 0 : 1 / meters);

// How much a focusing error costs in finest readable gap (Smith 1991; source and details in constants.js).
const { SMITH_K, ACCEPTANCE_UM } = MEASURED;

/** The gap, in arcminutes, that a focusing error of `diopters` through a `pupilMm` pupil adds (k·D·E, after Smith 1991). */
export function dioptersGapArcmin(diopters, pupilMm) {
  return SMITH_K * pupilMm * diopters;
}

/** The same for an object at `objectM` when the eye focuses at `focusM`. */
export function defocusGapArcmin(objectM, focusM, pupilMm) {
  return dioptersGapArcmin(Math.abs(vergence(objectM) - vergence(focusM)), pupilMm);
}

// --- Compound eyes ---
// The facets cover a half ball, packed like a honeycomb. Simplified, after Land & Nilsson, "Animal Eyes".

/** The angle between neighboring facets, in radians: half a ball (2π) shared out among `facets` hexagons. */
export const facetAngle = facets => Math.sqrt((4 * Math.PI) / (Math.sqrt(3) * facets));

/** One facet's width in micrometers, for a dome `eyeMm` across. */
export const facetWidthUm = (facets, eyeMm) => (eyeMm / 2) * 1000 * facetAngle(facets);

// How wide a cone of light one facet takes in (its acceptance angle), in radians (ACCEPTANCE_UM, in constants.js).
export const facetAcceptance = (facets, eyeMm) => ACCEPTANCE_UM / facetWidthUm(facets, eyeMm);
