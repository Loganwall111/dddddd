import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { type EnvState } from "../game/bus";
import { cinematicAudio } from "../audio/engine";
import { verdantHeight } from "../world/Verdant";
import type { LayerId } from "../game/lore";

const WALK_SPEED = 5.6;
const RUN_SPEED = 10.5;
const FLY_SPEED = 11;
const FLY_FAST = 24;
const SWIM_SPEED = 3.1;
const WATER_LEVEL = -2.25;

interface PlayerProps {
  layer: LayerId;
  env: EnvState | null;
  paused: boolean;
  onLockChange: (locked: boolean) => void;
  onPosition: (position: [number, number, number], speed: number) => void;
  sensitivity: number;
}

export function Player({ layer, env, paused, onLockChange, onPosition, sensitivity }: PlayerProps) {
  const { camera, gl } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const yaw = useRef(Math.PI);
  const pitch = useRef(-0.05);
  const speed = useRef(0);
  const vy = useRef(0);
  const grounded = useRef(true);
  const walking = useRef(false);

  useEffect(() => {
    // Spawn placement per reality.
    const spawns: Record<LayerId, [number, number, number, number, number]> = {
      verdant: [0, verdantHeight(0, 8) + 1.8, 8, Math.PI, -0.06],
      void: [0, 2, 26, Math.PI, -0.02],
      infinite: [0, 1.7, 4.5, Math.PI, 0],
      fractaline: [0, 0.5, 30, Math.PI, 0],
      singularity: [0, 3, 44, Math.PI, 0],
    };
    const [x, y, z, y0, p0] = spawns[layer];
    camera.position.set(x, y, z);
    yaw.current = y0;
    pitch.current = p0;
    vy.current = 0;
  }, [layer, camera]);

  // Robust camera binding: pointer lock with a virtual-look fallback for
  // sandboxed frames where the browser refuses the lock.
  useEffect(() => {
    const el = gl.domElement;
    const virtualLook = { active: false, lastX: 0, lastY: 0 };
    const enableVirtual = () => {
      if (virtualLook.active) return;
      virtualLook.active = true;
      onLockChange(true);
    };
    const requestLock = () => {
      if (paused || document.pointerLockElement === el) return;
      try {
        const result = el.requestPointerLock() as unknown as Promise<void> | undefined;
        if (result && typeof result.catch === "function") result.catch(() => enableVirtual());
      } catch {
        enableVirtual();
      }
      window.setTimeout(() => {
        if (document.pointerLockElement !== el) enableVirtual();
      }, 240);
    };
    const mouse = (event: MouseEvent) => {
      if (paused) return;
      const factor = 0.0016 * (sensitivity / 50);
      if (document.pointerLockElement === el) {
        yaw.current -= event.movementX * factor;
        pitch.current = THREE.MathUtils.clamp(pitch.current - event.movementY * factor * 0.9, -1.5, 1.5);
      } else if (virtualLook.active) {
        const dx = event.movementX || (virtualLook.lastX ? event.clientX - virtualLook.lastX : 0);
        const dy = event.movementY || (virtualLook.lastY ? event.clientY - virtualLook.lastY : 0);
        virtualLook.lastX = event.clientX;
        virtualLook.lastY = event.clientY;
        yaw.current -= dx * factor;
        pitch.current = THREE.MathUtils.clamp(pitch.current - dy * factor * 0.9, -1.5, 1.5);
      }
    };
    const lockChange = () => {
      if (document.pointerLockElement === el) {
        virtualLook.active = false;
        onLockChange(true);
      } else if (!virtualLook.active) {
        onLockChange(false);
      }
    };
    const lockError = () => enableVirtual();
    const click = () => {
      if (!paused && document.pointerLockElement !== el) requestLock();
    };
    const bindRequest = () => requestLock();
    window.addEventListener("mousemove", mouse);
    document.addEventListener("pointerlockchange", lockChange);
    document.addEventListener("pointerlockerror", lockError);
    el.addEventListener("click", click);
    window.addEventListener("mv-bind-camera", bindRequest);
    return () => {
      window.removeEventListener("mousemove", mouse);
      document.removeEventListener("pointerlockchange", lockChange);
      document.removeEventListener("pointerlockerror", lockError);
      el.removeEventListener("click", click);
      window.removeEventListener("mv-bind-camera", bindRequest);
    };
  }, [gl, paused, onLockChange, sensitivity]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      keys.current[event.code] = true;
    };
    const up = (event: KeyboardEvent) => {
      keys.current[event.code] = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useFrame(({ clock }, rawDelta) => {
    if (paused) return;
    const delta = Math.min(rawDelta, 0.1);
    const raw = keys.current;
    // Arrow-key look always works, even without pointer lock.
    if (raw.ArrowLeft) yaw.current += 2.2 * delta;
    if (raw.ArrowRight) yaw.current -= 2.2 * delta;
    if (raw.ArrowUp) pitch.current = THREE.MathUtils.clamp(pitch.current + 1.6 * delta, -1.5, 1.5);
    if (raw.ArrowDown) pitch.current = THREE.MathUtils.clamp(pitch.current - 1.6 * delta, -1.5, 1.5);
    camera.rotation.set(pitch.current, yaw.current, 0, "YXZ");

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const direction = new THREE.Vector3();
    if (raw.KeyW) direction.add(forward);
    if (raw.KeyS) direction.sub(forward);
    if (raw.KeyD) direction.add(right);
    if (raw.KeyA) direction.sub(right);
    const moving = direction.lengthSq() > 0;

    if (layer === "verdant" && env) {
      const swim = camera.position.y < WATER_LEVEL - 0.12;
      const target = moving ? (swim ? SWIM_SPEED : raw.ShiftLeft ? RUN_SPEED : WALK_SPEED) : 0;
      speed.current = THREE.MathUtils.lerp(speed.current, target, 1 - Math.exp(-delta * 5));
      if (moving) camera.position.addScaledVector(direction.normalize(), speed.current * delta);
      const ground = verdantHeight(camera.position.x, camera.position.z);
      if (swim) {
        if (raw.Space) camera.position.y += 2.4 * delta;
        if (raw.KeyC || raw.ControlLeft) camera.position.y -= 2.4 * delta;
        if (!moving && !raw.Space && !raw.KeyC) camera.position.y -= 0.25 * delta;
        camera.position.y += Math.sin(clock.elapsedTime * 1.1) * 0.12 * delta;
        const floor = ground + 1.0;
        if (camera.position.y < floor) camera.position.y = floor;
        grounded.current = false;
        vy.current = 0;
        walking.current = false;
      } else {
        const stand = ground + 1.75;
        if (grounded.current && raw.Space) {
          vy.current = 5.4;
          grounded.current = false;
        }
        vy.current -= 13 * delta;
        camera.position.y += vy.current * delta;
        if (camera.position.y <= stand) {
          camera.position.y = stand;
          vy.current = 0;
          grounded.current = true;
        } else if (camera.position.y > stand + 0.05) {
          grounded.current = false;
        }
        walking.current = moving && grounded.current;
        if (walking.current) cinematicAudio.footstep(speed.current * 0.28);
      }
      // Soft boundary — the valley curls back on itself.
      const radius = Math.hypot(camera.position.x, camera.position.z);
      if (radius > 235) {
        camera.position.x *= 235 / radius;
        camera.position.z *= 235 / radius;
      }
    } else {
      // Free flight between realities.
      const target = moving ? (raw.ShiftLeft ? FLY_FAST : FLY_SPEED) : 0;
      speed.current = THREE.MathUtils.lerp(speed.current, target, 1 - Math.exp(-delta * 3.4));
      if (moving) camera.position.addScaledVector(direction.normalize(), speed.current * delta);
      if (raw.Space) camera.position.y += FLY_SPEED * 0.8 * delta;
      if (raw.KeyC || raw.ControlLeft) camera.position.y -= FLY_SPEED * 0.8 * delta;
      const radius = Math.hypot(camera.position.x, camera.position.z);
      if (radius > 160) {
        camera.position.x *= 160 / radius;
        camera.position.z *= 160 / radius;
      }
      walking.current = false;
    }

    // Head bob while walking.
    if (walking.current && !env?.underwater) {
      camera.position.y += Math.sin(clock.elapsedTime * 7.4) * 0.0016 * speed.current;
    }
    onPosition([camera.position.x, camera.position.y, camera.position.z], speed.current);
  });

  return null;
}
