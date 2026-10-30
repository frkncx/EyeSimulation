// A camera-type eye (human first), built in millimeters with the eye looking along +z.
// Round parts are lathed from a 2D side profile: [distance from the axis, position along it].
import * as THREE from 'three';
import { rodsPerCone } from '../ui/settingsPanel.js';
import { bandReach } from '../model/spectrum.js';
import { CYLINDER_MAX_D } from '../model/optics.js';
import { MEASURED, TUNING } from '../model/constants.js';

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

/** Width and height of each pupil shape, relative to a round pupil of the same size (in constants.js). */
export const { PUPIL_ASPECT } = TUNING;

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

// The pupil: a human one is about 4 mm in daylight (2–4 mm in sunshine) and opens to about 8 mm in the dark.
// How far each shape can close, as a share of its widest area (PUPIL_CLOSING, in constants.js).
const { PUPIL_CLOSING } = MEASURED;

/**
 * The pupil's width and height in mm at this light (0 = night, 1 = day), and its area and widest area in mm².
 * The Pupil setting is its size in daylight; as the light fades it opens steadily to its widest.
 * Its shape follows how open it is across its whole range: closed all the way, a slit or bar takes its own
 * shape; wide open, every pupil is round (a dilated cat's pupil is roughly circular, Hammond & Mouat 1985,
 * reviewed in Douglas 2018, Prog Retin Eye Res 66:17–48).
 */
export function pupilSizeMm(settings, light) {
  const [ax, ay] = PUPIL_ASPECT[settings.pupilShape] ?? PUPIL_ASPECT.round;
  const widestMm = widestPupilMm(settings);
  const maxArea = widestMm ** 2;
  const dayArea = Math.min(maxArea, settings.pupilMm ** 2 * ax * ay);
  const closing = PUPIL_CLOSING[settings.pupilShape] ?? PUPIL_CLOSING.round;
  // Opens evenly on a log scale as the light falls 10 000 times from day to night.
  const area = maxArea * Math.min(1, Math.max(closing, dayArea * (maxArea / dayArea) ** (1 - light) / maxArea));
  const opened = Math.log(area / maxArea / closing) / Math.log(1 / closing);
  const stretch = Math.sqrt(ax / ay) ** (1 - opened); // width ÷ height, square-rooted
  // A slit is no longer than the widest the pupil opens; past that it widens, keeping its area.
  const [w, h] = fitPupil(Math.sqrt(area) * stretch, Math.sqrt(area) / stretch, widestMm);
  return { w, h, area, maxArea };
}

/**
 * The daylight pupil's radii in model units (`scale` mm per unit). The model's iris is human-sized, so a pupil
 * wider than it is drawn just inside its edge.
 */
function pupilRadii(settings, scale, irisR) {
  const { w, h } = pupilSizeMm(settings, 1);
  return [Math.min(w / 2 / scale, irisR - 0.4), Math.min(h / 2 / scale, irisR - 0.4)];
}

/**
 * Iris: a ring from the pupil's edge out to the iris's edge. Its fibers always start at the pupil's edge, as in a
 * real iris, whatever the pupil's size and shape: the texture's fibered part (0.3 of its radius out to the edge)
 * is laid from the pupil's edge to the iris's edge.
 */
function irisGeometry(rx, ry, irisR) {
  const segments = 128;
  const rings = 8;
  const position = [];
  const uv = [];
  const index = [];
  for (let j = 0; j <= rings; j++) {
    const t = j / rings;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const [c, s] = [Math.cos(a), Math.sin(a)];
      position.push((rx + (irisR - rx) * t) * c, (ry + (irisR - ry) * t) * s, 0);
      const r = 0.3 + 0.7 * t;
      uv.push(0.5 + 0.5 * r * c, 0.5 + 0.5 * r * s);
    }
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * (segments + 1) + i;
      const b = a + segments + 1;
      index.push(a, b, a + 1, b, b + 1, a + 1); // facing forward (+z)
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setIndex(index);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
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

const RAY_HIT_R = 0.7; // model units (mm at human size): about a fingertip across on a phone

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
  // A ray is too thin to point at, so each part also gets a thicker, invisible copy that catches the pointer.
  // It shares the ray's material, so highlighting it lights up the whole ray.
  for (let i = 0; i < last; i++) {
    const hit = cylinderBetween(part, points[i], points[i + 1], RAY_HIT_R, mat);
    hit.visible = false;
    hit.userData.hitArea = true;
    ray.add(hit);
  }
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
  spots = [{ part: 'fovea' }], darkPupilMm, pupilRefEyeMm, blindSpot, pecten = null, drawZoom = 1, pitLens = false,
  side = null, marks = [],
} = {}) {
  const reach = bandReach({ peaks, lensCutoffNm, uvLens });
  // The eye is built with its temple side at +x and then mirrored, so it is a right eye (its optic disc on the
  // right as you face it), like the view, which shows the right eye. A person's own eye (`side`) is built with
  // its temple at -x instead (`sx`), so its temple side is the half that stays when cut open: a right eye is
  // then left as built, a left eye mirrored. Mirroring flips the astigmatism axis, so it is flipped first to
  // end up where it was measured.
  const sx = side ? -1 : 1;
  const mirrored = side !== 'right';
  if (mirrored) axisDeg = 180 - axisDeg;
  const group = new THREE.Group();
  const scale = eyeSizeMm / (2 * R);
  // A tiny eye (a spider's, 2 mm) is drawn `drawZoom` times larger than life, so it can be seen and cut open.
  const drawn = scale * drawZoom;
  group.scale.setScalar(drawn);
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
  // A night reflector doesn't light it here: eyeshine sends light back toward its source, so it only shows to a
  // viewer next to the light (a flash or headlights), and this scene's lights are not at the viewer.
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
  const pupil = mesh('pupil', new THREE.ShapeGeometry(pupilShapePath, 64), material('#040404', { roughness: 1 }));
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
  // A jumping spider (`pitLens`) has no lens behind the opening: its second lens is a small pit at the back of
  // the tube, just in front of the retina, that spreads the image out like a telephoto lens (Williams & McIntyre 1980).
  const pitR = 1.8;
  const pitZ = cz - (backR - 0.85) + 1.4;
  const lensShape = pitLens ? { r: pitR, z: pitZ, front: 0.35, back: 0.35 } : { r: lensRadius, z: lensZ, front, back };
  const lens = [];
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI;
    lens.push([lensShape.r * Math.sin(a), lensShape.z + (a < Math.PI / 2 ? lensShape.front : lensShape.back) * Math.cos(a)]);
  }
  // A UV-blocking lens is faintly yellow; one that lets UV through is clear.
  const lensTinted = uvLens === 'on' && !reach.uv;
  group.add(mesh('lens', lathe(lens), material(lensTinted ? '#f3e7b0' : '#eef5f7', {
    transparent: true, opacity: lensTinted ? 0.6 : 0.4, roughness: 0.15,
  })));

  // Vitreous gel: fills the eye from just behind the lens and focus muscle back to the retina.
  // Profile: up the inside of the wall, in toward the lens, then along the back of the lens to the axis
  // (with the lens at the back, straight across to the axis just behind the opening).
  const gelR = backR - 1.15;
  const gelFrontZ = pitLens ? irisZ - 0.6 : lensZ - 1.8;
  const lensBack = a => [lensRadius * Math.sin(a) * 1.02, lensZ + (back + 0.1) * Math.cos(a)];
  const gelWall = tube
    ? [...arc(gelR, 0, Math.PI / 2, 48, cz), [tubeWall(gelFrontZ) - 0.7, gelFrontZ]]
    : arc(gelR, 0, Math.acos(-gelFrontZ / gelR), 48);
  const gel = [
    ...gelWall,
    ...(pitLens ? [[0, gelFrontZ]]
      : Array.from({ length: 25 }, (_, i) => lensBack(Math.PI - Math.asin(0.95) + (Math.asin(0.95) * i) / 24))),
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
  const deg = THREE.MathUtils.degToRad;
  // A bird's optic disc sits where its blind spot data says (the field is mirrored on the retina: a blind spot
  // out to the side lies toward the nose, one above lies low on the retina); others keep the human place.
  const nerveDir = pecten && blindSpot
    ? new THREE.Vector3(-sx * Math.sin(deg(blindSpot.outDeg)), Math.sin(deg(blindSpot.downDeg)), -1).normalize()
    : new THREE.Vector3(-sx * Math.sin(deg(15)), 0, -Math.cos(deg(15)));
  const onRetina = backR - 0.95;
  /** A point `r` out from the middle of the back cup, toward `dir`. */
  const fromCenter = (dir, r) => dir.clone().normalize().multiplyScalar(r).add(center);
  /** `p` moved along its line from the middle of the back cup to `r` from it. */
  const toSphere = (p, r) => fromCenter(p.clone().sub(center), r);
  let nerveLabelAt;
  let pectenLabelAt;
  if (wiringInFront) {
    // The wiring gathers into one cable that pierces the retina: the blind spot.
    const nerve = mesh('opticNerve', new THREE.CylinderGeometry(1.5, 1.6, 14, 48), nerveMat);
    nerve.position.copy(fromCenter(nerveDir, backR - 0.85 + 7));
    nerve.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), nerveDir);
    group.add(nerve);
    const discMat = material('#f2d98a', { roughness: 0.8 });
    const disc = fromCenter(nerveDir, onRetina);
    if (!pecten) {
      const spot = mesh('blindSpot', new THREE.CircleGeometry(1.0, 48), discMat);
      spot.position.copy(disc);
      spot.lookAt(center);
      group.add(spot);
    } else {
      // A bird's disc is as big as its blind spot, curved to lie on the retina. Directions on it: `inward` toward
      // the middle of the eye, `along` its long side (up and down), `across` the other way.
      const inward = center.clone().sub(disc).normalize();
      const along = new THREE.Vector3(0, 1, 0).projectOnPlane(inward).normalize();
      const across = new THREE.Vector3().crossVectors(inward, along);
      const rx = onRetina * deg(blindSpot.wDeg / 2);
      const ry = onRetina * deg(blindSpot.hDeg / 2);
      const at = (a, l, up = 0) => disc.clone().addScaledVector(across, a).addScaledVector(along, l).addScaledVector(inward, up);
      const discGeo = new THREE.CircleGeometry(1, 48);
      const pos = discGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const p = toSphere(at(pos.getX(i) * rx, pos.getY(i) * ry), onRetina);
        pos.setXYZ(i, p.x, p.y, p.z);
      }
      discGeo.computeVertexNormals();
      group.add(mesh('blindSpot', discGeo, discMat));

      // The pecten: a dark, pleated comb of blood vessels standing on the disc, folded like a paper fan, its base
      // longer than its top. Most birds' pleats are joined along the top by a bridge; owls' are not.
      const height = pecten.heightMm / scale;
      const n = 2 * pecten.folds;
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const s = i / n - 0.5;
        const side = (i % 2 ? 1 : -1) * rx * 0.75;
        pts.push(toSphere(at(side, s * 2 * ry * 0.9), onRetina - 0.05), at(side, s * 2 * ry * 0.9 * 0.7, height));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const index = [];
      for (let i = 0; i < n; i++) index.push(2 * i, 2 * i + 2, 2 * i + 1, 2 * i + 1, 2 * i + 2, 2 * i + 3);
      geo.setIndex(index);
      geo.computeVertexNormals();
      const pectenMat = material('#3a1e18', { roughness: 0.75 });
      group.add(mesh('pecten', geo, pectenMat));
      const topEnd = ry * 0.9 * 0.7;
      if (pecten.bridge) group.add(cylinderBetween('pecten', at(0, -topEnd, height), at(0, topEnd, height), 0.15, pectenMat));
      pectenLabelAt = at(0, ry * 0.5, height);
    }
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
  const spotAt = deg => fromCenter(new THREE.Vector3(sx * Math.sin(THREE.MathUtils.degToRad(deg)), 0,
    -Math.cos(THREE.MathUtils.degToRad(deg))), onRetina);
  for (const spot of spots) {
    const m = mesh(spot.part, new THREE.CircleGeometry(spot.r ?? 0.6, 48), material('#8a2a1e'));
    m.position.copy(spotAt(spot.deg ?? 0));
    m.lookAt(center);
    group.add(m);
  }

  // Marks on a person's own retina (`marks`): each lies `eccDeg` from the middle of the back of the eye, `clockDeg`
  // around it (0 toward the temple, 90 up). A band (lattice) runs around the eye, a spot (a hole) is round, and a
  // ring is a circle of small spots around its middle (laser scars).
  const markAt = (eccDeg, clockDeg) => {
    const e = deg(eccDeg);
    const c = deg(clockDeg);
    return {
      dir: new THREE.Vector3(sx * Math.sin(e) * Math.cos(c), Math.sin(e) * Math.sin(c), -Math.cos(e)),
      around: new THREE.Vector3(-sx * Math.sin(c), Math.cos(c), 0), // along the circle, at this ecc
      out: new THREE.Vector3(sx * Math.cos(e) * Math.cos(c), Math.cos(e) * Math.sin(c), Math.sin(e)), // away from the middle
    };
  };
  const onMark = onRetina - 0.03;
  /** An oval patch on the retina around `at`, `a` radians along the circle and `b` away from the middle. */
  const patch = (part, at, a, b, color) => {
    const points = [fromCenter(at.dir, onMark)];
    for (let i = 0; i <= 32; i++) {
      const t = (i / 32) * Math.PI * 2;
      points.push(fromCenter(at.dir.clone().addScaledVector(at.around, a * Math.cos(t)).addScaledVector(at.out, b * Math.sin(t)), onMark));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    geo.setIndex(Array.from({ length: 32 }, (_, i) => [0, i + 1, i + 2]).flat());
    geo.computeVertexNormals();
    group.add(mesh(part, geo, material(color, { side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 })));
  };
  const markLabels = [];
  for (const m of marks) {
    const at = markAt(m.eccDeg, m.clockDeg);
    if (m.shape === 'band') patch(m.part, at, deg(m.lengthDeg / 2), deg(m.widthDeg / 2), m.color ?? '#d9d2bf');
    else if (m.shape === 'ring') {
      for (let i = 0; i < m.dots; i++) {
        const t = (i / m.dots) * Math.PI * 2;
        const dot = markAt(m.eccDeg + m.ringDeg * Math.sin(t), m.clockDeg + (m.ringDeg * Math.cos(t)) / Math.sin(deg(m.eccDeg)));
        patch(m.part, dot, deg(m.dotDeg / 2), deg(m.dotDeg / 2), m.color ?? '#4a3426');
      }
    } else patch(m.part, at, deg(m.sizeDeg / 2), deg(m.sizeDeg / 2), m.color ?? '#6e1610');
    const labelAt = m.shape === 'ring' ? markAt(m.eccDeg - m.ringDeg, m.clockDeg) : at;
    markLabels.push({ part: m.part, position: fromCenter(labelAt.dir, onMark), side: 'left', inner: true });
  }

  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  // Light rays through the pupil, when their button is on: violet UV ones stop at a UV-blocking lens, or
  // reach the retina; red IR ones always reach it. Rays no sensor catches are drawn faint.
  const rayStartZ = corneaCenter + corneaR + 6;
  // Rays bend where the focusing starts: at the lens, or for a spider at its front lens, just behind the opening.
  const lensFrontZ = pitLens ? irisZ - 0.2 : lensZ + front + 0.15;
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
    rayTails[part] ??= points[0].clone().lerp(points[1], 0.4);
  };
  const rayTails = {}; // a point on the first ray of each kind, outside the eye, for its label
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
    { part: 'lens', position: v(0, pitLens ? pitR * 0.7 : 2.2, pitLens ? pitZ : lensZ), side: 'right', inner: true },
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
    { part: 'pecten', position: pectenLabelAt, side: 'right', inner: true },
    ...markLabels,
    ...Object.entries(rayTails).map(([part, position]) => ({ part, position, side: 'left' })),
  ].filter(a => (a.part !== 'blindSpot' || wiringInFront) && (a.part !== 'tapetum' || hasTapetum) &&
    (a.part !== 'pecten' || pectenLabelAt));
  if (mirrored) {
    group.scale.x *= -1;
    for (const a of anchors) a.side = a.side === 'left' ? 'right' : 'left';
  }
  return { group, anchors, radius: R * drawn, scale: drawn, mirrored };
}
