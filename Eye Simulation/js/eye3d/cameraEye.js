// A camera-type eye (human first), built in millimeters with the eye looking along +z.
// Round parts are lathed from a 2D side profile: [distance from the axis, position along it].
import * as THREE from 'three';

const R = 12; // human eye: about 24 mm across

/** Lathe a profile around the eye's axis (lathe works around y, so turn y into +z). */
function lathe(points, segments = 128) {
  const geo = new THREE.LatheGeometry(points.map(([r, z]) => new THREE.Vector2(r, z)), segments);
  geo.rotateX(Math.PI / 2);
  return geo;
}

/** Points on a circle of radius r around `center` on the axis; angle 0 = back of the eye. */
function arc(r, from, to, steps = 48, center = 0) {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = from + ((to - from) * i) / steps;
    return [Math.max(0, r * Math.sin(a)), center - r * Math.cos(a)];
  });
}

function material(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, side: THREE.DoubleSide, ...extra });
}

function irisTexture(color) {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const mid = size / 2;
  g.fillStyle = color;
  g.fillRect(0, 0, size, size);
  // Fine radial fibers, a darker outer rim and a lighter ring near the pupil.
  for (let i = 0; i < 220; i++) {
    const a = (i / 220) * Math.PI * 2;
    g.strokeStyle = i % 2 ? 'rgba(255,230,190,0.18)' : 'rgba(0,0,0,0.22)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(mid + Math.cos(a) * mid * 0.3, mid + Math.sin(a) * mid * 0.3);
    g.lineTo(mid + Math.cos(a) * mid, mid + Math.sin(a) * mid);
    g.stroke();
  }
  const rim = g.createRadialGradient(mid, mid, mid * 0.75, mid, mid, mid);
  rim.addColorStop(0, 'rgba(0,0,0,0)');
  rim.addColorStop(1, 'rgba(0,0,0,0.6)');
  g.fillStyle = rim;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function mesh(part, geometry, mat) {
  const m = new THREE.Mesh(geometry, mat);
  m.userData.part = part;
  return m;
}

const IRIS_R = 5.6;
const textureCache = new Map();

/** Width and height of each pupil shape, relative to a round pupil of the same size. */
export const PUPIL_ASPECT = { round: [1, 1], slit: [0.35, 1.3], horizontal: [1.3, 0.4] };

function pupilRadii(shape, r) {
  const [ax, ay] = PUPIL_ASPECT[shape] ?? PUPIL_ASPECT.round;
  return [Math.min(r * ax, IRIS_R - 0.4), Math.min(r * ay, IRIS_R - 0.4)];
}

/** Iris: a disc with a pupil-shaped hole. Texture coordinates span the whole disc. */
function irisGeometry(rx, ry) {
  const shape = new THREE.Shape().absarc(0, 0, IRIS_R, 0, Math.PI * 2, false);
  shape.holes.push(new THREE.Path().absellipse(0, 0, rx, ry, 0, Math.PI * 2, true));
  const geo = new THREE.ShapeGeometry(shape, 64);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / (2 * IRIS_R) + 0.5, pos.getY(i) / (2 * IRIS_R) + 0.5);
  return geo;
}

function cylinderBetween(part, a, b, radius, mat) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const m = mesh(part, new THREE.CylinderGeometry(radius, radius, dir.length(), 16), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

/**
 * Build the eye from its settings. The model is drawn at human size (24 mm) and scaled, so
 * millimeter values like the pupil are converted to model units first.
 * Returns { group, anchors, radius, scale }. Anchors are label points in the group's own
 * coordinates: { part, position, side: 'left' | 'right', inner: true if only seen when cut open }.
 */
export function buildCameraEye({
  eyeSizeMm = 24, pupilMm = 4, pupilShape = 'round', focus = 1, retina = 'away', tapetum = 'off', irisColor = '#6b4a2e',
} = {}) {
  const group = new THREE.Group();
  const scale = eyeSizeMm / (2 * R);
  group.scale.setScalar(scale);
  const [pupilRx, pupilRy] = pupilRadii(pupilShape, pupilMm / 2 / scale);
  const wiringInFront = retina === 'away';
  const hasTapetum = tapetum === 'on';

  // White of the eye: a shell about 0.45 mm thick, open at the front for the cornea.
  const frontOpening = Math.PI - Math.asin(5.8 / R);
  const sclera = [...arc(R, 0, frontOpening), ...arc(R - 0.45, frontOpening, 0)];
  group.add(mesh('sclera', lathe(sclera), material('#efe9dc', { roughness: 0.5 })));

  // Blood layer and retina line the inside, stopping before the front.
  group.add(mesh('choroid', lathe(arc(R - 0.6, 0, 2.25, 60)), material('#5a2e26')));
  group.add(mesh('retina', lathe(arc(R - 0.85, 0, 2.2, 60)), material('#e08a6a', { roughness: 0.7 })));

  // Nerve wiring: in front of the light sensors (facing away from light) or behind them.
  const wiringR = wiringInFront ? R - 1.05 : R - 0.72;
  group.add(mesh('wiring', lathe(arc(wiringR, 0, 2.15, 60)), material('#f4f1ea', {
    transparent: true, opacity: wiringInFront ? 0.3 : 0.9, depthWrite: false, roughness: 0.4,
  })));

  // Night reflector: a shiny patch over the upper back, where light from the ground lands.
  const tapetumDir = new THREE.Vector3(0, 0.45, -0.89).normalize();
  if (hasTapetum) {
    const cap = new THREE.SphereGeometry(R - 0.95, 64, 16, 0, Math.PI * 2, 0, 0.85);
    cap.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tapetumDir));
    group.add(mesh('tapetum', cap, material('#8fd8b4', { metalness: 0.75, roughness: 0.25, emissive: '#16382a' })));
  }

  // Cornea: a clear dome, thicker at the edge than you'd guess, fused to the white at the rim.
  const limbusZ = -R * Math.cos(frontOpening);
  const corneaR = 7.8;
  const corneaCenter = limbusZ - Math.sqrt(corneaR ** 2 - 5.8 ** 2);
  const rim = Math.asin(5.8 / corneaR);
  const cornea = [
    ...arc(corneaR, Math.PI, Math.PI - rim, 24, corneaCenter),
    ...arc(corneaR - 0.55, Math.PI - rim, Math.PI, 24, corneaCenter),
  ];
  const corneaMesh = mesh('cornea', lathe(cornea), material('#d6ecff', {
    transparent: true, opacity: 0.22, roughness: 0.05, depthWrite: false,
  }));
  corneaMesh.renderOrder = 2;
  group.add(corneaMesh);

  // Iris, with the pupil as a dark disc just behind it (the inside of a real eye is dark).
  // With a night reflector the pupil glows: that's eyeshine.
  const irisZ = limbusZ - 0.8;
  if (!textureCache.has(irisColor)) {
    const tex = irisTexture(irisColor);
    tex.userData.shared = true;
    textureCache.set(irisColor, tex);
  }
  const iris = mesh('iris', irisGeometry(pupilRx, pupilRy), material('#ffffff', { map: textureCache.get(irisColor) }));
  iris.position.z = irisZ;
  group.add(iris);
  const pupilShapePath = new THREE.Shape().absellipse(0, 0, pupilRx, pupilRy, 0, Math.PI * 2, false);
  const pupil = mesh('pupil', new THREE.ShapeGeometry(pupilShapePath, 64), material(hasTapetum ? '#123322' : '#040404', {
    roughness: 1, emissive: hasTapetum ? '#4fa06a' : '#000000', emissiveIntensity: 0.9,
  }));
  pupil.position.z = irisZ - 0.05;
  group.add(pupil);

  // Lens: flatter at the front than at the back. Focusing near makes it rounder and thicker.
  const lensZ = irisZ - 2.3;
  const near = 1 - focus;
  const lensRadius = 4.5 - 0.35 * near;
  const front = 1.6 + 1.1 * near;
  const back = 2.1 + 0.6 * near;
  const lens = [];
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI;
    lens.push([lensRadius * Math.sin(a), lensZ + (a < Math.PI / 2 ? front : back) * Math.cos(a)]);
  }
  group.add(mesh('lens', lathe(lens), material('#f3e7b0', { transparent: true, opacity: 0.6, roughness: 0.15 })));

  // Vitreous gel: fills the eye from just behind the lens and focus muscle back to the retina.
  // Profile: up the inside of the wall, in toward the lens, then along the back of the lens to the axis.
  const gelR = R - 1.15;
  const gelFrontZ = lensZ - 1.8;
  const lensBack = a => [lensRadius * Math.sin(a) * 1.02, lensZ + (back + 0.1) * Math.cos(a)];
  const gel = [
    ...arc(gelR, 0, Math.acos(-gelFrontZ / gelR), 48),
    ...Array.from({ length: 25 }, (_, i) => lensBack(Math.PI - Math.asin(0.95) + (Math.asin(0.95) * i) / 24)),
  ];
  const gelMesh = mesh('vitreous', lathe(gel), material('#bfe3ef', {
    transparent: true, opacity: 0.12, roughness: 0.1, depthWrite: false,
  }));
  gelMesh.renderOrder = 1;
  group.add(gelMesh);

  // Focus muscle: a ring around the lens, joined to the eye wall.
  const muscle = mesh('focusMuscle', new THREE.TorusGeometry(7.4, 1.1, 20, 128), material('#a85a4a'));
  muscle.position.z = lensZ;
  muscle.scale.z = 1.6;
  group.add(muscle);

  const nerveMat = material('#e6d3a8');
  const nerveDir = new THREE.Vector3(-Math.sin(THREE.MathUtils.degToRad(15)), 0, -Math.cos(THREE.MathUtils.degToRad(15)));
  const onRetina = R - 0.95;
  let nerveLabelAt;
  if (wiringInFront) {
    // The wiring gathers into one cable that pierces the retina: the blind spot.
    const nerve = mesh('opticNerve', new THREE.CylinderGeometry(1.5, 1.6, 14, 48), nerveMat);
    nerve.position.copy(nerveDir).multiplyScalar(R - 0.85 + 7);
    nerve.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), nerveDir);
    group.add(nerve);
    const blindSpot = mesh('blindSpot', new THREE.CircleGeometry(1.0, 48), material('#f2d98a', { roughness: 0.8 }));
    blindSpot.position.copy(nerveDir).multiplyScalar(onRetina);
    blindSpot.lookAt(0, 0, 0);
    group.add(blindSpot);
    nerveLabelAt = nerveDir.clone().multiplyScalar(R + 11);
  } else {
    // The wiring is already behind the retina, so thin bundles leave all over the back: no hole.
    const meet = new THREE.Vector3(0, 0, -(R + 8));
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const tilt = THREE.MathUtils.degToRad(i % 2 ? 16 : 28);
      const start = new THREE.Vector3(Math.sin(tilt) * Math.cos(a), Math.sin(tilt) * Math.sin(a), -Math.cos(tilt)).multiplyScalar(R - 0.3);
      group.add(cylinderBetween('opticNerve', start, meet, 0.32, nerveMat));
    }
    group.add(cylinderBetween('opticNerve', meet, new THREE.Vector3(0, 0, -(R + 16)), 1.4, nerveMat));
    nerveLabelAt = new THREE.Vector3(0, 0, -(R + 14));
  }

  const fovea = mesh('fovea', new THREE.CircleGeometry(0.6, 48), material('#8a2a1e'));
  fovea.position.set(0, 0, -onRetina);
  fovea.lookAt(0, 0, 0);
  group.add(fovea);

  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const anchors = [
    { part: 'cornea', position: v(0, 3.2, corneaCenter + corneaR - 0.6), side: 'right' },
    { part: 'iris', position: v(0, -4.6, irisZ + 0.05), side: 'left' },
    { part: 'pupil', position: v(0, 0.8, irisZ + 0.1), side: 'right' },
    { part: 'sclera', position: v(0, R, -3), side: 'right' },
    { part: 'opticNerve', position: nerveLabelAt, side: 'left' },
    { part: 'lens', position: v(0, 2.2, lensZ), side: 'right', inner: true },
    // These two follow the cut edge, where their cross-section shows.
    { part: 'focusMuscle', position: v(0, 7.4, lensZ), side: 'left', inner: true, onCut: { ring: 7.4, z: lensZ } },
    { part: 'choroid', position: v(0, 8.6, -7.6), side: 'left', inner: true, onCut: { sphere: R - 0.6, angleDeg: 135 } },
    { part: 'vitreous', position: v(0, -2.7, -7.5), side: 'right', inner: true, onCut: { sphere: 8, angleDeg: 200 } },
    // Back inside wall, on the half that stays: visible through the cut.
    { part: 'retina', position: new THREE.Vector3(-0.35, -0.55, -0.76).normalize().multiplyScalar(onRetina), side: 'left', inner: true },
    { part: 'blindSpot', position: nerveDir.clone().multiplyScalar(onRetina), side: 'left', inner: true },
    { part: 'fovea', position: v(0, 0, -onRetina), side: 'right', inner: true },
    { part: 'wiring', position: v(0, 0, 0), side: 'right', inner: true, onCut: { sphere: wiringR, angleDeg: 215 } },
    { part: 'tapetum', position: new THREE.Vector3(-0.3, 0.35, -0.89).normalize().multiplyScalar(R - 1), side: 'left', inner: true },
  ].filter(a => (a.part !== 'blindSpot' || wiringInFront) && (a.part !== 'tapetum' || hasTapetum));
  return { group, anchors, radius: R * scale, scale };
}
