import { CanvasTexture, SRGBColorSpace } from 'three';
import type { SpaceOffer } from './offers';

function bodyFont(): string {
  return getComputedStyle(document.body).fontFamily || 'sans-serif';
}

function finish(canvas: HTMLCanvasElement): CanvasTexture {
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Portrait lobby totem: the kinds of space with their live "from" prices. */
export function totemTexture(offers: SpaceOffer[]): CanvasTexture {
  const w = 600;
  const h = 1000;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const font = bodyFont();
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#1b1046');
  bg.addColorStop(1, '#090616');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 72px ${font}`;
  ctx.fillText('SpaceHub', w / 2, 120);
  ctx.fillStyle = '#c4b5fd';
  ctx.font = `700 44px ${font}`;
  ctx.fillText('להזמין חלל עכשיו', w / 2, 200);
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font = `500 28px ${font}`;
  ctx.fillText('לפי שעה · בלי מנוי · מחיר סופי', w / 2, 250);
  offers.slice(0, 3).forEach((o, i) => {
    const y = 300 + i * 180;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.roundRect(40, y, w - 80, 150, 24);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 44px ${font}`;
    ctx.fillText(o.title, w / 2, y + 62);
    ctx.fillStyle = '#a78bfa';
    ctx.font = `800 40px ${font}`;
    ctx.fillText(`החל מ-${o.from} ${o.unit}`, w / 2, y + 118);
  });
  ctx.fillStyle = '#7c3aed';
  ctx.beginPath();
  ctx.roundRect(70, h - 140, w - 140, 84, 42);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 38px ${font}`;
  ctx.fillText('מזמינים באתר בדקה', w / 2, h - 86);
  return finish(canvas);
}

/** Landscape poster in the residence foyer: a desk near home. */
export function nearHomeTexture(offer: SpaceOffer | undefined): CanvasTexture {
  const w = 900;
  const h = 560;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const font = bodyFont();
  ctx.fillStyle = '#16120d';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#b8975c';
  ctx.lineWidth = 6;
  ctx.strokeRect(18, 18, w - 36, h - 36);
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e2c387';
  ctx.font = `600 34px ${font}`;
  ctx.fillText('לדיירי הבניין', w / 2, 100);
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 64px ${font}`;
  ctx.fillText('עובדים מהבית?', w / 2, 190);
  ctx.font = `600 40px ${font}`;
  ctx.fillText('עמדה שקטה ב-SpaceHub, קרוב לבית', w / 2, 262);
  if (offer) {
    ctx.fillStyle = '#e2c387';
    ctx.font = `800 52px ${font}`;
    ctx.fillText(`החל מ-${offer.from} ${offer.unit}`, w / 2, 360);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = `500 30px ${font}`;
  ctx.fillText('בלי מנוי · ביטול חינם · מזמינים באתר', w / 2, 450);
  return finish(canvas);
}
