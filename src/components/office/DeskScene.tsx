'use client';

import { ContactShadows, Environment, Sparkles, useGLTF, useTexture } from '@react-three/drei';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, type RefObject } from 'react';
import {
  CanvasTexture,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
  type DirectionalLight,
  type PointLight,
  type Texture,
} from 'three';
import { DESK_URL, DRACO_PATH, drawDeskScreen, prepareDesk } from '@/components/three/desk-model';

const HDRI_URL = '/hdri/small-empty-room.hdr';
const CONCRETE = ['/textures/concrete-diff.webp', '/textures/concrete-rough.webp'];

/** Room interior in metres; the glass front with the door is at z1, the window is in the x0 wall. */
const ROOM = { x0: -2.6, x1: 2.6, z0: -2.3, z1: 2.1, h: 2.9 };
const WALL = 0.1;
const DOOR = { x0: 0.9, x1: 1.9, h: 2.2 };
const WINDOW = { z0: -1.3, z1: 0.7, y0: 0.85, y1: 2.35 };
const DESK_Z = -1.05;
/** Walkable keep-out around the desk and chair (world space). */
const DESK_KEEP_OUT = { halfX: 1.45, front: 0.1 };
const EYE = 1.6;
const WALK_SPEED = 1.5;

const DESK_FOCUS = new Vector3(0, 1, DESK_Z);
const OUTSIDE = new Vector3(1.4, EYE, 4.6);
const DOOR_OUT = new Vector3(1.4, EYE, ROOM.z1 + 0.7);
const DOOR_IN = new Vector3(1.4, EYE, ROOM.z1 - 0.6);
const STAND = new Vector3(1.55, EYE, 0.75);

const yawToward = (from: Vector3, to: Vector3) => Math.atan2(-(to.x - from.x), -(to.z - from.z));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function clampWalkable(v: Vector3): Vector3 {
  v.x = clamp(v.x, ROOM.x0 + 0.35, ROOM.x1 - 0.35);
  v.z = clamp(v.z, ROOM.z0 + 0.35, ROOM.z1 - 0.35);
  if (Math.abs(v.x) < DESK_KEEP_OUT.halfX && v.z < DESK_KEEP_OUT.front) v.z = DESK_KEEP_OUT.front;
  v.y = EYE;
  return v;
}

function Desk() {
  const { scene } = useGLTF(DESK_URL, DRACO_PATH);
  const screen = useMemo(() => drawDeskScreen(), []);
  const model = useMemo(() => prepareDesk(scene, screen), [scene, screen]);
  useEffect(() => () => screen.dispose(), [screen]);
  // The model's working side faces -Z; turn it so the chair faces into the room.
  return <primitive object={model} position-z={DESK_Z} rotation-y={Math.PI} />;
}

function useCanvasTexture(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, w: number, h: number) {
  const tex = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    draw(canvas.getContext('2d')!, w, h);
    const t = new CanvasTexture(canvas);
    t.colorSpace = SRGBColorSpace;
    return t;
  }, [draw, w, h]);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

function drawSkyline(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#8fb8e8');
  sky.addColorStop(0.62, '#dcd9e6');
  sky.addColorStop(1, '#f3dcc0');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  const rnd = seededRandom(7);
  for (const [tone, base, maxH] of [
    ['rgba(150,165,190,0.55)', 0.7, 0.45],
    ['rgba(110,120,145,0.75)', 0.82, 0.38],
  ] as const) {
    ctx.fillStyle = tone;
    for (let x = 0; x < w; ) {
      const bw = 30 + rnd() * 70;
      const bh = h * (0.08 + rnd() * maxH);
      ctx.fillRect(x, h * base - bh, bw, bh + h);
      x += bw + rnd() * 10;
    }
  }
}

function drawDoorSign(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = '#18141f';
  ctx.fillRect(0, 0, w, h);
  const font = getComputedStyle(document.body).fontFamily || 'sans-serif';
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 54px ${font}`;
  ctx.fillText('משרד פרטי', w / 2, h / 2 + 18);
  ctx.fillStyle = '#a78bfa';
  ctx.fillRect(w * 0.3, h - 14, w * 0.4, 5);
}

function useRepeated(textures: Texture[], repeat: [number, number]) {
  return useMemo(
    () =>
      textures.map((t, i) => {
        const c = t.clone();
        c.wrapS = c.wrapT = RepeatWrapping;
        c.repeat.set(...repeat);
        if (i === 0) c.colorSpace = SRGBColorSpace;
        c.needsUpdate = true;
        return c;
      }),
    [textures, repeat],
  );
}

const WALL_REPEAT: [number, number] = [2.2, 1.2];

type Box = { p: [number, number, number]; s: [number, number, number] };

function ConcreteBoxes({ boxes, diff, rough }: { boxes: Box[]; diff: Texture; rough: Texture }) {
  return (
    <>
      {boxes.map((b, i) => (
        <mesh key={i} position={b.p} castShadow receiveShadow>
          <boxGeometry args={b.s} />
          <meshStandardMaterial map={diff} roughnessMap={rough} color="#ddd7cf" />
        </mesh>
      ))}
    </>
  );
}

function Room() {
  const textures = useTexture(CONCRETE);
  const [diff, rough] = useRepeated(textures, WALL_REPEAT);
  const sky = useCanvasTexture(drawSkyline, 1024, 512);
  const sign = useCanvasTexture(drawDoorSign, 512, 128);

  const { x0, x1, z0, z1, h } = ROOM;
  const width = x1 - x0;
  const depth = z1 - z0;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;

  const walls: Box[] = [
    { p: [cx, h / 2, z0 - WALL / 2], s: [width + WALL * 2, h, WALL] },
    { p: [x1 + WALL / 2, h / 2, cz], s: [WALL, h, depth] },
    // Window wall: below, above, and either side of the opening.
    { p: [x0 - WALL / 2, WINDOW.y0 / 2, cz], s: [WALL, WINDOW.y0, depth] },
    { p: [x0 - WALL / 2, (WINDOW.y1 + h) / 2, cz], s: [WALL, h - WINDOW.y1, depth] },
    { p: [x0 - WALL / 2, h / 2, (z0 + WINDOW.z0) / 2], s: [WALL, h, WINDOW.z0 - z0] },
    { p: [x0 - WALL / 2, h / 2, (WINDOW.z1 + z1) / 2], s: [WALL, h, z1 - WINDOW.z1] },
  ];

  const glass: Box[] = [
    { p: [(x0 + DOOR.x0) / 2, h / 2, z1], s: [DOOR.x0 - x0, h, 0.02] },
    { p: [(DOOR.x1 + x1) / 2, h / 2, z1], s: [x1 - DOOR.x1, h, 0.02] },
    { p: [(DOOR.x0 + DOOR.x1) / 2, (DOOR.h + h) / 2, z1], s: [DOOR.x1 - DOOR.x0, h - DOOR.h, 0.02] },
  ];
  const frames: Box[] = [
    ...[x0, -0.9, DOOR.x0, DOOR.x1, x1].map((x): Box => ({ p: [x, h / 2, z1], s: [0.05, h, 0.07] })),
    { p: [cx, h - 0.025, z1], s: [width, 0.05, 0.07] },
    { p: [cx, 0.025, z1], s: [width, 0.05, 0.07] },
    { p: [(DOOR.x0 + DOOR.x1) / 2, DOOR.h, z1], s: [DOOR.x1 - DOOR.x0, 0.05, 0.07] },
  ];
  const frostY = 1.15;

  return (
    <group>
      <ConcreteBoxes boxes={walls} diff={diff} rough={rough} />

      {/* Floor: room, corridor, rug. */}
      <mesh rotation-x={-Math.PI / 2} position={[cx, 0, cz]} receiveShadow>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color="#a3968a" roughness={0.38} metalness={0.05} envMapIntensity={0.9} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[cx, -0.001, z1 + 2.1]} receiveShadow>
        <planeGeometry args={[width + WALL * 2, 4.2]} />
        <meshStandardMaterial color="#2c2826" roughness={0.5} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.003, DESK_Z + 0.35]} receiveShadow>
        <planeGeometry args={[3.4, 2.6]} />
        <meshStandardMaterial color="#4b4559" roughness={0.95} />
      </mesh>

      {/* Ceiling as a thin slab so it blocks the sun from above. */}
      <mesh position={[cx, h + 0.05, cz]} castShadow receiveShadow>
        <boxGeometry args={[width + WALL * 2, 0.1, depth + WALL]} />
        <meshStandardMaterial color="#ebe7e1" roughness={0.9} />
      </mesh>

      {/* Window: glass plus a skyline backdrop outside. */}
      <mesh position={[x0 - WALL / 2, (WINDOW.y0 + WINDOW.y1) / 2, (WINDOW.z0 + WINDOW.z1) / 2]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[WINDOW.z1 - WINDOW.z0, WINDOW.y1 - WINDOW.y0]} />
        <meshStandardMaterial color="#cfe3ff" transparent opacity={0.08} roughness={0.05} metalness={0.2} />
      </mesh>
      <mesh position={[x0 - 3.5, 1.7, -0.3]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[12, 6]} />
        <meshBasicMaterial map={sky} toneMapped={false} />
      </mesh>

      {/* Glass front with the doorway, black mullions and a frosted privacy band. */}
      {glass.map((b, i) => (
        <mesh key={`g${i}`} position={b.p}>
          <boxGeometry args={b.s} />
          <meshStandardMaterial color="#d8e6f2" transparent opacity={0.12} roughness={0.04} metalness={0.3} depthWrite={false} />
        </mesh>
      ))}
      {[[(x0 + DOOR.x0) / 2, DOOR.x0 - x0] as const, [(DOOR.x1 + x1) / 2, x1 - DOOR.x1] as const].map(([x, w], i) => (
        <mesh key={`f${i}`} position={[x, frostY, z1 + 0.012]}>
          <planeGeometry args={[w, 0.32]} />
          <meshStandardMaterial color="#ffffff" transparent opacity={0.55} roughness={0.8} depthWrite={false} />
        </mesh>
      ))}
      {frames.map((b, i) => (
        <mesh key={`m${i}`} position={b.p} castShadow>
          <boxGeometry args={b.s} />
          <meshStandardMaterial color="#141217" roughness={0.45} metalness={0.6} />
        </mesh>
      ))}
      <mesh position={[DOOR.x1 + 0.32, 1.55, z1 + 0.04]}>
        <planeGeometry args={[0.44, 0.11]} />
        <meshStandardMaterial map={sign} emissiveMap={sign} emissive="#ffffff" emissiveIntensity={0.35} />
      </mesh>

      {/* Corridor walls and ceiling so the view out of the door, and past the room, isn't a void. */}
      {[x0 - WALL, x1 + WALL].map((x, i) => (
        <mesh key={x} position={[x, h / 2, z1 + 2.1]} rotation-y={i === 0 ? Math.PI / 2 : -Math.PI / 2} receiveShadow>
          <planeGeometry args={[4.2, h]} />
          <meshStandardMaterial map={diff} roughnessMap={rough} color="#8d867e" />
        </mesh>
      ))}
      <mesh position={[cx, h + 0.05, z1 + 2.1]} receiveShadow>
        <boxGeometry args={[width + WALL * 2, 0.1, 4.2]} />
        <meshStandardMaterial color="#3a3634" roughness={0.9} />
      </mesh>
      <mesh position={[cx, h / 2, z1 + 4.2]} rotation-y={Math.PI} receiveShadow>
        <planeGeometry args={[width + WALL * 2, h]} />
        <meshStandardMaterial map={diff} roughnessMap={rough} color="#8d867e" />
      </mesh>

      <Shelf />
      <Plant position={[x0 + 0.45, 0, z0 + 0.45]} />
      <Plant position={[x1 - 0.45, 0, z1 - 0.45]} scale={0.8} />
      <Pendant x={-0.5} />
      <Pendant x={0.5} />
    </group>
  );
}

const BOOK_COLORS = ['#6d28d9', '#e4d6bd', '#1f2937', '#a78bfa', '#b45309', '#f5f5f4', '#334155'];

function Shelf() {
  const x = ROOM.x1 - 0.2;
  const books = useMemo(() => {
    const out: { y: number; z: number; w: number; hgt: number; c: string }[] = [];
    const rnd = seededRandom(3);
    for (const y of [0.42, 0.92, 1.42]) {
      for (let z = -0.55; z < 0.5; ) {
        const w = 0.03 + rnd() * 0.035;
        if (rnd() > 0.18) out.push({ y, z: z + w / 2, w, hgt: 0.2 + rnd() * 0.12, c: BOOK_COLORS[Math.floor(rnd() * BOOK_COLORS.length)]! });
        z += w + 0.004;
      }
    }
    return out;
  }, []);
  return (
    <group position={[x, 0, -1.1]}>
      {[0.02, 0.4, 0.9, 1.4, 1.9].map((y) => (
        <mesh key={y} position={[0, y, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.32, 0.03, 1.2]} />
          <meshStandardMaterial color="#c8b59a" roughness={0.7} />
        </mesh>
      ))}
      {[-0.6, 0.6].map((z) => (
        <mesh key={z} position={[0, 0.96, z]} castShadow>
          <boxGeometry args={[0.32, 1.92, 0.03]} />
          <meshStandardMaterial color="#b9a589" roughness={0.7} />
        </mesh>
      ))}
      {books.map((b, i) => (
        <mesh key={i} position={[0.02, b.y + 0.015 + b.hgt / 2, b.z]} castShadow>
          <boxGeometry args={[0.2, b.hgt, b.w]} />
          <meshStandardMaterial color={b.c} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function Plant({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  const leaves = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => {
        const a = (i / 9) * Math.PI * 2;
        const r = 0.12 + (i % 3) * 0.05;
        return { p: [Math.cos(a) * r, 0.75 + (i % 4) * 0.13, Math.sin(a) * r] as [number, number, number], s: 0.16 + (i % 3) * 0.03 };
      }),
    [],
  );
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.22, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.2, 0.16, 0.44, 24]} />
        <meshStandardMaterial color="#e7e2da" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.015, 0.02, 0.5, 6]} />
        <meshStandardMaterial color="#4a3a28" />
      </mesh>
      {leaves.map((l, i) => (
        <mesh key={i} position={l.p} scale={[l.s, l.s * 0.75, l.s]} castShadow>
          <icosahedronGeometry args={[1, 1]} />
          <meshStandardMaterial color={i % 2 ? '#3f7d4a' : '#2f6a3c'} roughness={0.75} flatShading />
        </mesh>
      ))}
    </group>
  );
}

function Pendant({ x }: { x: number }) {
  const y = ROOM.h - 0.75;
  const z = DESK_Z + 0.1;
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, (ROOM.h + y) / 2, 0]}>
        <cylinderGeometry args={[0.004, 0.004, ROOM.h - y, 4]} />
        <meshStandardMaterial color="#111" />
      </mesh>
      <mesh position={[0, y, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.17, 0.2, 32, 1, true]} />
        <meshStandardMaterial color="#141217" roughness={0.4} metalness={0.7} side={2} />
      </mesh>
      <mesh position={[0, y - 0.09, 0]} rotation-x={Math.PI / 2}>
        <circleGeometry args={[0.15, 32]} />
        <meshStandardMaterial color="#fff2d6" emissive="#ffe4b0" emissiveIntensity={2.4} side={2} />
      </mesh>
      <pointLight position={[0, y - 0.2, 0]} color="#ffe2b4" intensity={2.4} distance={5} decay={2} />
    </group>
  );
}

/** Low sun through the window, drifting slowly so the light patch moves; plus the monitor's cool spill. */
function LiveLights() {
  const sun = useRef<DirectionalLight>(null);
  const glow = useRef<PointLight>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (sun.current) sun.current.position.set(-6, 6.2 + Math.sin(t * 0.07) * 0.3, -0.2 + Math.sin(t * 0.05) * 0.9);
    if (glow.current) glow.current.intensity = 0.9 + Math.sin(t * 1.3) * 0.08;
  });
  return (
    <>
      <directionalLight
        ref={sun}
        castShadow
        intensity={5}
        color="#ffe9cc"
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-4}
        shadow-camera-right={4}
        shadow-camera-top={4}
        shadow-camera-bottom={-4}
        shadow-camera-near={0.5}
        shadow-camera-far={18}
      />
      <pointLight ref={glow} position={[0, 1.05, DESK_Z - 0.25]} color="#8b7cff" distance={1.6} decay={2} />
    </>
  );
}

type Nav = {
  pos: Vector3;
  path: Vector3[];
  yaw: number;
  pitch: number;
  yawGoal: number | null;
  keys: Set<string>;
  inside: boolean;
  snap: boolean;
};

const MOVE_KEYS = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/** Drag-to-look on the canvas and WASD/arrow keys (inside only). Returns the unbind function. */
function bindLookControls(el: HTMLElement, nav: RefObject<Nav>): () => void {
  el.style.touchAction = 'none';
  let drag: { id: number; x: number; y: number } | null = null;
  const down = (e: PointerEvent) => {
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const move = (e: PointerEvent) => {
    if (!drag || drag.id !== e.pointerId) return;
    const n = nav.current;
    n.yaw += (e.clientX - drag.x) * 0.0035;
    n.pitch = clamp(n.pitch + (e.clientY - drag.y) * 0.0035, -0.9, 0.7);
    n.yawGoal = null;
    drag.x = e.clientX;
    drag.y = e.clientY;
  };
  const up = () => {
    drag = null;
  };
  const keyDown = (e: KeyboardEvent) => {
    if (!nav.current.inside || isTyping(e.target)) return;
    const k = e.key.toLowerCase();
    if (!MOVE_KEYS.includes(k)) return;
    nav.current.keys.add(k);
    if (k.startsWith('arrow')) e.preventDefault();
  };
  const keyUp = (e: KeyboardEvent) => {
    nav.current.keys.delete(e.key.toLowerCase());
  };
  const blur = () => nav.current.keys.clear();
  const win: [string, EventListener][] = [
    ['pointermove', move as EventListener],
    ['pointerup', up],
    ['pointercancel', up],
    ['keydown', keyDown as EventListener],
    ['keyup', keyUp as EventListener],
    ['blur', blur],
  ];
  el.addEventListener('pointerdown', down);
  win.forEach(([t, fn]) => window.addEventListener(t, fn));
  return () => {
    el.removeEventListener('pointerdown', down);
    win.forEach(([t, fn]) => window.removeEventListener(t, fn));
  };
}

/**
 * First-person camera: walks through the doorway on enter/leave, drag to look,
 * click the floor or use WASD/arrows to move while inside.
 */
function Rig({ inside }: { inside: boolean }) {
  const el = useThree((s) => s.gl.domElement);
  const nav = useRef<Nav>({
    pos: OUTSIDE.clone(),
    path: [],
    yaw: yawToward(OUTSIDE, DESK_FOCUS),
    pitch: -0.12,
    yawGoal: null,
    keys: new Set(),
    inside,
    snap: true,
  });
  const first = useRef(true);
  const tmp = useMemo(() => new Vector3(), []);

  useEffect(() => bindLookControls(el, nav), [el]);

  useEffect(() => {
    const n = nav.current;
    n.inside = inside;
    if (first.current) {
      first.current = false;
      return;
    }
    const route = inside ? [DOOR_OUT, DOOR_IN, STAND] : [DOOR_IN, DOOR_OUT, OUTSIDE];
    const end = route[route.length - 1]!;
    n.yawGoal = yawToward(end, DESK_FOCUS);
    n.keys.clear();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      n.pos.copy(end);
      n.path = [];
      n.snap = true;
    } else {
      n.path = route.map((v) => v.clone());
    }
  }, [inside]);

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1);
    const n = nav.current;
    const p = n.pos;
    const k = n.keys;

    if (n.inside && k.size > 0) {
      n.path = [];
      const fwd = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
      const side = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
      const s = Math.sin(n.yaw);
      const c = Math.cos(n.yaw);
      tmp.set(-s * fwd + c * side, 0, -c * fwd - s * side);
      if (tmp.lengthSq() > 0) p.addScaledVector(tmp.normalize(), WALK_SPEED * delta);
      clampWalkable(p);
    } else if (n.path.length > 0) {
      const target = n.path[0]!;
      tmp.subVectors(target, p);
      const dist = tmp.length();
      const step = WALK_SPEED * delta;
      if (dist <= step) {
        p.copy(target);
        n.path.shift();
      } else {
        p.addScaledVector(tmp, step / dist);
      }
    }

    if (n.yawGoal !== null) {
      let d = n.yawGoal - n.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      n.yaw += d * Math.min(1, delta * 2.2);
      n.pitch += (-0.12 - n.pitch) * Math.min(1, delta * 2.2);
      if (Math.abs(d) < 0.002) n.yawGoal = null;
    }

    const cam = state.camera;
    cam.rotation.order = 'YXZ';
    if (n.snap) {
      cam.position.copy(p);
      n.snap = false;
    } else {
      cam.position.lerp(p, 1 - Math.exp(-delta * 8));
    }
    cam.rotation.set(n.pitch, n.yaw, 0);
  });

  const onFloorClick = (e: ThreeEvent<MouseEvent>) => {
    const n = nav.current;
    if (!n.inside || e.delta > 6) return;
    n.keys.clear();
    n.path = [clampWalkable(e.point.clone())];
  };

  const { x0, x1, z0, z1 } = ROOM;
  return (
    <mesh rotation-x={-Math.PI / 2} position={[(x0 + x1) / 2, 0.01, (z0 + z1) / 2]} onClick={onFloorClick}>
      <planeGeometry args={[x1 - x0, z1 - z0]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

function Ready({ onReady }: { onReady: () => void }) {
  useEffect(() => onReady(), [onReady]);
  return null;
}

export default function DeskScene({ active, inside, onReady }: { active: boolean; inside: boolean; onReady: () => void }) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      frameloop={active ? 'always' : 'never'}
      camera={{ position: OUTSIDE.toArray(), fov: 62, near: 0.05, far: 40 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
    >
      <color attach="background" args={['#0f0d12']} />
      <fog attach="fog" args={['#0f0d12', 7, 14]} />
      <Suspense fallback={null}>
        <Environment files={HDRI_URL} environmentIntensity={0.85} />
        <LiveLights />
        <Desk />
        <Room />
        <ContactShadows position={[0, 0.005, DESK_Z]} scale={3.4} blur={2.4} far={1.2} opacity={0.5} frames={1} />
        <Sparkles count={60} scale={[1.8, 1.4, 2]} position={[-1.5, 1.2, -0.3]} size={1.6} speed={0.15} opacity={0.45} color="#ffe2b8" />
        <Ready onReady={onReady} />
      </Suspense>
      <Rig inside={inside} />
    </Canvas>
  );
}

useGLTF.preload(DESK_URL, DRACO_PATH);
