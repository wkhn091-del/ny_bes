'use client';

import { type CanvasTexture, Color, type Material, type Mesh, type MeshStandardMaterial, type Object3D } from 'three';
import { codeScreenTexture } from '@/components/building/screens';

export const DRACO_PATH = '/draco/';
export const DESK_URL = '/models/spacehub-desk.glb';
/** Map LOD: desk, chair, monitor and a few large props only; simplified, 256px textures. */
export const DESK_LITE_URL = '/models/spacehub-desk-lite.glb';

/** The source model shipped a third-party OS wallpaper on the monitor; we draw our own screen instead. */
export function drawDeskScreen(): CanvasTexture {
  return codeScreenTexture(0, 'avishai', 960, 540, false);
}

/**
 * Clones the desk scene with shadows on, our own monitor screen, and the coffee-cup logo removed.
 * `screenOn: false` leaves the monitor dark (used for free desks on the map).
 */
export function prepareDesk(scene: Object3D, screen: CanvasTexture, screenOn = true): Object3D {
  const root = scene.clone(true);
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const mat = mesh.material as Material;
    if (mat.name.startsWith('cofee_cup_mat')) {
      const m = (mat as MeshStandardMaterial).clone();
      m.map = null;
      m.color = new Color('#e4d6bd');
      mesh.material = m;
    } else if (mat.name === 'Monitor_screen_mat') {
      const m = (mat as MeshStandardMaterial).clone();
      m.map = screenOn ? screen : null;
      m.emissiveMap = screenOn ? screen : null;
      m.color = new Color(screenOn ? '#ffffff' : '#0b0b10');
      m.emissive = new Color(screenOn ? '#ffffff' : '#000000');
      m.emissiveIntensity = screenOn ? 1.1 : 0;
      m.roughness = 0.25;
      mesh.material = m;
    }
  });
  return root;
}
