import { CanvasTexture, SRGBColorSpace } from 'three';

const KEYWORDS = new Set(['import', 'from', 'export', 'async', 'function', 'const', 'await', 'return', 'if', 'new', 'type', 'default', 'true', 'false', 'null']);
const COLORS = { text: '#d6deeb', keyword: '#c792ea', string: '#c3e88d', fn: '#82aaff', type: '#ffcb6b', number: '#f78c6c', comment: '#637777', prompt: '#7fdbca', ok: '#addb67' };

/** Snippets from a booking app, one per screen. */
const SNIPPETS: { file: string; lines: string[] }[] = [
  {
    file: 'app/api/bookings/route.ts',
    lines: [
      "import { calculatePrice } from '@/lib/pricing';",
      "import { BookingSchema } from '@/lib/schemas';",
      '',
      'export async function POST(req: Request) {',
      '  const body = BookingSchema.parse(await req.json());',
      '  const space = await getSpace(body.spaceId);',
      '  // the price is always computed on the server',
      '  const quote = calculatePrice({ space, ...body });',
      '  if (!(await isAvailable(space, body.slot)))',
      "    return Response.json({ error: 'taken' }, { status: 409 });",
      '  const session = await stripe.checkout.sessions.create({',
      "    mode: 'payment',",
      '    line_items: [toLineItem(quote)],',
      '  });',
      '  return Response.json({ url: session.url });',
      '}',
    ],
  },
  {
    file: 'components/FloorCard.tsx',
    lines: [
      "import { useState } from 'react';",
      "import { Button } from '@/components/ui/Button';",
      '',
      'export function FloorCard({ floor }: Props) {',
      '  const [open, setOpen] = useState(false);',
      '  return (',
      '    <section className="rounded-2xl p-6">',
      '      <h2>{floor.title}</h2>',
      '      <p>{floor.seats} seats · {floor.view}</p>',
      '      <Button onClick={() => setOpen(true)}>',
      '        Book a tour',
      '      </Button>',
      '      {open && <TourDialog floor={floor} />}',
      '    </section>',
      '  );',
      '}',
    ],
  },
  {
    file: 'terminal — zsh',
    lines: [
      '$ npm test',
      '  ✓ pricing.test.ts (24)',
      '  ✓ availability.test.ts (18)',
      '  ✓ booking-rules.test.ts (31)',
      '  ✓ roads.test.ts (11)',
      '  Tests  84 passed (84)',
      '',
      '$ git push origin main',
      '  → Building…',
      '  ✓ Compiled in 41s',
      '  ✓ Deployed to production',
      '',
      '$ npm run dev',
      '  ▲ Next.js ready on http://localhost:3000',
      '$ █',
    ],
  },
];

function tokenColor(tok: string, prev: string, next: string): string {
  if (/^['"`]/.test(tok)) return COLORS.string;
  if (KEYWORDS.has(tok)) return COLORS.keyword;
  if (/^\d/.test(tok)) return COLORS.number;
  if (/^[A-Z]\w*$/.test(tok)) return COLORS.type;
  if (/^\w+$/.test(tok) && next === '(') return COLORS.fn;
  if (/^\w+$/.test(tok) && prev === '<') return COLORS.fn;
  return COLORS.text;
}

function drawLine(ctx: CanvasRenderingContext2D, line: string, x: number, y: number, terminal: boolean) {
  if (terminal) {
    ctx.fillStyle = line.startsWith('$') ? COLORS.prompt : line.includes('✓') ? COLORS.ok : COLORS.text;
    ctx.fillText(line, x, y);
    return;
  }
  const comment = line.indexOf('//');
  const code = comment >= 0 ? line.slice(0, comment) : line;
  const tokens = code.match(/'[^']*'|"[^"]*"|\w+|\s+|./g) ?? [];
  let cx = x;
  tokens.forEach((tok, i) => {
    ctx.fillStyle = tokenColor(tok, tokens[i - 1]?.trim() ?? '', tokens[i + 1] ?? '');
    ctx.fillText(tok, cx, y);
    cx += ctx.measureText(tok).width;
  });
  if (comment >= 0) {
    ctx.fillStyle = COLORS.comment;
    ctx.fillText(line.slice(comment), cx, y);
  }
}

/** A dark code editor (or terminal) with syntax colours; `user` shows in the status bar. */
export function codeScreenTexture(variant: number, user: string, w = 768, h = 450, flipY = true): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const k = w / 768;
  const snippet = SNIPPETS[variant % SNIPPETS.length]!;
  const terminal = snippet.file.startsWith('terminal');

  ctx.fillStyle = '#011627';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#0b2942';
  ctx.fillRect(0, 0, w, 30 * k);
  ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc((16 + i * 18) * k, 15 * k, 5 * k, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = '#01111d';
  ctx.fillRect(80 * k, 4 * k, 260 * k, 26 * k);
  ctx.fillStyle = '#d6deeb';
  ctx.font = `${13 * k}px ui-monospace, Menlo, Consolas, monospace`;
  ctx.textBaseline = 'middle';
  ctx.fillText(snippet.file, 92 * k, 17 * k);

  const lineH = 24 * k;
  const top = 50 * k;
  ctx.font = `${15 * k}px ui-monospace, Menlo, Consolas, monospace`;
  snippet.lines.forEach((line, i) => {
    const y = top + i * lineH;
    if (!terminal) {
      ctx.fillStyle = '#4b6479';
      ctx.textAlign = 'right';
      ctx.fillText(String(i + 1), 36 * k, y);
      ctx.textAlign = 'left';
    }
    drawLine(ctx, line, (terminal ? 18 : 52) * k, y, terminal);
  });

  ctx.fillStyle = '#6d28d9';
  ctx.fillRect(0, h - 24 * k, w, 24 * k);
  ctx.fillStyle = '#ffffff';
  ctx.font = `${12 * k}px ui-monospace, Menlo, Consolas, monospace`;
  ctx.fillText(`⎇ main   ${user}@spacehub   ✓ 0 problems`, 12 * k, h - 12 * k);

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  tex.flipY = flipY;
  return tex;
}
