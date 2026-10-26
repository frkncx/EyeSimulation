// A camera-type eye (human first), built in millimeters with the eye looking along +z.
// Round parts are lathed from a 2D side profile: [distance from the axis, position along it].
import * as THREE from 'three';
import { rodsPerCone } from '../ui/settingsPanel.js';
import { bandReach } from '../model/spectrum.js';
import { CYLINDER_MAX_D } from '../model/optics.js';

const R = 12; // human eye: about 24 mm across
const AXIAL_STRETCH = 0.08; // eye length change at the strongest near- or farsightedness (drawn larger than life)
const CORNEA_OVAL = 0.6; // extra dome height, along the steep direction, at the strongest astigmatism
const LENS_SLIDE = 1.2; // how far a sliding lens moves from near to far focus (drawn larger than life)

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

// Tube eye (like an owl's): a wide back cup, then a tube that narrows to a large cornea, lens and iris.
// It saves the width a round eye would need around its middle.
const TUBE = { backR: 10.5, center: -1.5, rim: 7.2, limbusZ: 9.5, corneaR: 9, iris: 6.9, lens: 5.3, lensDepth: 1.15 };

/** Width and height of each pupil shape, relative to a round pupil of the same size. */
export const PUPIL_ASPECT = { round: [1, 1], slit: [0.35, 1.3], horizontal: [1.3, 0.4] };

/**
 * The widest this eye's pupil opens, in mm: the animal's measured widest (`darkPupilMm`, at its own eye size
 * `pupilRefEyeMm`), growing and shrinking with Eye size; never less than the daylight setting.
 */
export function widestPupilMm({ pupilMm, darkPupilMm, eyeSizeMm, pupilRefEyeMm }) {
  return Math.max(pupilMm, (darkPupilMm ?? pupilMm) * eyeSizeMm / (pupilRefEyeMm ?? eyeSizeMm));
}

/**
 * Width and height in mm of a `w` × `h` pupil that can't be longer than the widest the pupil opens: a hole in
 * the iris is never longer than the iris's widest opening. Past that it widens instead, keeping its area
 * (and so the light it lets in).
 */
export function fitPupil(w, h, widestMm) {
  if (h > widestMm) return [Math.min(widestMm, (w * h) / widestMm), widestMm];
  if (w > widestMm) return [widestMm, Math.min(widestMm, (w * h) / widestMm)];
  return [w, h];
}

/**
 * The daylight pupil's radii in model units (`scale` mm per unit). The model's iris is human-sized, so a pupil
 * wider than it is drawn just inside its edge.
 */
function pupilRadii(settings, scale, irisR) {
  const [ax, ay] = PUPIL_ASPECT[settings.pupilShape] ?? PUPIL_ASPECT.round;
  const [w, h] = fitPupil(settings.pupilMm * ax, settings.pupilMm * ay, widestPupilMm(settings));
  return [Math.min(w / 2 / scale, irisR - 0.4), Math.min(h / 2 / scale, irisR - 0.4)];
}

/** Iris: a disc with a pupil-shaped hole. Texture coordinates span the whole disc. */
function irisGeometry(rx, ry, irisR) {
  const shape = new THREE.Shape().absarc(0, 0, irisR, 0, Math.PI * 2, false);
  shape.holes.push(new THREE.Path().absellipse(0, 0, rx, ry, 0, Math.PI * 2, true));
  const geo = new THREE.ShapeGeometry(shape, 64);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / (2 * irisR) + 0.5, pos.getY(i) / (2 * irisR) + 0.5);
  return geo;
}

/**
 * The retina's light sensors, seen up close when the eye is cut open: small rods and larger cones,
 * mixed by `ratio` rods per cone.
 */
function retinaTexture(ratio) {
  const key = `retina/${Math.round(Math.log10(ratio) * 20)}`;
  if (textureCache.has(key)) return textureCache.get(key);
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#e08a6a';
  g.fillRect(0, 0, size, size);
  const coneShare = 1 / (1 + ratio);
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  const step = 8;
  for (let y = 0; y < size; y += step) {
    for (let x = 0; x < size; x += step) {
      const px = x + (y / step % 2 ? step / 2 : 0) + (rand() - 0.5) * 2;
      const py = y + step / 2 + (rand() - 0.5) * 2;
      const cone = rand() < coneShare;
      g.fillStyle = cone ? '#9c3b22' : '#f7c9ae';
      g.beginPath();
      g.arc(px % size, py, cone ? 3.4 : 1.7, 0, Math.PI * 2);
      g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(28, 8);
  tex.userData.shared = true;
  textureCache.set(key, tex);
  return tex;
}

function cylinderBetween(part, a, b, radius, mat) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const m = mesh(part, new THREE.CylinderGeometry(radius, radius, dir.length(), 16), mat);
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
 * Build the eye from its settings. The model is drawn at human size (24 mm) and scaled, so
 * millimeter values like the pupil are converted to model units first.
 * Returns { group, anchors, radius, scale }. Anchors are label points in the group's own
 * coordinates: { part, position, side: 'left' | 'right', inner: true if only seen when cut open }.
 */
export function buildCameraEye({
  eyeSizeMm = 24, pupilMm = 8, pupilShape = 'round', focus = 1, retina = 'away', tapetum = 'off', irisColor = '#6b4a2e',
  refraction = 0, astigmatism = 'off', cylinderD = 1.5, axisDeg = 180, eyeShape = 'round', rods = null,
  peaks = null, lensCutoffNm = null, uvLens = 'none', rays = { uv: false, ir: false }, lensFocus = 'shape',
  spots = [{ part: 'fovea' }], darkPupilMm, pupilRefEyeMm,
} = {}) {
  const reach = bandReach({ peaks, lensCutoffNm, uvLens });
  const group = new THREE.Group();
  const scale = eyeSizeMm / (2 * R);
  group.scale.setScalar(scale);
  // Nearsighted eyes are a little too long front to back, farsighted ones a little too short.
  group.scale.z *= 1 - AXIAL_STRETCH * refraction;
  const tube = eyeShape === 'tube';
  // The back of the eye is a ball of radius backR around (0, 0, cz); a round eye is all ball.
  const backR = tube ? TUBE.backR : R;
  const cz = tube ? TUBE.center : 0;
  const center = new THREE.Vector3(0, 0, cz);
  const rimR = tube ? TUBE.rim : 5.8; // where the cornea meets the white
  const irisR = tube ? TUBE.iris : IRIS_R;
  const [pupilRx, pupilRy] = pupilRadii({ pupilMm, pupilShape, darkPupilMm, eyeSizeMm, pupilRefEyeMm }, scale, irisR);
  const wiringInFront = retina === 'away';
  const hasTapetum = tapetum === 'on';

  // White of the eye: a shell about 0.45 mm thick, open at the front for the cornea.
  // A tube eye's white runs straight from the back cup to the cornea.
  const frontOpening = Math.PI - Math.asin(5.8 / R);
  const limbusZ = tube ? TUBE.limbusZ : -R * Math.cos(frontOpening);
  const sclera = tube
    ? [...arc(backR, 0, Math.PI / 2, 48, cz), [rimR, limbusZ], [rimR - 0.45, limbusZ], ...arc(backR - 0.45, Math.PI / 2, 0, 48, cz)]
    : [...arc(R, 0, frontOpening), ...arc(R - 0.45, frontOpening, 0)];
  group.add(mesh('sclera', lathe(sclera), material('#efe9dc', { roughness: 0.5 })));
  /** How far the inside of the tube wall is from the axis at `z`. */
  const tubeWall = z => backR - ((backR - rimR) * (z - cz)) / (limbusZ - cz) - 0.45;

  // Blood layer and retina line the inside, stopping before the front (a tube eye's line only its back cup).
  const lining = full => (tube ? Math.PI / 2 : full);
  group.add(mesh('choroid', lathe(arc(backR - 0.6, 0, lining(2.25), 60, cz)), material('#5a2e26')));
  // Up close, the retina shows its mix of rods and cones.
  // An eye that sees UV gets UV on its retina: a soft violet glow, while the UV rays are shown.
  const uvGlow = reach.uv && rays.uv ?{ emissive: '#8a4cff', emissiveIntensity: 0.14 } : {};
  const retinaMat = rods == null
    ? material('#e08a6a', { roughness: 0.7, ...uvGlow })
    : material('#ffffff', { roughness: 0.7, map: retinaTexture(rodsPerCone(rods)), ...uvGlow });
  // The retina ends a few mm short of the focus muscle (the ora serrata), about 7 mm behind the cornea's edge.
  group.add(mesh('retina', lathe(arc(backR - 0.85, 0, lining(2.0), 60, cz)), retinaMat));

  // Nerve wiring: in front of the light sensors (facing away from light) or behind them.
  const wiringR = wiringInFront ? backR - 1.05 : backR - 0.72;
  group.add(mesh('wiring', lathe(arc(wiringR, 0, lining(1.95), 60, cz)), material('#f4f1ea', {
    transparent: true, opacity: wiringInFront ? 0.3 : 0.9, depthWrite: false, roughness: 0.4,
  })));

  // Night reflector: a shiny patch over the upper back, where light from the ground lands.
  const tapetumDir = new THREE.Vector3(0, 0.45, -0.89).normalize();
  if (hasTapetum) {
    const cap = new THREE.SphereGeometry(backR - 0.95, 64, 16, 0, Math.PI * 2, 0, 0.85);
    cap.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tapetumDir));
    cap.translate(0, 0, cz);
    group.add(mesh('tapetum', cap, material('#8fd8b4', { metalness: 0.75, roughness: 0.25, emissive: '#16382a' })));
  }

  // Cornea: a clear dome, thicker at the edge than you'd guess, fused to the white at the rim.
  const corneaR = tube ? TUBE.corneaR : 7.8;
  const corneaCenter = limbusZ - Math.sqrt(corneaR ** 2 - rimR ** 2);
  const rim = Math.asin(rimR / corneaR);
  const cornea = [
    ...arc(corneaR, Math.PI, Math.PI - rim, 24, corneaCenter),
    ...arc(corneaR - 0.55, Math.PI - rim, Math.PI, 24, corneaCenter),
  ];
  const corneaGeo = lathe(cornea);
  if (astigmatism === 'on') {
    // Astigmatism: the dome bulges more in one direction, like a rugby ball. The steep direction is at a
    // right angle to the prescription axis, measured counterclockwise as seen facing the eye
    // (the viewer's right is +x). Axis 180 bulges top to bottom.
    const bulge = (CORNEA_OVAL * cylinderD) / CYLINDER_MAX_D;
    const steep = THREE.MathUtils.degToRad(axisDeg + 90);
    const [dx, dy] = [Math.cos(steep), Math.sin(steep)];
    const pos = corneaGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      const up = x * x + y * y > 1e-6 ? (x * dx + y * dy) ** 2 / (x * x + y * y) : 1;
      pos.setZ(i, limbusZ + (pos.getZ(i) - limbusZ) * (1 + bulge * up));
    }
    corneaGeo.computeVertexNormals();
  }
  const corneaMesh = mesh('cornea', corneaGeo, material('#d6ecff', {
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
  const iris = mesh('iris', irisGeometry(pupilRx, pupilRy, irisR), material('#ffffff', { map: textureCache.get(irisColor) }));
  iris.position.z = irisZ;
  group.add(iris);
  const pupilShapePath = new THREE.Shape().absellipse(0, 0, pupilRx, pupilRy, 0, Math.PI * 2, false);
  const pupil = mesh('pupil', new THREE.ShapeGeometry(pupilShapePath, 64), material(hasTapetum ? '#123322' : '#040404', {
    roughness: 1, emissive: hasTapetum ? '#4fa06a' : '#000000', emissiveIntensity: 0.9,
  }));
  pupil.position.z = irisZ - 0.05;
  group.add(pupil);

  // Lens: flatter at the front than at the back. Focusing near makes it rounder and thicker.
  // The iris rests on the lens front, so the front can bulge only up to the iris; the back takes the rest.
  // A tube eye's lens is bigger and thicker.
  // A hard round lens (`lensFocus: 'slide'`, the octopus) keeps its shape and moves instead: toward the retina
  // for far things, forward for near ones (Beer 1897, in Hanke & Kelber 2020).
  const depth = tube ? TUBE.lensDepth : 1;
  const near = 1 - focus;
  const slide = lensFocus === 'slide';
  const ballR = 4;
  // Where the focus muscle holds the lens (a sliding lens: the middle of its travel).
  const restZ = slide ? irisZ - ballR - 0.15 - LENS_SLIDE / 2 : irisZ - 2.3 * depth;
  const lensZ = slide ? irisZ - ballR - 0.15 - LENS_SLIDE * focus : restZ;
  const lensRadius = slide ? ballR : (tube ? TUBE.lens : 4.5) - 0.35 * near;
  const front = slide ? ballR : (1.6 + 0.55 * near) * depth;
  const back = slide ? ballR : (2.1 + 0.9 * near) * depth;
  const lens = [];
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI;
    lens.push([lensRadius * Math.sin(a), lensZ + (a < Math.PI / 2 ? front : back) * Math.cos(a)]);
  }
  // A UV-blocking lens is faintly yellow; one that lets UV through is clear.
  const lensTinted = uvLens === 'on' && !reach.uv;
  group.add(mesh('lens', lathe(lens), material(lensTinted ? '#f3e7b0' : '#eef5f7', {
    transparent: true, opacity: lensTinted ? 0.6 : 0.4, roughness: 0.15,
  })));

  // Vitreous gel: fills the eye from just behind the lens and focus muscle back to the retina.
  // Profile: up the inside of the wall, in toward the lens, then along the back of the lens to the axis.
  const gelR = backR - 1.15;
  const gelFrontZ = lensZ - 1.8;
  const lensBack = a => [lensRadius * Math.sin(a) * 1.02, lensZ + (back + 0.1) * Math.cos(a)];
  const gelWall = tube
    ? [...arc(gelR, 0, Math.PI / 2, 48, cz), [tubeWall(gelFrontZ) - 0.7, gelFrontZ]]
    : arc(gelR, 0, Math.acos(-gelFrontZ / gelR), 48);
  const gel = [
    ...gelWall,
    ...Array.from({ length: 25 }, (_, i) => lensBack(Math.PI - Math.asin(0.95) + (Math.asin(0.95) * i) / 24)),
  ];
  const gelMesh = mesh('vitreous', lathe(gel), material('#bfe3ef', {
    transparent: true, opacity: 0.12, roughness: 0.1, depthWrite: false,
  }));
  gelMesh.renderOrder = 1;
  group.add(gelMesh);

  // Focus muscle: a ring around the lens, joined to the eye wall.
  const muscleR = tube ? tubeWall(restZ) - 1.0 : 7.4;
  const muscle = mesh('focusMuscle', new THREE.TorusGeometry(muscleR, tube ? 0.9 : 1.1, 20, 128), material('#a85a4a'));
  muscle.position.z = restZ;
  muscle.scale.z = 1.6;
  group.add(muscle);

  const nerveMat = material('#e6d3a8');
  const nerveDir = new THREE.Vector3(-Math.sin(THREE.MathUtils.degToRad(15)), 0, -Math.cos(THREE.MathUtils.degToRad(15)));
  const onRetina = backR - 0.95;
  /** A point `r` out from the middle of the back cup, toward `dir`. */
  const fromCenter = (dir, r) => dir.clone().normalize().multiplyScalar(r).add(center);
  let nerveLabelAt;
  if (wiringInFront) {
    // The wiring gathers into one cable that pierces the retina: the blind spot.
    const nerve = mesh('opticNerve', new THREE.CylinderGeometry(1.5, 1.6, 14, 48), nerveMat);
    nerve.position.copy(fromCenter(nerveDir, backR - 0.85 + 7));
    nerve.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), nerveDir);
    group.add(nerve);
    const blindSpot = mesh('blindSpot', new THREE.CircleGeometry(1.0, 48), material('#f2d98a', { roughness: 0.8 }));
    blindSpot.position.copy(fromCenter(nerveDir, onRetina));
    blindSpot.lookAt(center);
    group.add(blindSpot);
    nerveLabelAt = fromCenter(nerveDir, backR + 11);
  } else {
    // The wiring is already behind the retina, so thin bundles leave all over the back: no hole.
    const meet = new THREE.Vector3(0, 0, cz - (backR + 8));
    // Each bundle leaves straight out from the wall, then bends to its own spot on the cable's rim,
    // so neighbors never cross.
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const tilt = THREE.MathUtils.degToRad(24);
      const out = new THREE.Vector3(Math.sin(tilt) * Math.cos(a), Math.sin(tilt) * Math.sin(a), -Math.cos(tilt));
      const start = fromCenter(out, backR - 0.3);
      const bend = fromCenter(out, backR + 2.2);
      const rim = meet.clone().add(new THREE.Vector3(Math.cos(a), Math.sin(a), 0).multiplyScalar(1.0));
      group.add(cylinderBetween('opticNerve', start, bend, 0.32, nerveMat));
      group.add(cylinderBetween('opticNerve', bend, rim, 0.32, nerveMat));
      const joint = mesh('opticNerve', new THREE.SphereGeometry(0.32, 16, 12), nerveMat);
      joint.position.copy(bend);
      group.add(joint);
    }
    group.add(cylinderBetween('opticNerve', meet, new THREE.Vector3(0, 0, cz - (backR + 16)), 1.4, nerveMat));
    nerveLabelAt = new THREE.Vector3(0, 0, cz - (backR + 14));
  }

  // The sharpest spots on the retina (`spots`): usually one fovea in the middle. `deg` moves one sideways along
  // the middle line, positive toward the temple (the optic disc is on the nose side), and `r` sets its size.
  // An eagle has a second, shallower fovea toward the temple.
  const spotAt = deg => fromCenter(new THREE.Vector3(Math.sin(THREE.MathUtils.degToRad(deg)), 0,
    -Math.cos(THREE.MathUtils.degToRad(deg))), onRetina);
  for (const spot of spots) {
    const m = mesh(spot.part, new THREE.CircleGeometry(spot.r ?? 0.6, 48), material('#8a2a1e'));
    m.position.copy(spotAt(spot.deg ?? 0));
    m.lookAt(center);
    group.add(m);
  }

  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  // Light rays through the pupil, when their button is on: violet UV ones stop at a UV-blocking lens, or
  // reach the retina; red IR ones always reach it. Rays no sensor catches are drawn faint.
  const rayStartZ = corneaCenter + corneaR + 6;
  const lensFrontZ = lensZ + front + 0.15;
  const ray = (part, angleDeg, color, throughLens, faint) => {
    const a = THREE.MathUtils.degToRad(angleDeg);
    const x = pupilRx * 0.55 * Math.cos(a);
    const y = pupilRy * 0.55 * Math.sin(a);
    const points = [v(x, y, rayStartZ), v(x, y, lensFrontZ)];
    if (throughLens) {
      // The lens bends the rays in toward the fovea.
      const ex = x * 0.2;
      const ey = y * 0.2;
      points.push(v(ex, ey, cz - Math.sqrt(onRetina ** 2 - ex ** 2 - ey ** 2) + 0.35));
    }
    group.add(rayArrow(part, points, color, faint));
  };
  // All rays sit on the half that stays when the eye is cut open (x ≤ 0), UV and IR taking turns.
  const uvThrough = reach.uv || uvLens !== 'on' || !lensCutoffNm;
  if (rays.uv) for (const a of [90, 150, 210]) ray('uvLight', a, '#8a4cff', uvThrough, !reach.uv);
  if (rays.ir) for (const a of [120, 180, 240]) ray('irLight', a, '#e0301e', true, !reach.ir);
  const anchors = [
    { part: 'cornea', position: v(0, rimR * 0.55, corneaCenter + corneaR - 0.6), side: 'right' },
    { part: 'iris', position: v(0, -(irisR - 1), irisZ + 0.05), side: 'left' },
    { part: 'pupil', position: v(0, 0.8, irisZ + 0.1), side: 'right' },
    { part: 'sclera', position: v(0, backR, cz - 3), side: 'right' },
    { part: 'opticNerve', position: nerveLabelAt, side: 'left' },
    { part: 'lens', position: v(0, 2.2, lensZ), side: 'right', inner: true },
    // These two follow the cut edge, where their cross-section shows.
    { part: 'focusMuscle', position: v(0, muscleR, restZ), side: 'left', inner: true, onCut: { ring: muscleR, z: restZ } },
    { part: 'choroid', position: v(0, 8.6, -7.6), side: 'left', inner: true, onCut: { sphere: backR - 0.6, angleDeg: tube ? 120 : 135, z: cz } },
    { part: 'vitreous', position: v(0, -2.7, -7.5), side: 'right', inner: true, onCut: { sphere: tube ? 7 : 8, angleDeg: 200, z: cz } },
    // Back inside wall, on the half that stays: visible through the cut.
    { part: 'retina', position: fromCenter(v(-0.35, -0.55, -0.76), onRetina), side: 'left', inner: true },
    { part: 'blindSpot', position: fromCenter(nerveDir, onRetina), side: 'left', inner: true },
    ...spots.map(spot => ({ part: spot.part, position: spotAt(spot.deg ?? 0), side: 'right', inner: true })),
    { part: 'wiring', position: v(0, 0, 0), side: 'right', inner: true, onCut: { sphere: wiringR, angleDeg: 215, z: cz } },
    { part: 'tapetum', position: fromCenter(v(-0.3, 0.35, -0.89), backR - 1), side: 'left', inner: true },
  ].filter(a => (a.part !== 'blindSpot' || wiringInFront) && (a.part !== 'tapetum' || hasTapetum));
  return { group, anchors, radius: R * scale, scale };
}
