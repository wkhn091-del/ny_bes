'use client';

import { Stars } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  BackSide,
  Color,
  type DirectionalLight,
  type Fog,
  type HemisphereLight,
  type Mesh,
  type MeshBasicMaterial,
  type Points,
  type Scene,
  ShaderMaterial,
  Vector3,
} from 'three';
import { DAY_UNIFORM, SKY, SKY_SHADER, horizonColor, skyTarget, sunDirection, type SkyMode } from './sky';

const SUN_NOON = new Color('#fff1dc');
const SUN_LOW = new Color('#ffa860');
const MOONLIGHT = new Color('#b8c8ff');
const HEMI_SKY_DAY = new Color('#d3e2ff');
const HEMI_SKY_NIGHT = new Color('#5a6c9c');
const HEMI_GROUND_DAY = new Color('#6a6255');
const HEMI_GROUND_NIGHT = new Color('#07080c');
const DOME_RADIUS = 2000;
/** How often the real clock is re-read; the fade itself runs every frame. */
const CLOCK_EVERY = 20;

const _horizon = new Color();
const _sunColor = new Color();
const _goalSun = new Vector3();

type Goal = { day: number; warm: number; checkedAt: number; mode: SkyMode | null };

function warmthOf(alt: number): number {
  const t = Math.min(1, Math.max(0, (alt - 0.04) / 0.42));
  return 1 - t * t * (3 - 2 * t);
}

function readClock(goal: Goal, mode: SkyMode, time: number) {
  const t = skyTarget(mode, new Date());
  goal.day = t.day;
  goal.warm = t.day > 0 ? warmthOf(t.alt) : 0;
  goal.mode = mode;
  goal.checkedAt = time;
  sunDirection(t.alt, t.az, _goalSun);
}

function easeSky(goal: Goal, delta: number, snap: boolean) {
  const k = snap ? 1 : 1 - Math.exp(-delta * 1.4);
  SKY.day += (goal.day - SKY.day) * k;
  SKY.warm += (goal.warm - SKY.warm) * k;
  SKY.sun.lerp(_goalSun, k).normalize();
  DAY_UNIFORM.value = SKY.day;
}

function paintScene(scene: Scene, sun: DirectionalLight | null, hemi: HemisphereLight | null) {
  const day = SKY.day;
  horizonColor(_horizon);
  if (scene.fog) (scene.fog as Fog).color.copy(_horizon);
  if (scene.background instanceof Color) scene.background.copy(_horizon);
  scene.environmentIntensity = 0.85 + 0.75 * day;
  if (sun) {
    sun.position.copy(SKY.sun).multiplyScalar(420);
    _sunColor.copy(SUN_LOW).lerp(SUN_NOON, 1 - SKY.warm);
    sun.color.copy(MOONLIGHT).lerp(_sunColor, day);
    sun.intensity = 0.5 + 2.6 * day * (1 - 0.35 * SKY.warm);
  }
  if (hemi) {
    hemi.color.copy(HEMI_SKY_NIGHT).lerp(HEMI_SKY_DAY, day);
    hemi.groundColor.copy(HEMI_GROUND_NIGHT).lerp(HEMI_GROUND_DAY, day);
    hemi.intensity = 0.55 + 0.75 * day;
  }
}

function paintDome(material: ShaderMaterial, time: number) {
  const u = material.uniforms;
  u.uDay!.value = SKY.day;
  u.uWarm!.value = SKY.warm;
  u.uTime!.value = time;
  (u.uSun!.value as Vector3).copy(SKY.sun);
}

function showAtNight(obj: { visible: boolean } | null, material?: MeshBasicMaterial | null) {
  if (obj) obj.visible = SKY.day < 0.45;
  if (material) material.opacity = Math.max(0, 1 - SKY.day * 2.2);
}

/**
 * Sky dome, sun or moon, stars, fog and the two main lights, all following the real time in
 * Israel (or the visitor's day/night choice) and fading smoothly between states.
 */
export function Atmosphere({ mode }: { mode: SkyMode }) {
  const sun = useRef<DirectionalLight>(null);
  const hemi = useRef<HemisphereLight>(null);
  const dome = useRef<Mesh>(null);
  const stars = useRef<Points>(null);
  const moon = useRef<Mesh>(null);
  const moonMat = useRef<MeshBasicMaterial>(null);
  const goal = useRef<Goal>({ day: 0, warm: 0, checkedAt: -Infinity, mode: null });
  const first = useRef(true);
  const material = useMemo(() => {
    const c = SKY_SHADER.colors;
    return new ShaderMaterial({
      vertexShader: SKY_SHADER.vertex,
      fragmentShader: SKY_SHADER.fragment,
      side: BackSide,
      depthWrite: false,
      uniforms: {
        uDay: { value: 0 },
        uWarm: { value: 0 },
        uTime: { value: 0 },
        uSun: { value: new Vector3(0, 1, 0) },
        uNightZenith: { value: c.NIGHT_ZENITH },
        uNightHorizon: { value: c.NIGHT_HORIZON },
        uDayZenith: { value: c.DAY_ZENITH },
        uDayHorizon: { value: c.DAY_HORIZON },
        uWarmHorizon: { value: c.WARM_HORIZON },
      },
    });
  }, []);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    if (stars.current) stars.current.renderOrder = -20;
    if (dome.current) dome.current.renderOrder = -30;
  }, []);

  useFrame((state, delta) => {
    const time = state.clock.elapsedTime;
    const g = goal.current;
    if (g.mode !== mode || time - g.checkedAt > CLOCK_EVERY) readClock(g, mode, time);
    easeSky(g, delta, first.current);
    first.current = false;
    paintScene(state.scene, sun.current, hemi.current);
    paintDome(material, time);
    dome.current?.position.copy(state.camera.position);
    showAtNight(stars.current);
    showAtNight(moon.current, moonMat.current);
  });

  return (
    <>
      <mesh ref={dome} material={material} frustumCulled={false}>
        <sphereGeometry args={[DOME_RADIUS, 48, 24]} />
      </mesh>
      <hemisphereLight ref={hemi} args={['#5a6c9c', '#07080c', 0.55]} />
      <directionalLight ref={sun} position={[-220, 300, -160]} intensity={0.55} color="#b8c8ff" />
      <Stars ref={stars} radius={1400} depth={200} count={1600} factor={7} fade speed={0} />
      <mesh ref={moon} position={[-600, 520, -1100]}>
        <sphereGeometry args={[24, 32, 16]} />
        <meshBasicMaterial ref={moonMat} color="#f4f1e6" toneMapped={false} fog={false} transparent />
      </mesh>
    </>
  );
}
