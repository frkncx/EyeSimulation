// A mirror eye (bay scallop first), looking along +z. Light passes the cornea, a weak lens and both retinas,
// reaches a curved mirror at the back, and is reflected forward to focus near the front (distal) retina.
// Sizes from the bay scallop, Argopecten irradians (Speiser et al. 2016, Integr Comp Biol 56:796, table 1 and
// OCT measurements); drawn about 34 times life size (the eye is about 0.7 mm across).
import * as THREE from 'three';

const UNITS_PER_UM = 12 / 350; // the eye's half-width, 350 µm, drawn as 12 units
const u = um => um * UNITS_PER_UM;

// Measured (Speiser et al. 2016): eye 700 µm across, pupil 250 µm, cornea 23 µm thick, lens 215 µm thick and
// right behind the cornea, 136 µm from the lens's back to the mirror, both retinas together 102 µm thick, the
// lens's back and the retinas curved with a 337 µm radius, the mirror with 417 µm.
const HALF_WIDTH = u(350);
const PUPIL_R = u(125);
const CORNEA_FRONT = 6; // where the eye's front sits along the axis, in model units
const CORNEA_BACK = CORNEA_FRONT - u(23);
const LENS_BACK = CORNEA_FRONT - u(238);
const MIRROR = LENS_BACK - u(136);
const RETINA_R = u(337);
const MIRROR_R = u(417);
const RETINAS = u(102);
// Estimated (no measured value): the two retinas share the 102 µm equally; the mirror and the pigment layer
// are drawn this thick; the lens's front curvature and its width; the eye's outer shape (an oval as wide as
// measured, from the cornea's front to just behind the mirror).
const DISTAL_BACK = LENS_BACK - RETINAS / 2;
const PROXIMAL_BACK = LENS_BACK - RETINAS;
const MIRROR_THICK = 0.3;
const WALL_THICK = 0.8;
const LENS_FRONT_R = 15.8;
const LENS_EDGE_R = 9;
const BACK = MIRROR - MIRROR_THICK - WALL_THICK;
const CENTER_Z = (CORNEA_FRONT + BACK) / 2;
const FRONT_HALF = CORNEA_FRONT - CENTER_Z;
const BACK_HALF = CENTER_Z - BACK;

function material(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, side: THREE.DoubleSide, ...extra });
}

/** Lathe a profile of [distance from the axis, position along it] around the axis (+z forward). */
function lathe(points, segments = 96) {
  const geo = new THREE.LatheGeometry(points.map(([r, z]) => new THREE.Vector2(r, z)), segments);
  geo.rotateX(Math.PI / 2);
  return geo;
}

function mesh(part, geometry, mat) {
  const m = new THREE.Mesh(geometry, mat);
  m.userData.part = part;
  return m;
}

/** The eye's oval outline, shrunk by `inset`, from the front (a = 0) to the back (a = π). */
function oval(inset, from = 0, to = Math.PI, steps = 64) {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = from + ((to - from) * i) / steps;
    const half = a < Math.PI / 2 ? FRONT_HALF : BACK_HALF;
    return [Math.max(0, (HALF_WIDTH - inset) * Math.sin(a)), CENTER_Z + (half - inset) * Math.cos(a)];
  });
}

/** Whether a point is inside the eye's wall. */
function inside(r, z) {
  const half = (z > CENTER_Z ? FRONT_HALF : BACK_HALF) - WALL_THICK;
  return (r / (HALF_WIDTH - WALL_THICK)) ** 2 + ((z - CENTER_Z) / half) ** 2 < 1;
}

/** A surface curved around a center in front of it, `radius` wide, its middle at `vertex`, out to the wall. */
function bowl(vertex, radius) {
  const points = [];
  for (let r = 0; ; r += 0.05) {
    const z = vertex + radius - Math.sqrt(Math.max(0, radius ** 2 - r ** 2));
    if (!inside(r, z) || r >= radius) break;
    points.push([r, z]);
  }
  return points;
}

/** A layer between two such surfaces (front one first), closed at the wall. */
function layer(frontVertex, backVertex, radius) {
  return [...bowl(frontVertex, radius), ...bowl(backVertex, radius).reverse()];
}

/**
 * Build the eye. Returns { group, anchors, radius, scale }, like the other eyes. It has no settings yet,
 * and draws no light rays.
 */
export function buildMirrorEye({ eyeColor = '#2a6fb0' } = {}) {
  const group = new THREE.Group();

  // Cornea: the clear front of the oval, out to where the pigment layer starts.
  const corneaEnd = Math.asin(Math.min(1, (PUPIL_R * 1.8) / HALF_WIDTH));
  const cornea = mesh('mirrorCornea', lathe([...oval(0, 0, corneaEnd), ...oval(CORNEA_FRONT - CORNEA_BACK, 0, corneaEnd).reverse()]),
    material('#d6ecff', { transparent: true, opacity: 0.25, roughness: 0.1, depthWrite: false }));
  cornea.renderOrder = 2;
  group.add(cornea);

  // Pigment layer: the rest of the eye's dark outer wall.
  group.add(mesh('eyeWall', lathe([...oval(0, corneaEnd, Math.PI), ...oval(WALL_THICK, corneaEnd, Math.PI).reverse()]),
    material(eyeColor, { roughness: 0.5 })));

  // Iris: a dark ring behind the cornea, leaving the pupil open.
  const irisOuter = oval(WALL_THICK).find(([r]) => r >= PUPIL_R * 1.8) ?? [PUPIL_R * 1.8, CORNEA_BACK];
  group.add(mesh('mirrorIris', lathe([[PUPIL_R, CORNEA_BACK - 0.05], [irisOuter[0], irisOuter[1]]]), material('#1d1712', { roughness: 0.8 })));

  // Lens: clear and biconvex, its front against the cornea.
  const lensFront = Array.from({ length: 33 }, (_, i) => {
    const r = (LENS_EDGE_R * i) / 32;
    return [r, CORNEA_BACK - (LENS_FRONT_R - Math.sqrt(LENS_FRONT_R ** 2 - r ** 2))];
  });
  const lensBack = Array.from({ length: 33 }, (_, i) => {
    const r = (LENS_EDGE_R * (32 - i)) / 32;
    return [r, LENS_BACK + RETINA_R - Math.sqrt(RETINA_R ** 2 - r ** 2)];
  });
  const lens = mesh('mirrorLens', lathe([...lensFront, ...lensBack]),
    material('#eef6f8', { transparent: true, opacity: 0.45, roughness: 0.1, depthWrite: false }));
  lens.renderOrder = 1;
  group.add(lens);

  // The two retinas, one behind the other, curved around the lens's back.
  group.add(mesh('distalRetina', lathe(layer(LENS_BACK, DISTAL_BACK, RETINA_R)), material('#e9a58c', { roughness: 0.7 })));
  group.add(mesh('proximalRetina', lathe(layer(DISTAL_BACK, PROXIMAL_BACK, RETINA_R)), material('#c9796a', { roughness: 0.7 })));

  // The mirror: silvery, curved a little less than the retinas, behind a thin clear gap.
  group.add(mesh('eyeMirror', lathe(layer(MIRROR, MIRROR - MIRROR_THICK, MIRROR_R)),
    material('#dcebf0', { metalness: 0.4, roughness: 0.25 })));

  // The optic nerve, leaving the back of the eye.
  const nerve = mesh('scallopNerve', new THREE.CylinderGeometry(1.1, 1.1, 7, 16), material('#e6d3a8'));
  nerve.rotation.x = Math.PI / 2;
  nerve.position.z = BACK - 3.3;
  group.add(nerve);

  // Labels: outside ones on the surface; inside ones on the cut face (x = 0), shown once it opens.
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const at = (r, z) => v(0, r, z);
  const anchors = [
    { part: 'mirrorCornea', position: at(PUPIL_R * 0.9, CORNEA_FRONT - 0.15), side: 'right' },
    { part: 'mirrorIris', position: at(-PUPIL_R * 1.4, CORNEA_BACK + 0.1), side: 'left' },
    { part: 'eyeWall', position: at(HALF_WIDTH - 0.3, CENTER_Z - 2), side: 'right' },
    { part: 'scallopNerve', position: v(0, 0, BACK - 5), side: 'left' },
    { part: 'mirrorLens', position: at(3, (CORNEA_BACK + LENS_BACK) / 2), side: 'right', inner: true },
    { part: 'distalRetina', position: at(-2, LENS_BACK - RETINAS / 4 + 0.02), side: 'left', inner: true },
    { part: 'proximalRetina', position: at(2, DISTAL_BACK - RETINAS / 4 + 0.02), side: 'right', inner: true },
    { part: 'eyeMirror', position: at(-4, MIRROR + MIRROR_R - Math.sqrt(MIRROR_R ** 2 - 16) - MIRROR_THICK / 2), side: 'left', inner: true },
  ];
  return { group, anchors, radius: HALF_WIDTH, scale: 1 };
}
