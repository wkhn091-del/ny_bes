import { Color, Vector3 } from 'three';

export type SkyMode = 'auto' | 'day' | 'night';

const RAD = Math.PI / 180;
const TEL_AVIV = { lat: 32.08, lon: 34.78 };

/**
 * Sun altitude and azimuth (radians; azimuth from north, clockwise) for Tel Aviv at `date`.
 * Low-precision solar ephemeris, good to a fraction of a degree, which is plenty for lighting.
 */
export function sunPosition(date: Date, lat = TEL_AVIV.lat, lon = TEL_AVIV.lon): { alt: number; az: number } {
  const d = date.getTime() / 86_400_000 + 2440587.5 - 2451545.0;
  const g = (357.529 + 0.98560028 * d) * RAD;
  const q = 280.459 + 0.98564736 * d;
  const l = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const e = (23.439 - 0.00000036 * d) * RAD;
  const ra = Math.atan2(Math.cos(e) * Math.sin(l), Math.cos(l));
  const dec = Math.asin(Math.sin(e) * Math.sin(l));
  const gmst = (((18.697374558 + 24.06570982441908 * d) % 24) + 24) % 24;
  const ha = (gmst * 15 + lon) * RAD - ra;
  const phi = lat * RAD;
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha));
  const az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(ha));
  return { alt, az: (az + 2 * Math.PI) % (2 * Math.PI) };
}

/** 0 at night, 1 in full daylight; civil twilight (sun just below the horizon) blends between them. */
export function daylightOf(alt: number): number {
  const t = Math.min(1, Math.max(0, (alt + 0.1) / 0.22));
  return t * t * (3 - 2 * t);
}

/** Scene axes: north is -z, east is +x. */
export function sunDirection(alt: number, az: number, out: Vector3): Vector3 {
  return out.set(Math.sin(az) * Math.cos(alt), Math.sin(alt), -Math.cos(az) * Math.cos(alt)).normalize();
}

/** Fixed afternoon sun for the "day" override, and a high moon for "night". */
const FORCED_DAY = { alt: 48 * RAD, az: 235 * RAD };
const MOON = { alt: 40 * RAD, az: 300 * RAD };

export function skyTarget(mode: SkyMode, now: Date): { day: number; alt: number; az: number } {
  if (mode === 'day') return { day: 1, ...FORCED_DAY };
  if (mode === 'night') return { day: 0, ...MOON };
  const sun = sunPosition(now);
  const day = daylightOf(sun.alt);
  return day > 0 ? { day, ...sun } : { day, ...MOON };
}

/**
 * Live sky state shared by the scene's materials and lights. `day` eases toward its target so
 * sunrise, sunset and the manual switch fade instead of snapping.
 */
export const SKY = {
  day: 0,
  /** Low sun: 1 at the horizon, 0 once the sun is high. */
  warm: 0,
  sun: new Vector3(0.3, 0.7, -0.6),
};

/** One uniform object shared by every shader that reacts to daylight. */
export const DAY_UNIFORM = { value: 0 };

/** A material whose colour moves between a night and a day value with the light. */
export type DayTint = { material: { color: Color }; night: Color; day: Color };

export function dayTint(material: { color: Color }, night: string, day: string): DayTint {
  return { material, night: new Color(night), day: new Color(day) };
}

export function applyDayTints(tints: DayTint[]) {
  for (const t of tints) t.material.color.copy(t.night).lerp(t.day, SKY.day);
}

const NIGHT_ZENITH = new Color(0.006, 0.01, 0.028);
const NIGHT_HORIZON = new Color(0.03, 0.045, 0.1);
const DAY_ZENITH = new Color(0.14, 0.32, 0.72);
const DAY_HORIZON = new Color(0.62, 0.74, 0.88);
const WARM_HORIZON = new Color(0.98, 0.56, 0.32);

/** Horizon colour for the current sky (fog uses it so distant city melts into the sky). */
export function horizonColor(out: Color): Color {
  const day = out.copy(DAY_HORIZON).lerp(WARM_HORIZON, SKY.warm * 0.75);
  return day.lerp(NIGHT_HORIZON, 1 - SKY.day);
}

export const SKY_SHADER = {
  vertex: /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`,
  fragment: /* glsl */ `
uniform float uDay;
uniform float uWarm;
uniform float uTime;
uniform vec3 uSun;
uniform vec3 uNightZenith;
uniform vec3 uNightHorizon;
uniform vec3 uDayZenith;
uniform vec3 uDayHorizon;
uniform vec3 uWarmHorizon;
varying vec3 vDir;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}

void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 dayHorizon = mix(uDayHorizon, uWarmHorizon, uWarm * 0.75);
  vec3 zenith = mix(uNightZenith, uDayZenith * (1.0 - 0.35 * uWarm), uDay);
  vec3 horizon = mix(uNightHorizon, dayHorizon, uDay);
  vec3 col = mix(horizon, zenith, pow(h, 0.5));

  float s = max(dot(d, normalize(uSun)), 0.0);
  vec3 sunTint = mix(vec3(1.0, 0.95, 0.85), uWarmHorizon, uWarm);
  col += uDay * (pow(s, 1200.0) * 18.0 * sunTint + pow(s, 12.0) * 0.28 * sunTint + pow(s, 3.0) * 0.06 * sunTint);

  if (d.y > 0.0) {
    vec2 uv = d.xz / (d.y + 0.12) * 1.6 + vec2(uTime * 0.004, uTime * 0.0015);
    float n = fbm(uv);
    float cloud = smoothstep(0.52, 0.78, n) * smoothstep(0.0, 0.18, d.y);
    vec3 lit = mix(vec3(0.96, 0.97, 1.0), vec3(1.0, 0.72, 0.52), uWarm);
    vec3 cloudCol = mix(vec3(0.035, 0.045, 0.075), lit * (0.75 + 0.25 * s), uDay);
    col = mix(col, cloudCol, cloud * mix(0.55, 0.85, uDay));
  } else {
    col = mix(horizon, horizon * 0.6, clamp(-d.y * 4.0, 0.0, 1.0));
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
  colors: { NIGHT_ZENITH, NIGHT_HORIZON, DAY_ZENITH, DAY_HORIZON, WARM_HORIZON },
};
