'use client';

import { ContactShadows, Environment, Html, Lightformer, Merged, PerformanceMonitor, RoundedBox, Sparkles, useGLTF, useProgress } from '@react-three/drei';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Moon, Sun, Sunset } from 'lucide-react';
import { clsx } from 'clsx';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DoubleSide,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
  type MeshStandardMaterial,
  type OrthographicCamera,
} from 'three';
import { DESK_LITE_URL, drawDeskScreen, prepareDesk } from '@/components/three/desk-model';
import { formatIls } from '@/lib/domain/pricing';
import { formatMinutes, nowInIsrael } from '@/lib/domain/time';
import type { LiveFloor, LiveSpace } from './floor-types';

export const OFFICE_KIT_URL = '/models/office-kit.glb';
/** Self-hosted decoder: decoding runs in Web Workers, off the main thread. */
export const DRACO_DECODER_PATH = '/draco/';

const ACCENT = '#7c3aed';
const CAMERA_POSITION = new Vector3(10, 11, 10);

interface Palette {
  slab: string;
  slabSide: string;
  carpet: string;
  zone: string;
  desk: string;
  deskLeg: string;
  glass: string;
  frame: string;
  busyLed: string;
  label: 'light' | 'dark';
  envIntensity: number;
  sun: number;
  hemi: number;
  wall: string;
  fabric: string;
  rug: string;
  wood: string;
}

const PALETTES: Record<'light' | 'dark', Palette> = {
  light: {
    slab: '#f4f1ec',
    slabSide: '#dcd7cf',
    carpet: '#ebe8e3',
    zone: '#e9e6f4',
    desk: '#f7f5f2',
    deskLeg: '#3f3f46',
    glass: '#dbeafe',
    frame: '#9ca3af',
    busyLed: '#a1a1aa',
    label: 'light',
    envIntensity: 0.9,
    sun: 2.2,
    hemi: 0.55,
    wall: '#eeebe6',
    fabric: '#c9c2b8',
    rug: '#ddd5c8',
    wood: '#c49a6c',
  },
  dark: {
    slab: '#26262c',
    slabSide: '#141418',
    carpet: '#202026',
    zone: '#1e1a2b',
    desk: '#2c2c31',
    deskLeg: '#71717a',
    glass: '#6d5bd0',
    frame: '#52525b',
    busyLed: '#3f3f46',
    label: 'dark',
    envIntensity: 0.45,
    sun: 1.1,
    hemi: 0.3,
    wall: '#2e2d33',
    fabric: '#46434d',
    rug: '#2a2731',
    wood: '#7a5a3c',
  },
};

// ---------- real Israel time of day ----------

type SkyPhase = 'day' | 'golden' | 'night';

interface Sky {
  phase: SkyPhase;
  minutes: number;
  /** multipliers on the theme palette */
  sun: number;
  hemi: number;
  env: number;
  color: string;
  /** unit-ish sun direction; scaled by the scene extent */
  dir: [number, number, number];
}

/** Approximate year-round daylight window; the clock shown is exact, the lighting is atmosphere. */
const SUNRISE_MIN = 6 * 60;
const SUNSET_MIN = 18 * 60 + 30;
const GOLDEN = new Color('#ffb070');
const NOON = new Color('#fff8ee');

function skyAt(minutes: number): Sky {
  if (minutes < SUNRISE_MIN || minutes >= SUNSET_MIN) {
    return { phase: 'night', minutes, sun: 0.28, hemi: 0.5, env: 0.55, color: '#9db4ff', dir: [-0.45, 1, 0.3] };
  }
  const t = (minutes - SUNRISE_MIN) / (SUNSET_MIN - SUNRISE_MIN);
  const elevation = Math.sin(t * Math.PI);
  const warm = Math.min(1, elevation / 0.45);
  return {
    phase: elevation < 0.3 ? 'golden' : 'day',
    minutes,
    sun: 0.45 + 0.55 * elevation,
    hemi: 0.75 + 0.25 * elevation,
    env: 0.8 + 0.2 * elevation,
    color: `#${GOLDEN.clone().lerp(NOON, warm * warm).getHexString()}`,
    dir: [0.95 - 1.9 * t, 0.3 + 0.8 * elevation, 0.4],
  };
}

function useIsraelSky(): Sky {
  const [minutes, setMinutes] = useState(() => nowInIsrael().minutes);
  useEffect(() => {
    const id = window.setInterval(() => setMinutes(nowInIsrael().minutes), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return useMemo(() => skyAt(minutes), [minutes]);
}

const SKY_COPY: Record<SkyPhase, { label: string; Icon: typeof Sun }> = {
  day: { label: 'אור יום', Icon: Sun },
  golden: { label: 'שעת זהב', Icon: Sunset },
  night: { label: 'לילה', Icon: Moon },
};

const SHIRTS = ['#4f46e5', '#0ea5e9', '#f97316', '#10b981', '#e11d48', '#64748b', '#eab308'];
const SKIN = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];

function pick<T>(list: T[], seed: string): T {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return list[Math.abs(h) % list.length];
}

// ---------- layout ----------

interface Tile {
  space: LiveSpace;
  x: number;
  z: number;
  w: number;
  d: number;
  available: boolean;
}

interface Desk {
  key: string;
  slug: string;
  x: number;
  z: number;
  available: boolean;
}

interface Layout {
  tiles: Tile[];
  desks: Desk[];
  deskZone: { x: number; z: number; w: number; d: number } | null;
  width: number;
  depth: number;
}

const WALL_H = 0.85;
const DESK_COLS = 4;
const DESK_PITCH_X = 1.25;
const DESK_PITCH_Z = 1.15;

function buildLayout(floor: LiveFloor): Layout {
  const desks: Desk[] = [];
  const tiles: Tile[] = [];
  const live = floor.at !== null;

  let deskRows = 0;
  for (const space of floor.spaces.filter((s) => s.type === 'hotDesk')) {
    for (let i = 0; i < space.capacity; i += 1) {
      const col = i % DESK_COLS;
      const row = deskRows + Math.floor(i / DESK_COLS);
      desks.push({
        key: `${space.id}-${i}`,
        slug: space.slug,
        x: -0.9 - col * DESK_PITCH_X,
        z: row * DESK_PITCH_Z,
        available: live && i >= space.used,
      });
    }
    deskRows += Math.ceil(space.capacity / DESK_COLS) + 0.6;
  }

  let z = -0.35;
  for (const space of floor.spaces.filter((s) => s.type !== 'hotDesk')) {
    const isMeeting = space.type === 'meetingRoom';
    const w = isMeeting ? (space.seats >= 8 ? 3.6 : 2.8) : 2.4;
    const d = isMeeting ? (space.seats >= 8 ? 2.6 : 2.2) : 2;
    tiles.push({ space, x: 0.9 + w / 2, z: z + d / 2, w, d, available: live && space.used < space.capacity });
    z += d + 0.35;
  }

  const deskMinX = desks.length ? -0.9 - (DESK_COLS - 1) * DESK_PITCH_X - 0.7 : 0;
  const deskDepth = desks.length ? Math.max(...desks.map((d) => d.z)) + 0.7 : 0;
  const deskZone = desks.length
    ? { x: (deskMinX - 0.2) / 2, z: (deskDepth - 0.7) / 2, w: Math.abs(deskMinX) + 0.2, d: deskDepth + 0.7 }
    : null;

  const maxX = tiles.length ? Math.max(...tiles.map((t) => t.x + t.w / 2)) + 0.5 : 1;
  const minX = deskMinX - 0.5;
  const depth = Math.max(deskDepth + 0.5, z + 0.5, 3);
  const offsetX = (minX + maxX) / 2;
  const offsetZ = depth / 2 - 0.6;

  return {
    tiles: tiles.map((t) => ({ ...t, x: t.x - offsetX, z: t.z - offsetZ })),
    desks: desks.map((d) => ({ ...d, x: d.x - offsetX, z: d.z - offsetZ })),
    deskZone: deskZone ? { ...deskZone, x: deskZone.x - offsetX, z: deskZone.z - offsetZ } : null,
    width: maxX - minX,
    depth,
  };
}

// ---------- furniture kit (Draco GLB, GPU-instanced) ----------

type KitPart = 'ChairFabric' | 'ChairFrame' | 'PlantPot' | 'PlantLeaves' | 'MonitorBody' | 'LampShade' | 'LampGlow' | 'PersonBody' | 'PersonHead';
type InstanceProps = { position?: [number, number, number]; rotation?: [number, number, number]; scale?: number; color?: string };
type Kit = Record<KitPart, ComponentType<InstanceProps>>;

const KitContext = createContext<Kit | null>(null);
const KIT_PARTS: KitPart[] = ['ChairFabric', 'ChairFrame', 'PlantPot', 'PlantLeaves', 'MonitorBody', 'LampShade', 'LampGlow', 'PersonBody', 'PersonHead'];

function KitProvider({ children }: { children: ReactNode }) {
  const { nodes } = useGLTF(OFFICE_KIT_URL, DRACO_DECODER_PATH);
  const meshes = useMemo(() => {
    const out: Partial<Record<KitPart, Mesh>> = {};
    for (const name of KIT_PARTS) {
      const mesh = nodes[name] as Mesh | undefined;
      if (mesh) out[name] = mesh;
    }
    const glow = out.LampGlow?.material as MeshStandardMaterial | undefined;
    if (glow) {
      glow.emissive.set('#ffd9a0');
      glow.emissiveIntensity = 2.2;
      glow.toneMapped = false;
    }
    return out as Record<KitPart, Mesh>;
  }, [nodes]);

  return (
    <Merged meshes={meshes} castShadow receiveShadow>
      {(kit) => <KitContext.Provider value={kit as unknown as Kit}>{children}</KitContext.Provider>}
    </Merged>
  );
}

/** Furniture is optional detail: until the kit is decoded (or if it fails) the scene still shows rooms, desks and status. */
function KitOnly({ children }: { children: (kit: Kit) => ReactNode }) {
  const kit = useContext(KitContext);
  return kit ? <>{children(kit)}</> : null;
}

function Chair({ position, rotation = 0, occupied, seed }: { position: [number, number, number]; rotation?: number; occupied: boolean; seed: string }) {
  return (
    <KitOnly>
      {(k) => (
        <group position={position} rotation={[0, rotation, 0]}>
          <k.ChairFabric />
          <k.ChairFrame />
          {occupied && (
            <>
              <k.PersonBody color={pick(SHIRTS, seed)} />
              <k.PersonHead color={pick(SKIN, seed + 'h')} />
            </>
          )}
        </group>
      )}
    </KitOnly>
  );
}

function Plant({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <KitOnly>
      {(k) => (
        <group position={position} scale={scale}>
          <k.PlantPot />
          <k.PlantLeaves />
        </group>
      )}
    </KitOnly>
  );
}

function Monitor({ position, lit }: { position: [number, number, number]; lit: boolean }) {
  return (
    <group position={position}>
      <KitOnly>{(k) => <k.MonitorBody />}</KitOnly>
      <mesh position={[0, 0.29, 0.013]} rotation={[-0.06, 0, 0]}>
        <planeGeometry args={[0.46, 0.26]} />
        <meshStandardMaterial color={lit ? '#cfe3ff' : '#262b35'} emissive={lit ? '#9cc3ff' : '#000000'} emissiveIntensity={lit ? 0.9 : 0} roughness={0.12} metalness={0.3} />
      </mesh>
    </group>
  );
}

function PendantLamp({ position, on }: { position: [number, number, number]; on: boolean }) {
  return (
    <KitOnly>
      {(k) => (
        <group position={position}>
          <k.LampShade />
          {on && <k.LampGlow />}
        </group>
      )}
    </KitOnly>
  );
}

// ---------- materials & pieces ----------

/** Deterministic PRNG (mulberry32) so the floor pattern is stable across renders. */
function seededRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function useFloorTexture(dark: boolean, repeat: [number, number]): CanvasTexture {
  const [rx, ry] = repeat;
  const texture = useMemo(() => {
    const rand = seededRandom(dark ? 7 : 11);
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    if (dark) {
      ctx.fillStyle = '#1b1b1f';
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 2600; i += 1) {
        ctx.fillStyle = `rgba(255,255,255,${rand() * 0.035})`;
        ctx.fillRect(rand() * size, rand() * size, 2, 2);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, size, size);
    } else {
      const plankH = size / 8;
      const tones = ['#e8dccb', '#e2d4c0', '#ecdfcd', '#dfd0bb', '#e6d8c5'];
      for (let row = 0; row < 8; row += 1) {
        let x = -(row % 2) * (size / 3);
        while (x < size) {
          const len = size / 2 + (rand() * size) / 3;
          ctx.fillStyle = tones[Math.floor(rand() * tones.length)];
          ctx.fillRect(x, row * plankH, len, plankH);
          for (let g = 0; g < 7; g += 1) {
            ctx.strokeStyle = `rgba(120,90,60,${0.04 + rand() * 0.05})`;
            ctx.beginPath();
            const gy = row * plankH + rand() * plankH;
            ctx.moveTo(x, gy);
            ctx.bezierCurveTo(x + len / 3, gy + 3, x + (2 * len) / 3, gy - 3, x + len, gy);
            ctx.stroke();
          }
          ctx.fillStyle = 'rgba(90,70,50,0.18)';
          ctx.fillRect(x, row * plankH, 1.5, plankH);
          x += len;
        }
        ctx.fillStyle = 'rgba(90,70,50,0.16)';
        ctx.fillRect(0, row * plankH, size, 1.5);
      }
    }
    const t = new CanvasTexture(canvas);
    t.colorSpace = SRGBColorSpace;
    t.wrapS = RepeatWrapping;
    t.wrapT = RepeatWrapping;
    t.anisotropy = 4;
    t.repeat.set(rx, ry);
    return t;
  }, [dark, rx, ry]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

function PulseMaterial({ color, base = 1.4, amplitude = 0.5, active }: { color: string; base?: number; amplitude?: number; active: boolean }) {
  const ref = useRef<MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (!ref.current || !active) return;
    ref.current.emissiveIntensity = base + Math.sin(clock.elapsedTime * 2.2) * amplitude;
  });
  return <meshStandardMaterial ref={ref} color={color} emissive={color} emissiveIntensity={active ? base : 0.15} toneMapped={!active} />;
}

let beamAlpha: CanvasTexture | null = null;
/** Vertical fade (opaque at the floor, clear at the top), shared by every beam. */
function getBeamAlpha(): CanvasTexture {
  if (beamAlpha) return beamAlpha;
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#000');
  g.addColorStop(0.55, '#333');
  g.addColorStop(1, '#fff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 128);
  beamAlpha = new CanvasTexture(canvas);
  return beamAlpha;
}

const BEAM_H = 1.5;

/** A soft column of light over a room that is free right now (live data only). */
function Beacon({ w, d, strength }: { w: number; d: number; strength: number }) {
  const ref = useRef<MeshBasicMaterial>(null);
  const alphaMap = useMemo(() => getBeamAlpha(), []);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.opacity = strength * (0.85 + Math.sin(clock.elapsedTime * 1.6) * 0.15);
  });
  return (
    <mesh position={[0, BEAM_H / 2, 0]} scale={[w * 0.46, 1, d * 0.46]} renderOrder={2}>
      <cylinderGeometry args={[1, 1, BEAM_H, 40, 1, true]} />
      <meshBasicMaterial
        ref={ref}
        color={ACCENT}
        alphaMap={alphaMap}
        transparent
        opacity={strength}
        blending={AdditiveBlending}
        side={DoubleSide}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

const DROP_HEIGHT = 0.9;
/** Continuous rendering only during the intro and while the pointer is over the map; otherwise frames render on demand. */
const INTRO_ACTIVE_MS = 3500;
const HOVER_LINGER_MS = 1500;

/** Shared intro start time, owned outside the Suspense boundary so swapping in the furnished scene doesn't replay the intro. */
const IntroClock = createContext<((now: number) => number) | null>(null);

/** Settles onto the floor once, staggered by `order`; starts above the floor so the first frame already shows everything. */
function Settle({ order, lift = 0, children }: { order: number; lift?: number; children: ReactNode }) {
  const ref = useRef<Group>(null);
  const localStart = useRef<number | null>(null);
  const introStart = useContext(IntroClock);
  useFrame(({ clock }) => {
    const group = ref.current;
    if (!group) return;
    let start: number;
    if (introStart) {
      start = introStart(clock.elapsedTime);
    } else {
      if (localStart.current === null) localStart.current = clock.elapsedTime;
      start = localStart.current;
    }
    const t = Math.min(1, Math.max(0, (clock.elapsedTime - start - order * 0.04) / 0.6));
    const eased = 1 - Math.pow(1 - t, 3);
    if (t < 1) group.position.y = (1 - eased) * DROP_HEIGHT + lift * eased;
    else group.position.y += (lift - group.position.y) * 0.18;
  });
  return (
    <group ref={ref} position={[0, DROP_HEIGHT, 0]}>
      {children}
    </group>
  );
}

const COMPACT_BELOW = 560;

/**
 * A fixed DOM layer for labels. Without it drei falls back to `events.connected`, which only
 * becomes available after the first render and makes every label remount mid-render.
 */
const LabelLayer = createContext<RefObject<HTMLElement> | null>(null);

function Label({
  title,
  status,
  available,
  y,
  theme,
  expanded = false,
  price,
}: {
  title: string;
  status: string;
  available: boolean;
  y: number;
  theme: string;
  expanded?: boolean;
  price?: string;
}) {
  const compact = useThree((s) => s.size.width < COMPACT_BELOW);
  const portal = useContext(LabelLayer);
  return (
    <Html portal={portal ?? undefined} position={[0, y, 0]} center zIndexRange={[20, 0]} wrapperClass="[direction:ltr]" style={{ pointerEvents: 'none' }}>
      <div
        dir="rtl"
        className={
          'whitespace-nowrap rounded-full border font-semibold shadow-md backdrop-blur transition-[transform,padding] duration-(--dur-micro) ease-(--ease-out) ' +
          (compact ? 'px-2 py-0.5 text-3xs ' : 'px-2.5 py-1 text-2xs ') +
          (theme === 'dark' ? 'border-white/10 bg-black/70 text-white' : 'border-black/5 bg-white/90 text-zinc-900') +
          (expanded ? ' scale-110' : '')
        }
      >
        <span className={available ? 'text-violet-500' : 'text-zinc-400'}>●</span> {title}
        {(!compact || expanded) && <span className="font-normal opacity-70"> · {status}</span>}
        {expanded && price && (
          <span className={theme === 'dark' ? 'text-violet-300' : 'text-violet-700'}>
            {' '}
            · {price} לשעה
          </span>
        )}
      </div>
    </Html>
  );
}

function GlassRoom({ w, d, palette, available, hovered }: { w: number; d: number; palette: Palette; available: boolean; hovered: boolean }) {
  const hw = w / 2;
  const hd = d / 2;
  const led = available ? ACCENT : palette.busyLed;
  const panes: { pos: [number, number, number]; size: [number, number, number] }[] = [
    { pos: [0, WALL_H / 2, -hd], size: [w, WALL_H, 0.015] },
    { pos: [0, WALL_H / 2, hd], size: [w, WALL_H, 0.015] },
    { pos: [-hw, WALL_H / 2, 0], size: [0.015, WALL_H, d] },
    { pos: [hw, WALL_H / 2, 0], size: [0.015, WALL_H, d] },
  ];
  const corners: [number, number][] = [
    [-hw, -hd],
    [hw, -hd],
    [-hw, hd],
    [hw, hd],
  ];
  return (
    <group>
      {panes.map((p, i) => (
        <mesh key={i} position={p.pos}>
          <boxGeometry args={p.size} />
          <meshPhysicalMaterial
            color={palette.glass}
            transparent
            opacity={hovered ? 0.24 : 0.14}
            roughness={0.05}
            metalness={0}
            clearcoat={1}
            clearcoatRoughness={0.05}
            depthWrite={false}
          />
        </mesh>
      ))}
      {corners.map(([x, z], i) => (
        <mesh key={i} position={[x, WALL_H / 2, z]} castShadow>
          <boxGeometry args={[0.035, WALL_H, 0.035]} />
          <meshStandardMaterial color={palette.frame} metalness={0.85} roughness={0.3} />
        </mesh>
      ))}
      {[
        { pos: [0, WALL_H, -hd] as [number, number, number], size: [w, 0.03, 0.03] as [number, number, number] },
        { pos: [0, WALL_H, hd] as [number, number, number], size: [w, 0.03, 0.03] as [number, number, number] },
        { pos: [-hw, WALL_H, 0] as [number, number, number], size: [0.03, 0.03, d] as [number, number, number] },
        { pos: [hw, WALL_H, 0] as [number, number, number], size: [0.03, 0.03, d] as [number, number, number] },
      ].map((r, i) => (
        <mesh key={i} position={r.pos}>
          <boxGeometry args={r.size} />
          <meshStandardMaterial color={palette.frame} metalness={0.85} roughness={0.3} />
        </mesh>
      ))}
      {[
        { pos: [0, 0.015, -hd + 0.02] as [number, number, number], size: [w - 0.06, 0.02, 0.02] as [number, number, number] },
        { pos: [0, 0.015, hd - 0.02] as [number, number, number], size: [w - 0.06, 0.02, 0.02] as [number, number, number] },
        { pos: [-hw + 0.02, 0.015, 0] as [number, number, number], size: [0.02, 0.02, d - 0.06] as [number, number, number] },
        { pos: [hw - 0.02, 0.015, 0] as [number, number, number], size: [0.02, 0.02, d - 0.06] as [number, number, number] },
      ].map((s, i) => (
        <mesh key={i} position={s.pos}>
          <boxGeometry args={s.size} />
          <PulseMaterial color={led} active={available} />
        </mesh>
      ))}
    </group>
  );
}

/** Real desk model scaled to map units (desk top ≈ 0.43, like the other furniture). Screen lights up when the office is taken. */
const OFFICE_DESK_SCALE = 0.58;

function OfficeDesk({ occupied, seed }: { occupied: boolean; seed: string }) {
  const { scene } = useGLTF(DESK_LITE_URL, DRACO_DECODER_PATH);
  const screen = useMemo(() => drawDeskScreen(), []);
  const model = useMemo(() => prepareDesk(scene, screen, occupied), [scene, screen, occupied]);
  useEffect(() => () => screen.dispose(), [screen]);
  return (
    <group position={[0, 0, -0.32]} scale={OFFICE_DESK_SCALE} rotation={[0, Math.PI, 0]}>
      <primitive object={model} />
      {occupied && (
        <KitOnly>
          {(k) => (
            <group position={[-0.19, 0, -0.37]} scale={1 / OFFICE_DESK_SCALE}>
              <k.PersonBody color={pick(SHIRTS, seed)} />
              <k.PersonHead color={pick(SKIN, seed + 'h')} />
            </group>
          )}
        </KitOnly>
      )}
    </group>
  );
}

function RoomInterior({ tile, palette }: { tile: Tile; palette: Palette }) {
  const occupied = !tile.available;
  const id = tile.space.id;
  if (tile.space.type === 'privateOffice') {
    const simpleDesk = (
      <group>
        <RoundedBox args={[1.2, 0.05, 0.6]} radius={0.02} position={[0, 0.42, -0.35]} castShadow receiveShadow>
          <meshStandardMaterial color={palette.desk} roughness={0.45} />
        </RoundedBox>
        {[-0.55, 0.55].map((x) => (
          <mesh key={x} position={[x, 0.2, -0.35]} castShadow>
            <boxGeometry args={[0.04, 0.4, 0.5]} />
            <meshStandardMaterial color={palette.deskLeg} metalness={0.6} roughness={0.4} />
          </mesh>
        ))}
        <Monitor position={[0, 0.445, -0.52]} lit={occupied} />
        <Chair position={[0, 0, 0.12]} rotation={Math.PI} occupied={occupied} seed={id} />
      </group>
    );
    return (
      <group>
        <Suspense fallback={simpleDesk}>
          <OfficeDesk occupied={occupied} seed={id} />
        </Suspense>
        <Plant position={[tile.w / 2 - 0.25, 0, -tile.d / 2 + 0.25]} scale={1.15} />
      </group>
    );
  }
  const seats = Math.min(Math.max(tile.space.seats, 2), 10);
  const perSide = Math.ceil(seats / 2);
  const tableW = Math.min(tile.w - 0.9, 0.55 * perSide + 0.3);
  const seated = occupied ? Math.max(2, Math.round(seats * 0.6)) : 0;
  const lamps = Math.max(1, Math.round(tableW / 1.1));
  return (
    <group>
      <RoundedBox args={[tableW, 0.06, 0.82]} radius={0.03} position={[0, 0.44, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={palette.desk} roughness={0.35} />
      </RoundedBox>
      {[-tableW / 2 + 0.2, tableW / 2 - 0.2].map((x) => (
        <mesh key={x} position={[x, 0.21, 0]} castShadow>
          <boxGeometry args={[0.06, 0.42, 0.5]} />
          <meshStandardMaterial color={palette.deskLeg} metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      {Array.from({ length: seats }, (_, i) => {
        const side = i < perSide ? -1 : 1;
        const idx = i < perSide ? i : i - perSide;
        const count = i < perSide ? perSide : seats - perSide;
        const x = (idx - (count - 1) / 2) * (tableW / Math.max(count, 1));
        return <Chair key={i} position={[x, 0, side * 0.6]} rotation={side === -1 ? 0 : Math.PI} occupied={i < seated} seed={`${id}-${i}`} />;
      })}
      {Array.from({ length: lamps }, (_, i) => (
        <PendantLamp key={i} position={[(i - (lamps - 1) / 2) * 1.1, 0.68, 0]} on={occupied} />
      ))}
      <Plant position={[tile.w / 2 - 0.22, 0, -tile.d / 2 + 0.22]} />
    </group>
  );
}

type OpenSpace = (slug: string, e: ThreeEvent<MouseEvent>) => void;

function Room({
  tile,
  order,
  palette,
  status,
  hovered,
  beam,
  onHover,
  onOpen,
}: {
  tile: Tile;
  order: number;
  palette: Palette;
  status: string;
  hovered: boolean;
  /** beam opacity; 0 hides it */
  beam: number;
  onHover: (id: string | null) => void;
  onOpen: OpenSpace;
}) {
  return (
    <group position={[tile.x, 0, tile.z]}>
      <Settle order={order} lift={hovered ? 0.1 : 0}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]} receiveShadow>
          <planeGeometry args={[tile.w - 0.03, tile.d - 0.03]} />
          <meshStandardMaterial color={palette.carpet} roughness={1} />
        </mesh>
        {tile.available && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.016, 0]}>
            <planeGeometry args={[tile.w - 0.1, tile.d - 0.1]} />
            <meshBasicMaterial color={ACCENT} transparent opacity={hovered ? 0.2 : 0.1} depthWrite={false} toneMapped={false} />
          </mesh>
        )}
        <group position={[0, 0.012, 0]}>
          <RoomInterior tile={tile} palette={palette} />
        </group>
        <GlassRoom w={tile.w} d={tile.d} palette={palette} available={tile.available} hovered={hovered} />
        {tile.available && beam > 0 && <Beacon w={tile.w} d={tile.d} strength={hovered ? beam * 1.6 : beam} />}
        <mesh
          position={[0, WALL_H / 2, 0]}
          onPointerOver={(e) => {
            e.stopPropagation();
            onHover(tile.space.id);
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={() => {
            onHover(null);
            document.body.style.cursor = '';
          }}
          onClick={(e) => {
            e.stopPropagation();
            document.body.style.cursor = '';
            onOpen(tile.space.slug, e);
          }}
        >
          <boxGeometry args={[tile.w, WALL_H, tile.d]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
        </mesh>
        <Label
          title={tile.space.name}
          status={status}
          available={tile.available}
          y={WALL_H + 0.45}
          expanded={hovered}
          theme={palette.label}
          price={formatIls(tile.space.hourlyPrice)}
        />
      </Settle>
    </group>
  );
}

function DeskUnit({ desk, order, palette, onOpen }: { desk: Desk; order: number; palette: Palette; onOpen: OpenSpace }) {
  return (
    <group
      position={[desk.x, 0, desk.z]}
      onClick={(e) => {
        e.stopPropagation();
        document.body.style.cursor = '';
        onOpen(desk.slug, e);
      }}
      onPointerOver={() => (document.body.style.cursor = 'pointer')}
      onPointerOut={() => (document.body.style.cursor = '')}
    >
      <Settle order={order}>
        <RoundedBox args={[0.95, 0.045, 0.6]} radius={0.015} position={[0, 0.425, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={palette.desk} roughness={0.45} />
        </RoundedBox>
        {[-0.43, 0.43].map((x) => (
          <mesh key={x} position={[x, 0.2, 0]} castShadow>
            <boxGeometry args={[0.03, 0.4, 0.52]} />
            <meshStandardMaterial color={palette.deskLeg} metalness={0.6} roughness={0.4} />
          </mesh>
        ))}
        <Monitor position={[0, 0.447, -0.17]} lit={!desk.available} />
        {desk.available && (
          <mesh position={[0.3, 0.47, 0.08]}>
            <boxGeometry args={[0.12, 0.05, 0.03]} />
            <PulseMaterial color={ACCENT} base={1.6} amplitude={0.6} active />
          </mesh>
        )}
        <Chair position={[0, 0, desk.available ? 0.3 : 0.42]} rotation={Math.PI} occupied={!desk.available} seed={desk.key} />
      </Settle>
    </group>
  );
}

// ---------- building shell & lounge (architectural context, no data) ----------

const EXT_H = 1.6;
const SILL_H = 0.16;
const HEAD_H = 0.14;
const EXT_T = 0.08;
const LOUNGE_D = 1.7;

/** A window wall along local X: sill, full-height glazing with mullions, header. */
function WindowWall({ length, palette, night }: { length: number; palette: Palette; night: boolean }) {
  const glassH = EXT_H - SILL_H - HEAD_H;
  const bays = Math.max(2, Math.round(length / 1.15));
  return (
    <group>
      <mesh position={[0, SILL_H / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[length, SILL_H, EXT_T]} />
        <meshStandardMaterial color={palette.wall} roughness={0.85} />
      </mesh>
      <mesh position={[0, EXT_H - HEAD_H / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[length, HEAD_H, EXT_T]} />
        <meshStandardMaterial color={palette.wall} roughness={0.85} />
      </mesh>
      <mesh position={[0, SILL_H + glassH / 2, 0]}>
        <boxGeometry args={[length, glassH, 0.012]} />
        <meshPhysicalMaterial
          color={night ? '#1e2a4d' : '#d6e6f5'}
          transparent
          opacity={night ? 0.45 : 0.3}
          roughness={0.04}
          clearcoat={1}
          envMapIntensity={1.6}
          depthWrite={false}
        />
      </mesh>
      {Array.from({ length: bays + 1 }, (_, i) => (
        <mesh key={i} position={[-length / 2 + (length * i) / bays, SILL_H + glassH / 2, 0]} castShadow>
          <boxGeometry args={[0.035, glassH, EXT_T * 0.7]} />
          <meshStandardMaterial color="#2b2b30" metalness={0.7} roughness={0.35} />
        </mesh>
      ))}
    </group>
  );
}

/** Cut-away corner of the building: the two far walls are glazed, the near sides stay open for the view. */
function BuildingShell({ slabW, slabD, slabZ, palette, night }: { slabW: number; slabD: number; slabZ: number; palette: Palette; night: boolean }) {
  const backZ = slabZ - slabD / 2 + EXT_T / 2;
  const leftX = -slabW / 2 + EXT_T / 2;
  return (
    <group>
      <group position={[0, 0, backZ]}>
        <WindowWall length={slabW} palette={palette} night={night} />
      </group>
      <group position={[leftX, 0, slabZ]} rotation={[0, Math.PI / 2, 0]}>
        <WindowWall length={slabD} palette={palette} night={night} />
      </group>
      <mesh position={[leftX + 0.05, EXT_H / 2, backZ + 0.05]} castShadow receiveShadow>
        <boxGeometry args={[0.22, EXT_H, 0.22]} />
        <meshStandardMaterial color={palette.slabSide} roughness={0.9} />
      </mesh>
    </group>
  );
}

function Sofa({ position, palette }: { position: [number, number, number]; palette: Palette }) {
  return (
    <group position={position}>
      <RoundedBox args={[1.6, 0.2, 0.55]} radius={0.05} position={[0, 0.17, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={palette.fabric} roughness={0.95} />
      </RoundedBox>
      <RoundedBox args={[1.6, 0.34, 0.14]} radius={0.05} position={[0, 0.36, -0.21]} castShadow>
        <meshStandardMaterial color={palette.fabric} roughness={0.95} />
      </RoundedBox>
      {[-0.74, 0.74].map((x) => (
        <RoundedBox key={x} args={[0.13, 0.3, 0.55]} radius={0.04} position={[x, 0.26, 0]} castShadow>
          <meshStandardMaterial color={palette.fabric} roughness={0.95} />
        </RoundedBox>
      ))}
      {[-0.4, 0.38].map((x, i) => (
        <RoundedBox key={x} args={[0.32, 0.24, 0.08]} radius={0.03} position={[x, 0.38, -0.12]} rotation={[-0.25, 0, i ? 0.12 : -0.08]} castShadow>
          <meshStandardMaterial color={i ? '#e7dfd2' : '#8b7bb8'} roughness={0.9} />
        </RoundedBox>
      ))}
    </group>
  );
}

function Armchair({ position, rotation, palette }: { position: [number, number, number]; rotation: number; palette: Palette }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <RoundedBox args={[0.55, 0.2, 0.5]} radius={0.05} position={[0, 0.17, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#b9a58a" roughness={0.9} />
      </RoundedBox>
      <RoundedBox args={[0.55, 0.3, 0.12]} radius={0.05} position={[0, 0.34, -0.2]} castShadow>
        <meshStandardMaterial color="#b9a58a" roughness={0.9} />
      </RoundedBox>
      {[-0.25, 0.25].map((x) => (
        <mesh key={x} position={[x, 0.04, 0]} castShadow>
          <boxGeometry args={[0.03, 0.08, 0.4]} />
          <meshStandardMaterial color={palette.deskLeg} metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

/** Lounge, coffee bar and a phone booth along the back windows, so the floor reads as a real workplace. */
function Lounge({ slabW, backZ, palette, night }: { slabW: number; backZ: number; palette: Palette; night: boolean }) {
  const counterL = Math.min(2.4, slabW * 0.3);
  const counterX = -slabW / 2 + 0.7 + counterL / 2;
  const counterZ = backZ + EXT_T + 0.32;
  const loungeX = Math.min(slabW / 2 - 1.6, counterX + counterL / 2 + 1.5);
  const sofaZ = backZ + EXT_T + 0.34;
  const stools = Math.max(2, Math.floor(counterL / 0.6));
  const counterLamps = Math.max(1, Math.round(counterL / 0.9));
  return (
    <group>
      <RoundedBox args={[counterL, 0.44, 0.55]} radius={0.02} position={[counterX, 0.22, counterZ]} castShadow receiveShadow>
        <meshStandardMaterial color={palette.wall} roughness={0.6} />
      </RoundedBox>
      <mesh position={[counterX, 0.46, counterZ + 0.02]} castShadow receiveShadow>
        <boxGeometry args={[counterL + 0.06, 0.04, 0.62]} />
        <meshStandardMaterial color={palette.wood} roughness={0.45} />
      </mesh>
      <mesh position={[counterX - counterL / 2 + 0.25, 0.56, counterZ - 0.1]} castShadow>
        <boxGeometry args={[0.18, 0.16, 0.18]} />
        <meshStandardMaterial color="#1f1f23" metalness={0.5} roughness={0.3} />
      </mesh>
      {Array.from({ length: stools }, (_, i) => {
        const x = counterX - counterL / 2 + (counterL * (i + 0.5)) / stools;
        return (
          <group key={i} position={[x, 0, counterZ + 0.52]}>
            <mesh position={[0, 0.36, 0]} castShadow>
              <cylinderGeometry args={[0.11, 0.11, 0.04, 20]} />
              <meshStandardMaterial color={palette.wood} roughness={0.5} />
            </mesh>
            <mesh position={[0, 0.17, 0]} castShadow>
              <cylinderGeometry args={[0.015, 0.015, 0.34, 8]} />
              <meshStandardMaterial color="#27272a" metalness={0.7} roughness={0.3} />
            </mesh>
            <mesh position={[0, 0.005, 0]}>
              <cylinderGeometry args={[0.09, 0.09, 0.01, 16]} />
              <meshStandardMaterial color="#27272a" metalness={0.7} roughness={0.3} />
            </mesh>
          </group>
        );
      })}
      {Array.from({ length: counterLamps }, (_, i) => (
        <PendantLamp key={i} position={[counterX + (i - (counterLamps - 1) / 2) * 0.9, 0.95, counterZ + 0.05]} on={night} />
      ))}

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[loungeX, 0.009, sofaZ + 0.6]} receiveShadow>
        <planeGeometry args={[2.3, 1.25]} />
        <meshStandardMaterial color={palette.rug} roughness={1} />
      </mesh>
      <Sofa position={[loungeX, 0, sofaZ]} palette={palette} />
      <group position={[loungeX, 0, sofaZ + 0.68]}>
        <mesh position={[0, 0.22, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.3, 0.3, 0.035, 32]} />
          <meshStandardMaterial color={palette.wood} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.1, 0]} castShadow>
          <cylinderGeometry args={[0.04, 0.12, 0.2, 16]} />
          <meshStandardMaterial color="#27272a" metalness={0.6} roughness={0.35} />
        </mesh>
        <mesh position={[0.08, 0.26, 0.04]} castShadow>
          <boxGeometry args={[0.2, 0.03, 0.14]} />
          <meshStandardMaterial color="#e9e4dc" roughness={0.8} />
        </mesh>
      </group>
      <Armchair position={[loungeX + 0.95, 0, sofaZ + 0.85]} rotation={-Math.PI * 0.75} palette={palette} />
      {night && <pointLight position={[loungeX, 0.9, sofaZ + 0.5]} intensity={1.4} distance={3.2} color="#ffcf8a" />}

      {slabW > 7 && (
        <group position={[slabW / 2 - 0.55, 0, backZ + EXT_T + 0.38]}>
          <RoundedBox args={[0.62, 0.05, 0.62]} radius={0.02} position={[0, 0.025, 0]} receiveShadow>
            <meshStandardMaterial color="#27272a" roughness={0.6} />
          </RoundedBox>
          <RoundedBox args={[0.62, 0.06, 0.62]} radius={0.02} position={[0, 0.97, 0]} castShadow>
            <meshStandardMaterial color="#27272a" roughness={0.6} />
          </RoundedBox>
          <mesh position={[0, 0.5, 0]}>
            <boxGeometry args={[0.6, 0.9, 0.6]} />
            <meshPhysicalMaterial color="#cfe0ee" transparent opacity={0.22} roughness={0.05} clearcoat={1} depthWrite={false} />
          </mesh>
          <mesh position={[0, 0.5, -0.27]} castShadow>
            <boxGeometry args={[0.58, 0.9, 0.04]} />
            <meshStandardMaterial color="#6b5b95" roughness={0.95} />
          </mesh>
          <mesh position={[0, 0.4, -0.1]} castShadow>
            <boxGeometry args={[0.3, 0.03, 0.18]} />
            <meshStandardMaterial color={palette.wood} roughness={0.5} />
          </mesh>
        </group>
      )}
      <Plant position={[-slabW / 2 + 0.3, 0, backZ + EXT_T + 0.3]} scale={1.7} />
      <Plant position={[loungeX - 1.05, 0, sofaZ]} scale={1.3} />
    </group>
  );
}

interface CameraBase {
  position: Vector3;
  zoom: number;
}

/** Fits the whole floor into the canvas for any aspect ratio and records that framing as the rest pose. */
function FitCamera({ width, zMin, zMax, baseRef }: { width: number; zMin: number; zMax: number; baseRef: RefObject<CameraBase | null> }) {
  const getState = useThree((s) => s.get);
  const size = useThree((s) => s.size);
  useLayoutEffect(() => {
    const camera = getState().camera as OrthographicCamera;
    camera.position.copy(CAMERA_POSITION);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const inv = camera.matrixWorldInverse;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const hw = width / 2 + 0.2;
    for (const x of [-hw, hw]) {
      for (const y of [-0.25, EXT_H + 0.35]) {
        for (const z of [zMin - 0.2, zMax + 0.2]) {
          const v = new Vector3(x, y, z).applyMatrix4(inv);
          minX = Math.min(minX, v.x);
          maxX = Math.max(maxX, v.x);
          minY = Math.min(minY, v.y);
          maxY = Math.max(maxY, v.y);
        }
      }
    }
    const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    camera.position.addScaledVector(right, (minX + maxX) / 2).addScaledVector(up, (minY + maxY) / 2);
    camera.updateMatrixWorld();
    camera.zoom = Math.min(size.width / (maxX - minX), size.height / (maxY - minY)) * 0.94;
    camera.updateProjectionMatrix();
    baseRef.current = { position: camera.position.clone(), zoom: camera.zoom };
  }, [getState, size, width, zMin, zMax, baseRef]);
  return null;
}

const FOCUS_MS = 560;
const FOCUS_ZOOM = 2.1;

/** Flies the camera into the chosen room (pan + zoom from the rest pose) before navigating there. */
function FocusRig({ baseRef, target }: { baseRef: RefObject<CameraBase | null>; target: Vector3 | null }) {
  const progress = useRef(0);
  const invalidate = useThree((s) => s.invalidate);
  useFrame(({ camera }, delta) => {
    const rest = baseRef.current;
    if (!rest || !target) return;
    progress.current = Math.min(1, progress.current + (delta * 1000) / FOCUS_MS);
    const p = progress.current;
    const k = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    const ortho = camera as OrthographicCamera;
    ortho.position.copy(rest.position).add(new Vector3(target.x * k, 0, target.z * k));
    ortho.zoom = rest.zoom * (1 + (FOCUS_ZOOM - 1) * k);
    ortho.updateProjectionMatrix();
    if (p < 1) invalidate();
  });
  return null;
}

/** Gentle idle drift plus a pointer tilt (max ~6°); holds still while the camera flies into a room. */
function Sway({ frozen, children }: { frozen: boolean; children: ReactNode }) {
  const ref = useRef<Group>(null);
  useFrame(({ clock, pointer }) => {
    if (!ref.current || frozen) return;
    const target = Math.sin(clock.elapsedTime * 0.25) * 0.04 + pointer.x * 0.06;
    ref.current.rotation.y += (target - ref.current.rotation.y) * 0.05;
    ref.current.rotation.x += (pointer.y * -0.025 - ref.current.rotation.x) * 0.05;
  });
  return <group ref={ref}>{children}</group>;
}

function Scene({
  floor,
  palette,
  dark,
  sky,
  statusOf,
  shadows,
}: {
  floor: LiveFloor;
  palette: Palette;
  dark: boolean;
  sky: Sky;
  statusOf: (space: LiveSpace) => string;
  shadows: boolean;
}) {
  const router = useRouter();
  const [hovered, setHovered] = useState<string | null>(null);
  const [focus, setFocus] = useState<Vector3 | null>(null);
  const cameraBase = useRef<CameraBase | null>(null);
  const navTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(navTimer.current), []);
  const layout = useMemo(() => buildLayout(floor), [floor]);
  const open: OpenSpace = (slug, e) => {
    if (focus) return;
    const href = `/spaces/${slug}`;
    router.prefetch(href);
    setFocus(e.object.getWorldPosition(new Vector3()));
    navTimer.current = setTimeout(() => router.push(href), FOCUS_MS + 60);
  };
  const hover = (id: string | null) => {
    setHovered(id);
    const space = id ? floor.spaces.find((s) => s.id === id) : null;
    if (space) router.prefetch(`/spaces/${space.slug}`);
  };
  const night = sky.phase === 'night';
  const beam = dark || night ? 0.32 : 0.2;
  const deskSpace = floor.spaces.find((s) => s.type === 'hotDesk');
  const slabW = layout.width + 0.6;
  const workD = layout.depth + 0.6;
  const frontZ = 0.25 + workD / 2;
  const slabD = workD + LOUNGE_D;
  const backZ = frontZ - slabD;
  const slabZ = (frontZ + backZ) / 2;
  const floorRepeat = useMemo<[number, number]>(() => [slabW / 2.2, slabD / 2.2], [slabW, slabD]);
  const floorTexture = useFloorTexture(dark, floorRepeat);
  const extent = Math.max(slabW, slabD);

  return (
    <>
      <FitCamera width={slabW} zMin={backZ} zMax={frontZ} baseRef={cameraBase} />
      <FocusRig baseRef={cameraBase} target={focus} />
      <directionalLight
        position={[extent * sky.dir[0], extent * sky.dir[1], extent * sky.dir[2]]}
        intensity={palette.sun * sky.sun}
        color={sky.color}
        castShadow={shadows}
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-extent}
        shadow-camera-right={extent}
        shadow-camera-top={extent}
        shadow-camera-bottom={-extent}
        shadow-camera-near={0.5}
        shadow-camera-far={extent * 4}
      />
      <Sway frozen={focus !== null}>
        <ContactShadows position={[0, -0.25, slabZ]} scale={[slabW * 1.5, slabD * 1.5]} opacity={dark ? 0.6 : 0.32} blur={2.8} far={0.6} frames={1} resolution={512} />
        {sky.phase !== 'day' && (
          <Sparkles
            count={28}
            scale={[slabW * 0.9, 1.2, slabD * 0.9]}
            position={[0, 0.8, slabZ]}
            size={1.4}
            speed={0.15}
            opacity={0.35}
            color={night ? '#dbe4ff' : '#fff1d6'}
          />
        )}
        <RoundedBox args={[slabW, 0.24, slabD]} radius={0.06} position={[0, -0.12, slabZ]} receiveShadow castShadow>
          <meshStandardMaterial color={palette.slabSide} roughness={0.8} />
        </RoundedBox>
        <BuildingShell slabW={slabW} slabD={slabD} slabZ={slabZ} palette={palette} night={night} />
        <Lounge slabW={slabW} backZ={backZ} palette={palette} night={night} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, slabZ]} receiveShadow>
          <planeGeometry args={[slabW - 0.12, slabD - 0.12]} />
          <meshStandardMaterial map={floorTexture} color={palette.slab} roughness={dark ? 0.32 : 0.62} metalness={0} envMapIntensity={dark ? 1.2 : 0.6} />
        </mesh>
        {layout.deskZone && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[layout.deskZone.x, 0.006, layout.deskZone.z]} receiveShadow>
            <planeGeometry args={[layout.deskZone.w, layout.deskZone.d]} />
            <meshStandardMaterial color={palette.zone} roughness={1} />
          </mesh>
        )}
        {layout.deskZone && (
          <>
            <Plant position={[layout.deskZone.x - layout.deskZone.w / 2 + 0.25, 0, layout.deskZone.z - layout.deskZone.d / 2 + 0.25]} scale={1.5} />
            <Plant position={[layout.deskZone.x + layout.deskZone.w / 2 - 0.25, 0, layout.deskZone.z + layout.deskZone.d / 2 - 0.25]} scale={1.3} />
          </>
        )}
        {layout.deskZone && deskSpace && (
          <group position={[layout.deskZone.x, 0, layout.deskZone.z - layout.deskZone.d / 2]}>
            <Label title={deskSpace.name} status={statusOf(deskSpace)} available={layout.desks.some((d) => d.available)} y={1.1} theme={palette.label} />
          </group>
        )}
        {layout.desks.map((desk, i) => (
          <DeskUnit key={desk.key} desk={desk} order={i} palette={palette} onOpen={open} />
        ))}
        {layout.tiles.map((tile, i) => (
          <Room
            key={tile.space.id}
            tile={tile}
            order={layout.desks.length * 0.4 + i * 2}
            palette={palette}
            status={statusOf(tile.space)}
            hovered={hovered === tile.space.id}
            beam={beam}
            onHover={hover}
            onOpen={open}
          />
        ))}
      </Sway>
    </>
  );
}

/** Soft studio reflections from local light-formers: no HDR download, nothing for the CSP to allow. */
function StudioEnvironment({ intensity }: { intensity: number }) {
  return (
    <Environment resolution={128} frames={1} environmentIntensity={intensity}>
      <Lightformer form="rect" intensity={2.2} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[10, 10, 1]} />
      <Lightformer form="rect" intensity={1.2} position={[-6, 2, 3]} rotation-y={Math.PI / 2} scale={[8, 3, 1]} />
      <Lightformer form="rect" intensity={0.8} color="#c4b5fd" position={[6, 2, -3]} rotation-y={-Math.PI / 2} scale={[8, 3, 1]} />
    </Environment>
  );
}

const SKY_GRADIENT: Record<SkyPhase, { light: string; dark: string }> = {
  day: { light: 'linear-gradient(180deg,#cfe3f6 0%,#e9f1f8 45%,#f6f2ec 100%)', dark: 'linear-gradient(180deg,#141a26 0%,#1a1d27 55%,#121216 100%)' },
  golden: { light: 'linear-gradient(180deg,#f3c9a4 0%,#f6dcc6 40%,#efe6f2 100%)', dark: 'linear-gradient(180deg,#3a2433 0%,#2a2030 50%,#141216 100%)' },
  night: { light: 'linear-gradient(180deg,#0d1530 0%,#1c2350 55%,#2b2350 100%)', dark: 'linear-gradient(180deg,#070b1a 0%,#11163a 55%,#1b1638 100%)' },
};

/** Deterministic skyline so the backdrop never changes between renders. */
const SKYLINE = (() => {
  const rand = seededRandom(42);
  const towers: { x: number; w: number; h: number; lit: number[] }[] = [];
  for (let x = 0; x < 400; ) {
    const w = 10 + Math.floor(rand() * 18);
    const h = 18 + Math.floor(rand() * (rand() > 0.85 ? 70 : 38));
    const lit = Array.from({ length: Math.floor(h / 9) }, () => (rand() > 0.6 ? 1 : 0));
    towers.push({ x, w, h, lit });
    x += w + 1 + Math.floor(rand() * 3);
  }
  return towers;
})();

/** Sky for the real Israel time of day plus a soft city skyline, behind the transparent canvas. */
function SkyBackdrop({ phase, dark }: { phase: SkyPhase; dark: boolean }) {
  const night = phase === 'night';
  const tower = night ? '#0a1024' : dark ? '#20222c' : phase === 'golden' ? '#d9b9a8' : '#c9d6e3';
  return (
    <div className="absolute inset-0" style={{ background: SKY_GRADIENT[phase][dark ? 'dark' : 'light'] }} aria-hidden="true">
      <svg className="absolute inset-x-0 top-[6%] h-[30%] w-full opacity-60" viewBox="0 0 400 110" preserveAspectRatio="xMidYMax slice">
        {SKYLINE.map((t) => (
          <g key={t.x}>
            <rect x={t.x} y={110 - t.h} width={t.w} height={t.h} fill={tower} />
            {night &&
              t.lit.map((on, i) =>
                on ? <rect key={i} x={t.x + 3} y={110 - t.h + 4 + i * 9} width={t.w - 6} height={2} fill="#ffd89a" opacity={0.55} /> : null,
              )}
          </g>
        ))}
      </svg>
      <div
        className={clsx(
          'absolute inset-x-0 bottom-0 top-[36%]',
          dark || night ? 'bg-gradient-to-b from-[#1b1d26] to-[#101116]' : 'bg-gradient-to-b from-[#e7e2da] to-[#f4f1ec]',
        )}
      />
    </div>
  );
}

/** Small designed indicator while the furniture kit decodes; the room layout is already on screen behind it. */
function KitProgress() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2 rounded-full border border-border bg-bg/85 px-3 py-1.5 text-2xs text-muted shadow-sm backdrop-blur" role="status">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden="true" />
      טוען ריהוט תלת־ממדי… {Math.round(progress)}%
    </div>
  );
}

export default function FloorMap3D({ floor, statusOf }: { floor: LiveFloor; statusOf: (space: LiveSpace) => string }) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  const palette = PALETTES[dark ? 'dark' : 'light'];
  const sky = useIsraelSky();
  const SkyIcon = SKY_COPY[sky.phase].Icon;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const labelLayerRef = useRef<HTMLDivElement>(null!);
  const branchSlug = floor.branch.slug;
  /** One intro per branch: switching branches rebuilds the floor with a fresh drop-in. */
  const introStart = useMemo(() => {
    let start: number | null = null;
    void branchSlug;
    return (now: number) => (start ??= now);
  }, [branchSlug]);
  const [onScreen, setOnScreen] = useState(true);
  const [highQuality, setHighQuality] = useState(true);
  const [animating, setAnimating] = useState(true);
  const [introBranch, setIntroBranch] = useState(branchSlug);
  if (introBranch !== branchSlug) {
    setIntroBranch(branchSlug);
    setAnimating(true);
  }
  const restTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const restSoon = useCallback((ms: number) => {
    clearTimeout(restTimer.current);
    restTimer.current = setTimeout(() => setAnimating(false), ms);
  }, []);

  useEffect(() => {
    restSoon(INTRO_ACTIVE_MS);
    return () => clearTimeout(restTimer.current);
  }, [restSoon, branchSlug]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(Boolean(entry?.isIntersecting)), { rootMargin: '100px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={wrapperRef}
      className="absolute inset-0"
      onPointerEnter={() => {
        clearTimeout(restTimer.current);
        setAnimating(true);
      }}
      onPointerLeave={() => restSoon(HOVER_LINGER_MS)}
    >
      <SkyBackdrop phase={sky.phase} dark={dark} />
      <Canvas
        orthographic
        shadows="soft"
        frameloop={!onScreen ? 'never' : animating ? 'always' : 'demand'}
        camera={{ position: CAMERA_POSITION.toArray(), zoom: 40, near: 0.1, far: 100 }}
        dpr={highQuality ? [1, 2] : [1, 1.25]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        className="!absolute inset-0"
      >
        <PerformanceMonitor onDecline={() => setHighQuality(false)} flipflops={2} onFallback={() => setHighQuality(false)} />
        <hemisphereLight args={[dark || sky.phase === 'night' ? '#c4b5fd' : '#ffffff', dark ? '#0a0a0a' : '#d6d3d1', palette.hemi * sky.hemi]} />
        <StudioEnvironment intensity={palette.envIntensity * sky.env} />
        <IntroClock.Provider value={introStart}>
          <LabelLayer.Provider value={labelLayerRef}>
            <Suspense fallback={<Scene floor={floor} palette={palette} dark={dark} sky={sky} statusOf={statusOf} shadows={highQuality} />}>
              <KitProvider>
                <Scene floor={floor} palette={palette} dark={dark} sky={sky} statusOf={statusOf} shadows={highQuality} />
              </KitProvider>
            </Suspense>
          </LabelLayer.Provider>
        </IntroClock.Provider>
      </Canvas>
      <div ref={labelLayerRef} className="pointer-events-none absolute inset-0 overflow-hidden" />
      <p className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-full border border-border bg-bg/80 px-2.5 py-1 text-2xs text-muted shadow-sm backdrop-blur">
        <SkyIcon className="h-3.5 w-3.5 text-accent-text" aria-hidden="true" />
        {formatMinutes(sky.minutes)} · {SKY_COPY[sky.phase].label} בישראל
      </p>
      <KitProgress />
    </div>
  );
}

useGLTF.preload(OFFICE_KIT_URL, DRACO_DECODER_PATH);
useGLTF.preload(DESK_LITE_URL, DRACO_DECODER_PATH);
