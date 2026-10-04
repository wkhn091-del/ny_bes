'use client';

import { BufferGeometry, Color, type Material, Matrix4, type Mesh, type MeshStandardMaterial, type Object3D } from 'three';

export const KIT_URL = '/models/spacehub-kit.glb';

export type KitPart = { geometry: BufferGeometry; material: Material };
export type KitName =
  | 'ferliDesk'
  | 'woodDesk'
  | 'markusBlack'
  | 'markusBlue'
  | 'leatherChair'
  | 'managerChair'
  | 'conference'
  | 'flatiron'
  | 'books';

/** Top-level node names in the kit file (GLTFLoader turns spaces into underscores). */
const NODES: Record<KitName, RegExp> = {
  ferliDesk: /^Ferli/i,
  woodDesk: /^Wooden_?Desk/i,
  markusBlack: /Markus.*Black/i,
  markusBlue: /Markus.*Blue/i,
  leatherChair: /Offcie|Biege/i,
  managerChair: /Ribbed|Manager/i,
  conference: /^Conference/i,
  flatiron: /^FLATIRON/i,
  books: /^Books/i,
};
const BANK_NODE = /^Small_?Bank/i;

export type Kit = { parts: Partial<Record<KitName, KitPart[]>>; bank: Object3D | null };

/**
 * Bakes each furniture item into parts (geometry in the item's own space + material) ready for instancing,
 * and returns a restyled copy of the stone building for use as a lit neighbour at night.
 */
export function extractKit(scene: Object3D): Kit {
  scene.updateMatrixWorld(true);
  const parts: Kit['parts'] = {};
  let bank: Object3D | null = null;
  const inv = new Matrix4();
  const rel = new Matrix4();

  for (const node of scene.children) {
    if (BANK_NODE.test(node.name)) {
      bank = restyleBank(node.clone(true));
      continue;
    }
    const name = (Object.keys(NODES) as KitName[]).find((k) => NODES[k].test(node.name));
    if (!name) continue;
    inv.copy(node.matrixWorld).invert();
    const list: KitPart[] = [];
    node.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      rel.multiplyMatrices(inv, mesh.matrixWorld);
      const material = (mesh.material as Material).clone();
      if ((material as MeshStandardMaterial).transparent) {
        material.transparent = false;
        material.alphaTest = 0.5;
      }
      list.push({ geometry: mesh.geometry.clone().applyMatrix4(rel), material });
    });
    parts[name] = list;
  }
  return { parts, bank };
}

function restyleBank(root: Object3D): Object3D {
  const done = new Map<string, Material>();
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    const src = mesh.material as MeshStandardMaterial;
    let mat = done.get(src.name);
    if (!mat) {
      const m = src.clone();
      if (/glass/i.test(src.name)) {
        m.color = new Color('#2a1d10');
        m.emissive = new Color('#ffcf8a');
        m.emissiveIntensity = 0.75;
        m.roughness = 0.1;
        m.metalness = 0.4;
      } else if (/stone/i.test(src.name)) {
        m.emissive = new Color('#2e2618');
        m.emissiveIntensity = 0.35;
      }
      mat = m;
      done.set(src.name, m);
    }
    mesh.material = mat;
  });
  return root;
}
