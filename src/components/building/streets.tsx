'use client';

import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  Box3,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  type InstancedMesh,
  type Material,
  Matrix4,
  type Mesh,
  MeshBasicMaterial,
  type MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useLiteDevice } from '@/components/three/capability';
import { DRACO_PATH } from '@/components/three/desk-model';
import { ModelInstances } from './interior';
import { disposeGroups, groupsOf } from './realistic';
import {
  AVENUE_HALF,
  AVENUE_Z,
  CROSSWALK,
  JUNCTION_CROSSING,
  LANES,
  type Lane,
  type Light,
  ROAD_HALF,
  type Strip,
  SIDEWALK,
  SIDE_HALF,
  SIDE_X,
  SIGN_SPOTS,
  approachSpeed,
  junctionExit,
  junctionStopLine,
  mustStop,
  signalAt,
} from './roads';
import { WALK, seededRandom } from './shared';
import { applyDayTints, dayTint } from './sky';

export const TRAFFIC_A_URL = '/models/spacehub-traffic-a.glb';
/** "Fictional supercar - V12 Goblin" by ollitei and "Lamborghini Revuelto" by DRIVER-FIRE (both CC-BY-4.0; badges removed). */
export const GOBLIN_URL = '/models/car-goblin.glb';
export const REVUELTO_URL = '/models/car-revuelto.glb';
/** Built by scripts/build-lite-assets.mts: about a quarter of the triangles, for phones. */
export const REVUELTO_LITE_URL = '/models/car-revuelto-lite.glb';
/** "Road Signs" by FrodoUndead (CC-BY-4.0): crossing, speed limit, signal ahead, no U-turn. */
export const SIGNS_URL = '/models/road-signs.glb';

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const UP = new Vector3(0, 1, 0);
const AXLE = new Vector3(1, 0, 0);
const _w = new Matrix4();
const _wq = new Quaternion();

function setInstances(mesh: InstancedMesh | null, list: Matrix4[]) {
  if (!mesh) return;
  list.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.instanceMatrix.needsUpdate = true;
}

/** Fine aggregate, darker patches and a few sealed cracks; mid-grey so the day/night tint sets the overall tone. */
function asphaltTexture(): CanvasTexture {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const rnd = seededRandom(5);
  for (let i = 0; i < size * size; i++) {
    const v = 168 + rnd() * 52 + (rnd() < 0.02 ? 40 : 0);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = `rgba(40,40,44,${0.05 + rnd() * 0.07})`;
    ctx.beginPath();
    ctx.ellipse(rnd() * size, rnd() * size, 20 + rnd() * 70, 10 + rnd() * 40, rnd() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(25,25,28,0.45)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    let x = rnd() * size;
    let y = rnd() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 7; k++) ctx.lineTo((x += (rnd() - 0.5) * 60), (y += (rnd() - 0.5) * 60));
    ctx.stroke();
  }
  return repeating(c);
}

/** Square concrete slabs with dark joints, four by four per tile. */
function pavingTexture(): CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const rnd = seededRandom(8);
  const slab = size / 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tone = (Math.floor(x / slab) * 7 + Math.floor(y / slab) * 13) % 5;
      const v = 196 + tone * 6 + rnd() * 26;
      const i = (y * size + x) * 4;
      img.data[i] = v;
      img.data[i + 1] = v - 3;
      img.data[i + 2] = v - 8;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  ctx.fillStyle = 'rgba(30,28,26,0.55)';
  for (let k = 0; k < 4; k++) {
    ctx.fillRect(k * slab, 0, 2, size);
    ctx.fillRect(0, k * slab, size, 2);
  }
  return repeating(c);
}

function repeating(c: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Rewrites UVs in metres / `tile`, so one texture covers planes and slabs of any size at the same scale. */
function metricPlane(w: number, h: number, tile: number): PlaneGeometry {
  const g = new PlaneGeometry(w, h);
  const uv = g.attributes.uv!;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * h) / tile);
  return g;
}

function metricBox(sx: number, sy: number, sz: number, tile: number): BoxGeometry {
  const g = new BoxGeometry(sx, sy, sz);
  const uv = g.attributes.uv!;
  const faces: [number, number][] = [
    [sz, sy],
    [sz, sy],
    [sx, sz],
    [sx, sz],
    [sx, sy],
    [sx, sy],
  ];
  faces.forEach(([u, v], f) => {
    for (let i = f * 4; i < f * 4 + 4; i++) uv.setXY(i, (uv.getX(i) * u) / tile, (uv.getY(i) * v) / tile);
  });
  return g;
}

/** The parts of [from, to] outside every gap. */
function segments(from: number, to: number, gaps: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  let at = from;
  for (const [a, b] of [...gaps].sort((p, q) => p[0] - q[0])) {
    if (b <= at || a >= to) continue;
    if (a > at) out.push([at, a]);
    at = Math.max(at, b);
  }
  if (at < to) out.push([at, to]);
  return out;
}

const LAMP_HEAD = new Color('#ffd9a0').multiplyScalar(2.4);
/** Road paint sits well clear of the asphalt and is pulled forward in depth, so it never flickers from far away. */
const MARK_Y = 0.07;
const KERB_H = 0.18;
const JUNCTION_X: [number, number] = [SIDE_X - SIDE_HALF - JUNCTION_CROSSING, SIDE_X + SIDE_HALF + JUNCTION_CROSSING];
const JUNCTION_Z: [number, number] = [AVENUE_Z - AVENUE_HALF - JUNCTION_CROSSING, AVENUE_Z + AVENUE_HALF + JUNCTION_CROSSING];
const ENTRANCE_X: [number, number] = [-CROSSWALK.x, CROSSWALK.x];

const markX = (list: Matrix4[], x0: number, x1: number, z: number, width: number) =>
  list.push(new Matrix4().compose(new Vector3((x0 + x1) / 2, MARK_Y, z), _q.identity(), new Vector3(x1 - x0, 1, width)));
const markZ = (list: Matrix4[], z0: number, z1: number, x: number, width: number) =>
  list.push(new Matrix4().compose(new Vector3(x, MARK_Y, (z0 + z1) / 2), _q.identity(), new Vector3(width, 1, z1 - z0)));

/** Lane paint: double yellow centre lines, dashed lane dividers, edge lines, stop lines and zebra crossings. */
function roadMarkings() {
  const white: Matrix4[] = [];
  const yellow: Matrix4[] = [];
  const aveGaps: [number, number][] = [JUNCTION_X, ENTRANCE_X];
  for (const [a, b] of segments(-ROAD_HALF, ROAD_HALF, aveGaps)) {
    for (const dz of [-0.16, 0.16]) markX(yellow, a, b, AVENUE_Z + dz, 0.12);
    for (const dz of [-(AVENUE_HALF - 0.35), AVENUE_HALF - 0.35]) markX(white, a, b, AVENUE_Z + dz, 0.15);
  }
  const dashGaps: [number, number][] = [
    [JUNCTION_X[0] - 6, JUNCTION_X[1] + 6],
    [-CROSSWALK.stopLine - 6, CROSSWALK.stopLine + 6],
  ];
  for (let x = -ROAD_HALF; x < ROAD_HALF; x += 9) {
    if (dashGaps.some(([a, b]) => x + 3 > a && x < b)) continue;
    for (const dz of [-3.7, 3.7]) markX(white, x, x + 3, AVENUE_Z + dz, 0.14);
  }
  for (const [a, b] of segments(-ROAD_HALF, ROAD_HALF, [JUNCTION_Z])) {
    for (const dx of [-0.16, 0.16]) markZ(yellow, a, b, SIDE_X + dx, 0.12);
    for (const dx of [-(SIDE_HALF - 0.3), SIDE_HALF - 0.3]) markZ(white, a, b, SIDE_X + dx, 0.15);
  }
  for (const dir of [1, -1] as const) {
    const ave = LANES.find((l) => l.road === 'avenue' && l.dir === dir)!;
    const sx = junctionStopLine(ave);
    markZ(white, Math.min(AVENUE_Z, AVENUE_Z + dir * AVENUE_HALF), Math.max(AVENUE_Z, AVENUE_Z + dir * AVENUE_HALF), sx, 0.45);
    const ex = -dir * CROSSWALK.stopLine;
    markZ(white, Math.min(AVENUE_Z, AVENUE_Z + dir * AVENUE_HALF), Math.max(AVENUE_Z, AVENUE_Z + dir * AVENUE_HALF), ex, 0.45);
    const side = LANES.find((l) => l.road === 'side' && l.dir === dir)!;
    const sz = junctionStopLine(side);
    markX(white, Math.min(SIDE_X, SIDE_X - dir * SIDE_HALF), Math.max(SIDE_X, SIDE_X - dir * SIDE_HALF), sz, 0.45);
  }
  const zebraAcrossAvenue = (cx: number, len: number) => {
    for (let z = AVENUE_Z - AVENUE_HALF + 0.6; z < AVENUE_Z + AVENUE_HALF - 0.4; z += 1.1) markX(white, cx - len / 2, cx + len / 2, z, 0.55);
  };
  zebraAcrossAvenue(0, CROSSWALK.x * 2);
  zebraAcrossAvenue(SIDE_X - SIDE_HALF - JUNCTION_CROSSING / 2, JUNCTION_CROSSING - 0.6);
  zebraAcrossAvenue(SIDE_X + SIDE_HALF + JUNCTION_CROSSING / 2, JUNCTION_CROSSING - 0.6);
  for (const cz of [AVENUE_Z - AVENUE_HALF - JUNCTION_CROSSING / 2, AVENUE_Z + AVENUE_HALF + JUNCTION_CROSSING / 2]) {
    for (let x = SIDE_X - SIDE_HALF + 0.6; x < SIDE_X + SIDE_HALF - 0.4; x += 1.1) markZ(white, cz - (JUNCTION_CROSSING - 0.6) / 2, cz + (JUNCTION_CROSSING - 0.6) / 2, x, 0.55);
  }
  return { white, yellow };
}

/** Street lamps on both kerbs of both streets, clear of the junction. */
function streetLamps() {
  const poles: Matrix4[] = [];
  const heads: Matrix4[] = [];
  const along = new Quaternion().setFromAxisAngle(UP, Math.PI / 2);
  for (let x = -300; x <= 300; x += 26) {
    if (Math.abs(x) < 10 || (x > JUNCTION_X[0] - 8 && x < JUNCTION_X[1] + 8)) continue;
    for (const z of [AVENUE_Z - AVENUE_HALF - 1.2, AVENUE_Z + AVENUE_HALF + 1.2]) {
      poles.push(new Matrix4().makeTranslation(x, 4.5, z));
      heads.push(new Matrix4().makeTranslation(x, 9, z + (z < AVENUE_Z ? 1.2 : -1.2)));
    }
  }
  for (let z = -300; z <= 300; z += 26) {
    if (z > JUNCTION_Z[0] - 8 && z < JUNCTION_Z[1] + 8) continue;
    for (const x of [SIDE_X - SIDE_HALF - 1.2, SIDE_X + SIDE_HALF + 1.2]) {
      poles.push(new Matrix4().makeTranslation(x, 4.5, z));
      heads.push(new Matrix4().compose(new Vector3(x + (x < SIDE_X ? 1.2 : -1.2), 9, z), along, new Vector3(1, 1, 1)));
    }
  }
  return { poles, heads };
}

/** Streets: textured asphalt and paving, kerbed sidewalks on both streets, lane paint and street lamps. */
export function Streets({ strips }: { strips: Strip[] }) {
  const white = useRef<InstancedMesh>(null);
  const yellow = useRef<InstancedMesh>(null);
  const lamps = useRef<InstancedMesh>(null);
  const heads = useRef<InstancedMesh>(null);
  const marks = useMemo(() => roadMarkings(), []);
  const lampData = useMemo(() => streetLamps(), []);
  useLayoutEffect(() => {
    setInstances(white.current, marks.white);
    setInstances(yellow.current, marks.yellow);
    setInstances(lamps.current, lampData.poles);
    setInstances(heads.current, lampData.heads);
  }, [marks, lampData]);

  const { mats, tints, geo } = useMemo(() => {
    const asphalt = asphaltTexture();
    const paving = pavingTexture();
    const mats = {
      ground: new MeshStandardMaterial({ roughness: 0.95, map: paving }),
      plaza: new MeshStandardMaterial({ roughness: 0.75, metalness: 0.02, envMapIntensity: 0.45, map: paving }),
      road: new MeshStandardMaterial({ roughness: 0.82, metalness: 0.05, map: asphalt }),
      walk: new MeshStandardMaterial({ roughness: 0.85, map: paving }),
    };
    const tints = [
      dayTint(mats.ground, '#14161c', '#8e8a83'),
      dayTint(mats.plaza, '#20232a', '#b4aea4'),
      dayTint(mats.road, '#1a1c22', '#56585d'),
      dayTint(mats.walk, '#30333b', '#bdb7ad'),
    ];
    const plazaDepth = AVENUE_Z - AVENUE_HALF - SIDEWALK + 40;
    const meets = (s: Strip, centre: number, half: number) =>
      Math.abs(s.at) < ROAD_HALF && (Math.abs(s.to - (centre - half)) < 12 || Math.abs(s.from - (centre + half)) < 12);
    const aveGaps = strips
      .filter((s) => s.axis === 'z' && meets(s, AVENUE_Z, AVENUE_HALF + SIDEWALK))
      .map((s): [number, number] => [s.at - s.half, s.at + s.half]);
    const sideGaps = strips
      .filter((s) => s.axis === 'x' && meets(s, SIDE_X, SIDE_HALF + SIDEWALK))
      .map((s): [number, number] => [s.at - s.half, s.at + s.half]);
    const walkAve = segments(-ROAD_HALF, ROAD_HALF, [[SIDE_X - SIDE_HALF, SIDE_X + SIDE_HALF], ...aveGaps]).map(([a, b]) => ({
      a,
      b,
      g: metricBox(b - a, KERB_H, SIDEWALK, 6),
    }));
    const walkSide = segments(-ROAD_HALF, ROAD_HALF, [[AVENUE_Z - AVENUE_HALF - SIDEWALK, AVENUE_Z + AVENUE_HALF + SIDEWALK], ...sideGaps]).map(([a, b]) => ({
      a,
      b,
      g: metricBox(SIDEWALK, KERB_H, b - a, 6),
    }));
    const geo = {
      ground: metricPlane(2400, 2400, 10),
      plaza: metricPlane(110, plazaDepth, 6),
      plazaZ: (AVENUE_Z - AVENUE_HALF - SIDEWALK - 40) / 2,
      avenue: metricPlane(ROAD_HALF * 2, AVENUE_HALF * 2, 9),
      side: metricPlane(SIDE_HALF * 2, ROAD_HALF * 2, 9),
      walkAve,
      walkSide,
    };
    return { mats, tints, geo };
  }, [strips]);
  useEffect(
    () => () => {
      mats.road.map?.dispose();
      mats.plaza.map?.dispose();
      Object.values(mats).forEach((m) => m.dispose());
      [geo.ground, geo.plaza, geo.avenue, geo.side, ...geo.walkAve.map((w) => w.g), ...geo.walkSide.map((w) => w.g)].forEach((g) => g.dispose());
    },
    [mats, geo],
  );
  useFrame(() => applyDayTints(tints));

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.06, 0]} geometry={geo.ground} material={mats.ground} />
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, geo.plazaZ]} geometry={geo.plaza} material={mats.plaza} />
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, AVENUE_Z]} geometry={geo.avenue} material={mats.road} />
      <mesh rotation-x={-Math.PI / 2} position={[SIDE_X, 0.045, 0]} geometry={geo.side} material={mats.road} />
      {geo.walkAve.flatMap((w) =>
        [AVENUE_Z - AVENUE_HALF - SIDEWALK / 2, AVENUE_Z + AVENUE_HALF + SIDEWALK / 2].map((z) => (
          <mesh key={`a${w.a}${z}`} position={[(w.a + w.b) / 2, KERB_H / 2, z]} geometry={w.g} material={mats.walk} />
        )),
      )}
      {geo.walkSide.flatMap((w) =>
        [SIDE_X - SIDE_HALF - SIDEWALK / 2, SIDE_X + SIDE_HALF + SIDEWALK / 2].map((x) => (
          <mesh key={`s${w.a}${x}`} position={[x, KERB_H / 2, (w.a + w.b) / 2]} geometry={w.g} material={mats.walk} />
        )),
      )}
      <instancedMesh ref={white} args={[undefined, undefined, marks.white.length]}>
        <boxGeometry args={[1, 0.01, 1]} />
        <meshStandardMaterial color="#e4e2da" roughness={0.7} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </instancedMesh>
      <instancedMesh ref={yellow} args={[undefined, undefined, marks.yellow.length]}>
        <boxGeometry args={[1, 0.01, 1]} />
        <meshStandardMaterial color="#e8b21c" roughness={0.7} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </instancedMesh>
      <instancedMesh ref={lamps} args={[undefined, undefined, lampData.poles.length]}>
        <cylinderGeometry args={[0.09, 0.14, 9, 8]} />
        <meshStandardMaterial color="#2b2e35" metalness={0.7} roughness={0.4} />
      </instancedMesh>
      <instancedMesh ref={heads} args={[undefined, undefined, lampData.heads.length]}>
        <boxGeometry args={[0.5, 0.18, 1.4]} />
        <meshBasicMaterial color={LAMP_HEAD} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

const GRID_Y = 0.008;
const GRID_MARK_Y = 0.022;
const ZEBRA_RADIUS = 650;

/** Where each grid strip is crossed by a perpendicular road (grid or signalled), as [from, to] spans along it. */
function crossingsOf(s: Strip, strips: Strip[]): [number, number][] {
  const out: [number, number][] = [];
  for (const o of strips) {
    if (o.axis === s.axis || s.at < o.from - 1 || s.at > o.to + 1 || o.at < s.from - o.half || o.at > s.to + o.half) continue;
    out.push([o.at - o.half, o.at + o.half]);
  }
  if (s.axis === 'z' && Math.abs(s.at) < ROAD_HALF) out.push([AVENUE_Z - AVENUE_HALF, AVENUE_Z + AVENUE_HALF]);
  if (s.axis === 'x' && Math.abs(s.at) < ROAD_HALF) out.push([SIDE_X - SIDE_HALF, SIDE_X + SIDE_HALF]);
  return out;
}

/** Asphalt, kerbs, centre lines and zebra crossings for the grid streets. */
function gridGeometry(strips: Strip[]) {
  const road: Matrix4[] = [];
  const kerb: Matrix4[] = [];
  const white: Matrix4[] = [];
  const yellow: Matrix4[] = [];
  const along = (s: Strip, a: number, b: number, offset: number, y: number, width: number, height = 1) => {
    const mid = (a + b) / 2;
    const pos = s.axis === 'z' ? new Vector3(s.at + offset, y, mid) : new Vector3(mid, y, s.at + offset);
    const scale = s.axis === 'z' ? new Vector3(width, height, b - a) : new Vector3(b - a, height, width);
    return new Matrix4().compose(pos, _q.identity(), scale);
  };
  for (const s of strips) {
    road.push(along(s, s.from, s.to, 0, GRID_Y, s.half * 2, 1));
    const cross = crossingsOf(s, strips);
    const kerbGaps = cross.map(([a, b]): [number, number] => [a - SIDEWALK, b + SIDEWALK]);
    for (const [a, b] of segments(s.from, s.to, kerbGaps)) {
      if (b - a < 1) continue;
      for (const side of [-1, 1]) kerb.push(along(s, a, b, side * (s.half + SIDEWALK / 2), KERB_H / 2, SIDEWALK, KERB_H));
    }
    const paintGaps = cross.map(([a, b]): [number, number] => [a - JUNCTION_CROSSING - 1.5, b + JUNCTION_CROSSING + 1.5]);
    for (const [a, b] of segments(s.from, s.to, paintGaps)) {
      if (b - a < 2) continue;
      for (const side of [-1, 1]) white.push(along(s, a, b, side * (s.half - 0.35), GRID_MARK_Y, 0.15));
      if (s.kind === 'avenue') {
        for (const side of [-1, 1]) yellow.push(along(s, a, b, side * 0.18, GRID_MARK_Y, 0.13));
        for (let t = a; t + 3 <= b; t += 9) for (const side of [-1, 1]) white.push(along(s, t, t + 3, side * s.half * 0.5, GRID_MARK_Y, 0.13));
      } else {
        for (let t = a; t + 3 <= b; t += 9) white.push(along(s, t, t + 3, 0, GRID_MARK_Y, 0.13));
      }
    }
    for (const [a, b] of cross) {
      const mid = (a + b) / 2;
      const [cx, cz] = s.axis === 'z' ? [s.at, mid] : [mid, s.at];
      if (Math.hypot(cx, cz) > ZEBRA_RADIUS) continue;
      for (const edge of [a - 1 - JUNCTION_CROSSING / 2, b + 1 + JUNCTION_CROSSING / 2]) {
        if (edge < s.from || edge > s.to) continue;
        for (let k = -s.half + 0.6; k < s.half - 0.3; k += 1.1) white.push(along(s, edge - JUNCTION_CROSSING / 2, edge + JUNCTION_CROSSING / 2, k, GRID_MARK_Y, 0.55));
      }
    }
  }
  return { road, kerb, white, yellow };
}

/** The rest of the street grid out to the river and the edge of the city. */
export function GridStreets({ strips }: { strips: Strip[] }) {
  const road = useRef<InstancedMesh>(null);
  const kerb = useRef<InstancedMesh>(null);
  const white = useRef<InstancedMesh>(null);
  const yellow = useRef<InstancedMesh>(null);
  const data = useMemo(() => gridGeometry(strips), [strips]);
  useLayoutEffect(() => {
    setInstances(road.current, data.road);
    setInstances(kerb.current, data.kerb);
    setInstances(white.current, data.white);
    setInstances(yellow.current, data.yellow);
  }, [data]);
  const { mats, tints } = useMemo(() => {
    const mats = {
      road: new MeshStandardMaterial({ roughness: 0.85, metalness: 0.05 }),
      kerb: new MeshStandardMaterial({ roughness: 0.85 }),
    };
    return { mats, tints: [dayTint(mats.road, '#17191f', '#4f5156'), dayTint(mats.kerb, '#2a2d34', '#b3ada3')] };
  }, []);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  useFrame(() => applyDayTints(tints));
  return (
    <group>
      <instancedMesh ref={road} args={[undefined, mats.road, data.road.length]} receiveShadow>
        <boxGeometry args={[1, 0.016, 1]} />
      </instancedMesh>
      <instancedMesh ref={kerb} args={[undefined, mats.kerb, data.kerb.length]}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh ref={white} args={[undefined, undefined, data.white.length]}>
        <boxGeometry args={[1, 0.01, 1]} />
        <meshStandardMaterial color="#d9d7cf" roughness={0.7} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </instancedMesh>
      <instancedMesh ref={yellow} args={[undefined, undefined, data.yellow.length]}>
        <boxGeometry args={[1, 0.01, 1]} />
        <meshStandardMaterial color="#e2ad1d" roughness={0.7} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </instancedMesh>
    </group>
  );
}

type CarPart = { geometry: BufferGeometry; material: Material; paint: boolean };
/** One wheel, centred on its axle so it can spin about local X. */
type WheelPart = { geometry: BufferGeometry; material: Material; center: Vector3; radius: number };
type CarModel = { parts: CarPart[]; wheels: WheelPart[]; length: number };
type CarSpec = {
  /** Body panels repainted per car; null keeps the factory paint. */
  repaint: RegExp | null;
  /** Materials of the tyres and rims; all four wheels of a car share each one. */
  wheels: RegExp;
  /** Rebuild smooth normals on the repainted panels (models exported without their subdivision). */
  smooth?: boolean;
};

const _size = new Vector3();

/** Splits a mesh holding all four wheels into one geometry per wheel, by which quarter of the footprint each triangle sits in. */
function splitWheels(source: BufferGeometry, material: Material): WheelPart[] {
  const g = source.index ? source.toNonIndexed() : source;
  g.computeBoundingBox();
  const mid = g.boundingBox!.getCenter(new Vector3());
  const pos = g.getAttribute('position');
  const quarters: number[][] = [[], [], [], []];
  for (let t = 0; t < pos.count; t += 3) {
    const x = pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2);
    const z = pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2);
    quarters[(x / 3 > mid.x ? 1 : 0) + (z / 3 > mid.z ? 2 : 0)]!.push(t);
  }
  const wheels = quarters
    .filter((tris) => tris.length > 0)
    .map((tris) => {
      const out = new BufferGeometry();
      for (const [name, attr] of Object.entries(g.attributes)) {
        const size = attr.itemSize;
        const data = new Float32Array(tris.length * 3 * size);
        tris.forEach((t, i) => {
          for (let k = 0; k < 3; k++) for (let c = 0; c < size; c++) data[(i * 3 + k) * size + c] = attr.getComponent(t + k, c);
        });
        out.setAttribute(name, new BufferAttribute(data, size));
      }
      out.computeBoundingBox();
      const center = out.boundingBox!.getCenter(new Vector3());
      out.translate(-center.x, -center.y, -center.z);
      return { geometry: out, material, center, radius: Math.max(0.2, (out.boundingBox!.max.y - out.boundingBox!.min.y) / 2) };
    });
  if (g !== source) g.dispose();
  return wheels;
}

function smoothNormals(source: BufferGeometry): BufferGeometry {
  const bare = source.clone();
  for (const name of Object.keys(bare.attributes)) if (name !== 'position') bare.deleteAttribute(name);
  const merged = mergeVertices(bare, 1e-4);
  merged.computeVertexNormals();
  bare.dispose();
  source.dispose();
  return merged;
}

/** Bakes a car into instancing parts: body parts that move with the car, and wheels that also roll. */
function carModel(scene: Object3D, spec: CarSpec): CarModel {
  scene.updateMatrixWorld(true);
  const parts: CarPart[] = [];
  const wheels: WheelPart[] = [];
  const box = new Box3();
  scene.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const src = mesh.material as MeshStandardMaterial;
    const paint = !!spec.repaint?.test(src.name);
    const material = src.clone();
    if (paint) {
      material.color.set('#ffffff');
      material.metalness = 0.4;
      material.roughness = 0.32;
      const coat = material as MeshPhysicalMaterial;
      if (coat.isMeshPhysicalMaterial) {
        coat.clearcoat = 0.7;
        coat.clearcoatRoughness = 0.12;
      }
    }
    if (/glass|vetro/i.test(src.name)) {
      material.metalness = 0;
      material.roughness = Math.max(material.roughness, 0.14);
      material.envMapIntensity = 0.7;
    }
    let geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    geometry.computeBoundingBox();
    box.union(geometry.boundingBox!);
    const size = geometry.boundingBox!.getSize(_size);
    if (spec.wheels.test(src.name) && size.y < 0.8 && size.x > 1.5 && size.z > 2.5) {
      wheels.push(...splitWheels(geometry, material));
      geometry.dispose();
      return;
    }
    if (paint && spec.smooth) geometry = smoothNormals(geometry);
    parts.push({ geometry, material, paint });
  });
  return { parts, wheels, length: box.max.z - box.min.z };
}

const CAR_SPECS = {
  traffic: { repaint: /^(car paint|Material\.002)$/i, wheels: /^(Tires|Rims)$/, smooth: true },
  goblin: { repaint: null, wheels: /^car_tire$/ },
  revuelto: { repaint: null, wheels: /^(Wheel|Wheel_001|t_rims_black_shiny|CarPaintBlack)$/ },
} satisfies Record<string, CarSpec>;

const CARS_PER_LANE: Record<Lane['road'], number> = { avenue: 7, side: 5 };
const PAINTS = ['#111214', '#111214', '#e8e8ea', '#e8e8ea', '#8a8f98', '#3a3f47', '#7a1018', '#1d3f8f', '#f2b705', '#0f3d2e'];
const FOLLOW_GAP = 7.5;

/** True while someone on foot is about to cross or is crossing in front of the entrance. */
export function crossingRed(): boolean {
  return WALK.street && Math.abs(WALK.x) < CROSSWALK.x + 6 && WALK.z > AVENUE_Z - AVENUE_HALF - 9 && WALK.z < AVENUE_Z + AVENUE_HALF + 9;
}

/** Where an avenue car must stop for the walker, or null when the way is clear. */
function walkerStop(lane: Lane): { at: number; grace: number } | null {
  if (lane.road !== 'avenue' || !WALK.street) return null;
  if (crossingRed()) return { at: -lane.dir * CROSSWALK.stopLine, grace: 0.5 };
  if (Math.abs(WALK.z - AVENUE_Z) < AVENUE_HALF + 2.5) return { at: WALK.x - lane.dir * 7, grace: 6 };
  return null;
}

/** `roll`: metres driven, turned into wheel spin. */
type Car = { li: number; model: number; pos: number; cruise: number; speed: number; paint: string; braking: boolean; roll: number };

/**
 * Traffic that keeps to the right, holds its distance, obeys the junction signal (stops on red,
 * stops on yellow when it can do so comfortably, never enters the junction without room to clear it)
 * and gives way to a walker at the entrance crossing.
 */
export function Traffic() {
  const a = useGLTF(TRAFFIC_A_URL, DRACO_PATH);
  const goblin = useGLTF(GOBLIN_URL, DRACO_PATH);
  const revuelto = useGLTF(useLiteDevice() ? REVUELTO_LITE_URL : REVUELTO_URL, DRACO_PATH);
  const models = useMemo(
    () => [carModel(a.scene, CAR_SPECS.traffic), carModel(goblin.scene, CAR_SPECS.goblin), carModel(revuelto.scene, CAR_SPECS.revuelto)],
    [a.scene, goblin.scene, revuelto.scene],
  );
  useEffect(
    () => () => models.forEach((m) => [...m.parts, ...m.wheels].forEach((p) => (p.geometry.dispose(), p.material.dispose()))),
    [models],
  );
  const cars = useMemo(() => {
    const rnd = seededRandom(31);
    return LANES.flatMap((lane, li) => {
      const n = CARS_PER_LANE[lane.road];
      return Array.from({ length: n }, (__, k): Car => {
        const r = rnd();
        return {
          li,
          model: r < 0.14 ? 1 : r < 0.26 ? 2 : 0,
          pos: -ROAD_HALF + ((k + rnd() * 0.5) * 2 * ROAD_HALF) / n,
          cruise: 11 + rnd() * 5,
          speed: 12,
          paint: PAINTS[Math.floor(rnd() * PAINTS.length)]!,
          braking: false,
          roll: 0,
        };
      });
    });
  }, []);
  const byLane = useMemo(() => LANES.map((_, li) => cars.filter((c) => c.li === li)), [cars]);
  const byModel = useMemo(() => models.map((_, mi) => cars.filter((c) => c.model === mi)), [models, cars]);
  const meshes = useRef<(InstancedMesh | null)[][]>([]);
  const wheels = useRef<(InstancedMesh | null)[][]>([]);

  useLayoutEffect(() => {
    const c = new Color();
    models.forEach((model, mi) =>
      model.parts.forEach((p, pi) => {
        const mesh = meshes.current[mi]?.[pi];
        if (!mesh || !p.paint) return;
        byModel[mi]!.forEach((car, i) => mesh.setColorAt(i, c.set(car.paint)));
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }),
    );
  }, [models, byModel]);

  useFrame(({ clock }, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1);
    const lights = signalAt(clock.elapsedTime);
    LANES.forEach((lane, li) => {
      const laneCars = byLane[li]!;
      const walker = walkerStop(lane);
      const line = junctionStopLine(lane);
      const exit = junctionExit(lane);
      const light: Light = lights[lane.road];
      for (const car of laneCars) {
        let gap = Infinity;
        let leader: Car | null = null;
        for (const other of laneCars) {
          if (other === car) continue;
          let d = (other.pos - car.pos) * lane.dir;
          if (d < 0) d += ROAD_HALF * 2;
          if (d < gap) {
            gap = d;
            leader = other;
          }
        }
        let target = Math.min(car.cruise, Math.max(0, (gap - FOLLOW_GAP) * 1.2));
        const ahead = (line - car.pos) * lane.dir;
        if (ahead > -1 && ahead < 90) {
          let stop = mustStop(light, ahead, car.speed);
          if (!stop && leader && ahead > 1.6) {
            const leaderIn = (leader.pos - line) * lane.dir;
            const leaderPast = (leader.pos - exit) * lane.dir;
            if (leaderIn > 0 && leaderPast < FOLLOW_GAP && leader.speed < 3) stop = true;
          }
          if (stop) target = Math.min(target, approachSpeed(ahead));
        }
        if (walker) {
          const d = (walker.at - car.pos) * lane.dir;
          if (d > -walker.grace && d < 40) target = Math.min(target, approachSpeed(d));
        }
        car.braking = target < car.speed - 0.4 || car.speed < 0.3;
        car.speed += (target - car.speed) * Math.min(1, delta * (target < car.speed ? 3.5 : 1.2));
        car.pos += lane.dir * car.speed * delta;
        car.roll += car.speed * delta;
        if (car.pos > ROAD_HALF) car.pos -= ROAD_HALF * 2;
        if (car.pos < -ROAD_HALF) car.pos += ROAD_HALF * 2;
      }
    });
    byModel.forEach((list, mi) => {
      const parts = meshes.current[mi] ?? [];
      const wheelParts = models[mi]!.wheels;
      const wheelMeshes = wheels.current[mi] ?? [];
      list.forEach((car, i) => {
        const lane = LANES[car.li]!;
        const angle = lane.axis === 'x' ? (lane.dir === 1 ? Math.PI / 2 : -Math.PI / 2) : lane.dir === 1 ? 0 : Math.PI;
        _q.setFromAxisAngle(UP, angle);
        if (lane.axis === 'x') _p.set(car.pos, 0.02, lane.at);
        else _p.set(lane.at, 0.045, car.pos);
        _m.compose(_p, _q, _s.set(1, 1, 1));
        for (const mesh of parts) mesh?.setMatrixAt(i, _m);
        wheelParts.forEach((w, wi) => {
          _w.compose(w.center, _wq.setFromAxisAngle(AXLE, car.roll / w.radius), _s);
          wheelMeshes[wi]?.setMatrixAt(i, _w.premultiply(_m));
        });
      });
      for (const mesh of parts) if (mesh) mesh.instanceMatrix.needsUpdate = true;
      for (const mesh of wheelMeshes) if (mesh) mesh.instanceMatrix.needsUpdate = true;
    });
  });

  return (
    <group>
      {models.map((model, mi) =>
        model.parts.map((p, pi) => (
          <instancedMesh
            key={`${mi}-${pi}`}
            ref={(m) => {
              (meshes.current[mi] ??= [])[pi] = m;
            }}
            args={[p.geometry, p.material, Math.max(1, byModel[mi]!.length)]}
            count={byModel[mi]!.length}
            frustumCulled={false}
          />
        )),
      )}
      {models.map((model, mi) =>
        model.wheels.map((w, wi) => (
          <instancedMesh
            key={`w${mi}-${wi}`}
            ref={(m) => {
              (wheels.current[mi] ??= [])[wi] = m;
            }}
            args={[w.geometry, w.material, Math.max(1, byModel[mi]!.length)]}
            count={byModel[mi]!.length}
            frustumCulled={false}
          />
        )),
      )}
    </group>
  );
}

const SIG_RED = new Color('#ff2020').multiplyScalar(3);
const SIG_YELLOW = new Color('#ffb21a').multiplyScalar(2.8);
const SIG_GREEN = new Color('#20ff70').multiplyScalar(2.4);
const SIG_WALK = new Color('#f5f5f5').multiplyScalar(2.4);
const SIG_DIM = new Color('#141414');

type Head = { x: number; z: number; r: number; road: Lane['road'] };
type Mast = { pole: [number, number]; arm: { from: [number, number]; to: [number, number] }; heads: Head[] };

/** One mast per approach on the far right corner of the junction, its arm reaching over the lanes it controls. */
function junctionMasts(): Mast[] {
  const out: Mast[] = [];
  for (const dir of [1, -1] as const) {
    const px = SIDE_X + dir * (SIDE_HALF + JUNCTION_CROSSING + 1);
    const pz = AVENUE_Z + dir * (AVENUE_HALF + 0.8);
    out.push({
      pole: [px, pz],
      arm: { from: [px, pz], to: [px, AVENUE_Z + dir * 1.2] },
      heads: [1.9, 5.5].map((o) => ({ x: px, z: AVENUE_Z + dir * o, r: -dir * (Math.PI / 2), road: 'avenue' as const })),
    });
    const sz = AVENUE_Z + dir * (AVENUE_HALF + JUNCTION_CROSSING + 1);
    const sx = SIDE_X - dir * (SIDE_HALF + 0.8);
    out.push({
      pole: [sx, sz],
      arm: { from: [sx, sz], to: [SIDE_X - dir * 1.2, sz] },
      heads: [{ x: SIDE_X - dir * 2.2, z: sz, r: dir === 1 ? Math.PI : 0, road: 'side' }],
    });
  }
  return out;
}

const MAST_Y = 6.4;

/** Junction signals (red, yellow, green per road) and the walker-triggered lights at the entrance crossing. */
export function Signals() {
  const mats = useMemo(() => {
    const m = () => new MeshBasicMaterial({ color: SIG_DIM, toneMapped: false });
    return {
      avenue: { red: m(), yellow: m(), green: m() },
      side: { red: m(), yellow: m(), green: m() },
      crossRed: m(),
      crossGreen: m(),
      walk: m(),
    };
  }, []);
  useEffect(
    () => () => {
      for (const v of Object.values(mats)) {
        if (v instanceof MeshBasicMaterial) v.dispose();
        else Object.values(v).forEach((x) => x.dispose());
      }
    },
    [mats],
  );
  const masts = useMemo(() => junctionMasts(), []);
  useFrame(({ clock }) => {
    const lights = signalAt(clock.elapsedTime);
    for (const road of ['avenue', 'side'] as const) {
      const l = lights[road];
      mats[road].red.color.copy(l === 'red' ? SIG_RED : SIG_DIM);
      mats[road].yellow.color.copy(l === 'yellow' ? SIG_YELLOW : SIG_DIM);
      mats[road].green.color.copy(l === 'green' ? SIG_GREEN : SIG_DIM);
    }
    const red = crossingRed();
    mats.crossRed.color.copy(red ? SIG_RED : SIG_DIM);
    mats.crossGreen.color.copy(red ? SIG_DIM : SIG_GREEN);
    mats.walk.color.copy(red ? SIG_WALK : SIG_DIM);
  });
  const crossPoles: [number, number, number][] = [
    [CROSSWALK.x + 2.2, 0, AVENUE_Z - AVENUE_HALF - 1],
    [-CROSSWALK.x - 2.2, 0, AVENUE_Z + AVENUE_HALF + 1],
  ];
  return (
    <group>
      {masts.map((m, i) => {
        const [fx, fz] = m.arm.from;
        const [tx, tz] = m.arm.to;
        const len = Math.hypot(tx - fx, tz - fz);
        return (
          <group key={i}>
            <mesh position={[m.pole[0], MAST_Y / 2, m.pole[1]]}>
              <cylinderGeometry args={[0.13, 0.17, MAST_Y, 10]} />
              <meshStandardMaterial color="#3a3d44" metalness={0.7} roughness={0.35} />
            </mesh>
            <mesh position={[(fx + tx) / 2, MAST_Y - 0.2, (fz + tz) / 2]} rotation-y={Math.atan2(tx - fx, tz - fz)}>
              <boxGeometry args={[0.12, 0.12, len]} />
              <meshStandardMaterial color="#3a3d44" metalness={0.7} roughness={0.35} />
            </mesh>
            {m.heads.map((h, k) => (
              <group key={k} position={[h.x, MAST_Y - 0.95, h.z]} rotation-y={h.r}>
                <mesh>
                  <boxGeometry args={[0.42, 1.2, 0.3]} />
                  <meshStandardMaterial color="#16171b" roughness={0.6} />
                </mesh>
                {(['red', 'yellow', 'green'] as const).map((c, j) => (
                  <mesh key={c} position={[0, 0.38 - j * 0.38, 0.16]} material={mats[h.road][c]}>
                    <circleGeometry args={[0.13, 16]} />
                  </mesh>
                ))}
              </group>
            ))}
          </group>
        );
      })}
      {crossPoles.map((p, i) => (
        <group key={`c${i}`} position={p} rotation-y={i === 0 ? 0 : Math.PI}>
          <mesh position={[0, 3, 0]}>
            <cylinderGeometry args={[0.1, 0.12, 6, 8]} />
            <meshStandardMaterial color="#25272d" metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[0, 5.4, 0.25]}>
            <boxGeometry args={[0.45, 1.3, 0.35]} />
            <meshStandardMaterial color="#14151a" roughness={0.6} />
          </mesh>
          <mesh position={[0, 5.8, 0.45]} material={mats.crossRed}>
            <sphereGeometry args={[0.14, 12, 8]} />
          </mesh>
          <mesh position={[0, 5.0, 0.45]} material={mats.crossGreen}>
            <sphereGeometry args={[0.14, 12, 8]} />
          </mesh>
          <mesh position={[0, 2.6, -0.2]} material={mats.walk}>
            <boxGeometry args={[0.4, 0.4, 0.12]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

const SIGN_HEIGHT = 3.1;
/** Posted signs along both streets, each turned to face the traffic it is meant for. */
export function RoadSigns() {
  const { scene } = useGLTF(SIGNS_URL, DRACO_PATH);
  const groups = useMemo(() => {
    const g = groupsOf(scene);
    const box = new Box3();
    for (const parts of Object.values(g)) {
      box.makeEmpty();
      for (const p of parts ?? []) {
        p.geometry.computeBoundingBox();
        box.union(p.geometry.boundingBox!);
      }
      const k = SIGN_HEIGHT / Math.max(0.01, box.max.y - box.min.y);
      for (const p of parts ?? []) p.geometry.scale(k, k, k);
    }    return g;
  }, [scene]);
  useEffect(() => () => disposeGroups(groups), [groups]);
  const spots = useMemo(() => {
    const out: Record<string, { f: number; x: number; z: number; r: number }[]> = {};
    for (const s of SIGN_SPOTS) (out[s.sign] ??= []).push({ f: -1, x: s.x, z: s.z, r: s.r });
    return out;
  }, []);
  return (
    <group>
      {Object.entries(spots).flatMap(([sign, items]) =>
        (groups[sign] ?? []).map((p, i) => <ModelInstances key={`${sign}${i}`} geometry={p.geometry} material={p.material} items={items} />),
      )}
    </group>
  );
}
