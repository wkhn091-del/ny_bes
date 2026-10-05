import { Euler, Matrix4, Plane, Quaternion, Vector3 } from 'three';
import { createCutaway, floorY } from '@/components/three/building-model';

/** One scene per page, so the facade cutaway uniforms and the clip plane can live at module scope. */
export const CUT = createCutaway();
/** Everything above this plane is hidden while a floor is open, turning the tower into a cut-away model. */
export const CLIP = new Plane(new Vector3(0, -1, 0), 1e4);
export const CLIP_PLANES = [CLIP];

/**
 * Walker state shared across the scene: \`inside\` once the camera has passed a floor's facade,
 * the street position so traffic can stop at the crossing, and `home` while in the residence next door.
 */
export const WALK = { inside: false, street: false, home: false, x: 0, z: 0 };

export function seededRandom(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** One furniture or fit-out item: floor, position, yaw, facing side and optional explicit size. */
export type Item = {
  f: number;
  x: number;
  z: number;
  r?: number;
  s?: number;
  sx?: number;
  sy?: number;
  sz?: number;
  y?: number;
  meet?: boolean;
  /** Variant index, used to mix furniture models. */
  k?: number;
};

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _p = new Vector3();
const _s = new Vector3();

/** Floor -1 is the lobby/street level, where y is absolute. */
export function composeItem(it: Item, y: number, size: readonly [number, number, number]): Matrix4 {
  _p.set(it.x, (it.f < 0 ? 0 : floorY(it.f)) + (it.y ?? y), it.z);
  _q.setFromEuler(_e.set(0, it.r ?? 0, 0));
  _s.set(it.sx ?? size[0], it.sy ?? size[1], it.sz ?? size[2]);
  return _m.compose(_p, _q, _s);
}

export const ONE = [1, 1, 1] as const;
