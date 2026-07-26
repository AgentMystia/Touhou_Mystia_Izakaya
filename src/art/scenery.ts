/**
 * The night izakaya: a wooden stall under a string of red lanterns, parked on
 * a forest trail with Gensokyo's sky behind it.
 *
 * The scene is built as a value structure rather than a pile of shapes. Read
 * back to front it runs: pale hazy sky, mid-value ridges, the stall's dark
 * exterior, the bright warm interior, then near-black foreground bamboo
 * framing the whole thing. Holding those bands apart is what gives a flat
 * canvas depth.
 *
 * Colour is painted by `drawNightScene`; anything that emits light is painted
 * separately by `drawNightLights` into the renderer's light buffer, where it
 * becomes bloom.
 */

import { CLOTH, alpha, shift } from './palette';
import {
  clipped,
  fillBlob,
  fillCircle,
  fillEllipse,
  fillPolygon,
  fillRoundRect,
  groundShadow,
  linearPaint,
  polygon,
  softGlow,
  withState,
  withTransform,
} from '../gfx/vector';
import { hashSeed, mulberry32 } from '../core/rng';

type Ctx2D = CanvasRenderingContext2D;

export interface SceneLayout {
  width: number;
  height: number;
  /** The trail the stall and its guests stand on. */
  groundY: number;
  /** The counter surface, where plates are set down. */
  counterY: number;
  /** Outer edges of the stall structure. */
  stallLeft: number;
  stallRight: number;
  roofY: number;
}

export function defaultLayout(width: number, height: number): SceneLayout {
  return {
    width,
    height,
    groundY: height * 0.865,
    counterY: height * 0.675,
    stallLeft: width * 0.175,
    stallRight: width * 0.825,
    roofY: height * 0.2,
  };
}

/** Where the lanterns hang, in scene coordinates. */
export function lanternPositions(layout: SceneLayout): Array<{ x: number; y: number; r: number }> {
  const { stallLeft: l, stallRight: r, roofY } = layout;
  const span = r - l;
  // Strung along the eave, sagging toward the middle, biggest at centre.
  const at = [0.02, 0.235, 0.5, 0.765, 0.98];
  const radii = [27, 33, 39, 33, 27];
  return at.map((f, i) => ({
    x: l + span * f,
    // Hung from the header beam; the cord is longer toward the middle.
    y: roofY + 152 - Math.abs(f - 0.5) * 34,
    r: radii[i] as number,
  }));
}

/**
 * Lantern flicker. Three incommensurate sines beat against each other so the
 * light breathes instead of strobing — pure noise reads as a fault.
 */
export const flicker = (time: number, seed: number): number =>
  1 +
  0.05 * Math.sin(time * 0.7 * Math.PI * 2 + seed) +
  0.03 * Math.sin(time * 1.9 * Math.PI * 2 + seed * 2.3) +
  0.018 * Math.sin(time * 4.3 * Math.PI * 2 + seed * 5.1);

// ------------------------------------------------------------------- sky

function drawSky(ctx: Ctx2D, layout: SceneLayout, time: number): void {
  const { width: w, height: h } = layout;

  ctx.fillStyle = linearPaint(ctx, 0, 0, 0, h * 0.86, [
    { at: 0, color: '#070a1c' },
    { at: 0.3, color: '#121734' },
    { at: 0.58, color: '#26254c' },
    { at: 0.8, color: '#4a3358' },
    { at: 1, color: '#6b4257' },
  ]);
  ctx.fillRect(0, 0, w, h);

  // Stars: a fixed constellation, denser and brighter toward the zenith.
  const rand = mulberry32(hashSeed('starfield'));
  withState(ctx, () => {
    for (let i = 0; i < 260; i++) {
      const x = rand() * w;
      const depth = rand();
      const y = depth * depth * h * 0.66;
      const twinkle = 0.7 + 0.3 * Math.sin(time * (0.5 + rand() * 1.8) + i);
      ctx.globalAlpha = (0.16 + rand() * 0.6) * (1 - depth * 0.55) * twinkle;
      ctx.fillStyle = rand() < 0.15 ? '#ffe9c8' : '#dfe4ff';
      const s = rand() < 0.88 ? 1.5 : 2.6;
      ctx.fillRect(x, y, s, s);
    }
  });

  // The moon, with a wide soft corona.
  const mx = w * 0.775;
  const my = h * 0.145;
  withState(ctx, () => {
    const corona = ctx.createRadialGradient(mx, my, 30, mx, my, 300);
    corona.addColorStop(0, alpha('#ffeec4', 0.28));
    corona.addColorStop(0.35, alpha('#e8d2b0', 0.1));
    corona.addColorStop(1, alpha('#c8b8e0', 0));
    ctx.fillStyle = corona;
    ctx.fillRect(mx - 320, my - 320, 640, 640);
  });

  const disc = ctx.createRadialGradient(mx - 18, my - 18, 6, mx, my, 62);
  disc.addColorStop(0, '#fffdf2');
  disc.addColorStop(0.7, '#fff3d0');
  disc.addColorStop(1, '#e9d6ae');
  fillCircle(ctx, mx, my, 56, disc);
  clipped(
    ctx,
    () => {
      ctx.beginPath();
      ctx.arc(mx, my, 56, 0, Math.PI * 2);
    },
    () => {
      for (const [dx, dy, r, a] of [
        [-18, -8, 13, 0.16],
        [12, 16, 10, 0.13],
        [4, -26, 7, 0.1],
        [26, -6, 6, 0.09],
      ] as const) {
        fillCircle(ctx, mx + dx, my + dy, r, alpha('#8a7a6a', a));
      }
    },
  );

  // Cloud bands drifting across, thin enough to keep the moon readable.
  withState(ctx, () => {
    for (let i = 0; i < 5; i++) {
      const y = h * (0.07 + i * 0.055);
      const x = ((time * (4 + i * 2.5) + i * 620) % (w + 900)) - 450;
      const width = 230 - i * 24;
      const g = ctx.createLinearGradient(x - width, y, x + width, y);
      g.addColorStop(0, alpha('#4a4a72', 0));
      g.addColorStop(0.5, alpha('#4a4a72', 0.2));
      g.addColorStop(1, alpha('#4a4a72', 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, width, 13 - i, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

// -------------------------------------------------------------- backdrop

/** A ragged conifer treeline. Seeded, so it is identical every frame. */
function treeline(
  ctx: Ctx2D,
  layout: SceneLayout,
  baseY: number,
  height: number,
  color: string,
  seed: string,
  step: number,
): void {
  const rand = mulberry32(hashSeed(seed));
  ctx.beginPath();
  ctx.moveTo(-60, layout.height);
  ctx.lineTo(-60, baseY);
  for (let x = -60; x <= layout.width + 80; x += step) {
    const tall = height * (0.45 + rand() * 0.85);
    const lean = (rand() - 0.5) * step * 0.3;
    ctx.lineTo(x + lean, baseY - tall);
    ctx.lineTo(x + step * 0.5, baseY - tall * (0.35 + rand() * 0.3));
  }
  ctx.lineTo(layout.width + 80, layout.height);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function drawBackdrop(ctx: Ctx2D, layout: SceneLayout): void {
  const { width: w, height: h } = layout;

  // Far mountains: hazy and low-contrast, so they stay behind everything.
  fillBlob(
    ctx,
    [
      [-140, h * 0.6],
      [w * 0.14, h * 0.43],
      [w * 0.3, h * 0.55],
      [w * 0.48, h * 0.385],
      [w * 0.68, h * 0.53],
      [w * 0.88, h * 0.45],
      [w + 140, h * 0.58],
      [w + 140, h],
      [-140, h],
    ],
    '#2b2a50',
    0.3,
  );
  // Nearer ridge, a step darker.
  fillBlob(
    ctx,
    [
      [-140, h * 0.68],
      [w * 0.22, h * 0.55],
      [w * 0.42, h * 0.64],
      [w * 0.63, h * 0.52],
      [w * 0.85, h * 0.63],
      [w + 140, h * 0.58],
      [w + 140, h],
      [-140, h],
    ],
    '#1e1c3c',
    0.3,
  );

  // Valley mist, which is what actually separates the ridges.
  withState(ctx, () => {
    const mist = linearPaint(ctx, 0, h * 0.48, 0, h * 0.74, [
      { at: 0, color: alpha('#6a6a9a', 0) },
      { at: 0.45, color: alpha('#6a6a9a', 0.24) },
      { at: 1, color: alpha('#6a6a9a', 0) },
    ]);
    ctx.fillStyle = mist;
    ctx.fillRect(0, h * 0.46, w, h * 0.3);
  });

  treeline(ctx, layout, h * 0.72, h * 0.16, '#14132c', 'trees-mid', 44);
  treeline(ctx, layout, h * 0.8, h * 0.12, '#0d0c1e', 'trees-near', 58);

  // The trail.
  ctx.fillStyle = linearPaint(ctx, 0, layout.groundY - 30, 0, h, [
    { at: 0, color: '#2a2036' },
    { at: 0.45, color: '#1c1526' },
    { at: 1, color: '#0e0a16' },
  ]);
  ctx.fillRect(0, layout.groundY - 30, w, h - layout.groundY + 30);

  // Stones and ruts, so the ground is not a flat wash.
  const rand = mulberry32(hashSeed('trail'));
  withState(ctx, () => {
    for (let i = 0; i < 90; i++) {
      const y = layout.groundY + rand() * (h - layout.groundY);
      const x = rand() * w;
      const near = (y - layout.groundY) / (h - layout.groundY);
      ctx.globalAlpha = 0.12 + rand() * 0.16;
      fillEllipse(ctx, x, y, 5 + near * 16, 2 + near * 5, rand() < 0.5 ? '#4a3c50' : '#0a0710');
    }
  });
}

// ------------------------------------------------------------- the stall

function drawLantern(
  ctx: Ctx2D,
  x: number,
  y: number,
  r: number,
  intensity: number,
  glyph: string | undefined,
  sway: number,
): void {
  // Swing from the cord's anchor rather than the lantern's centre.
  withTransform(ctx, x, y - r * 2.4, () => {
    ctx.rotate(sway);
    ctx.translate(0, r * 2.4);
    const h = r * 1.42;

    ctx.strokeStyle = '#241618';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(0, -r * 2.4);
    ctx.lineTo(0, -h);
    ctx.stroke();

    // Paper body: hot in the middle, deepening to crimson at the rim.
    const body = ctx.createRadialGradient(-r * 0.16, -h * 0.14, r * 0.06, 0, 0, r * 1.18);
    body.addColorStop(0, shift('#ffcf7a', 0.16 * intensity));
    body.addColorStop(0.3, '#ff8038');
    body.addColorStop(0.62, '#ee4526');
    body.addColorStop(0.88, '#c62a18');
    body.addColorStop(1, '#7e1a0f');
    fillEllipse(ctx, 0, 0, r, h, body);

    // Bamboo ribs, following the curve of the paper.
    withState(ctx, () => {
      ctx.globalAlpha = 0.2;
      ctx.strokeStyle = '#63140e';
      ctx.lineWidth = 1.5;
      for (let i = -4; i <= 4; i++) {
        const yy = (i / 4.6) * h;
        const rr = r * Math.sqrt(Math.max(0, 1 - (yy / h) ** 2));
        ctx.beginPath();
        ctx.moveTo(-rr, yy);
        ctx.quadraticCurveTo(0, yy + 3, rr, yy);
        ctx.stroke();
      }
    });
    // Soft vertical sheen down one side.
    withState(ctx, () => {
      const sheen = ctx.createLinearGradient(-r, 0, r * 0.2, 0);
      sheen.addColorStop(0, alpha('#ffd9a0', 0));
      sheen.addColorStop(0.55, alpha('#ffd9a0', 0.22));
      sheen.addColorStop(1, alpha('#ffd9a0', 0));
      fillEllipse(ctx, -r * 0.3, 0, r * 0.34, h * 0.82, sheen);
    });

    // Lacquered caps and tassel.
    fillRoundRect(ctx, -r * 0.4, -h - r * 0.16, r * 0.8, r * 0.22, 3, '#241416');
    fillRoundRect(ctx, -r * 0.4, h - r * 0.06, r * 0.8, r * 0.22, 3, '#241416');
    ctx.strokeStyle = '#8a1c1c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, h + r * 0.16);
    ctx.lineTo(0, h + r * 0.46);
    ctx.stroke();

    if (glyph) {
      withState(ctx, () => {
        ctx.fillStyle = alpha('#3a0c08', 0.86);
        ctx.font = `800 ${Math.round(r * 0.98)}px "Shippori Mincho", serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(glyph, 0, 1);
      });
    }
  });
}

/** Tiled roof with upturned eaves. */
function drawRoof(ctx: Ctx2D, layout: SceneLayout): void {
  const { stallLeft: l, stallRight: r, roofY } = layout;
  const overhang = 78;
  const outerL = l - overhang;
  const outerR = r + overhang;
  const mid = (l + r) / 2;

  const ridgeY = (x: number) =>
    roofY - 54 + ((x - mid) / ((outerR - outerL) / 2)) ** 2 * 88;

  withState(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(outerL, roofY + 34);
    ctx.quadraticCurveTo(mid, roofY - 54, outerR, roofY + 34);
    ctx.lineTo(outerR + 12, roofY + 58);
    ctx.quadraticCurveTo(mid, roofY - 22, outerL - 12, roofY + 58);
    ctx.closePath();
    ctx.fillStyle = linearPaint(ctx, 0, roofY - 54, 0, roofY + 58, [
      { at: 0, color: '#4a3450' },
      { at: 0.45, color: '#2e2033' },
      { at: 1, color: '#170e1a' },
    ]);
    ctx.fill();
  });

  // Tile ribs running down the slope.
  withState(ctx, () => {
    ctx.globalAlpha = 0.32;
    ctx.strokeStyle = '#0e0812';
    ctx.lineWidth = 2;
    const cols = 36;
    for (let i = 1; i < cols; i++) {
      const x = outerL + ((outerR - outerL) * i) / cols;
      ctx.beginPath();
      ctx.moveTo(x, ridgeY(x) + 4);
      ctx.lineTo(x + 5, roofY + 50);
      ctx.stroke();
    }
  });

  // Moonlit ridge line.
  withState(ctx, () => {
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = '#9083a8';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(outerL, roofY + 34);
    ctx.quadraticCurveTo(mid, roofY - 54, outerR, roofY + 34);
    ctx.stroke();
  });

  // Upturned eave tips.
  for (const [x, dir] of [
    [outerL, -1],
    [outerR, 1],
  ] as const) {
    fillBlob(
      ctx,
      [
        [x, roofY + 30],
        [x + dir * 32, roofY + 8],
        [x + dir * 44, roofY + 30],
        [x + dir * 16, roofY + 60],
      ],
      '#241629',
    );
  }

  // Rafter ends under the eave, then the header beam.
  for (let i = 0; i <= 18; i++) {
    const x = outerL + 22 + ((outerR - outerL - 44) * i) / 18;
    fillRoundRect(ctx, x - 5, roofY + 52, 10, 18, 2, '#1d1220');
  }
  fillRoundRect(ctx, outerL, roofY + 66, outerR - outerL, 20, 4, '#33211a');
  withState(ctx, () => {
    ctx.globalAlpha = 0.45;
    fillRoundRect(ctx, outerL, roofY + 66, outerR - outerL, 6, 3, '#6b4530');
  });
}

/** The lit interior seen through the stall opening. */
function drawInterior(ctx: Ctx2D, layout: SceneLayout, time: number): void {
  const { stallLeft: l, stallRight: r, counterY, roofY } = layout;
  const top = roofY + 86;

  // Back wall, warmest at counter height where the lamps reach.
  ctx.fillStyle = linearPaint(ctx, 0, top, 0, counterY, [
    { at: 0, color: '#1a0f12' },
    { at: 0.36, color: '#42251d' },
    { at: 0.75, color: '#7a4a2c' },
    { at: 1, color: '#9c6234' },
  ]);
  ctx.fillRect(l, top, r - l, counterY - top);

  // Warm pool washing the middle of the back wall, as if from the counter lamps.
  withState(ctx, () => {
    ctx.globalCompositeOperation = 'lighter';
    const wash = ctx.createRadialGradient(
      (l + r) / 2, counterY - 60, 20,
      (l + r) / 2, counterY - 60, (r - l) * 0.6,
    );
    wash.addColorStop(0, alpha('#ff9a48', 0.2));
    wash.addColorStop(1, alpha('#ff7a30', 0));
    ctx.fillStyle = wash;
    ctx.fillRect(l, top, r - l, counterY - top);
  });

  // Vertical planking: a dark seam with a lit edge beside it.
  withState(ctx, () => {
    const planks = 18;
    for (let i = 1; i < planks; i++) {
      const x = l + ((r - l) * i) / planks;
      ctx.globalAlpha = 0.34;
      ctx.strokeStyle = '#150c12';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, counterY - 22);
      ctx.stroke();
      ctx.globalAlpha = 0.2;
      ctx.strokeStyle = '#a06a44';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x + 2.5, top);
      ctx.lineTo(x + 2.5, counterY - 22);
      ctx.stroke();
    }
  });

  // Tanzaku: hand-written menu strips pinned across the back wall.
  const strips = 9;
  const rand = mulberry32(hashSeed('tanzaku'));
  for (let i = 0; i < strips; i++) {
    const sx = l + 62 + i * ((r - l - 124) / (strips - 1));
    const sy = top + 224 + rand() * 12;
    const tilt = (rand() - 0.5) * 0.07;
    withTransform(ctx, sx, sy, () => {
      ctx.rotate(tilt);
      withState(ctx, () => {
        ctx.globalAlpha = 0.35;
        fillRoundRect(ctx, -14, 4, 34, 86, 2, '#0a0508');
      });
      fillRoundRect(ctx, -17, 0, 34, 86, 2, '#cbb488');
      // Aged by smoke toward the bottom.
      withState(ctx, () => {
        const age = linearPaint(ctx, 0, 0, 0, 86, [
          { at: 0, color: alpha('#7a5a38', 0) },
          { at: 1, color: alpha('#4a3018', 0.5) },
        ]);
        fillRoundRect(ctx, -17, 0, 34, 86, 2, age);
      });
      // Suggestion of vertical brush writing.
      withState(ctx, () => {
        ctx.fillStyle = alpha('#2a1610', 0.6);
        for (let k = 0; k < 3; k++) ctx.fillRect(-6, 12 + k * 24, 12, 10 + rand() * 6);
      });
    });
  }

  // Bottle shelf.
  const shelfY = counterY - 104;
  fillRoundRect(ctx, l + 34, shelfY, r - l - 68, 9, 3, '#2a1a16');
  withState(ctx, () => {
    ctx.globalAlpha = 0.4;
    fillRoundRect(ctx, l + 34, shelfY, r - l - 68, 3, 2, '#8c5c3e');
  });

  const glass = ['#3f6a52', '#6a4632', '#2f4f74', '#7a5a34', '#4f3560', '#2f5f5a'];
  const brand = mulberry32(hashSeed('bottles'));
  const count = 19;
  for (let i = 0; i < count; i++) {
    const bx = l + 56 + i * ((r - l - 112) / (count - 1));
    const bh = 30 + brand() * 26;
    const bw = 7 + brand() * 3;
    const hue = glass[Math.floor(brand() * glass.length)] as string;
    fillRoundRect(ctx, bx - bw, shelfY - bh, bw * 2, bh, 3, hue);
    fillRoundRect(ctx, bx - 2.5, shelfY - bh - 9, 5, 10, 2, shift(hue, -0.25));
    fillRoundRect(ctx, bx - 3.5, shelfY - bh - 12, 7, 4, 2, '#d8c088');
    if (brand() < 0.7) {
      fillRoundRect(ctx, bx - bw + 1.5, shelfY - bh * 0.62, bw * 2 - 3, bh * 0.3, 1, '#ded0ac');
    }
    withState(ctx, () => {
      ctx.globalAlpha = 0.4;
      fillRoundRect(ctx, bx - bw + 1.5, shelfY - bh + 4, 2, bh - 10, 1, '#ffffff');
    });
  }

  // A small paper andon deeper inside, breathing out of step with the lanterns.
  const lx = l + (r - l) * 0.9;
  const ly = top + 300;
  withState(ctx, () => {
    const pulse = 0.55 + 0.07 * Math.sin(time * 1.4);
    // Frame, shade, then the lit panel inside it.
    fillRoundRect(ctx, lx - 19, ly - 34, 38, 60, 3, '#2b1a16');
    withState(ctx, () => {
      ctx.globalAlpha = pulse;
      fillRoundRect(ctx, lx - 15, ly - 30, 30, 52, 2, '#e0b878');
    });
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = '#2b1a16';
    ctx.lineWidth = 2;
    for (let i = 1; i < 3; i++) {
      const yy = ly - 30 + (52 * i) / 3;
      ctx.beginPath();
      ctx.moveTo(lx - 15, yy);
      ctx.lineTo(lx + 15, yy);
      ctx.stroke();
    }
  });
}

/** Counter, apron and stools. */
function drawCounter(ctx: Ctx2D, layout: SceneLayout): void {
  const { stallLeft: l, stallRight: r, counterY, groundY, roofY } = layout;
  const outL = l - 46;
  const outR = r + 46;
  const topH = 20;

  // Support posts, behind the counter slab.
  for (const x of [l + 4, r - 4]) {
    fillRoundRect(ctx, x - 11, roofY + 74, 22, groundY - roofY - 74, 4, '#33211a');
    withState(ctx, () => {
      ctx.globalAlpha = 0.45;
      fillRoundRect(ctx, x - 11, roofY + 74, 7, groundY - roofY - 74, 3, '#6b4530');
    });
  }

  // A shallow visible top surface, so it reads as a solid slab seen slightly
  // from above rather than as a flat band.
  withState(ctx, () => {
    polygon(ctx, [l - 30, counterY - topH, r + 30, counterY - topH, outR, counterY, outL, counterY]);
    ctx.fillStyle = linearPaint(ctx, 0, counterY - topH, 0, counterY, [
      { at: 0, color: '#7d5231' },
      { at: 1, color: '#b87d46' },
    ]);
    ctx.fill();
  });

  // Front apron.
  withState(ctx, () => {
    ctx.fillStyle = linearPaint(ctx, 0, counterY, 0, counterY + 46, [
      { at: 0, color: '#7a4c2c' },
      { at: 0.4, color: '#4e2f1c' },
      { at: 1, color: '#2a1810' },
    ]);
    ctx.fillRect(outL, counterY, outR - outL, 46);
  });

  // Grain across the top surface.
  withState(ctx, () => {
    ctx.globalAlpha = 0.14;
    ctx.strokeStyle = '#3a2114';
    ctx.lineWidth = 1.3;
    const grain = mulberry32(hashSeed('grain'));
    for (let i = 0; i < 16; i++) {
      const y = counterY - topH + 2 + grain() * (topH - 2);
      ctx.beginPath();
      ctx.moveTo(outL, y);
      ctx.bezierCurveTo(
        layout.width * 0.35, y + (grain() - 0.5) * 4,
        layout.width * 0.68, y + (grain() - 0.5) * 4,
        outR, y,
      );
      ctx.stroke();
    }
  });

  // Lit front lip.
  withState(ctx, () => {
    ctx.globalAlpha = 0.34;
    ctx.strokeStyle = '#ffc98a';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(outL, counterY - topH + 1.5);
    ctx.lineTo(outR, counterY - topH + 1.5);
    ctx.stroke();
  });

  // Deep shadow under the counter. Fully opaque: guests are drawn behind the
  // counter so they can be cropped at the chest, and a translucent fill here
  // would let their legs ghost through the woodwork.
  withState(ctx, () => {
    ctx.fillStyle = linearPaint(ctx, 0, counterY + 46, 0, groundY + 4, [
      { at: 0, color: '#0a0710' },
      { at: 0.6, color: '#120c18' },
      { at: 1, color: '#1a1322' },
    ]);
    ctx.fillRect(outL, counterY + 46, outR - outL, groundY - counterY - 42);
  });

  // Stools.
  for (let i = 0; i < 5; i++) {
    const sx = l + 70 + i * ((r - l - 140) / 4);
    groundShadow(ctx, sx, groundY + 6, 34, 9, 0.5);
    fillRoundRect(ctx, sx - 5.5, counterY + 74, 11, groundY - counterY - 74, 3, '#2f1d15');
    fillRoundRect(ctx, sx - 16, groundY - 26, 32, 5, 2, '#2a1a12');
    fillEllipse(ctx, sx, counterY + 76, 27, 9, '#5d3a24');
    fillEllipse(ctx, sx, counterY + 71, 27, 9, '#8a5731');
  }
}

/** The charcoal grill at the left end of the counter. */
function drawGrill(ctx: Ctx2D, layout: SceneLayout, time: number): void {
  const x = layout.stallLeft + 118;
  const y = layout.counterY - 26;

  fillRoundRect(ctx, x - 52, y - 20, 104, 28, 5, '#1e1416');
  fillRoundRect(ctx, x - 48, y - 17, 96, 6, 3, '#3a2826');

  const rand = mulberry32(hashSeed('coals'));
  for (let i = 0; i < 18; i++) {
    const cx = x - 42 + rand() * 84;
    const cy = y - 14 + rand() * 8;
    const heat = 0.5 + 0.5 * Math.sin(time * (0.8 + rand() * 2.2) + i * 1.7);
    fillEllipse(ctx, cx, cy, 5.5, 3.4, alpha(shift('#ff5a22', heat * 0.4), 0.45 + heat * 0.5));
  }
  withState(ctx, () => {
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = '#100c0e';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 9; i++) {
      const gx = x - 44 + i * 9.8;
      ctx.beginPath();
      ctx.moveTo(gx, y - 20);
      ctx.lineTo(gx, y - 4);
      ctx.stroke();
    }
  });

  for (let i = 0; i < 4; i++) {
    const sx = x - 30 + i * 20;
    withTransform(ctx, sx, y - 22, () => {
      ctx.rotate(-0.06 + i * 0.04);
      fillRoundRect(ctx, -2, -26, 4, 28, 2, '#cbaa7c');
      fillEllipse(ctx, 0, -19, 7, 9, '#b0703c');
      fillEllipse(ctx, 0, -9, 7, 9, '#8c4a26');
      withState(ctx, () => {
        ctx.globalAlpha = 0.45;
        fillEllipse(ctx, -2, -21, 3, 4, '#e0a868');
      });
    });
  }
}

/** Noren curtain hung across the top of the opening. */
function drawNoren(ctx: Ctx2D, layout: SceneLayout, time: number): void {
  const { stallLeft: l, stallRight: r, roofY } = layout;
  const y = roofY + 214;
  const height = 74;
  const panels = 4;
  const panelW = (r - l) / panels;
  const glyphs = ['夜', '雀', '食', '堂'];

  for (let i = 0; i < panels; i++) {
    const x = l + i * panelW;
    const swing = Math.sin(time * 0.75 + i * 0.9) * 3.4;
    withState(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(x + 3, y);
      ctx.lineTo(x + panelW - 3, y);
      ctx.lineTo(x + panelW - 3 + swing, y + height);
      ctx.quadraticCurveTo(x + panelW / 2 + swing, y + height + 8, x + 3 + swing, y + height);
      ctx.closePath();
      ctx.fillStyle = linearPaint(ctx, 0, y, 0, y + height, [
        { at: 0, color: '#5a141e' },
        { at: 0.42, color: CLOTH.noren },
        { at: 1, color: '#6d1a24' },
      ]);
      ctx.fill();

      ctx.globalAlpha = 0.24;
      ctx.strokeStyle = '#390b11';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(x + panelW - 3, y);
      ctx.lineTo(x + panelW - 3 + swing, y + height);
      ctx.stroke();
    });

    withState(ctx, () => {
      ctx.fillStyle = '#f4e2c0';
      ctx.font = '800 46px "Shippori Mincho", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = alpha('#2a0a0c', 0.6);
      ctx.shadowBlur = 6;
      ctx.fillText(glyphs[i] as string, x + panelW / 2 + swing * 0.6, y + height * 0.5);
    });
  }
}

// ------------------------------------------------------- foreground frame

/**
 * Near-black bamboo down both edges. The cheapest way to give the scene depth:
 * it sets the darkest value in the frame and pushes the lit stall back.
 */
function drawForeground(ctx: Ctx2D, layout: SceneLayout, time: number): void {
  const { width: w, height: h } = layout;
  const rand = mulberry32(hashSeed('bamboo'));

  const stalk = (x: number, thickness: number, tint: string) => {
    const lean = Math.sin(time * 0.35 + x * 0.01) * 5;
    withState(ctx, () => {
      ctx.fillStyle = tint;
      ctx.beginPath();
      ctx.moveTo(x - thickness, h + 10);
      ctx.quadraticCurveTo(x - thickness + lean, h * 0.4, x - thickness * 0.7 + lean * 2, -20);
      ctx.lineTo(x + thickness * 0.7 + lean * 2, -20);
      ctx.quadraticCurveTo(x + thickness + lean, h * 0.4, x + thickness, h + 10);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = alpha('#000000', 0.55);
      ctx.lineWidth = 3;
      for (let y = h; y > -20; y -= 130 + rand() * 70) {
        const t = 1 - y / h;
        const off = lean * t * 2;
        ctx.beginPath();
        ctx.moveTo(x - thickness + off, y);
        ctx.lineTo(x + thickness + off, y);
        ctx.stroke();
      }
    });
  };

  stalk(w * 0.045, 15, '#080611');
  stalk(w * 0.088, 9, '#0c0a18');
  stalk(w * 0.012, 21, '#050409');
  stalk(w * 0.955, 16, '#080611');
  stalk(w * 0.912, 10, '#0c0a18');
  stalk(w * 0.99, 23, '#050409');

  // Leaf sprays hanging in from the top corners.
  const leaves = (ox: number, dir: number) => {
    for (let i = 0; i < 10; i++) {
      const bx = ox + dir * (rand() * w * 0.14);
      const by = -10 + rand() * h * 0.28;
      const len = 44 + rand() * 46;
      const angle = dir * (0.45 + rand() * 0.95);
      withTransform(ctx, bx, by, () => {
        ctx.rotate(angle + Math.sin(time * 0.5 + i) * 0.04);
        fillBlob(
          ctx,
          [
            [0, 0],
            [len * 0.5, -8],
            [len, 0],
            [len * 0.5, 9],
          ],
          '#070610',
        );
      });
    }
  };
  leaves(w * 0.02, 1);
  leaves(w * 0.98, -1);

  // Grass along the very bottom edge.
  withState(ctx, () => {
    ctx.strokeStyle = '#080610';
    for (let i = 0; i < 150; i++) {
      const x = rand() * w;
      const tall = 14 + rand() * 42;
      const lean = Math.sin(time * 0.7 + i) * 4;
      ctx.lineWidth = 1.5 + rand() * 2;
      ctx.beginPath();
      ctx.moveTo(x, h + 4);
      ctx.quadraticCurveTo(x + lean, h - tall * 0.55, x + lean * 2.2, h - tall);
      ctx.stroke();
    }
  });
}

// ------------------------------------------------------------ public API

/**
 * Everything behind the counter. Split out from the front so guests and Mystia
 * can be drawn between the two and be correctly occluded by the counter slab.
 */
export function drawNightBack(ctx: Ctx2D, layout: SceneLayout, time: number): void {
  drawSky(ctx, layout, time);
  drawBackdrop(ctx, layout);

  // Warm haze around the stall, so its light feels like it is in the air.
  withState(ctx, () => {
    ctx.globalCompositeOperation = 'lighter';
    const haze = ctx.createRadialGradient(
      layout.width / 2, layout.counterY - 60, 40,
      layout.width / 2, layout.counterY - 60, layout.width * 0.5,
    );
    haze.addColorStop(0, alpha('#ff9a4a', 0.1));
    haze.addColorStop(0.55, alpha('#ff7a3c', 0.035));
    haze.addColorStop(1, alpha('#ff7a3c', 0));
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, layout.width, layout.height);
  });

  drawInterior(ctx, layout, time);
}

/** The counter and everything in front of or above it. */
export function drawNightFront(ctx: Ctx2D, layout: SceneLayout, time: number): void {
  drawCounter(ctx, layout);
  drawGrill(ctx, layout, time);
  drawRoof(ctx, layout);
  drawNoren(ctx, layout, time);

  const glyphs = ['営', '業', '中', '夜', '雀'];
  lanternPositions(layout).forEach((lamp, i) => {
    drawLantern(
      ctx,
      lamp.x,
      lamp.y,
      lamp.r,
      flicker(time, i * 2.7),
      glyphs[i],
      Math.sin(time * 0.6 + i * 1.3) * 0.03,
    );
  });
}

/** Convenience for scenes that draw nothing between the two halves. */
export function drawNightScene(ctx: Ctx2D, layout: SceneLayout, time: number): void {
  drawNightBack(ctx, layout, time);
  drawNightFront(ctx, layout, time);
}

/** Seat positions along the counter, matching the stools. */
export function seatPositions(layout: SceneLayout, count: number): Array<{ x: number; y: number }> {
  const { stallLeft: l, stallRight: r, counterY } = layout;
  // Offset from the left so the grill end stays clear for Mystia.
  const span = r - l - 400;
  return Array.from({ length: count }, (_, i) => ({
    x: l + 300 + (count === 1 ? span / 2 : (span * i) / (count - 1)),
    // Feet sit below the counter lip so the slab crops them at the chest.
    y: counterY + 92,
  }));
}

/** Drawn after the characters, so the frame sits in front of everything. */
export function drawNightForeground(ctx: Ctx2D, layout: SceneLayout, time: number): void {
  drawForeground(ctx, layout, time);
}

/** The emissive pass. Everything drawn here is blurred into bloom. */
export function drawNightLights(ctx: Ctx2D, layout: SceneLayout, time: number): void {
  const { width: w, height: h } = layout;

  softGlow(ctx, w * 0.775, h * 0.145, 165, '#ffeec4', 0.22);

  lanternPositions(layout).forEach((lamp, i) => {
    const f = flicker(time, i * 2.7);
    softGlow(ctx, lamp.x, lamp.y, lamp.r * 4.2 * f, '#ff7328', 0.3 * f);
    softGlow(ctx, lamp.x, lamp.y, lamp.r * 0.85, '#ffab52', 0.2 * f);

    withState(ctx, () => {
      const streak = ctx.createLinearGradient(lamp.x - lamp.r * 5, 0, lamp.x + lamp.r * 5, 0);
      streak.addColorStop(0, alpha('#ff9a4a', 0));
      streak.addColorStop(0.5, alpha('#ffd9a0', 0.16 * f));
      streak.addColorStop(1, alpha('#ff9a4a', 0));
      ctx.fillStyle = streak;
      ctx.fillRect(lamp.x - lamp.r * 5, lamp.y - 2, lamp.r * 10, 4);
    });
  });

  softGlow(
    ctx,
    layout.stallLeft + 118,
    layout.counterY - 30,
    76,
    '#ff6a28',
    0.24 + 0.05 * Math.sin(time * 2.1),
  );

  // Light washing along the counter surface.
  withState(ctx, () => {
    const bar = ctx.createLinearGradient(0, layout.counterY - 34, 0, layout.counterY + 6);
    bar.addColorStop(0, alpha('#ffab5c', 0.14));
    bar.addColorStop(1, alpha('#ffab5c', 0));
    ctx.fillStyle = bar;
    ctx.fillRect(
      layout.stallLeft - 46,
      layout.counterY - 34,
      layout.stallRight - layout.stallLeft + 92,
      42,
    );
  });
}

/** A hanging sign, used on the title screen and shop fronts. */
export function drawSignboard(
  ctx: Ctx2D,
  x: number,
  y: number,
  width: number,
  height: number,
  lines: string[],
): void {
  fillRoundRect(ctx, x - width / 2, y, width, height, 10, '#2a1a20');
  fillRoundRect(ctx, x - width / 2 + 6, y + 6, width - 12, height - 12, 7, '#e8dcc0');
  withState(ctx, () => {
    ctx.fillStyle = '#2a1a18';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = Math.min(height / (lines.length + 0.6), width * 0.3);
    ctx.font = `700 ${Math.round(size)}px "Shippori Mincho", serif`;
    lines.forEach((line, i) => {
      ctx.fillText(line, x, y + height / 2 + (i - (lines.length - 1) / 2) * size * 1.1);
    });
  });
}

/** Steam plume, for pots and fresh plates. */
export function drawSteam(ctx: Ctx2D, x: number, y: number, time: number, strength = 1): void {
  withState(ctx, () => {
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 4; i++) {
      const t = (time * 0.42 + i * 0.25) % 1;
      const rise = t * 78;
      const spread = 7 + t * 24;
      ctx.globalAlpha = Math.sin(t * Math.PI) * 0.2 * strength;
      fillEllipse(
        ctx,
        x + Math.sin(time * 1.5 + i * 2) * 11 * t,
        y - rise,
        spread,
        spread * 0.78,
        '#d4dbe8',
      );
    }
  });
}

/** Distant torii silhouette, used on the map and shrine backdrops. */
export function drawTorii(ctx: Ctx2D, x: number, y: number, scale: number, color: string): void {
  withTransform(ctx, x, y, () => {
    ctx.scale(scale, scale);
    fillPolygon(ctx, [-52, -74, 52, -74, 58, -66, -58, -66], color);
    fillPolygon(ctx, [-46, -58, 46, -58, 46, -50, -46, -50], color);
    ctx.fillStyle = color;
    ctx.fillRect(-34, -66, 9, 66);
    ctx.fillRect(25, -66, 9, 66);
  });
}
