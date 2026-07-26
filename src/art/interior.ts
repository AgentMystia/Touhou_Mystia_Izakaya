/**
 * The izakaya interior, seen three-quarter from the front.
 *
 * Everything is positioned from the floor layout in `sim/floor.ts`, so the art
 * and the collision boxes can never drift apart. Each piece of furniture is
 * anchored by the *front edge of its collision box* — that line is where it
 * touches the floor, so a piece is drawn upward from there and y-sorts against
 * the characters by the same number the simulation uses.
 */

import { LAMP, alpha, mix, shift } from './palette';
import {
  fillCircle,
  fillEllipse,
  fillRoundRect,
  groundShadow,
  linearPaint,
  polygon,
  softGlow,
  strokeRoundRect,
  withState,
  withTransform,
} from '../gfx/vector';
import { hashSeed, mulberry32 } from '../core/rng';
import { overlayTexture } from '../gfx/textures';
import { FLOOR, type FloorLayout, type Obstacle, type StationSlot, toScreen } from '../sim/floor';

type Ctx2D = CanvasRenderingContext2D;

const WALL_TOP = 88;

/** The floor line a piece of furniture stands on. */
export const baseOf = (slot: Obstacle): number => FLOOR.originY + slot.y + slot.h;

// ------------------------------------------------------------------- room

/** Floor, back wall and its dressing. Drawn before anything on the floor. */
export function drawInteriorBack(
  ctx: Ctx2D,
  width: number,
  height: number,
  time: number,
): void {
  const floorTop = FLOOR.originY;

  // --- back wall: dark timber at the top, warming toward the lamps
  ctx.fillStyle = linearPaint(ctx, 0, WALL_TOP - 40, 0, floorTop, [
    { at: 0, color: '#170e15' },
    { at: 0.4, color: '#2f1d1c' },
    { at: 0.82, color: '#54331f' },
    { at: 1, color: '#6d4527' },
  ]);
  ctx.fillRect(0, 0, width, floorTop);

  withState(ctx, () => {
    ctx.beginPath();
    ctx.rect(0, WALL_TOP - 40, width, floorTop - WALL_TOP + 40);
    ctx.clip();
    overlayTexture(ctx, 'wood', 0, WALL_TOP - 40, width, floorTop, 0.2, 'overlay', 0.8);
  });

  // Plank seams.
  withState(ctx, () => {
    const planks = 22;
    for (let i = 1; i < planks; i++) {
      const x = Math.round((width * i) / planks);
      ctx.globalAlpha = 0.32;
      ctx.strokeStyle = '#120a10';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x, WALL_TOP - 30);
      ctx.lineTo(x, floorTop);
      ctx.stroke();
      ctx.globalAlpha = 0.13;
      ctx.strokeStyle = '#c08a58';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x + 2.5, WALL_TOP - 30);
      ctx.lineTo(x + 2.5, floorTop);
      ctx.stroke();
    }
    // Two horizontal rails break up the height.
    ctx.globalAlpha = 0.26;
    ctx.fillStyle = '#120a10';
    ctx.fillRect(0, WALL_TOP + 128, width, 6);
    ctx.fillRect(0, floorTop - 96, width, 6);
  });

  // --- ceiling beam and the lantern string
  fillRoundRect(ctx, 0, 0, width, WALL_TOP - 26, 0, '#150d12');
  fillRoundRect(ctx, 0, WALL_TOP - 34, width, 34, 0, '#2c1a17');
  withState(ctx, () => {
    ctx.globalAlpha = 0.42;
    fillRoundRect(ctx, 0, WALL_TOP - 34, width, 6, 0, '#7a4f34');
  });

  // The wire the lanterns hang from, sagging between them.
  const lamps = lanternRow(width);
  withState(ctx, () => {
    ctx.strokeStyle = '#1b1013';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(0, WALL_TOP - 6);
    for (const lamp of lamps) ctx.quadraticCurveTo(lamp.x - 40, lamp.y - 34, lamp.x, lamp.y - 30);
    ctx.lineTo(width, WALL_TOP - 6);
    ctx.stroke();
  });

  drawEntrance(ctx, width * 0.075, floorTop, time);
  drawWallMenu(ctx, width * 0.655, WALL_TOP + 78);

  for (const [i, lamp] of lamps.entries()) {
    drawSmallLantern(ctx, lamp.x, lamp.y, lamp.r, Math.sin(time * 0.7 + i * 1.3) * 0.035, GLYPHS[i % GLYPHS.length] as string);
  }

  // Warm pool washing down the wall from the lantern row.
  withState(ctx, () => {
    ctx.globalCompositeOperation = 'lighter';
    const wash = ctx.createLinearGradient(0, WALL_TOP, 0, floorTop);
    wash.addColorStop(0, alpha('#ff9a48', 0.14));
    wash.addColorStop(1, alpha('#ff7a30', 0.03));
    ctx.fillStyle = wash;
    ctx.fillRect(0, WALL_TOP - 20, width, floorTop - WALL_TOP + 20);
  });

  // --- floor
  ctx.fillStyle = linearPaint(ctx, 0, floorTop, 0, height, [
    { at: 0, color: '#4d3020' },
    { at: 0.45, color: '#3d2619' },
    { at: 1, color: '#241510' },
  ]);
  ctx.fillRect(0, floorTop, width, height - floorTop);

  withState(ctx, () => {
    ctx.beginPath();
    ctx.rect(0, floorTop, width, height - floorTop);
    ctx.clip();
    overlayTexture(ctx, 'wood', 0, floorTop, width, height - floorTop, 0.24, 'overlay', 0.6);
  });

  // Floorboards running away from the viewer, converging on a vanishing point.
  withState(ctx, () => {
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = '#160c07';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 18; i++) {
      const t = i / 18;
      const xBack = width * (0.16 + t * 0.68);
      const xFront = width / 2 + (t - 0.5) * width * 1.5;
      ctx.beginPath();
      ctx.moveTo(xBack, floorTop);
      ctx.lineTo(xFront, height);
      ctx.stroke();
    }
    // A few cross-boards, spaced out as they come forward.
    ctx.globalAlpha = 0.16;
    for (let i = 1; i <= 5; i++) {
      const y = floorTop + (height - floorTop) * (i / 5) ** 1.6;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  });

  // Lamplight pooling on the boards.
  withState(ctx, () => {
    ctx.globalCompositeOperation = 'lighter';
    const pool = ctx.createRadialGradient(width / 2, floorTop + 40, 40, width / 2, floorTop + 60, width * 0.62);
    pool.addColorStop(0, alpha('#ff9440', 0.14));
    pool.addColorStop(1, alpha('#ff7a30', 0));
    ctx.fillStyle = pool;
    ctx.fillRect(0, floorTop, width, height - floorTop);
  });

  // The skirting where wall meets floor grounds the whole room.
  withState(ctx, () => {
    ctx.fillStyle = '#150c0a';
    ctx.fillRect(0, floorTop - 11, width, 13);
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = LAMP.warm;
    ctx.fillRect(0, floorTop - 11, width, 2.5);
  });
}

const GLYPHS = ['夜', '雀', '食', '堂', '営', '業', '妖'];

function lanternRow(width: number): Array<{ x: number; y: number; r: number }> {
  const n = 7;
  return Array.from({ length: n }, (_, i) => ({
    x: (width / n) * (i + 0.5),
    y: WALL_TOP + 22 - Math.abs(i - (n - 1) / 2) * 2.5,
    r: 25,
  }));
}

function drawSmallLantern(ctx: Ctx2D, x: number, y: number, r: number, sway: number, glyph: string): void {
  withTransform(ctx, x, y - r * 2.4, () => {
    ctx.rotate(sway);
    ctx.translate(0, r * 2.4);
    const h = r * 1.35;
    ctx.strokeStyle = '#241618';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(0, -r * 2.4);
    ctx.lineTo(0, -h);
    ctx.stroke();

    const body = ctx.createRadialGradient(-r * 0.18, -h * 0.2, r * 0.06, 0, 0, r * 1.2);
    body.addColorStop(0, '#ffd689');
    body.addColorStop(0.3, '#ff8a3c');
    body.addColorStop(0.68, '#e8412a');
    body.addColorStop(1, '#8a1c12');
    fillEllipse(ctx, 0, 0, r, h, body);
    // Paper ribs.
    withState(ctx, () => {
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = '#5a1408';
      ctx.lineWidth = 1.1;
      for (let i = -2; i <= 2; i++) {
        const yy = (i / 3) * h;
        ctx.beginPath();
        ctx.ellipse(0, yy, r * Math.sqrt(Math.max(0.02, 1 - (yy / h) ** 2)), 2.2, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
    fillRoundRect(ctx, -r * 0.4, -h - r * 0.18, r * 0.8, r * 0.22, 3, '#241416');
    fillRoundRect(ctx, -r * 0.4, h - r * 0.04, r * 0.8, r * 0.22, 3, '#241416');
    withState(ctx, () => {
      ctx.fillStyle = alpha('#4a0f08', 0.88);
      ctx.font = `800 ${Math.round(r * 0.92)}px "Shippori Mincho", serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(glyph, 0, 1);
    });
  });
}

/** The shop doorway, with a noren curtain across it. */
function drawEntrance(ctx: Ctx2D, cx: number, floorTop: number, time: number): void {
  const w = 210;
  const h = 250;
  const top = floorTop - h;

  // Opening into the night outside.
  ctx.fillStyle = linearPaint(ctx, 0, top, 0, floorTop, [
    { at: 0, color: '#0b0a1c' },
    { at: 1, color: '#171432' },
  ]);
  ctx.fillRect(cx - w / 2, top, w, h);
  withState(ctx, () => {
    ctx.globalAlpha = 0.5;
    fillCircle(ctx, cx + 44, top + 54, 15, '#c9d4ff');
  });
  // Frame.
  withState(ctx, () => {
    ctx.strokeStyle = '#20130f';
    ctx.lineWidth = 11;
    ctx.strokeRect(cx - w / 2, top, w, h);
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#8a5a38';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(cx - w / 2 - 4, top - 4, w + 8, h + 8);
  });

  // Noren: four panels, drifting.
  const panels = 4;
  for (let i = 0; i < panels; i++) {
    const pw = (w - 10) / panels;
    const px = cx - w / 2 + 5 + i * pw;
    const sway = Math.sin(time * 0.8 + i * 0.9) * 3;
    withState(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(px + 1, top + 2);
      ctx.lineTo(px + pw - 1, top + 2);
      ctx.lineTo(px + pw - 1 + sway, top + 118);
      ctx.lineTo(px + 1 + sway, top + 122);
      ctx.closePath();
      ctx.fillStyle = linearPaint(ctx, 0, top, 0, top + 120, [
        { at: 0, color: '#8e1f2a' },
        { at: 1, color: '#6a1520' },
      ]);
      ctx.fill();
      ctx.strokeStyle = alpha('#400c14', 0.7);
      ctx.lineWidth = 1.4;
      ctx.stroke();
    });
    const glyph = ['夜', '雀', '食', '堂'][i] as string;
    withState(ctx, () => {
      ctx.fillStyle = '#f2e0bd';
      ctx.font = '800 30px "Shippori Mincho", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(glyph, px + pw / 2 + sway * 0.5, top + 62);
    });
  }
  // Rod.
  fillRoundRect(ctx, cx - w / 2 - 6, top - 4, w + 12, 9, 4, '#2e1b12');
}

/** A hand-written menu board hung on the wall. */
function drawWallMenu(ctx: Ctx2D, cx: number, top: number): void {
  const w = 168;
  const h = 216;
  withState(ctx, () => {
    ctx.rotate(0);
    fillRoundRect(ctx, cx - w / 2 + 4, top + 5, w, h, 5, alpha('#000', 0.4));
    fillRoundRect(ctx, cx - w / 2, top, w, h, 5, '#2a1a13');
    fillRoundRect(ctx, cx - w / 2 + 7, top + 7, w - 14, h - 14, 3, '#d8c69c');
    ctx.fillStyle = alpha('#2a1610', 0.72);
    ctx.textAlign = 'center';
    ctx.font = '800 26px "Shippori Mincho", serif';
    ctx.fillText('お品書', cx, top + 42);
    // Ink strokes standing in for a list of dishes.
    const rand = mulberry32(hashSeed('wall-menu'));
    ctx.fillStyle = alpha('#3a2318', 0.5);
    for (let i = 0; i < 7; i++) {
      const lw = 60 + rand() * 54;
      ctx.fillRect(cx - lw / 2, top + 64 + i * 20, lw, 6);
    }
  });
}

// -------------------------------------------------------------- furniture

const COOKWARE_LABEL: Record<string, string> = {
  Grill: '烤架',
  'Boiling Pot': '煮锅',
  'Frying Pan': '油锅',
  Steamer: '蒸锅',
  'Cutting Board': '料理台',
  Any: '灶台',
};

export interface StationVisual {
  busy: boolean;
  ready: boolean;
  ruined: boolean;
  progress: number;
  /** Highlighted because Mystia is standing in range. */
  focus: boolean;
}

/** A kitchen station: a counter block with the right cookware sitting on it. */
export function drawStation(ctx: Ctx2D, slot: StationSlot, time: number, state: StationVisual): void {
  const sx = FLOOR.originX + slot.x;
  const base = baseOf(slot);
  const w = slot.w;
  const bodyH = 118;
  const topY = base - bodyH;

  groundShadow(ctx, sx + w / 2, base + 2, w * 0.62, 15, 0.45);

  // Cabinet.
  fillRoundRect(ctx, sx, topY + 14, w, bodyH - 14, 5, '#291a15');
  fillRoundRect(ctx, sx + 3, topY + 16, w - 6, bodyH - 20, 4, '#4c3122');
  withState(ctx, () => {
    ctx.beginPath();
    ctx.roundRect?.(sx + 3, topY + 16, w - 6, bodyH - 20, 4);
    ctx.clip();
    overlayTexture(ctx, 'wood', sx, topY, w, bodyH, 0.3, 'overlay', 0.4);
    // Two panel doors.
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#1d110c';
    ctx.lineWidth = 2;
    ctx.strokeRect(sx + 12, topY + 28, w / 2 - 18, bodyH - 46);
    ctx.strokeRect(sx + w / 2 + 6, topY + 28, w / 2 - 18, bodyH - 46);
  });

  // Stone counter top, drawn as a slab seen slightly from above.
  withState(ctx, () => {
    polygon(ctx, [sx + 7, topY - 12, sx + w - 7, topY - 12, sx + w + 3, topY + 16, sx - 3, topY + 16]);
    ctx.fillStyle = linearPaint(ctx, 0, topY - 12, 0, topY + 16, [
      { at: 0, color: '#9a8b7e' },
      { at: 0.45, color: '#6d5d52' },
      { at: 1, color: '#3a2f2a' },
    ]);
    ctx.fill();
    ctx.strokeStyle = '#1d1512';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  });
  withState(ctx, () => {
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = '#ffcf96';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx + 8, topY - 10.5);
    ctx.lineTo(sx + w - 8, topY - 10.5);
    ctx.stroke();
  });

  withState(ctx, () => {
    ctx.translate(sx + w / 2, topY - 8);
    ctx.scale(1.24, 1.24);
    drawCookware(ctx, slot.kind, 0, 0, time, state.busy);
  });

  if (state.busy) {
    const barW = w - 36;
    fillRoundRect(ctx, sx + 18, base - 22, barW, 9, 4, alpha('#0d0910', 0.85));
    fillRoundRect(ctx, sx + 18, base - 22, barW * Math.max(0, Math.min(1, state.progress)), 9, 4, LAMP.warm);
  } else if (state.ready) {
    const lift = Math.sin(time * 3.2) * 3;
    drawPlate(ctx, sx + w / 2 + 34, topY - 16 + lift, 0.9, state.ruined);
    withState(ctx, () => {
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(time * 3.2);
      strokeRoundRect(ctx, sx - 4, topY - 16, w + 8, bodyH + 14, 8, state.ruined ? '#c86ad8' : '#ffd98a', 3);
    });
  }

  if (state.focus) {
    withState(ctx, () => {
      ctx.globalAlpha = 0.55;
      strokeRoundRect(ctx, sx - 6, topY - 18, w + 12, bodyH + 18, 9, '#ffe9b0', 2.4);
    });
  }

  // Name plate on the cabinet front.
  withState(ctx, () => {
    const label = COOKWARE_LABEL[slot.kind] ?? slot.kind;
    ctx.font = '700 16px "Zen Maru Gothic", sans-serif';
    const w2 = ctx.measureText(label).width + 20;
    fillRoundRect(ctx, sx + w / 2 - w2 / 2, base - 46, w2, 22, 5, alpha('#160e13', 0.7));
    ctx.fillStyle = alpha('#f2e2c2', 0.92);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, sx + w / 2, base - 34);
  });
}

/** The pot, grill, wok, steamer or board that makes a station recognisable. */
function drawCookware(ctx: Ctx2D, kind: string, cx: number, cy: number, time: number, busy: boolean): void {
  // Everything below hangs off (cx, cy) = the middle of the counter's front lip.
  const flame = (x: number, spread: number, n: number): void => {
    if (!busy) return;
    const rand = mulberry32(hashSeed(`flame:${kind}:${Math.round(x)}`));
    for (let i = 0; i < n; i++) {
      const fx = x + (rand() - 0.5) * spread;
      const heat = 0.5 + 0.5 * Math.sin(time * (3 + rand() * 3) + i * 1.7);
      fillEllipse(ctx, fx, cy + 2 - heat * 3, 4.5, 7 + heat * 8, alpha(mix('#ff5a12', '#ffd06a', heat), 0.45 + heat * 0.4));
    }
  };

  switch (kind) {
    case 'Grill': {
      // Charcoal box with a bar grate over it.
      fillRoundRect(ctx, cx - 46, cy - 16, 92, 22, 4, '#241a18');
      withState(ctx, () => {
        for (let i = 0; i < 6; i++) {
          const gx = cx - 38 + i * 15;
          const heat = 0.45 + 0.55 * Math.abs(Math.sin(time * 1.6 + i));
          fillEllipse(ctx, gx, cy - 5, 6, 4, alpha(mix('#5a1a08', '#ff8a2c', busy ? heat : heat * 0.45), 0.95));
        }
      });
      withState(ctx, () => {
        ctx.strokeStyle = '#3a3033';
        ctx.lineWidth = 3;
        for (let i = 0; i < 7; i++) {
          const gx = cx - 42 + i * 14;
          ctx.beginPath();
          ctx.moveTo(gx, cy - 18);
          ctx.lineTo(gx, cy - 2);
          ctx.stroke();
        }
      });
      if (busy) {
        // Skewers over the coals.
        for (let i = 0; i < 3; i++) {
          const gx = cx - 26 + i * 26;
          fillRoundRect(ctx, gx - 12, cy - 24, 24, 8, 4, '#a9622f');
          fillRoundRect(ctx, gx + 10, cy - 22, 16, 3, 2, '#c8a06a');
        }
        flame(cx, 70, 5);
      }
      break;
    }
    case 'Boiling Pot': {
      fillEllipse(ctx, cx, cy - 4, 34, 11, '#1d1618');
      fillRoundRect(ctx, cx - 32, cy - 34, 64, 32, 6, '#38312f');
      fillEllipse(ctx, cx, cy - 34, 32, 10, '#4a413e');
      fillEllipse(ctx, cx, cy - 34, 26, 7.5, busy ? '#d8b06a' : '#20262a');
      if (busy) {
        for (let i = 0; i < 3; i++) {
          const b = (time * 1.4 + i * 0.37) % 1;
          fillCircle(ctx, cx - 12 + i * 12, cy - 36 - b * 5, 2.2 + b * 1.8, alpha('#ffe9c0', 0.7 - b * 0.5));
        }
      }
      // Handles.
      withState(ctx, () => {
        ctx.strokeStyle = '#2a2422';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(cx - 34, cy - 22, 7, Math.PI * 0.4, Math.PI * 1.6);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx + 34, cy - 22, 7, -Math.PI * 0.6, Math.PI * 0.6);
        ctx.stroke();
      });
      flame(cx, 52, 4);
      break;
    }
    case 'Frying Pan': {
      // A wok, tilted.
      withState(ctx, () => {
        ctx.beginPath();
        ctx.ellipse(cx, cy - 22, 36, 12, 0, Math.PI, Math.PI * 2);
        ctx.ellipse(cx, cy - 22, 36, 22, 0, 0, Math.PI);
        ctx.fillStyle = linearPaint(ctx, 0, cy - 34, 0, cy, [
          { at: 0, color: '#4a3f3a' },
          { at: 1, color: '#241d1c' },
        ]);
        ctx.fill();
      });
      fillEllipse(ctx, cx, cy - 22, 32, 10, busy ? '#e0a145' : '#2b2320');
      if (busy) {
        fillEllipse(ctx, cx - 6, cy - 24, 12, 5, '#f0c072');
        fillEllipse(ctx, cx + 9, cy - 26, 8, 4, '#c8863a');
      }
      fillRoundRect(ctx, cx + 32, cy - 28, 34, 7, 3, '#2e1c14');
      flame(cx, 56, 4);
      break;
    }
    case 'Steamer': {
      // Stacked bamboo baskets.
      for (let i = 0; i < 3; i++) {
        const by = cy - 8 - i * 15;
        fillEllipse(ctx, cx, by, 34, 11, i === 2 ? '#c8a066' : '#b08a52');
        fillRoundRect(ctx, cx - 34, by - 12, 68, 14, 3, mix('#b08a52', '#6a4c28', i * 0.18));
        withState(ctx, () => {
          ctx.globalAlpha = 0.3;
          ctx.strokeStyle = '#4c3418';
          ctx.lineWidth = 1.2;
          for (let k = 0; k < 6; k++) {
            ctx.beginPath();
            ctx.moveTo(cx - 30 + k * 12, by - 11);
            ctx.lineTo(cx - 30 + k * 12, by + 1);
            ctx.stroke();
          }
        });
      }
      fillEllipse(ctx, cx, cy - 52, 34, 11, '#d8b478');
      if (busy) {
        for (let i = 0; i < 4; i++) {
          const p = (time * 0.55 + i * 0.25) % 1;
          fillCircle(ctx, cx - 18 + i * 12 + Math.sin(time * 2 + i) * 5, cy - 56 - p * 42, 6 + p * 9, alpha('#ffffff', 0.16 * (1 - p)));
        }
      }
      flame(cx, 50, 3);
      break;
    }
    default: {
      // Cutting board with a knife and a few prepped slices.
      fillRoundRect(ctx, cx - 46, cy - 16, 92, 16, 4, '#8a6136');
      fillRoundRect(ctx, cx - 46, cy - 16, 92, 5, 3, '#a97c48');
      withState(ctx, () => {
        ctx.globalAlpha = 0.28;
        ctx.strokeStyle = '#54371a';
        ctx.lineWidth = 1.2;
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.moveTo(cx - 38 + i * 19, cy - 15);
          ctx.lineTo(cx - 34 + i * 19, cy - 2);
          ctx.stroke();
        }
      });
      for (let i = 0; i < 4; i++) fillEllipse(ctx, cx - 22 + i * 11, cy - 18, 5.5, 2.6, '#e8d09a');
      // Knife.
      polygon(ctx, [cx + 12, cy - 22, cx + 44, cy - 26, cx + 44, cy - 20, cx + 12, cy - 18]);
      ctx.fillStyle = '#c8cdd4';
      ctx.fill();
      fillRoundRect(ctx, cx + 2, cy - 23, 13, 6, 2, '#2e1b12');
      break;
    }
  }
}

/** A guest table. */
export function drawTable(ctx: Ctx2D, slot: Obstacle, plate: { ruined: boolean } | null, time: number): void {
  const sx = FLOOR.originX + slot.x;
  const base = baseOf(slot);
  const w = slot.w;
  const h = 104;
  const topY = base - h;

  groundShadow(ctx, sx + w / 2, base + 1, w * 0.6, 14, 0.42);

  // Legs.
  for (const lx of [sx + 16, sx + w - 26]) {
    fillRoundRect(ctx, lx, topY + 16, 10, h - 14, 3, '#251710');
    withState(ctx, () => {
      ctx.globalAlpha = 0.3;
      fillRoundRect(ctx, lx, topY + 16, 3, h - 14, 2, '#9a6a40');
    });
  }
  // Cross-brace.
  fillRoundRect(ctx, sx + 20, base - 22, w - 44, 6, 3, '#2b1c13');

  // Top slab.
  withState(ctx, () => {
    polygon(ctx, [sx + 6, topY - 8, sx + w - 6, topY - 8, sx + w + 4, topY + 18, sx - 4, topY + 18]);
    ctx.fillStyle = linearPaint(ctx, 0, topY - 8, 0, topY + 18, [
      { at: 0, color: '#a67043' },
      { at: 0.55, color: '#8a5730' },
      { at: 1, color: '#5c3820' },
    ]);
    ctx.fill();
    ctx.strokeStyle = '#2e1c0f';
    ctx.lineWidth = 1.7;
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(sx - 4, topY - 8, w + 8, 26);
    ctx.clip();
    overlayTexture(ctx, 'wood', sx - 4, topY - 8, w + 8, 26, 0.26, 'overlay', 0.3);
  });
  withState(ctx, () => {
    ctx.globalAlpha = 0.42;
    ctx.strokeStyle = '#ffcf96';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx + 7, topY - 6.5);
    ctx.lineTo(sx + w - 7, topY - 6.5);
    ctx.stroke();
  });

  // Standing dressing: a tokkuri and a cup.
  fillRoundRect(ctx, sx + 18, topY - 22, 13, 16, 4, '#cfe0e8');
  fillRoundRect(ctx, sx + 22, topY - 27, 5, 6, 2, '#cfe0e8');
  fillEllipse(ctx, sx + 40, topY - 8, 7, 3.2, '#e6dcc4');

  if (plate) {
    drawPlate(ctx, sx + w / 2 + 12, topY - 4 + Math.sin(time * 2) * 0.6, 0.95, plate.ruined);
  }
}

/** Sake barrels or crates stacked in a corner. Scenery, but solid. */
export function drawClutter(ctx: Ctx2D, slot: Obstacle & { kind: 'barrels' | 'crates' }): void {
  const sx = FLOOR.originX + slot.x;
  const base = baseOf(slot);
  const w = slot.w;

  groundShadow(ctx, sx + w / 2, base + 1, w * 0.62, 15, 0.45);

  if (slot.kind === 'barrels') {
    // Two kazaridaru at the bottom, one balanced on top.
    const barrel = (cx: number, cy: number, r: number): void => {
      fillRoundRect(ctx, cx - r, cy - r * 1.5, r * 2, r * 1.5 + r * 0.4, 8, '#c8b489');
      withState(ctx, () => {
        ctx.globalAlpha = 0.9;
        fillRoundRect(ctx, cx - r, cy - r * 1.12, r * 2, r * 0.5, 3, '#7d2733');
      });
      fillEllipse(ctx, cx, cy - r * 1.5, r, r * 0.32, '#e2d2ab');
      // Rope hoops.
      withState(ctx, () => {
        ctx.strokeStyle = '#5e4222';
        ctx.lineWidth = 3;
        for (const oy of [-r * 1.18, -r * 0.25]) {
          ctx.beginPath();
          ctx.moveTo(cx - r + 1, cy + oy);
          ctx.lineTo(cx + r - 1, cy + oy);
          ctx.stroke();
        }
      });
      withState(ctx, () => {
        ctx.fillStyle = '#3a2318';
        ctx.font = `800 ${Math.round(r * 0.72)}px "Shippori Mincho", serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('酒', cx, cy - r * 0.62);
      });
    };
    withState(ctx, () => {
      ctx.strokeStyle = '#1c1009';
      ctx.lineWidth = 3;
      ctx.strokeRect(sx + 2, base - 46, 116, 46);
    });
    barrel(sx + 32, base, 30);
    barrel(sx + 88, base, 30);
    barrel(sx + 60, base - 46, 26);
  } else {
    // A stack of produce crates with a daikon poking out.
    const crate = (cx: number, cy: number, cw: number, ch: number): void => {
      fillRoundRect(ctx, cx - cw / 2, cy - ch, cw, ch, 3, '#7d5730');
      fillRoundRect(ctx, cx - cw / 2 + 3, cy - ch + 3, cw - 6, ch - 6, 2, '#5e3f22');
      withState(ctx, () => {
        ctx.strokeStyle = '#8f6739';
        ctx.lineWidth = 3;
        for (let i = 1; i < 3; i++) {
          const yy = cy - ch + (ch / 3) * i;
          ctx.beginPath();
          ctx.moveTo(cx - cw / 2 + 3, yy);
          ctx.lineTo(cx + cw / 2 - 3, yy);
          ctx.stroke();
        }
      });
    };
    crate(sx + 44, base, 84, 54);
    crate(sx + 96, base, 62, 40);
    crate(sx + 44, base - 54, 70, 44);
    // Greens sticking out of the top crate.
    for (const [dx, len] of [[-14, 26], [-2, 34], [11, 24]] as const) {
      withState(ctx, () => {
        ctx.strokeStyle = '#6f9a49';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(sx + 44 + dx, base - 96);
        ctx.quadraticCurveTo(sx + 44 + dx * 2, base - 96 - len * 0.7, sx + 44 + dx * 2.4, base - 96 - len);
        ctx.stroke();
      });
    }
  }
}

/** A round zabuton stool, drawn behind a table for the guest to sit on. */
export function drawStool(ctx: Ctx2D, cx: number, floorY: number, scale: number): void {
  withTransform(ctx, cx, floorY, () => {
    ctx.scale(scale, scale);
    groundShadow(ctx, 0, 2, 34, 10, 0.4);
    fillRoundRect(ctx, -26, -22, 52, 24, 6, '#3a2016');
    fillEllipse(ctx, 0, -22, 27, 9, '#7d2733');
    fillEllipse(ctx, 0, -24, 22, 7, '#98333f');
  });
}

/** The drink shelf at the end of the room. */
export function drawShelf(ctx: Ctx2D, slot: Obstacle, focus: boolean): void {
  const sx = FLOOR.originX + slot.x;
  const base = baseOf(slot);
  const w = slot.w;
  const h = 268;
  const topY = base - h;

  groundShadow(ctx, sx + w / 2, base + 1, w * 0.6, 14, 0.45);

  fillRoundRect(ctx, sx, topY, w, h, 5, '#241610');
  fillRoundRect(ctx, sx + 6, topY + 6, w - 12, h - 12, 4, '#432a1c');
  withState(ctx, () => {
    ctx.beginPath();
    ctx.roundRect?.(sx + 6, topY + 6, w - 12, h - 12, 4);
    ctx.clip();
    overlayTexture(ctx, 'wood', sx, topY, w, h, 0.3, 'overlay', 0.4);
  });

  const rand = mulberry32(hashSeed('shelf-bottles'));
  const glass = ['#3f6a52', '#7a4632', '#2f4f74', '#8a6a34', '#4f3560', '#6a2f3a'];
  for (let row = 0; row < 4; row++) {
    const shelfY = topY + 62 + row * 52;
    fillRoundRect(ctx, sx + 10, shelfY, w - 20, 6, 2, '#1c110c');
    withState(ctx, () => {
      ctx.globalAlpha = 0.3;
      fillRoundRect(ctx, sx + 10, shelfY, w - 20, 2, 1, '#c89a62');
    });
    const n = 5;
    for (let i = 0; i < n; i++) {
      const bx = sx + 24 + i * ((w - 48) / (n - 1));
      const bh = 24 + rand() * 16;
      const bw = 8 + rand() * 4;
      const hue = glass[Math.floor(rand() * glass.length)] as string;
      fillRoundRect(ctx, bx - bw / 2, shelfY - bh, bw, bh, 2, hue);
      fillRoundRect(ctx, bx - 1.6, shelfY - bh - 7, 3.2, 8, 1, shift(hue, -0.28));
      fillRoundRect(ctx, bx - 2.2, shelfY - bh - 9, 4.4, 3, 1, '#d8c8a0');
      withState(ctx, () => {
        ctx.globalAlpha = 0.42;
        fillRoundRect(ctx, bx - bw / 2 + 1.4, shelfY - bh + 3, 1.6, bh - 7, 1, '#fff');
      });
      // Paper label.
      withState(ctx, () => {
        ctx.globalAlpha = 0.75;
        fillRoundRect(ctx, bx - bw / 2 + 1, shelfY - bh * 0.55, bw - 2, 9, 1, '#e6d6ae');
      });
    }
  }

  if (focus) {
    withState(ctx, () => {
      ctx.globalAlpha = 0.55;
      strokeRoundRect(ctx, sx - 5, topY - 5, w + 10, h + 10, 8, '#ffe9b0', 2.4);
    });
  }

  withState(ctx, () => {
    fillRoundRect(ctx, sx + w / 2 - 42, topY + 16, 84, 30, 5, alpha('#160e13', 0.72));
    ctx.fillStyle = alpha('#f2e2c2', 0.94);
    ctx.font = '700 21px "Shippori Mincho", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('酒棚', sx + w / 2, topY + 32);
  });
}

/** A served plate. Used on stations, in Mystia's hands and mid-flight. */
export function drawPlate(ctx: Ctx2D, x: number, y: number, scale = 1, ruined = false): void {
  withTransform(ctx, x, y, () => {
    ctx.scale(scale, scale);
    withState(ctx, () => {
      ctx.globalAlpha = 0.35;
      fillEllipse(ctx, 0, 5, 22, 6, '#000');
    });
    fillEllipse(ctx, 0, 1, 22, 8.5, ruined ? '#3c2a4c' : '#f4ead6');
    fillEllipse(ctx, 0, -1, 22, 8, ruined ? '#4e3866' : '#fdf6e6');
    fillEllipse(ctx, 0, -1.5, 15, 5.2, ruined ? '#2e2038' : '#e4d5b8');
    if (ruined) {
      fillEllipse(ctx, 0, -6, 12, 9, '#3d2b4c');
      withState(ctx, () => {
        ctx.globalAlpha = 0.7;
        fillCircle(ctx, -4, -9, 2.4, '#d07ce0');
        fillCircle(ctx, 5, -11, 1.8, '#b060d0');
      });
      withState(ctx, () => {
        ctx.fillStyle = '#e6a4f0';
        ctx.font = '800 14px "Zen Maru Gothic", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('？', 0, -6);
      });
    } else {
      fillEllipse(ctx, 0, -6, 12.5, 8, '#c8823c');
      fillEllipse(ctx, -3.5, -9, 6.5, 4.2, '#e8ac66');
      fillEllipse(ctx, 5, -8.5, 4.5, 3, '#7fae52');
      fillEllipse(ctx, 1, -12, 3.4, 2.4, '#f0d69a');
    }
  });
}

/** A cup of whatever was poured, carried alongside the plate. */
export function drawCup(ctx: Ctx2D, x: number, y: number, scale = 1, tint = '#d8b45c'): void {
  withTransform(ctx, x, y, () => {
    ctx.scale(scale, scale);
    fillRoundRect(ctx, -7, -13, 14, 15, 3, '#efe6d2');
    fillEllipse(ctx, 0, -12, 6.4, 2.4, tint);
    withState(ctx, () => {
      ctx.globalAlpha = 0.5;
      fillRoundRect(ctx, -5, -11, 2, 10, 1, '#fff');
    });
  });
}

/** Emissive pass for the interior. */
export function drawInteriorLights(ctx: Ctx2D, layout: FloorLayout, width: number, time: number): void {
  for (const [i, lamp] of lanternRow(width).entries()) {
    const f = 1 + 0.05 * Math.sin(time * 0.7 + i) + 0.03 * Math.sin(time * 1.9 + i * 2.3);
    softGlow(ctx, lamp.x, lamp.y, lamp.r * 4.2 * f, '#ff7328', 0.26 * f);
    softGlow(ctx, lamp.x, lamp.y, lamp.r * 0.85, '#ffb45e', 0.22 * f);
  }
  // Each lit station throws a pool onto the wall and floor.
  for (const st of layout.stations) {
    const s = toScreen({ x: st.x + st.w / 2, y: st.y + st.h / 2 });
    softGlow(ctx, s.x, s.y - 34, 110, '#ff6a28', 0.13 + 0.04 * Math.sin(time * 2.1 + st.index));
  }
  // Moonlight in the doorway.
  softGlow(ctx, width * 0.075 + 44, FLOOR.originY - 196, 74, '#9fb4ff', 0.16);
}
