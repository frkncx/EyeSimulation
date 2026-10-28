// A compound eye (fly first): a half ball covered in facets, looking along +z. Under each facet sits its own
// little eye: a light guide funneling light down a long thin bundle of sensors, with dark pigment between
// the tubes. Drawn much larger than life (a fly's eye is about 1 mm across).
import * as THREE from 'three';
import { bandReach } from '../model/spectrum.js';
import { facetAngle } from '../model/optics.js';

const R = 12; // the dome's outer radius in model units
const LENS_R = R; // facet lenses sit on the surface
const GUIDE_TOP = R - 0.25; // light guides run from just under the lens...
const GUIDE_BOTTOM = R - 1.6; // ...to the top of the sensors
const FLOOR_R = 4.5; // the eye floor, where the sensors end
const SENSOR_TOP = 7.2; // in a superposition eye the sensors start here, below the clear zone
const DRAWN_SIZE_MM = 1.1; // a fly's eye: drawn at the model's own size

function material(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, side: THREE.DoubleSide, ...extra });
}

function lathe(points, segments = 96) {
  const geo = new THREE.LatheGeometry(points.map(([r, z]) => new THREE.Vector2(r, z)), segments);
  geo.rotateX(Math.PI / 2);
  return geo;
}

/** Quarter circle of radius r from the front (on the axis) out to the rim (z = 0). */
const quarter = (r, steps = 48) => Array.from({ length: steps + 1 }, (_, i) => {
  const a = (i / steps) * (Math.PI / 2);
  return [r * Math.sin(a), r * Math.cos(a)];
});

/** `n` directions spread evenly over the front half ball (z ≥ 0), on a spiral: close to a honeycomb. */
function facetDirections(n) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: n }, (_, i) => {
    const z = 1 - (i + 0.5) / n;
    const rho = Math.sqrt(1 - z * z);
    const a = i * golden;
    return new THREE.Vector3(rho * Math.cos(a), rho * Math.sin(a), z);
  });
}

/** One instanced mesh of `geometry` (its axis along +y), placed along each direction between radii `from` and `to`. */
function along(part, dirs, geometry, mat, from, to) {
  const m = new THREE.InstancedMesh(geometry, mat, dirs.length);
  m.userData.part = part;
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();
  const matrix = new THREE.Matrix4();
  const one = new THREE.Vector3(1, 1, 1);
  dirs.forEach((d, i) => {
    q.setFromUnitVectors(up, d);
    matrix.compose(d.clone().multiplyScalar((from + to) / 2), q, one);
    m.setMatrixAt(i, matrix);
  });
  m.computeBoundingSphere();
  return m;
}

function mesh(part, geometry, mat) {
  const m = new THREE.Mesh(geometry, mat);
  m.userData.part = part;
  return m;
}

function cylinderBetween(part, a, b, radius, mat) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const m = mesh(part, new THREE.CylinderGeometry(radius, radius, dir.length(), 12), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

/** A light ray as an arrow through these points, with its head at the last one; `faint` when nothing sees it. */
function rayArrow(part, points, color, faint) {
  const mat = material(color, {
    emissive: color, emissiveIntensity: 0.7, roughness: 0.4, transparent: faint, opacity: faint ? 0.35 : 1,
  });
  const ray = new THREE.Group();
  const last = points.length - 1;
  const dir = new THREE.Vector3().subVectors(points[last], points[last - 1]).normalize();
  const neck = points[last].clone().addScaledVector(dir, -0.9);
  for (let i = 0; i < last; i++) ray.add(cylinderBetween(part, points[i], i === last - 1 ? neck : points[i + 1], 0.12, mat));
  const head = mesh(part, new THREE.ConeGeometry(0.32, 0.9, 16), mat);
  head.position.copy(neck).addScaledVector(dir, 0.45);
  head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  ray.add(head);
  return ray;
}

/**
 * Build the eye from its settings. Returns { group, anchors, radius, scale }, like the camera eye.
 * The dome grows a little with Eye size so the change shows, but stays drawn far larger than life.
 * A superposition eye is drawn as it works at night: its pigment pulled back around the cones, leaving a clear
 * zone between them and the sensors (in daylight the pigment fills it).
 */
export function buildCompoundEye({
  compoundKind = 'apposition', facets = 3500, facetEyeMm = DRAWN_SIZE_MM, eyeColor = '#8a2418',
  peaks = null, lensCutoffNm = null, uvLens = 'none', rays = { uv: false, ir: false },
} = {}) {
  const reach = bandReach({ peaks, lensCutoffNm, uvLens });
  const superposition = compoundKind === 'superposition';
  const part = (apposition, sup) => (superposition ? sup : apposition);
  const group = new THREE.Group();
  const scale = Math.min(1.5, Math.max(0.6, Math.sqrt(facetEyeMm / DRAWN_SIZE_MM)));
  group.scale.setScalar(scale);

  const dirs = facetDirections(facets);
  // Neighbors sit one facet angle apart on the dome.
  const gap = R * facetAngle(facets);
  // Where the sensors start: right under the light guides, or below the clear zone.
  const sensorTop = superposition ? SENSOR_TOP : GUIDE_BOTTOM;

  // Facets: shallow six-sided lenses, side by side over the dome. The color is the pigment showing through.
  const lens = new THREE.CylinderGeometry(gap * 0.6, gap * 0.6, 0.3, 6, 1);
  group.add(along(part('facet', 'superFacet'), dirs, lens, material(eyeColor, { roughness: 0.22, metalness: 0.15 }), LENS_R - 0.3, LENS_R));

  // Light guides: clear cones narrowing toward the sensors.
  const guide = new THREE.ConeGeometry(gap * 0.42, GUIDE_TOP - GUIDE_BOTTOM, 6, 1);
  guide.rotateX(Math.PI); // point down, toward the sensors
  group.add(along(part('lightGuide', 'superCone'), dirs, guide, material('#e9f3f5', { transparent: true, opacity: 0.75, roughness: 0.15 }),
    GUIDE_BOTTOM, GUIDE_TOP));

  // Sensors: one long thin bundle per facet, down to the eye floor; in a superposition eye shorter and thicker.
  // An eye that sees UV gets UV on its sensors: a soft violet glow, while the UV rays are shown.
  const uvGlow = reach.uv && rays.uv ? { emissive: '#8a4cff', emissiveIntensity: 0.25 } : {};
  const rodR = Math.max(0.03, gap * (superposition ? 0.2 : 0.12));
  const rod = new THREE.CylinderGeometry(rodR, rodR, sensorTop - FLOOR_R, 6, 1);
  group.add(along(part('facetSensors', 'superSensors'), dirs, rod, material('#e8907a', { roughness: 0.7, ...uvGlow }), FLOOR_R, sensorTop));

  // Dark pigment filling the space between the tubes, closed off at the rim; in a superposition eye only
  // around the cones.
  const pigmentFrom = superposition ? GUIDE_BOTTOM : FLOOR_R + 0.15;
  const pigmentShape = [...quarter(pigmentFrom), [GUIDE_TOP, 0], ...quarter(GUIDE_TOP).reverse()];
  const pigment = mesh(part('pigment', 'superPigment'), lathe(pigmentShape), material('#3a1610', {
    transparent: true, opacity: superposition ? 0.6 : 0.35, depthWrite: false, roughness: 0.9,
  }));
  pigment.renderOrder = 1;
  group.add(pigment);

  // The clear zone: a faint, see-through shell between the cones and the sensors.
  if (superposition) {
    const zone = mesh('clearZone', lathe([...quarter(SENSOR_TOP), [GUIDE_BOTTOM, 0], ...quarter(GUIDE_BOTTOM).reverse()]),
      material('#cfe8f0', { transparent: true, opacity: 0.12, depthWrite: false, roughness: 0.1 }));
    zone.renderOrder = 1;
    group.add(zone);
  }

  // The eye floor, and the nerves leaving it for the brain.
  const floor = mesh('eyeFloor', lathe([...quarter(FLOOR_R), ...quarter(FLOOR_R - 0.35).reverse()]), material('#d4bf8e'));
  group.add(floor);
  const nerveMat = material('#e6d3a8');
  const meet = new THREE.Vector3(0, 0, -6);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const tilt = THREE.MathUtils.degToRad(55);
    const out = new THREE.Vector3(Math.sin(tilt) * Math.cos(a), Math.sin(tilt) * Math.sin(a), Math.cos(tilt));
    const start = out.clone().multiplyScalar(FLOOR_R - 0.3);
    const rim = meet.clone().add(new THREE.Vector3(Math.cos(a), Math.sin(a), 0).multiplyScalar(0.9));
    group.add(cylinderBetween('nerveFibers', start, rim, 0.3, nerveMat));
  }
  group.add(cylinderBetween('nerveFibers', meet, new THREE.Vector3(0, 0, -14), 1.3, nerveMat));

  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  // Light rays, when their button is on: through a facet and down its sensors (no UV filter here).
  // All rays sit on the half that stays when the eye is cut open (x ≤ 0). Rays no sensor catches are drawn faint.
  const ray = (part, angleDeg, color, faint) => {
    const a = THREE.MathUtils.degToRad(angleDeg);
    const d = v(-Math.abs(Math.sin(a)) * 0.35 - 0.05, Math.cos(a) * 0.45, 0.8).normalize();
    group.add(rayArrow(part, [d.clone().multiplyScalar(R + 7), d.clone().multiplyScalar(sensorTop - 2)], color, faint));
  };
  if (rays.uv) for (const a of [30, 90, 150]) ray('uvLight', a, '#8a4cff', !reach.uv);
  if (rays.ir) for (const a of [60, 120, 180]) ray('irLight', a, '#e0301e', !reach.ir);

  // Labels: outside ones on the dome and the nerve; inside ones on the cut face (x = 0), shown once it opens.
  const onDome = (r, deg) => v(0, r * Math.sin(THREE.MathUtils.degToRad(deg)), r * Math.cos(THREE.MathUtils.degToRad(deg)));
  const anchors = superposition ? [
    { part: 'superFacet', position: onDome(R, 35), side: 'right' },
    { part: 'nerveFibers', position: v(0, 0, -12), side: 'left' },
    { part: 'superCone', position: onDome((GUIDE_TOP + GUIDE_BOTTOM) / 2, 60), side: 'right', inner: true },
    { part: 'clearZone', position: onDome((GUIDE_BOTTOM + SENSOR_TOP) / 2, 30), side: 'right', inner: true },
    { part: 'superSensors', position: onDome((SENSOR_TOP + FLOOR_R) / 2, 10), side: 'right', inner: true },
    { part: 'superPigment', position: onDome((GUIDE_TOP + GUIDE_BOTTOM) / 2, -40), side: 'left', inner: true },
    { part: 'eyeFloor', position: onDome(FLOOR_R, -70), side: 'left', inner: true },
  ] : [
    { part: 'facet', position: onDome(R, 35), side: 'right' },
    { part: 'nerveFibers', position: v(0, 0, -12), side: 'left' },
    { part: 'lightGuide', position: onDome((GUIDE_TOP + GUIDE_BOTTOM) / 2, 60), side: 'right', inner: true },
    { part: 'facetSensors', position: onDome((GUIDE_BOTTOM + FLOOR_R) / 2, 20), side: 'right', inner: true },
    { part: 'pigment', position: onDome((GUIDE_BOTTOM + FLOOR_R) / 2, -45), side: 'left', inner: true },
    { part: 'eyeFloor', position: onDome(FLOOR_R, -70), side: 'left', inner: true },
  ];
  return { group, anchors, radius: R * scale, scale };
}
