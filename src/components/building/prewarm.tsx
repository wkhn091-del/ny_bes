'use client';

import { useThree } from '@react-three/fiber';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { type Group, type Material, type Mesh, Texture } from 'three';

/**
 * Shows its children only once their shaders are compiled and their textures are on the GPU.
 * three.js otherwise links each new program on first draw and blocks the page for seconds; here the
 * driver compiles in the background (KHR_parallel_shader_compile) while the content stays hidden.
 * `visible` false keeps it mounted and ready but out of sight.
 */
export function Prewarmed({ visible = true, onShown, children }: { visible?: boolean; onShown?: () => void; children: ReactNode }) {
  const ref = useRef<Group>(null);
  const { gl, scene, camera } = useThree();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const g = ref.current;
    if (!g) return;
    let live = true;
    g.visible = true;
    g.traverse((o) => {
      for (const m of [(o as Mesh).material].flat() as (Material | undefined)[]) {
        if (!m) continue;
        for (const v of Object.values(m)) if (v instanceof Texture) gl.initTexture(v);
      }
    });
    const done = () => {
      if (live) setReady(true);
    };
    gl.compileAsync(g, camera, scene).then(done, done);
    g.visible = false;
    return () => {
      live = false;
    };
  }, [gl, scene, camera]);
  useEffect(() => {
    if (ready) onShown?.();
  }, [ready, onShown]);
  return (
    <group ref={ref} visible={visible && ready}>
      {children}
    </group>
  );
}
