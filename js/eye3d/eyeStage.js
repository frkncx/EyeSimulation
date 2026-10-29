// The 3D view in the center: one eye, drag to rotate, scroll to zoom, a cut-away plane,
// plain-word labels, and a one-sentence explanation when you hover a part.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { escapeHtml } from '../ui/glossary.js';

const INNER_LABELS_FROM = 0.35; // cut-open amount at which labels for inside parts appear
const HIGHLIGHT = new THREE.Color(0x3a3a2a);
const FOV = 35; // the camera's angle top to bottom, in degrees, on a view wider than tall

export class EyeStage {
  constructor(container, parts, tooltip) {
    this.container = container;
    this.parts = parts;
    this.tooltip = tooltip;
    this.cut = 0;
    this.labelsOn = true;
    this.hovered = null;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.localClippingEnabled = true;
    this.renderer.setClearColor(0x0d0f14);
    container.append(this.renderer.domElement);

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.domElement.className = 'eye-labels';
    container.append(this.labelRenderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 1, 500);
    this.camera.position.set(0.62, 0.3, 0.72).multiplyScalar(62);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x30303a, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(30, 40, 50);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xb8c8ff, 0.8);
    fill.position.set(-40, -10, -30);
    this.scene.add(fill);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.minDistance = 28;
    this.controls.maxDistance = 140;

    // Keeps the half of the eye where x <= constant; sliding the constant to 0 cuts it in half.
    this.clip = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.dragging = false;

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.bindHover();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
    this.camera.aspect = w / h;
    // A view taller than wide (a phone held upright) widens its angle so the eye still fits side to side.
    this.camera.fov = 2 * THREE.MathUtils.radToDeg(Math.atan(Math.tan(THREE.MathUtils.degToRad(FOV / 2)) / Math.min(1, w / h)));
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  /** Replace the eye on screen with a freshly built one ({ group, anchors, radius }). */
  setEye(built) {
    if (this.eye) {
      this.scene.remove(this.eye.group);
      this.eye.group.traverse(o => {
        if (o.isMesh) {
          o.geometry.dispose();
          if (!o.material.map?.userData.shared) o.material.map?.dispose();
          o.material.dispose();
        }
      });
      for (const l of this.labels ?? []) l.object.element.remove();
    }
    this.eye = built;
    this.hovered = null;
    built.group.traverse(o => {
      if (!o.isMesh) return;
      o.material.clippingPlanes = [this.clip];
      o.userData.emissive = o.material.emissive.clone();
    });
    this.labels = built.anchors.map(a => {
      const el = document.createElement('div');
      el.className = `eye-label eye-label--${a.side}`;
      el.dataset.part = a.part;
      el.innerHTML = `<span class="eye-label-text">${escapeHtml(this.parts[a.part]?.label ?? a.part)}</span>`;
      const object = new CSS2DObject(el);
      object.position.copy(a.position);
      built.group.add(object);
      return { ...a, object };
    });
    this.scene.add(built.group);
    this.lastView = null;
    this.setCut(this.cut);
    // Check which new labels are hidden behind the eye before the first frame, so they don't flash up.
    built.group.updateMatrixWorld(true);
    this.updateOcclusion();
    this.dirty = true;
  }

  setCut(amount) {
    if (amount !== this.cut) this.dirty = true;
    this.cut = amount;
    const scale = this.eye?.scale ?? 1;
    const r = (this.eye?.radius ?? 12) + 1.5 * scale;
    this.clip.constant = r * (1 - amount);
    // Labels that sit on the cut edge move with it (the plane keeps x <= constant).
    // The plane is in world units; label positions are in the eye's own (unscaled) units.
    // A label waits until the cut shows a good slice of its part; a sliver would put it in the middle of the eye.
    const c = Math.max(0, this.clip.constant / scale - 0.05);
    for (const l of this.labels ?? []) {
      const on = l.onCut;
      if (!on) continue;
      if (on.ring != null) {
        l.cutHidden = c >= on.ring * 0.85;
        l.object.position.set(c, Math.sqrt(Math.max(0, on.ring ** 2 - c ** 2)), on.z);
      } else {
        l.cutHidden = c >= on.sphere * 0.85;
        const rho = Math.sqrt(Math.max(0, on.sphere ** 2 - c ** 2));
        const a = THREE.MathUtils.degToRad(on.angleDeg);
        l.object.position.set(c, rho * Math.sin(a), (on.z ?? 0) + rho * Math.cos(a));
      }
    }
  }

  setLabels(on) {
    if (on !== this.labelsOn) this.dirty = true;
    this.labelsOn = on;
  }

  // Draws only when something changed (the camera moved, a setting, a highlight), and not while hidden:
  // redrawing a still picture 60 times a second makes phones lag and run warm.
  frame() {
    const moving = this.controls.update();
    if (!(moving || this.dirty) || !this.container.clientWidth) return;
    this.dirty = false;
    // Re-check which labels are hidden behind the eye, a few times a second while things move.
    const view = this.camera.matrixWorld.elements.join() + this.cut + this.labelsOn;
    this.frameCount = (this.frameCount ?? 0) + 1;
    const moved = view !== this.lastView && this.frameCount % 4 === 0;
    if (moved) {
      this.lastView = view;
      this.updateOcclusion();
    } else if (view !== this.lastView) {
      this.dirty = true; // draw again until the labels are checked for the view the camera stopped at
    }
    const p = new THREE.Vector3();
    for (const l of this.labels ?? []) {
      l.object.getWorldPosition(p);
      const shown = l.inner ? this.cut >= INNER_LABELS_FROM && !l.cutHidden : !l.behind;
      l.object.visible = this.labelsOn && shown && this.clip.distanceToPoint(p) >= -0.1;
    }
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
    if (moved) this.declutter();
  }

  /** Nudge label names up or down, whichever is closer, until none overlaps another (each dot stays on its part). */
  declutter() {
    const texts = (this.labels ?? []).filter(l => l.object.visible).map(l => l.object.element.firstElementChild);
    for (const t of texts) t.style.transform = '';
    const boxes = texts.map(t => ({ t, r: t.getBoundingClientRect() })).sort((a, b) => a.r.top - b.r.top);
    const placed = [];
    const hits = (r, top) => placed.find(p => r.left < p.right && r.right > p.left && top < p.bottom + 2 && top + r.height > p.top - 2);
    const slide = (r, down) => {
      let top = r.top;
      for (let p = hits(r, top); p; p = hits(r, top)) top = down ? p.bottom + 2 : p.top - 2 - r.height;
      return top;
    };
    for (const { t, r } of boxes) {
      const down = slide(r, true);
      const up = slide(r, false);
      const top = r.top - up < down - r.top ? up : down;
      if (top !== r.top) t.style.transform = `translateY(${top - r.top}px)`;
      placed.push({ left: r.left, right: r.right, top, bottom: top + r.height });
    }
  }

  /**
   * An outside label is "behind" when a solid, not-cut-away part sits between it and the camera.
   * Inside labels are placed where the cut reveals them, so they skip this check.
   */
  updateOcclusion() {
    if (!this.eye) return;
    const from = this.camera.position;
    const to = new THREE.Vector3();
    const dir = new THREE.Vector3();
    for (const l of this.labels) {
      if (l.inner) continue;
      l.object.getWorldPosition(to);
      dir.subVectors(to, from);
      const dist = dir.length();
      this.raycaster.set(from, dir.normalize());
      this.raycaster.far = dist - 0.8 * this.eye.scale;
      l.behind = this.raycaster.intersectObject(this.eye.group, true).some(h =>
        h.object.userData.part !== l.part && !h.object.userData.hitArea &&
        !this.parts[h.object.userData.part]?.seeThrough &&
        this.clip.distanceToPoint(h.point) >= 0);
    }
    this.raycaster.far = Infinity;
  }

  /** The part under the pointer, ignoring anything cut away and looking through see-through parts. */
  partAt(clientX, clientY) {
    if (!this.eye) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.eye.group, true)
      .filter(h => h.object.userData.part && this.clip.distanceToPoint(h.point) >= 0);
    if (!hits.length) return null;
    const solid = hits.find(h => !this.parts[h.object.userData.part]?.seeThrough);
    return (solid ?? hits[0]).object;
  }

  bindHover() {
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', () => { this.dragging = true; this.showTip(null); });
    window.addEventListener('pointerup', () => { this.dragging = false; });
    el.addEventListener('pointermove', e => {
      if (this.dragging) return;
      const object = this.partAt(e.clientX, e.clientY);
      this.highlight(object);
      this.showTip(object?.userData.part ?? null, e.clientX, e.clientY);
    });
    el.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { this.highlight(null); this.showTip(null); } });
    // On touch screens there is no hovering: a short tap on a part (not a drag) shows what it is.
    let down = null;
    el.addEventListener('pointerdown', e => {
      down = e.pointerType === 'mouse' ? null : { x: e.clientX, y: e.clientY };
      if (down) this.highlight(null);
    });
    document.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse' && e.target !== el) this.highlight(null); });
    el.addEventListener('pointerup', e => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return;
      const object = this.partAt(e.clientX, e.clientY);
      this.highlight(object);
      this.showTip(object?.userData.part ?? null, e.clientX, e.clientY);
    });
    // Labels explain themselves too: on hover, or on a tap.
    this.labelRenderer.domElement.addEventListener('pointerover', e => {
      const label = e.pointerType === 'mouse' && e.target.closest('.eye-label');
      if (label) this.showTip(label.dataset.part, e.clientX, e.clientY);
    });
    this.labelRenderer.domElement.addEventListener('pointerout', e => {
      if (e.pointerType === 'mouse' && e.target.closest('.eye-label')) this.showTip(null);
    });
    this.labelRenderer.domElement.addEventListener('click', e => {
      const label = e.target.closest('.eye-label');
      if (label) this.showTip(label.dataset.part, e.clientX, e.clientY);
    });
  }

  highlight(object) {
    if (object === this.hovered) return;
    if (this.hovered) this.hovered.material.emissive.copy(this.hovered.userData.emissive);
    this.hovered = object;
    if (object) object.material.emissive.copy(object.userData.emissive).add(HIGHLIGHT);
    this.dirty = true;
    this.renderer.domElement.style.cursor = object ? 'help' : 'grab';
  }

  showTip(part, x = 0, y = 0) {
    const tip = this.tooltip;
    const info = part && this.parts[part];
    if (!info) {
      tip.hidden = true;
      return;
    }
    tip.innerHTML = `<strong>${escapeHtml(info.label)}</strong>: ${escapeHtml(info.tip)}`;
    tip.hidden = false;
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    tip.style.left = `${Math.max(12, Math.min(x + 16, window.innerWidth - w - 12))}px`;
    // Below the pointer, or above it when there's no room underneath.
    tip.style.top = `${y + 18 + h <= window.innerHeight - 8 ? y + 18 : Math.max(8, y - 12 - h)}px`;
  }
}
