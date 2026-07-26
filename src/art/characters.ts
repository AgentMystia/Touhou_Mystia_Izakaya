/**
 * Character art.
 *
 * Every figure is drawn from one parametric chibi rig rather than from sprite
 * sheets, so the whole cast is data: a palette plus a handful of shape choices.
 *
 * The rig is drawn in its own space: the origin sits between the feet, y runs
 * upward as negative, and a figure is about 150 units tall — roughly 2.4 heads,
 * the chibi range where a large head still reads as cute rather than as a
 * bobblehead.
 *
 * What makes these read as cute rather than as vector dolls, in rough order of
 * importance: eyes with real internal structure (gradient iris, pupil, two
 * highlights, a heavy lash line), hair built from pointed overlapping strands
 * instead of one blob, a consistent upper-left key light with two-tone cel
 * shading, and a soft tinted outline holding the silhouette together.
 */

import { alpha, glow, mix, shade, shift } from './palette';
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
  /** 0-1, drives brows and mouth from glum to delighted. */
  mood?: number;
  /** Suppresses idle motion, for static portraits. */
  still?: boolean;
  /** Direction of the key light, for the rim pass. */
  rimFrom?: number;
  /**
   * Walk cycle phase in turns. When set, legs and arms swing and the body
   * bounces; leave undefined for a standing figure.
   */
  walk?: number;
  /** Raises both arms, for carrying a plate. */
  carrying?: boolean;
}

const RIG_HEIGHT = 150;
/** The head is a wide-ish egg; a perfect circle reads as a ball. */
const HEAD_RX = 37;
const HEAD_RY = 35;
const HEAD_CY = -110;
const CHIN_Y = HEAD_CY + HEAD_RY + 6;
const SHOULDER_Y = -68;
const HIP_Y = -26;

/** The key light sits up and to the left of every figure. */
const LIGHT = { x: -0.55, y: -0.8 };

// ---------------------------------------------------------------- helpers

const skinShade = (p: CharacterPalette) => shift(p.skin, -0.14);
const hairDark = (p: CharacterPalette) => shift(p.hair, -0.34);
const hairLight = (p: CharacterPalette) => shift(p.hair, 0.32);
/** A soft outline colour, tinted by its fill rather than pure black. */
const inkOf = (color: string) => shift(color, -0.62);

/** Deterministic per-character phase so a crowd does not bob in lockstep. */
const phaseOf = (id: string): number => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
};

/** Strokes the current path as a soft outline. */
function ink(ctx: Ctx2D, color: string, width = 2): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

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
        withTransform(ctx, side * 16, SHOULDER_Y + 8, () => {
          ctx.rotate(side * (1.14 + sweep * 0.02));
          for (let i = 0; i < 4; i++) {
            const len = 60 - i * 11;
            fillBlob(
              ctx,
              [
                [0, i * 5],
                [side * (19 + i * 3), -len * 0.42 + i * 4],
                [side * (12 + i * 2), -len + i * 3],
                [side * -5, -len * 0.55 + i * 4],
              ],
              shift(p.accent, -0.2 + 0.12 * i),
            );
            ink(ctx, inkOf(p.accent), 1.4);
          }
          fillEllipse(ctx, side * 6, -6, 14, 11, shift(p.accent, -0.3), side * 0.4);
          ink(ctx, inkOf(p.accent), 1.6);
        });
      });
      break;

    case 'bat':
      pair((side) => {
        withTransform(ctx, side * 20, SHOULDER_Y + 2, () => {
          ctx.rotate(side * (0.22 + sweep * 0.03));
          fillBlob(
            ctx,
            [
              [0, 0],
              [side * 48, -32],
              [side * 41, -5],
              [side * 52, 8],
              [side * 35, 11],
              [side * 41, 25],
              [side * 6, 17],
            ],
            shift(p.accent, -0.16),
          );
          ink(ctx, inkOf(p.accent), 1.8);
        });
      });
      break;

    case 'ice':
      pair((side) => {
        withTransform(ctx, side * 17, SHOULDER_Y + 4, () => {
          for (let i = 0; i < 3; i++) {
            withTransform(ctx, 0, 0, () => {
              ctx.rotate(side * (0.88 + i * 0.4));
              const g = ctx.createLinearGradient(0, 0, 0, -64);
              g.addColorStop(0, alpha('#5cbdea', 0.95));
              g.addColorStop(0.55, alpha('#b6e8ff', 0.92));
              g.addColorStop(1, alpha('#ffffff', 0.72));
              fillPolygon(ctx, [0, 0, -11, -35, 0, -64, 11, -35], g);
              ink(ctx, alpha('#3f95c8', 0.8), 1.6);
            });
          }
        });
      });
      break;

    case 'fairy':
      pair((side) => {
        withTransform(ctx, side * 17, SHOULDER_Y + 2, () => {
          ctx.rotate(side * (0.5 + sweep * 0.03));
          const g = ctx.createRadialGradient(side * 20, -22, 2, side * 20, -22, 42);
          g.addColorStop(0, alpha('#ffffff', 0.78));
          g.addColorStop(1, alpha('#cfe0ff', 0.2));
          fillEllipse(ctx, side * 20, -24, 21, 33, g, side * 0.3);
          ink(ctx, alpha('#cfe0ff', 0.55), 1.4);
          fillEllipse(ctx, side * 23, 6, 15, 21, g, side * 0.2);
          ink(ctx, alpha('#cfe0ff', 0.45), 1.2);
        });
      });
      break;

    case 'leaf':
      pair((side) => {
        withTransform(ctx, side * 20, SHOULDER_Y + 6, () => {
          ctx.rotate(side * (0.55 + sweep * 0.02));
          fillBlob(
            ctx,
            [
              [0, 0],
              [side * 26, -26],
              [side * 36, -1],
              [side * 15, 15],
            ],
            '#7cc45e',
          );
          ink(ctx, '#3f6a2e', 1.6);
        });
      });
      break;
  }
}

/** Legs. `swing` is the walk phase in radians; `walking` false stands still. */
function drawLegs(ctx: Ctx2D, spec: CharacterSpec, swing: number, walking: boolean): void {
  const p = spec.palette;
  // Bare legs read far better at this size than dark tights — a leg the colour
  // of the skirt just disappears and leaves two shoes floating.
  const covered = spec.outfit === 'robe';
  const legColor = covered ? shift(p.main, -0.3) : p.skin;
  // Always a dark shoe. Deriving it from a pale trim colour gives a mid-grey
  // lump that reads as another segment of leg rather than as footwear.
  const shoe = mix(p.trim, '#2b2028', 0.6);

  for (const side of [-1, 1] as const) {
    const lift = walking ? Math.sin(swing + (side > 0 ? 0 : Math.PI)) : 0;
    withTransform(ctx, side * 9 + lift * 4, HIP_Y + 3 + Math.max(0, lift) * -6, () => {
      // Mirror the whole foot rather than negating individual x's: flipping
      // only some points turns the shoe outline into a self-crossing bowtie.
      ctx.scale(side, 1);
      ctx.rotate(lift * 0.1 * side);
      // One tapering leg meeting one shoe. Any extra band in this ~14px of
      // screen — a sock, a highlight — stacks into what looks like a spring.
      fillBlob(ctx, [[-5.6, -3], [5.6, -3], [4.4, 17], [-4.4, 17]], legColor, 0.22);
      ink(ctx, inkOf(legColor), 1.6);
      fillBlob(
        ctx,
        [[-4.6, 14.5], [4.6, 14.5], [7, 19.5], [6, 23.5], [-4.6, 23]],
        shoe,
        0.4,
      );
      ink(ctx, inkOf(shoe), 1.4);
    });
  }
}

function drawBody(ctx: Ctx2D, spec: CharacterSpec): void {
  const p = spec.palette;
  const main = p.main;
  const outline = inkOf(main);

  // Neck first, so the collar below covers where it meets the shoulders and it
  // never reads as a pale ball balanced between head and body.
  fillPolygon(ctx, [-7, CHIN_Y - 4, 7, CHIN_Y - 4, 7.6, SHOULDER_Y + 2, -7.6, SHOULDER_Y + 2], p.skin);
  ink(ctx, inkOf(p.skin), 1.8);
  withState(ctx, () => {
    ctx.globalAlpha = 0.3;
    fillEllipse(ctx, 0, CHIN_Y - 1, 7.4, 4.5, skinShade(p));
  });

  const torso = ctx.createLinearGradient(-26, SHOULDER_Y, 26, HIP_Y);
  torso.addColorStop(0, shift(main, 0.16));
  torso.addColorStop(0.55, main);
  torso.addColorStop(1, shift(main, -0.2));

  /** Shoulders in, waist nipped, hem flared — the basic cute silhouette. */
  const skirt = (spread: number, hem: number) => {
    fillBlob(
      ctx,
      [
        [0, SHOULDER_Y - 5],
        [22, SHOULDER_Y + 9],
        [24, -46],
        [spread, HIP_Y + hem],
        [0, HIP_Y + hem + 5],
        [-spread, HIP_Y + hem],
        [-24, -46],
        [-22, SHOULDER_Y + 9],
      ],
      torso,
    );
    ink(ctx, outline, 2);
  };

  switch (spec.outfit) {
    case 'miko': {
      fillBlob(
        ctx,
        [
          [0, SHOULDER_Y - 5],
          [21, SHOULDER_Y + 7],
          [19, -46],
          [-19, -46],
          [-21, SHOULDER_Y + 7],
        ],
        '#f8f5ee',
      );
      ink(ctx, '#b9ad9c', 2);
      fillBlob(
        ctx,
        [
          [-20, -48],
          [20, -48],
          [29, HIP_Y + 1],
          [0, HIP_Y + 6],
          [-29, HIP_Y + 1],
        ],
        torso,
      );
      ink(ctx, outline, 2);
      break;
    }
    case 'witch': {
      skirt(30, 1);
      fillBlob(
        ctx,
        [
          [-14, SHOULDER_Y + 10],
          [14, SHOULDER_Y + 10],
          [18, HIP_Y + 4],
          [-18, HIP_Y + 4],
        ],
        p.accent,
      );
      ink(ctx, inkOf(p.accent), 1.8);
      break;
    }
    case 'kimono': {
      skirt(25, 1);
      fillPolygon(ctx, [0, SHOULDER_Y - 3, 14, -42, 0, -38, -14, -42], shift(p.accent, 0.1));
      ink(ctx, inkOf(p.accent), 1.6);
      fillPolygon(ctx, [-25, -42, 25, -42, 26, -31, -26, -31], p.trim);
      ink(ctx, inkOf(p.trim), 1.6);
      break;
    }
    case 'dress':
    case 'robe': {
      skirt(31, 2);
      // Hem trim: a stroked arc following the hem, not a filled shape — a
      // filled band here reads as a bowl the figure is standing in.
      withState(ctx, () => {
        ctx.strokeStyle = shift(p.trim, -0.06);
        ctx.lineWidth = 4.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-29, HIP_Y);
        ctx.quadraticCurveTo(0, HIP_Y + 8, 29, HIP_Y);
        ctx.stroke();
      });
      withState(ctx, () => {
        ctx.globalAlpha = 0.22;
        ctx.strokeStyle = inkOf(main);
        ctx.lineWidth = 2;
        for (const fx of [-12, 12]) {
          ctx.beginPath();
          ctx.moveTo(fx * 0.6, -44);
          ctx.lineTo(fx, HIP_Y);
          ctx.stroke();
        }
      });
      break;
    }
    default: {
      skirt(24, 1);
      if (spec.outfit === 'vest' || spec.outfit === 'apron') {
        fillBlob(
          ctx,
          [
            [-13, SHOULDER_Y + 4],
            [13, SHOULDER_Y + 4],
            [16, HIP_Y + 2],
            [-16, HIP_Y + 2],
          ],
          p.accent,
        );
        ink(ctx, inkOf(p.accent), 1.8);
      }
      break;
    }
  }

  // Cel shadow down the side away from the key light.
  withState(ctx, () => {
    ctx.globalAlpha = 0.18;
    fillBlob(
      ctx,
      [
        [7, SHOULDER_Y - 3],
        [22, SHOULDER_Y + 10],
        [27, HIP_Y],
        [6, HIP_Y + 4],
      ],
      '#241428',
    );
  });

  // Collar, sitting on the shoulder line.
  fillEllipse(ctx, 0, SHOULDER_Y + 1, 11, 4.6, shift(p.trim, 0.14));
  ink(ctx, inkOf(p.trim), 1.6);
}

function drawArms(
  ctx: Ctx2D,
  spec: CharacterSpec,
  swing: number,
  walking: boolean,
  carrying: boolean,
): void {
  const p = spec.palette;
  const sleeve = spec.outfit === 'miko' ? '#f8f5ee' : shift(p.main, 0.06);
  const outline = inkOf(sleeve);

  for (const side of [-1, 1] as const) {
    // Carrying raises both arms forward; walking swings them out of phase.
    // The resting splay is deliberately small — arms held out wide read as a
    // scarecrow rather than a girl standing still.
    const base = carrying ? -1.02 : -0.26;
    const swingAmt = walking ? Math.sin(swing + (side > 0 ? Math.PI : 0)) * 0.34 : 0;
    withTransform(ctx, side * 18, SHOULDER_Y + 6, () => {
      ctx.rotate(side * base + swingAmt);
      // One tapering sleeve with a cuff drawn on it, rather than two stacked
      // pieces — stacking gives the limb a doll-joint seam at the elbow.
      fillBlob(ctx, [[-6.8, -2], [6.8, -2], [4.6, 29], [-4.6, 29]], sleeve, 0.28);
      ink(ctx, outline, 1.8);
      withState(ctx, () => {
        ctx.globalAlpha = 0.22;
        fillBlob(ctx, [[-4.9, 18], [4.9, 18], [4.6, 29], [-4.6, 29]], inkOf(sleeve), 0.2);
      });
      withState(ctx, () => {
        ctx.strokeStyle = outline;
        ctx.lineWidth = 1.4;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.moveTo(-4.8, 27);
        ctx.lineTo(4.8, 27);
        ctx.stroke();
      });
      fillEllipse(ctx, side * 1.2, 31.5, 4.4, 4.6, p.skin);
      ink(ctx, inkOf(p.skin), 1.5);
    });
  }
}

function drawEars(ctx: Ctx2D, spec: CharacterSpec): void {
  const p = spec.palette;
  if (spec.ears === 'none') return;
  const fur = p.hair;
  const inner = shift(p.skin, -0.02);
  const outline = inkOf(fur);

  for (const side of [-1, 1] as const) {
    switch (spec.ears) {
      case 'cat':
        fillPolygon(
          ctx,
          [side * 14, HEAD_CY - 26, side * 29, HEAD_CY - 54, side * 35, HEAD_CY - 21],
          fur,
        );
        ink(ctx, outline, 2);
        fillPolygon(
          ctx,
          [side * 20, HEAD_CY - 28, side * 28, HEAD_CY - 46, side * 31, HEAD_CY - 25],
          inner,
        );
        break;
      case 'fox':
      case 'wolf':
        fillPolygon(
          ctx,
          [side * 13, HEAD_CY - 24, side * 27, HEAD_CY - 60, side * 36, HEAD_CY - 19],
          fur,
        );
        ink(ctx, outline, 2);
        fillPolygon(
          ctx,
          [side * 19, HEAD_CY - 27, side * 27, HEAD_CY - 50, side * 31, HEAD_CY - 24],
          inner,
        );
        break;
      case 'rabbit':
        withTransform(ctx, side * 14, HEAD_CY - 24, () => {
          ctx.rotate(side * 0.17);
          fillEllipse(ctx, 0, -33, 8.5, 35, fur);
          ink(ctx, outline, 2);
          fillEllipse(ctx, 0, -31, 4.5, 27, inner);
        });
        break;
      case 'bird':
        // A swept-back tuft against the hair; upright spikes read as horns.
        for (let i = 0; i < 3; i++) {
          withTransform(ctx, side * 26, HEAD_CY - 10, () => {
            ctx.rotate(side * (1.12 + i * 0.2));
            fillEllipse(ctx, 0, -12, 3.6, 12 - i * 1.5, shift(fur, -0.12 + 0.14 * i));
            ink(ctx, outline, 1.2);
          });
        }
        break;
    }
  }
}

function drawHairBack(ctx: Ctx2D, spec: CharacterSpec, sway: number): void {
  const p = spec.palette;
  const dark = hairDark(p);
  const outline = inkOf(dark);

  const mass = (points: [number, number][]) => {
    fillBlob(ctx, points, dark);
    ink(ctx, outline, 2);
  };

  switch (spec.hair) {
    case 'long':
    case 'wavy': {
      // A curtain that narrows toward the tips rather than an egg: the outer
      // edge bows out at the shoulder and comes back in to a point.
      const wave = spec.hair === 'wavy' ? 6 : 0;
      mass([
        [0, HEAD_CY - HEAD_RY - 6],
        [HEAD_RX + 12, HEAD_CY - 10],
        [HEAD_RX + 8 + wave, -56],
        [HEAD_RX - 2 + sway, -26],
        [16, -16],
        [0, -22],
        [-16, -16],
        [-HEAD_RX + 2 + sway, -26],
        [-HEAD_RX - 8 - wave, -56],
        [-HEAD_RX - 12, HEAD_CY - 10],
      ]);
      // Two inner locks catching the light, so the mass is not one flat field.
      withState(ctx, () => {
        ctx.globalAlpha = 0.24;
        for (const side of [-1, 1] as const) {
          fillBlob(
            ctx,
            [
              [side * (HEAD_RX - 4), HEAD_CY - 4],
              [side * (HEAD_RX + 1), -52],
              [side * (HEAD_RX - 9), -30],
            ],
            hairLight(p),
            0.4,
          );
        }
      });
      break;
    }
    case 'twin':
      mass([
        [0, HEAD_CY - HEAD_RY - 3],
        [HEAD_RX + 7, HEAD_CY - 4],
        [0, HEAD_CY + HEAD_RY + 2],
        [-HEAD_RX - 7, HEAD_CY - 4],
      ]);
      for (const side of [-1, 1] as const) {
        withTransform(ctx, side * (HEAD_RX + 4), HEAD_CY - 4, () => {
          ctx.rotate(side * (0.12 + sway * 0.01));
          fillEllipse(ctx, side * 4, 32, 14, 38, dark);
          ink(ctx, outline, 2);
          fillEllipse(ctx, side * 4, 12, 12, 17, p.hair);
          ink(ctx, outline, 1.6);
        });
      }
      break;
    case 'braids':
      mass([
        [0, HEAD_CY - HEAD_RY - 3],
        [HEAD_RX + 7, HEAD_CY - 4],
        [0, HEAD_CY + HEAD_RY + 4],
        [-HEAD_RX - 7, HEAD_CY - 4],
      ]);
      for (const side of [-1, 1] as const) {
        for (let i = 0; i < 3; i++) {
          fillEllipse(ctx, side * (HEAD_RX + 2), HEAD_CY + 10 + i * 15, 9 - i, 9, dark);
          ink(ctx, outline, 1.4);
        }
      }
      break;
    case 'side':
      mass([
        [0, HEAD_CY - HEAD_RY - 3],
        [HEAD_RX + 9, HEAD_CY - 5],
        [HEAD_RX + 11 + sway, -44],
        [11, -28],
        [-HEAD_RX - 5, HEAD_CY + 2],
      ]);
      break;
    case 'bun':
      fillCircle(ctx, 0, HEAD_CY - HEAD_RY - 13, 17, dark);
      ink(ctx, outline, 2);
      mass([
        [0, HEAD_CY - HEAD_RY - 2],
        [HEAD_RX + 6, HEAD_CY - 5],
        [0, HEAD_CY + HEAD_RY],
        [-HEAD_RX - 6, HEAD_CY - 5],
      ]);
      break;
    default:
      // Short and bob: the mass stops at the jaw and flicks out, rather than
      // bulging past the chin into a helmet.
      mass([
        [0, HEAD_CY - HEAD_RY - 2],
        [HEAD_RX + 6, HEAD_CY - 8],
        [HEAD_RX + 8, HEAD_CY + HEAD_RY * 0.5],
        [0, HEAD_CY + HEAD_RY * 0.82],
        [-HEAD_RX - 8, HEAD_CY + HEAD_RY * 0.5],
        [-HEAD_RX - 6, HEAD_CY - 8],
      ]);
      break;
  }
}

function drawHead(ctx: Ctx2D, spec: CharacterSpec): void {
  const p = spec.palette;

  // A soft egg: wide at the temples, tapering to a rounded chin.
  fillBlob(
    ctx,
    [
      [0, HEAD_CY - HEAD_RY],
      [HEAD_RX, HEAD_CY - HEAD_RY * 0.35],
      [HEAD_RX * 0.78, HEAD_CY + HEAD_RY * 0.62],
      [0, CHIN_Y],
      [-HEAD_RX * 0.78, HEAD_CY + HEAD_RY * 0.62],
      [-HEAD_RX, HEAD_CY - HEAD_RY * 0.35],
    ],
    p.skin,
  );
  ink(ctx, inkOf(p.skin), 2.2);

  withState(ctx, () => {
    ctx.globalAlpha = 0.2;
    fillBlob(
      ctx,
      [
        [HEAD_RX * 0.1, HEAD_CY - HEAD_RY * 0.9],
        [HEAD_RX * 0.95, HEAD_CY - HEAD_RY * 0.3],
        [HEAD_RX * 0.72, HEAD_CY + HEAD_RY * 0.6],
        [HEAD_RX * 0.05, CHIN_Y - 2],
      ],
      skinShade(p),
    );
  });

  // The neck is drawn with the body, under the collar — see drawBody.
}

/**
 * The face. Eye construction is where nearly all the cuteness lives, so each
 * eye gets a gradient iris, a pupil, two highlights and a heavy lash line.
 */
function drawFace(ctx: Ctx2D, spec: CharacterSpec, blink: number, mood: number): void {
  const p = spec.palette;
  const eyeY = HEAD_CY + 9;
  const eyeDX = 15.5;
  const open = 1 - blink;
  const lash = '#2c1c26';

  for (const side of [-1, 1] as const) {
    const x = side * eyeDX;

    if (open < 0.14) {
      // Closed: a downward arc, which reads as a happy squint.
      ctx.strokeStyle = lash;
      ctx.lineWidth = 2.8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(x, eyeY + 3, 7.5, Math.PI * 1.12, Math.PI * 1.88);
      ctx.stroke();
      continue;
    }

    const h = 11.5 * open;
    const w = 8.6;

    withState(ctx, () => {
      ctx.beginPath();
      ctx.ellipse(x, eyeY, w, h, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#fffdfa';
      ctx.fill();
      ctx.clip();

      const iris = ctx.createLinearGradient(x, eyeY - h, x, eyeY + h);
      iris.addColorStop(0, shift(p.eye, -0.45));
      iris.addColorStop(0.45, p.eye);
      iris.addColorStop(1, shift(p.eye, 0.34));
      ctx.beginPath();
      ctx.ellipse(x, eyeY + h * 0.1, w * 0.82, h * 0.88, 0, 0, Math.PI * 2);
      ctx.fillStyle = iris;
      ctx.fill();

      // A brighter pool low in the iris.
      ctx.beginPath();
      ctx.ellipse(x, eyeY + h * 0.46, w * 0.6, h * 0.34, 0, 0, Math.PI * 2);
      ctx.fillStyle = alpha(shift(p.eye, 0.5), 0.75);
      ctx.fill();

      ctx.beginPath();
      ctx.ellipse(x, eyeY + h * 0.08, w * 0.34, h * 0.46, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#241722';
      ctx.fill();

      // Shadow cast by the upper lid.
      ctx.beginPath();
      ctx.ellipse(x, eyeY - h * 0.95, w * 1.1, h * 0.42, 0, 0, Math.PI * 2);
      ctx.fillStyle = alpha('#2c1c26', 0.32);
      ctx.fill();
    });

    fillCircle(ctx, x + LIGHT.x * 4.4, eyeY - h * 0.42, 3.1, glow(0.95));
    fillCircle(ctx, x - LIGHT.x * 3.2, eyeY + h * 0.42, 1.5, glow(0.6));

    ctx.strokeStyle = lash;
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.ellipse(x, eyeY, w, h, 0, Math.PI * 1.04, Math.PI * 1.96);
    ctx.stroke();
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(x + side * w * 0.86, eyeY - h * 0.42);
    ctx.lineTo(x + side * (w + 3.4), eyeY - h * 0.82);
    ctx.stroke();
    ctx.strokeStyle = alpha(lash, 0.45);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(x, eyeY, w * 0.92, h * 0.94, 0, Math.PI * 0.12, Math.PI * 0.88);
    ctx.stroke();
  }

  ctx.strokeStyle = hairDark(p);
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  for (const side of [-1, 1] as const) {
    const x = side * eyeDX;
    const tilt = (mood - 0.5) * 4;
    ctx.beginPath();
    ctx.moveTo(x - side * 7, eyeY - 15 + tilt);
    ctx.quadraticCurveTo(x, eyeY - 19 - tilt * 0.5, x + side * 7, eyeY - 15.5 - tilt * 0.4);
    ctx.stroke();
  }

  const mouthY = HEAD_CY + 26;
  const joy = Math.max(0, mood - 0.5) * 2;
  ctx.strokeStyle = '#a05560';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  if (joy > 0.55) {
    withState(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(-5, mouthY - 1);
      ctx.quadraticCurveTo(0, mouthY + 7.5, 5, mouthY - 1);
      ctx.closePath();
      ctx.fillStyle = '#b5525f';
      ctx.fill();
      ctx.strokeStyle = '#8a3f4c';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    });
  } else {
    const curve = (mood - 0.5) * 11;
    ctx.beginPath();
    ctx.moveTo(-4.5, mouthY - curve * 0.3);
    ctx.quadraticCurveTo(0, mouthY + curve * 0.8, 4.5, mouthY - curve * 0.3);
    ctx.stroke();
  }

  for (const side of [-1, 1] as const) {
    withState(ctx, () => {
      const g = ctx.createRadialGradient(side * 25, HEAD_CY + 18, 1, side * 25, HEAD_CY + 18, 9);
      g.addColorStop(0, alpha('#ff8fa3', 0.55));
      g.addColorStop(1, alpha('#ff8fa3', 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(side * 25, HEAD_CY + 18, 9, 5.5, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

/**
 * Front hair, built from pointed overlapping strands rather than one shape —
 * the single biggest difference between "anime hair" and "a blob".
 */
function drawHairFront(ctx: Ctx2D, spec: CharacterSpec): void {
  const p = spec.palette;
  const base = p.hair;
  const outline = inkOf(base);
  const top = HEAD_CY - HEAD_RY;

  fillBlob(
    ctx,
    [
      [0, top - 5],
      [HEAD_RX + 1, HEAD_CY - HEAD_RY * 0.38],
      [HEAD_RX - 4, HEAD_CY - 2],
      [0, HEAD_CY - 11],
      [-HEAD_RX + 4, HEAD_CY - 2],
      [-HEAD_RX - 1, HEAD_CY - HEAD_RY * 0.38],
    ],
    base,
  );
  ink(ctx, outline, 2);

  /** One pointed lock: wide at the scalp, tapering to a tip. */
  const strand = (x0: number, x1: number, tipX: number, tipY: number, curve = 0) => {
    ctx.beginPath();
    ctx.moveTo(x0, HEAD_CY - HEAD_RY * 0.55);
    ctx.quadraticCurveTo((x0 + tipX) / 2 + curve, (HEAD_CY + tipY) / 2, tipX, tipY);
    ctx.quadraticCurveTo(
      (x1 + tipX) / 2 + curve,
      (HEAD_CY + tipY) / 2 + 4,
      x1,
      HEAD_CY - HEAD_RY * 0.5,
    );
    ctx.closePath();
    ctx.fillStyle = base;
    ctx.fill();
    ink(ctx, outline, 1.8);
  };

  const browY = HEAD_CY - 4;
  switch (spec.bangs) {
    case 'blunt':
      strand(-HEAD_RX + 3, -10, -20, browY + 3);
      strand(-13, 8, -2, browY + 6, -2);
      strand(6, HEAD_RX - 3, 20, browY + 3, 2);
      break;
    case 'split':
      strand(-HEAD_RX + 2, -6, -25, browY + 5, -3);
      strand(-8, 2, -12, browY - 4, -1);
      strand(3, 10, 13, browY - 4, 1);
      strand(7, HEAD_RX - 2, 26, browY + 5, 3);
      break;
    case 'swept':
      strand(-HEAD_RX + 2, -14, -26, browY + 8, -4);
      strand(-16, 4, 6, browY + 4, 6);
      strand(2, HEAD_RX - 2, 27, browY - 2, 4);
      break;
  }

  // Side locks framing the jaw.
  for (const side of [-1, 1] as const) {
    // Drawn as a path so the lower end can come to a point.
    ctx.beginPath();
    ctx.moveTo(side * (HEAD_RX - 8), HEAD_CY - HEAD_RY * 0.55);
    ctx.quadraticCurveTo(
      side * (HEAD_RX + 6), HEAD_CY + 2,
      side * (HEAD_RX - 1), HEAD_CY + HEAD_RY * 1.02,
    );
    ctx.quadraticCurveTo(
      side * (HEAD_RX - 8), HEAD_CY + HEAD_RY * 0.45,
      side * (HEAD_RX - 12), HEAD_CY - HEAD_RY * 0.4,
    );
    ctx.closePath();
    ctx.fillStyle = base;
    ctx.fill();
    ink(ctx, outline, 1.6);
  }

  // Angel ring: the specular band that makes hair read as glossy.
  withState(ctx, () => {
    const band = ctx.createLinearGradient(-HEAD_RX, top + 8, HEAD_RX, top + 20);
    band.addColorStop(0, alpha(hairLight(p), 0));
    band.addColorStop(0.42, alpha(hairLight(p), 0.85));
    band.addColorStop(0.6, alpha(hairLight(p), 0.85));
    band.addColorStop(1, alpha(hairLight(p), 0));
    ctx.fillStyle = band;
    ctx.beginPath();
    ctx.ellipse(-4, top + 14, HEAD_RX * 0.74, 5.5, -0.1, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawHeadwear(ctx: Ctx2D, spec: CharacterSpec): void {
  const p = spec.palette;
  const topY = HEAD_CY - HEAD_RY;

  switch (spec.headwear) {
    case 'witch': {
      // The main colour, not the accent — the accent is the apron on most specs
      // and reads far too light for a witch hat.
      fillEllipse(ctx, 0, topY + 4, HEAD_RX + 27, 12, shift(p.main, -0.3));
      ink(ctx, inkOf(p.main), 2);
      fillBlob(
        ctx,
        [
          [-30, topY + 4],
          [-9, topY - 40],
          [5, topY - 54],
          [16, topY - 34],
          [30, topY + 4],
        ],
        shift(p.main, -0.04),
      );
      ink(ctx, inkOf(p.main), 2);
      fillPolygon(ctx, [-30, topY + 2, 30, topY + 2, 30, topY - 7, -30, topY - 7], p.trim);
      ink(ctx, inkOf(p.trim), 1.6);
      break;
    }
    case 'mob': {
      fillEllipse(ctx, 0, topY + 1, HEAD_RX + 9, 19, shift(p.accent, 0.08));
      ink(ctx, inkOf(p.accent), 2);
      fillEllipse(ctx, 0, topY + 9, HEAD_RX + 11, 7, shift(p.accent, -0.16));
      ink(ctx, inkOf(p.accent), 1.6);
      break;
    }
    case 'ribbon': {
      const rx = -HEAD_RX + 2;
      for (const dir of [-1, 1] as const) {
        fillBlob(
          ctx,
          [
            [rx, topY + 16],
            [rx + dir * 21, topY + 3],
            [rx + dir * 25, topY + 25],
            [rx + dir * 6, topY + 25],
          ],
          p.accent,
        );
        ink(ctx, inkOf(p.accent), 1.8);
      }
      fillCircle(ctx, rx, topY + 16, 6, shift(p.accent, -0.18));
      ink(ctx, inkOf(p.accent), 1.6);
      break;
    }
    case 'tokin': {
      fillCircle(ctx, 0, topY + 5, 11, shift(p.trim, 0.16));
      ink(ctx, inkOf(p.trim), 1.8);
      break;
    }
    case 'cap': {
      fillBlob(ctx, [[-HEAD_RX + 1, topY + 11], [0, topY - 12], [HEAD_RX - 1, topY + 11]], p.accent);
      ink(ctx, inkOf(p.accent), 2);
      fillEllipse(ctx, 7, topY + 13, HEAD_RX * 0.82, 6, shift(p.accent, -0.22));
      ink(ctx, inkOf(p.accent), 1.6);
      break;
    }
    case 'flower': {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        fillEllipse(ctx, -25 + Math.cos(a) * 8, topY + 11 + Math.sin(a) * 8, 6.5, 6.5, p.accent);
        ink(ctx, inkOf(p.accent), 1.3);
      }
      fillCircle(ctx, -25, topY + 11, 4, p.trim);
      break;
    }
    case 'wreath': {
      for (let i = 0; i < 9; i++) {
        const a = Math.PI + (i / 8) * Math.PI;
        fillEllipse(
          ctx,
          Math.cos(a) * (HEAD_RX + 2),
          HEAD_CY + Math.sin(a) * (HEAD_RY + 2),
          6,
          4,
          p.accent,
          a,
        );
      }
      break;
    }
    case 'horns': {
      for (const side of [-1, 1] as const) {
        fillBlob(
          ctx,
          [
            [side * 13, topY + 12],
            [side * 19, topY - 24],
            [side * 27, topY - 19],
            [side * 26, topY + 13],
          ],
          shift(p.trim, 0.22),
        );
        ink(ctx, inkOf(p.trim), 1.8);
      }
      break;
    }
    case 'crown': {
      fillPolygon(
        ctx,
        [
          -20, topY + 9, -20, topY - 9, -10, topY + 1, 0, topY - 13,
          10, topY + 1, 20, topY - 9, 20, topY + 9,
        ],
        p.trim,
      );
      ink(ctx, inkOf(p.trim), 1.8);
      break;
    }
  }
}

// ------------------------------------------------------------- entry point

/**
 * Draws a character at (x, y), where y is the ground the figure stands on.
 * Only the colour layer is drawn here; call `characterRim` for the light pass.
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

  const walking = options.walk !== undefined;
  const walkPhase = (options.walk ?? 0) * Math.PI * 2;

  // Walking bounces twice per stride; idling breathes.
  const bob = walking
    ? Math.abs(Math.sin(walkPhase)) * -3.2
    : options.still
      ? 0
      : Math.sin(t * spec.idle.bobHz * Math.PI * 2 + phase) * spec.idle.bobAmp;
  const sway =
    options.still || walking
      ? 0
      : Math.sin(t * spec.idle.bobHz * Math.PI + phase) * spec.idle.swayDeg;
  const mood = options.mood ?? 0.7;

  // Blink: mostly open, with a quick close roughly every four seconds.
  const blinkCycle = (t * 0.25 + phase) % 1;
  const blink = options.still
    ? 0
    : blinkCycle > 0.94
      ? Math.sin(((blinkCycle - 0.94) / 0.06) * Math.PI)
      : 0;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(options.flip ? -scale : scale, scale);
  ctx.translate(0, bob);
  ctx.rotate((sway * Math.PI) / 180);

  drawWings(ctx, spec, t * 1.6 + phase);
  drawHairBack(ctx, spec, sway * 0.6);
  drawLegs(ctx, spec, walkPhase, walking);
  drawBody(ctx, spec);
  drawArms(ctx, spec, walkPhase, walking, options.carrying === true);
  drawHead(ctx, spec);
  drawEars(ctx, spec);
  drawHairFront(ctx, spec);
  drawFace(ctx, spec, blink, mood);
  drawHeadwear(ctx, spec);

  ctx.restore();
}

/**
 * Warm rim light down one edge of the figure. Drawn into the light buffer, it
 * is what stops the flat vector fills reading as clip art.
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
  ctx.globalAlpha = 0.26;

  const g = ctx.createLinearGradient(from * HEAD_RX, HEAD_CY, -from * HEAD_RX * 0.2, HEAD_CY);
  g.addColorStop(0, alpha('#ffc27a', 0.75));
  g.addColorStop(1, alpha('#ffc27a', 0));
  fillEllipse(ctx, 0, HEAD_CY, HEAD_RX, HEAD_RY, g);
  fillEllipse(ctx, 0, (SHOULDER_Y + HIP_Y) / 2, 25, 23, g);

  ctx.restore();
}

/** Soft contact shadow, drawn before a figure to ground it on the floor. */
export function characterShadow(
  ctx: Ctx2D,
  x: number,
  y: number,
  height: number,
  strength = 0.4,
): void {
  const rx = height * 0.19;
  withState(ctx, () => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
    g.addColorStop(0, shade(strength));
    g.addColorStop(1, shade(0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, rx * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

export const RIG = { HEIGHT: RIG_HEIGHT, HEAD_CY, SHOULDER_Y, HIP_Y };
