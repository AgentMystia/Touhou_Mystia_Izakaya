/**
 * Character art.
 *
 * Every figure is drawn from a shared chibi rig rather than from image files,
 * so the whole cast is data: a palette plus a handful of shape choices. What
 * makes sixteen characters read as sixteen characters at a glance is
 * silhouette first (wings, hat, ears, hair mass) and palette second, which is
 * why those are the axes the spec exposes.
 *
 * The rig is drawn in its own space: the origin sits between the feet, y runs
 * upward as negative, and a figure is about 150 units tall.
 */

import { alpha, glow, shade, shift } from './palette';
import {
  fillBlob,
  fillCircle,
  fillEllipse,
  fillPolygon,
  withState,
  withTransform,
} from '../gfx/vector';

type Ctx2D = CanvasRenderingContext2D;

export type HairStyle = 'long' | 'short' | 'twin' | 'bob' | 'wavy' | 'side' | 'braids' | 'bun';
export type Bangs = 'blunt' | 'split' | 'swept';
export type Headwear =
  | 'none' | 'witch' | 'mob' | 'ribbon' | 'tokin' | 'cap' | 'flower' | 'horns' | 'crown' | 'wreath';
export type Wings = 'none' | 'bird' | 'bat' | 'ice' | 'fairy' | 'leaf';
export type Ears = 'none' | 'cat' | 'fox' | 'rabbit' | 'wolf' | 'bird';
export type Outfit = 'miko' | 'witch' | 'dress' | 'kimono' | 'vest' | 'apron' | 'shirt' | 'robe';

export interface CharacterPalette {
  hair: string;
  eye: string;
  skin: string;
  main: string;
  accent: string;
  trim: string;
}

export interface CharacterSpec {
  id: string;
  name: string;
  short: string;
  palette: CharacterPalette;
  hair: HairStyle;
  bangs: Bangs;
  headwear: Headwear;
  wings: Wings;
  ears: Ears;
  outfit: Outfit;
  /** 0.9 = small and round, 1.1 = lankier. */
  build: number;
  /** Idle animation personality. */
  idle: { bobAmp: number; bobHz: number; swayDeg: number };
}

export interface DrawOptions {
  /** Seconds, for idle bob and blinking. */
  time: number;
  /** Height in world units; the rig is authored at 150. */
  height?: number;
  /** Mirrors the figure. */
  flip?: boolean;
  /** 0-1, drives a happy/sad mouth and brow. */
  mood?: number;
  /** Suppresses idle motion, for static portraits. */
  still?: boolean;
  /** Direction of the key light, for the rim pass. */
  rimFrom?: number;
}

const RIG_HEIGHT = 150;
const HEAD_R = 35;
const HEAD_CY = -108;
const SHOULDER_Y = -68;
const HIP_Y = -24;

// ---------------------------------------------------------------- helpers

const skinShade = (p: CharacterPalette) => shift(p.skin, -0.16);
const hairDark = (p: CharacterPalette) => shift(p.hair, -0.3);
const hairLight = (p: CharacterPalette) => shift(p.hair, 0.28);

/** Deterministic per-character phase so a crowd does not bob in lockstep. */
const phaseOf = (id: string): number => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
};

// ------------------------------------------------------------------ parts

function drawWings(ctx: Ctx2D, spec: CharacterSpec, flap: number): void {
  const p = spec.palette;
  if (spec.wings === 'none') return;

  const sweep = Math.sin(flap) * 5;

  const pair = (draw: (side: 1 | -1) => void) => {
    draw(1);
    draw(-1);
  };

  switch (spec.wings) {
    case 'bird':
      pair((side) => {
        withTransform(ctx, side * 17, SHOULDER_Y + 8, () => {
          // Rotated most of the way to horizontal so the wing spreads out
          // behind the shoulder instead of rising past the head.
          ctx.rotate(side * (1.16 + sweep * 0.02));
          // Layered flight feathers, longest at the trailing edge.
          for (let i = 0; i < 4; i++) {
            const len = 58 - i * 11;
            fillBlob(
              ctx,
              [
                [0, i * 5],
                [side * (18 + i * 3), -len * 0.42 + i * 4],
                [side * (12 + i * 2), -len + i * 3],
                [side * -5, -len * 0.55 + i * 4],
              ],
              shift(p.accent, -0.16 + 0.1 * i),
            );
          }
          // Shoulder covert, tucking the feather roots under a rounder mass.
          fillEllipse(ctx, side * 6, -6, 13, 10, shift(p.accent, -0.24), side * 0.4);
        });
      });
      break;

    case 'bat':
      pair((side) => {
        withTransform(ctx, side * 24, SHOULDER_Y - 4, () => {
          ctx.rotate(side * (0.2 + sweep * 0.03));
          fillBlob(
            ctx,
            [
              [0, 0],
              [side * 46, -34],
              [side * 40, -6],
              [side * 50, 6],
              [side * 34, 10],
              [side * 40, 24],
              [side * 6, 16],
            ],
            shift(p.accent, -0.12),
          );
          ctx.strokeStyle = shade(0.25);
          ctx.lineWidth = 2;
          ctx.stroke();
        });
      });
      break;

    case 'ice':
      pair((side) => {
        withTransform(ctx, side * 18, SHOULDER_Y + 2, () => {
          for (let i = 0; i < 3; i++) {
            // Fanned out and back, so the crystals clear the head.
            const a = side * (0.85 + i * 0.4);
            withTransform(ctx, 0, 0, () => {
              ctx.rotate(a);
              const g = ctx.createLinearGradient(0, 0, 0, -62);
              g.addColorStop(0, alpha('#6fc4ee', 0.95));
              g.addColorStop(0.55, alpha('#b6e8ff', 0.9));
              g.addColorStop(1, alpha('#ffffff', 0.6));
              fillPolygon(ctx, [0, 0, -11, -34, 0, -62, 11, -34], g);
              ctx.strokeStyle = alpha('#4aa8d8', 0.6);
              ctx.lineWidth = 1.6;
              ctx.stroke();
            });
          }
        });
      });
      break;

    case 'fairy':
      pair((side) => {
        withTransform(ctx, side * 20, SHOULDER_Y - 8, () => {
          ctx.rotate(side * (0.3 + sweep * 0.03));
          const g = ctx.createRadialGradient(side * 18, -24, 2, side * 18, -24, 40);
          g.addColorStop(0, alpha('#ffffff', 0.65));
          g.addColorStop(1, alpha('#cfe0ff', 0.12));
          fillEllipse(ctx, side * 18, -26, 20, 34, g, side * 0.3);
          fillEllipse(ctx, side * 22, 4, 15, 22, g, side * 0.2);
        });
      });
      break;

    case 'leaf':
      pair((side) => {
        withTransform(ctx, side * 22, SHOULDER_Y, () => {
          ctx.rotate(side * (0.4 + sweep * 0.02));
          fillBlob(
            ctx,
            [
              [0, 0],
              [side * 24, -26],
              [side * 34, -2],
              [side * 14, 14],
            ],
            alpha('#8fd06a', 0.85),
          );
        });
      });
      break;
  }
}

function drawLegs(ctx: Ctx2D, spec: CharacterSpec): void {
  const p = spec.palette;
  const legColor = spec.outfit === 'miko' || spec.outfit === 'kimono' ? p.skin : shift(p.main, -0.35);
  for (const side of [-1, 1] as const) {
    fillEllipse(ctx, side * 11, HIP_Y + 12, 8, 14, legColor);
    // Shoe / sock
    fillEllipse(ctx, side * 11, -3, 10, 6, shift(p.trim, -0.2));
  }
}

function drawBody(ctx: Ctx2D, spec: CharacterSpec): void {
  const p = spec.palette;

  const torso = ctx.createLinearGradient(0, SHOULDER_Y, 0, HIP_Y);
  torso.addColorStop(0, shift(p.main, 0.12));
  torso.addColorStop(1, shift(p.main, -0.18));

  switch (spec.outfit) {
    case 'miko':
      // White top, wide red hakama.
      fillBlob(
        ctx,
        [
          [0, SHOULDER_Y - 6],
          [22, SHOULDER_Y + 6],
          [20, -44],
          [-20, -44],
          [-22, SHOULDER_Y + 6],
        ],
        '#f6f2ea',
      );
      fillBlob(
        ctx,
        [
          [-21, -46],
          [21, -46],
          [30, HIP_Y + 4],
          [0, HIP_Y + 9],
          [-30, HIP_Y + 4],
        ],
        p.main,
      );
      break;

    case 'witch':
      fillBlob(
        ctx,
        [
          [0, SHOULDER_Y - 6],
          [22, SHOULDER_Y + 8],
          [30, HIP_Y + 6],
          [0, HIP_Y + 10],
          [-30, HIP_Y + 6],
          [-22, SHOULDER_Y + 8],
        ],
        torso,
      );
      // Apron front
      fillBlob(
        ctx,
        [
          [-13, SHOULDER_Y + 8],
          [13, SHOULDER_Y + 8],
          [17, HIP_Y + 4],
          [-17, HIP_Y + 4],
        ],
        p.accent,
      );
      break;

    case 'dress':
    case 'robe': {
      fillBlob(
        ctx,
        [
          [0, SHOULDER_Y - 6],
          [19, SHOULDER_Y + 8],
          [24, -44],
          [36, HIP_Y + 10],
          [0, HIP_Y + 15],
          [-36, HIP_Y + 10],
          [-24, -44],
          [-19, SHOULDER_Y + 8],
        ],
        torso,
      );
      // Hem band, and a couple of fold lines down the skirt.
      fillBlob(
        ctx,
        [
          [34, HIP_Y + 9],
          [0, HIP_Y + 14],
          [-34, HIP_Y + 9],
          [0, HIP_Y + 6],
        ],
        shift(p.trim, -0.05),
      );
      withState(ctx, () => {
        ctx.globalAlpha = 0.2;
        ctx.strokeStyle = '#1a0f18';
        ctx.lineWidth = 2;
        for (const fx of [-14, 0, 14]) {
          ctx.beginPath();
          ctx.moveTo(fx * 0.55, -42);
          ctx.lineTo(fx, HIP_Y + 8);
          ctx.stroke();
        }
      });
      break;
    }

    case 'kimono':
      fillBlob(
        ctx,
        [
          [0, SHOULDER_Y - 6],
          [23, SHOULDER_Y + 8],
          [27, HIP_Y + 6],
          [0, HIP_Y + 10],
          [-27, HIP_Y + 6],
          [-23, SHOULDER_Y + 8],
        ],
        torso,
      );
      // Crossed collar, the giveaway silhouette of a kimono.
      fillPolygon(ctx, [0, SHOULDER_Y - 4, 13, -40, 0, -36, -13, -40], shift(p.accent, 0.1));
      // Obi
      fillPolygon(ctx, [-25, -40, 25, -40, 26, -30, -26, -30], p.trim);
      break;

    default:
      fillBlob(
        ctx,
        [
          [0, SHOULDER_Y - 6],
          [21, SHOULDER_Y + 8],
          [25, HIP_Y + 6],
          [0, HIP_Y + 10],
          [-25, HIP_Y + 6],
          [-21, SHOULDER_Y + 8],
        ],
        torso,
      );
      if (spec.outfit === 'vest' || spec.outfit === 'apron') {
        fillBlob(
          ctx,
          [
            [-12, SHOULDER_Y + 2],
            [12, SHOULDER_Y + 2],
            [15, HIP_Y + 2],
            [-15, HIP_Y + 2],
          ],
          p.accent,
        );
      }
      break;
  }

  // Collar catches the lamplight.
  fillEllipse(ctx, 0, SHOULDER_Y - 2, 14, 6, shift(p.trim, 0.1));

  // Cel shadow down the right side of the torso. Two flat values plus this
  // edge is what stops the body reading as a single silhouette blob.
  withState(ctx, () => {
    ctx.globalAlpha = 0.22;
    fillBlob(
      ctx,
      [
        [8, SHOULDER_Y - 4],
        [24, SHOULDER_Y + 10],
        [30, HIP_Y + 6],
        [6, HIP_Y + 10],
      ],
      '#1a0f18',
    );
  });
}

function drawArms(ctx: Ctx2D, spec: CharacterSpec, swing: number): void {
  const p = spec.palette;
  const sleeve = spec.outfit === 'miko' ? '#f6f2ea' : shift(p.main, 0.04);
  for (const side of [-1, 1] as const) {
    // Negative, so a positive `side` swings the arm outward, away from the body.
    const a = -side * (0.46 + Math.sin(swing + (side > 0 ? 0 : Math.PI)) * 0.07);
    withTransform(ctx, side * 21, SHOULDER_Y + 6, () => {
      ctx.rotate(a);
      // Upper sleeve, then a narrower forearm, so the arm has a joint.
      fillEllipse(ctx, 0, 11, 7.5, 14, sleeve);
      withState(ctx, () => {
        ctx.globalAlpha = 0.18;
        fillEllipse(ctx, 2.5, 11, 4, 13, '#1a0f18');
      });
      fillEllipse(ctx, side * 1.5, 24, 5.5, 11, shift(sleeve, -0.08));
      fillCircle(ctx, side * 2.5, 32, 4.4, shift(p.skin, -0.06));
    });
  }
}

function drawEars(ctx: Ctx2D, spec: CharacterSpec): void {
  const p = spec.palette;
  if (spec.ears === 'none') return;
  const fur = p.hair;
  const inner = shift(p.skin, -0.05);

  for (const side of [-1, 1] as const) {
    switch (spec.ears) {
      case 'cat':
        fillPolygon(
          ctx,
          [side * 16, HEAD_CY - 32, side * 30, HEAD_CY - 56, side * 36, HEAD_CY - 26],
          fur,
        );
        fillPolygon(
          ctx,
          [side * 22, HEAD_CY - 34, side * 29, HEAD_CY - 49, side * 32, HEAD_CY - 31],
          inner,
        );
        break;
      case 'fox':
      case 'wolf':
        fillPolygon(
          ctx,
          [side * 15, HEAD_CY - 30, side * 27, HEAD_CY - 62, side * 37, HEAD_CY - 24],
          fur,
        );
        fillPolygon(
          ctx,
          [side * 21, HEAD_CY - 32, side * 27, HEAD_CY - 53, side * 32, HEAD_CY - 29],
          inner,
        );
        break;
      case 'rabbit':
        withTransform(ctx, side * 16, HEAD_CY - 30, () => {
          ctx.rotate(side * 0.16);
          fillEllipse(ctx, 0, -34, 8, 36, fur);
          fillEllipse(ctx, 0, -32, 4, 28, inner);
        });
        break;
      case 'bird':
        // A small swept-back tuft sitting against the hair, not standing proud
        // of the skull — upright spikes read as horns at this scale.
        for (let i = 0; i < 3; i++) {
          withTransform(ctx, side * 25, HEAD_CY - 12, () => {
            ctx.rotate(side * (1.15 + i * 0.2));
            fillEllipse(ctx, 0, -11, 3.4, 11 - i * 1.4, shift(fur, -0.08 + 0.12 * i));
          });
        }
        break;
    }
  }
}

function drawHairBack(ctx: Ctx2D, spec: CharacterSpec, sway: number): void {
  const p = spec.palette;
  const dark = hairDark(p);

  switch (spec.hair) {
    case 'long':
    case 'wavy':
      fillBlob(
        ctx,
        [
          [0, HEAD_CY - HEAD_R - 4],
          [HEAD_R + 12, HEAD_CY - 12],
          [HEAD_R + 8 + sway, -34],
          [14, -18],
          [-14, -18],
          [-HEAD_R - 8 + sway, -34],
          [-HEAD_R - 12, HEAD_CY - 12],
        ],
        dark,
      );
      break;
    case 'twin':
      fillBlob(
        ctx,
        [
          [0, HEAD_CY - HEAD_R],
          [HEAD_R + 6, HEAD_CY - 6],
          [0, HEAD_CY + 20],
          [-HEAD_R - 6, HEAD_CY - 6],
        ],
        dark,
      );
      for (const side of [-1, 1] as const) {
        withTransform(ctx, side * (HEAD_R + 4), HEAD_CY - 6, () => {
          ctx.rotate(side * (0.1 + sway * 0.01));
          fillEllipse(ctx, side * 4, 30, 13, 36, dark);
          fillEllipse(ctx, side * 4, 12, 11, 16, p.hair);
        });
      }
      break;
    case 'braids':
      fillBlob(
        ctx,
        [
          [0, HEAD_CY - HEAD_R],
          [HEAD_R + 6, HEAD_CY - 6],
          [0, HEAD_CY + 22],
          [-HEAD_R - 6, HEAD_CY - 6],
        ],
        dark,
      );
      for (const side of [-1, 1] as const) {
        for (let i = 0; i < 3; i++) {
          fillEllipse(ctx, side * (HEAD_R + 2), HEAD_CY + 6 + i * 15, 9 - i, 9, dark);
        }
      }
      break;
    case 'side':
      fillBlob(
        ctx,
        [
          [0, HEAD_CY - HEAD_R],
          [HEAD_R + 8, HEAD_CY - 8],
          [HEAD_R + 10 + sway, -40],
          [10, -26],
          [-HEAD_R - 4, HEAD_CY],
        ],
        dark,
      );
      break;
    case 'bun':
      fillCircle(ctx, 0, HEAD_CY - HEAD_R - 12, 18, dark);
      fillBlob(
        ctx,
        [
          [0, HEAD_CY - HEAD_R],
          [HEAD_R + 5, HEAD_CY - 8],
          [0, HEAD_CY + 16],
          [-HEAD_R - 5, HEAD_CY - 8],
        ],
        dark,
      );
      break;
    default:
      fillBlob(
        ctx,
        [
          [0, HEAD_CY - HEAD_R],
          [HEAD_R + 5, HEAD_CY - 8],
          [0, HEAD_CY + 18],
          [-HEAD_R - 5, HEAD_CY - 8],
        ],
        dark,
      );
      break;
  }
}

function drawHead(ctx: Ctx2D, spec: CharacterSpec): void {
  const p = spec.palette;
  const g = ctx.createRadialGradient(
    -HEAD_R * 0.3,
    HEAD_CY - HEAD_R * 0.35,
    HEAD_R * 0.15,
    0,
    HEAD_CY,
    HEAD_R * 1.4,
  );
  g.addColorStop(0, shift(p.skin, 0.1));
  g.addColorStop(1, skinShade(p));
  fillEllipse(ctx, 0, HEAD_CY, HEAD_R, HEAD_R * 1.02, g);

  // Cel shadow along the shaded cheek.
  withState(ctx, () => {
    ctx.globalAlpha = 0.16;
    fillBlob(
      ctx,
      [
        [HEAD_R * 0.18, HEAD_CY - HEAD_R],
        [HEAD_R, HEAD_CY - HEAD_R * 0.4],
        [HEAD_R * 0.72, HEAD_CY + HEAD_R * 0.7],
        [HEAD_R * 0.1, HEAD_CY + HEAD_R * 0.9],
      ],
      '#5a2a3a',
    );
  });

  // Neck, and the shadow the head casts on it.
  fillEllipse(ctx, 0, HEAD_CY + HEAD_R - 4, 9, 8, skinShade(p));
  withState(ctx, () => {
    ctx.globalAlpha = 0.16;
    fillEllipse(ctx, 0, HEAD_CY + HEAD_R - 2, 8, 3, '#5a3038');
  });
}

function drawHairFront(ctx: Ctx2D, spec: CharacterSpec): void {
  const p = spec.palette;
  const base = p.hair;
  const lit = hairLight(p);

  // Cap of hair over the crown.
  fillBlob(
    ctx,
    [
      [0, HEAD_CY - HEAD_R - 3],
      [HEAD_R - 1, HEAD_CY - HEAD_R * 0.45],
      [HEAD_R - 6, HEAD_CY - 6],
      [0, HEAD_CY - 14],
      [-HEAD_R + 6, HEAD_CY - 6],
      [-HEAD_R + 1, HEAD_CY - HEAD_R * 0.45],
    ],
    base,
  );

  const y = HEAD_CY - 12;
  switch (spec.bangs) {
    case 'blunt':
      fillBlob(
        ctx,
        [
          [-HEAD_R + 4, HEAD_CY - 22],
          [HEAD_R - 4, HEAD_CY - 22],
          [HEAD_R - 8, y],
          [0, y + 4],
          [-HEAD_R + 8, y],
        ],
        base,
      );
      break;
    case 'split':
      fillPolygon(ctx, [-4, HEAD_CY - 30, -HEAD_R + 3, HEAD_CY - 14, -HEAD_R + 6, y + 2, -2, y - 8], base);
      fillPolygon(ctx, [4, HEAD_CY - 30, HEAD_R - 3, HEAD_CY - 14, HEAD_R - 6, y + 2, 2, y - 8], base);
      break;
    case 'swept':
      fillBlob(
        ctx,
        [
          [-HEAD_R + 2, HEAD_CY - 26],
          [HEAD_R - 2, HEAD_CY - 20],
          [HEAD_R - 10, y + 2],
          [-HEAD_R + 12, y - 2],
        ],
        base,
      );
      break;
  }

  // A single specular band sells the hair as glossy.
  const sheen = ctx.createLinearGradient(-HEAD_R, HEAD_CY - 30, HEAD_R, HEAD_CY - 18);
  sheen.addColorStop(0, alpha(lit, 0));
  sheen.addColorStop(0.5, alpha(lit, 0.55));
  sheen.addColorStop(1, alpha(lit, 0));
  fillEllipse(ctx, -6, HEAD_CY - 26, HEAD_R * 0.7, 5, sheen, -0.12);
}

function drawFace(ctx: Ctx2D, spec: CharacterSpec, blink: number, mood: number): void {
  const p = spec.palette;
  const eyeY = HEAD_CY + 3;
  const eyeDX = 13.5;
  const open = 1 - blink;

  for (const side of [-1, 1] as const) {
    const x = side * eyeDX;
    if (open < 0.12) {
      // Closed: a soft arc rather than a flat line.
      ctx.strokeStyle = shift(p.eye, -0.4);
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(x, eyeY + 1, 6, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
      continue;
    }

    const h = 10 * open;
    // Sclera
    fillEllipse(ctx, x, eyeY, 6.3, h, '#fdfcfa');
    // Iris with a vertical gradient, darker at the top like most anime eyes.
    const iris = ctx.createLinearGradient(x, eyeY - h, x, eyeY + h);
    iris.addColorStop(0, shift(p.eye, -0.35));
    iris.addColorStop(1, shift(p.eye, 0.25));
    fillEllipse(ctx, x, eyeY + 0.5, 4.8, h * 0.86, iris);
    // Pupil and two catchlights
    fillEllipse(ctx, x, eyeY + 1, 2.4, h * 0.5, '#20161c');
    fillCircle(ctx, x - 2, eyeY - h * 0.38, 1.9, glow(0.92));
    fillCircle(ctx, x + 2.2, eyeY + h * 0.3, 1.1, glow(0.5));
    // Upper lash
    ctx.strokeStyle = '#2a1c22';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(x, eyeY + 1, 6.7, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
  }

  // Brows shift with mood.
  ctx.strokeStyle = hairDark(p);
  ctx.lineWidth = 2;
  for (const side of [-1, 1] as const) {
    const x = side * eyeDX;
    const tilt = (mood - 0.5) * 3;
    ctx.beginPath();
    ctx.moveTo(x - 6, eyeY - 13 + side * tilt);
    ctx.quadraticCurveTo(x, eyeY - 16 - tilt, x + 6, eyeY - 13 - side * tilt);
    ctx.stroke();
  }

  // Mouth: a clear upward smile at high mood, a small frown at low.
  const mouthY = HEAD_CY + 18;
  const curve = (mood - 0.5) * 13;
  ctx.strokeStyle = '#9a4f58';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-4.5, mouthY - curve * 0.28);
  ctx.quadraticCurveTo(0, mouthY + curve * 0.72, 4.5, mouthY - curve * 0.28);
  ctx.stroke();

  // Blush
  for (const side of [-1, 1] as const) {
    fillEllipse(ctx, side * 22, HEAD_CY + 12, 7, 4, alpha('#ff9aa8', 0.42));
  }
}

function drawHeadwear(ctx: Ctx2D, spec: CharacterSpec): void {
  const p = spec.palette;
  const topY = HEAD_CY - HEAD_R;

  switch (spec.headwear) {
    case 'witch': {
      // Wide brim plus a slightly bent cone, in the outfit's main colour —
      // the accent slot is the apron on most specs and reads far too light.
      fillEllipse(ctx, 0, topY + 6, HEAD_R + 26, 12, shift(p.main, -0.28));
      fillBlob(
        ctx,
        [
          [-30, topY + 6],
          [-8, topY - 40],
          [6, topY - 52],
          [16, topY - 34],
          [30, topY + 6],
        ],
        shift(p.main, -0.06),
      );
      fillPolygon(ctx, [-30, topY + 4, 30, topY + 4, 30, topY - 4, -30, topY - 4], p.trim);
      break;
    }
    case 'mob': {
      fillEllipse(ctx, 0, topY + 2, HEAD_R + 8, 20, shift(p.accent, 0.05));
      fillEllipse(ctx, 0, topY + 10, HEAD_R + 10, 8, shift(p.accent, -0.15));
      break;
    }
    case 'ribbon': {
      const rx = -HEAD_R + 4;
      for (const dir of [-1, 1] as const) {
        fillBlob(
          ctx,
          [
            [rx, topY + 18],
            [rx + dir * 22, topY + 6],
            [rx + dir * 26, topY + 26],
            [rx + dir * 6, topY + 26],
          ],
          p.accent,
        );
      }
      fillCircle(ctx, rx, topY + 18, 6, shift(p.accent, -0.15));
      break;
    }
    case 'tokin': {
      fillCircle(ctx, 0, topY + 6, 11, shift(p.trim, 0.15));
      break;
    }
    case 'cap': {
      fillBlob(
        ctx,
        [
          [-HEAD_R + 2, topY + 12],
          [0, topY - 10],
          [HEAD_R - 2, topY + 12],
        ],
        p.accent,
      );
      fillEllipse(ctx, 6, topY + 14, HEAD_R * 0.8, 6, shift(p.accent, -0.2));
      break;
    }
    case 'flower': {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        fillEllipse(ctx, -24 + Math.cos(a) * 8, topY + 12 + Math.sin(a) * 8, 6, 6, p.accent);
      }
      fillCircle(ctx, -24, topY + 12, 4, p.trim);
      break;
    }
    case 'wreath': {
      for (let i = 0; i < 9; i++) {
        const a = Math.PI + (i / 8) * Math.PI;
        fillEllipse(ctx, Math.cos(a) * (HEAD_R + 2), HEAD_CY + Math.sin(a) * (HEAD_R + 2), 6, 4, p.accent, a);
      }
      break;
    }
    case 'horns': {
      for (const side of [-1, 1] as const) {
        fillBlob(
          ctx,
          [
            [side * 14, topY + 12],
            [side * 20, topY - 22],
            [side * 27, topY - 18],
            [side * 26, topY + 14],
          ],
          shift(p.trim, 0.2),
        );
      }
      break;
    }
    case 'crown': {
      fillPolygon(
        ctx,
        [-20, topY + 10, -20, topY - 8, -10, topY + 2, 0, topY - 12, 10, topY + 2, 20, topY - 8, 20, topY + 10],
        p.trim,
      );
      break;
    }
  }
}

// ------------------------------------------------------------- entry point

/**
 * Draws a character at (x, y), where y is the ground the figure stands on.
 * Only the colour layer is drawn here; call `characterGlow` for the light pass.
 */
export function drawCharacter(
  ctx: Ctx2D,
  spec: CharacterSpec,
  x: number,
  y: number,
  options: DrawOptions,
): void {
  const height = options.height ?? RIG_HEIGHT;
  const scale = (height / RIG_HEIGHT) * spec.build;
  const phase = phaseOf(spec.id) * Math.PI * 2;
  const t = options.still ? 0 : options.time;

  const bob = options.still ? 0 : Math.sin(t * spec.idle.bobHz * Math.PI * 2 + phase) * spec.idle.bobAmp;
  const sway = options.still ? 0 : Math.sin(t * spec.idle.bobHz * Math.PI + phase) * spec.idle.swayDeg;
  const mood = options.mood ?? 0.65;

  // Blink: mostly open, with a quick close roughly every four seconds.
  const blinkCycle = (t * 0.25 + phase) % 1;
  const blink = options.still ? 0 : blinkCycle > 0.94 ? Math.sin((blinkCycle - 0.94) / 0.06 * Math.PI) : 0;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(options.flip ? -scale : scale, scale);
  ctx.translate(0, bob);
  ctx.rotate((sway * Math.PI) / 180);

  drawWings(ctx, spec, t * 1.6 + phase);
  drawHairBack(ctx, spec, sway * 0.6);
  drawLegs(ctx, spec);
  drawBody(ctx, spec);
  drawArms(ctx, spec, t * 1.2 + phase);
  drawHead(ctx, spec);
  drawEars(ctx, spec);
  drawHairFront(ctx, spec);
  drawFace(ctx, spec, blink, mood);
  drawHeadwear(ctx, spec);

  ctx.restore();
}

/**
 * Warm rim light down one edge of the figure. Drawn into the light buffer, it
 * is the single effect that stops the flat vector fills reading as clip art.
 */
export function characterRim(
  ctx: Ctx2D,
  spec: CharacterSpec,
  x: number,
  y: number,
  options: DrawOptions,
): void {
  const height = options.height ?? RIG_HEIGHT;
  const scale = (height / RIG_HEIGHT) * spec.build;
  const from = options.rimFrom ?? -1;

  ctx.save();
  ctx.translate(x + from * height * 0.02, y);
  ctx.scale(options.flip ? -scale : scale, scale);
  ctx.globalAlpha = 0.28;

  // A thin crescent along the head and shoulder, offset toward the lamps.
  const g = ctx.createLinearGradient(from * HEAD_R, HEAD_CY, -from * HEAD_R * 0.2, HEAD_CY);
  g.addColorStop(0, alpha('#ffc27a', 0.75));
  g.addColorStop(1, alpha('#ffc27a', 0));
  fillEllipse(ctx, 0, HEAD_CY, HEAD_R, HEAD_R * 1.02, g);
  fillEllipse(ctx, 0, (SHOULDER_Y + HIP_Y) / 2, 26, 24, g);

  ctx.restore();
}
