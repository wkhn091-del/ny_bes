/**
 * Builds public/models/office-kit.glb ג€” the furniture used by the live 3D floor map.
 * Everything is modelled here from primitives (no third-party assets / licences), merged into a few
 * vertex-coloured meshes so the scene can GPU-instance them, then Draco-compressed.
 *
 *   npm run build:3d
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Document, NodeIO, type Material } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRDracoMeshCompression } from '@gltf-transform/extensions';
import { dedup, prune, weld } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import {
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  Euler,
  IcosahedronGeometry,
  LatheGeometry,
  Matrix4,
  Quaternion,
  SphereGeometry,
  Vector2,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const OUT = resolve(process.cwd(), 'public/models/office-kit.glb');

interface PartOptions {
  at?: [number, number, number];
  rot?: [number, number, number];
  scale?: [number, number, number];
}

function part(geometry: BufferGeometry, color: string, { at = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1] }: PartOptions = {}): BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  g.deleteAttribute('uv');
  g.applyMatrix4(new Matrix4().compose(new Vector3(...at), new Quaternion().setFromEuler(new Euler(...rot)), new Vector3(...scale)));
  // glTF COLOR_0 is linear; three's Color already converts the sRGB hex to linear (ColorManagement).
  const c = new Color(color);
  const colors = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < g.attributes.position.count; i += 1) colors.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new BufferAttribute(colors, 3));
  return g;
}

function merged(parts: BufferGeometry[]): BufferGeometry {
  const joined = mergeGeometries(parts, false);
  if (!joined) throw new Error('mergeGeometries failed');
  const out = mergeVertices(joined, 1e-5);
  out.computeBoundingBox();
  return out;
}

// ---------- models (scene units: seat ג‰ˆ 0.22, desk top ג‰ˆ 0.42) ----------

function chair() {
  const fabric = '#7b808c';
  const frame = '#a1a1aa';
  const fabricParts = [
    part(new RoundedBoxGeometry(0.34, 0.06, 0.32, 3, 0.025), fabric, { at: [0, 0.225, 0.01] }),
    part(new RoundedBoxGeometry(0.32, 0.3, 0.05, 3, 0.025), fabric, { at: [0, 0.42, -0.155], rot: [-0.14, 0, 0] }),
    part(new RoundedBoxGeometry(0.05, 0.03, 0.2, 2, 0.012), '#4a4d55', { at: [0.19, 0.31, 0.0] }),
    part(new RoundedBoxGeometry(0.05, 0.03, 0.2, 2, 0.012), '#4a4d55', { at: [-0.19, 0.31, 0.0] }),
  ];
  const frameParts = [
    part(new CylinderGeometry(0.018, 0.022, 0.15, 12), frame, { at: [0, 0.12, 0] }),
    part(new CylinderGeometry(0.012, 0.012, 0.09, 8), frame, { at: [0.19, 0.265, 0.0] }),
    part(new CylinderGeometry(0.012, 0.012, 0.09, 8), frame, { at: [-0.19, 0.265, 0.0] }),
    part(new RoundedBoxGeometry(0.035, 0.2, 0.02, 2, 0.008), frame, { at: [0, 0.3, -0.175], rot: [-0.14, 0, 0] }),
  ];
  for (let k = 0; k < 5; k += 1) {
    const a = (k / 5) * Math.PI * 2;
    frameParts.push(part(new RoundedBoxGeometry(0.17, 0.022, 0.032, 2, 0.008), frame, { at: [Math.cos(a) * 0.085, 0.045, Math.sin(a) * 0.085], rot: [0, -a, 0] }));
    frameParts.push(part(new SphereGeometry(0.022, 10, 8), '#18181b', { at: [Math.cos(a) * 0.17, 0.022, Math.sin(a) * 0.17] }));
  }
  return { ChairFabric: merged(fabricParts), ChairFrame: merged(frameParts) };
}

function plant() {
  const profile = [
    new Vector2(0.0, 0.0),
    new Vector2(0.07, 0.0),
    new Vector2(0.085, 0.02),
    new Vector2(0.095, 0.2),
    new Vector2(0.1, 0.215),
    new Vector2(0.088, 0.215),
    new Vector2(0.0, 0.2),
  ];
  const pot = merged([
    part(new LatheGeometry(profile, 24), '#e7e2dc'),
    part(new CylinderGeometry(0.087, 0.087, 0.01, 20), '#3f2d22', { at: [0, 0.205, 0] }),
  ]);
  const greens = ['#2f6b3a', '#3d8a4a', '#25582f', '#4a9a55'];
  const leaves: BufferGeometry[] = [];
  const count = 11;
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2 + (i % 2) * 0.3;
    const tilt = 0.5 + (i % 3) * 0.22;
    const len = 0.2 + (i % 4) * 0.035;
    const dir = new Vector3(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt));
    const center = new Vector3(0, 0.22, 0).addScaledVector(dir, len * 0.55);
    leaves.push(
      part(new IcosahedronGeometry(1, 1), greens[i % greens.length], {
        at: [center.x, center.y, center.z],
        rot: [Math.cos(a) * tilt, -a, Math.sin(a) * tilt * 0.6],
        scale: [0.035, len * 0.5, 0.012],
      }),
    );
  }
  return { PlantPot: pot, PlantLeaves: merged(leaves) };
}

function monitor() {
  const body = '#a9adb5';
  return {
    MonitorBody: merged([
      part(new RoundedBoxGeometry(0.17, 0.012, 0.11, 2, 0.005), body, { at: [0, 0.006, 0] }),
      part(new RoundedBoxGeometry(0.025, 0.17, 0.02, 2, 0.006), body, { at: [0, 0.095, -0.02] }),
      part(new RoundedBoxGeometry(0.5, 0.3, 0.022, 3, 0.01), body, { at: [0, 0.29, 0], rot: [-0.06, 0, 0] }),
    ]),
  };
}

function lamp() {
  const shadeProfile = [new Vector2(0.03, 0.12), new Vector2(0.05, 0.11), new Vector2(0.13, 0.015), new Vector2(0.14, 0.0)];
  return {
    LampShade: merged([
      part(new CylinderGeometry(0.005, 0.005, 0.2, 6), '#111113', { at: [0, 0.22, 0] }),
      part(new LatheGeometry(shadeProfile, 28), '#1d1d21'),
    ]),
    LampGlow: merged([part(new CylinderGeometry(0.12, 0.12, 0.006, 24), '#ffffff', { at: [0, 0.012, 0] })]),
  };
}

function person() {
  return {
    PersonBody: merged([
      part(new CapsuleGeometry(0.1, 0.16, 6, 14), '#ffffff', { at: [0, 0.43, -0.02], scale: [1, 1, 0.75] }),
      part(new CapsuleGeometry(0.035, 0.16, 4, 8), '#ffffff', { at: [0.13, 0.4, 0.06], rot: [1.1, 0, 0.15] }),
      part(new CapsuleGeometry(0.035, 0.16, 4, 8), '#ffffff', { at: [-0.13, 0.4, 0.06], rot: [1.1, 0, -0.15] }),
      part(new CapsuleGeometry(0.045, 0.16, 4, 8), '#3a3d46', { at: [0.06, 0.27, 0.1], rot: [Math.PI / 2, 0, 0] }),
      part(new CapsuleGeometry(0.045, 0.16, 4, 8), '#3a3d46', { at: [-0.06, 0.27, 0.1], rot: [Math.PI / 2, 0, 0] }),
    ]),
    PersonHead: merged([part(new SphereGeometry(0.075, 18, 14), '#ffffff', { at: [0, 0.67, -0.01] })]),
  };
}

// ---------- glTF document ----------

async function main() {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('OfficeKit');

  const mat = (name: string, roughness: number, metallic = 0, emissive = false): Material => {
    const m = doc.createMaterial(name).setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(roughness).setMetallicFactor(metallic);
    if (emissive) m.setEmissiveFactor([1, 0.93, 0.8]);
    return m;
  };
  const materials = {
    fabric: mat('fabric', 0.88),
    metal: mat('metal', 0.28, 0.9),
    ceramic: mat('ceramic', 0.45),
    leaf: mat('leaf', 0.65),
    plastic: mat('plastic', 0.32),
    glow: mat('glow', 0.4, 0, true),
    cloth: mat('cloth', 0.8),
    skin: mat('skin', 0.6),
  };

  const meshes: [string, BufferGeometry, Material][] = [];
  const c = chair();
  meshes.push(['ChairFabric', c.ChairFabric, materials.fabric], ['ChairFrame', c.ChairFrame, materials.metal]);
  const p = plant();
  meshes.push(['PlantPot', p.PlantPot, materials.ceramic], ['PlantLeaves', p.PlantLeaves, materials.leaf]);
  meshes.push(['MonitorBody', monitor().MonitorBody, materials.plastic]);
  const l = lamp();
  meshes.push(['LampShade', l.LampShade, materials.plastic], ['LampGlow', l.LampGlow, materials.glow]);
  const h = person();
  meshes.push(['PersonBody', h.PersonBody, materials.cloth], ['PersonHead', h.PersonHead, materials.skin]);

  for (const [name, geo, material] of meshes) {
    const vertexCount = geo.attributes.position.count;
    const accessor = (type: 'VEC3' | 'SCALAR', array: Float32Array<ArrayBuffer> | Uint16Array<ArrayBuffer> | Uint32Array<ArrayBuffer>) =>
      doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
    const index = geo.index!;
    const prim = doc
      .createPrimitive()
      .setAttribute('POSITION', accessor('VEC3', new Float32Array(geo.attributes.position.array)))
      .setAttribute('NORMAL', accessor('VEC3', new Float32Array(geo.attributes.normal.array)))
      .setAttribute('COLOR_0', accessor('VEC3', new Float32Array(geo.attributes.color.array)))
      .setIndices(accessor('SCALAR', vertexCount > 65535 ? new Uint32Array(index.array) : new Uint16Array(index.array)))
      .setMaterial(material);
    scene.addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim)));
  }

  await doc.transform(weld(), dedup(), prune());
  doc
    .createExtension(KHRDracoMeshCompression)
    .setRequired(true)
    .setEncoderOptions({ method: KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER, encodeSpeed: 5, decodeSpeed: 5 });

  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.encoder': await draco3d.createEncoderModule(),
    'draco3d.decoder': await draco3d.createDecoderModule(),
  });
  mkdirSync(dirname(OUT), { recursive: true });
  await io.write(OUT, doc);
  console.log(`wrote ${OUT} (${meshes.length} meshes)`);

  // Self-hosted decoder (CSP allows no third-party script/wasm hosts); kept in lockstep with the installed three.
  const decoderSrc = resolve(process.cwd(), 'node_modules/three/examples/jsm/libs/draco/gltf');
  const decoderOut = resolve(process.cwd(), 'public/draco');
  mkdirSync(decoderOut, { recursive: true });
  for (const file of ['draco_decoder.wasm', 'draco_wasm_wrapper.js', 'draco_decoder.js']) {
    copyFileSync(resolve(decoderSrc, file), resolve(decoderOut, file));
  }
  console.log(`copied Draco decoder to ${decoderOut}`);
}

void main();
