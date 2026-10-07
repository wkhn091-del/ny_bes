'use client';

import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  type BufferGeometry,
  Color,
  CylinderGeometry,
  IcosahedronGeometry,
  type InstancedMesh,
  type Material,
  MeshStandardMaterial,
  type MeshStandardMaterialParameters,
  PlaneGeometry,
} from 'three';
import { CLEAR_HEIGHT, FLOOR_COUNT } from '@/components/three/building-model';
import { DRACO_PATH } from '@/components/three/desk-model';
import { KIT_URL, extractKit, type KitPart } from '@/components/three/kit-model';
import {
  BAR,
  BOOTH,
  CHAIR,
  DESK_TOP,
  LOUNGE_TABLE,
  MONITOR,
  SCREEN,
  SCREEN_NAMES,
  SHELF,
  SOFA,
  TABLE,
  deskTopOffset,
  type Layout,
} from './layout';
import { RealisticFurniture, SpacePhotos } from './realistic';
import { codeScreenTexture } from './screens';

export { EXEC_URL, LOUNGE_URL, MEET_URL } from './realistic';
import { CLIP_PLANES, ONE, composeItem, seededRandom, type Item } from './shared';

/** Box instances for every item, optionally skipping one floor (where detailed models take over). */
export function Boxes({
  items,
  size,
  y,
  exclude = null,
  offset,
  renderOrder = 0,
  children,
}: {
  items: Item[];
  size: readonly [number, number, number];
  y: number;
  exclude?: number | null;
  offset?: (it: Item) => Item;
  renderOrder?: number;
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
    <instancedMesh ref={ref} args={[undefined, undefined, Math.max(1, items.length)]} frustumCulled={false} renderOrder={renderOrder}>
      <boxGeometry args={[1, 1, 1]} />
      {children}
    </instancedMesh>
  );
}

/** Fixed draw order for see-through layers inside the tower (its facade glass draws last), so they never swap places and flicker as the camera turns. */
export const GLASS_ORDER = { interior: 1, booth: 2 };

/** Model instances (one InstancedMesh per material) at the given items; items may carry their own scale. */
export function ModelInstances({ geometry, material, items }: { geometry: BufferGeometry; material: Material; items: Item[] }) {
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

const MONITOR_BACK = [0.6, 0.36, 0.025] as const;
const MONITOR_NECK = [0.05, 0.1, 0.05] as const;
const MONITOR_FOOT = [0.22, 0.012, 0.16] as const;
/** Monitor items carry `s`, the side they face; frame and stand sit just behind the screen. */
const behindScreen = (by: number) => (it: Item): Item => ({ ...it, z: it.z - (it.s ?? 1) * by });
const BEHIND_FRAME = behindScreen(0.02);
const BEHIND_STAND = behindScreen(0.05);

/** Every monitor shows code being written by one of the names, with a frame and a stand. */
function Monitors({ items }: { items: Item[] }) {
  const textures = useMemo(() => SCREEN_NAMES.map((n, k) => codeScreenTexture(k, n.split(' ')[0]!.toLowerCase())), []);
  useEffect(() => () => textures.forEach((t) => t.dispose()), [textures]);
  const byName = useMemo(() => SCREEN_NAMES.map((_, k) => items.filter((it) => it.k === k)), [items]);
  return (
    <>
      {byName.map((list, k) => (
        <Boxes key={k} items={list} size={MONITOR} y={1.0}>
          <meshBasicMaterial map={textures[k]} toneMapped={false} color="#d9dcff" clippingPlanes={CLIP_PLANES} />
        </Boxes>
      ))}
      <Boxes items={items} size={MONITOR_BACK} y={1.0} offset={BEHIND_FRAME}>
        <meshStandardMaterial color="#14161b" roughness={0.45} metalness={0.4} clippingPlanes={CLIP_PLANES} />
      </Boxes>
      <Boxes items={items} size={MONITOR_NECK} y={0.8} offset={BEHIND_STAND}>
        <meshStandardMaterial color="#2a2d34" roughness={0.4} metalness={0.6} clippingPlanes={CLIP_PLANES} />
      </Boxes>
      <Boxes items={items} size={MONITOR_FOOT} y={0.752} offset={BEHIND_STAND}>
        <meshStandardMaterial color="#2a2d34" roughness={0.4} metalness={0.6} clippingPlanes={CLIP_PLANES} />
      </Boxes>
    </>
  );
}

const scaled = (it: Item): Item => ({ ...it, sx: it.s ?? 1, sy: it.s ?? 1, sz: it.s ?? 1 });
const RUG_COLORS = ['#3b2f63', '#2f4a4a', '#5a3a2a'];
const BOTTLE_COLORS = ['#ffb35c', '#7fd1ff', '#c4b5fd', '#ff7a7a', '#9dffb0'];
const BOOK_COLORS = ['#6d28d9', '#e4d6bd', '#1f2937', '#a78bfa', '#b45309', '#f5f5f4', '#334155', '#0f766e'];

/** Plants, phone booths, coffee bar, bookshelves and rugs: the lived-in layer on every floor. */
function FitOut({ layout, selected }: { layout: Layout; selected: number | null }) {
  const g = useMemo(
    () => ({
      pot: new CylinderGeometry(0.24, 0.18, 0.5, 14).translate(0, 0.25, 0),
      leaves: new IcosahedronGeometry(0.46, 1).translate(0, 1.0, 0),
      leavesTop: new IcosahedronGeometry(0.32, 1).translate(0.08, 1.45, -0.05),
      stool: new CylinderGeometry(0.2, 0.2, 0.06, 16).translate(0, 0.76, 0),
      pole: new CylinderGeometry(0.03, 0.03, 0.74, 8).translate(0, 0.37, 0),
    }),
    [],
  );
  useEffect(() => () => Object.values(g).forEach((x) => x.dispose()), [g]);
  const mats = useMemo(
    () => ({
      pot: clipMat({ color: '#2b2b30', roughness: 0.6 }),
      leaves: clipMat({ color: '#2f6b3a', roughness: 0.8, flatShading: true }),
      leavesTop: clipMat({ color: '#3d7d45', roughness: 0.8, flatShading: true }),
      stool: clipMat({ color: '#1d1e24', roughness: 0.5 }),
      pole: clipMat({ color: '#9aa0aa', roughness: 0.3, metalness: 0.8 }),
    }),
    [],
  );
  useEffect(() => () => Object.values(mats).forEach((x) => x.dispose()), [mats]);
  const plants = useMemo(() => layout.plants.filter((it) => it.f !== selected).map(scaled), [layout, selected]);
  const shelvesBooks = useMemo(() => {
    const rnd = seededRandom(9);
    const out: (Item & { c: string })[] = [];
    for (const sh of layout.shelves) {
      for (let level = 0; level < 4; level++) {
        let z = sh.z - 1.1;
        while (z < sh.z + 1.05) {
          const w = 0.04 + rnd() * 0.05;
          const h = 0.22 + rnd() * 0.12;
          if (rnd() > 0.12) out.push({ f: sh.f, x: sh.x, z: z + w / 2, y: 0.3 + level * 0.5 + h / 2, sx: 0.26, sy: h, sz: w, c: BOOK_COLORS[Math.floor(rnd() * BOOK_COLORS.length)]! });
          z += w + 0.005;
        }
      }
    }
    return out;
  }, [layout]);
  const bottles = useMemo(() => {
    const rnd = seededRandom(13);
    const out: (Item & { c: string })[] = [];
    for (const b of layout.bars)
      for (const yy of [1.72, 2.22])
        for (let i = 0; i < 12; i++) out.push({ f: b.f, x: b.x - 2.2 + i * 0.4, z: 4.62, y: yy, sx: 0.08, sy: 0.24, sz: 0.08, c: BOTTLE_COLORS[Math.floor(rnd() * BOTTLE_COLORS.length)]! });
    return out;
  }, [layout]);

  return (
    <group>
      <ModelInstances geometry={g.pot} material={mats.pot} items={plants} />
      <ModelInstances geometry={g.leaves} material={mats.leaves} items={plants} />
      <ModelInstances geometry={g.leavesTop} material={mats.leavesTop} items={plants} />

      <Boxes items={layout.booths} size={BOOTH} y={BOOTH[1] / 2} renderOrder={GLASS_ORDER.booth}>
        <meshStandardMaterial color="#d6e6f5" transparent opacity={0.18} roughness={0.05} metalness={0.2} depthWrite={false} clippingPlanes={CLIP_PLANES} />
      </Boxes>
      <Boxes items={layout.booths} size={[0.08, BOOTH[1], BOOTH[2]]} y={BOOTH[1] / 2} offset={(it) => ({ ...it, x: it.x - Math.sign(it.x) * 0.5 })}>
        <meshStandardMaterial color="#5b45a8" roughness={0.95} clippingPlanes={CLIP_PLANES} />
      </Boxes>
      <Boxes items={layout.booths} size={[BOOTH[0], 0.06, BOOTH[2]]} y={BOOTH[1]}>
        <meshStandardMaterial color="#1b1c22" roughness={0.6} clippingPlanes={CLIP_PLANES} />
      </Boxes>
      <Boxes items={layout.booths} size={[0.8, 0.02, 0.8]} y={BOOTH[1] - 0.05}>
        <meshBasicMaterial color={BOOTH_LAMP} toneMapped={false} clippingPlanes={CLIP_PLANES} />
      </Boxes>
      <Boxes items={layout.booths} size={[0.5, 0.05, 0.6]} y={0.72} offset={(it) => ({ ...it, x: it.x - Math.sign(it.x) * 0.25 })}>
        <meshStandardMaterial color="#8a6a4a" roughness={0.6} clippingPlanes={CLIP_PLANES} />
      </Boxes>

      <Boxes items={layout.bars} size={BAR} y={BAR[1] / 2}>
        <meshStandardMaterial color="#5a3e2b" roughness={0.55} clippingPlanes={CLIP_PLANES} />
      </Boxes>
      <Boxes items={layout.bars} size={[BAR[0] + 0.15, 0.05, BAR[2] + 0.15]} y={BAR[1] + 0.02}>
        <meshStandardMaterial color="#e9e4dc" roughness={0.25} metalness={0.1} clippingPlanes={CLIP_PLANES} />
      </Boxes>
      <Boxes items={layout.bars} size={[BAR[0], 0.03, 0.02]} y={0.95} offset={(it) => ({ ...it, z: it.z + 0.37 })}>
        <meshBasicMaterial color={BAR_LED} toneMapped={false} clippingPlanes={CLIP_PLANES} />
      </Boxes>
      <Boxes items={layout.bars} size={[5, 0.04, 0.3]} y={1.6} offset={(it) => ({ ...it, z: 4.6 })}>
        <meshStandardMaterial color="#3a2a1e" roughness={0.6} clippingPlanes={CLIP_PLANES} />
      </Boxes>
      <Boxes items={layout.bars} size={[5, 0.04, 0.3]} y={2.1} offset={(it) => ({ ...it, z: 4.6 })}>
        <meshStandardMaterial color="#3a2a1e" roughness={0.6} clippingPlanes={CLIP_PLANES} />
      </Boxes>
      <ColoredBoxes items={bottles} glow />
      <ModelInstances geometry={g.stool} material={mats.stool} items={layout.stools} />
      <ModelInstances geometry={g.pole} material={mats.pole} items={layout.stools} />

      <Boxes items={layout.shelves} size={SHELF} y={SHELF[1] / 2}>
        <meshStandardMaterial color="#2e2620" roughness={0.7} clippingPlanes={CLIP_PLANES} />
      </Boxes>
      <ColoredBoxes items={shelvesBooks} />

      {RUG_COLORS.map((c, k) => (
        <Boxes key={c} items={layout.rugs.filter((r) => r.k === k)} size={[9.5, 0.012, 4.8]} y={0.006} exclude={selected}>
          <meshStandardMaterial color={c} roughness={1} clippingPlanes={CLIP_PLANES} />
        </Boxes>
      ))}
    </group>
  );
}

const BOOTH_LAMP = new Color('#fff1d6').multiplyScalar(1.4);
const BAR_LED = new Color('#a78bfa').multiplyScalar(2);

const clipMat = (opts: MeshStandardMaterialParameters) => new MeshStandardMaterial({ ...opts, clippingPlanes: CLIP_PLANES });

/** Boxes with their own colour each (books, bottles). */
function ColoredBoxes({ items, glow = false }: { items: (Item & { c: string })[]; glow?: boolean }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const c = new Color();
    items.forEach((it, i) => {
      mesh.setMatrixAt(i, composeItem(it, 0, ONE));
      mesh.setColorAt(i, c.set(it.c).multiplyScalar(glow ? 1.4 : 1));
    });
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [items, glow]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, Math.max(1, items.length)]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      {glow ? <meshBasicMaterial toneMapped={false} clippingPlanes={CLIP_PLANES} /> : <meshStandardMaterial roughness={0.8} clippingPlanes={CLIP_PLANES} />}
    </instancedMesh>
  );
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
      const zone = it.f === selected ? 1.25 : st.cur[it.f * 2 + (it.s ?? 0)]!;
      const lvl = wave * zone * st.floor[it.f]!;
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

export type BuiltDesk = { geometry: BufferGeometry; material: Material } | null;

/** Light stand-ins on every floor except the open one, which gets real furniture instead. */
export function Interior({
  layout,
  selected,
  exec,
}: {
  layout: Layout;
  selected: number | null;
  exec: { geometry: BufferGeometry; material: Material }[];
}) {
  const execElsewhere = useMemo(() => (selected === null ? layout.exec : layout.exec.filter((it) => it.f !== selected)), [layout, selected]);
  return (
    <group>
      <Boxes items={layout.desks} size={DESK_TOP} y={0.72} exclude={selected} offset={deskTopOffset}>
        <meshStandardMaterial color="#3a3f4a" roughness={0.6} clippingPlanes={CLIP_PLANES} />
      </Boxes>
      <Boxes items={layout.chairs} size={CHAIR} y={0.47} exclude={selected}>
        <meshStandardMaterial color="#17181d" roughness={0.7} clippingPlanes={CLIP_PLANES} />
      </Boxes>
      <Monitors items={layout.monitors} />
      {exec.map((p, i) => (
        <ModelInstances key={i} geometry={p.geometry} material={p.material} items={execElsewhere} />
      ))}
      <Boxes items={layout.glass} size={ONE} y={0} renderOrder={GLASS_ORDER.interior}>
        <meshStandardMaterial color="#cfe0f0" transparent opacity={0.16} roughness={0.05} metalness={0.3} depthWrite={false} clippingPlanes={CLIP_PLANES} />
      </Boxes>
      <Boxes items={layout.tables} size={TABLE} y={0.74} exclude={selected}>
        <meshStandardMaterial color="#d8d2c8" roughness={0.5} clippingPlanes={CLIP_PLANES} />
      </Boxes>
      <Boxes items={layout.screens} size={SCREEN} y={1.5}>
        <meshBasicMaterial color={SCREEN_GLOW} toneMapped={false} clippingPlanes={CLIP_PLANES} />
      </Boxes>
      <Boxes items={layout.sofas} size={SOFA} y={0.38} exclude={selected}>
        <meshStandardMaterial color="#4c3f7a" roughness={0.85} clippingPlanes={CLIP_PLANES} />
      </Boxes>
      <Boxes items={layout.lounge} size={LOUNGE_TABLE} y={0.4} exclude={selected}>
        <meshStandardMaterial color="#6b5a45" roughness={0.6} clippingPlanes={CLIP_PLANES} />
      </Boxes>
      <FitOut layout={layout} selected={selected} />
      <CeilingLights panels={layout.panels} live selected={selected} />
    </group>
  );
}

const SCREEN_GLOW = new Color('#6d5cff').multiplyScalar(1.1);

/** Model yaw that makes the kit chairs face +Z (their seat front), measured on the asset. */
const KIT_CHAIR_YAW = 0;

function KitInstances({ parts, items }: { parts: KitPart[] | BuiltDesk[] | undefined; items: Item[] }) {
  if (!parts || items.length === 0) return null;
  return (
    <>
      {parts.map((p, i) => (p ? <ModelInstances key={i} geometry={p.geometry} material={p.material} items={items} /> : null))}
    </>
  );
}

/** Real furniture on the open floor, mixing the kit's desks and chairs pod by pod. */
export function Furnishing({ selected, layout, builtDesk }: { selected: number; layout: Layout; builtDesk: BuiltDesk }) {
  const { scene } = useGLTF(KIT_URL, DRACO_PATH);
  const kit = useMemo(() => extractKit(scene), [scene]);
  const set = useMemo(() => {
    const on = (list: Item[]) => list.filter((it) => it.f === selected);
    const turn = (it: Item, by: number): Item => ({ ...it, r: (it.r ?? 0) + by });
    const chairs = on(layout.chairs);
    const deskChairs = chairs.filter((c) => !c.meet).map((c) => turn(c, KIT_CHAIR_YAW));
    const desks = on(layout.desks);
    return {
      ferli: desks.filter((d) => d.k !== 2 || !builtDesk).map(deskTopOffset),
      built: desks.filter((d) => d.k === 2 && builtDesk),
      chairsBlack: deskChairs.filter((c) => c.k === 0),
      chairsBlue: deskChairs.filter((c) => c.k === 1),
      chairsLeather: deskChairs.filter((c) => c.k === 2),
    };
  }, [layout, selected, builtDesk]);
  const p = kit.parts;
  return (
    <group>
      <KitInstances parts={p.ferliDesk} items={set.ferli} />
      <KitInstances parts={[builtDesk]} items={set.built} />
      <KitInstances parts={p.markusBlack} items={set.chairsBlack} />
      <KitInstances parts={p.markusBlue} items={set.chairsBlue} />
      <KitInstances parts={p.leatherChair} items={set.chairsLeather} />
      <Suspense fallback={null}>
        <RealisticFurniture layout={layout} selected={selected} Instances={KitInstances} />
      </Suspense>
      <Suspense fallback={null}>
        <SpacePhotos layout={layout} selected={selected} />
      </Suspense>
    </group>
  );
}
