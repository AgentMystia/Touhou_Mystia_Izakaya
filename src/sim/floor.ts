/**
 * The izakaya floor: layout, movement and reach.
 *
 * The night is played from a three-quarter view of the shop interior. Mystia
 * walks the floor on WASD; the kitchen stations line the back wall, guests sit
 * at tables in front, and the drink shelf stands at one end. Depth is a plain
 * scalar rather than a real projection — screen y and sprite scale both derive
 * from it, which is enough to sell the perspective and keeps collision to
 * simple rectangles in floor space.
 */

/** Floor space is x across the shop, y from the back wall toward the viewer. */
export interface FloorPoint {
  x: number;
  y: number;
}

export const FLOOR = {
  width: 1660,
  depth: 430,
  /** Screen position of floor (0, 0). */
  originX: 130,
  originY: 505,
  /** Sprites at the back are this fraction of their size at the front. */
  minScale: 0.84,
  maxScale: 1.12,
} as const;

/** Where a floor point lands on screen. */
export const toScreen = (p: FloorPoint): { x: number; y: number } => ({
  x: FLOOR.originX + p.x,
  y: FLOOR.originY + p.y,
});

/** Depth scale at a floor point; nearer the viewer is bigger. */
export const depthScale = (y: number): number =>
  FLOOR.minScale + (Math.max(0, Math.min(FLOOR.depth, y)) / FLOOR.depth) * (FLOOR.maxScale - FLOOR.minScale);

export interface Obstacle {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface StationSlot extends Obstacle {
  index: number;
  kind: string;
  /** Where Mystia must stand to cook or collect. */
  approach: FloorPoint;
}

export interface SeatSlot extends Obstacle {
  index: number;
  /** Where the guest sits, and where a thrown plate lands. */
  seat: FloorPoint;
  /** Where the plate rests once served. */
  tableTop: FloorPoint;
  /** Where Mystia must stand to hand a plate over. */
  approach: FloorPoint;
}

export interface ShelfSlot extends Obstacle {
  approach: FloorPoint;
}

/** Scenery you bump into but cannot use. */
export interface Clutter extends Obstacle {
  kind: 'barrels' | 'crates';
}

export interface FloorLayout {
  stations: StationSlot[];
  seats: SeatSlot[];
  /** The drink shelf; walk here to pour. */
  shelf: ShelfSlot;
  clutter: Clutter[];
  obstacles: Obstacle[];
  spawn: FloorPoint;
}

const STATION_W = 168;
const STATION_H = 62;
const TABLE_W = 172;
const TABLE_H = 62;
/** Keeps the right-hand end of the back wall clear for the drink shelf. */
const SHELF_W = 178;

/**
 * Builds the layout for a given number of stations and seats. Stations line the
 * back wall; seats are two rows of tables in the front half, filled
 * back-row-first so a small shop stays tidy.
 */
export function buildLayout(stationKinds: string[], seatCount: number): FloorLayout {
  const stations: StationSlot[] = [];
  const count = Math.max(1, stationKinds.length);
  // Stations share the wall with the shelf, so they only get the left portion.
  const bay = FLOOR.width - SHELF_W - 150;
  // Few stations should still line the wall rather than huddle in the middle.
  const pitch = Math.min(340, bay / count);
  const span = pitch * count;
  const left = 96 + (bay - span) / 2;

  stationKinds.forEach((kind, index) => {
    const cx = left + pitch * (index + 0.5);
    stations.push({
      index,
      kind,
      x: cx - STATION_W / 2,
      y: 4,
      w: STATION_W,
      h: STATION_H,
      approach: { x: cx, y: STATION_H + 46 },
    });
  });

  // Two rows of tables. The back row sits at mid-depth, the front row near the
  // viewer, so guests never occlude the stations.
  const rows = [
    { y: 186, capacity: 3 },
    { y: 322, capacity: 3 },
  ];
  const seats: SeatSlot[] = [];
  let placed = 0;
  for (const row of rows) {
    const inRow = Math.min(row.capacity, seatCount - placed);
    if (inRow <= 0) break;
    const usable = FLOOR.width - 300;
    for (let i = 0; i < inRow; i++) {
      const cx = 150 + (usable / inRow) * (i + 0.5);
      seats.push({
        index: placed,
        x: cx - TABLE_W / 2,
        y: row.y,
        w: TABLE_W,
        h: TABLE_H,
        // The guest sits *at* the table, so the slab crops them at the waist.
        seat: { x: cx, y: row.y + 34 },
        tableTop: { x: cx, y: row.y + TABLE_H * 0.5 },
        // Mystia serves from the near side.
        approach: { x: cx, y: row.y + TABLE_H + 30 },
      });
      placed++;
    }
  }

  const shelf: ShelfSlot = {
    x: FLOOR.width - SHELF_W - 26,
    y: 4,
    w: SHELF_W,
    h: 62,
    approach: { x: FLOOR.width - SHELF_W / 2 - 26, y: 112 },
  };

  // Stock stacked in the near corners, where nobody needs to walk.
  const clutter: Clutter[] = [
    { kind: 'barrels', x: 6, y: FLOOR.depth - 128, w: 118, h: 74 },
    { kind: 'crates', x: FLOOR.width - 136, y: FLOOR.depth - 118, w: 126, h: 66 },
  ];

  return {
    stations,
    seats,
    shelf,
    clutter,
    obstacles: [
      ...stations,
      ...seats.map((s) => ({ x: s.x, y: s.y, w: s.w, h: s.h })),
      shelf,
      ...clutter,
    ],
    spawn: { x: FLOOR.width * 0.62, y: FLOOR.depth - 74 },
  };
}

/** Mystia's collision footprint, in floor units. */
export const BODY_RADIUS = 24;

/** How far behind the stations' front edge Mystia may walk. */
const BACK_LIMIT = 96;

const overlaps = (p: FloorPoint, o: Obstacle, r: number): boolean =>
  p.x + r > o.x && p.x - r < o.x + o.w && p.y + r > o.y && p.y - r < o.y + o.h;

/**
 * Moves a point by (dx, dy), sliding along obstacles rather than sticking to
 * them — axes are resolved separately so running into a table edge still lets
 * you slide past it.
 */
export function moveWithCollision(
  from: FloorPoint,
  dx: number,
  dy: number,
  layout: FloorLayout,
  radius = BODY_RADIUS,
): FloorPoint {
  const clampX = (x: number) => Math.max(radius + 8, Math.min(FLOOR.width - radius - 8, x));
  const clampY = (y: number) => Math.max(BACK_LIMIT, Math.min(FLOOR.depth - 4, y));

  let next: FloorPoint = { x: clampX(from.x + dx), y: from.y };
  if (layout.obstacles.some((o) => overlaps(next, o, radius))) next = { x: from.x, y: from.y };

  const withY: FloorPoint = { x: next.x, y: clampY(next.y + dy) };
  if (!layout.obstacles.some((o) => overlaps(withY, o, radius))) return withY;
  return next;
}

export const distance = (a: FloorPoint, b: FloorPoint): number => Math.hypot(a.x - b.x, a.y - b.y);

/** How close Mystia must stand to an approach spot to use it. */
export const REACH = 92;

/** The nearest item whose approach point is within reach, or null. */
export function nearestByApproach<T extends { approach: FloorPoint }>(
  from: FloorPoint,
  items: readonly T[],
  reach = REACH,
): T | null {
  let best: T | null = null;
  let bestD = reach;
  for (const item of items) {
    const d = distance(from, item.approach);
    if (d < bestD) {
      bestD = d;
      best = item;
    }
  }
  return best;
}
