import type { RefObject } from 'react';
import type { Vector3 } from 'three';

/** Look and keyboard state shared by the first-person rigs (office room, building floors). */
export type LookState = {
  yaw: number;
  pitch: number;
  yawGoal: number | null;
  keys: Set<string>;
  inside: boolean;
};

const MOVE_KEYS = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const yawToward = (from: Vector3, to: Vector3) => Math.atan2(-(to.x - from.x), -(to.z - from.z));

/** Drag-to-look on the canvas and WASD/arrow keys (inside only). Returns the unbind function. */
export function bindLookControls(el: HTMLElement, nav: RefObject<LookState>): () => void {
  let drag: { id: number; x: number; y: number } | null = null;
  const down = (e: PointerEvent) => {
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const move = (e: PointerEvent) => {
    if (!drag || drag.id !== e.pointerId) return;
    const n = nav.current;
    n.yaw += (e.clientX - drag.x) * 0.0035;
    n.pitch = clamp(n.pitch + (e.clientY - drag.y) * 0.0035, -0.9, 0.7);
    n.yawGoal = null;
    drag.x = e.clientX;
    drag.y = e.clientY;
  };
  const up = () => {
    drag = null;
  };
  const keyDown = (e: KeyboardEvent) => {
    if (!nav.current.inside || isTyping(e.target)) return;
    const k = e.key.toLowerCase();
    if (!MOVE_KEYS.includes(k)) return;
    nav.current.keys.add(k);
    if (k.startsWith('arrow')) e.preventDefault();
  };
  const keyUp = (e: KeyboardEvent) => {
    nav.current.keys.delete(e.key.toLowerCase());
  };
  const blur = () => nav.current.keys.clear();
  const win: [string, EventListener][] = [
    ['pointermove', move as EventListener],
    ['pointerup', up],
    ['pointercancel', up],
    ['keydown', keyDown as EventListener],
    ['keyup', keyUp as EventListener],
    ['blur', blur],
  ];
  el.addEventListener('pointerdown', down);
  win.forEach(([t, fn]) => window.addEventListener(t, fn));
  return () => {
    el.removeEventListener('pointerdown', down);
    win.forEach(([t, fn]) => window.removeEventListener(t, fn));
  };
}

/** Writes the walk direction for the held keys into `out`; returns false when nothing moves. */
export function keyDirection(keys: Set<string>, yaw: number, out: Vector3): boolean {
  const fwd = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
  const side = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  out.set(-s * fwd + c * side, 0, -c * fwd - s * side);
  if (out.lengthSq() === 0) return false;
  out.normalize();
  return true;
}

/** Outside, vertical swipes still scroll the page; inside, every touch drives the view. */
export function setTouchMode(el: HTMLElement, inside: boolean) {
  el.style.touchAction = inside ? 'none' : 'pan-y';
}

/** Portrait screens see too little sideways at the desktop FOV, so widen it as the aspect narrows. */
export function fovFor(aspect: number): number {
  return aspect >= 1 ? 62 : Math.min(80, 62 + (1 - aspect) * 40);
}
