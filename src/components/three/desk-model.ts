'use client';

import { CanvasTexture, Color, SRGBColorSpace, type Material, type Mesh, type MeshStandardMaterial, type Object3D } from 'three';

export const DRACO_PATH = '/draco/';
export const DESK_URL = '/models/spacehub-desk.glb';
/** Map LOD: desk, chair, monitor and a few large props only; simplified, 256px textures. */
export const DESK_LITE_URL = '/models/spacehub-desk-lite.glb';

/** The source model shipped a third-party OS wallpaper on the monitor; we draw our own screen instead. */
export function drawDeskScreen(): CanvasTexture {
  const w = 960;
  const h = 540;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const font = getComputedStyle(document.body).fontFamily || 'sans-serif';

  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#120a24');
  bg.addColorStop(1, '#2a1260');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 54px ${font}`;
  ctx.fillText('SpaceHub', w - 56, 96);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = `500 30px ${font}`;
  ctx.fillText('ההזמנה שלך מאושרת', w - 56, 150);

  const cards = [
    { label: 'עמדה חמה', time: '09:00–13:00', free: true },
    { label: 'חדר ישיבות קטן', time: '14:00–15:30', free: true },
    { label: 'משרד פרטי', time: 'יום שלם', free: false },
  ];
  cards.forEach((c, i) => {
    const y = 200 + i * 98;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.roundRect(56, y, w - 112, 78, 18);
    ctx.fill();
    ctx.fillStyle = c.free ? '#a78bfa' : 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.arc(w - 96, y + 39, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 30px ${font}`;
    ctx.fillText(c.label, w - 128, y + 50);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = `500 26px ${font}`;
    ctx.fillText(c.time, 92, y + 49);
    ctx.textAlign = 'right';
  });

  const tex = new CanvasTexture(canvas);
  tex.flipY = false;
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
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
