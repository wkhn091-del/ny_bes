'use client';

import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { CanvasTexture, Color, DoubleSide, type Group, type InstancedMesh, Matrix4, type Mesh, MeshStandardMaterial, SRGBColorSpace, ShaderMaterial } from 'three';
import { COLUMNS, COLUMN_SIZE, CORE, DOOR, ELEVATOR, FRONT_PIERS, LOBBY, PLINTH } from '@/components/three/building-model';
import { DRACO_PATH } from '@/components/three/desk-model';
import type { KitPart } from '@/components/three/kit-model';
import { AVENUE_HALF, AVENUE_Z, CROSSWALK, SIDE_X } from './city';
import { ModelInstances } from './interior';
import { rectAt, type Rect } from './layout';
import { LOUNGE_URL, disposeGroups, groupsOf } from './realistic';
import { SIGN_SPOTS } from './roads';
import { type Item, WALK } from './shared';
import { SKY } from './sky';

/** The Lamborghini Revuelto (see streets.tsx for the credit); the podium shows the same model the traffic uses. */
export const HERO_CAR_URL = '/models/car-revuelto.glb';
/** "Reception" by Arbin4444 (CC-BY-4.0): only the marble counter. */
export const RECEPTION_URL = '/models/lobby-reception.glb';
/** "Office Plants pack LOWPOLY" by EFX (CC-BY-4.0): ball and cone topiary, hedge planter. */
export const PLANTS_URL = '/models/lobby-plants.glb';
/** "Zsolnay Fountain" by georgiyhazankin (CC-BY-4.0), simplified. */
export const FOUNTAIN_URL = '/models/lobby-fountain.glb';
/** "Elevator with Animation LOWPOLY" by EFX (CC-BY-4.0): only the call buttons and floor display. */
export const ELEVATOR_URL = '/models/lobby-elevator.glb';
/** One street tree cut from "New York City" by golukumar (CC-BY-4.0), see nyc.tsx. */
export const TREE_URL = '/models/nyc-tree.glb';

const CANOPY = { x: 7, z0: 15, z1: 27, y: 6.3 };
const CANOPY_POSTS: [number, number][] = [
  [-6.6, 26.4],
  [6.6, 26.4],
];
const RUNWAY_ZS = Array.from({ length: 7 }, (_, i) => 28 + i * 2);
const RUNWAY_X = 4.5;
const POOL = { x: -16, z: 34, r: 4.3 };
const PODIUM = { x: 16, z: 34, r: 4 };
const TREES: [number, number][] = [
  [-27, 24],
  [-27, 32],
  [-27, 40],
  [27, 24],
  [27, 32],
  [27, 40],
];
/** Street trees on both avenue sidewalks, midway between the lamps, clear of the crossings and the junction. */
const AVENUE_TREES: [number, number][] = Array.from({ length: 23 }, (_, i) => -287 + i * 26)
  .filter((x) => Math.abs(x) > 8 && Math.abs(x - SIDE_X) > 16)
  .flatMap((x) => [
    [x, AVENUE_Z - AVENUE_HALF - 2.1] as [number, number],
    [x, AVENUE_Z + AVENUE_HALF + 2.1] as [number, number],
  ]);
const RECEPTION = { x: -13, z: 3, w: 6.6, d: 1.5 };
const HEDGES: [number, number][] = [
  [-27, 28],
  [-27, 36],
  [27, 28],
  [27, 36],
];
const DOOR_PLANTS: [number, number][] = [
  [-4.6, 12.4],
  [4.6, 12.4],
];
/** Two lifts side by side across the core's front, each with a 1.9 m opening. */
const LIFTS = [ELEVATOR.x0 + 1.75, ELEVATOR.x1 - 1.75];
const LIFT = { w: 1.9, h: 2.8 };
/** Centred in the column bay between x 15.5–24.5 and z 4.5–13.5. */
const LOUNGE = { x: 20, z: 9, w: 6.4, d: 4 };
const LOBBY_PLANTS: [number, number][] = [
  [-20, 10],
  [11, 9],
  [-29, 0],
  [29, 0],
];
const SIGNAL_POLES: [number, number][] = [
  [CROSSWALK.x + 2.2, AVENUE_Z - AVENUE_HALF - 1],
  [-CROSSWALK.x - 2.2, AVENUE_Z + AVENUE_HALF + 1],
];
const STREET_LAMPS: [number, number][] = [-14, 12].flatMap((x) => [
  [x, AVENUE_Z - AVENUE_HALF - 1.2] as [number, number],
  [x, AVENUE_Z + AVENUE_HALF + 1.2] as [number, number],
]);

/** Where a walker in the street, on the plaza or in the lobby can go. */
export const STREET_BOUNDS: Rect = { x0: -34, x1: 34, z0: ELEVATOR.z + 1.4, z1: 68 };
/** The elevator lobby in front of the doors; standing here offers the floor picker. */
export const ELEVATOR_ZONE: Rect = { x0: ELEVATOR.x0, x1: ELEVATOR.x1, z0: ELEVATOR.z, z1: ELEVATOR.z + 3.2 };
export const LOBBY_SPAWN = { x: 1.5, z: ELEVATOR.z + 4.4 };

export function streetObstacles(): Rect[] {
  const rects: Rect[] = [
    { x0: -LOBBY.x, x1: -DOOR.x, z0: 13.4, z1: 13.8 },
    { x0: DOOR.x, x1: LOBBY.x, z0: 13.4, z1: 13.8 },
    { x0: -LOBBY.x - 0.2, x1: -LOBBY.x + 0.2, z0: -13.1, z1: 13.8 },
    { x0: LOBBY.x - 0.2, x1: LOBBY.x + 0.2, z0: -13.1, z1: 13.8 },
    { x0: CORE.x0, x1: CORE.x1, z0: CORE.z0, z1: ELEVATOR.z },
    { x0: PLINTH.stepsHalfX, x1: 40, z0: PLINTH.frontZ - 0.1, z1: PLINTH.frontZ + 0.3 },
    { x0: -40, x1: -PLINTH.stepsHalfX, z0: PLINTH.frontZ - 0.1, z1: PLINTH.frontZ + 0.3 },
    rectAt(RECEPTION.x, RECEPTION.z, RECEPTION.w, RECEPTION.d),
    rectAt(LOUNGE.x, LOUNGE.z, LOUNGE.w, LOUNGE.d),
    rectAt(POOL.x, POOL.z, POOL.r * 2, POOL.r * 2),
    rectAt(PODIUM.x, PODIUM.z, PODIUM.r * 2, PODIUM.r * 2),
  ];
  for (const p of FRONT_PIERS) rects.push(rectAt(p.x, p.z, p.w, p.d));
  for (const c of COLUMNS) if (c.z > -6 && c.z < 14) rects.push(rectAt(c.x, c.z, COLUMN_SIZE, COLUMN_SIZE));
  for (const [x, z] of CANOPY_POSTS) rects.push(rectAt(x, z, 0.5, 0.5));
  for (const z of RUNWAY_ZS) for (const x of [-RUNWAY_X, RUNWAY_X]) rects.push(rectAt(x, z, 0.3, 0.3));
  for (const [x, z] of TREES) rects.push(rectAt(x, z, 1.6, 1.6));
  for (const [x, z] of AVENUE_TREES) if (Math.abs(x) < 40) rects.push(rectAt(x, z, 0.6, 0.6));
  for (const [x, z] of [...LOBBY_PLANTS, ...DOOR_PLANTS]) rects.push(rectAt(x, z, 0.8, 0.8));
  for (const [x, z] of HEDGES) rects.push(rectAt(x, z, 0.9, 2.6));
  for (const [x, z] of [...SIGNAL_POLES, ...STREET_LAMPS]) rects.push(rectAt(x, z, 0.3, 0.3));
  for (const s of SIGN_SPOTS) rects.push(rectAt(s.x, s.z, 0.4, 0.4));
  return rects;
}

function textTexture(text: string, w: number, h: number, size: number): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const font = getComputedStyle(document.body).fontFamily || 'sans-serif';
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 ${size}px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + size * 0.05);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

const _m = new Matrix4();
const LED = new Color('#a78bfa').multiplyScalar(2.4);
const DOWNLIGHT = new Color('#fff1d6').multiplyScalar(2.2);
const DOOR_OPEN = 2.75;

/** Glass doors that slide apart as the walker comes close. */
function SlidingDoors() {
  const left = useRef<Mesh>(null);
  const right = useRef<Mesh>(null);
  const open = useRef(0);
  const glass = useMemo(() => new MeshStandardMaterial({ color: '#bcd3ea', transparent: true, opacity: 0.22, metalness: 0.6, roughness: 0.05, depthWrite: false }), []);
  useEffect(() => () => glass.dispose(), [glass]);
  useFrame((_, delta) => {
    const near = WALK.street && Math.hypot(WALK.x, WALK.z - LOBBY.glassZ) < 6;
    open.current += ((near ? 1 : 0) - open.current) * Math.min(1, delta * 4);
    const o = open.current * DOOR_OPEN;
    if (left.current) left.current.position.x = -DOOR.x / 2 - o;
    if (right.current) right.current.position.x = DOOR.x / 2 + o;
  });
  const h = DOOR.top - LOBBY.floor;
  const y = LOBBY.floor + h / 2;
  return (
    <group>
      <mesh ref={left} position={[-DOOR.x / 2, y, LOBBY.glassZ - 0.15]} material={glass} renderOrder={1}>
        <boxGeometry args={[DOOR.x, h, 0.05]} />
      </mesh>
      <mesh ref={right} position={[DOOR.x / 2, y, LOBBY.glassZ - 0.15]} material={glass} renderOrder={1}>
        <boxGeometry args={[DOOR.x, h, 0.05]} />
      </mesh>
      {[
        { p: [0, DOOR.top + 0.06, LOBBY.glassZ + 0.05], s: [DOOR.x * 2 + 0.3, 0.12, 0.12] },
        { p: [-DOOR.x - 0.08, y, LOBBY.glassZ + 0.05], s: [0.12, h, 0.12] },
        { p: [DOOR.x + 0.08, y, LOBBY.glassZ + 0.05], s: [0.12, h, 0.12] },
      ].map((b, i) => (
        <mesh key={i} position={b.p as [number, number, number]}>
          <boxGeometry args={b.s as [number, number, number]} />
          <meshBasicMaterial color={LED} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Canopy over the steps with a downlight grid, an LED edge and the name sign. */
function Canopy() {
  const sign = useMemo(() => textTexture('SpaceHub', 1024, 160, 120), []);
  useEffect(() => () => sign.dispose(), [sign]);
  const lights = useRef<InstancedMesh>(null);
  const spots = useMemo(() => {
    const out: [number, number][] = [];
    for (let x = -5.5; x <= 5.5; x += 2.2) for (let z = CANOPY.z0 + 1; z < CANOPY.z1; z += 2) out.push([x, z]);
    return out;
  }, []);
  useLayoutEffect(() => {
    const mesh = lights.current;
    if (!mesh) return;
    spots.forEach(([x, z], i) => mesh.setMatrixAt(i, _m.makeTranslation(x, CANOPY.y - 0.19, z)));
    mesh.instanceMatrix.needsUpdate = true;
  }, [spots]);
  const depth = CANOPY.z1 - CANOPY.z0;
  const midZ = (CANOPY.z0 + CANOPY.z1) / 2;
  return (
    <group>
      <mesh position={[0, CANOPY.y, midZ]}>
        <boxGeometry args={[CANOPY.x * 2, 0.35, depth]} />
        <meshStandardMaterial color="#1a1b21" metalness={0.6} roughness={0.35} />
      </mesh>
      {[
        { p: [0, CANOPY.y - 0.2, CANOPY.z1], s: [CANOPY.x * 2, 0.06, 0.06] },
        { p: [-CANOPY.x, CANOPY.y - 0.2, midZ], s: [0.06, 0.06, depth] },
        { p: [CANOPY.x, CANOPY.y - 0.2, midZ], s: [0.06, 0.06, depth] },
      ].map((b, i) => (
        <mesh key={i} position={b.p as [number, number, number]}>
          <boxGeometry args={b.s as [number, number, number]} />
          <meshBasicMaterial color={LED} toneMapped={false} />
        </mesh>
      ))}
      {CANOPY_POSTS.map(([x, z]) => (
        <mesh key={x} position={[x, CANOPY.y / 2, z]}>
          <cylinderGeometry args={[0.18, 0.22, CANOPY.y, 16]} />
          <meshStandardMaterial color="#c8ccd4" metalness={0.9} roughness={0.2} />
        </mesh>
      ))}
      <instancedMesh ref={lights} args={[undefined, undefined, spots.length]}>
        <cylinderGeometry args={[0.16, 0.16, 0.02, 16]} />
        <meshBasicMaterial color={DOWNLIGHT} toneMapped={false} />
      </instancedMesh>
      <mesh position={[0, CANOPY.y + 0.02, CANOPY.z1 + 0.19]}>
        <planeGeometry args={[6.4, 1]} />
        <meshBasicMaterial map={sign} transparent toneMapped={false} color="#f5f0ff" />
      </mesh>
      <pointLight position={[0, CANOPY.y - 1, midZ]} color="#ffe0b5" intensity={40} distance={16} decay={1.5} />
    </group>
  );
}

const STEP_SLOPE = Math.atan2(LOBBY.floor, PLINTH.stepsEndZ - PLINTH.frontZ);
const STEP_RUN = Math.hypot(LOBBY.floor, PLINTH.stepsEndZ - PLINTH.frontZ);
const CARPET_END = AVENUE_Z - AVENUE_HALF - 3.2;

/** Violet runner from the doors down the steps to the sidewalk, flanked by light posts that pulse toward the door. */
function Runway() {
  const posts = useRef<InstancedMesh>(null);
  const tops = useRef<InstancedMesh>(null);
  const list = useMemo(() => RUNWAY_ZS.flatMap((z) => [-RUNWAY_X, RUNWAY_X].map((x) => ({ x, z }))), []);
  useLayoutEffect(() => {
    for (const [ref, y] of [
      [posts, 0.55],
      [tops, 1.12],
    ] as const) {
      const mesh = ref.current;
      if (!mesh) continue;
      list.forEach((p, i) => mesh.setMatrixAt(i, _m.makeTranslation(p.x, y, p.z)));
      mesh.instanceMatrix.needsUpdate = true;
    }
  }, [list]);
  const c = useMemo(() => new Color(), []);
  useFrame(({ clock }) => {
    const mesh = tops.current;
    if (!mesh) return;
    const t = clock.elapsedTime;
    list.forEach((p, i) => {
      const phase = (((t * 1.2 - (40 - p.z) * 0.12) % 1.6) + 1.6) % 1.6;
      const pulse = Math.max(0, 1 - phase * 2.2);
      mesh.setColorAt(i, c.copy(LED).multiplyScalar(0.35 + pulse * 1.4));
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });
  return (
    <group>
      <mesh position={[0, LOBBY.floor + 0.04, (LOBBY.glassZ + 0.3 + PLINTH.frontZ) / 2]}>
        <boxGeometry args={[3, 0.02, PLINTH.frontZ - LOBBY.glassZ - 0.3]} />
        <meshStandardMaterial color="#4a2a9a" roughness={0.95} />
      </mesh>
      <mesh position={[0, LOBBY.floor / 2 + 0.06, (PLINTH.frontZ + PLINTH.stepsEndZ) / 2]} rotation-x={STEP_SLOPE}>
        <boxGeometry args={[3, 0.02, STEP_RUN]} />
        <meshStandardMaterial color="#4a2a9a" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.06, (PLINTH.stepsEndZ + CARPET_END) / 2]}>
        <boxGeometry args={[3, 0.02, CARPET_END - PLINTH.stepsEndZ]} />
        <meshStandardMaterial color="#4a2a9a" roughness={0.95} />
      </mesh>
      {[-1.55, 1.55].map((x) => (
        <mesh key={x} position={[x, 0.08, (PLINTH.stepsEndZ + CARPET_END) / 2]}>
          <boxGeometry args={[0.05, 0.02, CARPET_END - PLINTH.stepsEndZ]} />
          <meshBasicMaterial color={LED} toneMapped={false} />
        </mesh>
      ))}
      <instancedMesh ref={posts} args={[undefined, undefined, list.length]}>
        <cylinderGeometry args={[0.1, 0.12, 1.1, 12]} />
        <meshStandardMaterial color="#202228" metalness={0.8} roughness={0.3} />
      </instancedMesh>
      <instancedMesh ref={tops} args={[undefined, undefined, list.length]}>
        <cylinderGeometry args={[0.13, 0.13, 0.06, 12]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

/** The Zsolnay fountain on the plaza, with a moving water surface inside its stone basin. */
function Fountain() {
  const { scene } = useGLTF(FOUNTAIN_URL, DRACO_PATH);
  const model = useMemo(() => scene.clone(true), [scene]);
  const water = useRef<MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (water.current) water.current.emissiveIntensity = (0.16 + 0.06 * Math.sin(clock.elapsedTime * 2.3)) * (1 - SKY.day * 0.7);
  });
  return (
    <group position={[POOL.x, 0, POOL.z]}>
      <primitive object={model} />
      <mesh position={[0, WATER_Y, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[POOL.r * 0.86, 64]} />
        <meshStandardMaterial ref={water} color="#1d4b5e" emissive="#2f8fd0" metalness={0.6} roughness={0.06} transparent opacity={0.88} />
      </mesh>
    </group>
  );
}
const WATER_Y = 0.32;

/** Brushed steel lift doors that slide apart while someone stands at the lifts, with the call panel and floor display. */
function Lifts() {
  const { scene } = useGLTF(ELEVATOR_URL, DRACO_PATH);
  const panels = useMemo(() => LIFTS.map(() => scene.clone(true)), [scene]);
  const doors = useRef<(Group | null)[]>([]);
  const open = useRef(0);
  useFrame((_, delta) => {
    const near = WALK.street && WALK.x > ELEVATOR_ZONE.x0 - 1 && WALK.x < ELEVATOR_ZONE.x1 + 1 && WALK.z < ELEVATOR_ZONE.z1 + 1.5;
    open.current += ((near ? 1 : 0) - open.current) * Math.min(1, delta * 2.5);
    doors.current.forEach((d, i) => {
      if (d) d.position.x = (i % 2 === 0 ? -1 : 1) * (LIFT.w / 4 + open.current * (LIFT.w / 2 - 0.05));
    });
  });
  const y = LOBBY.floor;
  return (
    <group>
      {LIFTS.map((x, li) => (
        <group key={x} position={[x, y, ELEVATOR.z]}>
          <mesh position={[0, LIFT.h / 2, 0.02]}>
            <boxGeometry args={[LIFT.w, LIFT.h, 0.04]} />
            <meshStandardMaterial color="#0c0d10" roughness={0.9} />
          </mesh>
          {[0, 1].map((k) => (
            <group
              key={k}
              ref={(g) => {
                doors.current[li * 2 + k] = g;
              }}
            >
              <mesh position={[0, LIFT.h / 2, 0.08]}>
                <boxGeometry args={[LIFT.w / 2, LIFT.h, 0.05]} />
                <meshStandardMaterial color="#b9bcc2" metalness={0.92} roughness={0.32} />
              </mesh>
            </group>
          ))}
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * (LIFT.w / 2 + 0.06), LIFT.h / 2 + 0.06, 0.09]}>
              <boxGeometry args={[0.12, LIFT.h + 0.12, 0.1]} />
              <meshStandardMaterial color="#8d9097" metalness={0.9} roughness={0.25} />
            </mesh>
          ))}
          <mesh position={[0, LIFT.h + 0.06, 0.09]}>
            <boxGeometry args={[LIFT.w + 0.24, 0.12, 0.1]} />
            <meshStandardMaterial color="#8d9097" metalness={0.9} roughness={0.25} />
          </mesh>
          <primitive object={panels[li]!} position={[0, 0, -1.12]} />
        </group>
      ))}
    </group>
  );
}

function PlantParts({ parts, items }: { parts: KitPart[] | undefined; items: Item[] }) {
  return parts?.map((p, i) => <ModelInstances key={i} geometry={p.geometry} material={p.material} items={items} />);
}

/** Topiary in the lobby and on the plaza, hedge planters between the plaza trees. */
function Plants() {
  const { scene } = useGLTF(PLANTS_URL, DRACO_PATH);
  const g = useMemo(() => groupsOf(scene), [scene]);
  useEffect(() => () => disposeGroups(g), [g]);
  const items = useMemo(() => {
    const at = (list: [number, number][], y: number, s = 1): Item[] => list.map(([x, z]) => ({ f: -1, x, z, y, sx: s, sy: s, sz: s }));
    return {
      cones: at(LOBBY_PLANTS, LOBBY.floor),
      balls: at(DOOR_PLANTS, LOBBY.floor, 0.9),
      hedges: at(HEDGES, 0),
    };
  }, []);
  return (
    <>
      <PlantParts parts={g.PlantCone} items={items.cones} />
      <PlantParts parts={g.PlantBall} items={items.balls} />
      <PlantParts parts={g.PlantHedge} items={items.hedges} />
    </>
  );
}

/** The loft's leather lounge (sofa, coffee table and rug) as the lobby's waiting area. */
function LobbySofas() {
  const { scene } = useGLTF(LOUNGE_URL, DRACO_PATH);
  const g = useMemo(() => groupsOf(scene), [scene]);
  useEffect(() => () => disposeGroups(g), [g]);
  const items = useMemo((): Item[] => [{ f: -1, x: LOUNGE.x, z: LOUNGE.z, y: LOBBY.floor, r: Math.PI }], []);
  const vases = useMemo((): Item[] => [-3.2, 3.2].map((dx) => ({ f: -1, x: LOUNGE.x + dx, z: LOUNGE.z - 1, y: LOBBY.floor })), []);
  return (
    <>
      <PlantParts parts={g.SofaSet} items={items} />
      <PlantParts parts={g.LoftPlant} items={vases} />
    </>
  );
}

function ReceptionDesk() {
  const { scene } = useGLTF(RECEPTION_URL, DRACO_PATH);
  const model = useMemo(() => scene.clone(true), [scene]);
  return <primitive object={model} position={[RECEPTION.x, LOBBY.floor, RECEPTION.z]} />;
}

/** The hero car on a slowly turning podium with an LED ring and its own light. */
function HeroCar() {
  const { scene } = useGLTF(HERO_CAR_URL, DRACO_PATH);
  const car = useMemo(() => scene.clone(true), [scene]);
  const turn = useRef<Group>(null);
  useFrame((_, delta) => {
    if (turn.current) turn.current.rotation.y += delta * 0.25;
  });
  return (
    <group position={[PODIUM.x, 0, PODIUM.z]}>
      <mesh position={[0, 0.15, 0]}>
        <cylinderGeometry args={[PODIUM.r, PODIUM.r + 0.15, 0.3, 64]} />
        <meshStandardMaterial color="#121318" metalness={0.85} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0.31, 0]} rotation-x={-Math.PI / 2}>
        <torusGeometry args={[PODIUM.r - 0.1, 0.05, 8, 96]} />
        <meshBasicMaterial color={LED} toneMapped={false} />
      </mesh>
      <group ref={turn} position={[0, 0.3, 0]}>
        <primitive object={car} />
      </group>
      <pointLight position={[0, 6, 2]} color="#ffffff" intensity={45} distance={14} decay={1.6} />
    </group>
  );
}

const TREE_LED = new Color('#ffd9a0').multiplyScalar(1.4);

function Trees() {
  const { scene } = useGLTF(TREE_URL, DRACO_PATH);
  const g = useMemo(() => {
    const groups = groupsOf(scene);
    for (const p of groups.Tree ?? []) {
      if (!/foliage/i.test(p.material.name)) continue;
      p.material.alphaTest = 0.22;
      p.material.side = DoubleSide;
    }
    return groups;
  }, [scene]);
  useEffect(() => () => disposeGroups(g), [g]);
  const items = useMemo(() => {
    const turn = (x: number, z: number) => (Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % Math.PI;
    const at = (list: [number, number][], y: number, s: number): Item[] =>
      list.map(([x, z]) => ({ f: -1, x, z, y, r: turn(x, z), sx: s, sy: s, sz: s }));
    return [...at(TREES, 0.72, 0.6), ...at(AVENUE_TREES, 0.14, 0.55)];
  }, []);
  return (
    <group>
      <PlantParts parts={g.Tree} items={items} />
      {TREES.map(([x, z]) => (
        <group key={`${x}:${z}`} position={[x, 0, z]}>
          <mesh position={[0, 0.35, 0]}>
            <boxGeometry args={[1.6, 0.7, 1.6]} />
            <meshStandardMaterial color="#26272d" roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.72, 0]}>
            <boxGeometry args={[1.62, 0.04, 1.62]} />
            <meshBasicMaterial color={TREE_LED} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function setTime(m: ShaderMaterial, t: number) {
  m.uniforms.uTime!.value = t;
}

function ledWallMaterial(text: CanvasTexture): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uText: { value: text } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTime; uniform sampler2D uText; varying vec2 vUv;
void main(){
  vec3 a = vec3(0.42, 0.22, 1.0); vec3 b = vec3(0.08, 0.55, 1.0); vec3 c = vec3(1.0, 0.3, 0.75);
  float w = sin(vUv.x * 5.0 + uTime * 0.7) * 0.5 + 0.5;
  float v = sin(vUv.y * 3.0 - uTime * 0.5 + vUv.x * 4.0) * 0.5 + 0.5;
  vec3 col = mix(mix(a, b, w), c, v * 0.4) * 0.6;
  vec2 g = vUv * vec2(220.0, 80.0);
  vec2 gw = fwidth(g);
  float px = mix(step(0.18, fract(g.x)) * step(0.18, fract(g.y)), 0.67, clamp(max(gw.x, gw.y) * 2.0 - 0.3, 0.0, 1.0));
  col = mix(col, vec3(1.0), texture2D(uText, vUv).a);
  gl_FragColor = vec4(col * (0.55 + 0.45 * px) * 1.5, 1.0);
}`,
    toneMapped: false,
  });
}

/** Lobby: polished floor, reception, a lounge, ceiling light lines and an animated LED wall over the elevators. */
function Lobby() {
  const text = useMemo(() => textTexture('SpaceHub', 1024, 340, 150), []);
  const wall = useMemo(() => ledWallMaterial(text), [text]);
  useEffect(
    () => () => {
      text.dispose();
      wall.dispose();
    },
    [text, wall],
  );
  useFrame(({ clock }) => setTime(wall, clock.elapsedTime));
  const y = LOBBY.floor;
  return (
    <group>
      <mesh position={[(ELEVATOR.x0 + ELEVATOR.x1) / 2, y + 4.5, ELEVATOR.z + 0.06]} material={wall}>
        <planeGeometry args={[ELEVATOR.x1 - ELEVATOR.x0 + 2, 3]} />
      </mesh>
      {[-3, 3, 9].map((z) => (
        <mesh key={z} position={[0, LOBBY.ceiling - 0.08, z]}>
          <boxGeometry args={[LOBBY.x * 2 - 4, 0.04, 0.12]} />
          <meshBasicMaterial color={DOWNLIGHT} toneMapped={false} />
        </mesh>
      ))}
      <pointLight position={[0, LOBBY.ceiling - 1.2, 3]} color="#ffe0b5" intensity={60} distance={30} decay={1.4} />
    </group>
  );
}

export function Entrance() {
  return (
    <group>
      <SlidingDoors />
      <Canopy />
      <Runway />
      <Fountain />
      <Trees />
      <Plants />
      <Lobby />
      <ReceptionDesk />
      <LobbySofas />
      <Lifts />
      <HeroCar />
    </group>
  );
}
