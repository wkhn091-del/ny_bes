'use client';

import { useGLTF, useTexture } from '@react-three/drei';
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Box3, type Material, type Mesh, type MeshStandardMaterial, type Object3D, SRGBColorSpace, type Texture } from 'three';
import { COLUMN_XS, CORE, floorY } from '@/components/three/building-model';
import { DRACO_PATH } from '@/components/three/desk-model';
import type { KitPart } from '@/components/three/kit-model';
import type { Layout } from './layout';
import type { Item } from './shared';

/** "Minimalistic Modern Office" by dylanheyes (CC-BY-4.0): executive desk, chair and rug as one set, and a potted plant. */
export const EXEC_URL = '/models/office-exec.glb';
/** "free Loft 17" by dasy444 (CC-BY-4.0): leather sectional lounge set, armchair pair, vase. */
export const LOUNGE_URL = '/models/loft-lounge.glb';
/** "Meeting room" by Titank (CC-BY-4.0): boardroom table with twelve chairs, long side along X. */
export const MEET_URL = '/models/meeting-set.glb';

/** Group names written by scripts/build-city-assets.mts: `<Group>_<n>`. */
const GROUP_NAME = /^([A-Z][A-Za-z]+)_\d+$/;

export type Groups = Partial<Record<string, KitPart[]>>;

/**
 * Bakes each named group from the asset files into instancing-ready parts: geometry moved so the
 * group stands on y = 0 centred on its footprint, then turned by `turn[group]` to face +Z.
 */
export function groupsOf(scene: Object3D, turn: Record<string, number> = {}): Groups {
  scene.updateMatrixWorld(true);
  const raw = new Map<string, KitPart[]>();
  scene.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    let owner: Object3D | null = mesh;
    while (owner && !GROUP_NAME.test(owner.name)) owner = owner.parent;
    if (!owner) return;
    const key = GROUP_NAME.exec(owner.name)![1]!;
    const material = (mesh.material as Material).clone();
    if ((material as MeshStandardMaterial).transparent) {
      material.transparent = false;
      material.alphaTest = 0.5;
    }
    const list = raw.get(key) ?? [];
    list.push({ geometry: mesh.geometry.clone().applyMatrix4(mesh.matrixWorld), material });
    raw.set(key, list);
  });
  const out: Groups = {};
  const box = new Box3();
  for (const [key, parts] of raw) {
    box.makeEmpty();
    for (const p of parts) {
      p.geometry.computeBoundingBox();
      box.union(p.geometry.boundingBox!);
    }
    const cx = (box.min.x + box.max.x) / 2;
    const cz = (box.min.z + box.max.z) / 2;
    for (const p of parts) {
      p.geometry.translate(-cx, -box.min.y, -cz);
      if (turn[key]) p.geometry.rotateY(turn[key]!);
    }
    out[key] = parts;
  }
  return out;
}

export function disposeGroups(g: Groups) {
  for (const parts of Object.values(g)) for (const p of parts ?? []) {
    p.geometry.dispose();
    p.material.dispose();
  }
}

/** The office set's sitter faces +X in the source file; a quarter turn makes them face +Z like the rest of the kit. */
const EXEC_TURN = -Math.PI / 2;
const nearColumn = (x: number, clear: number) => COLUMN_XS.some((cx) => Math.abs(cx - x) < clear);

/** Placements on the open floor for the realistic sets, from the floor's layout. */
export function realisticSet(layout: Layout, f: number) {
  const exec = layout.exec.filter((it) => it.f === f);
  const plants: Item[] = [];
  for (const it of exec) {
    const side = it.r ? 1 : -1;
    for (const dx of [2.3, -2.3]) {
      const x = it.x + dx;
      if (!nearColumn(x, 1.1)) {
        plants.push({ f, x, z: side * 14.15, r: dx });
        break;
      }
    }
  }
  for (const it of layout.plants) if (it.f === f) plants.push({ ...it, sx: (it.s ?? 1) * 0.75, sy: (it.s ?? 1) * 0.75, sz: (it.s ?? 1) * 0.75 });
  const lounges = layout.lounge.filter((it) => it.f === f);
  return {
    exec,
    meetings: layout.tables.filter((it) => it.f === f),
    plants,
    sofas: lounges.map((it) => ({ ...it, r: Math.PI })),
    vases: lounges.flatMap((it) => [-3.4, 3.4].map((dx) => ({ f, x: it.x + dx, z: it.z + 2.3 }))),
  };
}

type Instances = (props: { parts: KitPart[] | undefined; items: Item[] }) => ReactNode;

/** Real furniture from the asset files on the open floor: executive offices, meeting rooms and the lounge. */
export function RealisticFurniture({ layout, selected, Instances }: { layout: Layout; selected: number; Instances: Instances }) {
  const exec = useGLTF(EXEC_URL, DRACO_PATH);
  const loft = useGLTF(LOUNGE_URL, DRACO_PATH);
  const meet = useGLTF(MEET_URL, DRACO_PATH);
  const g = useMemo(
    () => ({ ...groupsOf(exec.scene, { ExecSet: EXEC_TURN }), ...groupsOf(loft.scene), ...groupsOf(meet.scene) }),
    [exec.scene, loft.scene, meet.scene],
  );
  useEffect(() => () => disposeGroups(g), [g]);
  const set = useMemo(() => realisticSet(layout, selected), [layout, selected]);
  return (
    <>
      <Instances parts={g.ExecSet} items={set.exec} />
      <Instances parts={g.MeetSet} items={set.meetings} />
      <Instances parts={g.ExecPlant} items={set.plants} />
      <Instances parts={g.SofaSet} items={set.sofas} />
      <Instances parts={g.LoftPlant} items={set.vases} />
    </>
  );
}

/** Renders of our own spaces (each one labelled as an illustration on the page), shown on screens and walls inside the tower. */
const PHOTOS = [
  '/images/renders/tlv-rothschild-meeting-large.webp',
  '/images/renders/tlv-sarona-office-a.webp',
  '/images/renders/haifa-port-hot-desk.webp',
  '/images/renders/jerusalem-center-meeting-small.webp',
  '/images/renders/tlv-rothschild-office-b.webp',
  '/images/renders/beer-sheva-gav-yam-hot-desk.webp',
  '/images/renders/tlv-sarona-meeting-large.webp',
  '/images/renders/haifa-port-office-a.webp',
  '/images/renders/jerusalem-center-hot-desk.webp',
  '/images/renders/tlv-rothschild-hot-desk.webp',
];
const SLIDE_SECONDS = 8;
const SCREEN_PHOTO = [1.5, 0.84] as const;
const FRAME = [1.7, 1.12] as const;
const PRINT = [1.56, 0.98] as const;
const GALLERY_Z = [-8.3, -5.95, -3.6];
/** The core's finished side walls (its cladding stands proud of the structural CORE box; booths and shelves sit against it). */
const CORE_FACE_X = CORE.x1 + 0.27;

function asPhotos(textures: Texture[]) {
  for (const t of textures) {
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    t.needsUpdate = true;
  }
}

/**
 * Photos of the spaces inside the open floor: a slideshow on every meeting-room screen and a gallery
 * of framed prints on both sides of the core.
 */
export function SpacePhotos({ layout, selected }: { layout: Layout; selected: number }) {
  const textures = useTexture(PHOTOS);
  useLayoutEffect(() => asPhotos(textures), [textures]);
  const [slide, setSlide] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setSlide((s) => s + 1), SLIDE_SECONDS * 1000);
    return () => window.clearInterval(id);
  }, []);
  const y = floorY(selected);
  const screens = useMemo(() => layout.screens.filter((it) => it.f === selected), [layout, selected]);
  const gallery = useMemo(() => [1, -1].flatMap((side) => GALLERY_Z.map((z, i) => ({ side, z, k: i + (side > 0 ? 0 : 3) }))), []);
  return (
    <group>
      {screens.map((it, i) => (
        <mesh key={`s${i}`} position={[it.x + 0.03, y + 1.5, it.z]} rotation-y={Math.PI / 2}>
          <planeGeometry args={SCREEN_PHOTO} />
          <meshBasicMaterial map={textures[(i + slide) % textures.length]} toneMapped={false} color="#e6e6e6" />
        </mesh>
      ))}
      {gallery.map((p) => {
        const x = p.side * CORE_FACE_X;
        const turn = (p.side * Math.PI) / 2;
        return (
          <group key={`g${p.side}${p.z}`} position={[x, y + 1.65, p.z]} rotation-y={turn}>
            <mesh position={[0, 0, 0.025]}>
              <boxGeometry args={[FRAME[0], FRAME[1], 0.05]} />
              <meshStandardMaterial color="#17171b" roughness={0.4} metalness={0.3} />
            </mesh>
            <mesh position={[0, 0, 0.052]}>
              <planeGeometry args={PRINT} />
              <meshStandardMaterial map={textures[(p.k + 4) % textures.length]} roughness={0.55} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}