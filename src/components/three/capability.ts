'use client';

import { useSyncExternalStore } from 'react';

function subscribeMotion(cb: () => void) {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

/** CPU-emulated WebGL renders the scene on the main thread and freezes the page; those devices get the static fallback. */
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render/i;

let webglSupport: boolean | null = null;
function hasHardwareWebGL(): boolean {
  if (webglSupport !== null) return webglSupport;
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) {
      webglSupport = false;
    } else {
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
      webglSupport = !SOFTWARE_RENDERER.test(renderer);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

/** True when the device should get real-time 3D: motion allowed, hardware WebGL, at least 4 cores. */
export function use3DCapable(): boolean {
  return useSyncExternalStore(
    subscribeMotion,
    () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches && hasHardwareWebGL() && (navigator.hardwareConcurrency ?? 4) >= 4,
    () => false,
  );
}
