'use client';

import { Environment, Html, Lightformer, OrbitControls, PerformanceMonitor, useGLTF } from '@react-three/drei';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdditiveBlending, CanvasTexture, Color, type Group, MeshBasicMaterial, MeshStandardMaterial, type PerspectiveCamera, type PointLight, SRGBColorSpace, Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { BUILDING_URL, CLEAR_HEIGHT, FLOOR_COUNT, PLATE, PROGRAM_COPY, ROOF_Y, floorY, prepareBuilding, programOf } from '@/components/three/building-model';
import { DRACO_PATH } from '@/components/three/desk-model';
import { KIT_URL } from '@/components/three/kit-model';
import { Atmosphere } from './atmosphere';
import { City, GOBLIN_URL, NEIGHBOUR_AT, SIGNS_URL, TRAFFIC_A_URL, fadeByDay } from './city';
import { REVUELTO_LITE_URL } from './streets';
import { ELEVATOR_URL, Entrance, EntranceLights, FloorLift, FloorLiftLight, FOUNTAIN_URL, HERO_CAR_URL, PLANTS_URL, RECEPTION_URL, TREE_URL, WAITING_URL } from './entrance';
import { EXEC_URL, Furnishing, Interior, LOUNGE_URL, MEET_URL } from './interior';
import { buildLayout, type Layout } from './layout';
import { NycBlocks, NycTower, liftOverNyc } from './nyc';
import { RES_LOBBY_URL, RES_LOFT_URL, RESIDENCE_READY, Residence, ResidenceEntrance, ResidenceLights, homeZone } from './residence';
import { Prewarmed } from './prewarm';
import { CLIP, CLIP_PLANES, CUT, WALK } from './shared';
import { SKY, applyDayTints, dayTint, type SkyMode } from './sky';
import { WalkRig } from './walk';
import type { SpaceOffer } from './offers';

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

/** Violet LED crown, corner strips, the rooftop sign and two sweeping searchlights. */
function Crown() {
  const sign = useMemo(() => drawSign(), []);
  useEffect(() => () => sign.dispose(), [sign]);
  const beams = useRef<Group>(null);
  const beamMat = useMemo(
    () => new MeshBasicMaterial({ color: '#b9a8ff', transparent: true, opacity: 0.07, blending: AdditiveBlending, depthWrite: false, side: 2, fog: false, clippingPlanes: CLIP_PLANES }),
    [],
  );
  useEffect(() => () => beamMat.dispose(), [beamMat]);
  useFrame(({ clock }) => {
    fadeByDay(beamMat, 1);
    const g = beams.current;
    if (!g) return;
    g.visible = SKY.day < 0.95;
    g.children.forEach((b, i) => {
      b.rotation.z = Math.sin(clock.elapsedTime * 0.35 + i * 2.1) * 0.45;
      b.rotation.x = Math.cos(clock.elapsedTime * 0.27 + i * 1.3) * 0.3;
    });
  });
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
      <group ref={beams}>
        {[-24, 24].map((bx) => (
          <group key={bx} position={[bx, ROOF_Y + 0.5, 0]}>
            <mesh position={[0, 90, 0]} material={beamMat}>
              <cylinderGeometry args={[6, 0.6, 180, 24, 1, true]} />
            </mesh>
          </group>
        ))}
      </group>
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

/**
 * Opens the chosen floor's facade with a short vertical wipe and hides the floors above it.
 * While walking, once the camera is inside, the facade closes and the floors above grow back.
 */
function CutawayAnimator({ selected, walking }: { selected: number | null; walking: boolean }) {
  const wasWalking = useRef(false);
  useFrame((_, delta) => {
    const k = Math.min(1, delta * 4);
    if (wasWalking.current && !walking && selected !== null) CLIP.constant = floorY(selected) + CLEAR_HEIGHT - 0.35;
    wasWalking.current = walking;
    const clipped = selected !== null && !walking;
    const open = selected !== null && !(walking && WALK.inside);
    const clipGoal = clipped && selected !== null ? floorY(selected) + CLEAR_HEIGHT - 0.35 : ROOF_Y + 12;
    if (CLIP.constant > ROOF_Y + 12) CLIP.constant = ROOF_Y + 12;
    CLIP.constant += (clipGoal - CLIP.constant) * Math.min(1, delta * 2.6);
    if (!clipped && CLIP.constant > ROOF_Y + 11.9) CLIP.constant = 1e4;
    if (!open || selected === null) {
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
/** From the south-east, above the New York blocks' roofs and south of the neighbouring tower. */
const OVERVIEW_DIR = new Vector3(0.7, 0.33, 0.65).normalize();

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

const ORBIT_FOV = 32;
const ORBIT_NEAR = 0.5;

/** Orbit camera that flies between the overview and a floor; idles with a slow turn around the tower. */
function CameraRig({ selected, walking }: { selected: number | null; walking: boolean }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const fly = useRef({ active: true, snap: true, touched: false });
  const goalPos = useMemo(() => new Vector3(), []);
  const goalTarget = useMemo(() => new Vector3(), []);

  useEffect(() => {
    fly.current.active = true;
  }, [selected, walking]);

  useFrame((state, delta) => {
    const c = controls.current;
    if (!c) return;
    if (walking) {
      c.enabled = false;
      c.autoRotate = false;
      return;
    }
    const lens = state.camera as PerspectiveCamera;
    if (lens.fov !== ORBIT_FOV || lens.near !== ORBIT_NEAR) {
      lens.fov = Math.abs(lens.fov - ORBIT_FOV) < 0.1 ? ORBIT_FOV : lens.fov + (ORBIT_FOV - lens.fov) * Math.min(1, delta * 3);
      lens.near = ORBIT_NEAR;
      lens.updateProjectionMatrix();
    }
    const f = fly.current;
    c.autoRotate = selected === null && !f.touched && !f.active;
    if (!f.active) {
      liftOverNyc(state.camera.position);
      return;
    }
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

function setGlassOpacity(m: { opacity: number } | null, opacity: number) {
  if (m) m.opacity = opacity;
}

const NIGHT_GLOW = new Color('#ffc987');

/** After dark the facade glows warm, a lit office tower that stands out from the city around it. */
function setNightGlow(m: unknown, k: number) {
  if (!(m instanceof MeshStandardMaterial)) return;
  m.emissive.copy(NIGHT_GLOW);
  m.emissiveIntensity = k;
}

function Building({ selected, layout }: { selected: number | null; layout: Layout }) {
  const { scene } = useGLTF(BUILDING_URL, DRACO_PATH);
  const parts = useMemo(() => prepareBuilding(scene, CUT, CLIP_PLANES), [scene]);
  const glassTint = useMemo(() => (parts.facadeGlass ? [dayTint(parts.facadeGlass, '#2b4360', '#6f8fb3')] : []), [parts]);
  useFrame(() => {
    applyDayTints(glassTint);
    setGlassOpacity(parts.facadeGlass, WALK.inside ? 0.2 : 0.2 + 0.4 * SKY.day);
    setNightGlow(parts.facadeGlass, WALK.inside ? 0 : 0.42 * (1 - SKY.day));
  });
  return (
    <group>
      <primitive object={parts.root} />
      <Interior layout={layout} selected={selected} exec={parts.exec} />
      {selected !== null && (
        <Suspense fallback={null}>
          <Prewarmed>
            <Furnishing selected={selected} layout={layout} builtDesk={parts.desk} />
          </Prewarmed>
        </Suspense>
      )}
    </group>
  );
}

/** Street level: cars, signs, the entrance and the lobby. */
const streetModels = (lite: boolean) => [TRAFFIC_A_URL, GOBLIN_URL, lite ? REVUELTO_LITE_URL : HERO_CAR_URL, SIGNS_URL, TREE_URL, FOUNTAIN_URL, PLANTS_URL, RECEPTION_URL, WAITING_URL, ELEVATOR_URL, LOUNGE_URL];
/** Furniture for an open floor. */
const FLOOR_MODELS = [KIT_URL, EXEC_URL, MEET_URL];

/** Fetches and decodes models ahead of need, once the tower itself is on screen. */
function preload(...lists: string[][]) {
  for (const url of lists.flat()) useGLTF.preload(url, DRACO_PATH);
}

/** The residence lobby and its lift, wanted the moment someone heads for the residence. */
const RESIDENCE_MODELS = [RES_LOBBY_URL, ELEVATOR_URL, LOUNGE_URL, RECEPTION_URL];

export default function BuildingScene({
  active,
  selected,
  walking,
  onSelect,
  onReady,
  onElevator,
  skyMode,
  rideTo,
  home,
  homeRideTo,
  lite,
  offers,
}: {
  active: boolean;
  selected: number | null;
  walking: boolean;
  onSelect: (i: number) => void;
  onReady: () => void;
  onElevator: (at: boolean) => void;
  skyMode: SkyMode;
  /** The floor a ride is heading to, so its cabin is already standing when you arrive. */
  rideTo: number | null;
  /** In the residence next door: 0 its lobby, 1–8 an apartment; 
ull elsewhere. */
  home: number | null;
  homeRideTo: number | null;
  /** Phones and low-memory devices: lighter scenery, and street detail only once walking. */
  lite: boolean;
  /** Live "from" prices for the sales screens in the lobbies. */
  offers: SpaceOffer[];
}) {
  const layout = useMemo(() => buildLayout(), []);
  const [shown, setShown] = useState(false);
  const ready = useCallback(() => {
    setShown(true);
    onReady();
  }, [onReady]);
  const inHome = walking && home !== null;
  const [warm, setWarm] = useState(false);
  const [warmStreet, setWarmStreet] = useState(!lite);
  useEffect(() => {
    if (!shown) return;
    preload(RESIDENCE_MODELS);
    if (!lite) preload(streetModels(lite), FLOOR_MODELS, [RES_LOFT_URL]);
    if (walking && home === null) preload(streetModels(lite));
    if (inHome) preload([RES_LOFT_URL]);
    const id = window.setTimeout(() => setWarm(true), lite ? 600 : 1200);
    return () => window.clearTimeout(id);
  }, [shown, lite, walking, home, inHome]);
  useEffect(() => {
    if (!shown || !lite || inHome || warmStreet) return;
    const id = window.setTimeout(() => {
      preload(streetModels(lite));
      setWarmStreet(true);
    }, 6000);
    return () => window.clearTimeout(id);
  }, [shown, lite, inHome, warmStreet]);
  const street = !lite || (walking && home === null);
  const [dpr, setDpr] = useState(lite ? 1.25 : 1.6);
  const lobbyShown = useCallback(() => {
    RESIDENCE_READY.lobby = true;
  }, []);
  return (
    <Canvas
      dpr={[lite ? 0.8 : 1, dpr]}
      frameloop={active ? 'always' : 'never'}
      camera={{ position: [130, 70, 190], fov: ORBIT_FOV, near: ORBIT_NEAR, far: 2600 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.localClippingEnabled = true;
      }}
    >
      <PerformanceMonitor
        bounds={() => (lite ? [24, 50] : [30, 55])}
        flipflops={4}
        onDecline={() => setDpr((d) => Math.max(lite ? 0.8 : 1, d - 0.2))}
        onIncline={() => setDpr((d) => Math.min(lite ? 1.25 : 1.6, d + 0.1))}
        onFallback={() => setDpr(lite ? 0.8 : 1)}
      />
      <color attach="background" args={['#060912']} />
      <fog attach="fog" args={['#0b1020', 320, 1200]} />
      <Atmosphere mode={skyMode} />
      <Environment resolution={128} frames={1}>
        <color attach="background" args={['#04060c']} />
        <Lightformer form="rect" intensity={1.2} color="#ffd9a8" position={[0, 2, -10]} scale={[20, 2, 1]} />
        <Lightformer form="rect" intensity={0.8} color="#8aa0ff" position={[10, 5, 5]} scale={[6, 10, 1]} rotation-y={-Math.PI / 2} />
        <Lightformer form="rect" intensity={0.6} color="#a78bfa" position={[-10, 3, 5]} scale={[6, 6, 1]} rotation-y={Math.PI / 2} />
        <Lightformer form="ring" intensity={0.5} color="#ffffff" position={[0, 10, 0]} scale={4} rotation-x={Math.PI / 2} />
      </Environment>
      <EntranceLights />
      <ResidenceLights level={walking ? home : null} />
      <FloorLiftLight floor={walking ? selected : null} />
      <SelectedFloorLights selected={selected} />
      <Suspense fallback={null}>
        <Prewarmed>
          <City street={street} />
        </Prewarmed>
      </Suspense>
      <Suspense fallback={null}>
        <Prewarmed>
          <NycBlocks lite={lite} />
        </Prewarmed>
      </Suspense>
      <Suspense fallback={null}>
        <Prewarmed onShown={ready}>
          <Building selected={selected} layout={layout} />
          <Crown />
          <ResidenceEntrance />
        </Prewarmed>
        <Suspense fallback={null}>
          <Prewarmed>
            <NycTower at={NEIGHBOUR_AT} />
          </Prewarmed>
        </Suspense>
        {(street || (warm && warmStreet)) && (
          <Suspense fallback={null}>
            <Prewarmed visible={street}>
              <Entrance offers={offers} />
            </Prewarmed>
          </Suspense>
        )}
        {!walking && <FloorHits selected={selected} onSelect={onSelect} />}
        {walking && <WalkRig zone={home !== null ? homeZone(home) : (selected ?? 'street')} layout={layout} onElevator={onElevator} />}
        {(warm || inHome) && (
          <Suspense fallback={null}>
            <Prewarmed visible={inHome} onShown={lobbyShown}>
              <Residence level={inHome ? home : 0} rideTo={inHome ? homeRideTo : null} offers={offers} />
            </Prewarmed>
          </Suspense>
        )}
        {walking && [...new Set([selected, rideTo])].map((f) => f !== null && <FloorLift key={f} floor={f} />)}
        <CutawayAnimator selected={selected} walking={walking} />
      </Suspense>
      <CameraRig selected={selected} walking={walking} />
    </Canvas>
  );
}

useGLTF.preload(BUILDING_URL, DRACO_PATH);
