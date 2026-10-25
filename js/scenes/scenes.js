// The six built-in scenes for "How it sees", painted with plain canvas shapes.
//
// Each scene is a few layers at different distances, far to near, so focus can blur some and not others.
// Layers draw in a 640×400 box (the caller scales it). `glow` draws light sources (street lamps, windows):
// they keep shining when the Light slider goes to night, while everything else darkens.
import { seeded, ellipse } from './paint.js';

export const SCENE_W = 640;
export const SCENE_H = 400;

const lampsOn = light => Math.max(0, Math.min(1, (0.65 - light) / 0.5));

function vertical(ctx, y0, y1, stops) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  return g;
}

function blob(ctx, x, y, rx, ry, color) {
  ctx.fillStyle = color;
  ellipse(ctx, x, y, rx, ry);
  ctx.fill();
}

function flower(ctx, x, y, r, petal, center, petals = 8) {
  ctx.fillStyle = petal;
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2;
    ellipse(ctx, x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, r * 0.55, r * 0.28, a);
    ctx.fill();
  }
  blob(ctx, x, y, r * 0.32, r * 0.32, center);
}

function stem(ctx, x0, y0, x1, y1, width, color = '#3f7d2c') {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo((x0 + x1) / 2 + 10, (y0 + y1) / 2, x1, y1);
  ctx.stroke();
}

const garden = {
  id: 'garden', label: 'Flower garden',
  layers: [
    { distanceM: 25, draw(ctx) {
      ctx.fillStyle = vertical(ctx, 0, 240, ['#7fb8ec', '#d6ebfa']);
      ctx.fillRect(0, 0, SCENE_W, 240);
      const rand = seeded(11);
      for (let x = -20; x < SCENE_W + 40; x += 34) {
        blob(ctx, x, 200 + rand() * 20, 40 + rand() * 20, 34 + rand() * 18, rand() < 0.5 ? '#4f7f3a' : '#5f9046');
      }
      ctx.fillStyle = vertical(ctx, 225, 400, ['#7ab653', '#4e8c33']);
      ctx.fillRect(0, 225, SCENE_W, 175);
    } },
    { distanceM: 4, draw(ctx) {
      blob(ctx, 330, 300, 360, 46, '#6b4a2e');
      const rand = seeded(23);
      const colors = ['#d8312c', '#f2c21b', '#e86aa8', '#f5f2ea', '#7a4fc0', '#f08a1e'];
      for (let i = 0; i < 150; i++) {
        const x = rand() * SCENE_W;
        const y = 262 + rand() * 70;
        const r = 4 + rand() * 4 + (y - 262) * 0.06;
        stem(ctx, x, y + r * 3, x, y, 1.5);
        flower(ctx, x, y, r, colors[Math.floor(rand() * colors.length)], '#f7d54a', 6);
      }
    } },
    { distanceM: 0.45, draw(ctx) {
      ctx.fillStyle = '#3f8a2f';
      for (const [x, y, a] of [[60, 380, -0.6], [150, 395, 0.5], [560, 390, 0.7], [470, 400, -0.4]]) {
        ellipse(ctx, x, y, 70, 22, a);
        ctx.fill();
      }
      stem(ctx, 120, 400, 120, 330, 8);
      flower(ctx, 120, 320, 70, '#f6c419', '#5a3418', 14);
      stem(ctx, 540, 400, 530, 350, 7);
      flower(ctx, 530, 345, 52, '#d42a22', '#1d1a18', 5);
    } },
  ],
};

const forest = {
  id: 'forest', label: 'Forest',
  layers: [
    { distanceM: 40, draw(ctx) {
      ctx.fillStyle = vertical(ctx, 0, 300, ['#dcebd2', '#a7c897']);
      ctx.fillRect(0, 0, SCENE_W, 300);
      const rand = seeded(5);
      ctx.fillStyle = '#9fb491';
      for (let i = 0; i < 26; i++) ctx.fillRect(rand() * SCENE_W, 0, 6 + rand() * 8, 300);
      ctx.fillStyle = vertical(ctx, 280, 400, ['#6f8445', '#4b5d2c']);
      ctx.fillRect(0, 280, SCENE_W, 120);
    } },
    { distanceM: 8, draw(ctx) {
      const rand = seeded(9);
      for (const x of [40, 170, 330, 470, 600]) {
        const w = 26 + rand() * 26;
        ctx.fillStyle = '#5a4330';
        ctx.fillRect(x - w / 2, 0, w, 330 + rand() * 30);
        ctx.fillStyle = '#6e5440';
        ctx.fillRect(x - w / 2 + 4, 0, 5, 330);
      }
      for (let x = -30; x < SCENE_W + 40; x += 46) blob(ctx, x, 20 + rand() * 30, 60, 46, rand() < 0.5 ? '#2f5a2a' : '#3a6a30');
      // A red mushroom on green moss: easy for most people, hard for red-green colorblind eyes.
      blob(ctx, 260, 352, 90, 18, '#4d7a2f');
      ctx.fillStyle = '#efe6d0';
      ctx.fillRect(252, 330, 16, 26);
      ctx.fillStyle = '#c8322a';
      ctx.beginPath();
      ctx.ellipse(260, 332, 30, 20, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#fff';
      for (const [x, y] of [[248, 322], [264, 318], [276, 327], [252, 330]]) blob(ctx, x, y, 3, 2.4, '#f6f2ea');
    } },
    { distanceM: 0.7, draw(ctx) {
      ctx.strokeStyle = '#3f8a3a';
      ctx.fillStyle = '#4a9a40';
      for (const [x0, y0, x1, y1] of [[0, 400, 180, 250], [640, 400, 470, 260], [40, 400, 260, 330]]) {
        stem(ctx, x0, y0, x1, y1, 4, '#3f7d2c');
        for (let t = 0.1; t < 1; t += 0.09) {
          const x = x0 + (x1 - x0) * t;
          const y = y0 + (y1 - y0) * t;
          const len = 34 * (1 - t * 0.7);
          ellipse(ctx, x - 6, y - len * 0.5, 6, len * 0.6, -0.5);
          ctx.fill();
          ellipse(ctx, x + 8, y + len * 0.2, 6, len * 0.6, 0.9);
          ctx.fill();
        }
      }
      stem(ctx, 420, 0, 520, 140, 5, '#5a4330');
      const rand = seeded(3);
      for (let i = 0; i < 14; i++) blob(ctx, 500 + rand() * 40, 120 + rand() * 40, 8, 8, '#c0182a');
    } },
  ],
};

const beach = {
  id: 'beach', label: 'Beach',
  layers: [
    { distanceM: Infinity, draw(ctx) {
      ctx.fillStyle = vertical(ctx, 0, 200, ['#5aa8e6', '#cfe9fb']);
      ctx.fillRect(0, 0, SCENE_W, 200);
      blob(ctx, 500, 70, 26, 26, '#fff8d8');
      ctx.fillStyle = vertical(ctx, 200, 290, ['#1f6fa8', '#45aac4']);
      ctx.fillRect(0, 200, SCENE_W, 90);
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 2;
      const rand = seeded(17);
      for (let i = 0; i < 30; i++) {
        const x = rand() * SCENE_W;
        const y = 210 + rand() * 70;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 20 + rand() * 30, y);
        ctx.stroke();
      }
    } },
    { distanceM: 10, draw(ctx) {
      ctx.fillStyle = vertical(ctx, 270, 400, ['#d9c08a', '#ecd8a6']);
      ctx.beginPath();
      ctx.moveTo(0, 290);
      ctx.quadraticCurveTo(320, 262, 640, 285);
      ctx.lineTo(640, 400);
      ctx.lineTo(0, 400);
      ctx.fill();
      ctx.fillStyle = '#f4f0e6';
      ctx.fillRect(176, 210, 6, 100);
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = i % 2 ? '#f4f0e6' : '#d8312c';
        ctx.beginPath();
        ctx.moveTo(179, 200);
        ctx.arc(179, 230, 80, Math.PI + (i * Math.PI) / 6, Math.PI + ((i + 1) * Math.PI) / 6);
        ctx.fill();
      }
      ctx.fillStyle = '#2a7fc4';
      ctx.fillRect(210, 316, 90, 30);
      ctx.fillStyle = '#f2d03a';
      ctx.fillRect(210, 326, 90, 8);
      blob(ctx, 380, 318, 14, 14, '#f08a1e');
    } },
    { distanceM: 0.8, draw(ctx) {
      ctx.fillStyle = '#e2763a';
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 ? 18 : 46;
        ctx.lineTo(520 + Math.cos(a) * r, 360 + Math.sin(a) * r);
      }
      ctx.fill();
      blob(ctx, 90, 375, 34, 22, '#f2e6d8');
      ctx.strokeStyle = '#d0b8a0';
      ctx.lineWidth = 2;
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(90, 395);
        ctx.lineTo(90 + i * 10, 356);
        ctx.stroke();
      }
      const rand = seeded(29);
      for (let i = 0; i < 12; i++) blob(ctx, 200 + rand() * 260, 370 + rand() * 30, 6 + rand() * 6, 4 + rand() * 4, '#9a8f84');
    } },
  ],
};

const underwater = {
  id: 'underwater', label: 'Underwater',
  layers: [
    { distanceM: 12, draw(ctx) {
      ctx.fillStyle = vertical(ctx, 0, 400, ['#3fa6cc', '#145a80', '#0b3350']);
      ctx.fillRect(0, 0, SCENE_W, 400);
      ctx.fillStyle = 'rgba(220,245,255,0.12)';
      for (const x of [80, 220, 380, 520]) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 40, 0);
        ctx.lineTo(x + 140, 400);
        ctx.lineTo(x + 60, 400);
        ctx.fill();
      }
      const rand = seeded(41);
      for (let x = -40; x < SCENE_W + 40; x += 60) blob(ctx, x, 390, 60, 40 + rand() * 30, '#123f5a');
    } },
    { distanceM: 3, draw(ctx) {
      ctx.lineCap = 'round';
      const rand = seeded(43);
      for (const [x, color] of [[90, '#e8743a'], [300, '#d9546a'], [560, '#f09a3a']]) {
        ctx.strokeStyle = color;
        for (let i = 0; i < 7; i++) {
          ctx.lineWidth = 7;
          ctx.beginPath();
          ctx.moveTo(x, 380);
          ctx.quadraticCurveTo(x + (rand() - 0.5) * 80, 330, x + (rand() - 0.5) * 120, 260 + rand() * 40);
          ctx.stroke();
        }
      }
      ctx.fillStyle = '#8a4bb0';
      ctx.beginPath();
      ctx.moveTo(430, 380);
      ctx.arc(430, 380, 80, Math.PI * 1.1, Math.PI * 1.9);
      ctx.fill();
      ctx.strokeStyle = '#3f9a5a';
      ctx.lineWidth = 5;
      for (const x of [200, 215, 380, 620]) {
        ctx.beginPath();
        ctx.moveTo(x, 400);
        ctx.bezierCurveTo(x + 20, 330, x - 20, 280, x + 10, 210);
        ctx.stroke();
      }
      for (let i = 0; i < 18; i++) {
        const x = 120 + rand() * 200;
        const y = 90 + rand() * 80;
        blob(ctx, x, y, 9, 4, '#c8d8e8');
        ctx.beginPath();
        ctx.moveTo(x - 8, y);
        ctx.lineTo(x - 14, y - 4);
        ctx.lineTo(x - 14, y + 4);
        ctx.fill();
      }
    } },
    { distanceM: 0.5, draw(ctx) {
      const x = 470;
      const y = 200;
      ctx.fillStyle = '#f07a1e';
      ellipse(ctx, x, y, 80, 46);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + 70, y);
      ctx.lineTo(x + 120, y - 34);
      ctx.lineTo(x + 120, y + 34);
      ctx.fill();
      ctx.save();
      ellipse(ctx, x, y, 80, 46);
      ctx.clip();
      ctx.fillStyle = '#f8f6f0';
      for (const dx of [-40, 5, 50]) ctx.fillRect(x + dx - 8, y - 46, 16, 92);
      ctx.restore();
      blob(ctx, x - 58, y - 8, 8, 8, '#111');
      ctx.strokeStyle = 'rgba(230,250,255,0.8)';
      ctx.lineWidth = 2;
      for (const [bx, by, r] of [[380, 120, 8], [392, 90, 6], [384, 60, 10], [400, 30, 5]]) {
        ctx.beginPath();
        ctx.arc(bx, by, r, 0, Math.PI * 2);
        ctx.stroke();
      }
    } },
  ],
};

const street = {
  id: 'street', label: 'Night street',
  layers: [
    { distanceM: 40,
      draw(ctx) {
        ctx.fillStyle = vertical(ctx, 0, 300, ['#8fb8e0', '#e2ecf4']);
        ctx.fillRect(0, 0, SCENE_W, 300);
        for (const b of BUILDINGS) {
          ctx.fillStyle = b.color;
          ctx.fillRect(b.x, b.y, b.w, 300 - b.y);
          ctx.fillStyle = '#a9b8c6';
          for (const win of b.windows) ctx.fillRect(win.x, win.y, 10, 14);
        }
        ctx.fillStyle = '#3e4045';
        ctx.fillRect(0, 300, SCENE_W, 100);
        ctx.fillStyle = '#8a8780';
        ctx.fillRect(0, 292, SCENE_W, 12);
        ctx.fillStyle = '#e8e4d8';
        for (let x = 10; x < SCENE_W; x += 70) ctx.fillRect(x, 350, 36, 5);
      },
      glow(ctx, light) {
        const on = lampsOn(light);
        if (!on) return;
        ctx.globalAlpha = on;
        ctx.fillStyle = '#ffd88a';
        for (const b of BUILDINGS) for (const win of b.windows) if (win.lit) ctx.fillRect(win.x, win.y, 10, 14);
        ctx.globalAlpha = 1;
      } },
    { distanceM: 10,
      draw(ctx) {
        ctx.fillStyle = '#2e3036';
        for (const x of LAMPS) {
          ctx.fillRect(x - 3, 130, 6, 180);
          ctx.fillRect(x - 14, 124, 28, 10);
        }
        ctx.fillStyle = '#b02c2c';
        ctx.fillRect(400, 300, 170, 36);
        ctx.fillRect(430, 276, 104, 28);
        ctx.fillStyle = '#9fc2d8';
        ctx.fillRect(440, 282, 38, 18);
        ctx.fillRect(486, 282, 38, 18);
        blob(ctx, 440, 338, 16, 16, '#18191c');
        blob(ctx, 530, 338, 16, 16, '#18191c');
        ctx.fillStyle = '#5a1010';
        ctx.fillRect(566, 306, 6, 10);
      },
      glow(ctx, light) {
        const on = lampsOn(light);
        if (!on) return;
        for (const x of LAMPS) {
          // A soft pool of lamplight on the ground, squashed into an oval.
          ctx.save();
          ctx.globalAlpha = on * 0.22;
          ctx.translate(x, 330);
          ctx.scale(1, 0.4);
          const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, 120);
          pool.addColorStop(0, '#ffe2a0');
          pool.addColorStop(1, 'rgba(255,226,160,0)');
          ctx.fillStyle = pool;
          ctx.fillRect(-120, -120, 240, 240);
          ctx.restore();
          ctx.globalAlpha = on;
          blob(ctx, x, 136, 12, 6, '#fff2c8');
        }
        ctx.fillStyle = '#ff2a1a';
        ctx.fillRect(566, 306, 6, 10);
        ctx.globalAlpha = 1;
      } },
    { distanceM: 1.5, draw(ctx) {
      ctx.fillStyle = '#26282c';
      ctx.fillRect(0, 352, SCENE_W, 8);
      ctx.fillRect(0, 384, SCENE_W, 8);
      for (let x = 20; x < SCENE_W; x += 90) ctx.fillRect(x, 340, 12, 60);
      ctx.fillStyle = '#2f7a3a';
      ctx.fillRect(56, 210, 70, 44);
      ctx.fillStyle = '#26282c';
      ctx.fillRect(86, 254, 10, 100);
      ctx.fillStyle = '#f4f0e6';
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.fillText('EXIT', 67, 240);
    } },
  ],
};

const BUILDINGS = (() => {
  const rand = seeded(61);
  const list = [];
  for (let x = 0; x < SCENE_W; ) {
    const w = 80 + rand() * 70;
    const y = 60 + rand() * 120;
    const windows = [];
    for (let wy = y + 14; wy < 270; wy += 28) {
      for (let wx = x + 12; wx < x + w - 18; wx += 22) windows.push({ x: wx, y: wy, lit: rand() < 0.4 });
    }
    list.push({ x, y, w, color: ['#6d6a72', '#8a7f74', '#5f6670', '#7c6a5e'][list.length % 4], windows });
    x += w + 4;
  }
  return list;
})();
const LAMPS = [120, 340, 610];

const fruit = {
  id: 'fruit', label: 'Fruit bowl',
  layers: [
    { distanceM: 2.5, draw(ctx) {
      ctx.fillStyle = vertical(ctx, 0, 280, ['#efe4cf', '#ddd0b6']);
      ctx.fillRect(0, 0, SCENE_W, 280);
      ctx.fillStyle = '#f5f2ea';
      ctx.fillRect(40, 30, 200, 170);
      ctx.fillStyle = vertical(ctx, 40, 190, ['#9cc8ee', '#d8ecf8']);
      ctx.fillRect(52, 42, 82, 146);
      ctx.fillRect(146, 42, 82, 146);
      ctx.fillStyle = vertical(ctx, 270, 400, ['#9a6a42', '#7a4f2e']);
      ctx.fillRect(0, 270, SCENE_W, 130);
    } },
    { distanceM: 0.55, draw(ctx) {
      blob(ctx, 330, 370, 200, 26, 'rgba(60,35,20,0.35)');
      const fruits = [
        [250, 290, 34, '#7cb83a'], [400, 286, 36, '#c8241e'], [320, 270, 36, '#f08a1e'],
        [200, 312, 32, '#c8241e'], [450, 314, 32, '#7cb83a'], [330, 312, 38, '#d0281e'],
      ];
      for (const [x, y, r, c] of fruits) {
        blob(ctx, x, y, r, r * 0.94, c);
        blob(ctx, x - r * 0.35, y - r * 0.4, r * 0.22, r * 0.14, 'rgba(255,255,255,0.45)');
      }
      ctx.strokeStyle = '#f2d03a';
      ctx.lineWidth = 22;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(300, 210, 110, Math.PI * 0.28, Math.PI * 0.62);
      ctx.stroke();
      const rand = seeded(71);
      for (let i = 0; i < 16; i++) blob(ctx, 470 + rand() * 50, 262 + rand() * 40, 10, 10, '#5a2a6a');
      ctx.fillStyle = vertical(ctx, 300, 380, ['#f4f2ec', '#cfcac0']);
      ctx.beginPath();
      ctx.moveTo(130, 320);
      ctx.quadraticCurveTo(330, 420, 530, 320);
      ctx.lineTo(530, 312);
      ctx.lineTo(130, 312);
      ctx.fill();
      blob(ctx, 330, 316, 200, 12, '#e8e4dc');
    } },
  ],
};

export const SCENES = [garden, forest, beach, underwater, street, fruit];

/** A picture the user loaded, cropped to fill the view, treated as far away. */
export function imageScene(image) {
  return {
    id: 'own', label: 'Your image',
    layers: [{ distanceM: Infinity, draw(ctx) {
      const k = Math.max(SCENE_W / image.width, SCENE_H / image.height);
      const w = image.width * k;
      const h = image.height * k;
      ctx.drawImage(image, (SCENE_W - w) / 2, (SCENE_H - h) / 2, w, h);
    } }],
  };
}

/** Paint a scene as a person with ordinary eyes would see it in daylight (for thumbnails). */
export function drawPlain(canvas, scene) {
  const ctx = canvas.getContext('2d');
  ctx.setTransform(canvas.width / SCENE_W, 0, 0, canvas.height / SCENE_H, 0, 0);
  for (const layer of scene.layers) layer.draw(ctx);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
