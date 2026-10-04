'use client';

import {
  BufferGeometry,
  Color,
  type Material,
  type Mesh,
  MeshStandardMaterial,
  type Object3D,
  type Plane,
} from 'three';

export const BUILDING_URL = '/models/spacehub-building.glb';

/** Measured from the model: office floor surfaces start at 7.6 m and repeat every 5 m; the slab under the next floor sits 0.5 m below it. */
export const FLOOR_COUNT = 23;
export const FIRST_FLOOR_Y = 7.6;
export const FLOOR_PITCH = 5;
export const CLEAR_HEIGHT = 4.5;
export const ROOF_Y = 122.6;
/** Slab extents and the elevator/stair core, in metres. */
export const PLATE = { x: 35, z: 15 };
export const CORE = { x0: -7.2, x1: 7.2, z0: -13.4, z1: 4.4 };

export const floorY = (i: number) => FIRST_FLOOR_Y + i * FLOOR_PITCH;

export type FloorProgram = 'open' | 'offices' | 'meeting';
export const programOf = (i: number): FloorProgram => (['open', 'offices', 'meeting'] as const)[i % 3]!;

export const PROGRAM_COPY: Record<FloorProgram, { title: string; text: string; href: string; cta: string }> = {
  open: {
    title: 'עמדות עבודה',
    text: 'שורות של עמדות באזור פתוח ומואר. מגיעים, מתיישבים ועובדים, לפי שעה.',
    href: '/spaces?type=hotDesk',
    cta: 'לעמדות הפנויות',
  },
  offices: {
    title: 'משרדים פרטיים',
    text: 'משרדי זכוכית לאורך החזית, עם דלת שנסגרת. לשעה או ליום שלם.',
    href: '/spaces?type=privateOffice',
    cta: 'למשרדים הפנויים',
  },
  meeting: {
    title: 'חדרי ישיבות',
    text: 'חדרים לישיבת צוות או לפגישת לקוח, עם שולחן גדול, מסך ולוח.',
    href: '/spaces?type=meetingRoom',
    cta: 'לחדרי הישיבות',
  },
};

export type Cutaway = { uCutMin: { value: number }; uCutMax: { value: number } };
export const createCutaway = (): Cutaway => ({ uCutMin: { value: -1 }, uCutMax: { value: -1 } });

/** Discards facade fragments inside a world-space height band, opening one floor to view. */
function applyCutaway(mat: Material, cut: Cutaway) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uCutMin = cut.uCutMin;
    shader.uniforms.uCutMax = cut.uCutMax;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vCutY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCutY = (modelMatrix * vec4(transformed, 1.0)).y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vCutY;\nuniform float uCutMin;\nuniform float uCutMax;')
      .replace('void main() {', 'void main() {\n  if (vCutY > uCutMin && vCutY < uCutMax) discard;');
  };
  mat.customProgramCacheKey = () => 'spacehub-cutaway';
}

export type BuildingParts = {
  root: Object3D;
  desk: { geometry: BufferGeometry; material: Material } | null;
  exec: { geometry: BufferGeometry; material: Material }[];
};

const DESK_MAT = 'GWC_Desk_02';
const EXEC_MATS = new Set(['Wood', 'Metal', 'Leather']);

/**
 * Clones the building, restyles materials for a night scene, wires the facade cutaway,
 * and pulls the two loose desk models out so they can be instanced across the floors.
 */
export function prepareBuilding(scene: Object3D, cut: Cutaway, clip: Plane[]): BuildingParts {
  const root = scene.clone(true);
  const restyled = new Map<string, Material>();
  let desk: BuildingParts['desk'] = null;
  const exec: BuildingParts['exec'] = [];
  const loose: Object3D[] = [];

  root.updateMatrixWorld(true);
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    const src = mesh.material as MeshStandardMaterial;
    if (src.name === DESK_MAT || EXEC_MATS.has(src.name)) {
      const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
      const material = src.clone();
      material.clippingPlanes = clip;
      if (src.name === DESK_MAT) desk = { geometry, material };
      else exec.push({ geometry, material });
      loose.push(mesh);
      return;
    }
    let mat = restyled.get(src.name);
    if (!mat) {
      const m = src.clone();
      m.clippingPlanes = clip;
      switch (src.name) {
        case 'Glass facade':
          m.color = new Color('#2b4360');
          m.metalness = 0.85;
          m.roughness = 0.06;
          m.transparent = true;
          m.opacity = 0.2;
          m.depthWrite = false;
          m.envMapIntensity = 2.2;
          applyCutaway(m, cut);
          break;
        case 'Aluminum facade':
          m.color = new Color('#8d96a3');
          m.metalness = 0.8;
          m.roughness = 0.35;
          applyCutaway(m, cut);
          break;
        case 'Floor levels':
          m.color = new Color('#6d655c');
          m.emissive = new Color('#3a2a18');
          m.emissiveIntensity = 0.85;
          break;
        case 'White paint':
          m.emissive = new Color('#2a2118');
          m.emissiveIntensity = 0.5;
          break;
        case 'Glass':
          m.transparent = true;
          m.opacity = 0.25;
          m.depthWrite = false;
          break;
      }
      mat = m;
      restyled.set(src.name, m);
    }
    mesh.material = mat;
  });
  loose.forEach((m) => m.removeFromParent());
  return { root, desk, exec };
}
