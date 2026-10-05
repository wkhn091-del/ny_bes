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

/** Structural columns, 0.8 m square, on the same grid on every floor (measured from the model). */
export const COLUMN_SIZE = 0.8;
export const COLUMN_XS = [-33.5, -24.5, -15.5, -6.5, 6.5, 15.5, 24.5, 33.5];
export const COLUMN_ZS = [-13.5, -4.5, 4.5, 13.5];
export const COLUMNS = COLUMN_XS.flatMap((x) => COLUMN_ZS.map((z) => ({ x, z })));
/** Larger ground-floor piers in front of the lobby glass (outside it), between z 13.1 and 15. */
export const FRONT_PIERS = [-24.5, -15.5, -6.5, 6.5, 15.5, 24.5].map((x) => ({ x, z: 14.05, w: 1.9, d: 1.9 }));

/** Ground floor: lobby floor at 0.6 m on a plinth that ends at z 20, with steps down to the plaza between |x| 5.6. */
export const LOBBY = { floor: 0.6, ceiling: 7.1, glassZ: 13.6, x: 33.6, backZ: -7 };
export const PLINTH = { frontZ: 20, stepsEndZ: 26, stepsHalfX: 5.6 };
/** The opening cut into the lobby glass for the sliding entrance doors. */
export const DOOR = { x: 2.8, top: 3.1, z0: 13.3, z1: 13.9 };
export const ELEVATOR = { x0: -2, x1: 5.1, z: -7 };

/** Walking surface height at a point outside the tower floors: plinth, steps, or street. */
export function groundY(x: number, z: number): number {
  if (Math.abs(x) <= PLATE.x && z <= PLINTH.frontZ) return LOBBY.floor;
  if (Math.abs(x) <= PLINTH.stepsHalfX && z < PLINTH.stepsEndZ) return (LOBBY.floor * (PLINTH.stepsEndZ - z)) / (PLINTH.stepsEndZ - PLINTH.frontZ);
  return 0;
}

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

const DOOR_HOLE = `if (vWorld.x > ${-DOOR.x.toFixed(2)} && vWorld.x < ${DOOR.x.toFixed(2)} && vWorld.y < ${DOOR.top.toFixed(2)} && vWorld.z > ${DOOR.z0.toFixed(2)} && vWorld.z < ${DOOR.z1.toFixed(2)}) discard;`;

/**
 * Cuts the entrance opening out of the lobby glass, and (for facade materials) discards fragments
 * inside a world-space height band, opening one floor to view.
 */
function applyBuildingShader(mat: Material, cut: Cutaway | null) {
  mat.onBeforeCompile = (shader) => {
    if (cut) {
      shader.uniforms.uCutMin = cut.uCutMin;
      shader.uniforms.uCutMax = cut.uCutMax;
    }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    const band = cut ? '\n  if (vWorld.y > uCutMin && vWorld.y < uCutMax) discard;' : '';
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWorld;${cut ? '\nuniform float uCutMin;\nuniform float uCutMax;' : ''}`)
      .replace('void main() {', `void main() {\n  ${DOOR_HOLE}${band}`);
  };
  mat.customProgramCacheKey = () => (cut ? 'spacehub-cutaway' : 'spacehub-door');
}

export type BuildingParts = {
  root: Object3D;
  desk: { geometry: BufferGeometry; material: Material } | null;
  exec: { geometry: BufferGeometry; material: Material }[];
  /** The curtain-wall glass, so the scene can make it more reflective by day. */
  facadeGlass: MeshStandardMaterial | null;
};

/** The tower's own glass draws after the interior glass layers, in a fixed order. */
const FACADE_GLASS_ORDER = 3;
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
  let facadeGlass: MeshStandardMaterial | null = null;
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
          facadeGlass = m;
          break;
        case 'Aluminum facade':
          m.color = new Color('#8d96a3');
          m.metalness = 0.8;
          m.roughness = 0.35;
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
      applyBuildingShader(m, /facade/i.test(src.name) ? cut : null);
      mat = m;
      restyled.set(src.name, m);
    }
    mesh.material = mat;
    if (mat.transparent) mesh.renderOrder = FACADE_GLASS_ORDER;
  });
  loose.forEach((m) => m.removeFromParent());
  return { root, desk, exec, facadeGlass };
}
