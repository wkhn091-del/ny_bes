'use client';

import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { CanvasTexture, Color, type Group, type InstancedMesh, Matrix4, type Mesh, MeshStandardMaterial, SRGBColorSpace, ShaderMaterial } from 'three';
import { COLUMNS, COLUMN_SIZE, CORE, DOOR, ELEVATOR, FRONT_PIERS, LOBBY, PLINTH } from '@/components/three/building-model';
import { DRACO_PATH } from '@/components/three/desk-model';
import { AVENUE_HALF, AVENUE_Z, CROSSWALK } from './city';
import { rectAt, type Rect } from './layout';
import { WALK } from './shared';

export const HERO_CAR_URL = '/models/spacehub-hero-car.glb';

const CANOPY = { x: 7, z0: 15, z1: 27, y: 6.3 };
const CANOPY_POSTS: [number, number][] = [
  [-6.6, 26.4],
  [6.6, 26.4],
];
const RUNWAY_ZS = Array.from({ length: 7 }, (_, i) => 28 + i * 2);
const RUNWAY_X = 4.5;
const POOL = { x: -16, z: 34, r: 4.5 };
const PODIUM = { x: 16, z: 34, r: 4 };
const TREES: [number, number][] = [
  [-27, 24],
  [-27, 32],
  [-27, 40],
  [27, 24],
  [27, 32],
  [27, 40],
];
const RECEPTION = { x: -13, z: 3, w: 7, d: 1.3 };
const LOBBY_SOFAS: [number, number, number][] = [
  [13, 3.6, 0],
  [13, 8.4, Math.PI],
];
const LOBBY_TABLE = { x: 13, z: 6 };
const LOBBY_PLANTS: [number, number][] = [
  [-20, 10],
  [20, 10],
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
    rectAt(LOBBY_TABLE.x, LOBBY_TABLE.z, 1.4, 1.4),
    rectAt(POOL.x, POOL.z, POOL.r * 2, POOL.r * 2),
    rectAt(PODIUM.x, PODIUM.z, PODIUM.r * 2, PODIUM.r * 2),
  ];
  for (const p of FRONT_PIERS) rects.push(rectAt(p.x, p.z, p.w, p.d));
  for (const c of COLUMNS) if (c.z > -6 && c.z < 14) rects.push(rectAt(c.x, c.z, COLUMN_SIZE, COLUMN_SIZE));
  for (const [x, z] of CANOPY_POSTS) rects.push(rectAt(x, z, 0.5, 0.5));
  for (const z of RUNWAY_ZS) for (const x of [-RUNWAY_X, RUNWAY_X]) rects.push(rectAt(x, z, 0.3, 0.3));
  for (const [x, z] of TREES) rects.push(rectAt(x, z, 1.6, 1.6));
  for (const [x, z] of LOBBY_SOFAS) rects.push(rectAt(x, z, 3, 1));
  for (const [x, z] of LOBBY_PLANTS) rects.push(rectAt(x, z, 0.8, 0.8));
  for (const [x, z] of [...SIGNAL_POLES, ...STREET_LAMPS]) rects.push(rectAt(x, z, 0.3, 0.3));
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
      <mesh ref={left} position={[-DOOR.x / 2, y, LOBBY.glassZ - 0.15]} material={glass}>
        <boxGeometry args={[DOOR.x, h, 0.05]} />
      </mesh>
      <mesh ref={right} position={[DOOR.x / 2, y, LOBBY.glassZ - 0.15]} material={glass}>
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

const POOL_LED = new Color('#7fc8ff').multiplyScalar(2.2);
const JET = new Color('#cfeaff').multiplyScalar(1.6);

/** A round pool with dancing jets and a lit rim. */
function Fountain() {
  const jets = useRef<(Mesh | null)[]>([]);
  const water = useRef<MeshStandardMaterial>(null);
  const layout = useMemo(
    () => [
      { x: 0, z: 0, h: 4.2, r: 0.12 },
      ...Array.from({ length: 8 }, (_, i) => ({ x: Math.cos((i / 8) * Math.PI * 2) * 2.4, z: Math.sin((i / 8) * Math.PI * 2) * 2.4, h: 1.8, r: 0.06 })),
    ],
    [],
  );
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    jets.current.forEach((m, i) => {
      if (!m) return;
      const k = 0.65 + 0.35 * Math.sin(t * 2.2 + i * 0.9);
      m.scale.y = k;
      m.position.y = 0.45 + (layout[i]!.h * k) / 2;
    });
    if (water.current) water.current.emissiveIntensity = 0.55 + 0.2 * Math.sin(t * 3.1);
  });
  return (
    <group position={[POOL.x, 0, POOL.z]}>
      <mesh position={[0, 0.25, 0]}>
        <cylinderGeometry args={[POOL.r, POOL.r + 0.1, 0.5, 48, 1, true]} />
        <meshStandardMaterial color="#d9d4ca" roughness={0.6} side={2} />
      </mesh>
      <mesh position={[0, 0.51, 0]} rotation-x={-Math.PI / 2}>
        <torusGeometry args={[POOL.r, 0.06, 8, 64]} />
        <meshBasicMaterial color={POOL_LED} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.42, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[POOL.r - 0.05, 48]} />
        <meshStandardMaterial ref={water} color="#0b2a4a" emissive="#1e6fd6" emissiveIntensity={0.6} metalness={0.9} roughness={0.08} />
      </mesh>
      {layout.map((j, i) => (
        <mesh
          key={i}
          ref={(m) => {
            jets.current[i] = m;
          }}
          position={[j.x, 0.45 + j.h / 2, j.z]}
        >
          <cylinderGeometry args={[j.r * 0.4, j.r, j.h, 8]} />
          <meshBasicMaterial color={JET} transparent opacity={0.55} toneMapped={false} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
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
  return (
    <group>
      {TREES.map(([x, z]) => (
        <group key={`${x}:${z}`} position={[x, 0, z]}>
          <mesh position={[0, 0.35, 0]}>
            <boxGeometry args={[1.6, 0.7, 1.6]} />
            <meshStandardMaterial color="#26272d" roughness={0.7} />
          </mesh>
          <mesh position={[0, 1.8, 0]}>
            <cylinderGeometry args={[0.12, 0.16, 2.4, 8]} />
            <meshStandardMaterial color="#3b2c21" roughness={0.9} />
          </mesh>
          <mesh position={[0, 3.6, 0]}>
            <icosahedronGeometry args={[1.6, 1]} />
            <meshStandardMaterial color="#244d2c" roughness={0.85} flatShading />
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
      <group position={[RECEPTION.x, y, RECEPTION.z]}>
        <mesh position={[0, 0.55, 0]}>
          <boxGeometry args={[RECEPTION.w, 1.1, RECEPTION.d]} />
          <meshStandardMaterial color="#e9e4dc" roughness={0.3} />
        </mesh>
        <mesh position={[0, 1.13, 0]}>
          <boxGeometry args={[RECEPTION.w + 0.2, 0.06, RECEPTION.d + 0.2]} />
          <meshStandardMaterial color="#2b2b31" roughness={0.25} metalness={0.4} />
        </mesh>
        <mesh position={[0, 0.12, RECEPTION.d / 2 + 0.01]}>
          <boxGeometry args={[RECEPTION.w, 0.04, 0.02]} />
          <meshBasicMaterial color={LED} toneMapped={false} />
        </mesh>
      </group>
      {LOBBY_SOFAS.map(([x, z, r]) => (
        <group key={z} position={[x, y, z]} rotation-y={r}>
          <mesh position={[0, 0.25, 0]}>
            <boxGeometry args={[3, 0.5, 1]} />
            <meshStandardMaterial color="#3d3368" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.65, -0.4]}>
            <boxGeometry args={[3, 0.8, 0.2]} />
            <meshStandardMaterial color="#3d3368" roughness={0.9} />
          </mesh>
        </group>
      ))}
      <mesh position={[LOBBY_TABLE.x, y + 0.22, LOBBY_TABLE.z]}>
        <cylinderGeometry args={[0.7, 0.7, 0.44, 32]} />
        <meshStandardMaterial color="#6b5a45" roughness={0.5} />
      </mesh>
      {LOBBY_PLANTS.map(([x, z]) => (
        <group key={`${x}:${z}`} position={[x, y, z]}>
          <mesh position={[0, 0.3, 0]}>
            <cylinderGeometry args={[0.35, 0.28, 0.6, 16]} />
            <meshStandardMaterial color="#2b2b30" roughness={0.6} />
          </mesh>
          <mesh position={[0, 1.3, 0]}>
            <icosahedronGeometry args={[0.65, 1]} />
            <meshStandardMaterial color="#2f6b3a" roughness={0.8} flatShading />
          </mesh>
        </group>
      ))}
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
      <Lobby />
      <HeroCar />
    </group>
  );
}
