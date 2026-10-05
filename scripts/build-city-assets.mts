/**
 * Builds the third-party scenery for the 3D building tour from the original Sketchfab downloads
 * (CC-BY-4.0, credited in docs/asset-licenses.md and on /building):
 *
 *   public/models/nyc-block.glb    New York City by golukumar: the blocks around the tower
 *   public/models/office-exec.glb  Minimalistic Modern Office by dylanheyes: desk, chair, rug and plant for private offices
 *   public/models/loft-lounge.glb  free Loft 17 by dasy444: sofas, armchairs, tables and rugs for the lounge
 *
 * Only the pieces the scene uses are kept; textures become WebP, dense meshes are simplified, and
 * geometry is Draco-compressed (decoder self-hosted under /draco).
 *
 *   CITY_ASSETS_SRC=<folder with the .glb downloads> npx tsx scripts/build-city-assets.mts
 */
import { statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { type Document, NodeIO, type Node } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRDracoMeshCompression } from '@gltf-transform/extensions';
import { clearNodeTransform, dedup, flatten, prune, simplifyPrimitive, textureCompress, weld } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const SRC = process.env.CITY_ASSETS_SRC ?? join(process.env.USERPROFILE ?? process.env.HOME ?? '.', 'Downloads');
const OUT = resolve(process.cwd(), 'public/models');

type Keep = { match: RegExp; as: string; simplify?: number; only?: number };

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

async function build(file: string, out: string, opts: { keep?: Keep[]; maxTexture: number; dropTransmission?: boolean }) {
  const reader = await io();
  const doc = await reader.read(join(SRC, file));
  await bake(doc);
  if (opts.keep) keepOnly(doc, opts.keep);
  if (opts.dropTransmission) {
    for (const ext of doc.getRoot().listExtensionsUsed()) if (ext.extensionName === 'KHR_materials_transmission') ext.dispose();
  }
  await MeshoptSimplifier.ready;
  await doc.transform(
    weld(),
    dedup(),
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
}

void main();
