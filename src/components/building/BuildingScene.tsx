'use client';

import { Environment, Html, Lightformer, OrbitControls, Stars, useGLTF } from '@react-three/drei';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  CanvasTexture,
  Color,
  Euler,
  type InstancedMesh,
  Matrix4,
  Plane,
  PlaneGeometry,
  type PointLight,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  BUILDING_URL,
  CLEAR_HEIGHT,
  CORE,
  FLOOR_COUNT,
  PLATE,
  PROGRAM_COPY,
  ROOF_Y,
  createCutaway,
  floorY,
  prepareBuilding,
  programOf,
} from '@/components/three/building-model';
import { DRACO_PATH } from '@/components/three/desk-model';
import { KIT_URL, extractKit, type KitPart } from '@/components/three/kit-model';

/** One scene per page, so the facade cutaway uniforms can live at module scope. */
const CUT = createCutaway();
/** Everything above this plane is hidden while a floor is open, turning the tower into a cut-away model. */
const CLIP = new Plane(new Vector3(0, -1, 0), 1e4);
const CLIP_PLANES = [CLIP];

type Item = { f: number; x: number; z: number; r?: number; s?: number; sx?: number; sy?: number; sz?: number; y?: number; meet?: boolean };
type Layout = {
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
};

const WINGS: [number, number][] = [
  [-33, -9],
  [9, 33],
];

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Illustrative fit-out per floor: open desk rows, glass private offices, or meeting rooms, plus a lounge by the core. */
function buildLayout(): Layout {
  const L: Layout = { desks: [], chairs: [], monitors: [], exec: [], glass: [], tables: [], screens: [], sofas: [], lounge: [], panels: [] };
  const wallH = CLEAR_HEIGHT - 0.1;

  /** Pod of four desks: two back-to-back pairs, chairs facing in. `r` on a chair is the yaw that turns it toward its desk. */
  const pod = (f: number, px: number, pz: number) => {
    for (const dx of [-0.66, 0.66]) {
      for (const s of [1, -1]) {
        L.desks.push({ f, x: px + dx, z: pz, r: s === 1 ? 0 : Math.PI, s });
        L.chairs.push({ f, x: px + dx, z: pz + s * 1.05, r: s === 1 ? Math.PI : 0 });
        L.monitors.push({ f, x: px + dx, z: pz + s * 0.12 });
      }
    }
  };
  const podRows = (f: number, x0: number, x1: number, zs: number[]) => {
    for (let px = x0 + 2.4; px <= x1 - 2.2; px += 4.6) for (const pz of zs) pod(f, px, pz);
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
        podRows(f, wx0, wx1, [-10.5, -4.5, 1.5, 7.5, 12]);
      } else if (program === 'offices') {
        for (let x = wx0; x + 6 <= wx1 + 0.01; x += 6) {
          for (const side of [-1, 1]) {
            glassRoom(f, x, 6, side, 5, x + 12 > wx1 + 0.01);
            L.exec.push({ f, x: x + 3, z: side * 12.3, r: side === -1 ? 0 : Math.PI });
            L.monitors.push({ f, x: x + 3, z: side * 12.75 });
          }
        }
        podRows(f, wx0, wx1, [-4.2, 1.2, 5.8]);
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
        podRows(f, wx0, wx1, [-2.4, 3]);
      }
    }
    for (const x of [-4.2, 0, 4.2]) L.sofas.push({ f, x, z: 9.2 });
    for (const x of [-3, 3]) L.sofas.push({ f, x, z: 12.2, r: Math.PI });
    L.lounge.push({ f, x: 0, z: 10.7 });

    for (let x = -33; x <= 33; x += 3) {
      for (let z = -13.5; z <= 13.5; z += 3) {
        if (x > CORE.x0 - 0.3 && x < CORE.x1 + 0.3 && z > CORE.z0 - 0.2 && z < CORE.z1 + 0.2) continue;
        L.panels.push({ f, x, z, s: x < 0 ? 0 : 1 });
      }
    }
  }
  return L;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _p = new Vector3();
const _s = new Vector3();

function composeItem(it: Item, y: number, size: readonly [number, number, number]): Matrix4 {
  _p.set(it.x, floorY(it.f) + (it.y ?? y), it.z);
  _q.setFromEuler(_e.set(0, it.r ?? 0, 0));
  _s.set(it.sx ?? size[0], it.sy ?? size[1], it.sz ?? size[2]);
  return _m.compose(_p, _q, _s);
}

/** Box instances for every item, optionally skipping one floor (where detailed models take over). */
function Boxes({
  items,
  size,
  y,
  exclude = null,
  offset,
  children,
}: {
  items: Item[];
  size: readonly [number, number, number];
  y: number;
  exclude?: number | null;
  offset?: (it: Item) => Item;
  children: ReactNode;
}) {
  const ref = useRef<InstancedMesh>(null);
  const list = useMemo(() => (exclude === null ? items : items.filter((i) => i.f !== exclude)), [items, exclude]);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    list.forEach((it, i) => mesh.setMatrixAt(i, composeItem(offset ? offset(it) : it, y, size)));
    mesh.count = list.length;
    mesh.instanceMatrix.needsUpdate = true;
  }, [list, y, size, offset]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, Math.max(1, items.length)]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      {children}
    </instancedMesh>
  );
}

const DESK_TOP = [1.2, 0.05, 0.6] as const;
const CHAIR = [0.5, 0.95, 0.5] as const;
const MONITOR = [0.56, 0.32, 0.03] as const;
const TABLE = [4.4, 0.06, 1.4] as const;
const SCREEN = [0.05, 0.9, 1.6] as const;
const SOFA = [2.2, 0.75, 0.9] as const;
const MONITOR_GLOW = new Color('#7f9cff').multiplyScalar(0.9);
const SCREEN_GLOW = new Color('#6d5cff').multiplyScalar(1.1);
const LOUNGE_TABLE = [1.6, 0.06, 1.6] as const;
const NEIGHBOUR_AT: [number, number, number] = [84, 0, 14];
const ONE = [1, 1, 1] as const;
const deskTopOffset = (it: Item): Item => ({ ...it, z: it.z + (it.s ?? 1) * 0.3 });

/** Model instances (one InstancedMesh per material) at the given items. */
function ModelInstances({ geometry, material, items }: { geometry: import('three').BufferGeometry; material: import('three').Material; items: Item[] }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    items.forEach((it, i) => mesh.setMatrixAt(i, composeItem(it, 0, ONE)));
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
  }, [items]);
  return <instancedMesh ref={ref} args={[geometry, material, Math.max(1, items.length)]} frustumCulled={false} />;
}

const WARM = new Color('#ffe2b8').multiplyScalar(1.35);
const WAVE_STEP = 0.085;
const WAVE_FADE = 0.5;

/** Ceiling light strips on every floor; they switch on floor by floor, then a zone occasionally goes dark or lights up. */
function CeilingLights({ panels, live, selected }: { panels: Item[]; live: boolean; selected: number | null }) {
  const ref = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => new PlaneGeometry(1.6, 0.35).rotateX(Math.PI / 2), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const zones = FLOOR_COUNT * 2;
  const state = useRef({
    start: -1,
    cur: new Float32Array(zones),
    target: new Float32Array(zones),
    floor: new Float32Array(FLOOR_COUNT).fill(1),
    nextToggle: 4,
    settled: false,
  });

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const rnd = seededRandom(11);
    for (let z = 0; z < zones; z++) state.current.target[z] = rnd() < 0.14 ? 0.05 : 1;
    panels.forEach((it, i) => {
      mesh.setMatrixAt(i, composeItem(it, CLEAR_HEIGHT - 0.04, ONE));
      mesh.setColorAt(i, new Color(0, 0, 0));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [panels, zones]);

  useFrame(({ clock }, delta) => {
    const mesh = ref.current;
    const st = state.current;
    if (!mesh?.instanceColor) return;
    if (st.start < 0) st.start = clock.elapsedTime;
    const t = clock.elapsedTime - st.start;
    const waving = t < FLOOR_COUNT * WAVE_STEP + WAVE_FADE + 0.1;

    if (live && t > st.nextToggle) {
      st.nextToggle = t + 2.5 + Math.random() * 3;
      const z = Math.floor(Math.random() * zones);
      st.target[z] = st.target[z]! > 0.5 ? 0.05 : 1;
      st.settled = false;
    }
    let moving = false;
    const k = Math.min(1, delta * 3);
    for (let z = 0; z < zones; z++) {
      const d = st.target[z]! - st.cur[z]!;
      if (Math.abs(d) > 0.002) {
        st.cur[z]! += d * k;
        moving = true;
      } else st.cur[z] = st.target[z]!;
    }
    for (let f = 0; f < FLOOR_COUNT; f++) {
      const goal = selected === null || selected === f ? 1 : 0.28;
      const d = goal - st.floor[f]!;
      if (Math.abs(d) > 0.002) {
        st.floor[f]! += d * k;
        moving = true;
      } else st.floor[f] = goal;
    }
    if (!waving && !moving && st.settled) return;
    st.settled = !waving && !moving;

    const arr = mesh.instanceColor.array as Float32Array;
    for (let i = 0; i < panels.length; i++) {
      const it = panels[i]!;
      const wave = Math.min(1, Math.max(0, (t - it.f * WAVE_STEP) / WAVE_FADE));
      const lvl = wave * st.cur[it.f * 2 + (it.s ?? 0)]! * st.floor[it.f]! * (it.f === selected ? 1.25 : 1);
      arr[i * 3] = WARM.r * lvl;
      arr[i * 3 + 1] = WARM.g * lvl;
      arr[i * 3 + 2] = WARM.b * lvl;
    }
    mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[geometry, undefined, panels.length]} frustumCulled={false}>
      <meshBasicMaterial toneMapped={false} clippingPlanes={CLIP_PLANES} />
    </instancedMesh>
  );
}

function windowTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#05070b';
  ctx.fillRect(0, 0, 64, 128);
  const rnd = seededRandom(5);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 8; x++) {
      const v = rnd();
      ctx.fillStyle = v < 0.42 ? '#0b0e14' : v < 0.85 ? '#ffd9a0' : '#bcd4ff';
      ctx.globalAlpha = v < 0.42 ? 1 : 0.55 + rnd() * 0.45;
      ctx.fillRect(x * 8 + 1.5, y * 8 + 2, 5, 4);
    }
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = tex.wrapT = RepeatWrapping;
  return tex;
}

const ROAD_X_Z = 52;
const ROAD_Z_X = -64;

/** Low city blocks around the tower, kept clear of the plaza and the two roads. */
function City() {
  const ref = useRef<InstancedMesh>(null);
  const tex = useMemo(() => windowTexture(), []);
  useEffect(() => () => tex.dispose(), [tex]);
  const blocks = useMemo(() => {
    const rnd = seededRandom(23);
    const out: Matrix4[] = [];
    let guard = 0;
    while (out.length < 170 && guard++ < 4000) {
      const a = rnd() * Math.PI * 2;
      const r = 80 + rnd() * 360;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (Math.abs(z - ROAD_X_Z) < 14 || Math.abs(x - ROAD_Z_X) < 14) continue;
      if (Math.abs(x) < 50 && z > -30 && z < 40) continue;
      if (Math.abs(x - NEIGHBOUR_AT[0]) < 34 && Math.abs(z - NEIGHBOUR_AT[2]) < 30) continue;
      const w = 14 + rnd() * 22;
      const d = 14 + rnd() * 22;
      const h = 8 + rnd() * rnd() * 70;
      out.push(new Matrix4().compose(new Vector3(x, h / 2, z), new Quaternion(), new Vector3(w, h, d)));
    }
    return out;
  }, []);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    blocks.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
  }, [blocks]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, blocks.length]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#0e1118" map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={0.9} roughness={0.85} />
    </instancedMesh>
  );
}

const CARS_PER_LANE = 14;
const LANES = [
  { axis: 'x' as const, at: ROAD_X_Z - 2.2, dir: 1, color: new Color('#ff4d4d').multiplyScalar(1.6) },
  { axis: 'x' as const, at: ROAD_X_Z + 2.2, dir: -1, color: new Color('#fff4e0').multiplyScalar(1.8) },
  { axis: 'z' as const, at: ROAD_Z_X - 2.2, dir: 1, color: new Color('#fff4e0').multiplyScalar(1.8) },
  { axis: 'z' as const, at: ROAD_Z_X + 2.2, dir: -1, color: new Color('#ff4d4d').multiplyScalar(1.6) },
];
const ROAD_HALF = 420;

function Traffic() {
  const ref = useRef<InstancedMesh>(null);
  const cars = useMemo(() => {
    const rnd = seededRandom(31);
    return LANES.flatMap((lane, li) =>
      Array.from({ length: CARS_PER_LANE }, () => ({ li, pos: (rnd() * 2 - 1) * ROAD_HALF, speed: 11 + rnd() * 7 })),
    );
  }, []);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    cars.forEach((c, i) => mesh.setColorAt(i, LANES[c.li]!.color));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [cars]);
  useFrame((_, delta) => {
    const mesh = ref.current;
    if (!mesh) return;
    cars.forEach((c, i) => {
      const lane = LANES[c.li]!;
      c.pos += lane.dir * c.speed * Math.min(delta, 0.1);
      if (c.pos > ROAD_HALF) c.pos -= ROAD_HALF * 2;
      if (c.pos < -ROAD_HALF) c.pos += ROAD_HALF * 2;
      if (lane.axis === 'x') {
        _p.set(c.pos, 0.6, lane.at);
        _s.set(3.6, 0.45, 1.5);
      } else {
        _p.set(lane.at, 0.6, c.pos);
        _s.set(1.5, 0.45, 3.6);
      }
      mesh.setMatrixAt(i, _m.compose(_p, _q.identity(), _s));
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, cars.length]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

function Ground() {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, 0]}>
        <planeGeometry args={[1400, 1400]} />
        <meshStandardMaterial color="#0a0c11" roughness={1} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, ROAD_X_Z]}>
        <planeGeometry args={[ROAD_HALF * 2, 11]} />
        <meshStandardMaterial color="#14161c" roughness={0.6} metalness={0.2} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[ROAD_Z_X, 0.012, 0]}>
        <planeGeometry args={[11, ROAD_HALF * 2]} />
        <meshStandardMaterial color="#14161c" roughness={0.6} metalness={0.2} />
      </mesh>
    </group>
  );
}

const CROWN = new Color('#a78bfa').multiplyScalar(2.2);

function drawSign(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 160;
  const ctx = canvas.getContext('2d')!;
  const font = getComputedStyle(document.body).fontFamily || 'sans-serif';
  ctx.clearRect(0, 0, 1024, 160);
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 120px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SpaceHub', 512, 86);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** Violet LED crown, corner strips and the rooftop sign. */
function Crown() {
  const sign = useMemo(() => drawSign(), []);
  useEffect(() => () => sign.dispose(), [sign]);
  const x = PLATE.x + 0.5;
  const z = PLATE.z + 0.5;
  const h = ROOF_Y - 7;
  return (
    <group>
      {[
        { p: [0, ROOF_Y + 0.1, z], s: [x * 2, 0.25, 0.25] },
        { p: [0, ROOF_Y + 0.1, -z], s: [x * 2, 0.25, 0.25] },
        { p: [x, ROOF_Y + 0.1, 0], s: [0.25, 0.25, z * 2] },
        { p: [-x, ROOF_Y + 0.1, 0], s: [0.25, 0.25, z * 2] },
        ...[
          [x, z],
          [-x, z],
          [x, -z],
          [-x, -z],
        ].map(([cx, cz]) => ({ p: [cx, 7 + h / 2, cz], s: [0.18, h, 0.18] })),
      ].map((b, i) => (
        <mesh key={i} position={b.p as [number, number, number]}>
          <boxGeometry args={b.s as [number, number, number]} />
          <meshBasicMaterial color={CROWN} toneMapped={false} clippingPlanes={CLIP_PLANES} />
        </mesh>
      ))}
      <mesh position={[0, ROOF_Y - 3.2, z + 0.15]}>
        <planeGeometry args={[26, 4.06]} />
        <meshBasicMaterial map={sign} transparent toneMapped={false} color="#f5f0ff" clippingPlanes={CLIP_PLANES} />
      </mesh>
    </group>
  );
}

const PLATE_FRAME: { p: [number, number, number]; s: [number, number, number] }[] = [
  { p: [0, 0, PLATE.z + 0.6], s: [PLATE.x * 2 + 1.4, 0.16, 0.16] },
  { p: [0, 0, -PLATE.z - 0.6], s: [PLATE.x * 2 + 1.4, 0.16, 0.16] },
  { p: [PLATE.x + 0.6, 0, 0], s: [0.16, 0.16, PLATE.z * 2 + 1.4] },
  { p: [-PLATE.x - 0.6, 0, 0], s: [0.16, 0.16, PLATE.z * 2 + 1.4] },
];

function FloorFrame({ floor, color }: { floor: number; color: Color }) {
  return (
    <group position-y={floorY(floor) - 0.15}>
      {PLATE_FRAME.map((b, i) => (
        <mesh key={i} position={b.p}>
          <boxGeometry args={b.s} />
          <meshBasicMaterial color={color} toneMapped={false} clippingPlanes={CLIP_PLANES} />
        </mesh>
      ))}
    </group>
  );
}

const HOVER = new Color('#c4b5fd').multiplyScalar(1.6);
const SELECTED = new Color('#a78bfa').multiplyScalar(2.4);

/** Invisible per-floor hit volumes: hover lights the floor's edge, click selects it. */
function FloorHits({ selected, onSelect }: { selected: number | null; onSelect: (i: number) => void }) {
  const [hovered, setHovered] = useState<number | null>(null);
  useEffect(() => {
    document.body.style.cursor = hovered === null ? '' : 'pointer';
    return () => {
      document.body.style.cursor = '';
    };
  }, [hovered]);
  return (
    <group>
      {Array.from({ length: FLOOR_COUNT }, (_, i) => (
        <mesh
          key={i}
          position={[0, floorY(i) + CLEAR_HEIGHT / 2 - 0.2, 0]}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHovered(i);
          }}
          onPointerOut={() => setHovered((h) => (h === i ? null : h))}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            if (e.delta < 6) onSelect(i);
          }}
        >
          <boxGeometry args={[PLATE.x * 2 + 0.8, CLEAR_HEIGHT + 0.5, PLATE.z * 2 + 0.8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
        </mesh>
      ))}
      {hovered !== null && hovered !== selected && (
        <>
          <FloorFrame floor={hovered} color={HOVER} />
          <Html position={[PLATE.x + 2, floorY(hovered) + 2.4, PLATE.z]} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
            <div dir="rtl" className="whitespace-nowrap rounded-full border border-white/10 bg-black/75 px-3 py-1 text-xs font-semibold text-white shadow-lg backdrop-blur">
              קומה {hovered + 1} · {PROGRAM_COPY[programOf(hovered)].title}
            </div>
          </Html>
        </>
      )}
      {selected !== null && <FloorFrame floor={selected} color={SELECTED} />}
    </group>
  );
}

const ROOM_LIGHTS: [number, number][] = [
  [-26, -7],
  [-15, 7],
  [-26, 7],
  [-15, -7],
  [15, -7],
  [26, 7],
  [15, 7],
  [26, -7],
];

/** Warm fill lights that follow the open floor, so its furniture reads up close. */
function SelectedFloorLights({ selected }: { selected: number | null }) {
  const refs = useRef<(PointLight | null)[]>([]);
  useFrame((_, delta) => {
    const k = Math.min(1, delta * 3);
    refs.current.forEach((l) => {
      if (!l) return;
      const goal = selected === null ? 0 : 60;
      l.intensity += (goal - l.intensity) * k;
      if (selected !== null) l.position.y = floorY(selected) + CLEAR_HEIGHT - 0.6;
    });
  });
  return (
    <>
      {ROOM_LIGHTS.map(([x, z], i) => (
        <pointLight
          key={i}
          ref={(l) => {
            refs.current[i] = l;
          }}
          position={[x, 0, z]}
          color="#ffe0b5"
          intensity={0}
          distance={18}
          decay={1.6}
        />
      ))}
    </>
  );
}

/** Opens the chosen floor's facade with a short vertical wipe. */
function CutawayAnimator({ selected }: { selected: number | null }) {
  useFrame((_, delta) => {
    const k = Math.min(1, delta * 4);
    const clipGoal = selected === null ? ROOF_Y + 12 : floorY(selected) + CLEAR_HEIGHT - 0.35;
    if (CLIP.constant > ROOF_Y + 12) CLIP.constant = ROOF_Y + 12;
    CLIP.constant += (clipGoal - CLIP.constant) * Math.min(1, delta * 2.6);
    if (selected === null && CLIP.constant > ROOF_Y + 11.9) CLIP.constant = 1e4;
    if (selected === null) {
      CUT.uCutMax.value += (CUT.uCutMin.value - CUT.uCutMax.value) * k;
      return;
    }
    const lo = floorY(selected) + 0.02;
    const hi = floorY(selected) + CLEAR_HEIGHT;
    if (Math.abs(CUT.uCutMin.value - lo) > 0.01) {
      CUT.uCutMin.value = lo;
      CUT.uCutMax.value = lo;
    }
    CUT.uCutMax.value += (hi - CUT.uCutMax.value) * k;
  });
  return null;
}

const OVERVIEW_TARGET = new Vector3(14, 60, 0);
const OVERVIEW_DIR = new Vector3(0.55, 0.16, 0.82).normalize();

function goalFor(selected: number | null, aspect: number, pos: Vector3, target: Vector3) {
  if (selected === null) {
    target.copy(OVERVIEW_TARGET);
    pos.copy(OVERVIEW_DIR).multiplyScalar(aspect < 1 ? 290 : 265).add(target);
    return;
  }
  const y = floorY(selected);
  if (aspect < 1) {
    target.set(17, y, 0);
    pos.set(26, y + 46, 44);
  } else {
    target.set(0, y - 2, 2);
    pos.set(30, y + 46, 62);
  }
}

/** Orbit camera that flies between the overview and a floor; idles with a slow turn around the tower. */
function CameraRig({ selected }: { selected: number | null }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const fly = useRef({ active: true, snap: true, touched: false });
  const goalPos = useMemo(() => new Vector3(), []);
  const goalTarget = useMemo(() => new Vector3(), []);

  useEffect(() => {
    fly.current.active = true;
  }, [selected]);

  useFrame((state, delta) => {
    const c = controls.current;
    if (!c) return;
    const f = fly.current;
    c.autoRotate = selected === null && !f.touched && !f.active;
    if (!f.active) return;
    goalFor(selected, state.size.width / state.size.height, goalPos, goalTarget);
    const cam = state.camera;
    if (f.snap) {
      cam.position.copy(goalPos);
      c.target.copy(goalTarget);
      f.snap = false;
    } else {
      const k = 1 - Math.exp(-delta * 2.4);
      cam.position.lerp(goalPos, k);
      c.target.lerp(goalTarget, k);
    }
    c.enabled = false;
    if (cam.position.distanceTo(goalPos) < 0.4 && c.target.distanceTo(goalTarget) < 0.2) {
      f.active = false;
      c.enabled = true;
    }
    c.update();
  });

  return (
    <OrbitControls
      ref={controls}
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      autoRotateSpeed={0.35}
      minDistance={22}
      maxDistance={380}
      minPolarAngle={0.2}
      maxPolarAngle={1.5}
      onStart={() => {
        fly.current.touched = true;
      }}
    />
  );
}

/** Model yaw that makes the kit chairs face +Z (their seat front), measured on the asset. */
const KIT_CHAIR_YAW = 0;

function KitInstances({ parts, items }: { parts: KitPart[] | undefined; items: Item[] }) {
  if (!parts || items.length === 0) return null;
  return (
    <>
      {parts.map((p, i) => (
        <ModelInstances key={i} geometry={p.geometry} material={p.material} items={items} />
      ))}
    </>
  );
}

/** Real furniture from the kit, only on the open floor; every other floor keeps light box stand-ins. */
function Furnishing({ selected, layout }: { selected: number; layout: Layout }) {
  const { scene } = useGLTF(KIT_URL, DRACO_PATH);
  const kit = useMemo(() => extractKit(scene), [scene]);
  const set = useMemo(() => {
    const on = (list: Item[]) => list.filter((it) => it.f === selected);
    const turn = (it: Item, by: number): Item => ({ ...it, r: (it.r ?? 0) + by });
    const chairs = on(layout.chairs);
    const deskChairs = chairs.filter((c) => !c.meet);
    const exec = on(layout.exec);
    return {
      desks: on(layout.desks).map(deskTopOffset),
      chairsA: deskChairs.filter((_, i) => i % 2 === 0).map((c) => turn(c, KIT_CHAIR_YAW)),
      chairsB: deskChairs.filter((_, i) => i % 2 === 1).map((c) => turn(c, KIT_CHAIR_YAW)),
      meetChairs: chairs.filter((c) => c.meet).map((c) => turn(c, KIT_CHAIR_YAW)),
      tables: on(layout.tables),
      woodDesks: exec.map((it) => turn(it, Math.PI / 2)),
      managerChairs: exec.map((it) => turn({ ...it, z: it.z + (it.r ? 0.85 : -0.85) }, KIT_CHAIR_YAW)),
      books: exec.map((it) => ({ ...it, x: it.x + 0.35, y: 0.74 })),
      lounge: on(layout.lounge),
    };
  }, [layout, selected]);
  const p = kit.parts;
  return (
    <group>
      <KitInstances parts={p.ferliDesk} items={set.desks} />
      <KitInstances parts={p.markusBlack} items={set.chairsA} />
      <KitInstances parts={p.markusBlue} items={set.chairsB} />
      <KitInstances parts={p.leatherChair} items={set.meetChairs} />
      <KitInstances parts={p.conference} items={set.tables} />
      <KitInstances parts={p.woodDesk} items={set.woodDesks} />
      <KitInstances parts={p.managerChair} items={set.managerChairs} />
      <KitInstances parts={p.books} items={set.books} />
      <KitInstances parts={p.flatiron} items={set.lounge} />
    </group>
  );
}

/** The stone building from the kit, as a lit neighbour across the plaza. */
function Neighbour() {
  const { scene } = useGLTF(KIT_URL, DRACO_PATH);
  const bank = useMemo(() => extractKit(scene).bank, [scene]);
  if (!bank) return null;
  return <primitive object={bank} position={NEIGHBOUR_AT} />;
}

function Building({ selected, layout }: { selected: number | null; layout: Layout }) {
  const { scene } = useGLTF(BUILDING_URL, DRACO_PATH);
  const parts = useMemo(() => prepareBuilding(scene, CUT, CLIP_PLANES), [scene]);
  const execElsewhere = useMemo(() => (selected === null ? layout.exec : layout.exec.filter((it) => it.f !== selected)), [layout, selected]);

  return (
    <group>
      <primitive object={parts.root} />

      <Boxes items={layout.desks} size={DESK_TOP} y={0.72} exclude={selected} offset={deskTopOffset}>
        <meshStandardMaterial color="#3a3f4a" roughness={0.6} clippingPlanes={CLIP_PLANES} />
      </Boxes>
      <Boxes items={layout.chairs} size={CHAIR} y={0.47} exclude={selected}>
        <meshStandardMaterial color="#17181d" roughness={0.7} clippingPlanes={CLIP_PLANES} />
      </Boxes>
      <Boxes items={layout.monitors} size={MONITOR} y={1.0}>
        <meshBasicMaterial color={MONITOR_GLOW} toneMapped={false} clippingPlanes={CLIP_PLANES} />
      </Boxes>
      {parts.exec.map((p, i) => (
        <ModelInstances key={i} geometry={p.geometry} material={p.material} items={execElsewhere} />
      ))}
      <Boxes items={layout.glass} size={ONE} y={0}>
        <meshStandardMaterial color="#cfe0f0" transparent opacity={0.16} roughness={0.05} metalness={0.3} depthWrite={false} clippingPlanes={CLIP_PLANES} />
      </Boxes>
      <Boxes items={layout.tables} size={TABLE} y={0.74} exclude={selected}>
        <meshStandardMaterial color="#d8d2c8" roughness={0.5} clippingPlanes={CLIP_PLANES} />
      </Boxes>
      <Boxes items={layout.screens} size={SCREEN} y={1.5}>
        <meshBasicMaterial color={SCREEN_GLOW} toneMapped={false} clippingPlanes={CLIP_PLANES} />
      </Boxes>
      <Boxes items={layout.sofas} size={SOFA} y={0.38}>
        <meshStandardMaterial color="#4c3f7a" roughness={0.85} clippingPlanes={CLIP_PLANES} />
      </Boxes>
      <Boxes items={layout.lounge} size={LOUNGE_TABLE} y={0.4} exclude={selected}>
        <meshStandardMaterial color="#6b5a45" roughness={0.6} clippingPlanes={CLIP_PLANES} />
      </Boxes>
      <CeilingLights panels={layout.panels} live selected={selected} />
    </group>
  );
}

function Ready({ onReady }: { onReady: () => void }) {
  useEffect(() => onReady(), [onReady]);
  return null;
}

export default function BuildingScene({
  active,
  selected,
  onSelect,
  onReady,
}: {
  active: boolean;
  selected: number | null;
  onSelect: (i: number) => void;
  onReady: () => void;
}) {
  const layout = useMemo(() => buildLayout(), []);
  return (
    <Canvas
      dpr={[1, 1.6]}
      frameloop={active ? 'always' : 'never'}
      camera={{ position: [130, 70, 190], fov: 32, near: 0.5, far: 1600 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.localClippingEnabled = true;
      }}
    >
      <color attach="background" args={['#060912']} />
      <fog attach="fog" args={['#0a0f1c', 260, 900]} />
      <hemisphereLight args={['#5a6c9c', '#07080c', 0.55]} />
      <directionalLight position={[-220, 300, -160]} intensity={0.55} color="#b8c8ff" />
      <Stars radius={700} depth={120} count={1600} factor={5} fade speed={0.4} />
      <mesh position={[-380, 300, -620]}>
        <sphereGeometry args={[14, 32, 16]} />
        <meshBasicMaterial color="#f4f1e6" toneMapped={false} />
      </mesh>
      <Environment resolution={128} frames={1}>
        <color attach="background" args={['#04060c']} />
        <Lightformer form="rect" intensity={1.2} color="#ffd9a8" position={[0, 2, -10]} scale={[20, 2, 1]} />
        <Lightformer form="rect" intensity={0.8} color="#8aa0ff" position={[10, 5, 5]} scale={[6, 10, 1]} rotation-y={-Math.PI / 2} />
        <Lightformer form="rect" intensity={0.6} color="#a78bfa" position={[-10, 3, 5]} scale={[6, 6, 1]} rotation-y={Math.PI / 2} />
        <Lightformer form="ring" intensity={0.5} color="#ffffff" position={[0, 10, 0]} scale={4} rotation-x={Math.PI / 2} />
      </Environment>
      <Ground />
      <City />
      <Traffic />
      <Suspense fallback={null}>
        <Building selected={selected} layout={layout} />
        {selected !== null && (
          <Suspense fallback={null}>
            <Furnishing selected={selected} layout={layout} />
          </Suspense>
        )}
        <Suspense fallback={null}>
          <Neighbour />
        </Suspense>
        <Crown />
        <FloorHits selected={selected} onSelect={onSelect} />
        <SelectedFloorLights selected={selected} />
        <CutawayAnimator selected={selected} />
        <Ready onReady={onReady} />
      </Suspense>
      <CameraRig selected={selected} />
    </Canvas>
  );
}

useGLTF.preload(BUILDING_URL, DRACO_PATH);
useGLTF.preload(KIT_URL, DRACO_PATH);
