/**
 * Builds the third-party scenery for the 3D building tour from the original Sketchfab downloads
 * (CC-BY-4.0, credited in docs/asset-licenses.md and on /building):
 *
 *   public/models/nyc-block.glb    New York City by golukumar: the blocks around the tower
 *   public/models/office-exec.glb  Minimalistic Modern Office by dylanheyes: desk, chair, rug and plant for private offices
 *   public/models/loft-lounge.glb  free Loft 17 by dasy444: sofas, armchairs, tables and rugs for the lounge
 *   public/models/meeting-set.glb  Meeting room by Titank: the boardroom table with its chairs
 *   public/models/road-signs.glb   Road Signs by FrodoUndead: crossing, speed limit, signal ahead and no U-turn
 *   public/models/car-goblin.glb   Fictional supercar - V12 Goblin by ollitei
 *   public/models/car-revuelto.glb Lamborghini Revuelto by DRIVER-FIRE, badges removed
 *   public/models/spacehub-traffic-a.glb  the owner's car1.glb (no attribution needed), badges removed
 *   public/models/lobby-plants.glb    Office Plants pack LOWPOLY by EFX: three boxwood shapes
 *   public/models/lobby-fountain.glb  Zsolnay Fountain by georgiyhazankin: basin and jets
 *   public/models/lobby-reception.glb Reception by Arbin4444: the marble counter only
 *   public/models/lobby-elevator.glb  Elevator with Animation LOWPOLY by EFX: the call panel only
 *
 * Only the pieces the scene uses are kept; textures become WebP, dense meshes are simplified, and
 * geometry is Draco-compressed (decoder self-hosted under /draco).
 *
 *   CITY_ASSETS_SRC=<folder with the .glb downloads> npx tsx scripts/build-city-assets.mts [--skip-nyc] [--only=<out name>]
 */
import { statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { type Document, type mat4, NodeIO, type Node, type Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRDracoMeshCompression } from '@gltf-transform/extensions';
import {
  clearNodeTransform,
  dedup,
  flatten,
  getBounds,
  join as joinPrimitives,
  metalRough,
  prune,
  simplifyPrimitive,
  textureCompress,
  transformMesh,
  weld,
} from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const SRC = process.env.CITY_ASSETS_SRC ?? join(process.env.USERPROFILE ?? process.env.HOME ?? '.', 'Downloads');
const OUT = resolve(process.cwd(), 'public/models');

type Keep = { match: RegExp; as: string; simplify?: number; only?: number; crop?: (x: number, y: number, z: number) => boolean };
/** Turn about Y (radians) applied first, then a uniform scale so the longest horizontal side is `length` metres, centred on the footprint and standing on y = 0. */
type Fit = { turn: number; length: number };

async function io() {
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.encoder': await draco3d.createEncoderModule(),
    'draco3d.decoder': await draco3d.createDecoderModule(),
  });
}

/** Moves every mesh node to the scene root with its transform baked into the vertices. */
async function bake(doc: Document) {
  await doc.transform(flatten());
  for (const node of doc.getRoot().listNodes()) if (node.getMesh()) clearNodeTransform(node);
}

/** Keeps the matching mesh nodes (renamed `as_<n>`), drops everything else. */
function keepOnly(doc: Document, keep: Keep[]) {
  const scene = doc.getRoot().listScenes()[0]!;
  const kept = new Set<Node>();
  const seen = new Map<Keep, number>();
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const rule = keep.find((k) => k.match.test(node.getName()));
    if (!rule) continue;
    const n = seen.get(rule) ?? 0;
    if (rule.only !== undefined && n >= rule.only) continue;
    seen.set(rule, n + 1);
    node.setName(`${rule.as}_${n}`);
    if (rule.crop) for (const prim of mesh.listPrimitives()) cropPrimitive(prim, rule.crop);
    if (rule.simplify) for (const prim of mesh.listPrimitives()) simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: rule.simplify, error: 0.002 });
    kept.add(node);
  }
  for (const node of doc.getRoot().listNodes()) {
    if (kept.has(node)) {
      if (node.getParentNode()) node.getParentNode()!.removeChild(node);
      scene.addChild(node);
    }
  }
  for (const node of doc.getRoot().listNodes()) if (!kept.has(node)) node.dispose();
  for (const rule of keep) if (!seen.has(rule)) throw new Error(`no node matched ${rule.match}`);
}

/** Keeps only the triangles whose centroid passes `inside` (for furniture baked into one mesh with its room). */
function cropPrimitive(prim: Primitive, inside: (x: number, y: number, z: number) => boolean) {
  const pos = prim.getAttribute('POSITION')!;
  const idx = prim.getIndices();
  if (!idx) throw new Error('crop needs indexed geometry');
  const a: number[] = [];
  const b: number[] = [];
  const c: number[] = [];
  const kept: number[] = [];
  for (let t = 0; t < idx.getCount(); t += 3) {
    const i0 = idx.getScalar(t);
    const i1 = idx.getScalar(t + 1);
    const i2 = idx.getScalar(t + 2);
    pos.getElement(i0, a);
    pos.getElement(i1, b);
    pos.getElement(i2, c);
    if (inside((a[0]! + b[0]! + c[0]!) / 3, (a[1]! + b[1]! + c[1]!) / 3, (a[2]! + b[2]! + c[2]!) / 3)) kept.push(i0, i1, i2);
  }
  const ArrayType = idx.getArray()!.constructor as Uint32ArrayConstructor;
  idx.setArray(new ArrayType(kept));
}

/** Turns, scales and recentres everything in the scene (see {@link Fit}). */
function fitScene(doc: Document, fit: Fit) {
  const scene = doc.getRoot().listScenes()[0]!;
  const meshes = new Set(doc.getRoot().listNodes().flatMap((n) => (n.getMesh() ? [n.getMesh()!] : [])));
  const cos = Math.cos(fit.turn);
  const sin = Math.sin(fit.turn);
  const turn: mat4 = [cos, 0, -sin, 0, 0, 1, 0, 0, sin, 0, cos, 0, 0, 0, 0, 1];
  for (const mesh of meshes) transformMesh(mesh, turn);
  const b = getBounds(scene);
  const k = fit.length / Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2]);
  const cx = (b.min[0] + b.max[0]) / 2;
  const cz = (b.min[2] + b.max[2]) / 2;
  const m: mat4 = [k, 0, 0, 0, 0, k, 0, 0, 0, 0, k, 0, -cx * k, -b.min[1] * k, -cz * k, 1];
  for (const mesh of meshes) transformMesh(mesh, m);
}

type BuildOpts = {
  keep?: Keep[];
  maxTexture: number;
  dropTransmission?: boolean;
  /** Mesh nodes using a material whose name matches are removed (brand badges). */
  dropMaterials?: RegExp;
  /** Mesh nodes whose name matches are removed. */
  dropNodes?: RegExp;
  /** With `crop`: also drops nodes wider than this (floor and ceiling slabs whose slivers pass the crop). */
  maxEdge?: number;
  /** Materials that become dark, see-through window glass (three.js does not render the source glass shaders). */
  glass?: RegExp;
  fit?: Fit;
  /** Merges primitives that share a material, so a many-part model draws in a few calls. */
  merge?: boolean;
};

async function build(file: string, out: string, opts: BuildOpts) {
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
  if (only && !out.startsWith(only)) return;
  const reader = await io();
  const doc = await reader.read(resolve(SRC, file));
  await doc.transform(metalRough());
  for (const anim of doc.getRoot().listAnimations()) anim.dispose();
  await bake(doc);
  if (opts.dropMaterials) {
    for (const node of doc.getRoot().listNodes()) {
      const prims = node.getMesh()?.listPrimitives() ?? [];
      for (const p of prims) if (opts.dropMaterials.test(p.getMaterial()?.getName() ?? '')) p.dispose();
      if (node.getMesh() && node.getMesh()!.listPrimitives().length === 0) node.dispose();
    }
  }
  if (opts.dropNodes) for (const node of doc.getRoot().listNodes()) if (opts.dropNodes.test(node.getName())) node.dispose();
  if (opts.maxEdge) {
    for (const node of doc.getRoot().listNodes()) {
      if (!node.getMesh()) continue;
      const b = getBounds(node);
      if (Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2]) > opts.maxEdge * 4) node.dispose();
    }
  }
  if (opts.glass) {
    for (const m of doc.getRoot().listMaterials()) {
      if (!opts.glass.test(m.getName())) continue;
      m.setBaseColorTexture(null).setBaseColorFactor([0.04, 0.05, 0.07, 0.62]).setAlphaMode('BLEND');
      m.setMetallicFactor(0.1).setRoughnessFactor(0.05).setMetallicRoughnessTexture(null);
      for (const ext of m.listExtensions()) m.setExtension(ext.extensionName, null);
    }
  }
  if (opts.keep) keepOnly(doc, opts.keep);
  if (opts.dropTransmission) {
    for (const ext of doc.getRoot().listExtensionsUsed()) if (ext.extensionName === 'KHR_materials_transmission') ext.dispose();
  }
  if (opts.fit) fitScene(doc, opts.fit);
  await MeshoptSimplifier.ready;
  await doc.transform(
    weld(),
    dedup(),
    ...(opts.merge ? [joinPrimitives({ keepNamed: false })] : []),
    prune({ keepLeaves: false }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [opts.maxTexture, opts.maxTexture], quality: 78 }),
  );
  doc
    .createExtension(KHRDracoMeshCompression)
    .setRequired(true)
    .setEncoderOptions({ method: KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER, encodeSpeed: 5, decodeSpeed: 5 });
  const target = join(OUT, out);
  await reader.write(target, doc);
  console.log(`${out}: ${(statSync(target).size / 1048576).toFixed(2)} MB`);
}

async function main() {
  if (!process.argv.includes('--skip-nyc')) await build('new_york_city.glb', 'nyc-block.glb', { maxTexture: 1024, dropTransmission: true });
  const oneTree = (x: number, _y: number, z: number) => Math.abs(x + 141.6) < 5 && Math.abs(z - 71.8) < 5;
  await build(join(OUT, 'nyc-block.glb'), 'nyc-tree.glb', {
    maxTexture: 512,
    keep: [
      { match: /^Object_40$/, as: 'Tree', crop: oneTree },
      { match: /^Object_38$/, as: 'Tree', crop: oneTree },
    ],
  });
  await build(join(OUT, 'nyc-block.glb'), 'nyc-tower.glb', {
    maxTexture: 1024,
    dropMaterials: /Street|lanes|side_?walks|Curb|Grass|Foliage|Bark|Decal|trash|WetFloor|dark_green|^material_0$/i,
    keep: [{ match: /./, as: 'Tower', crop: (x, y, z) => Math.abs(x + 117.6) < 12.6 && Math.abs(z + 32.1) < 17.2 && y > 0.15 }],
    merge: true,
  });
  await build('minimalistic_modern_office.glb', 'office-exec.glb', {
    maxTexture: 1024,
    keep: [
      { match: /_Table(_\d+)?$/, as: 'ExecSet' },
      { match: /_Chair(_\d+)?$/, as: 'ExecSet', simplify: 0.2 },
      { match: /^Carpet/, as: 'ExecSet' },
      { match: /_Plants(_\d+)?$/, as: 'ExecPlant', simplify: 0.15, only: 1 },
    ],
  });
  await build('free_loft_17_interior_floors_view_of_the_city.glb', 'loft-lounge.glb', {
    maxTexture: 1024,
    keep: [
      { match: /^node_0\.001_/, as: 'SofaSet' },
      { match: /^Cylinder_Material/, as: 'SofaSet' },
      { match: /^Plane\.004_/, as: 'SofaSet' },
      { match: /^node_0_S-Remesh\.003_/, as: 'SofaSet' },
      { match: /^node_0_S-Remesh\.00[24]_/, as: 'ArmSet' },
      { match: /^Cylinder\.001_/, as: 'ArmSet' },
      { match: /^Plane\.006_/, as: 'ArmSet' },
      { match: /^Cube\.036_/, as: 'LoftPlant' },
    ],
  });
  await build('meeting_room.glb', 'meeting-set.glb', {
    maxTexture: 2048,
    keep: [{ match: /^bureau_sol_/, as: 'MeetSet', crop: (x, y, z) => x > 16.8 && x < 20.2 && z > -17.6 && z < -12.4 && y > 0.02 && y < 1.6 }],
    fit: { turn: Math.PI / 2, length: 5.4 },
  });
  await build('road_signs.glb', 'road-signs.glb', {
    maxTexture: 1024,
    keep: [
      { match: /^Object_68$/, as: 'SignWalk' },
      { match: /^Object_24$/, as: 'SignSpeed' },
      { match: /^Object_54$/, as: 'SignSignal' },
      { match: /^Object_42$/, as: 'SignNoUturn' },
    ],
  });
  await build('fictional_supercar_-_v12_goblin.glb', 'car-goblin.glb', {
    maxTexture: 512,
    keep: [{ match: /^car_(?!shadow)/, as: 'Car' }],
    fit: { turn: Math.PI, length: 4.6 },
    merge: true,
  });
  await build('reception.glb', 'lobby-reception.glb', {
    maxTexture: 1024,
    keep: [{ match: /./, as: 'Reception', simplify: 0.3, crop: (x, y, z) => x > -3.6 && x < 3.8 && y > -0.1 && y < 1.15 && z > -8.92 && z < -7.4 }],
    maxEdge: 2,
    fit: { turn: Math.PI, length: 6.6 },
    merge: true,
  });
  await build('office_plants_pack_lowpoly.glb', 'lobby-plants.glb', {
    maxTexture: 512,
    keep: [
      { match: /^Boxwood1_/, as: 'PlantBall' },
      { match: /^Boxwood4_/, as: 'PlantCone' },
      { match: /^boxwood3_/, as: 'PlantHedge' },
    ],
    fit: { turn: 0, length: 9.2 },
  });
  await build('zsolnay_fountain.glb', 'lobby-fountain.glb', {
    maxTexture: 1024,
    keep: [
      { match: /^Mesh_0/, as: 'Basin', simplify: 0.12 },
      { match: /^BezierCurve/, as: 'Jets', simplify: 0.4 },
    ],
    fit: { turn: 0, length: 8.6 },
  });
  await build('elevator_with_animation_lowpoly.glb', 'lobby-elevator.glb', {
    maxTexture: 1024,
    keep: [
      { match: /^Door1_/, as: 'DoorL' },
      { match: /^Door2_/, as: 'DoorR' },
      { match: /./, as: 'Cabin' },
    ],
  });
  await build('car1.glb', 'spacehub-traffic-a.glb', {
    maxTexture: 512,
    dropNodes: /^Circle\.00[16]$/,
    glass: /^(Glass|Window)/,
    keep: [{ match: /./, as: 'Car' }],
    fit: { turn: 0, length: 4.85 },
    merge: true,
  });
  await build('lamborghini_revuelto.glb', 'car-revuelto.glb', {
    maxTexture: 1024,
    dropMaterials: /logo|badge/i,
    keep: [{ match: /./, as: 'Car' }],
    fit: { turn: Math.PI / 2, length: 4.95 },
    merge: true,
  });
}

void main();
