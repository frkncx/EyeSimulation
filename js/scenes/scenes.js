// The seven built-in scenes for "How it sees", painted with plain canvas shapes.
//
// Each scene is a few layers at different distances, far to near, so focus can blur some and not others.
// Layers draw in a 640×400 box (the caller scales it). `glow` draws light sources (street lamps, windows):
// they keep shining when the Light slider goes to night, while everything else darkens.
//
// Ultraviolet and near-infrared: the renderer works out a rough base from each layer's colors (leaves and
// grass bright in infrared, sky and water dark; most things dark in UV, sky a little bright). A layer's
// `uv` draws hand-painted UV patterns on top, in grey (white = reflects a lot of UV).
// A scene can set `uvLevel` (how strong its UV is) and `noIr` (no infrared at all).
import { seeded, ellipse } from './paint.js';
import { EARTH_RINGS } from './earthOutlines.js';

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

/**
 * A flower's UV pattern, the "nectar guide": petal tips reflect UV, the middle soaks it up,
 * so a UV-seeing insect sees a dark bullseye pointing to the nectar.
 */
function uvFlower(ctx, x, y, r, petals) {
  flower(ctx, x, y, r, '#b4b4b4', '#080808', petals);
  blob(ctx, x, y, r * 0.62, r * 0.62, '#181818');
  blob(ctx, x, y, r * 0.32, r * 0.32, '#080808');
}

const WING = [[-1, -1, 1, 0.75, -0.5], [1, -1, 1, 0.75, 0.5], [-1, 0.55, 0.6, 0.45, 0.4], [1, 0.55, 0.6, 0.45, -0.4]];
/** A butterfly seen from above, `s` across one wing. */
function butterfly(ctx, x, y, s, wing, edge) {
  for (const [dx, dy, rx, ry, a] of WING) {
    ctx.fillStyle = edge;
    ellipse(ctx, x + dx * s * 0.75, y + dy * s * 0.5, rx * s * 0.85, ry * s * 0.85, a);
    ctx.fill();
    ctx.fillStyle = wing;
    ellipse(ctx, x + dx * s * 0.7, y + dy * s * 0.45, rx * s * 0.62, ry * s * 0.62, a);
    ctx.fill();
  }
  blob(ctx, x, y, s * 0.12, s * 0.7, '#1d1a18');
}

/** The butterfly's UV markings: bright patches on the wings that people can't see. */
function uvButterfly(ctx, x, y, s) {
  butterfly(ctx, x, y, s, '#202020', '#101010');
  for (const [dx, dy] of [[-1, -1], [1, -1]]) blob(ctx, x + dx * s * 0.72, y + dy * s * 0.5, s * 0.34, s * 0.26, '#f0f0f0');
}

// The garden's flower bed, so its colors and its UV patterns come from the same flowers.
function flowerBed(ctx, paint) {
  const rand = seeded(23);
  const colors = ['#d8312c', '#f2c21b', '#e86aa8', '#f5f2ea', '#7a4fc0', '#f08a1e'];
  for (let i = 0; i < 150; i++) {
    const x = rand() * SCENE_W;
    const y = 262 + rand() * 70;
    const r = 4 + rand() * 4 + (y - 262) * 0.06;
    paint(x, y, r, colors[Math.floor(rand() * colors.length)]);
  }
}
const BUTTERFLIES = [[430, 232, 13], [205, 246, 10]];

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
      flowerBed(ctx, (x, y, r, color) => {
        stem(ctx, x, y + r * 3, x, y, 1.5);
        flower(ctx, x, y, r, color, '#f7d54a', 6);
      });
      for (const [x, y, s] of BUTTERFLIES) butterfly(ctx, x, y, s, '#f08a1e', '#2a1a10');
    },
    uv(ctx) {
      flowerBed(ctx, (x, y, r) => uvFlower(ctx, x, y, r, 6));
      for (const [x, y, s] of BUTTERFLIES) uvButterfly(ctx, x, y, s);
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
    },
    uv(ctx) {
      uvFlower(ctx, 120, 320, 70, 14);
      uvFlower(ctx, 530, 345, 52, 5);
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
  // Water soaks up near-infrared within about the first meter, and much of the UV.
  noIr: true, uvLevel: 0.35,
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

// Earth, the whole sunlit side, seen from far out (as from DSCOVR, 1.5 million km away) in late August, over Africa
// and Europe. The sun is behind the viewer, so the middle of the globe is lit straight on and the edge only at a slant.
// Coastlines come from earthOutlines.js. Ground colors were picked from NASA's Blue Marble Next Generation map for
// August 2004 (used only as a reference) and brightened 1.3 times, about as the ground looks through the air.
const EARTH = { lon: 15, lat: 10, x: 320, y: 200, r: 172 };
const RAD = Math.PI / 180;
/** Where a point on the globe lands in the scene, and how squashed a small patch there is (1 in the middle). */
function globe(lon, lat) {
  const p = lat * RAD, d = (lon - EARTH.lon) * RAD, p0 = EARTH.lat * RAD;
  let x = Math.cos(p) * Math.sin(d);
  let y = Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(d);
  const facing = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(d);
  // A point on the far side is pulled onto the edge, so outlines that go round the back stay closed.
  if (facing < 0) {
    const k = Math.hypot(x, y);
    x /= k;
    y /= k;
  }
  return [EARTH.x + EARTH.r * x, EARTH.y - EARTH.r * y, facing];
}
function globePath(ctx, points) {
  for (let i = 0; i < points.length; i += 2) ctx[i ? 'lineTo' : 'moveTo'](...globe(points[i], points[i + 1]));
  ctx.closePath();
}
const EARTH_PX_PER_DEG = EARTH.r * RAD;
/** Round off a closed outline's corners (Chaikin's method), so the traced grid's steps don't show. */
function rounded(points, times = 2) {
  let p = points;
  for (let t = 0; t < times; t++) {
    const out = [];
    for (let i = 0; i < p.length; i += 2) {
      const j = (i + 2) % p.length;
      out.push(0.75 * p[i] + 0.25 * p[j], 0.75 * p[i + 1] + 0.25 * p[j + 1], 0.25 * p[i] + 0.75 * p[j], 0.25 * p[i + 1] + 0.75 * p[j + 1]);
    }
    p = out;
  }
  return p;
}
const COASTS = EARTH_RINGS.map(ring => rounded(ring));

// Ground cover, painted over the land in this order with soft edges. [color, outline as lon, lat pairs].
const COVER = [
  // Africa
  ['#ebc28c', [-17, 21, -12, 28, -9, 30, -2, 33, 8, 33, 11, 32, 20, 30, 30, 31, 33, 29, 35, 24, 37, 19, 34, 17, 25, 16, 15, 16, 5, 17, -5, 17, -12, 17, -16, 17]],
  ['#b4a06a', [-17, 13, -16, 17, 0, 17, 15, 16, 25, 16, 35, 16, 38, 13, 30, 12, 15, 12, 0, 13, -10, 12]],
  ['#3c531d', [-17, 9, -17, 13, 0, 12, 15, 11, 30, 11, 36, 9, 34, 5, 25, 5, 10, 7, 0, 8, -10, 8]],
  ['#243511', [-13, 9, -8, 8, 0, 7, 5, 7, 9, 6, 15, 5, 25, 5, 31, 3, 30, -5, 25, -6, 17, -5, 13, -5, 9, -2, 9, 4, 3, 6, -5, 5, -8, 4.5, -12, 7]],
  ['#806942', [33, 5, 38, 10, 43, 12, 51, 11, 42, 0, 39, -5, 35, -8, 33, -3]],
  ['#a58c63', [41, 12, 51, 12, 48, 4, 42, -1, 40, 3]],
  ['#584b2e', [12, -6, 30, -6, 40, -8, 40, -17, 33, -20, 24, -18, 13, -17]],
  ['#c19767', [13, -18, 24, -17, 28, -22, 27, -27, 22, -30, 17, -30, 14, -25]],
  ['#655133', [31, -20, 35, -22, 33, -28, 30, -31, 28, -30, 30, -24]],
  ['#a78a62', [18, -30, 25, -30, 27, -32, 22, -34, 18, -33]],
  ['#9a8458', [-10, 30, -9, 34, -2, 35.5, 10, 37, 11, 34, 0, 33, -5, 31]],
  ['#3f4a22', [47.5, -14, 50, -15.5, 48.5, -21, 47, -25, 46.5, -21, 48, -16]],
  // Arabia, the Middle East, Central and South Asia
  ['#ebc89a', [35, 28, 38, 32, 44, 33, 48, 30, 56, 26, 59, 22, 52, 16, 43, 13, 39, 19, 36, 25]],
  ['#b9a07a', [36, 33, 40, 37, 45, 37, 50, 37, 56, 37, 62, 36, 66, 30, 66, 25, 57, 25, 50, 30, 44, 31]],
  ['#a38a5a', [26, 37, 26, 41, 36, 42, 44, 41, 44, 37, 36, 36.5]],
  ['#796942', [30, 45, 40, 48, 50, 48, 60, 50, 80, 50, 85, 47, 75, 43, 60, 43, 52, 45, 45, 44, 35, 45]],
  ['#b49d6e', [50, 37, 52, 45, 60, 46, 70, 45, 80, 44, 78, 38, 66, 37, 60, 37]],
  ['#5c5f30', [68, 24, 72, 21, 76, 8, 80, 10, 80, 16, 87, 22, 90, 26, 85, 28, 78, 30, 73, 32, 70, 30]],
  ['#beac80', [68, 24, 70, 30, 75, 30, 75, 26, 71, 23]],
  ['#d7c298', [76, 37, 78, 41, 88, 42, 92, 40, 88, 37, 80, 36]],
  ['#ac9468', [78, 30, 78, 36, 92, 36, 100, 34, 96, 29, 85, 28]],
  ['#2a3c14', [92, 22, 100, 22, 110, 22, 110, 10, 104, 8, 98, 10, 94, 16]],
  // Europe and northern Asia
  ['#92794a', [-9, 37, -9, 43, -2, 43.5, 3, 42, 0, 39, -2, 36.7, -6, 36]],
  ['#444921', [-5, 43, -5, 48, 0, 51, 8, 55, 12, 56, 20, 55, 30, 55, 40, 55, 50, 55, 52, 50, 45, 47, 40, 45, 30, 44, 28, 41, 20, 40, 15, 42, 10, 44, 3, 43]],
  ['#6a6236', [8, 44, 12, 46, 19, 46, 23, 44, 26, 41, 22, 37, 16, 38, 12, 42]],
  ['#1d2a0b', [5, 59, 10, 64, 15, 69, 30, 70, 45, 67, 60, 66, 80, 67, 110, 68, 110, 52, 85, 55, 60, 57, 45, 58, 30, 58, 18, 57, 10, 58]],
  ['#4e4d30', [25, 70, 40, 68, 60, 69, 80, 72, 110, 75, 110, 70, 80, 67, 60, 66, 45, 67, 30, 69]],
  // South America, near the left edge
  ['#1f330d', [-80, 2, -75, 8, -60, 8, -50, 2, -45, -3, -50, -10, -60, -13, -70, -12, -76, -6]],
  ['#6e5a34', [-60, -13, -50, -10, -44, -3, -35, -6, -40, -20, -48, -24, -55, -22, -60, -17]],
  ['#585629', [-62, -30, -55, -25, -48, -26, -52, -34, -58, -38, -63, -38]],
  ['#605233', [-72, -40, -63, -38, -63, -43, -66, -47, -68, -52, -72, -52]],
  ['#ba9c7e', [-71, -30, -69, -18, -66, -16, -66, -24, -68, -30]],
  // Ice
  ['#eef2f5', [-75, 84, -10, 84, -15, 70, -40, 59.5, -52, 66, -60, 76]],
  ['#e8ebee', [-90, -62, 0, -62, 60, -62, 120, -62, 120, -89, -90, -89]],
];

/** A small flat patch on the globe (sea ice), squashed toward the middle the more it is seen at a slant. */
function cloud(ctx, lon, lat, sizeDeg, stretch, angle, alpha, rgb = '255,255,255') {
  const [x, y, facing] = globe(lon, lat);
  if (facing <= 0) return;
  const r = sizeDeg * EARTH_PX_PER_DEG;
  const toward = Math.atan2(y - EARTH.y, x - EARTH.x);
  ctx.fillStyle = `rgba(${rgb},${alpha})`;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(toward);
  ctx.scale(Math.max(0.05, facing), 1);
  ctx.rotate(angle - toward);
  ellipse(ctx, 0, 0, r * stretch, r);
  ctx.fill();
  ctx.restore();
}

// Clouds: a wispy noise pattern on the sphere, kept where late-August clouds really are. Thick along the rain belt
// north of the equator (the West African monsoon) and over India (its monsoon); a sheet of low cloud over the cold
// South Atlantic off Namibia and Angola; storm belts in the far north and the Southern Ocean; little over the deserts,
// southern Africa in its dry season and the Mediterranean summer. Storms twist the pattern into spirals (anticlockwise
// north of the equator, clockwise south of it).
const near = (v, mid, width) => Math.exp(-(((v - mid) / width) ** 2));
function cloudiness(lon, lat) {
  let c = 0.38;
  c = Math.max(c, 0.66 * near(lat, 9, 5) * (lon > -60 && lon < 45 ? 1 : 0.7));
  c = Math.max(c, 0.85 * near(lat, 17, 7) * near(lon, 82, 14));
  c = Math.max(c, 0.8 * near(lat, -16, 8) * near(lon, 2, 10));
  c = Math.max(c, 0.65 * near(lat, 60, 10));
  c = Math.max(c, 0.85 * near(lat, -50, 10));
  const dry = Math.max(
    near(lat, 24, 7) * (lon > -20 && lon < 62 ? 1 : 0.3),
    near(lat, -14, 11) * near(lon, 26, 12),
    near(lat, 38, 4) * near(lon, 18, 18),
  );
  return c * (1 - 0.93 * dry);
}
const STORMS = [[-28, 57, 7, 1], [-35, -48, 8, -1], [5, -52, 9, -1], [45, -47, 8, -1], [85, -50, 7, -1]];

// Smooth random values on a 3D grid, mixed at five sizes (value noise), so the pattern has no seam on the globe.
function hash3(x, y, z) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const s = t => t * t * (3 - 2 * t);
  const u = s(x - xi), v = s(y - yi), w = s(z - zi);
  const lerp = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
function fbm(x, y, z) {
  let sum = 0, amp = 0.5, f = 1;
  for (let i = 0; i < 5; i++) {
    sum += amp * noise3(x * f, y * f, z * f);
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / 0.97;
}
const unit = (lon, lat) => [Math.cos(lat * RAD) * Math.cos(lon * RAD), Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD)];

let cloudLayer = null;
/** The clouds over the whole disk, worked out once (a fraction of a second) and reused. */
function cloudCanvas() {
  if (cloudLayer) return cloudLayer;
  const N = 1024;
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(N, N) : Object.assign(document.createElement('canvas'), { width: N, height: N });
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(N, N);
  const storms = STORMS.map(([lon, lat, size, turn]) => ({ at: unit(lon, lat), size: size * RAD, turn }));
  const p0 = EARTH.lat * RAD;
  for (let py = 0; py < N; py++) {
    for (let px = 0; px < N; px++) {
      const u = (px + 0.5) / N * 2 - 1, v = 1 - (py + 0.5) / N * 2;
      const rho = Math.hypot(u, v);
      if (rho >= 1) continue;
      // Back from the disk to longitude and latitude (the orthographic projection turned around).
      const c = Math.asin(rho);
      const lat = Math.asin(Math.cos(c) * Math.sin(p0) + (rho ? v * Math.sin(c) * Math.cos(p0) / rho : 0)) / RAD;
      const lon = EARTH.lon + Math.atan2(u * Math.sin(c), rho * Math.cos(c) * Math.cos(p0) - v * Math.sin(c) * Math.sin(p0)) / RAD;
      let [x, y, z] = unit(lon, lat);
      let swirl = 0;
      for (const s of storms) {
        const d = Math.acos(Math.min(1, x * s.at[0] + y * s.at[1] + z * s.at[2]));
        if (d > s.size * 3) continue;
        // Turn the point around the storm's center, more near the middle: the pattern winds into a spiral.
        const a = s.turn * 4 * Math.exp(-d / s.size);
        const [kx, ky, kz] = s.at;
        const cos = Math.cos(a), sin = Math.sin(a), dot = kx * x + ky * y + kz * z;
        [x, y, z] = [
          x * cos + (ky * z - kz * y) * sin + kx * dot * (1 - cos),
          y * cos + (kz * x - kx * z) * sin + ky * dot * (1 - cos),
          z * cos + (kx * y - ky * x) * sin + kz * dot * (1 - cos)];
        swirl = Math.max(swirl, Math.exp(-((d / s.size) ** 2)));
      }
      // Large patches come and go with the weather: clear areas and big clusters, not an even spread.
      const weather = 0.6 + 0.8 * noise3(x * 2.5 + 5, y * 2.5 + 7, z * 2.5 + 3);
      const cover = Math.min(1, Math.max(cloudiness(lon, lat) * weather, 0.85 * swirl));
      const n = fbm(x * 9 + 11, y * 9 + 23, z * 9 + 37);
      const cut = 0.66 - 0.4 * cover;
      const alpha = Math.min(1, Math.max(0, (n - cut) / 0.13)) * 0.95;
      const i = 4 * (py * N + px);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(255 * alpha);
    }
  }
  ctx.putImageData(img, 0, 0);
  cloudLayer = canvas;
  return canvas;
}

// Cities that show on the night side, [lon, lat].
const CITIES = [
  [-0.1, 51.5], [2.3, 48.9], [12.5, 41.9], [13.4, 52.5], [37.6, 55.8], [30.3, 59.9], [-3.7, 40.4], [2.2, 41.4], [9.2, 45.5],
  [4.9, 52.4], [4.4, 50.8], [6.9, 50.9], [8.7, 50.1], [11.6, 48.1], [16.4, 48.2], [19, 47.5], [21, 52.2], [14.4, 50.1],
  [-2.2, 53.5], [-6.3, 53.3], [-9.1, 38.7], [26.1, 44.4], [23.7, 38], [29, 41], [32.9, 39.9], [30.5, 50.5], [27.6, 53.9],
  [44.5, 48.7], [49.1, 55.8], [60.6, 56.8], [37.6, 47], [39.7, 47.2], [35.2, 31.8], [35.5, 33.9], [36.3, 33.5], [44.4, 33.3],
  [51.4, 35.7], [59.6, 36.3], [46.7, 24.7], [39.8, 21.4], [50.6, 26.2], [51.5, 25.3], [55.3, 25.2], [54.4, 24.5], [58.4, 23.6],
  [31.2, 30], [29.9, 31.2], [31.3, 27.2], [32.9, 24.1], [32.6, 15.6], [38.7, 9], [36.8, -1.3], [39.3, -6.8], [32.6, -25.9],
  [28, -26.2], [28.2, -25.7], [31, -29.9], [18.4, -33.9], [25.6, -33.9], [3.4, 6.5], [7.5, 9.1], [8.5, 12], [-0.2, 5.6],
  [-4, 5.3], [-17.4, 14.7], [-7.6, 33.6], [-6.8, 34], [3.1, 36.8], [10.2, 36.8], [13.2, 32.9], [15.3, -4.3], [13.2, -8.8],
  [72.9, 19.1], [77.2, 28.6], [88.4, 22.6], [80.3, 13.1], [77.6, 13], [78.5, 17.4], [67, 24.9], [74.3, 31.5], [69.2, 41.3],
  [-46.6, -23.5], [-43.2, -22.9], [-47.9, -15.8], [-38.5, -13], [-34.9, -8.1], [-58.4, -34.6], [-56.2, -34.9], [-70.7, -33.4],
];

const earth = {
  id: 'earth', label: 'Earth from orbit',
  layers: [{ distanceM: Infinity,
    draw(ctx) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, SCENE_W, SCENE_H);
      const k = ctx.getTransform().a; // filters work in canvas pixels, not scene units
      ctx.save();
      blob(ctx, EARTH.x, EARTH.y, EARTH.r, EARTH.r, '#0f2a5c');
      ctx.clip();
      // The Arctic sea ice at the end of summer, around the North Pole.
      ctx.filter = `blur(${2 * k}px)`;
      for (let lon = -180; lon < 180; lon += 8) for (let lat = 80; lat < 90; lat += 3) cloud(ctx, lon, lat, 3, 1.5, 0, 0.9, '223,229,234');
      ctx.filter = 'none';
      ctx.beginPath();
      for (const ring of COASTS) globePath(ctx, ring);
      ctx.fillStyle = '#665734';
      ctx.fill('evenodd');
      // Ground cover stays on land, with soft edges between regions.
      ctx.save();
      ctx.clip('evenodd');
      ctx.filter = `blur(${4 * k}px)`;
      for (const [color, outline] of COVER) {
        ctx.fillStyle = color;
        ctx.beginPath();
        globePath(ctx, outline);
        ctx.fill();
      }
      ctx.filter = 'none';
      ctx.restore();
      ctx.drawImage(cloudCanvas(), EARTH.x - EARTH.r, EARTH.y - EARTH.r, 2 * EARTH.r, 2 * EARTH.r);
      // Sunlight hits the edge of the globe at a slant, so it is dimmer there (brightness about the cosine of the angle).
      ctx.globalCompositeOperation = 'multiply';
      const slant = ctx.createRadialGradient(EARTH.x, EARTH.y, 0, EARTH.x, EARTH.y, EARTH.r);
      [[0, 1], [0.5, 0.87], [0.7, 0.71], [0.85, 0.53], [0.95, 0.31], [1, 0.15]]
        .forEach(([t, b]) => slant.addColorStop(t, `rgb(${Math.round(255 * b)},${Math.round(255 * b)},${Math.round(255 * b)})`));
      ctx.fillStyle = slant;
      ctx.fillRect(0, 0, SCENE_W, SCENE_H);
      ctx.globalCompositeOperation = 'source-over';
      // Toward the edge you look through more air, which scatters blue light back: a blue haze.
      const haze = ctx.createRadialGradient(EARTH.x, EARTH.y, EARTH.r * 0.55, EARTH.x, EARTH.y, EARTH.r);
      haze.addColorStop(0, 'rgba(110,160,255,0)');
      haze.addColorStop(1, 'rgba(110,160,255,0.4)');
      ctx.fillStyle = haze;
      ctx.fillRect(0, 0, SCENE_W, SCENE_H);
      ctx.restore();
      // The thin layer of air seen edge-on, just past the rim.
      // (Inside a gradient's first circle canvas keeps its first color, so these start from the middle.)
      const air = ctx.createRadialGradient(EARTH.x, EARTH.y, 0, EARTH.x, EARTH.y, EARTH.r * 1.025);
      air.addColorStop(0, 'rgba(120,170,255,0)');
      air.addColorStop(0.97, 'rgba(120,170,255,0)');
      air.addColorStop(1 / 1.025, 'rgba(120,170,255,0.55)');
      air.addColorStop(1, 'rgba(120,170,255,0)');
      ctx.fillStyle = air;
      ctx.fillRect(0, 0, SCENE_W, SCENE_H);
    },
    // Air scatters short light far more (about 6 times more at 350 nm than at 550 nm), so in UV a haze
    // covers the ground and the globe glows; clouds still show through.
    uv(ctx) {
      blob(ctx, EARTH.x, EARTH.y, EARTH.r, EARTH.r, 'rgba(150,150,150,0.55)');
      const glow = ctx.createRadialGradient(EARTH.x, EARTH.y, 0, EARTH.x, EARTH.y, EARTH.r * 1.06);
      glow.addColorStop(0, 'rgba(220,220,220,0)');
      glow.addColorStop(0.85, 'rgba(220,220,220,0)');
      glow.addColorStop(1 / 1.06, 'rgba(220,220,220,0.8)');
      glow.addColorStop(1, 'rgba(220,220,220,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, SCENE_W, SCENE_H);
    },
    // The night side: city lights.
    glow(ctx, light) {
      const on = lampsOn(light);
      if (!on) return;
      ctx.globalAlpha = on;
      for (const [lon, lat] of CITIES) {
        const [x, y, facing] = globe(lon, lat);
        if (facing > 0) blob(ctx, x, y, 1.6, 1.6, '#ffd27a');
      }
      ctx.globalAlpha = 1;
    } }],
};

export const SCENES = [garden, forest, beach, underwater, street, fruit, earth];

/** A picture the user loaded, cropped to fill the view, treated as far away. */
export function imageScene(image) {
  return {
    id: 'own', label: 'Your image',
    // A photo only recorded red, green and blue: there is no UV or infrared in it to show.
    photo: true,
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
