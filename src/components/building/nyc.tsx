'use client';

import { useGLTF } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import { type Material, type Mesh, MeshStandardMaterial, type Object3D, type Vector3 } from 'three';
import { DRACO_PATH } from '@/components/three/desk-model';
import { DAY_UNIFORM } from './sky';

/** "New York City" by golukumar (CC-BY-4.0), compressed by scripts/build-city-assets.mts. */
export const NYC_URL = '/models/nyc-block.glb';

/** Centre of the source model's footprint, and half its size, in metres. */
const SOURCE_CENTER = { x: -61.68, z: 30.56 };
const HALF = { x: 123.9, z: 98.2 };
/** The model's ground sits a little below zero; lift it clear of the city's own ground and streets. */
const LIFT = 0.25;
/** Tallest roof in the model, water towers included. */
export const NYC_TOP = 113;

/** One block behind the tower (east of the side street), one across the avenue to the far left, turned around. */
const BLOCKS = [
  { x: 70, z: -150, rot: 0 },
  { x: -200, z: 175, rot: Math.PI },
] as const;

export const NYC_RECTS = BLOCKS.map((b) => ({ x0: b.x - HALF.x, x1: b.x + HALF.x, z0: b.z - HALF.z, z1: b.z + HALF.z }));

export function inNyc(x: number, z: number, pad = 0): boolean {
  return NYC_RECTS.some((r) => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad);
}

/** Keeps a free camera above the blocks' roofs instead of inside them. */
export function liftOverNyc(p: Vector3) {
  if (p.y < NYC_TOP + 8 && inNyc(p.x, p.z, 6)) p.y = NYC_TOP + 8;
}

const NO_WINDOWS = /foliage|bark|grass|street|lanes|side_?walks|curb|decal|trash|sign|assets|roof|green|wet/i;

/**
 * Night for photographed facades: the dark window panes in the textures light up cell by cell
 * (warm or cool, some off) and the rest of the facade dims; by day the textures show as they are.
 * Cells that shrink toward a pixel fade to their average glow so distant blocks do not sparkle.
 */
function nightFacade(src: MeshStandardMaterial): MeshStandardMaterial {
  const m = src.clone();
  const windows = !NO_WINDOWS.test(src.name);
  if (/glass/i.test(src.name)) {
    m.color.set('#2c3a4c');
    m.metalness = 0.85;
    m.roughness = 0.14;
    m.transparent = false;
    m.opacity = 1;
  }
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uDay = DAY_UNIFORM;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vNycPos;\nvarying vec3 vNycNormal;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
  vNycPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vNycNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vNycPos;\nvarying vec3 vNycNormal;\nuniform float uDay;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
  {
    float night = 1.0 - uDay;
    ${
      windows
        ? `vec3 nn = normalize(vNycNormal);
    if (abs(nn.y) < 0.45) {
      float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
      float u = abs(nn.x) > abs(nn.z) ? vNycPos.z : vNycPos.x;
      vec2 cell = vec2(u / 1.8, vNycPos.y / 3.3);
      vec2 px = fwidth(cell);
      float blur = clamp(max(px.x, px.y) * 2.0 - 0.3, 0.0, 1.0);
      float r = fract(sin(dot(floor(cell), vec2(41.3, 289.1))) * 15731.7);
      float pane = 1.0 - smoothstep(0.03, 0.11, lum);
      vec3 wc = mix(vec3(1.0, 0.74, 0.44), vec3(0.68, 0.8, 1.0), step(0.82, fract(r * 7.31)));
      float glow = pane * mix(step(0.62, r) * (0.45 + 0.55 * fract(r * 13.1)), 0.18, blur);
      totalEmissiveRadiance += wc * glow * night;
    }`
        : ''
    }
    diffuseColor.rgb *= mix(1.0, 0.2, night);
  }`,
      );
  };
  m.customProgramCacheKey = () => `spacehub-nyc-${windows ? 1 : 0}`;
  return m;
}

function prepareNyc(scene: Object3D): { root: Object3D; materials: Material[] } {
  const root = scene.clone(true);
  const done = new Map<Material, Material>();
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    const src = mesh.material as Material;
    let mat = done.get(src);
    if (!mat) {
      mat = src instanceof MeshStandardMaterial ? nightFacade(src) : src;
      done.set(src, mat);
    }
    mesh.material = mat;
  });
  return { root, materials: [...done.values()] };
}

/** Real New York blocks (brick, limestone, glass, water towers, fire escapes, street trees) around the tower. */
export function NycBlocks() {
  const { scene } = useGLTF(NYC_URL, DRACO_PATH);
  const { blocks, materials } = useMemo(() => {
    const { root, materials } = prepareNyc(scene);
    return { blocks: BLOCKS.map((_, i) => (i === 0 ? root : root.clone(true))), materials };
  }, [scene]);
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);
  return (
    <group>
      {BLOCKS.map((b, i) => (
        <group key={i} position={[b.x, LIFT, b.z]} rotation-y={b.rot}>
          <primitive object={blocks[i]!} position={[-SOURCE_CENTER.x, 0, -SOURCE_CENTER.z]} />
        </group>
      ))}
    </group>
  );
}
