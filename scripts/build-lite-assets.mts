/**
 * Phone versions of the heaviest tour assets, built from the full ones in public/models:
 *
 *   public/models/nyc-block-lite.glb  nyc-block.glb without street furniture, fire escapes and rooftop
 *                                     clutter, textures at 256 px (seen from the overview on phones)
 *
 *   npx tsx scripts/build-lite-assets.mts
 */
import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRDracoMeshCompression } from '@gltf-transform/extensions';
import { dedup, prune, textureCompress } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';

/** Same list the scene uses for its far blocks (src/components/building/nyc.tsx). */
const LITE_DROP = /Street_Assets|firescape|trash|WetFloor|Decal|CityGenAC|Vent|solar|rooftop_tank|Foliage|Bark/i;

const models = resolve(import.meta.dirname, '..', 'public', 'models');
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule() });

const doc = await io.read(resolve(models, 'nyc-block.glb'));
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  for (const prim of mesh.listPrimitives()) if (LITE_DROP.test(prim.getMaterial()?.getName() ?? '')) prim.dispose();
  if (mesh.listPrimitives().length === 0) node.setMesh(null);
}
await doc.transform(prune(), dedup(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [256, 256], quality: 80 }));
doc.createExtension(KHRDracoMeshCompression).setRequired(true).setEncoderOptions({ method: KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER });
const out = resolve(models, 'nyc-block-lite.glb');
await io.write(out, doc);
console.log(`nyc-block-lite.glb ${(statSync(out).size / 1024 / 1024).toFixed(2)} MB`);
