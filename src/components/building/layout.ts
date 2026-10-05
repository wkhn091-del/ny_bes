import type { Vector3 } from 'three';
import { CLEAR_HEIGHT, COLUMN_SIZE, COLUMN_XS, COLUMNS, CORE, FLOOR_COUNT, PLATE, programOf } from '@/components/three/building-model';
import { clamp } from '@/components/three/first-person';
import { seededRandom, type Item } from './shared';

export type Layout = {
  desks: Item[];
  chairs: Item[];
  monitors: Item[];
  exec: Item[];
  glass: Item[];
  tables: Item[];
  screens: Item[];
  sofas: Item[];
  lounge: Item[];
  panels: Item[];
  plants: Item[];
  booths: Item[];
  bars: Item[];
  stools: Item[];
  shelves: Item[];
  rugs: Item[];
};

export const DESK_TOP = [1.2, 0.05, 0.6] as const;
export const CHAIR = [0.5, 0.95, 0.5] as const;
export const MONITOR = [0.56, 0.32, 0.03] as const;
export const TABLE = [4.4, 0.06, 1.4] as const;
export const SCREEN = [0.05, 0.9, 1.6] as const;
export const SOFA = [2.2, 0.75, 0.9] as const;
export const LOUNGE_TABLE = [1.6, 0.06, 1.6] as const;
export const BOOTH = [1.1, 2.3, 1.1] as const;
export const BAR = [6, 1.05, 0.7] as const;
export const SHELF = [0.4, 2.1, 2.4] as const;
export const PLANT_FOOTPRINT = 0.7;
/** Walk-blocking footprints of the realistic sets: the leather lounge and an executive desk with its chair. */
export const LOUNGE_SET = [5, 4.5] as const;
export const EXEC_SET = [2.8, 1.9] as const;
export const MEET_SET = [5.4, 2.7] as const;
export const deskTopOffset = (it: Item): Item => ({ ...it, z: it.z + (it.s ?? 1) * 0.3 });

/** Names shown on the desk monitors, cycled desk by desk. */
export const SCREEN_NAMES = ['Avishai Roshan', 'Yochai Avigdor', 'Eliya Vanunu'] as const;

const WINGS: [number, number][] = [
  [-33, -9],
  [9, 33],
];

/** Moves an x position off a column line when it would land within \`clear\` of one. */
function offColumns(x: number, clear: number): number {
  for (const cx of COLUMN_XS) if (Math.abs(x - cx) < clear) return cx + Math.sign(x - cx || 1) * clear;
  return x;
}

/**
 * Illustrative fit-out per floor: open desk rows, glass private offices, or meeting rooms, plus a
 * coffee bar and lounge by the core. Desk rows sit between the column lines so no column lands in a desk.
 */
export function buildLayout(): Layout {
  const L: Layout = {
    desks: [],
    chairs: [],
    monitors: [],
    exec: [],
    glass: [],
    tables: [],
    screens: [],
    sofas: [],
    lounge: [],
    panels: [],
    plants: [],
    booths: [],
    bars: [],
    stools: [],
    shelves: [],
    rugs: [],
  };
  const wallH = CLEAR_HEIGHT - 0.1;
  const rnd = seededRandom(41);
  let screen = 0;

  /** Pod of four desks: two back-to-back pairs, chairs facing in. `r` on a chair is the yaw that turns it toward its desk. */
  const pod = (f: number, px: number, pz: number, k: number) => {
    for (const dx of [-0.66, 0.66]) {
      for (const s of [1, -1]) {
        L.desks.push({ f, x: px + dx, z: pz, r: s === 1 ? 0 : Math.PI, s, k });
        L.chairs.push({ f, x: px + dx, z: pz + s * 1.05, r: s === 1 ? Math.PI : 0, k });
        L.monitors.push({ f, x: px + dx, z: pz + s * 0.12, s, k: screen++ % SCREEN_NAMES.length });
      }
    }
  };
  const podRows = (f: number, x0: number, x1: number, zs: number[]) => {
    let n = 0;
    for (let px = x0 + 2.4; px <= x1 - 2.2; px += 4.6) for (const pz of zs) pod(f, px, pz, (f + n++) % 3);
    for (const pz of zs) L.plants.push({ f, x: x1 - 0.6, z: pz, s: 0.9 + rnd() * 0.4 }, { f, x: x0 + 0.6, z: pz, s: 0.9 + rnd() * 0.4 });
  };

  const glassRoom = (f: number, x: number, w: number, side: number, depth: number, closeEnd: boolean) => {
    const zFront = side * (14.8 - depth);
    const zMid = side * (14.8 - depth / 2);
    L.glass.push({ f, x: x + (w - 1.2) / 2, z: zFront, sx: w - 1.3, sz: 0.06, sy: wallH, y: wallH / 2 });
    L.glass.push({ f, x: x + w - 0.3, z: zFront, sx: 0.5, sz: 0.06, sy: wallH, y: wallH / 2 });
    L.glass.push({ f, x, z: zMid, sx: 0.06, sz: depth, sy: wallH, y: wallH / 2 });
    if (closeEnd) L.glass.push({ f, x: x + w, z: zMid, sx: 0.06, sz: depth, sy: wallH, y: wallH / 2 });
  };

  for (let f = 0; f < FLOOR_COUNT; f++) {
    const program = programOf(f);
    for (const [wx0, wx1] of WINGS) {
      if (program === 'open') {
        podRows(f, wx0, wx1, [-10.6, -6.9, -0.2, 7.2, 11.2]);
      } else if (program === 'offices') {
        for (let x = wx0; x + 6 <= wx1 + 0.01; x += 6) {
          for (const side of [-1, 1]) {
            glassRoom(f, x, 6, side, 5, x + 12 > wx1 + 0.01);
            const ex = offColumns(x + 3, 1.4);
            L.exec.push({ f, x: ex, z: side * 12.3, r: side === -1 ? 0 : Math.PI });
            L.monitors.push({ f, x: ex, z: side * 11.8, s: side, k: screen++ % SCREEN_NAMES.length });
            L.plants.push({ f, x: offColumns(x + 0.7, 1), z: side * 14.1, s: 0.8 + rnd() * 0.3 });
          }
        }
        podRows(f, wx0, wx1, [-7.3, 0, 7.3]);
      } else {
        for (let x = wx0; x + 8 <= wx1 + 0.01; x += 8) {
          for (const side of [-1, 1]) {
            glassRoom(f, x, 8, side, 6.5, x + 16 > wx1 + 0.01);
            const cz = side * 11.6;
            L.tables.push({ f, x: x + 4, z: cz });
            for (let k = 0; k < 6; k++) {
              L.chairs.push({ f, x: x + 4 + (k - 2.5) * 0.78, z: cz - 1.2, r: 0, meet: true });
              L.chairs.push({ f, x: x + 4 + (k - 2.5) * 0.78, z: cz + 1.2, r: Math.PI, meet: true });
            }
            L.screens.push({ f, x: x + 0.15, z: cz });
          }
        }
        podRows(f, wx0, wx1, [-6.4, 0, 6.4]);
      }
    }

    // Beside the core: phone booths on open and meeting floors, bookshelves on office floors.
    for (const side of [-1, 1]) {
      for (const z of [-11.6, -10.3, -1.6, -0.3]) {
        if (program === 'offices') {
          if (z === -11.6 || z === -1.6) L.shelves.push({ f, x: side * 7.65, z: z + 0.65, k: (f + (z < -5 ? 0 : 1)) % 3 });
        } else {
          L.booths.push({ f, x: side * 7.95, z });
        }
      }
    }

    // Lounge and coffee bar in front of the core.
    for (const x of [-4.2, 0, 4.2]) L.sofas.push({ f, x, z: 9.2 });
    for (const x of [-3, 3]) L.sofas.push({ f, x, z: 12.2, r: Math.PI });
    L.lounge.push({ f, x: 0, z: 10.7 });
    L.rugs.push({ f, x: 0, z: 10.7, k: f % 3 });
    L.bars.push({ f, x: 0, z: 5.4 });
    for (let i = 0; i < 5; i++) L.stools.push({ f, x: -2.4 + i * 1.2, z: 6.25 });
    for (const x of [-5.8, 5.8]) L.plants.push({ f, x, z: 12.6, s: 1.2 });

    for (let x = -33; x <= 33; x += 3) {
      for (let z = -13.5; z <= 13.5; z += 3) {
        if (x > CORE.x0 - 0.3 && x < CORE.x1 + 0.3 && z > CORE.z0 - 0.2 && z < CORE.z1 + 0.2) continue;
        L.panels.push({ f, x, z, s: x < 0 ? 0 : 1 });
      }
    }
  }
  return L;
}

export type Rect = { x0: number; x1: number; z0: number; z1: number };
export const rectAt = (x: number, z: number, w: number, d: number): Rect => ({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });

const COLUMN_RECTS = COLUMNS.map((c) => rectAt(c.x, c.z, COLUMN_SIZE, COLUMN_SIZE));
const FLOOR_BOUNDS: Rect = { x0: -PLATE.x + 0.8, x1: PLATE.x - 0.8, z0: -PLATE.z + 0.8, z1: PLATE.z - 0.8 };

/** Everything a walker on floor \`f\` should not pass through. */
export function obstaclesFor(layout: Layout, f: number): { rects: Rect[]; bounds: Rect } {
  const on = (list: Item[]) => list.filter((it) => it.f === f);
  const rects: Rect[] = [{ ...CORE }, ...COLUMN_RECTS];
  for (const g of on(layout.glass)) rects.push(rectAt(g.x, g.z, g.sx ?? 0.06, g.sz ?? 0.06));
  for (const d of on(layout.desks).map(deskTopOffset)) rects.push(rectAt(d.x, d.z, DESK_TOP[0], DESK_TOP[2]));
  for (const t of on(layout.tables)) rects.push(rectAt(t.x, t.z, MEET_SET[0], MEET_SET[1]));
  for (const so of on(layout.sofas)) rects.push(rectAt(so.x, so.z, SOFA[0], SOFA[2]));
  for (const l of on(layout.lounge)) rects.push(rectAt(l.x, l.z, LOUNGE_SET[0], LOUNGE_SET[1]));
  for (const e of on(layout.exec)) rects.push(rectAt(e.x, e.z, EXEC_SET[0], EXEC_SET[1]));
  for (const p of on(layout.plants)) rects.push(rectAt(p.x, p.z, PLANT_FOOTPRINT, PLANT_FOOTPRINT));
  for (const b of on(layout.booths)) rects.push(rectAt(b.x, b.z, BOOTH[0], BOOTH[2]));
  for (const b of on(layout.bars)) rects.push(rectAt(b.x, b.z, BAR[0], BAR[2]));
  for (const s of on(layout.shelves)) rects.push(rectAt(s.x, s.z, SHELF[0], SHELF[2]));
  return { rects, bounds: FLOOR_BOUNDS };
}

const BODY = 0.3;

/** Keeps a point inside the bounds and out of every rect, pushing it out along the shortest axis. */
export function keepWalkable(p: Vector3, rects: Rect[], bounds: Rect): Vector3 {
  p.x = clamp(p.x, bounds.x0, bounds.x1);
  p.z = clamp(p.z, bounds.z0, bounds.z1);
  for (const r of rects) {
    const x0 = r.x0 - BODY;
    const x1 = r.x1 + BODY;
    const z0 = r.z0 - BODY;
    const z1 = r.z1 + BODY;
    if (p.x <= x0 || p.x >= x1 || p.z <= z0 || p.z >= z1) continue;
    const dl = p.x - x0;
    const dr = x1 - p.x;
    const dn = p.z - z0;
    const df = z1 - p.z;
    const m = Math.min(dl, dr, dn, df);
    if (m === dl) p.x = x0;
    else if (m === dr) p.x = x1;
    else if (m === dn) p.z = z0;
    else p.z = z1;
  }
  return p;
}
