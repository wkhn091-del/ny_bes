'use client';

import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { type PerspectiveCamera, Vector3 } from 'three';
import { LOBBY, PLATE, ROOF_Y, floorY, groundY } from '@/components/three/building-model';
import { bindLookControls, clamp, fovFor, keyDirection, yawToward, type LookState } from '@/components/three/first-person';
import { AVENUE_Z } from './city';
import {
  ELEVATOR_ZONE,
  ENTRANCE_TAP,
  FLOOR_LIFT_ZONE,
  LIFT_ARRIVAL,
  LOBBY_SPAWN,
  STREET_BOUNDS,
  elevatorRoute,
  floorLiftRects,
  floorLiftRoute,
  streetObstacles,
} from './entrance';
import { keepWalkable, obstaclesFor, type Layout } from './layout';
import { NYC_TOP, inNyc } from './nyc';
import { WALK } from './shared';
import { HOME_SPAWN, RESIDENCE_READY, type HomeZone, homeArrival, homeFlight, homeFloorAt, homeLiftRoute, homeObstacles, inHomeLift, isHomeZone } from './residence';
import { WALK_SIGNAL } from './walk-signal';

export type Zone = number | 'street' | HomeZone;

const EYE = 1.6;
const WALK_SPEED = 3;
/** The walker glides in through the plaza facade along the clear aisle between the lounge and the east wing. */
const ENTRY_X = 8;
const SPAWN_Z = 6.2;
const APPROACH_Z = PLATE.z + 9;
const ARRIVAL_LOOK = { x: 20, z: -3 };
const STREET_SPAWN = new Vector3(0, EYE, 62.5);
const STREET_LOOK = new Vector3(0, 3, 13);
const STREET_RECTS = streetObstacles();
/** Above every building near the tower (see CLEAR_VIEW_R in city.tsx), so the flight never cuts through one. */
const CRUISE_Y = 90;

/**
 * Flight from the orbit camera to the sidewalk: climb above the low blocks (and over the tower's
 * roof when starting behind it), cross to the avenue at that height, then descend only over the
 * avenue, which is kept free of buildings, and land on the far sidewalk facing the entrance.
 */
function streetFlight(from: Vector3): Vector3[] {
  const r = Math.hypot(from.x, from.z);
  const k = r > 300 ? 300 / r : 1;
  const behind = from.z < PLATE.z + 25;
  const overBlocks = inNyc(from.x * k, from.z * k, 10);
  const y = behind ? ROOF_Y + 25 : Math.max(from.y, overBlocks ? NYC_TOP + 10 : CRUISE_Y);
  const x = clamp(from.x * 0.5, -150, 150);
  const path = [new Vector3(from.x * k, y, from.z * k)];
  if (behind || overBlocks) path.push(new Vector3(from.x * k, y, AVENUE_Z + 4));
  path.push(new Vector3(x, CRUISE_Y, AVENUE_Z + 4), new Vector3(0, 9, AVENUE_Z + 9), STREET_SPAWN.clone());
  return path;
}

const eyeAt = (zone: Zone, x: number, z: number) => (zone === 'street' ? groundY(x, z) : isHomeZone(zone) ? homeFloorAt(zone, x, z) : floorY(zone)) + EYE;
const inRect = (x: number, z: number, r: { x0: number; x1: number; z0: number; z1: number }) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;

function setTouchAction(el: HTMLElement, value: string) {
  el.style.touchAction = value;
}

type WalkNav = LookState & { pos: Vector3; path: Vector3[]; snap: boolean; flying: boolean; zone: Zone | null; atElevator: boolean; auto: boolean };

/** Inside a cabin, facing out through its doors. */
const FACE_OUT = Math.PI;

/**
 * First-person walk. On a floor: glides in through the facade. In the street: swoops down to the
 * sidewalk across the avenue, then you walk over the crossing, up the steps and into the lobby.
 * Drag to look, click the ground or use WASD/arrows to move.
 */
export function WalkRig({ zone, layout, onElevator }: { zone: Zone; layout: Layout; onElevator: (at: boolean) => void }) {
  const el = useThree((st) => st.gl.domElement);
  const blocked = useMemo(() => {
    if (zone === 'street') return { rects: STREET_RECTS, bounds: STREET_BOUNDS };
    if (isHomeZone(zone)) return homeObstacles(zone);
    const floor = obstaclesFor(layout, zone);
    return { rects: [...floor.rects, ...floorLiftRects()], bounds: floor.bounds };
  }, [layout, zone]);
  const nav = useRef<WalkNav>({
    pos: new Vector3(),
    path: [],
    yaw: 0,
    pitch: 0,
    yawGoal: null,
    keys: new Set(),
    inside: true,
    snap: false,
    flying: false,
    zone: null,
    atElevator: false,
    auto: false,
  });
  const v = useMemo(() => ({ dir: new Vector3(), look: new Vector3(), before: new Vector3() }), []);

  useEffect(() => bindLookControls(el, nav), [el]);
  useEffect(() => {
    const prev = el.style.touchAction;
    setTouchAction(el, 'none');
    return () => setTouchAction(el, prev);
  }, [el]);
  useEffect(
    () => () => {
      WALK.inside = false;
      WALK.street = false;
      WALK.home = false;
      onElevator(false);
    },
    [onElevator],
  );

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1);
    const n = nav.current;
    const cam = state.camera as PerspectiveCamera;
    const { dir, look, before } = v;
    const street = zone === 'street';
    const home = isHomeZone(zone);

    if (n.zone !== zone) {
      const first = n.zone === null;
      const fromHome = isHomeZone(n.zone);
      n.zone = zone;
      n.keys.clear();
      n.path = [];
      if (first) {
        n.pos.copy(cam.position);
        cam.getWorldDirection(dir);
        n.yaw = Math.atan2(-dir.x, -dir.z);
        n.pitch = Math.asin(clamp(dir.y, -1, 1));
        n.flying = true;
        if (street) n.path = streetFlight(cam.position);
        else if (home) n.path = homeFlight(cam.position).map((q) => new Vector3(q.x, q.y, q.z));
        else n.path = [new Vector3(ENTRY_X, floorY(zone) + EYE + 1.2, APPROACH_Z), new Vector3(ENTRY_X, floorY(zone) + EYE, SPAWN_Z)];
      } else {
        n.flying = false;
        n.snap = true;
        n.auto = false;
        n.yawGoal = null;
        if (WALK_SIGNAL.arrive) {
          WALK_SIGNAL.arrive = false;
          const at = home ? homeArrival(zone) : { ...(street ? LIFT_ARRIVAL.lobby : LIFT_ARRIVAL.floor), yaw: FACE_OUT };
          n.pos.set(at.x, eyeAt(zone, at.x, at.z), at.z);
          n.yaw = at.yaw;
          n.pitch = -0.05;
        } else if (home) {
          n.pos.set(HOME_SPAWN.x, eyeAt(zone, HOME_SPAWN.x, HOME_SPAWN.z), HOME_SPAWN.z);
          n.yaw = HOME_SPAWN.yaw;
          n.pitch = -0.05;
        } else if (street && fromHome) {
          n.pos.copy(STREET_SPAWN);
          n.yaw = yawToward(n.pos, STREET_LOOK);
          n.pitch = 0;
        } else if (street) {
          n.pos.set(LOBBY_SPAWN.x, LOBBY.floor + EYE, LOBBY_SPAWN.z);
          n.yaw = Math.PI;
          n.pitch = -0.05;
        } else if (typeof zone === 'number') {
          n.pos.set(ENTRY_X, floorY(zone) + EYE, SPAWN_Z);
          look.set(ARRIVAL_LOOK.x, n.pos.y - 0.5, ARRIVAL_LOOK.z);
          n.yaw = yawToward(n.pos, look);
          n.pitch = -0.08;
        }
      }
    }

    if (street) look.copy(STREET_LOOK);
    else if (home) look.set(HOME_SPAWN.x, 1.4, HOME_SPAWN.z - 12);
    else look.set(ARRIVAL_LOOK.x, floorY(zone) + EYE - 0.5, ARRIVAL_LOOK.z);

    const p = n.pos;
    if (WALK_SIGNAL.goElevator && !n.flying) {
      WALK_SIGNAL.goElevator = false;
      n.keys.clear();
      const route = home ? homeLiftRoute(zone, p.x, p.z) : street ? elevatorRoute(p.x, p.z) : floorLiftRoute(p.x, p.z);
      n.path = route.map((q) => new Vector3(q.x, 0, q.z));
      n.auto = true;
    }
    if (WALK_SIGNAL.riding) {
      n.keys.clear();
      n.path = [];
      n.auto = false;
    }
    if (n.auto && !n.flying) {
      const next = n.path[0];
      n.yawGoal = next ? yawToward(p, look.set(next.x, p.y, next.z)) : n.yawGoal;
      if (!next) {
        n.yawGoal = home ? homeArrival(zone).yaw : FACE_OUT;
        n.auto = false;
      }
    }
    if (n.yawGoal !== null && !n.flying) {
      const d = Math.atan2(Math.sin(n.yawGoal - n.yaw), Math.cos(n.yawGoal - n.yaw));
      n.yaw += d * Math.min(1, delta * 4);
      if (Math.abs(d) < 0.002) n.yawGoal = null;
    }
    if (street) look.copy(STREET_LOOK);
    if (n.keys.size > 0 && !n.flying) {
      n.path = [];
      n.auto = false;
      if (keyDirection(n.keys, n.yaw, dir)) p.addScaledVector(dir, WALK_SPEED * delta);
      keepWalkable(p, blocked.rects, blocked.bounds);
    } else if (n.path.length > 0 && !(n.flying && home && n.path.length === 1 && !RESIDENCE_READY.lobby)) {
      const target = n.path[0]!;
      if (n.flying) dir.subVectors(target, p);
      else dir.set(target.x - p.x, 0, target.z - p.z);
      const dist = dir.length();
      let remaining = dist;
      for (let i = 1; i < n.path.length; i++) remaining += n.path[i]!.distanceTo(n.path[i - 1]!);
      const speed = n.flying ? clamp(remaining * 1.4, WALK_SPEED * 1.5, 140) : WALK_SPEED;
      const step = speed * delta;
      const passThrough = n.flying && n.path.length > 1 ? 3 : 0;
      if (dist <= Math.max(step, passThrough)) {
        if (n.path.length === 1) {
          p.x = target.x;
          p.z = target.z;
          if (n.flying) p.y = target.y;
        }
        n.path.shift();
        if (n.path.length === 0) n.flying = false;
      } else {
        before.copy(p);
        p.addScaledVector(dir, step / dist);
        if (!n.flying) {
          keepWalkable(p, blocked.rects, blocked.bounds);
          if (Math.hypot(p.x - before.x, p.z - before.z) < step * 0.25) n.path = [];
        }
      }
    }
    if (!n.flying) p.y = eyeAt(zone, p.x, p.z);

    if (n.flying) {
      const goalYaw = yawToward(p, look);
      const goalPitch = Math.atan2(look.y - p.y, Math.hypot(look.x - p.x, look.z - p.z));
      const t = Math.min(1, delta * 3);
      n.yaw += Math.atan2(Math.sin(goalYaw - n.yaw), Math.cos(goalYaw - n.yaw)) * t;
      n.pitch += (goalPitch - n.pitch) * t;
    }
    WALK.street = street;
    WALK.home = home;
    WALK.x = p.x;
    WALK.z = p.z;
    WALK.inside = typeof zone === 'number' && p.z < PLATE.z - 0.3 && Math.abs(p.y - eyeAt(zone, p.x, p.z)) < 2;
    const atElevator = !n.flying && (home ? inHomeLift(zone, p.x, p.z) : inRect(p.x, p.z, street ? ELEVATOR_ZONE : FLOOR_LIFT_ZONE));
    if (atElevator !== n.atElevator) {
      n.atElevator = atElevator;
      onElevator(atElevator);
    }

    const fov = fovFor(state.size.width / state.size.height);
    if (Math.abs(cam.fov - fov) > 0.05 || cam.near !== 0.1) {
      cam.fov += (fov - cam.fov) * Math.min(1, delta * 3);
      cam.near = 0.1;
      cam.updateProjectionMatrix();
    }
    cam.rotation.order = 'YXZ';
    if (n.snap) {
      cam.position.copy(p);
      n.snap = false;
    } else {
      cam.position.lerp(p, 1 - Math.exp(-delta * (n.flying ? 20 : 8)));
    }
    if (WALK_SIGNAL.riding) cam.position.y += Math.sin(state.clock.elapsedTime * 31) * 0.0025;
    cam.rotation.set(n.pitch, n.yaw, 0);
  });

  const onGroundClick = (e: ThreeEvent<MouseEvent>) => {
    const n = nav.current;
    if (n.flying || WALK_SIGNAL.riding || e.delta > 6) return;
    e.stopPropagation();
    n.keys.clear();
    if (zone === 'street' && n.pos.z > LOBBY.glassZ + 0.5 && inRect(e.point.x, e.point.z, ENTRANCE_TAP)) {
      WALK_SIGNAL.goElevator = true;
      return;
    }
    n.auto = false;
    n.path = [keepWalkable(e.point.clone(), blocked.rects, blocked.bounds)];
  };

  if (zone === 'street') {
    const b = STREET_BOUNDS;
    return (
      <mesh rotation-x={-Math.PI / 2} position={[(b.x0 + b.x1) / 2, 0.3, (b.z0 + b.z1) / 2]} onClick={onGroundClick}>
        <planeGeometry args={[b.x1 - b.x0, b.z1 - b.z0]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
    );
  }
  if (isHomeZone(zone)) {
    const b = blocked.bounds;
    return (
      <mesh rotation-x={-Math.PI / 2} position={[(b.x0 + b.x1) / 2, eyeAt(zone, b.x1, b.z1) - EYE + 0.02, (b.z0 + b.z1) / 2]} onClick={onGroundClick}>
        <planeGeometry args={[b.x1 - b.x0 + 2, b.z1 - b.z0 + 2]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
    );
  }
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, floorY(zone) + 0.02, 0]} onClick={onGroundClick}>
      <planeGeometry args={[PLATE.x * 2, PLATE.z * 2]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
    </mesh>
  );
}
