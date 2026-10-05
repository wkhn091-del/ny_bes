'use client';

import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  BackSide,
  BoxGeometry,
  type BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  type InstancedMesh,
  type Material,
  Matrix4,
  type Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DRACO_PATH } from '@/components/three/desk-model';
import { inNyc } from './nyc';
import { WALK, seededRandom } from './shared';
import { DAY_UNIFORM, SKY, applyDayTints, dayTint } from './sky';

export const AVENUE_Z = 52;
export const AVENUE_HALF = 8;
export const SIDE_X = -64;
export const CROSSWALK = { x: 4, stopLine: 8 };
export const NEIGHBOUR_AT: [number, number, number] = [84, 0, 14];
const ROAD_HALF = 420;
const RIVER = { z0: -470, z1: -600 };
const BRIDGE_X = 260;

export const TRAFFIC_A_URL = '/models/spacehub-traffic-a.glb';
export const TRAFFIC_B_URL = '/models/spacehub-traffic-b.glb';

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

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();

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

const LAMP_HEAD = new Color('#ffd9a0').multiplyScalar(2.4);
/** Road paint sits well clear of the asphalt and is pulled forward in depth, so it never flickers from far away. */
const MARK_Y = 0.07;

/** Streets: asphalt, plaza, sidewalks, lane marks, a zebra crossing in front of the entrance and street lamps. */
function Streets() {
  const dashes = useRef<InstancedMesh>(null);
  const zebra = useRef<InstancedMesh>(null);
  const lamps = useRef<InstancedMesh>(null);
  const heads = useRef<InstancedMesh>(null);
  const data = useMemo(() => {
    const dashList: Matrix4[] = [];
    for (let x = -ROAD_HALF; x < ROAD_HALF; x += 9) {
      if (Math.abs(x) < CROSSWALK.x + 2) continue;
      for (const dz of [-3.7, 3.7]) dashList.push(new Matrix4().compose(new Vector3(x, MARK_Y, AVENUE_Z + dz), _q.identity(), new Vector3(3.5, 1, 0.15)));
      dashList.push(new Matrix4().compose(new Vector3(x, MARK_Y, AVENUE_Z), _q.identity(), new Vector3(9, 1, 0.12)));
    }
    const zebraList: Matrix4[] = [];
    for (let z = AVENUE_Z - AVENUE_HALF + 0.6; z < AVENUE_Z + AVENUE_HALF - 0.4; z += 1.1)
      zebraList.push(new Matrix4().compose(new Vector3(0, MARK_Y, z), _q.identity(), new Vector3(CROSSWALK.x * 2, 1, 0.55)));
    const lampList: Matrix4[] = [];
    const headList: Matrix4[] = [];
    for (let x = -300; x <= 300; x += 26) {
      for (const z of [AVENUE_Z - AVENUE_HALF - 1.2, AVENUE_Z + AVENUE_HALF + 1.2]) {
        if (Math.abs(x) < 10) continue;
        lampList.push(new Matrix4().makeTranslation(x, 4.5, z));
        headList.push(new Matrix4().makeTranslation(x, 9, z + (z < AVENUE_Z ? 1.2 : -1.2)));
      }
    }
    return { dashList, zebraList, lampList, headList };
  }, []);
  useLayoutEffect(() => {
    setInstances(dashes.current, data.dashList);
    setInstances(zebra.current, data.zebraList);
    setInstances(lamps.current, data.lampList);
    setInstances(heads.current, data.headList);
  }, [data]);
  const { mats, tints } = useMemo(() => {
    const mats = {
      ground: new MeshStandardMaterial({ roughness: 1 }),
      plaza: new MeshStandardMaterial({ roughness: 0.55, metalness: 0.15 }),
      road: new MeshStandardMaterial({ roughness: 0.45, metalness: 0.25 }),
      curb: new MeshStandardMaterial({ roughness: 0.8 }),
    };
    const tints = [
      dayTint(mats.ground, '#0a0c11', '#46474a'),
      dayTint(mats.plaza, '#1b1d23', '#9a958d'),
      dayTint(mats.road, '#121419', '#3c3e42'),
      dayTint(mats.curb, '#2a2c33', '#a29d94'),
    ];
    return { mats, tints };
  }, []);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  useFrame(() => applyDayTints(tints));

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.06, 0]} material={mats.ground}>
        <planeGeometry args={[2400, 2400]} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, (AVENUE_Z - AVENUE_HALF - 40) / 2]} material={mats.plaza}>
        <planeGeometry args={[110, AVENUE_Z - AVENUE_HALF + 40]} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, AVENUE_Z]} material={mats.road}>
        <planeGeometry args={[ROAD_HALF * 2, AVENUE_HALF * 2]} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[SIDE_X, 0.045, 0]} material={mats.road}>
        <planeGeometry args={[10, ROAD_HALF * 2]} />
      </mesh>
      {[AVENUE_Z - AVENUE_HALF - 1.6, AVENUE_Z + AVENUE_HALF + 1.6].map((z) => (
        <mesh key={z} position={[0, 0.09, z]} material={mats.curb}>
          <boxGeometry args={[ROAD_HALF * 2, 0.18, 3.2]} />
        </mesh>
      ))}
      <instancedMesh ref={dashes} args={[undefined, undefined, data.dashList.length]}>
        <boxGeometry args={[1, 0.01, 1]} />
        <meshBasicMaterial color="#9a9682" polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </instancedMesh>
      <instancedMesh ref={zebra} args={[undefined, undefined, data.zebraList.length]}>
        <boxGeometry args={[1, 0.01, 1]} />
        <meshBasicMaterial color="#d9d6cc" polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </instancedMesh>
      <instancedMesh ref={lamps} args={[undefined, undefined, data.lampList.length]}>
        <cylinderGeometry args={[0.09, 0.14, 9, 8]} />
        <meshStandardMaterial color="#2b2e35" metalness={0.7} roughness={0.4} />
      </instancedMesh>
      <instancedMesh ref={heads} args={[undefined, undefined, data.headList.length]}>
        <boxGeometry args={[0.5, 0.18, 1.4]} />
        <meshBasicMaterial color={LAMP_HEAD} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

type CarPart = { geometry: BufferGeometry; material: Material; paint: boolean };

function carParts(scene: Object3D): CarPart[] {
  scene.updateMatrixWorld(true);
  const parts: CarPart[] = [];
  scene.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const src = mesh.material as MeshStandardMaterial;
    const paint = /car ?paint|carpiant/i.test(src.name);
    const material = src.clone();
    if (paint) {
      material.color.set('#ffffff');
      material.metalness = 0.6;
      material.roughness = 0.28;
    }
    parts.push({ geometry: mesh.geometry.clone().applyMatrix4(mesh.matrixWorld), material, paint });
  });
  return parts;
}

type Lane = { axis: 'x' | 'z'; at: number; dir: 1 | -1; stops: boolean };
const LANES: Lane[] = [
  { axis: 'x', at: AVENUE_Z + 1.9, dir: 1, stops: true },
  { axis: 'x', at: AVENUE_Z + 5.5, dir: 1, stops: true },
  { axis: 'x', at: AVENUE_Z - 1.9, dir: -1, stops: true },
  { axis: 'x', at: AVENUE_Z - 5.5, dir: -1, stops: true },
  { axis: 'z', at: SIDE_X - 2.2, dir: 1, stops: false },
  { axis: 'z', at: SIDE_X + 2.2, dir: -1, stops: false },
];
const CARS_PER_LANE = 6;
const PAINTS = ['#f2b705', '#f2b705', '#f2b705', '#e8e8ea', '#111214', '#b0131e', '#1d4fd6', '#ff6a00', '#2fbf71', '#6d28d9'];
const LAMP_FRONT = new Color('#fff6e0').multiplyScalar(3);
const LAMP_REAR = new Color('#ff1a1a').multiplyScalar(2.6);

/** True while someone on foot is about to cross or is crossing in front of the entrance. */
export function crossingRed(): boolean {
  return WALK.street && Math.abs(WALK.x) < CROSSWALK.x + 6 && WALK.z > AVENUE_Z - AVENUE_HALF - 9 && WALK.z < AVENUE_Z + AVENUE_HALF + 9;
}

/** Where a car in this lane must stop for the walker, or null when the way is clear. */
function stopPointFor(lane: Lane): { at: number; grace: number } | null {
  if (!lane.stops || !WALK.street) return null;
  if (crossingRed()) return { at: -lane.dir * CROSSWALK.stopLine, grace: 0.5 };
  if (Math.abs(WALK.z - AVENUE_Z) < AVENUE_HALF + 2.5) return { at: WALK.x - lane.dir * 7, grace: 6 };
  return null;
}

/** Cars from the two models, yellow cabs among them; avenue traffic stops for a walker at the crossing or on the road. */
function Traffic() {
  const a = useGLTF(TRAFFIC_A_URL, DRACO_PATH);
  const b = useGLTF(TRAFFIC_B_URL, DRACO_PATH);
  const models = useMemo(() => [carParts(a.scene), carParts(b.scene)], [a.scene, b.scene]);
  const lampGeo = useMemo(() => {
    const box = () => new BoxGeometry(0.32, 0.12, 0.06);
    return {
      front: mergeGeometries([box().translate(-0.68, 0.72, 2.38), box().translate(0.68, 0.72, 2.38)])!,
      rear: mergeGeometries([box().translate(-0.68, 0.85, -2.3), box().translate(0.68, 0.85, -2.3)])!,
    };
  }, []);
  useEffect(
    () => () => {
      lampGeo.front.dispose();
      lampGeo.rear.dispose();
    },
    [lampGeo],
  );
  const cars = useMemo(() => {
    const rnd = seededRandom(31);
    return LANES.flatMap((_, li) =>
      Array.from({ length: CARS_PER_LANE }, (__, k) => ({
        li,
        model: rnd() < 0.62 ? 0 : 1,
        pos: -ROAD_HALF + ((k + rnd() * 0.5) * 2 * ROAD_HALF) / CARS_PER_LANE,
        cruise: 11 + rnd() * 6,
        speed: 12,
        paint: PAINTS[Math.floor(rnd() * PAINTS.length)]!,
      })),
    );
  }, []);
  const byLane = useMemo(() => LANES.map((_, li) => cars.filter((c) => c.li === li)), [cars]);
  const byModel = useMemo(() => [cars.filter((c) => c.model === 0), cars.filter((c) => c.model === 1)], [cars]);
  const meshes = useRef<(InstancedMesh | null)[][]>([[], []]);
  const lamps = useRef<(InstancedMesh | null)[]>([]);

  useLayoutEffect(() => {
    const c = new Color();
    models.forEach((parts, mi) =>
      parts.forEach((p, pi) => {
        const mesh = meshes.current[mi]?.[pi];
        if (!mesh || !p.paint) return;
        byModel[mi]!.forEach((car, i) => mesh.setColorAt(i, c.set(car.paint)));
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }),
    );
  }, [models, byModel]);

  const up = useMemo(() => new Vector3(0, 1, 0), []);
  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1);
    LANES.forEach((lane, li) => {
      const laneCars = byLane[li]!;
      const stop = stopPointFor(lane);
      for (const car of laneCars) {
        let gap = Infinity;
        for (const other of laneCars) {
          if (other === car) continue;
          let d = (other.pos - car.pos) * lane.dir;
          if (d < 0) d += ROAD_HALF * 2;
          gap = Math.min(gap, d);
        }
        let target = Math.min(car.cruise, Math.max(0, (gap - 7.5) * 1.2));
        if (stop) {
          const d = (stop.at - car.pos) * lane.dir;
          if (d > -stop.grace && d < 40) target = Math.min(target, Math.max(0, (d - 2.6) * 0.9));
        }
        car.speed += (target - car.speed) * Math.min(1, delta * (target < car.speed ? 3.5 : 1.2));
        car.pos += lane.dir * car.speed * delta;
        if (car.pos > ROAD_HALF) car.pos -= ROAD_HALF * 2;
        if (car.pos < -ROAD_HALF) car.pos += ROAD_HALF * 2;
      }
    });
    let li = 0;
    byModel.forEach((list, mi) => {
      const parts = meshes.current[mi] ?? [];
      list.forEach((car, i) => {
        const lane = LANES[car.li]!;
        const angle = lane.axis === 'x' ? (lane.dir === 1 ? Math.PI / 2 : -Math.PI / 2) : lane.dir === 1 ? 0 : Math.PI;
        _q.setFromAxisAngle(up, angle);
        if (lane.axis === 'x') _p.set(car.pos, 0.02, lane.at);
        else _p.set(lane.at, 0.045, car.pos);
        _m.compose(_p, _q, _s.set(1, 1, 1));
        for (const mesh of parts) mesh?.setMatrixAt(i, _m);
        for (const mesh of lamps.current) mesh?.setMatrixAt(li, _m);
        li++;
      });
      for (const mesh of parts) if (mesh) mesh.instanceMatrix.needsUpdate = true;
    });
    for (const mesh of lamps.current) if (mesh) mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      {models.map((parts, mi) =>
        parts.map((p, pi) => (
          <instancedMesh
            key={`${mi}-${pi}`}
            ref={(m) => {
              meshes.current[mi]![pi] = m;
            }}
            args={[p.geometry, p.material, Math.max(1, byModel[mi]!.length)]}
            frustumCulled={false}
          />
        )),
      )}
      {[
        { g: lampGeo.front, c: LAMP_FRONT },
        { g: lampGeo.rear, c: LAMP_REAR },
      ].map((l, i) => (
        <instancedMesh
          key={i}
          ref={(m) => {
            lamps.current[i] = m;
          }}
          args={[l.g, undefined, cars.length]}
          frustumCulled={false}
        >
          <meshBasicMaterial color={l.c} toneMapped={false} />
        </instancedMesh>
      ))}
    </group>
  );
}

const SIG_RED = new Color('#ff2020').multiplyScalar(3);
const SIG_GREEN = new Color('#20ff70').multiplyScalar(2.4);
const SIG_WALK = new Color('#f5f5f5').multiplyScalar(2.4);
const SIG_DIM = new Color('#141414');

/** Pedestrian signals and car lights at the crossing; they follow the walker. */
function Signals() {
  const mats = useMemo(
    () => ({
      red: new MeshBasicMaterial({ color: SIG_DIM, toneMapped: false }),
      green: new MeshBasicMaterial({ color: SIG_GREEN, toneMapped: false }),
      walk: new MeshBasicMaterial({ color: SIG_DIM, toneMapped: false }),
    }),
    [],
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  useFrame(() => {
    const red = crossingRed();
    mats.red.color.copy(red ? SIG_RED : SIG_DIM);
    mats.green.color.copy(red ? SIG_DIM : SIG_GREEN);
    mats.walk.color.copy(red ? SIG_WALK : SIG_DIM);
  });
  const poles: [number, number, number][] = [
    [CROSSWALK.x + 2.2, 0, AVENUE_Z - AVENUE_HALF - 1],
    [-CROSSWALK.x - 2.2, 0, AVENUE_Z + AVENUE_HALF + 1],
  ];
  return (
    <group>
      {poles.map((p, i) => (
        <group key={i} position={p} rotation-y={i === 0 ? 0 : Math.PI}>
          <mesh position={[0, 3, 0]}>
            <cylinderGeometry args={[0.1, 0.12, 6, 8]} />
            <meshStandardMaterial color="#25272d" metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[0, 5.4, 0.25]}>
            <boxGeometry args={[0.45, 1.3, 0.35]} />
            <meshStandardMaterial color="#14151a" roughness={0.6} />
          </mesh>
          <mesh position={[0, 5.8, 0.45]} material={mats.red}>
            <sphereGeometry args={[0.14, 12, 8]} />
          </mesh>
          <mesh position={[0, 5.0, 0.45]} material={mats.green}>
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

export function City() {
  return (
    <group>
      <Streets />
      <Skyline />
      <Landmarks />
      <RiverAndBridge />
      <FarSkyline />
      <Signals />
      <Traffic />
    </group>
  );
}
