/**
 * Street plan around the tower and the traffic rules the cars follow: right-hand traffic, a signal
 * cycle at the junction of the avenue and the side street, stop lines before every crossing.
 * North is -z, east is +x; the avenue runs east-west in front of the entrance.
 */
export const AVENUE_Z = 52;
export const AVENUE_HALF = 8;
export const SIDE_X = -64;
export const SIDE_HALF = 5;
export const ROAD_HALF = 420;
export const RIVER = { z0: -470, z1: -600 };

/**
 * Manhattan grid beyond the two signalled streets: avenues run north-south (along z) and streets
 * east-west, aligned with the side street and the avenue so those continue as grid lines past the
 * end of their traffic, all the way to the river and the edge of the ground.
 */
export const GRID = { avenueEvery: 150, streetEvery: 90, avenueHalf: 6, streetHalf: 4.5, extent: 1150 };
const RIVERSIDE = [RIVER.z0 + 14, RIVER.z1 - 14] as const;

export type Strip = { axis: 'x' | 'z'; at: number; half: number; from: number; to: number; kind: 'avenue' | 'street' };

function gridLines(origin: number, every: number): number[] {
  const out: number[] = [];
  for (let v = origin - Math.floor((GRID.extent + origin) / every) * every; v <= GRID.extent; v += every) out.push(v);
  return out;
}
export const GRID_AVENUES_X = gridLines(SIDE_X, GRID.avenueEvery);
export const GRID_STREETS_Z = [...gridLines(AVENUE_Z, GRID.streetEvery).filter((z) => z > RIVER.z0 + 30 || z < RIVER.z1 - 30), ...RIVERSIDE];

const inRiver = (z: number, pad: number) => z > RIVER.z1 - pad && z < RIVER.z0 + pad;

/** True within `pad` metres of a grid road, so towers keep to the blocks. */
export function nearGrid(x: number, z: number, pad: number): boolean {
  return (
    GRID_AVENUES_X.some((a) => Math.abs(x - a) < GRID.avenueHalf + pad) || GRID_STREETS_Z.some((s) => Math.abs(z - s) < GRID.streetHalf + pad)
  );
}

/**
 * The drawn pieces of the grid: each line is walked in `step`-metre chunks and broken wherever
 * `blocked` (modelled blocks with their own streets, the tower's plaza), the river, or one of the two
 * signalled streets already covers it.
 */
export function gridStrips(blocked: (x: number, z: number) => boolean, step = 10): Strip[] {
  const out: Strip[] = [];
  const walk = (axis: 'x' | 'z', at: number, half: number, kind: Strip['kind'], skip: (t: number) => boolean) => {
    let from: number | null = null;
    for (let t = -GRID.extent; t <= GRID.extent; t += step) {
      const c = t + step / 2;
      const [x, z] = axis === 'x' ? [c, at] : [at, c];
      const open = c < GRID.extent && !skip(c) && !inRiver(z, 2) && !blocked(x, z);
      if (open && from === null) from = t;
      if (!open && from !== null) {
        out.push({ axis, at, half, from, to: t, kind });
        from = null;
      }
    }
  };
  const acrossAvenue = (x: number, z: number) => Math.abs(x) < ROAD_HALF && Math.abs(z - AVENUE_Z) < AVENUE_HALF + SIDEWALK;
  const acrossSide = (x: number, z: number) => Math.abs(z) < ROAD_HALF && Math.abs(x - SIDE_X) < SIDE_HALF + SIDEWALK;
  for (const x of GRID_AVENUES_X) walk('z', x, GRID.avenueHalf, 'avenue', (z) => (x === SIDE_X && Math.abs(z) < ROAD_HALF) || acrossAvenue(x, z));
  for (const z of GRID_STREETS_Z) walk('x', z, GRID.streetHalf, 'street', (x) => (z === AVENUE_Z && Math.abs(x) < ROAD_HALF) || acrossSide(x, z));
  return out;
}
/** Zebra crossing in front of the entrance; cars stop `stopLine` metres before its centre. */
export const CROSSWALK = { x: 4, stopLine: 8 };
export const SIDEWALK = 3.2;
/** Width of the zebra crossings at the junction and the gap between them and the stop line. */
export const JUNCTION_CROSSING = 4;
const STOP_GAP = 1;

export type Lane = { axis: 'x' | 'z'; at: number; dir: 1 | -1; road: 'avenue' | 'side' };

/** Two lanes each way on the avenue, one each way on the side street; `dir` is the travel direction along the axis. */
export const LANES: Lane[] = [
  { axis: 'x', at: AVENUE_Z + 1.9, dir: 1, road: 'avenue' },
  { axis: 'x', at: AVENUE_Z + 5.5, dir: 1, road: 'avenue' },
  { axis: 'x', at: AVENUE_Z - 1.9, dir: -1, road: 'avenue' },
  { axis: 'x', at: AVENUE_Z - 5.5, dir: -1, road: 'avenue' },
  { axis: 'z', at: SIDE_X - 2.2, dir: 1, road: 'side' },
  { axis: 'z', at: SIDE_X + 2.2, dir: -1, road: 'side' },
];

/** Where along its axis a lane's stop line before the junction lies. */
export function junctionStopLine(lane: Lane): number {
  const centre = lane.road === 'avenue' ? SIDE_X : AVENUE_Z;
  const half = lane.road === 'avenue' ? SIDE_HALF : AVENUE_HALF;
  return centre - lane.dir * (half + JUNCTION_CROSSING + STOP_GAP);
}

/** Where along its axis a lane leaves the junction box (far edge of the far crossing). */
export function junctionExit(lane: Lane): number {
  const centre = lane.road === 'avenue' ? SIDE_X : AVENUE_Z;
  const half = lane.road === 'avenue' ? SIDE_HALF : AVENUE_HALF;
  return centre + lane.dir * (half + JUNCTION_CROSSING);
}

export type Light = 'green' | 'yellow' | 'red';
export const SIGNAL = { avenueGreen: 16, sideGreen: 10, yellow: 3, allRed: 2 };
export const SIGNAL_CYCLE = SIGNAL.avenueGreen + SIGNAL.sideGreen + 2 * (SIGNAL.yellow + SIGNAL.allRed);

/** Signal state for each road `t` seconds into the cycle; there is always an all-red pause between the two greens. */
export function signalAt(t: number): Record<Lane['road'], Light> {
  const s = ((t % SIGNAL_CYCLE) + SIGNAL_CYCLE) % SIGNAL_CYCLE;
  const a1 = SIGNAL.avenueGreen;
  const a2 = a1 + SIGNAL.yellow;
  const a3 = a2 + SIGNAL.allRed;
  const s1 = a3 + SIGNAL.sideGreen;
  const s2 = s1 + SIGNAL.yellow;
  if (s < a1) return { avenue: 'green', side: 'red' };
  if (s < a2) return { avenue: 'yellow', side: 'red' };
  if (s < a3) return { avenue: 'red', side: 'red' };
  if (s < s1) return { avenue: 'red', side: 'green' };
  if (s < s2) return { avenue: 'red', side: 'yellow' };
  return { avenue: 'red', side: 'red' };
}

/** Comfortable braking used to decide whether a car can still stop for a yellow light (m/s²). */
const COMFORT_BRAKE = 4.5;
/** Half a car length plus a little room: how far behind the line the car's centre comes to rest. */
export const CAR_HALF = 2.6;

/**
 * Whether a car `ahead` metres (centre to line, along its travel) from a stop line must stop for the
 * light. Red: stop unless the nose is already over the line. Yellow: stop only if it can do so comfortably.
 */
export function mustStop(light: Light, ahead: number, speed: number): boolean {
  if (light === 'green') return false;
  const room = ahead - CAR_HALF;
  if (light === 'red') return room > -1;
  return room > (speed * speed) / (2 * COMFORT_BRAKE);
}

/** Target speed that brings a car to rest with its nose at a line `ahead` metres away. */
export const approachSpeed = (ahead: number) => Math.max(0, (ahead - CAR_HALF) * 0.9);

/** Sign posts along the streets: which sign, where, and the yaw that turns it to face oncoming traffic. */
export type SignSpot = { sign: 'SignSignal' | 'SignNoUturn' | 'SignSpeed' | 'SignWalk'; x: number; z: number; r: number };
const KERB_N = AVENUE_Z - AVENUE_HALF - 1.2;
const KERB_S = AVENUE_Z + AVENUE_HALF + 1.2;
const FACE_WEST = -Math.PI / 2;
const FACE_EAST = Math.PI / 2;
export const SIGN_SPOTS: SignSpot[] = [
  { sign: 'SignSignal', x: SIDE_X - 80, z: KERB_S, r: FACE_WEST },
  { sign: 'SignSignal', x: 30, z: KERB_N, r: FACE_EAST },
  { sign: 'SignSignal', x: SIDE_X - SIDE_HALF - 1.2, z: AVENUE_Z - 85, r: Math.PI },
  { sign: 'SignSignal', x: SIDE_X + SIDE_HALF + 1.2, z: AVENUE_Z + 85, r: 0 },
  { sign: 'SignNoUturn', x: SIDE_X - SIDE_HALF - JUNCTION_CROSSING - 2.5, z: KERB_S, r: FACE_WEST },
  { sign: 'SignNoUturn', x: SIDE_X + SIDE_HALF + JUNCTION_CROSSING + 2.5, z: KERB_N, r: FACE_EAST },
  { sign: 'SignSpeed', x: -32, z: KERB_S, r: FACE_WEST },
  { sign: 'SignSpeed', x: SIDE_X - 40, z: KERB_N, r: FACE_EAST },
  { sign: 'SignSpeed', x: SIDE_X - SIDE_HALF - 1.2, z: AVENUE_Z + 40, r: Math.PI },
  { sign: 'SignSpeed', x: SIDE_X + SIDE_HALF + 1.2, z: AVENUE_Z - 40, r: 0 },
  { sign: 'SignWalk', x: -18, z: KERB_S, r: FACE_WEST },
  { sign: 'SignWalk', x: 18, z: KERB_N, r: FACE_EAST },
];
