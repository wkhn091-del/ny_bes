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

/**
 * Copies of the block around the tower, kept clear of the plaza, the avenue, the side street and
 * the neighbouring building. Blocks seen up close keep every detail; `lite` ones, seen only from
 * afar, drop the street furniture, fire escapes and rooftop clutter to stay light on phones.
 */
const BLOCKS: readonly { x: number; z: number; rot: number; lite?: boolean }[] = [
  { x: 70, z: -150, rot: 0 },
  { x: -200, z: 175, rot: Math.PI },
  { x: 80, z: 170, rot: 0 },
  { x: -200, z: -72, rot: Math.PI },
  { x: 340, z: 170, rot: Math.PI, lite: true },
  { x: 330, z: -150, rot: Math.PI, lite: true },
  { x: 70, z: -352, rot: Math.PI, lite: true },
  { x: -200, z: -272, rot: 0, lite: true },
];
const LITE_DROP = /Street_Assets|firescape|trash|WetFloor|Decal|CityGenAC|Vent|solar|rooftop_tank|Foliage|Bark/i;

function liteCopy(root: Object3D): Object3D {
  const copy = root.clone(true);
  const drop: Object3D[] = [];
  copy.traverse((obj) => {
    const mesh = obj as Mesh;
    if (mesh.isMesh && LITE_DROP.test((mesh.material as Material).name)) drop.push(mesh);
  });
  for (const mesh of drop) mesh.removeFromParent();
  return copy;
}

export const NYC_RECTS = BLOCKS.map((b) => ({ x0: b.x - HALF.x, x1: b.x + HALF.x, z0: b.z - HALF.z, z1: b.z + HALF.z }));

export function inNyc(x: number, z: number, pad = 0): boolean {
  return NYC_RECTS.some((r) => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad);
}

/** Keeps a free camera above the blocks' roofs instead of inside them. */
export function liftOverNyc(p: Vector3) {
  if (p.y < NYC_TOP + 8 && inNyc(p.x, p.z, 6)) p.y = NYC_TOP + 8;
}

/** Streets and pavements: kept matte so they don't mirror the studio lights' violet and blue. */
const GROUND = /streets|lanes|side_?walks|curb|wet/i;
const NO_WINDOWS = /foliage|bark|grass|street|lanes|side_?walks|curb|decal|trash|sign|assets|roof|green|wet/i;

/**
 * Night for photographed facades: the dark window panes in the textures light up cell by cell
 * (warm or cool, some off) and the rest of the facade dims; by day the textures show as they are.
 * Cells that shrink toward a pixel fade to their average glow so distant blocks do not sparkle.
 */
function nightFacade(src: MeshStandardMaterial): MeshStandardMaterial {
  const m = src.clone();
  const windows = !NO_WINDOWS.test(src.name);
  if (/foliage/i.test(src.name)) {
    m.transparent = false;
    m.alphaTest = 0.4;
    m.depthWrite = true;
  }
  if (GROUND.test(src.name)) {
    m.roughness = 1;
    m.metalness = 0;
    m.envMapIntensity = 0.25;
  }
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

/** One complete tower (base, facade, rooftop plant and water tank) cut from the same model, standing alone. */
export const NYC_TOWER_URL = '/models/nyc-tower.glb';
const TOWER_CENTER = { x: -117.9, z: -32.06 };

/** The neighbouring building beside the tower. */
export function NycTower({ at }: { at: readonly [number, number, number] }) {
  const { scene } = useGLTF(NYC_TOWER_URL, DRACO_PATH);
  const { root, materials } = useMemo(() => prepareNyc(scene), [scene]);
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);
  return (
    <group position={[at[0], at[1], at[2]]}>
      <primitive object={root} position={[-TOWER_CENTER.x, 0, -TOWER_CENTER.z]} />
    </group>
  );
}

/** Built by scripts/build-lite-assets.mts: the same block without clutter and with 256 px textures, for phones. */
export const NYC_LITE_URL = '/models/nyc-block-lite.glb';

/**
 * Real New York blocks (brick, limestone, glass, water towers, fire escapes, street trees) around the tower.
 * `lite` (phones): the light model, and only the four blocks next to the tower; the far skyline fills the rest.
 */
export function NycBlocks({ lite = false }: { lite?: boolean }) {
  const { scene } = useGLTF(lite ? NYC_LITE_URL : NYC_URL, DRACO_PATH);
  const shown = useMemo(() => (lite ? BLOCKS.filter((b) => !b.lite) : BLOCKS), [lite]);
  const { blocks, materials } = useMemo(() => {
    const { root, materials } = prepareNyc(scene);
    return { blocks: shown.map((b, i) => (i === 0 ? root : b.lite ? liteCopy(root) : root.clone(true))), materials };
  }, [scene, shown]);
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);
  return (
    <group>
      {shown.map((b, i) => (
        <group key={i} position={[b.x, LIFT, b.z]} rotation-y={b.rot}>
          <primitive object={blocks[i]!} position={[-SOURCE_CENTER.x, 0, -SOURCE_CENTER.z]} />
        </group>
      ))}
    </group>
  );
}
