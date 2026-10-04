'use client';

import { ContactShadows, Environment, OrbitControls, Sparkles, useGLTF, useTexture } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import {
  RepeatWrapping,
  SRGBColorSpace,
  type DirectionalLight,
  type Group,
  type PointLight,
} from 'three';
import { DESK_URL, DRACO_PATH, drawDeskScreen, prepareDesk } from '@/components/three/desk-model';

const HDRI_URL = '/hdri/small-empty-room.hdr';
const CONCRETE = ['/textures/concrete-diff.webp', '/textures/concrete-rough.webp'];
const TARGET: [number, number, number] = [0, 0.78, 0];

function Desk() {
  const { scene } = useGLTF(DESK_URL, DRACO_PATH);
  const screen = useMemo(() => drawDeskScreen(), []);
  const model = useMemo(() => prepareDesk(scene, screen), [scene, screen]);
  useEffect(() => () => screen.dispose(), [screen]);
  // The model's working side faces -Z; turn it so the visitor looks over the chair at the screen.
  return <primitive object={model} rotation-y={Math.PI} />;
}

function Room() {
  const [diff, rough] = useTexture(CONCRETE);
  const [backDiff, backRough, sideDiff, sideRough] = useMemo(() => {
    const make = (repeat: [number, number]) =>
      [diff, rough].map((t, i) => {
        const c = t.clone();
        c.wrapS = c.wrapT = RepeatWrapping;
        c.repeat.set(...repeat);
        if (i === 0) c.colorSpace = SRGBColorSpace;
        c.needsUpdate = true;
        return c;
      });
    return [...make([2.4, 1]), ...make([2, 1])];
  }, [diff, rough]);

  return (
    <group>
      <mesh position={[0.6, 1.6, -1.35]} receiveShadow>
        <planeGeometry args={[7.2, 3.2]} />
        <meshStandardMaterial map={backDiff} roughnessMap={backRough} color="#d6d0c8" />
      </mesh>
      <mesh position={[-3, 1.6, 1.6]} rotation-y={Math.PI / 2} receiveShadow>
        <planeGeometry args={[6, 3.2]} />
        <meshStandardMaterial map={sideDiff} roughnessMap={sideRough} color="#c9c2b9" />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0.6, 0, 1.6]} receiveShadow>
        <planeGeometry args={[7.2, 6]} />
        <meshStandardMaterial color="#3b3633" roughness={0.42} metalness={0.05} envMapIntensity={0.9} />
      </mesh>
    </group>
  );
}

/** Slow sun sweep so shadows drift across the desk, plus the monitor's cool spill light. */
function LiveLights() {
  const sun = useRef<DirectionalLight>(null);
  const glow = useRef<PointLight>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (sun.current) {
      const a = 0.6 + Math.sin(t * 0.08) * 0.55;
      sun.current.position.set(Math.cos(a) * 3.2, 3.6, 1.2 + Math.sin(a) * 2.2);
    }
    if (glow.current) glow.current.intensity = 0.9 + Math.sin(t * 1.3) * 0.08;
  });
  return (
    <>
      <directionalLight
        ref={sun}
        castShadow
        intensity={3.2}
        color="#fff1dc"
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-2}
        shadow-camera-right={2}
        shadow-camera-top={2}
        shadow-camera-bottom={-2}
        shadow-camera-near={0.5}
        shadow-camera-far={10}
      />
      <pointLight ref={glow} position={[0, 1.05, -0.25]} color="#8b7cff" distance={1.6} decay={2} />
    </>
  );
}

/** Gentle idle sway of the whole stage until the visitor takes the camera. */
function Stage({ children, idleRef }: { children: ReactNode; idleRef: RefObject<boolean> }) {
  const group = useRef<Group>(null);
  useFrame(({ clock }, delta) => {
    if (!group.current) return;
    const target = idleRef.current ? Math.sin(clock.elapsedTime * 0.18) * 0.32 : group.current.rotation.y;
    group.current.rotation.y += (target - group.current.rotation.y) * Math.min(1, delta * 2);
  });
  return <group ref={group}>{children}</group>;
}

function Ready({ onReady }: { onReady: () => void }) {
  useEffect(() => onReady(), [onReady]);
  return null;
}

export default function DeskScene({ active, onReady }: { active: boolean; onReady: () => void }) {
  const idleRef = useRef(true);
  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      frameloop={active ? 'always' : 'never'}
      camera={{ position: [1.9, 1.9, 2.35], fov: 38, near: 0.05, far: 40 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
    >
      <color attach="background" args={['#15121a']} />
      <fog attach="fog" args={['#15121a', 5, 11]} />
      <Suspense fallback={null}>
        <Environment files={HDRI_URL} environmentIntensity={1.05} />
        <LiveLights />
        <Stage idleRef={idleRef}>
          <Desk />
          <Room />
          <ContactShadows position={[0, 0.002, 0]} scale={4} blur={2.4} far={1.2} opacity={0.55} frames={1} />
        </Stage>
        <Sparkles count={45} scale={[3.2, 1.6, 2.4]} position={[0.2, 1.3, 0.2]} size={1.4} speed={0.18} opacity={0.35} color="#ffe2b8" />
        <Ready onReady={onReady} />
      </Suspense>
      <OrbitControls
        target={TARGET}
        enablePan={false}
        enableDamping
        minDistance={1.6}
        maxDistance={4.2}
        minPolarAngle={0.45}
        maxPolarAngle={1.42}
        minAzimuthAngle={-1.15}
        maxAzimuthAngle={1.15}
        onStart={() => {
          idleRef.current = false;
        }}
      />
    </Canvas>
  );
}

useGLTF.preload(DESK_URL, DRACO_PATH);
