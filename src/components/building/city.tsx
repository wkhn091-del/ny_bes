'use client';

import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  BackSide,
  type BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  type InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { inNyc } from './nyc';
import { AVENUE_HALF, AVENUE_Z, RIVER, SIDE_X, gridStrips, nearGrid } from './roads';
import { seededRandom } from './shared';
import { DAY_UNIFORM, SKY } from './sky';
import { GridStreets, RoadSigns, Signals, Streets, Traffic } from './streets';

export { AVENUE_HALF, AVENUE_Z, CROSSWALK, SIDE_X } from './roads';
export { GOBLIN_URL, REVUELTO_URL, SIGNS_URL, TRAFFIC_A_URL } from './streets';
export const NEIGHBOUR_AT: [number, number, number] = [84, 0, 14];
const BRIDGE_X = 260;

/**
 * Night windows drawn from world position, so every tower gets correctly sized floors and bays
 * whatever its scale. Each instance gets its own occupancy and colour mix. Once a window grid cell
 * shrinks toward a pixel, it fades to the average glow so distant towers do not sparkle.
 */
function cityMaterial(color: string, windowGain: number): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.25 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uWindow = { value: windowGain };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCityPos;\nvarying vec3 vCityNormal;\nvarying float vCitySeed;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  mat4 cityModel = modelMatrix * instanceMatrix;
  vCitySeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
#else
  mat4 cityModel = modelMatrix;
  vCitySeed = 0.37;
#endif
  vCityPos = (cityModel * vec4(transformed, 1.0)).xyz;
  vCityNormal = normalize(mat3(cityModel) * objectNormal);`,
      );
    shader.uniforms.uDay = DAY_UNIFORM;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCityPos;\nvarying vec3 vCityNormal;\nvarying float vCitySeed;\nuniform float uWindow;\nuniform float uDay;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
  vec3 nightDiffuse = diffuseColor.rgb;
  float kind = fract(vCitySeed * 7.13);
  vec3 dayWall = kind < 0.3 ? vec3(0.62, 0.57, 0.49)
    : kind < 0.5 ? vec3(0.44, 0.27, 0.21)
    : kind < 0.75 ? vec3(0.42, 0.43, 0.45)
    : vec3(0.2, 0.28, 0.37);
  vec3 dayColor = abs(vCityNormal.y) < 0.5 ? dayWall : vec3(0.28, 0.29, 0.31);
  if (abs(vCityNormal.y) < 0.5) {
    float u = abs(vCityNormal.x) > abs(vCityNormal.z) ? vCityPos.z : vCityPos.x;
    vec2 cell = vec2(u / 2.7, vCityPos.y / 3.6);
    vec2 cellPx = fwidth(cell);
    float blur = clamp(max(cellPx.x, cellPx.y) * 2.5 - 0.4, 0.0, 1.0);
    vec2 id = floor(cell);
    vec2 fw = fract(cell);
    vec2 aa = max(cellPx, vec2(1e-4));
    float win = smoothstep(0.16 - aa.x, 0.16 + aa.x, fw.x) * (1.0 - smoothstep(0.84 - aa.x, 0.84 + aa.x, fw.x))
              * smoothstep(0.22 - aa.y, 0.22 + aa.y, fw.y) * (1.0 - smoothstep(0.82 - aa.y, 0.82 + aa.y, fw.y));
    float r = fract(sin(dot(id + vCitySeed * 31.0, vec2(41.3, 289.1))) * 15731.7);
    float lit = step(0.42 + vCitySeed * 0.3, r);
    vec3 warm = vec3(1.0, 0.76, 0.45);
    vec3 cool = vec3(0.66, 0.8, 1.0);
    vec3 wc = mix(warm, cool, step(0.78, fract(r * 7.31)));
    vec3 sharpGlow = wc * win * lit * (0.45 + 0.55 * fract(r * 13.1));
    vec3 averageGlow = mix(warm, cool, 0.22) * 0.13;
    totalEmissiveRadiance += mix(sharpGlow, averageGlow, blur) * uWindow * (1.0 - uDay);
    nightDiffuse = mix(nightDiffuse, vec3(0.02, 0.025, 0.04), mix(win * (1.0 - lit), 0.23, blur));
    vec3 pane = vec3(0.07, 0.1, 0.15) + 0.05 * fract(r * 5.3);
    dayColor = mix(dayWall, pane, mix(win, 0.42, blur));
  }
  diffuseColor.rgb = mix(nightDiffuse, dayColor, uDay);`,
      );
  };
  m.customProgramCacheKey = () => `spacehub-city-day-${windowGain}`;
  return m;
}

type Tower = { x: number; z: number; w: number; d: number; h: number };
/** The orbit camera circles at about this radius; towers inside it stay low enough to see the tower over them. */
const CLEAR_VIEW_R = 330;

function inReserved(x: number, z: number, pad: number): boolean {
  if (Math.abs(z - AVENUE_Z) < AVENUE_HALF + 6 + pad) return true;
  if (Math.abs(x - SIDE_X) < 11 + pad) return true;
  if (Math.abs(x) < 52 + pad && z > -32 - pad && z < 44 + pad) return true;
  if (Math.abs(x - NEIGHBOUR_AT[0]) < 32 + pad && Math.abs(z - NEIGHBOUR_AT[2]) < 28 + pad) return true;
  if (z < RIVER.z0 + 10 && z > RIVER.z1 - 10) return true;
  if (nearGrid(x, z, pad + 3)) return true;
  return inNyc(x, z, pad + 4);
}

/** Manhattan-style towers: low blocks around the tower, tall setback towers beyond, a lower borough across the river. */
function makeTowers(): Tower[] {
  const rnd = seededRandom(23);
  const out: Tower[] = [];
  let guard = 0;
  while (out.length < 420 && guard++ < 20000) {
    const a = rnd() * Math.PI * 2;
    const r = 70 + Math.pow(rnd(), 0.8) * 780;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const w = 16 + rnd() * 20;
    const d = 16 + rnd() * 20;
    if (inReserved(x, z, Math.max(w, d) / 2)) continue;
    if (out.some((t) => Math.abs(t.x - x) < (t.w + w) / 2 + 6 && Math.abs(t.z - z) < (t.d + d) / 2 + 6)) continue;
    const across = z < RIVER.z1;
    const near = r < CLEAR_VIEW_R;
    const v = rnd();
    let h = across ? 14 + v * 50 : near ? Math.min(30 + r * 0.12, 18 + v * v * 90) : 60 + v * v * 220;
    if (!across && !near && rnd() < 0.08) h = 260 + rnd() * 120;
    out.push({ x, z, w: h > 250 ? w * 0.7 : w, d: h > 250 ? d * 0.7 : d, h });
  }
  return out;
}

const _q = new Quaternion();

function setInstances(mesh: InstancedMesh | null, list: Matrix4[]) {
  if (!mesh) return;
  list.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.instanceMatrix.needsUpdate = true;
}

const BEACON_ON = new Color('#ff2a2a').multiplyScalar(3);
const BEACON_OFF = new Color('#3a0505');

function Skyline() {
  const ref = useRef<InstancedMesh>(null);
  const spires = useRef<InstancedMesh>(null);
  const beacons = useRef<InstancedMesh>(null);
  const material = useMemo(() => cityMaterial('#0d1018', 1.0), []);
  const beaconMat = useMemo(() => new MeshBasicMaterial({ color: BEACON_ON, toneMapped: false }), []);
  useEffect(
    () => () => {
      material.dispose();
      beaconMat.dispose();
    },
    [material, beaconMat],
  );
  const { boxes, spireList, beaconList } = useMemo(() => {
    const towers = makeTowers();
    const boxes: Matrix4[] = [];
    const spireList: Matrix4[] = [];
    const beaconList: Matrix4[] = [];
    for (const t of towers) {
      const tiers = t.h > 90 ? [0.5, 0.32, 0.18] : [1];
      let y = 0;
      tiers.forEach((frac, i) => {
        const k = 1 - i * 0.18;
        const th = t.h * frac;
        boxes.push(new Matrix4().compose(new Vector3(t.x, y + th / 2, t.z), _q.identity(), new Vector3(t.w * k, th, t.d * k)));
        y += th;
      });
      if (t.h > 170) {
        const sh = 18 + (t.h % 30);
        spireList.push(new Matrix4().compose(new Vector3(t.x, t.h + sh / 2, t.z), _q.identity(), new Vector3(1.2, sh, 1.2)));
        beaconList.push(new Matrix4().makeTranslation(t.x, t.h + sh, t.z));
      } else if (t.h > 70) {
        beaconList.push(new Matrix4().makeTranslation(t.x + t.w * 0.25, t.h + 0.8, t.z + t.d * 0.25));
      }
    }
    return { boxes, spireList, beaconList };
  }, []);

  useLayoutEffect(() => {
    setInstances(ref.current, boxes);
    setInstances(spires.current, spireList);
    setInstances(beacons.current, beaconList);
  }, [boxes, spireList, beaconList]);

  useFrame(({ clock }) => {
    beaconMat.color.copy(Math.sin(clock.elapsedTime * 2.4) > 0.55 ? BEACON_ON : BEACON_OFF);
  });

  return (
    <group>
      <instancedMesh ref={ref} args={[undefined, material, boxes.length]}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh ref={spires} args={[undefined, undefined, Math.max(1, spireList.length)]}>
        <coneGeometry args={[1, 1, 6]} />
        <meshStandardMaterial color="#8d95a3" metalness={0.9} roughness={0.3} />
      </instancedMesh>
      <instancedMesh ref={beacons} args={[undefined, beaconMat, Math.max(1, beaconList.length)]}>
        <sphereGeometry args={[1.2, 8, 6]} />
      </instancedMesh>
    </group>
  );
}

function chevronTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#0b0d12';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#fff1cf';
  for (let row = 0; row < 6; row++) {
    for (let i = 0; i < 8; i++) {
      const x = i * 32 + (row % 2) * 16;
      const y = row * 42 + 8;
      ctx.beginPath();
      ctx.moveTo(x + 4, y + 26);
      ctx.lineTo(x + 16, y);
      ctx.lineTo(x + 28, y + 26);
      ctx.closePath();
      ctx.fill();
    }
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

/** Three silhouettes that read as New York from anywhere: a stepped tower with a colour-changing crown, an art-deco crown, and a tapered glass supertall. */
function Landmarks() {
  const body = useMemo(() => cityMaterial('#11141c', 1.1), []);
  const glass = useMemo(() => cityMaterial('#1a2a3f', 0.55), []);
  const chevrons = useMemo(() => chevronTexture(), []);
  const crown = useMemo(() => new MeshBasicMaterial({ toneMapped: false }), []);
  const tapered = useMemo(() => new CylinderGeometry(9, 26, 300, 4, 1).rotateY(Math.PI / 4), []);
  useEffect(
    () => () => {
      body.dispose();
      glass.dispose();
      chevrons.dispose();
      crown.dispose();
      tapered.dispose();
    },
    [body, glass, chevrons, crown, tapered],
  );
  useFrame(({ clock }) => {
    crown.color.setHSL((clock.elapsedTime * 0.03) % 1, 0.75, 0.55).multiplyScalar(1.6);
  });

  const stepped: [number, number, number][] = [
    [60, 25, 60],
    [44, 120, 44],
    [34, 60, 34],
    [24, 24, 24],
  ];
  const tiers = stepped.reduce<{ w: number; h: number; d: number; y: number }[]>((acc, [w, h, d]) => {
    const prev = acc[acc.length - 1];
    acc.push({ w, h, d, y: prev ? prev.y + prev.h : 0 });
    return acc;
  }, []);
  return (
    <group>
      <group position={[-190, 0, -250]}>
        {tiers.map((t, i) => (
          <mesh key={i} position={[0, t.y + t.h / 2, 0]} material={body}>
            <boxGeometry args={[t.w, t.h, t.d]} />
          </mesh>
        ))}
        <mesh position={[0, 239, 0]} material={crown}>
          <boxGeometry args={[16, 20, 16]} />
        </mesh>
        <mesh position={[0, 279, 0]}>
          <cylinderGeometry args={[0.4, 2, 60, 8]} />
          <meshStandardMaterial color="#c9ccd2" metalness={0.9} roughness={0.25} />
        </mesh>
      </group>

      <group position={[150, 0, -300]}>
        <mesh position={[0, 95, 0]} material={body}>
          <boxGeometry args={[30, 190, 30]} />
        </mesh>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} position={[0, 190 + i * 11 + 6, 0]}>
            <coneGeometry args={[15 - i * 3.4, 14, 8, 1, true]} />
            <meshStandardMaterial color="#a9aeb8" metalness={0.85} roughness={0.25} emissive="#ffffff" emissiveMap={chevrons} emissiveIntensity={1.4} side={2} />
          </mesh>
        ))}
        <mesh position={[0, 252, 0]}>
          <cylinderGeometry args={[0.2, 1.2, 34, 8]} />
          <meshStandardMaterial color="#d6d9de" metalness={0.95} roughness={0.2} />
        </mesh>
      </group>

      <group position={[-40, 0, -430]}>
        <mesh position={[0, 150, 0]} geometry={tapered} material={glass} />
        <mesh position={[0, 350, 0]}>
          <cylinderGeometry args={[0.5, 1.4, 100, 8]} />
          <meshStandardMaterial color="#d6d9de" metalness={0.95} roughness={0.2} />
        </mesh>
        <mesh position={[0, 401, 0]}>
          <sphereGeometry args={[1.4, 10, 8]} />
          <meshBasicMaterial color={BEACON_ON} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

function streakTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 512, 128);
  const rnd = seededRandom(77);
  for (let i = 0; i < 260; i++) {
    const x = rnd() * 512;
    const w = 1 + rnd() * 3;
    ctx.fillStyle = rnd() < 0.8 ? `rgba(255,200,130,${0.25 + rnd() * 0.5})` : `rgba(150,190,255,${0.3 + rnd() * 0.4})`;
    ctx.fillRect(x, rnd() * 128, w, 2 + rnd() * 18);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(10, 3);
  return t;
}

function scrollTexture(t: CanvasTexture, by: number) {
  t.offset.y = (t.offset.y + by) % 1;
}

const BRIDGE_LIGHT = new Color('#fff3d6').multiplyScalar(2.2);

/** A dark, reflective river behind the tower with shimmering city-light streaks, and a lit suspension bridge over it. */
function RiverAndBridge() {
  const streaks = useMemo(() => streakTexture(), []);
  const bridge = useMemo(() => {
    const deckY = 16;
    const towersZ = [RIVER.z0 + 12, RIVER.z1 - 12] as const;
    const topY = 70;
    const cables: BufferGeometry[] = [];
    const lights: Matrix4[] = [];
    for (const side of [-1, 1]) {
      const x = BRIDGE_X + side * 8;
      const pts = [
        new Vector3(x, deckY + 1, RIVER.z0 + 60),
        new Vector3(x, topY, towersZ[0]),
        new Vector3(x, deckY + 6, (towersZ[0] + towersZ[1]) / 2),
        new Vector3(x, topY, towersZ[1]),
        new Vector3(x, deckY + 1, RIVER.z1 - 60),
      ];
      const curve = new CatmullRomCurve3(pts, false, 'catmullrom', 0.2);
      cables.push(new TubeGeometry(curve, 120, 0.35, 5, false));
      for (let i = 0; i <= 60; i++) {
        const v = curve.getPoint(i / 60);
        lights.push(new Matrix4().makeTranslation(v.x, v.y, v.z));
      }
    }
    return { deckY, towersZ, topY, cable: mergeGeometries(cables)!, lights, length: RIVER.z0 - RIVER.z1 + 120 };
  }, []);
  const lightsRef = useRef<InstancedMesh>(null);
  useLayoutEffect(() => setInstances(lightsRef.current, bridge.lights), [bridge]);
  useFrame((_, delta) => scrollTexture(streaks, delta * 0.02));
  useEffect(
    () => () => {
      streaks.dispose();
      bridge.cable.dispose();
    },
    [streaks, bridge],
  );
  const midZ = (RIVER.z0 + RIVER.z1) / 2;
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.4, midZ]}>
        <planeGeometry args={[1800, RIVER.z0 - RIVER.z1]} />
        <meshStandardMaterial color="#03070f" metalness={0.95} roughness={0.12} emissive="#ffffff" emissiveMap={streaks} emissiveIntensity={0.55} />
      </mesh>
      <mesh position={[BRIDGE_X, bridge.deckY, midZ]}>
        <boxGeometry args={[18, 1.6, bridge.length]} />
        <meshStandardMaterial color="#2a2d34" roughness={0.7} />
      </mesh>
      {bridge.towersZ.map((z) => (
        <group key={z} position={[BRIDGE_X, 0, z]}>
          {[-7, 7].map((x) => (
            <mesh key={x} position={[x, bridge.topY / 2, 0]}>
              <boxGeometry args={[5, bridge.topY, 8]} />
              <meshStandardMaterial color="#6b5d4c" roughness={0.9} emissive="#3a2a18" emissiveIntensity={0.5} />
            </mesh>
          ))}
          {[bridge.topY - 4, bridge.deckY + 14].map((yy) => (
            <mesh key={yy} position={[0, yy, 0]}>
              <boxGeometry args={[19, 5, 8]} />
              <meshStandardMaterial color="#6b5d4c" roughness={0.9} emissive="#3a2a18" emissiveIntensity={0.5} />
            </mesh>
          ))}
        </group>
      ))}
      <mesh geometry={bridge.cable}>
        <meshStandardMaterial color="#8b93a1" metalness={0.7} roughness={0.4} />
      </mesh>
      <instancedMesh ref={lightsRef} args={[undefined, undefined, bridge.lights.length]}>
        <sphereGeometry args={[0.9, 6, 5]} />
        <meshBasicMaterial color={BRIDGE_LIGHT} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

function skylineRingTexture(): CanvasTexture {
  const w = 2048;
  const h = 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  const rnd = seededRandom(101);
  let x = 0;
  while (x < w) {
    const bw = 14 + rnd() * 40;
    const bh = 30 + rnd() * rnd() * 210;
    ctx.fillStyle = '#070a12';
    ctx.fillRect(x, h - bh, bw, bh);
    for (let yy = h - bh + 4; yy < h - 4; yy += 6)
      for (let xx = x + 3; xx < x + bw - 3; xx += 5) {
        if (rnd() < 0.35) {
          ctx.fillStyle = rnd() < 0.8 ? 'rgba(255,205,140,0.85)' : 'rgba(160,200,255,0.85)';
          ctx.fillRect(xx, yy, 2, 2);
        }
      }
    x += bw + rnd() * 4;
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = RepeatWrapping;
  t.repeat.set(4, 1);
  return t;
}

/** A painted ring of far skyline beyond the fog, so the city never ends at the horizon. */
function FarSkyline() {
  const tex = useMemo(() => skylineRingTexture(), []);
  const mat = useRef<MeshBasicMaterial>(null);
  useEffect(() => () => tex.dispose(), [tex]);
  useFrame(() => fadeByDay(mat.current, 0.88));
  return (
    <mesh position={[0, 95, 0]} renderOrder={-10}>
      <cylinderGeometry args={[1150, 1150, 230, 64, 1, true]} />
      <meshBasicMaterial ref={mat} map={tex} transparent side={BackSide} fog={false} toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

/** Night-only glow (the painted far skyline, searchlights) thins out as daylight comes up. */
export function fadeByDay(m: { opacity: number; userData: Record<string, unknown> } | null, by: number) {
  if (!m) return;
  const base = (m.userData.baseOpacity as number | undefined) ?? (m.userData.baseOpacity = m.opacity);
  m.opacity = base * (1 - by * SKY.day);
}

/** Grid streets stay off the modelled blocks (they bring their own streets), the tower's plaza and the neighbour's lot. */
function gridBlocked(x: number, z: number): boolean {
  if (inNyc(x, z, 2)) return true;
  if (Math.abs(x) < 56 && z > -36 && z < AVENUE_Z - AVENUE_HALF) return true;
  return Math.abs(x - NEIGHBOUR_AT[0]) < 34 && Math.abs(z - NEIGHBOUR_AT[2]) < 30;
}

/** `street`: whether to load the street-level models (traffic and road signs); phones wait until the visitor walks. */
export function City({ street = true }: { street?: boolean }) {
  const strips = useMemo(() => gridStrips(gridBlocked), []);
  return (
    <group>
      <Streets strips={strips} />
      <GridStreets strips={strips} />
      <Skyline />
      <Landmarks />
      <RiverAndBridge />
      <FarSkyline />
      <Signals />
      {street && (
        <Suspense fallback={null}>
          <Traffic />
          <RoadSigns />
        </Suspense>
      )}
    </group>
  );
}
