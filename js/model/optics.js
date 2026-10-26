// Focus math in diopters (1 / distance in meters), used by the scene view's blur.

export const REFRACTION_MAX_D = 4; // strongest myopia or hyperopia on the slider, in diopters
export const CYLINDER_MAX_D = 3; // strongest astigmatism on the Cylinder slider, in diopters

export const vergence = meters => (meters == null || !isFinite(meters) ? 0 : 1 / meters);

// How much a focusing error costs in finest readable gap, measured on people, not worked out from the blur
// circle: people read through more blur than its size suggests. Smith G. (1991), "Relation between spherical
// refractive error and visual acuity", Optometry and Vision Science 68(8):591-598: the finest gap through an
// error of E diopters with a pupil D mm wide is MAR = √(1 + (k·D·E)²) arcminutes, k typically 0.83 (0.55-1.33
// across the studies it drew on). As quoted by Rushton, Armstrong & Dunne, "The influence on unaided vision of
// age, pupil diameter and spherocylindrical refractive error", Aston University (publications.aston.ac.uk/26250).
// The blur circle itself is 3.44·D·E arcminutes across, about 4 times wider than k·D·E.
const SMITH_K = 0.83;

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

// How wide a cone of light one facet takes in (its acceptance angle), in radians: light spreading through the
// tiny lens (wavelength ÷ width, at 0.5 µm) plus the width of the sensors at its focus (about 0.75 ÷ width).
const ACCEPTANCE_UM = Math.hypot(0.5, 0.75);
export const facetAcceptance = (facets, eyeMm) => ACCEPTANCE_UM / facetWidthUm(facets, eyeMm);
