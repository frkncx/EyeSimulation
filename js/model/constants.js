// Every number the sight pipeline works with, in two groups:
//   MEASURED  values from a source (named in the comment), or fixed by a standard or by physics
//   TUNING    display and tuning values, chosen so an effect shows; no source. "No source in code yet" marks
//             one that is meant to be real but has no source written down here.
// Unit conversions (60 arcminutes a degree, π, 2.355 for a gaussian's width), the sRGB and luma formulas,
// the published formulas in spectrum.js and colorVision.js (Govardovskii's pigment template, Ingling & Tsou's
// opponent stage), the spectrum bar's rules and the drawing mechanics stay where they are used.

export const MEASURED = {
  // Amblyopia: how much worse the eye's finest gap gets, as a logMAR (log10 of the gap in arcminutes, 0 = 20/20)
  // at each end of the Severity slider's three bands, which match the slider's Mild, Moderate and Severe labels.
  // The bands are PEDIG's (Pediatric Eye Disease Investigator Group) amblyopia treatment study grades: moderate
  // 20/40-20/100, severe 20/125-20/400 (PEDIG 2006, Ophthalmology; pmc.ncbi.nlm.nih.gov/articles/PMC1609192),
  // mild better than 20/40. Within a band the logMAR grows evenly with the slider.
  AMBLYOPIA_BANDS: [
    { from: 0, to: 0.34, logMar: [0, Math.log10(40 / 20)] }, // Mild: 20/20 up to 20/40
    { from: 0.34, to: 0.67, logMar: [Math.log10(40 / 20), Math.log10(100 / 20)] }, // Moderate: 20/40-20/100
    { from: 0.67, to: 1, logMar: [Math.log10(125 / 20), Math.log10(400 / 20)] }, // Severe: 20/125-20/400
  ],
  // The 20/20 standard: a 1-arcminute gap, 30 cycles per degree.
  HUMAN_CPD: 30,
  // An eye chart is read from 20 feet, about 6 m (the Snellen standard).
  CHART_M: 6,
  // Light spreading through the pupil (diffraction): about 2.3 arcminutes ÷ pupil width in mm
  // (physics: the Rayleigh limit 1.22·λ/D at 550 nm).
  DIFFRACTION_ARCMIN_MM: 2.3,
  // How much a focusing error costs in finest readable gap, measured on people, not worked out from the blur
  // circle: people read through more blur than its size suggests. Smith G. (1991), "Relation between spherical
  // refractive error and visual acuity", Optometry and Vision Science 68(8):591-598: the finest gap through an
  // error of E diopters with a pupil D mm wide is MAR = √(1 + (k·D·E)²) arcminutes, k typically 0.83 (0.55-1.33
  // across the studies it drew on). As quoted by Rushton, Armstrong & Dunne, "The influence on unaided vision of
  // age, pupil diameter and spherocylindrical refractive error", Aston University (publications.aston.ac.uk/26250).
  // The blur circle itself is 3.44·D·E arcminutes across, about 4 times wider than k·D·E.
  SMITH_K: 0.83,
  // How wide a cone of light one compound-eye facet takes in (its acceptance angle), in radians: light spreading
  // through the tiny lens (wavelength ÷ width, at 0.5 µm) plus the width of the sensors at its focus (about
  // 0.75 ÷ width). Simplified, after Land & Nilsson, "Animal Eyes".
  ACCEPTANCE_UM: Math.hypot(0.5, 0.75),
  // How much more light a dark-adapted superposition compound eye gathers than an apposition one, from optical
  // sensitivity: the hawkmoth Deilephila 69 µm² sr, 25 times the nocturnal bee Megalopta's 2.7 (Warrant 2017,
  // Phil Trans R Soc B 372:20160063); Megalopta's is 27 times a day bee's like the honeybee (Greiner, Ribi &
  // Warrant 2004, Cell Tissue Res 316:377). So 69 ÷ (2.7 ÷ 27), about 690, against the honeybee; the fly is
  // treated like the honeybee.
  SUPERPOSITION_GAIN: 69 / (2.7 / 27),
  // How far each pupil shape can close, as a share of its widest area: round about 1/15, a slit 1/135
  // (Banks et al. 2015), a horizontal slit about 0.15 (octopus). Only the slit's value has its source here.
  PUPIL_CLOSING: { round: 1 / 15, slit: 1 / 135, horizontal: 0.15 },
  // Water's refractive index (physics). The cornea's front surface bends light by (n_cornea − n_outside) ÷ radius;
  // underwater n_outside goes from air's 1 to water's, so it loses (WATER_INDEX − 1) ÷ radius: about 43 D for a
  // human 7.7 mm cornea (Gullstrand schematic eye), nearly all its power.
  WATER_INDEX: 1.333,
  // The eye's focal length (its posterior nodal distance) as a share of its length: 0.7 for a human (about
  // 16.7 mm in a 24 mm eye, Gullstrand schematic eye). Used for every eye without its own measured share
  // (focalShare in its defaults, with the source in its Pupil tip).
  FOCAL_SHARE: 0.7,
};

export const TUNING = {
  // --- The view ---
  // The view spans 60° across at 1× zoom.
  FIELD_DEG: 60,

  // --- Light ---
  // Light falls 10 000 times (4 powers of ten) from day to night on the Light slider.
  LIGHT_DECADES: 4,
  // The pupil size brightness, grain and infrared blur are measured against: 4 mm (a human's in daylight).
  REF_PUPIL_MM: 4,
  // ...in a 24 mm eye (a human's). How bright the image on the retina is depends on the pupil compared with the
  // eye's focal length, (pupil ÷ focal length)² (Hughes 1977; Land 1981), the same focal length as for the
  // f-number on the Pupil slider (FOCAL_SHARE of the eye's size, or the animal's own measured share).
  REF_EYE_MM: 24,
  // Brightness grows a little slower than pupil area.
  SENS_POWER: 0.6,
  // How much brighter a night reflector (tapetum) makes the view.
  TAPETUM_GAIN: 1.8,
  // How much of the light drop still shows after the eye adapts: 0 = fully adapted, 1 = not at all.
  // At 0.6 a night without light sources is about 0.4% of day brightness: close to black, so only lamps stand out.
  ADAPTATION: 0.6,
  // How the eye's own light adaptation cancels the daylight pupil's effect on brightness as the light falls.
  // The share cancelled is light ** DAY_ADAPTATION_POWER: all of it in full daylight (light 1), none at full
  // night (light 0). At 1 it fades evenly along the Light slider, which is a log scale of the light.
  DAY_ADAPTATION_POWER: 1,
  // Glare haze from a pupil opened wider than the eye is adapted to, per doubling of the light it lets in
  // (in full daylight; it fades with the adaptation).
  DILATION_GLARE: 0.15,
  // How bright lamps are compared with daylight, and how fast they gain on the scene as it darkens.
  GLOW_LEVEL: 0.0008,
  GLOW_POWER: 0.78,
  // Bright colors roll off softly above this linear level instead of clipping, into the room left above it.
  SHOULDER: { knee: 0.8, room: 0.2 },

  // --- Rods and cones ---
  // A human's rods per cone (no source in code yet): eyes are compared with it.
  HUMAN_RODS_PER_CONE: 20,
  // Night share (0 day, 1 night) over which rods take over sensitivity, and over which cone sharpness fades.
  ROD_TAKEOVER: [0.25, 0.7],
  CONE_DAY: [0.1, 0.4],
  // How much sensitivity extra rods add, and how much blurrier they make the night view: (rods ÷ human's) ** power.
  ROD_GAIN_POWER: 0.3,
  ROD_BLUR_POWER: 0.25,
  // Color lost in daylight, and how much sooner color fades at dusk, per power of ten more rods per cone than a human.
  CONE_FADE_PER_DECADE: 0.5,
  CONE_NIGHT_PER_DECADE: 0.2,
  // Night share over which color fades to grey as rods take over.
  COLOR_FADE: [0.45, 0.95],
  // How washed out a very rod-heavy eye looks in daylight, from 10^1.6 to 10^2.4 rods per cone.
  DAZZLE: 0.45,
  DAZZLE_RODS_LOG10: [1.6, 2.4],

  // --- Blur ---
  // Focus nearer than this (in diopters, 1 ÷ meters: 20 m) counts as focused at infinity.
  FAR_FOCUS_D: 0.05,
  // A gaussian blur this wide (its standard deviation) per arcminute of finest gap: at that width a grating of
  // that gap keeps about 5% of its contrast, near the limit of seeing it.
  SIGMA_PER_GAP: 0.78,
  // The view shows a 60° scene on a panel that covers only a few degrees of the viewer's own sight, so true-size
  // blur shrinks with it. Focus errors (Sphere, Cylinder, underwater), amblyopia and the detail lost by an eye
  // smaller than the animal's own are drawn this many times wider so they show; the Sharpness readout stays at
  // true size. The ordinary blur of things nearer or farther than where the eye looks is not a problem: true size.
  DEFOCUS_DISPLAY_GAIN: 4,
  // In the dark, rods pool their signals (a human at night: about 20/160): blur in pixels of the old 640-pixel view.
  NIGHT_BLUR_OLD_PX: 1.4,
  // A night reflector scatters light sideways a little: blur in pixels of the old view.
  TAPETUM_SCATTER_OLD_PX: 0.7,
  // Amblyopia: how far the brain turns this eye's contrast down at full strength (no source in code yet),
  // toward this middle grey (sRGB level).
  AMBLYOPIA_CONTRAST: 0.45,
  MID_GREY: 118,

  // --- Grain ---
  // Grain strength at daylight with a 4 mm pupil; below GRAIN_MIN none is drawn.
  GRAIN_LEVEL: 0.006,
  GRAIN_MIN: 0.01,
  // Grain strength in screen levels (0..255) at full grain on a white pixel.
  GRAIN_PX: 50,

  // --- Glare and haze ---
  // How far the glare haze spreads, in pixels of the old view.
  GLARE_BLUR_OLD_PX: 10,
  // A night reflector's glare: this much in daylight, plus this much more at full night.
  TAPETUM_GLARE: [0.25, 0.45],
  // The faint white veil every glare adds.
  GLARE_VEIL: 0.06,

  // --- Tube eye ---
  // How soft a tube eye's far corners go, in pixels of the old view, and where the softening and dimming start
  // and end (radii of the oval that just fits the view: 1 touches its edges); how dark the corners get.
  TUBE_EDGE_BLUR_OLD_PX: 6,
  TUBE_EDGE: { blurFrom: 0.95, blurTo: 1.4, dimFrom: 1, dimTo: 1.45, dim: 0.5 },

  // --- Blind spot ---
  // Where a human's blind spot falls, in degrees from the center: out to the side (toward the ear; negative is
  // toward the nose), down (negative is up), and its width and height: 15° out and a little below (no source in
  // code yet). An eye can set its own (`blindSpot` in its defaults).
  HUMAN_BLIND_SPOT: { outDeg: 15, downDeg: 1.5, wDeg: 5.5, hDeg: 7.5 },

  // --- UV and infrared (all simplified) ---
  // UV counts fully once the range reaches 320 nm, infrared once it reaches 790 nm.
  UV_FULL_NM: 320,
  IR_FULL_NM: 790,
  // Stand-in colors, in linear light: UV violet, infrared red-orange.
  UV_COLOR: [0.45, 0.05, 1],
  IR_COLOR: [1, 0.22, 0.08],
  UV_STRENGTH: 1.1,
  IR_STRENGTH: 0.5,
  // Extra blur on infrared at full reach with a 4 mm pupil, in pixels of the old view; pupils narrower than
  // IR_BLUR_MIN_PUPIL_MM count as that.
  IR_BLUR_OLD_PX: 2.4,
  IR_BLUR_MIN_PUPIL_MM: 0.5,
  // Body-heat noise in screen levels, soft and low-contrast; a cold-blooded animal makes this share of it.
  IR_NOISE_PX: 5,
  COLD_BLOODED_NOISE: 0.35,
  // A scene's rough UV and infrared picture from its colors: UV from brightness and blue; infrared from
  // brightness, leaves and grass (bright) and blue sky and water (dark). "Blue" is blue above this share of red and green.
  UV_BASE: { lum: 0.15, blue: 0.8 },
  IR_BASE: { lum: 0.55, leaf: 3.5, blue: 1.2 },
  BLUISH_OVER: 0.9,

  // --- Compound eye ---
  // Facet dots get a faint dark edge (this opacity) once they are this many pixels of the old view apart.
  MOSAIC_EDGE_OLD_PX: 10,
  MOSAIC_EDGE_ALPHA: 0.18,

  // --- Pupil shape ---
  // Width and height of each pupil shape, relative to a round pupil of the same size (no source in code yet).
  PUPIL_ASPECT: { round: [1, 1], slit: [0.35, 1.3], horizontal: [1.3, 0.4] },

  // --- Colors ---
  // A screen's red, green and blue as bands of light: [peak nm, width nm]. Fitted so that the human
  // and red-green deficiency results come out close to Machado et al. (2009).
  PRIMARIES: [[618, 23], [535, 49], [431, 19]],
  // How strongly a UV-blocking lens also dims blue light (it is slightly yellow).
  LENS_YELLOW: 0.7,
  // A human's sensor peaks in nm and lens cutoff (no source in code yet).
  HUMAN: { peaks: [420, 530, 560], lensCutoffNm: 400 },
  // Keeps a color channel's scale from collapsing: never far below the human's (a smooth floor, this soft,
  // so colors don't jump while a peak is dragged).
  FLOOR: 0.8,
  FLOOR_SOFT: 0.08,
  // A bluest sensor peaking below this (nm) is an ultraviolet sensor.
  UV_SENSOR_NM: 380,
  // Rods are most sensitive to blue-green light at this wavelength, nm (no source in code yet).
  ROD_PEAK: 498,
};
