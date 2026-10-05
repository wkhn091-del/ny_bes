'use client';

import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { CanvasTexture, DoubleSide, type Object3D, SRGBColorSpace } from 'three';
import { DRACO_PATH } from '@/components/three/desk-model';
import { clamp } from '@/components/three/first-person';
import { RESIDENCE_NAME, RESIDENTS } from '@/content/residents';
import { CAB_SCALE, ELEVATOR_URL, PlantParts, RECEPTION_URL, cloneCabin, slideDoors } from './entrance';
import type { Rect } from './layout';
import { LOUNGE_URL, disposeGroups, groupsOf } from './realistic';
import { type Item, WALK } from './shared';
import { WALK_SIGNAL } from './walk-signal';

/**
 * The neighbouring apartment tower (the NYC tower model at NEIGHBOUR_AT, x 72–96, z −2.5–30.5):
 * a residents' lobby on the ground floor and eight duplex apartments above it, each reached by
 * a lift that opens straight into the home.
 */
export const RES_LOBBY_URL = '/models/res-lobby.glb';
export const RES_LOFT_URL = '/models/res-loft.glb';

export type HomeZone = 'home' | `home-${number}`;
export const homeZone = (level: number): HomeZone => (level === 0 ? 'home' : `home-${level}`);
export const isHomeZone = (zone: unknown): zone is HomeZone => typeof zone === 'string' && zone.startsWith('home');
export const homeLevelOf = (zone: HomeZone): number => (zone === 'home' ? 0 : Number(zone.slice(5)));
export const homeFloorY = (level: number) => (level === 0 ? 0 : 5 + (level - 1) * 10.5);

/** World = model + offset. The pool hall ("Artcollection room", front office cut away) and the loft ("Loft 17"). */
const HALL = { x: 88.86, z: 8 };
const LOFT = { x: 80.05, z: 16.5 };
const HALL_FLOOR = 0.21;
const WEST_WALK = -0.17;
const FOYER = { x0: -12.45, x1: 2.73, z0: 13.4, z1: 22, ceiling: 4.3 };
const FOYER_DOOR_X = -4.86;
const SOFA_AT = { x: -4.5, z: 18.5 };
const DESK_AT = { x: 0.9, z: 18.4 };

/** A walk-in cabin standing anywhere: its front line's middle (the doors) at (x, z), facing `rot` about Y (0 faces +z). */
type Cab = { ox: number; oz: number; rot: number; c: number; s: number };
function cab(frontX: number, frontZ: number, rot: number): Cab {
  const back = 1.21 * CAB_SCALE;
  return {
    ox: frontX - Math.sin(rot) * back,
    oz: frontZ - Math.cos(rot) * back,
    rot,
    c: Math.cos(rot),
    s: Math.sin(rot),
  };
}
const toLocal = (k: Cab, x: number, z: number) => {
  const dx = x - k.ox;
  const dz = z - k.oz;
  return [dx * k.c - dz * k.s, dx * k.s + dz * k.c] as const;
};
const toWorld = (k: Cab, lx: number, lz: number) => ({
  x: k.ox + lx * k.c + lz * k.s,
  z: k.oz - lx * k.s + lz * k.c,
});
const S = CAB_SCALE;
const INNER = { x0: -2.91 * S, x1: 1.11 * S, z0: -1.37 * S, z1: 0.97 * S };
const BODY = { x0: -3.05 * S, x1: 1.35 * S, z0: -1.49 * S, z1: 1.21 * S };
const HALF_DOOR = 0.95 * S;

function cabRects(k: Cab): Rect[] {
  const local: [number, number, number, number][] = [
    [BODY.x0, -HALF_DOOR, BODY.z1 - 0.25, BODY.z1],
    [HALF_DOOR, BODY.x1, BODY.z1 - 0.25, BODY.z1],
    [BODY.x0, INNER.x0, BODY.z0, BODY.z1],
    [INNER.x1, BODY.x1, BODY.z0, BODY.z1],
    [BODY.x0, BODY.x1, BODY.z0, INNER.z0],
  ];
  return local.map(([x0, x1, z0, z1]) => {
    const pts = [toWorld(k, x0, z0), toWorld(k, x1, z0), toWorld(k, x0, z1), toWorld(k, x1, z1)];
    return {
      x0: Math.min(...pts.map((p) => p.x)),
      x1: Math.max(...pts.map((p) => p.x)),
      z0: Math.min(...pts.map((p) => p.z)),
      z1: Math.max(...pts.map((p) => p.z)),
    };
  });
}

const LOBBY_CAB = cab(HALL.x - 10, HALL.z + 16, Math.PI / 2);
const LOFT_CAB = cab(LOFT.x + 5, LOFT.z + 6.6, Math.PI);
const cabOf = (zone: HomeZone) => (zone === 'home' ? LOBBY_CAB : LOFT_CAB);

const hallRect = (x0: number, x1: number, z0: number, z1: number): Rect => ({
  x0: x0 + HALL.x,
  x1: x1 + HALL.x,
  z0: z0 + HALL.z,
  z1: z1 + HALL.z,
});
const loftRect = (x0: number, x1: number, z0: number, z1: number): Rect => ({
  x0: x0 + LOFT.x,
  x1: x1 + LOFT.x,
  z0: z0 + LOFT.z,
  z1: z1 + LOFT.z,
});

const HALL_BLOCKED = {
  bounds: hallRect(-12.1, 2.4, -8, 21.6),
  rects: [
    hallRect(-7.45, -2.4, -9, 13.45),
    hallRect(-2.3, -0.6, -1.5, 9.6),
    hallRect(1, 2.8, -9, 12.8),
    hallRect(-12.5, -11, -9, 12.8),
    hallRect(SOFA_AT.x - 2.5, SOFA_AT.x + 2.5, SOFA_AT.z - 2.25, SOFA_AT.z + 2.25),
    hallRect(DESK_AT.x - 0.8, DESK_AT.x + 0.8, DESK_AT.z - 2, DESK_AT.z + 2),
    ...cabRects(LOBBY_CAB),
  ],
};
const LOFT_BODY_X = [LOFT.x + 5 - BODY.x1, LOFT.x + 5 - BODY.x0] as const;
const LOFT_BLOCKED = {
  bounds: loftRect(-3.5, 9.5, -3.3, 9.2),
  rects: [
    loftRect(-3.1, 1.7, -2, 1),
    loftRect(-3.6, -1.2, 1.2, 6.3),
    loftRect(4, 6.9, -3, -1),
    loftRect(1.9, 4.5, -2.3, 0.3),
    loftRect(5.5, 8.5, -3.8, -3),
    loftRect(8.6, 9.2, -3.6, -3),
    {
      x0: LOFT.x - 3.6,
      x1: LOFT_BODY_X[0],
      z0: LOFT.z + 6.3,
      z1: LOFT.z + 9.3,
    },
    {
      x0: LOFT_BODY_X[1],
      x1: LOFT.x + 9.6,
      z0: LOFT.z + 6.3,
      z1: LOFT.z + 9.3,
    },
    ...cabRects(LOFT_CAB),
  ],
};
export const homeObstacles = (zone: HomeZone) => (zone === 'home' ? HALL_BLOCKED : LOFT_BLOCKED);

/** Floor height under a point: the pool hall's west walkway sits lower, with steps up to the foyer. */
export function homeFloorAt(zone: HomeZone, x: number, z: number): number {
  if (zone !== 'home') return homeFloorY(homeLevelOf(zone));
  const lx = x - HALL.x;
  const lz = z - HALL.z;
  if (lx < -7.4 && lz < 12.4) return WEST_WALK + (HALL_FLOOR - WEST_WALK) * clamp((lz - 11) / 1.4, 0, 1);
  return HALL_FLOOR;
}

export function inHomeLift(zone: HomeZone, x: number, z: number): boolean {
  const [lx, lz] = toLocal(cabOf(zone), x, z);
  return lx > INNER.x0 && lx < INNER.x1 && lz > INNER.z0 && lz < INNER.z1;
}

/** Where you stand after a ride, facing out through the doors. */
export function homeArrival(zone: HomeZone): {
  x: number;
  z: number;
  yaw: number;
} {
  const k = cabOf(zone);
  return {
    ...toWorld(k, 0, (INNER.z0 + INNER.z1) / 2 + 0.2),
    yaw: k.rot + Math.PI,
  };
}

/** Just inside the residence's glass doors, facing the pool hall. */
export const HOME_SPAWN = {
  x: HALL.x + FOYER_DOOR_X,
  z: HALL.z + FOYER.z1 - 1.4,
  yaw: 0,
};
/** In the street, under the residence's canopy. */
export const RESIDENCE_DOOR = {
  x: HALL.x + FOYER_DOOR_X,
  z: HALL.z + FOYER.z1 + 2.5,
};

/** From anywhere in the zone to the cabin, around the pool, the lounge chairs and the foyer sofas. */
export function homeLiftRoute(zone: HomeZone, x: number, z: number): { x: number; z: number }[] {
  const k = cabOf(zone);
  const route: { x: number; z: number }[] = [];
  if (zone === 'home') {
    const lx = x - HALL.x;
    const lz = z - HALL.z;
    const at = (px: number, pz: number) => ({ x: px + HALL.x, z: pz + HALL.z });
    if (lz < FOYER.z0) {
      if (lx < -7.4) route.push(at(-9.1, Math.min(lz, 10.6)), at(-9.1, 13.6));
      else route.push(at(0.3, lz), at(0.3, 14.2));
    } else if (lz > SOFA_AT.z + 1.2) {
      route.push(at(-9.5, 21));
    }
  }
  route.push(toWorld(k, 0, BODY.z1 + 1.4), toWorld(k, 0, (INNER.z0 + INNER.z1) / 2));
  return route;
}

/** Flight from the orbit camera: over the avenue, then down to the residence's doors. */
export function homeFlight(from: { x: number; y: number; z: number }): { x: number; y: number; z: number }[] {
  return [
    { x: from.x, y: Math.max(from.y, 90), z: from.z },
    { x: RESIDENCE_DOOR.x, y: 60, z: 95 },
    { x: RESIDENCE_DOOR.x, y: 5, z: RESIDENCE_DOOR.z + 6 },
    { x: RESIDENCE_DOOR.x, y: 1.6, z: RESIDENCE_DOOR.z },
    { x: HOME_SPAWN.x, y: HALL_FLOOR + 1.6, z: HOME_SPAWN.z },
  ];
}

function labelTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  draw(ctx);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function useLabel(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): CanvasTexture {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tex = useMemo(() => labelTexture(w, h, draw), [w, h]);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

/** Brushed-brass mailboxes with each (simulated) household's name. */
function Mailboxes({ x, z }: { x: number; z: number }) {
  const tex = useLabel(1024, 640, (ctx) => {
    ctx.fillStyle = '#2a2622';
    ctx.fillRect(0, 0, 1024, 640);
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    RESIDENTS.forEach((r, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const bx = 1024 - (col + 1) * 250 - 12;
      const by = 40 + row * 290;
      ctx.fillStyle = '#b89a62';
      ctx.fillRect(bx, by, 238, 260);
      ctx.fillStyle = '#8c7346';
      ctx.fillRect(bx + 24, by + 150, 190, 12);
      ctx.fillStyle = '#1c1915';
      ctx.font = 'bold 54px system-ui, sans-serif';
      ctx.fillText(String(r.apt), bx + 119, by + 70);
      ctx.font = '30px system-ui, sans-serif';
      ctx.fillText(r.family, bx + 119, by + 120);
    });
  });
  return (
    <mesh position={[x, 1.6, z]} rotation-y={Math.PI / 2}>
      <planeGeometry args={[2.4, 1.5]} />
      <meshStandardMaterial map={tex} metalness={0.5} roughness={0.4} />
    </mesh>
  );
}

const SKIN = ['#c99a78', '#8d5a3b', '#e2b896', '#a8714f'];
const CLOTHES = ['#3b4a6b', '#7a3b3b', '#2f5d50', '#5b4a7a', '#8a6d3b', '#444'];

/** A stylised, faceless figure standing in for a resident of the simulation. */
function Figure({ x, z, y, r = 0, k, scale = 1 }: { x: number; z: number; y: number; r?: number; k: number; scale?: number }) {
  const g = useRef<Object3D>(null);
  useFrame(({ clock }) => {
    if (g.current) g.current.position.y = y + Math.sin(clock.elapsedTime * 1.3 + k) * 0.01;
  });
  return (
    <group ref={g} position={[x, y, z]} rotation-y={r} scale={scale}>
      <mesh position={[0, 0.82, 0]}>
        <capsuleGeometry args={[0.2, 0.9, 4, 12]} />
        <meshStandardMaterial color={CLOTHES[k % CLOTHES.length]} roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.58, 0]}>
        <sphereGeometry args={[0.13, 16, 12]} />
        <meshStandardMaterial color={SKIN[k % SKIN.length]} roughness={0.7} />
      </mesh>
    </group>
  );
}

function HomeCabin({ at, y }: { at: Cab; y: number }) {
  const { scene } = useGLTF(ELEVATOR_URL, DRACO_PATH);
  const cabin = useMemo(() => cloneCabin(scene), [scene]);
  const open = useRef(0);
  useFrame((_, delta) => {
    const [lx, lz] = toLocal(at, WALK.x, WALK.z);
    const near = !WALK_SIGNAL.riding && WALK.home && Math.abs(lx) < (lz < BODY.z1 ? 2.2 : 1.8) && lz > INNER.z0 - 0.5 && lz < BODY.z1 + 2.6;
    open.current += ((near ? 1 : 0) - open.current) * Math.min(1, delta * 2.2);
    slideDoors(cabin, open.current);
  });
  return (
    <group position={[at.ox, y, at.oz]} rotation-y={at.rot} scale={S}>
      <primitive object={cabin} />
    </group>
  );
}

const STONE = '#c8b8a2';
/** The pool-hall model stops short of the foyer and leaves gaps to the city; this dark box closes them. */
const HALL_SHELL = { z0: -9.6, y0: -1.5, y1: 4.9 };
const SEAM = 0.9;

function HallShell() {
  const { z0, y0, y1 } = HALL_SHELL;
  const x0 = FOYER.x0 - 0.05;
  const x1 = FOYER.x1 + 0.05;
  const z1 = FOYER.z0;
  const ym = (y0 + y1) / 2;
  const zm = (z0 + z1) / 2;
  const panels: {
    p: [number, number, number];
    r: [number, number, number];
    s: [number, number];
  }[] = [
    { p: [x0, ym, zm], r: [0, Math.PI / 2, 0], s: [z1 - z0, y1 - y0] },
    { p: [x1, ym, zm], r: [0, -Math.PI / 2, 0], s: [z1 - z0, y1 - y0] },
    { p: [(x0 + x1) / 2, ym, z0], r: [0, 0, 0], s: [x1 - x0, y1 - y0] },
    {
      p: [(x0 + x1) / 2, y1, zm],
      r: [Math.PI / 2, 0, 0],
      s: [x1 - x0, z1 - z0],
    },
  ];
  return (
    <>
      {panels.map(({ p, r, s }, i) => (
        <mesh key={i} position={p} rotation={r}>
          <planeGeometry args={s} />
          <meshStandardMaterial color="#1c1814" roughness={0.9} />
        </mesh>
      ))}
    </>
  );
}

function Foyer() {
  const lounge = useGLTF(LOUNGE_URL, DRACO_PATH);
  const desk = useGLTF(RECEPTION_URL, DRACO_PATH);
  const g = useMemo(() => groupsOf(lounge.scene), [lounge.scene]);
  useEffect(() => () => disposeGroups(g), [g]);
  const deskModel = useMemo(() => desk.scene.clone(true), [desk.scene]);
  const sofa = useMemo((): Item[] => [{ f: -1, x: SOFA_AT.x, z: SOFA_AT.z, y: HALL_FLOOR, r: 0 }], []);
  const vases = useMemo((): Item[] => [-9.8, 0.6].map((x) => ({ f: -1, x, z: 14.2, y: HALL_FLOOR })), []);
  const sign = useLabel(1024, 256, (ctx) => {
    ctx.fillStyle = '#1b1712';
    ctx.fillRect(0, 0, 1024, 256);
    ctx.fillStyle = '#d9b77a';
    ctx.textAlign = 'center';
    ctx.font = '600 92px Georgia, serif';
    ctx.fillText(RESIDENCE_NAME.toUpperCase(), 512, 140);
    ctx.font = '40px system-ui, sans-serif';
    ctx.fillText('RESIDENTS ONLY · 24/7 CONCIERGE', 512, 210);
  });
  const w = FOYER.x1 - FOYER.x0;
  const d = FOYER.z1 - FOYER.z0;
  const cx = (FOYER.x0 + FOYER.x1) / 2;
  const cz = (FOYER.z0 + FOYER.z1) / 2;
  const doorW = 3.2;
  const sideW = (w - doorW) / 2;
  return (
    <group>
      <mesh position={[cx, HALL_FLOOR + 0.005, cz - SEAM / 2]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[w, d + SEAM]} />
        <meshStandardMaterial color="#d6ccbd" roughness={0.22} metalness={0.05} />
      </mesh>
      <HallShell />
      <mesh position={[cx, FOYER.ceiling, cz]} rotation-x={Math.PI / 2}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color="#2b2520" roughness={0.6} />
      </mesh>
      {[-3, 0, 3].map((dx) => (
        <mesh key={dx} position={[cx + dx * 1.6, FOYER.ceiling - 0.02, cz]} rotation-x={Math.PI / 2}>
          <planeGeometry args={[1.2, d - 1.6]} />
          <meshBasicMaterial color="#fff1d6" toneMapped={false} />
        </mesh>
      ))}
      {[FOYER.x0, FOYER.x1].map((x) => (
        <mesh key={x} position={[x, (HALL_FLOOR + FOYER.ceiling) / 2, cz]}>
          <boxGeometry args={[0.2, FOYER.ceiling - HALL_FLOOR, d]} />
          <meshStandardMaterial color={STONE} roughness={0.5} />
        </mesh>
      ))}
      {[FOYER.x0 + sideW / 2, FOYER.x1 - sideW / 2].map((x) => (
        <mesh key={x} position={[x, (HALL_FLOOR + FOYER.ceiling) / 2, FOYER.z1]}>
          <boxGeometry args={[sideW, FOYER.ceiling - HALL_FLOOR, 0.06]} />
          <meshStandardMaterial color="#9fb7c9" transparent opacity={0.16} roughness={0.05} metalness={0.3} depthWrite={false} side={DoubleSide} />
        </mesh>
      ))}
      <mesh position={[FOYER_DOOR_X, HALL_FLOOR + 1.5, FOYER.z1]}>
        <boxGeometry args={[doorW, 3, 0.04]} />
        <meshStandardMaterial color="#c6d6e2" transparent opacity={0.1} roughness={0.05} depthWrite={false} side={DoubleSide} />
      </mesh>
      <mesh position={[FOYER_DOOR_X, HALL_FLOOR + 3.4, FOYER.z1 - 0.08]} rotation-y={Math.PI}>
        <planeGeometry args={[4.4, 1.1]} />
        <meshBasicMaterial map={sign} toneMapped={false} />
      </mesh>
      <mesh position={[(-7.45 + -2.4) / 2, HALL_FLOOR + 0.45, FOYER.z0 + 0.15]}>
        <boxGeometry args={[5.3, 0.9, 0.5]} />
        <meshStandardMaterial color="#5b4c3d" roughness={0.6} />
      </mesh>
      <PlantParts parts={g.SofaSet} items={sofa} />
      <PlantParts parts={g.LoftPlant} items={vases} />
      <primitive object={deskModel} position={[DESK_AT.x, HALL_FLOOR, DESK_AT.z]} rotation-y={-Math.PI / 2} scale={0.6} />
      <Figure x={DESK_AT.x + 1.1} z={DESK_AT.z} y={HALL_FLOOR} r={-Math.PI / 2} k={5} />
      <Mailboxes x={FOYER.x0 + 0.12} z={20.4} />
    </group>
  );
}

function ResidenceLobby() {
  const { scene } = useGLTF(RES_LOBBY_URL, DRACO_PATH);
  const hall = useMemo(() => scene.clone(true), [scene]);
  return (
    <>
      <group position={[HALL.x, 0, HALL.z]}>
        <primitive object={hall} />
        <Foyer />
        <Figure x={-9.4} z={2} y={WEST_WALK} r={Math.PI / 2} k={1} />
        <Figure x={0.4} z={6.5} y={HALL_FLOOR} r={Math.PI} k={2} />
      </group>
      <HomeCabin at={LOBBY_CAB} y={HALL_FLOOR} />
    </>
  );
}

/** Where the household stands around the living room; the first two are adults. */
const PEOPLE_SPOTS: [number, number, number][] = [
  [6.6, 2.2, -2.4],
  [0.4, 3.6, 0.6],
  [7.8, 0.2, 1.8],
  [-0.4, 5, 3],
  [2.6, 4.6, -1],
];

function Apartment({ level }: { level: number }) {
  const { scene } = useGLTF(RES_LOFT_URL, DRACO_PATH);
  const loft = useMemo(() => scene.clone(true), [scene]);
  const resident = RESIDENTS[level - 1]!;
  const y = homeFloorY(level);
  const plate = useLabel(512, 160, (ctx) => {
    ctx.fillStyle = '#1b1712';
    ctx.fillRect(0, 0, 512, 160);
    ctx.fillStyle = '#d9b77a';
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.font = 'bold 56px system-ui, sans-serif';
    ctx.fillText(`דירה ${resident.apt}`, 256, 66);
    ctx.font = '40px system-ui, sans-serif';
    ctx.fillText(resident.family, 256, 128);
  });
  const glass = <meshStandardMaterial color="#a9c1d4" transparent opacity={0.12} roughness={0.05} metalness={0.3} depthWrite={false} side={DoubleSide} />;
  const H = 10.1;
  return (
    <>
      <group position={[LOFT.x, y, LOFT.z]}>
        <primitive object={loft} />
        <mesh position={[9.8, H / 2, -2.7]}>
          <boxGeometry args={[0.05, H, 18.6]} />
          {glass}
        </mesh>
        <mesh position={[(-3.9 + LOFT_BODY_X[0] - LOFT.x) / 2, H / 2, 6.6]}>
          <boxGeometry args={[LOFT_BODY_X[0] - LOFT.x + 3.9, H, 0.05]} />
          {glass}
        </mesh>
        <mesh position={[(LOFT_BODY_X[1] - LOFT.x + 9.8) / 2, H / 2, 6.6]}>
          <boxGeometry args={[9.8 - (LOFT_BODY_X[1] - LOFT.x), H, 0.05]} />
          {glass}
        </mesh>
        {[-2, 0, 2, 4, 6, 8].map((x) => (
          <mesh key={x} position={[x, H / 2, 6.62]}>
            <boxGeometry args={[0.06, H, 0.06]} />
            <meshStandardMaterial color="#1d1f24" />
          </mesh>
        ))}
        <mesh position={[3, H, -2.7]} rotation-x={Math.PI / 2}>
          <planeGeometry args={[13.8, 18.6]} />
          <meshStandardMaterial color="#d9d6d0" roughness={0.8} side={DoubleSide} />
        </mesh>
        <mesh position={[5, 3.2, 6.55]}>
          <planeGeometry args={[1.4, 0.44]} />
          <meshBasicMaterial map={plate} toneMapped={false} side={DoubleSide} />
        </mesh>
        {PEOPLE_SPOTS.slice(0, resident.people).map(([px, pz, r], i) => (
          <Figure key={i} x={px} z={pz} y={0} r={r} k={level + i} scale={i < 2 ? 1 : 0.68} />
        ))}
      </group>
      <HomeCabin at={LOFT_CAB} y={y} />
    </>
  );
}

/** The residence's street entrance: a lit canopy and the building's name over the glass doors. */
export function ResidenceEntrance() {
  const sign = useLabel(1024, 160, (ctx) => {
    ctx.fillStyle = '#15120e';
    ctx.fillRect(0, 0, 1024, 160);
    ctx.fillStyle = '#e2c387';
    ctx.textAlign = 'center';
    ctx.font = '600 84px Georgia, serif';
    ctx.fillText(RESIDENCE_NAME.toUpperCase(), 512, 110);
  });
  const x = RESIDENCE_DOOR.x;
  const face = HALL.z + FOYER.z1 + 0.58;
  return (
    <group position={[x, 0, face]}>
      <mesh position={[0, 1.7, 0.01]}>
        <planeGeometry args={[3.4, 3.2]} />
        <meshStandardMaterial color="#1c2a36" metalness={0.6} roughness={0.15} emissive="#ffcf8a" emissiveIntensity={0.25} />
      </mesh>
      <mesh position={[0, 3.85, 1.6]}>
        <boxGeometry args={[7, 0.3, 3.2]} />
        <meshStandardMaterial color="#1a1814" metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh position={[0, 3.69, 1.6]} rotation-x={Math.PI / 2}>
        <planeGeometry args={[6.6, 2.8]} />
        <meshBasicMaterial color="#ffe2b0" toneMapped={false} />
      </mesh>
      <mesh position={[0, 3.85, 3.21]}>
        <planeGeometry args={[6.6, 0.28]} />
        <meshBasicMaterial map={sign} toneMapped={false} />
      </mesh>
      {[-3.2, 3.2].map((px) => (
        <mesh key={px} position={[px, 1.85, 3]}>
          <cylinderGeometry args={[0.07, 0.07, 3.7, 12]} />
          <meshStandardMaterial color="#b8975c" metalness={0.8} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

/** Whichever part of the residence you are walking: the lobby (0) or apartment 1–8, plus a ride's destination. */
export function Residence({ level, rideTo }: { level: number; rideTo: number | null }) {
  const shown = [...new Set([level, rideTo ?? level])];
  return <>{shown.map((l) => (l === 0 ? <ResidenceLobby key={l} /> : <Apartment key={l} level={l} />))}</>;
}

/**
 * The residence's lights. Always mounted (dark outside the residence) because adding or removing
 * a light makes three.js recompile every material in the city.
 */
export function ResidenceLights({ level }: { level: number | null }) {
  const on = level !== null;
  const y = on ? homeFloorY(level) : 0;
  const k = level === 0 ? LOBBY_CAB : LOFT_CAB;
  const inCab = toWorld(k, -0.9 * S, -0.2 * S);
  const room = level === 0 ? { x: HALL.x - 4.9, z: HALL.z + 12, h: 3.6 } : { x: LOFT.x + 3, z: LOFT.z + 1.5, h: 6.5 };
  return (
    <>
      <pointLight position={[inCab.x, y + 2.6 * S + (level === 0 ? HALL_FLOOR : 0), inCab.z]} color="#fff1dc" intensity={on ? 6 : 0} distance={4.5} decay={1.6} />
      <pointLight position={[room.x, y + room.h, room.z]} color="#ffe6c4" intensity={on ? 60 : 0} distance={28} decay={1.4} />
    </>
  );
}
