import { CanvasTexture, SRGBColorSpace } from 'three';

/** A desktop-style monitor screen with a person's name, drawn once per name. */
export function nameScreenTexture(name: string): CanvasTexture {
  const w = 512;
  const h = 300;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const font = getComputedStyle(document.body).fontFamily || 'sans-serif';

  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#14123a');
  bg.addColorStop(0.55, '#2a1d6e');
  bg.addColorStop(1, '#0d2b55');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(0, 0, w, 26);
  ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(18 + i * 18, 13, 5, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(0, 26, 92, h - 26);
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i === 1 ? 'rgba(167,139,250,0.55)' : 'rgba(255,255,255,0.14)';
    ctx.fillRect(14, 46 + i * 34, 64, 14);
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(196,181,253,0.9)';
  ctx.font = `600 20px ${font}`;
  ctx.fillText('Welcome back', 302, 92);
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 44px ${font}`;
  ctx.fillText(name, 302, 140, 390);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = `500 17px ${font}`;
  ctx.fillText('SpaceHub · Workspace', 302, 180);

  const bars = [0.45, 0.7, 0.55, 0.9, 0.65, 0.8, 0.5];
  bars.forEach((v, i) => {
    ctx.fillStyle = i === 3 ? '#a78bfa' : 'rgba(139,180,255,0.6)';
    const bh = v * 60;
    ctx.fillRect(150 + i * 44, 272 - bh, 26, bh);
  });

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
