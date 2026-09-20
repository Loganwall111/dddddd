import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, Bloom, ChromaticAberration, GodRays, Noise, Vignette } from "@react-three/postprocessing";
import { Environment, Lightformer, MeshReflectorMaterial, Sky, Sparkles, Text } from "@react-three/drei";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";
import { districtsNear, getRealm, hashString, lifeStageFor, realmPhysics, seededRandom, worldParams, type CreatureDefinition, type District, type ExpeditionId, type LifeStageId, type WorldLayer } from "../game/procedural";

const diskVertex = `
  varying vec3 vPosition;
  uniform float uTime;
  void main() {
    vPosition = position;
    vec3 p = position;
    float r = length(p.xy);
    p.z += sin(r * 12.0 - uTime * 1.7 + atan(p.y, p.x) * 5.0) * 0.06;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const diskFragment = `
  varying vec3 vPosition;
  uniform float uTime;
  void main() {
    float r = length(vPosition.xy);
    float a = atan(vPosition.y, vPosition.x);
    float spiral = sin(r * 24.0 - a * 13.0 + uTime * 2.2) * 0.5 + 0.5;
    float filaments = sin(r * 81.0 + a * 23.0 - uTime * 3.0) * 0.5 + 0.5;
    float inner = smoothstep(3.05, 3.5, r);
    float outer = 1.0 - smoothstep(7.8, 8.65, r);
    float mask = inner * outer * smoothstep(0.18, 0.92, spiral * 0.74 + filaments * 0.42);
    vec3 hot = vec3(1.0, 0.88, 0.64);
    vec3 cold = vec3(0.29, 0.16, 0.82);
    vec3 color = mix(hot, cold, smoothstep(3.3, 8.4, r));
    color *= 1.2 + filaments * 2.5;
    gl_FragColor = vec4(color, mask * (0.45 + filaments * 0.55));
  }
`;

interface WorldProps {
  seed: string;
  layer: WorldLayer;
  realmId?: string;
  structures: number;
  quality: "low" | "medium" | "ultra";
  bloom?: boolean;
  godRays?: boolean;
  vignette?: boolean;
  chromaticAberration?: boolean;
  antialiasing?: boolean;
  shadows?: boolean;
  filmGrain?: boolean;
  cameraShake?: boolean;
  particleDensity?: number;
  renderScale?: number;
  fov?: number;
  viewDistance?: number;
  reducedMotion: boolean;
  paused: boolean;
  cameraMode?: "first" | "third" | "orbit";
  creature?: CreatureDefinition;
  characterName?: string;
  scenario?: ExpeditionId;
  lifeStage?: LifeStageId;
  tension?: number;
  attackSignal?: number;
  grabSignal?: number;
  onPrey?: (count: number, kind: string) => void;
  onRealmEnter?: (realmId: string) => void;
  onLockChange: (locked: boolean) => void;
  onPosition: (position: [number, number, number], speed: number) => void;
}

function PlayerController({ layer, seed, paused, reducedMotion, onLockChange, onPosition, physics, cameraMode, attackSignal }: Pick<WorldProps, "layer" | "seed" | "paused" | "reducedMotion" | "onLockChange" | "onPosition"> & { physics?: { gravity: number; wind: [number, number, number] }; cameraMode?: string; attackSignal?: number }) {
  const { camera, gl } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const yaw = useRef(Math.PI);
  const pitch = useRef(-0.06);
  const speed = useRef(0);
  const punchAt = useRef(-10);
  const punchSeen = useRef(-1);
  const positions = useRef(new THREE.Vector3());
  const target = useRef(new THREE.Vector3());
  const mode = useRef<"first" | "third" | "orbit">("first");

  useEffect(() => {
    const hash = hashString("lumital-avatar-bias");
    yaw.current = Math.PI + ((hash % 13) - 6) * 0.008;
    pitch.current = layer === "planet" ? -0.09 : -0.04;
    mode.current = cameraMode === "orbit" ? "orbit" : cameraMode === "third" ? "third" : "first";
  }, [layer, cameraMode]);

  useEffect(() => {
    const start: Record<WorldLayer, [number, number, number]> = {
      void: [0, 0.5, 18], galaxy: [0, 0.4, 16], cosmos: [0, 1, 18], planet: [0, 2.4, 13], micro: [0, 0.4, 11],
      atomic: [0, 0.4, 12], quantum: [0, 0.5, 13],
    };
    const spawn = start[layer] ?? start.planet;
    camera.position.set(...spawn);
    positions.current.set(...spawn);
    target.current.set(...spawn);
    yaw.current = Math.PI;
    pitch.current = layer === "planet" ? -0.09 : 0;
    camera.rotation.set(pitch.current, yaw.current, 0, "YXZ");
  }, [camera, layer]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => { keys.current[event.code] = true; };
    const up = (event: KeyboardEvent) => { keys.current[event.code] = false; };
    const mouse = (event: MouseEvent) => {
      if (document.pointerLockElement !== gl.domElement || paused) return;
      yaw.current -= event.movementX * 0.0016;
      pitch.current = THREE.MathUtils.clamp(pitch.current - event.movementY * 0.00145, -1.5, 1.5);
    };
    const lock = () => onLockChange(document.pointerLockElement === gl.domElement);
    const click = () => { if (!paused && document.pointerLockElement !== gl.domElement) gl.domElement.requestPointerLock(); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("mousemove", mouse);
    document.addEventListener("pointerlockchange", lock);
    gl.domElement.addEventListener("click", click);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("mousemove", mouse);
      document.removeEventListener("pointerlockchange", lock);
      gl.domElement.removeEventListener("click", click);
    };
  }, [gl, paused, onLockChange]);

  useFrame(({ clock, camera }, delta) => {
    if (paused) return;
    const phys = physics ?? { gravity: 0.5, wind: [0.01, 0, 0.01] };
    const windVec = positions.current.set(phys.wind[0], phys.wind[1], phys.wind[2]);
    camera.rotation.set(pitch.current, yaw.current, 0, "YXZ");
    if (attackSignal !== undefined && attackSignal !== punchSeen.current) { punchSeen.current = attackSignal; punchAt.current = clock.elapsedTime; }
    const punchAge = clock.elapsedTime - punchAt.current;
    if (punchAge < 0.26) {
      const strength = (1 - punchAge / 0.26);
      const punchDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      camera.position.addScaledVector(punchDir, 0.42 * strength);
      camera.rotation.z = Math.sin(punchAge * 32) * 0.035 * strength;
    }

    if (mode.current === "orbit") {
      const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch.current);
      rot.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw.current));
      const center = target.current.set(0, 0, 0);
      const offset = new THREE.Vector3(0, 4.2, 14).applyQuaternion(rot);
      camera.position.lerp(center.clone().add(offset), 1 - Math.exp(-delta * 2));
      camera.lookAt(center);
      target.current.set(0, Math.sin(clock.elapsedTime * 0.35) * 0.25, 0);
    } else {
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      const vertical = new THREE.Vector3(0, 1, 0);
      const direction = new THREE.Vector3();
      const raw = keys.current;
      if (raw.KeyW) direction.add(forward);
      if (raw.KeyS) direction.sub(forward);
      if (raw.KeyD) direction.add(right);
      if (raw.KeyA) direction.sub(right);
      if (raw.Space) direction.add(vertical.normalize().multiplyScalar(1.3 * Math.max(phys.gravity, 0.02)));
      if (raw.KeyC || raw.ControlLeft) direction.sub(vertical.normalize().multiplyScalar(Math.max(phys.gravity, 0.02)));
      const scaleSys = layer === "cosmos" || layer === "galaxy" || layer === "void" ? 3.8 : layer === "atomic" ? 1.2 : 1;
      const targetSpeed = direction.lengthSq() > 0 ? (raw.ShiftLeft ? (layer === "cosmos" || layer === "galaxy" || layer === "void" ? 18 : 11) : 5.4) * scaleSys : 0;
      speed.current = THREE.MathUtils.lerp(speed.current, targetSpeed, 1 - Math.exp(-delta * 4.6));
      if (direction.lengthSq() > 0) camera.position.addScaledVector(direction.normalize(), speed.current * delta);
      camera.position.addScaledVector(windVec, delta * (layer === "micro" ? 2.4 : 1));
      camera.position.y += Math.sin(clock.elapsedTime * 1.35 + positions.current.x * 0.03) * 0.0011 * speed.current * (reducedMotion ? 0 : 1);
      if (layer === "planet") {
        const ground = terrainHeightAt(seed, camera.position.x, camera.position.z) + 1.85;
        if (camera.position.y < ground) {
          camera.position.y = THREE.MathUtils.lerp(camera.position.y, ground, 1 - Math.exp(-delta * 9));
        } else if (!keys.current.Space) {
          const falling = camera.position.y - phys.gravity * delta * 2.4;
          camera.position.y = THREE.MathUtils.lerp(camera.position.y, Math.max(falling, ground), 1 - Math.exp(-delta * 3.2));
        }
        camera.position.y += Math.sin(clock.elapsedTime * 0.72) * 0.0006 * speed.current;
      }
    }
    onPosition([camera.position.x, camera.position.y, camera.position.z], speed.current);
  });
  return null;
}

function DriftParticles({ seed, count, color, radius = 30, speed = 0.01 }: { seed: string; count: number; color: string; radius?: number; speed?: number }) {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const random = seededRandom(seed, `particles-${color}-${count}`);
    const values = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      values[i * 3] = (random() - 0.5) * radius * 2;
      values[i * 3 + 1] = (random() - 0.5) * radius;
      values[i * 3 + 2] = (random() - 0.5) * radius * 2;
    }
    return values;
  }, [seed, count, color, radius]);
  useFrame((_, delta) => {
    if (!ref.current) return;
    ref.current.rotation.y += delta * speed;
    ref.current.rotation.x += delta * speed * 0.17;
  });
  return (
    <points ref={ref}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry>
      <pointsMaterial color={color} size={radius / 500} transparent opacity={0.74} depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

function biomeColor(seed: string, x: number, z: number, height: number) {
  const moistureRaw = seededRandom(seed, `m${Math.floor(x / 14)}:${Math.floor(z / 14)}`);
  const moisture = (
    Math.sin(x * 0.031 + moistureRaw() * 6) * Math.cos(z * 0.027 + moistureRaw() * 6) + 1
  ) / 2;
  const c = new THREE.Color();
  const deep = new THREE.Color("#0a3542");
  const shallow = new THREE.Color("#1b708c");
  const sand = new THREE.Color("#c8b488");
  const grass = new THREE.Color("#3d7a5a");
  const dryGrass = new THREE.Color("#8fa06a");
  const rock = new THREE.Color("#6a7080");
  const peak = new THREE.Color("#dfe9f4");
  if (height < -2.4) return c.copy(deep).lerp(shallow, (height + 3.5) / 1.1);
  if (height < -0.5) return c.copy(shallow).lerp(sand, (height + 2.4) / 1.9);
  if (height < 1.2) return c.copy(sand).lerp(moisture > 0.42 ? grass : dryGrass, Math.min(1, (height + 0.5) / 1.7));
  if (height < 3.2) return c.copy(grass).lerp(rock, Math.min(1, (height - 1.2) / 2 * (1 - moisture * 0.4)));
  if (height < 5.4) return c.copy(rock).lerp(peak, (height - 3.2) / 2.2);
  return c.copy(peak);
}

const CHUNK_SIZE = 36;

function TerrainChunk({ seed, cx, cz, ring }: { seed: string; cx: number; cz: number; ring: number }) {
  const geometry = useMemo(() => {
    const res = ring <= 1 ? 44 : ring === 2 ? 26 : 14;
    const geo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, res, res);
    const position = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i += 1) {
      const wx = cx * CHUNK_SIZE + position.getX(i);
      const wz = cz * CHUNK_SIZE - position.getY(i);
      const h = terrainHeightAt(seed, wx, wz);
      position.setZ(i, h);
      const color = biomeColor(seed, wx, wz, h);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }, [seed, cx, cz, ring]);
  return (
    <mesh geometry={geometry} position={[cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.82} metalness={0.08} emissive="#0a1a16" emissiveIntensity={0.22} />
    </mesh>
  );
}

function InfiniteTerrain({ seed, quality }: { seed: string; quality: WorldProps["quality"] }) {
  const radius = quality === "low" ? 2 : 3;
  const [center, setCenter] = useState<{ cx: number; cz: number }>({ cx: 0, cz: 0 });
  const lastCheck = useRef(0);
  useFrame(({ camera }) => {
    const now = performance.now();
    if (now - lastCheck.current < 280) return;
    lastCheck.current = now;
    const ncx = Math.round(camera.position.x / CHUNK_SIZE);
    const ncz = Math.round(camera.position.z / CHUNK_SIZE);
    if (ncx !== center.cx || ncz !== center.cz) setCenter({ cx: ncx, cz: ncz });
  });
  const chunks = useMemo(() => {
    const list: Array<{ cx: number; cz: number; ring: number }> = [];
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dz = -radius; dz <= radius; dz += 1) {
        list.push({ cx: center.cx + dx, cz: center.cz + dz, ring: Math.max(Math.abs(dx), Math.abs(dz)) });
      }
    }
    return list;
  }, [center, radius]);
  return (
    <group>
      {chunks.map((chunk) => (
        <TerrainChunk key={`${chunk.cx}:${chunk.cz}`} seed={seed} cx={chunk.cx} cz={chunk.cz} ring={chunk.ring} />
      ))}
    </group>
  );
}

interface MicroAgent {
  id: number; x: number; z: number; phase: number; hop: number; size: number; hue: number; deadUntil: number; vx: number; vz: number; species: 0 | 1 | 2;
}

function MicroLifeSystem({ seed, density, tension = 20, attackSignal = 0, grabSignal = 0, onPrey }: { seed: string; density: number; tension?: number; attackSignal?: number; grabSignal?: number; onPrey?: (count: number, kind: string) => void }) {
  const { camera } = useThree();
  const nibblerRef = useRef<THREE.InstancedMesh>(null);
  const wingflyRef = useRef<THREE.InstancedMesh>(null);
  const grazerRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const agents = useMemo(() => {
    const random = seededRandom(seed, "micro-life-ecosystem");
    const speciesMeta: Array<{ count: number; mood: [number, number]; h: [number, number]; size: [number, number] }> = [
      { count: density * 3, mood: [0.4, 1.1], h: [0.28, 0.38], size: [0.1, 0.16] },
      { count: Math.floor(density * 1.4), mood: [1.4, 2.4], h: [0.55, 0.7], size: [0.06, 0.1] },
      { count: Math.floor(density * 0.8), mood: [0.15, 0.4], h: [0.04, 0.1], size: [0.35, 0.6] },
    ];
    const list: MicroAgent[] = [];
    speciesMeta.forEach((meta, speciesIndex) => {
      for (let index = 0; index < meta.count; index += 1) {
        const x = (random() - 0.5) * 160;
        const z = (random() - 0.5) * 160;
        list.push({
          id: list.length,
          x, z,
          phase: random() * Math.PI * 2,
          hop: meta.mood[0] + random() * (meta.mood[1] - meta.mood[0]),
          size: meta.size[0] + random() * (meta.size[1] - meta.size[0]),
          hue: meta.h[0] + random() * (meta.h[1] - meta.h[0]),
          deadUntil: 0,
          vx: (random() - 0.5) * (speciesIndex === 1 ? 5 : 1.4),
          vz: (random() - 0.5) * (speciesIndex === 1 ? 5 : 1.4),
          species: speciesIndex as 0 | 1 | 2,
        });
      }
    });
    return list;
  }, [seed, density]);
  const consumedAttack = useRef(-1);
  const consumedGrab = useRef(-1);
  const speciesOffsets = useMemo(() => {
    const nibblers: MicroAgent[] = []; const wingflies: MicroAgent[] = []; const grazers: MicroAgent[] = [];
    agents.forEach((agent) => {
      if (agent.species === 0) nibblers.push(agent);
      else if (agent.species === 1) wingflies.push(agent);
      else grazers.push(agent);
    });
    return { nibblers, wingflies, grazers };
  }, [agents]);

  useFrame(({ clock }, delta) => {
    const time = clock.elapsedTime;
    if (attackSignal > consumedAttack.current) {
      consumedAttack.current = attackSignal;
      let taken = 0;
      agents.forEach((agent) => {
        const dx = agent.x - camera.position.x;
        const dz = agent.z - camera.position.z;
        if (agent.deadUntil < time && dx * dx + dz * dz < 60) {
          agent.deadUntil = time + 6 + Math.random() * 9;
          taken += 1;
        }
      });
      if (onPrey) onPrey(taken, "attack");
    }
    if (grabSignal > consumedGrab.current) {
      consumedGrab.current = grabSignal;
      let nearestIndex = -1;
      let bestD = 22;
      for (let i = 0; i < agents.length; i += 1) {
        const agent = agents[i];
        const dx = agent.x - camera.position.x;
        const dz = agent.z - camera.position.z;
        const d = dx * dx + dz * dz;
        if (agent.deadUntil < time && d < bestD) { bestD = d; nearestIndex = i; }
      }
      if (nearestIndex >= 0) {
        agents[nearestIndex].deadUntil = time + 8 + Math.random() * 7;
        if (onPrey) onPrey(1, "grab");
      }
    }

    const fleeBoostBase = tension * 0.025;
    const push = (agent: MicroAgent, mesh: THREE.InstancedMesh, index: number) => {
      if (agent.deadUntil >= time) {
        dummy.position.set(0, -80, 0);
        dummy.scale.setScalar(0.0001);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
        return;
      }
      const fleeDx = agent.x - camera.position.x;
      const fleeDz = agent.z - camera.position.z;
      const fleeD2 = fleeDx * fleeDx + fleeDz * fleeDz;
      const fleeRadius = agent.species === 1 ? 64 : 42;
      const fleeBoost = fleeD2 < fleeRadius ? 1.7 + fleeBoostBase : 1;
      agent.x += agent.vx * delta * fleeBoost + Math.sin(time * 0.9 + agent.phase) * delta * (agent.species === 1 ? 2.2 : 0.7);
      agent.z += agent.vz * delta * fleeBoost + Math.cos(time * 0.8 + agent.phase) * delta * (agent.species === 1 ? 2.2 : 0.7);
      const r2 = agent.x * agent.x + agent.z * agent.z;
      if (r2 > 120 * 120) { agent.vx *= -1; agent.vz *= -1; agent.x *= 0.97; agent.z *= 0.97; }
      const ground = terrainHeightAt(seed, agent.x, agent.z);
      let y: number;
      if (agent.species === 0) y = ground + Math.abs(Math.sin(time * agent.hop * 2.4 + agent.phase)) * (0.35 + tension * 0.004) + 0.28;
      else if (agent.species === 1) y = ground + 2.4 + Math.sin(time * agent.hop * 1.7 + agent.phase) * 1.3 + Math.sin(time * 4 + agent.id) * 0.18;
      else y = ground + 0.42;
      const targetY = agent.deadUntil > time ? ground - 1 : y;
      dummy.position.set(agent.x, targetY, agent.z);
      dummy.rotation.set(agent.species === 1 ? Math.PI / 2 + Math.sin(time * 8 + agent.phase) * 0.4 : 0, time * agent.hop * (agent.species === 1 ? 3 : 1) + agent.phase, 0);
      dummy.scale.set(agent.size * (agent.species === 2 ? 1.4 : 1), agent.size * (agent.species === 2 ? 0.7 : 1), agent.size * (agent.species === 2 ? 1.9 : 1));
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    };

    if (nibblerRef.current) { speciesOffsets.nibblers.forEach((agent, i) => push(agent, nibblerRef.current!, i)); nibblerRef.current.instanceMatrix.needsUpdate = true; }
    if (wingflyRef.current) { speciesOffsets.wingflies.forEach((agent, i) => push(agent, wingflyRef.current!, i)); wingflyRef.current.instanceMatrix.needsUpdate = true; }
    if (grazerRef.current) { speciesOffsets.grazers.forEach((agent, i) => push(agent, grazerRef.current!, i)); grazerRef.current.instanceMatrix.needsUpdate = true; }
  });

  useEffect(() => {
    const color = new THREE.Color();
    const apply = (mesh: THREE.InstancedMesh | null, list: MicroAgent[], intensity: [number, number]) => {
      if (!mesh) return;
      list.forEach((agent, index) => {
        mesh.setColorAt(index, color.setHSL(agent.hue, 0.62, intensity[0] + Math.random() * (intensity[1] - intensity[0])));
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };
    apply(nibblerRef.current, speciesOffsets.nibblers, [0.5, 0.58]);
    apply(wingflyRef.current, speciesOffsets.wingflies, [0.6, 0.74]);
    apply(grazerRef.current, speciesOffsets.grazers, [0.38, 0.5]);
  }, [agents, speciesOffsets]);

  return (
    <group>
      <instancedMesh ref={nibblerRef} args={[undefined, undefined, speciesOffsets.nibblers.length]} castShadow>
        <icosahedronGeometry args={[1, 1]} />
        <meshPhysicalMaterial color="#ffffff" emissive="#5fbf8f" emissiveIntensity={0.4} roughness={0.4} clearcoat={0.5} />
      </instancedMesh>
      <instancedMesh ref={wingflyRef} args={[undefined, undefined, speciesOffsets.wingflies.length]} castShadow>
        <coneGeometry args={[1, 2.2, 3]} />
        <meshPhysicalMaterial color="#ffffff" emissive="#b8d8ff" emissiveIntensity={0.55} roughness={0.3} clearcoat={0.7} />
      </instancedMesh>
      <instancedMesh ref={grazerRef} args={[undefined, undefined, speciesOffsets.grazers.length]} castShadow>
        <capsuleGeometry args={[1, 1.6, 4, 8]} />
        <meshPhysicalMaterial color="#ffffff" emissive="#8fb8a0" emissiveIntensity={0.3} roughness={0.55} clearcoat={0.3} />
      </instancedMesh>
    </group>
  );
}

interface ParticleBurst {
  birth: number;
  origin: THREE.Vector3;
  velocities: Float32Array;
  positions: Float32Array;
  color: THREE.Color;
  count: number;
  kind: "attack" | "grab";
}

function CombatCameraShake({ attackSignal, grabSignal }: { attackSignal: number; grabSignal: number }) {
  const { camera } = useThree();
  const seen = useRef(0);
  const shakeEnd = useRef(0);
  const shakeOrigin = useRef(new THREE.Vector3());
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const combined = attackSignal + grabSignal * 10000;
    if (combined !== seen.current) {
      seen.current = combined;
      shakeEnd.current = t + 0.28;
      shakeOrigin.current.copy(camera.position);
    }
    if (t < shakeEnd.current) {
      const intensity = Math.max(0, (shakeEnd.current - t) / 0.28);
      camera.position.x += (Math.random() - 0.5) * 0.18 * intensity;
      camera.position.y += (Math.random() - 0.5) * 0.14 * intensity;
    }
  });
  return null;
}

function CombatParticleBurstWithClock({ attackSignal, grabSignal, creatureHue }: { attackSignal: number; grabSignal: number; creatureHue: number }) {
  const clockRef = useRef(new THREE.Clock());
  useFrame(() => {
    if (!clockRef.current.running) clockRef.current.start();
  });
  return <CombatParticleBurst attackSignal={attackSignal} grabSignal={grabSignal} creatureHue={creatureHue} clock={clockRef.current} />;
}

function CombatParticleBurst({ attackSignal, grabSignal, creatureHue, clock }: { attackSignal: number; grabSignal: number; creatureHue: number; clock: THREE.Clock }) {
  const { camera } = useThree();
  const bursts = useRef<ParticleBurst[]>([]);
  const pointsRef = useRef<THREE.Points>(null);
  const seenAttack = useRef(0);
  const seenGrab = useRef(0);
  const maxParticles = 900;

  const positions = useMemo(() => new Float32Array(maxParticles * 3), []);
  const colors = useMemo(() => new Float32Array(maxParticles * 3), []);
  const sizes = useMemo(() => new Float32Array(maxParticles).fill(0), []);

  useFrame(() => {
    const time = clock.elapsedTime;
    if (attackSignal !== seenAttack.current) {
      seenAttack.current = attackSignal;
      emit(camera, "attack", new THREE.Color().setHSL(creatureHue / 360, 0.7, 0.62), time);
    }
    if (grabSignal !== seenGrab.current) {
      seenGrab.current = grabSignal;
      emit(camera, "grab", new THREE.Color().setHSL(((creatureHue + 40) % 360) / 360, 0.7, 0.55), time);
    }

    let writeIndex = 0;
    for (let b = 0; b < bursts.current.length; b += 1) {
      const burst = bursts.current[b];
      const age = time - burst.birth;
      if (age > 0.85) continue;
      const gravity = burst.kind === "grab" ? -1.2 : -3.0;
      for (let i = 0; i < burst.count && writeIndex < maxParticles; i += 1) {
        const vx = burst.velocities[i * 3];
        const vy = burst.velocities[i * 3 + 1] + gravity * age;
        const vz = burst.velocities[i * 3 + 2];
        positions[writeIndex * 3] = burst.origin.x + vx * age;
        positions[writeIndex * 3 + 1] = burst.origin.y + vy * age - 0.5 * 3 * age * age;
        positions[writeIndex * 3 + 2] = burst.origin.z + vz * age;
        const life = Math.max(0, 1 - age / 0.85);
        sizes[writeIndex] = life * (burst.kind === "grab" ? 0.14 : 0.11);
        colors[writeIndex * 3] = burst.color.r * life + (1 - life) * 0.9;
        colors[writeIndex * 3 + 1] = burst.color.g * life + (1 - life) * 0.85;
        colors[writeIndex * 3 + 2] = burst.color.b * life + (1 - life) * 0.7;
        writeIndex += 1;
      }
    }
    for (let i = writeIndex; i < maxParticles; i += 1) {
      positions[i * 3 + 1] = -500;
      sizes[i] = 0;
    }
    bursts.current = bursts.current.filter((b) => time - b.birth < 0.85);
    if (pointsRef.current) {
      (pointsRef.current.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (pointsRef.current.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
      (pointsRef.current.geometry.attributes.size as THREE.BufferAttribute).needsUpdate = true;
    }
  });

  const emit = (cam: THREE.Camera, kind: "attack" | "grab", color: THREE.Color, time: number) => {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const origin = cam.position.clone().addScaledVector(forward, kind === "grab" ? 3.8 : 2.4);
    const count = kind === "grab" ? 28 : 52;
    const velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const spread = kind === "grab" ? 2.2 : 3.8;
      velocities[i * 3] = forward.x * 6 + (Math.random() - 0.5) * spread * 3;
      velocities[i * 3 + 1] = forward.y * 6 + (Math.random() - 0.3) * spread * 3;
      velocities[i * 3 + 2] = forward.z * 6 + (Math.random() - 0.5) * spread * 3;
    }
    bursts.current.push({ birth: time, origin, velocities, positions: new Float32Array(0), color, count, kind });
  };

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
        <bufferAttribute attach="attributes-size" args={[sizes, 1]} />
      </bufferGeometry>
      <pointsMaterial size={0.12} vertexColors transparent opacity={0.95} depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

function GrabBeamFX({ signal }: { signal: number }) {
  const mesh = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  const birth = useRef(0);
  const handled = useRef(-1);
  useFrame(({ camera, clock }) => {
    if (signal !== handled.current) {
      handled.current = signal;
      birth.current = clock.elapsedTime;
    }
    if (!mesh.current || !light.current) return;
    const age = clock.elapsedTime - birth.current;
    const active = age < 0.55 && signal > 0;
    mesh.current.visible = active;
    light.current.intensity = active ? 14 * (1 - age * 1.7) : 0;
    if (!active) return;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const mid = camera.position.clone().addScaledVector(dir, 3.2);
    mesh.current.position.copy(mid);
    mesh.current.quaternion.copy(camera.quaternion);
    const s = 1 - age * 0.8;
    mesh.current.scale.set(s, 1, s);
    const material = mesh.current.material as THREE.MeshPhysicalMaterial;
    material.opacity = Math.max(0, 0.5 - age * 0.85);
  });
  return (
    <group>
      <mesh ref={mesh} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.02, 0.09, 6.4, 10, 1, true]} />
        <meshPhysicalMaterial color="#b8ffd8" emissive="#6fffb0" emissiveIntensity={1.1} transparent opacity={0.5} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <pointLight ref={light} position={[0, 0, 0]} color="#8fffb0" intensity={0} distance={9} />
    </group>
  );
}

function AttackWaveFX({ signal }: { signal: number }) {
  const mesh = useRef<THREE.Mesh>(null);
  const birth = useRef(0);
  const { camera } = useThree();
  const origin = useRef(new THREE.Vector3());
  const handled = useRef(-1);
  useFrame(({ clock }) => {
    if (signal !== handled.current) {
      handled.current = signal;
      birth.current = clock.elapsedTime;
      origin.current.copy(camera.position);
    }
    if (!mesh.current) return;
    const age = clock.elapsedTime - birth.current;
    const active = age < 0.65 && signal > 0;
    mesh.current.visible = active;
    if (!active) return;
    mesh.current.position.copy(origin.current);
    const s = 0.4 + age * 22;
    mesh.current.scale.setScalar(s);
    const material = mesh.current.material as THREE.MeshBasicMaterial;
    material.opacity = Math.max(0, 0.72 - age * 1.1);
  });
  return (
    <mesh ref={mesh} rotation={[Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.92, 1, 48]} />
      <meshBasicMaterial color="#ffe8b0" transparent opacity={0.7} blending={THREE.AdditiveBlending} depthWrite={false} />
    </mesh>
  );
}

function DistrictLandmarks({ seed, quality }: { seed: string; quality: WorldProps["quality"] }) {
  const [playerPos, setPlayerPos] = useState<[number, number]>([0, 0]);
  const lastCheck = useRef(0);
  useFrame(({ camera }) => {
    const now = performance.now();
    if (now - lastCheck.current < 750) return;
    lastCheck.current = now;
    setPlayerPos((current) =>
      Math.abs(camera.position.x - current[0]) > 20 || Math.abs(camera.position.z - current[1]) > 20
        ? [camera.position.x, camera.position.z]
        : current
    );
  });
  const districts = useMemo(() => districtsNear(seed, playerPos[0], playerPos[1], 520), [seed, playerPos]);
  return (
    <group>
      {districts.map((district) => (
        <DistrictMarker key={district.id} seed={seed} district={district} quality={quality} />
      ))}
    </group>
  );
}

function DistrictMarker({ seed, district, quality }: { seed: string; district: District; quality: WorldProps["quality"] }) {
  const groundY = useMemo(() => terrainHeightAt(seed, district.x, district.z), [seed, district]);
  const random = useMemo(() => seededRandom(seed, district.id), [seed, district.id]);
  const densityScale = quality === "low" ? 0.55 : quality === "medium" ? 0.8 : 1;
  const detail = Math.max(2, Math.round(6 * densityScale));
  const color = useMemo(() => new THREE.Color(district.color), [district.color]);
  const dim = useMemo(() => color.clone().multiplyScalar(0.45), [color]);

  const scatter = useMemo(() =>
    Array.from({ length: detail }, (_, i) => ({
      p: [district.x + (random() - 0.5) * district.radius * 1.6, 0, district.z + (random() - 0.5) * district.radius * 1.6] as [number, number, number],
      a: random() * Math.PI * 2,
      s: 0.4 + random() * 1.3,
      h: 1 + random() * 5,
      key: i,
    })), [detail, district, random]);

  switch (district.type) {
    case "crystal":
      return (
        <group>
          {scatter.map((crystal) => (
            <mesh key={crystal.key} position={[crystal.p[0], groundY - 0.4 + crystal.h * 0.5, crystal.p[2]]} scale={[crystal.s, crystal.h, crystal.s]} rotation={[{ x: 0, y: crystal.a, z: 0.4 }.y, 0, 0]} castShadow>
              <octahedronGeometry args={[0.6, 1]} />
              <meshPhysicalMaterial color={color} emissive={color} emissiveIntensity={0.75} transmission={0.35} roughness={0.06} clearcoat={1} />
            </mesh>
          ))}
          <pointLight position={[district.x, groundY + 4, district.z]} color={district.color} intensity={26} distance={district.radius * 2.2} />
        </group>
      );
    case "falls":
      return (
        <group position={[district.x, groundY + 5.5, district.z]}>
          {[0, 1, 2].slice(0, detail % 3 + 1).map((i) => (
            <mesh key={i} position={[i * 1.8 - 1.8, 0, i * 0.6]} rotation={[0.12, i * 0.18, 0]}>
              <planeGeometry args={[3.4, 11, 1, 1]} />
              <meshPhysicalMaterial color="#bfe6ff" emissive="#6fb8e8" emissiveIntensity={0.5} transparent opacity={0.32} side={THREE.DoubleSide} transmission={0.6} roughness={0.1} />
            </mesh>
          ))}
          <DriftParticles seed={district.id} count={220} color="#cfe9ff" radius={8} speed={0.02} />
          <pointLight position={[0, 2, 0]} color="#9fd8ff" intensity={22} distance={district.radius * 2} />
        </group>
      );
    case "ash":
      return (
        <group>
          {scatter.map((trunk) => (
            <mesh key={trunk.key} position={[trunk.p[0], groundY + trunk.h * 0.5, trunk.p[2]]} scale={[0.4, trunk.h, 0.4]} castShadow>
              <coneGeometry args={[0.5, 1, 7]} />
              <meshPhysicalMaterial color="#2a2018" emissive="#1a0f08" emissiveIntensity={0.5} roughness={0.9} />
            </mesh>
          ))}
          <DriftParticles seed={district.id} count={300} color="#ff9c58" radius={district.radius} speed={0.028} />
          <pointLight position={[district.x, groundY + 3, district.z]} color="#ff8c5a" intensity={18} distance={district.radius * 2.2} />
        </group>
      );
    case "reef":
      return (
        <group>
          {scatter.map((coral) => (
            <mesh key={coral.key} position={[coral.p[0], groundY + 0.7, coral.p[2]]} rotation={[coral.a, coral.a * 0.5, coral.a * 0.3]} scale={coral.s} castShadow>
              <torusGeometry args={[1, 0.3, 12, 24]} />
              <meshPhysicalMaterial color={color} emissive={color} emissiveIntensity={0.45} roughness={0.3} clearcoat={0.7} />
            </mesh>
          ))}
          <DriftParticles seed={district.id} count={260} color={district.color} radius={district.radius} speed={0.02} />
        </group>
      );
    case "spire":
      return (
        <group position={[district.x, groundY, district.z]}>
          <mesh position={[0, 5.5, 0]} castShadow>
            <cylinderGeometry args={[0.14, 0.9, 11, 5]} />
            <meshPhysicalMaterial color="#8a95a0" metalness={0.85} roughness={0.2} clearcoat={1} />
          </mesh>
          <mesh position={[0, 11.4, 0]}><icosahedronGeometry args={[0.55, 0]} /><meshBasicMaterial color={district.color} /></mesh>
          <pointLight position={[0, 11, 0]} color={district.color} intensity={24} distance={district.radius * 2.4} />
          {scatter.slice(0, 5).map((rune, i) => (
            <mesh key={rune.key} position={[Math.cos(i / 5 * Math.PI * 2) * 3.2, 0.5 + i * 0.8, Math.sin(i / 5 * Math.PI * 2) * 3.2]} rotation={[0, i, 0.4]}>
              <torusGeometry args={[0.5, 0.03, 6, 24]} />
              <meshBasicMaterial color={district.color} transparent opacity={0.6} />
            </mesh>
          ))}
        </group>
      );
    case "jungle":
      return (
        <group>
          {scatter.map((plant) => (
            <group key={plant.key} position={[plant.p[0], groundY, plant.p[2]]} rotation={[0, plant.a, 0]}>
              <mesh position={[0, plant.h * 0.32, 0]} castShadow><coneGeometry args={[0.3, plant.h * 0.85, 5]} /><meshPhysicalMaterial color={dim} emissive={dim} emissiveIntensity={0.4} roughness={0.85} /></mesh>
              <mesh position={[0, plant.h * 0.75, 0]} scale={[plant.s * 0.8, plant.h * 0.4, plant.s * 0.8]} castShadow><sphereGeometry args={[1, 9, 7]} /><meshPhysicalMaterial color={color} emissive={color} emissiveIntensity={0.3} roughness={0.7} /></mesh>
            </group>
          ))}
          <DriftParticles seed={district.id} count={300} color={district.color} radius={district.radius} speed={0.016} />
        </group>
      );
    case "ruins":
      return (
        <group>
          {scatter.map((stone) => (
            <mesh key={stone.key} position={[stone.p[0], groundY + stone.h * 0.24, stone.p[2]]} rotation={[0.08, stone.a, stone.a * 0.2]} scale={[stone.s, stone.h * 0.5, stone.s * 0.6]} castShadow>
              <boxGeometry args={[1, 1, 1]} />
              <meshPhysicalMaterial color="#8a837a" emissive={dim} emissiveIntensity={0.22} roughness={0.9} />
            </mesh>
          ))}
          <DriftParticles seed={district.id} count={200} color={district.color} radius={district.radius} speed={0.012} />
        </group>
      );
    case "hive-city":
      return (
        <group>
          {scatter.map((cell) => (
            <mesh key={cell.key} position={[cell.p[0], groundY + cell.h * 0.4, cell.p[2]]} rotation={[0, cell.a, 0]} scale={[cell.s, cell.h, cell.s]} castShadow>
              <cylinderGeometry args={[0.5, 0.5, 1, 6]} />
              <meshPhysicalMaterial color={color} emissive={dim} emissiveIntensity={0.5} roughness={0.4} clearcoat={0.4} />
            </mesh>
          ))}
          <pointLight position={[district.x, groundY + 5, district.z]} color={district.color} intensity={18} distance={district.radius * 2} />
          <DriftParticles seed={district.id} count={280} color={district.color} radius={district.radius} speed={0.02} />
        </group>
      );
    case "floating-islets":
      return (
        <group>
          {scatter.map((isle) => (
            <group key={isle.key} position={[isle.p[0], groundY + 4 + isle.h * 0.8, isle.p[2]]} rotation={[0, isle.a, 0]}>
              <mesh scale={[isle.s * 1.8, isle.s * 0.6, isle.s * 1.3]} castShadow><icosahedronGeometry args={[1, 1]} /><meshPhysicalMaterial color={dim} emissive={color} emissiveIntensity={0.3} roughness={0.8} /></mesh>
              <mesh position={[0, -isle.h * 0.45, 0]} scale={[0.1, isle.h * 0.9, 0.1]} rotation={[0.08, 0, 0.06]}><cylinderGeometry args={[1, 1, 1, 5]} /><meshBasicMaterial color={district.color} transparent opacity={0.4} /></mesh>
            </group>
          ))}
          <pointLight position={[district.x, groundY + 6, district.z]} color={district.color} intensity={20} distance={district.radius * 2.4} />
          <DriftParticles seed={district.id} count={240} color={district.color} radius={district.radius} speed={0.014} />
        </group>
      );
    case "graveyard":
      return (
        <group>
          {scatter.map((bone) => (
            <mesh key={bone.key} position={[bone.p[0], groundY + bone.h * 0.26, bone.p[2]]} rotation={[bone.a, bone.a * 0.6, 0.1]} scale={[0.3, bone.h * 0.55, 0.3]} castShadow>
              <capsuleGeometry args={[0.3, 1, 4, 8]} />
              <meshPhysicalMaterial color="#cfc4b0" emissive={dim} emissiveIntensity={0.25} roughness={0.85} />
            </mesh>
          ))}
          <DriftParticles seed={district.id} count={240} color={district.color} radius={district.radius} speed={0.01} />
        </group>
      );
    case "geode-cave":
      return (
        <group position={[district.x, groundY, district.z]}>
          <mesh position={[0, 1, 0]} rotation={[0, 0.4, 0]} scale={[2.2, 1.4, 1.8]} castShadow>
            <torusGeometry args={[1.5, 0.55, 12, 36]} />
            <meshPhysicalMaterial color={dim} emissive={color} emissiveIntensity={0.3} roughness={0.75} />
          </mesh>
          {scatter.slice(0, 6).map((coral) => (
            <mesh key={coral.key} position={[coral.p[0] - district.x * 0.02, 0.2, coral.p[2] - district.z * 0.02]} scale={coral.s * 0.6}>
              <octahedronGeometry args={[0.7, 0]} />
              <meshPhysicalMaterial color={color} emissive={color} emissiveIntensity={0.85} transmission={0.4} roughness={0.05} />
            </mesh>
          ))}
          <pointLight position={[0, 1.5, 0]} color={district.color} intensity={16} distance={district.radius * 2} />
        </group>
      );
    case "spores":
      return (
        <group>
          {scatter.map((mush) => (
            <group key={mush.key} position={[mush.p[0], groundY, mush.p[2]]} rotation={[0, mush.a, 0]}>
              <mesh position={[0, mush.h * 0.32, 0]} scale={[0.18, mush.h * 0.65, 0.18]}><cylinderGeometry args={[0.6, 1, 1, 6]} /><meshPhysicalMaterial color={dim} emissive={dim} emissiveIntensity={0.5} roughness={0.6} /></mesh>
              <mesh position={[0, mush.h * 0.72, 0]} scale={[mush.s * 0.9, mush.h * 0.4, mush.s * 0.9]}><sphereGeometry args={[1, 9, 6]} /><meshPhysicalMaterial color={color} emissive={color} emissiveIntensity={0.4} roughness={0.5} clearcoat={0.3} /></mesh>
            </group>
          ))}
          <DriftParticles seed={district.id} count={340} color={district.color} radius={district.radius} speed={0.008} />
          <pointLight position={[district.x, groundY + 3, district.z]} color={district.color} intensity={14} distance={district.radius * 2} />
        </group>
      );
    default:
      return null;
  }
}

function ReflectiveOcean({ quality }: { quality: WorldProps["quality"] }) {
  const distortion = useMemo(() => {
    const size = 128;
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const index = (y * size + x) * 4;
        const wave = Math.sin(x * 0.31 + Math.sin(y * 0.18) * 2.2) * 0.5 + 0.5;
        const cross = Math.cos(y * 0.43 + Math.sin(x * 0.11) * 3.1) * 0.5 + 0.5;
        const value = Math.round((wave * 0.6 + cross * 0.4) * 255);
        data[index] = value;
        data[index + 1] = value;
        data[index + 2] = value;
        data[index + 3] = 255;
      }
    }
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(8, 8);
    texture.needsUpdate = true;
    return texture;
  }, []);
  useFrame((_, delta) => {
    distortion.offset.x = (distortion.offset.x + delta * 0.013) % 1;
    distortion.offset.y = (distortion.offset.y + delta * 0.006) % 1;
  });
  return (
    <mesh position={[0, -2.25, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[220, 220, 1, 1]} />
      <MeshReflectorMaterial
        resolution={quality === "ultra" ? 1024 : 512}
        mirror={0.82}
        blur={quality === "ultra" ? [380, 120] : [220, 80]}
        mixBlur={1.25}
        mixStrength={2.2}
        depthScale={1.1}
        minDepthThreshold={0.2}
        maxDepthThreshold={1.5}
        distortion={0.58}
        distortionMap={distortion}
        color="#073943"
        metalness={0.72}
        roughness={0.19}
      />
    </mesh>
  );
}

function AtmosphericShafts({ color = "#ffe3b5" }: { color?: string }) {
  const root = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (root.current) root.current.rotation.z = -0.42 + Math.sin(clock.elapsedTime * 0.13) * 0.018;
  });
  return (
    <group ref={root} position={[-10, 8, -15]} rotation={[0.18, 0.1, -0.42]}>
      {Array.from({ length: 7 }, (_, index) => (
        <mesh key={index} position={[index * 2.1 - 6, 0, index * -1.1]} rotation={[0, 0, index * 0.025]}>
          <coneGeometry args={[1.8 + index * 0.18, 34, 20, 1, true]} />
          <meshBasicMaterial color={color} transparent opacity={0.018 + (index % 3) * 0.009} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}
    </group>
  );
}

function MonolithField({ seed }: { seed: string }) {
  const forms = useMemo(() => {
    const random = seededRandom(seed, "monolith-field");
    return Array.from({ length: 18 }, (_, index) => ({
      position: [(random() - 0.5) * 78, -1.2, -5 - random() * 72] as [number, number, number],
      height: 2.8 + random() * 11,
      width: 0.25 + random() * 1.1,
      rotation: (random() - 0.5) * 0.45,
      hue: 0.44 + random() * 0.11,
      id: index,
    }));
  }, [seed]);
  return (
    <group>
      {forms.map((form) => {
        const color = new THREE.Color().setHSL(form.hue, 0.65, 0.34);
        return (
          <group key={form.id} position={form.position} rotation={[0, form.rotation, form.rotation * 0.3]}>
            <mesh position={[0, form.height * 0.5, 0]} castShadow>
              <octahedronGeometry args={[1, 0]} />
              <meshPhysicalMaterial color={color} emissive={color} emissiveIntensity={0.3} metalness={0.82} roughness={0.12} clearcoat={1} clearcoatRoughness={0.08} />
            </mesh>
            <mesh position={[0, form.height * 0.47, 0]} scale={[form.width, form.height, form.width]} castShadow>
              <octahedronGeometry args={[1, 0]} />
              <meshPhysicalMaterial color="#0c2c2c" emissive={color} emissiveIntensity={0.18} metalness={0.75} roughness={0.18} clearcoat={1} />
            </mesh>
            <pointLight position={[0, form.height, 0]} color={color} intensity={2.4} distance={7} />
          </group>
        );
      })}
    </group>
  );
}

function terrainHeightAt(seed: string, x: number, z: number) {
  const hash = hashString(`${seed}:terrain-shape`);
  const a = 0.09 + ((hash >>> 4) % 1000) / 1000 * 0.04;
  const b = 0.16 + ((hash >>> 11) % 1000) / 1000 * 0.05;
  const broad = Math.sin(x * a) * Math.cos(-z * b) * 3.1;
  const ridges = Math.sin((x - z) * 0.32) * 0.45 + Math.cos((x + z) * 0.19) * 0.7;
  const shelf = Math.sin(Math.sqrt(x * x + z * z) * 0.11) * 1.2;
  return broad + ridges + shelf - 3.5;
}

function AlienFlora({ seed, density }: { seed: string; density: number }) {
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const budRef = useRef<THREE.InstancedMesh>(null);
  const group = useRef<THREE.Group>(null);
  const { trunkMatrices, budMatrices, budColors } = useMemo(() => {
    const random = seededRandom(seed, "flora");
    const dummy = new THREE.Object3D();
    const trunkMatrices: THREE.Matrix4[] = [];
    const budMatrices: THREE.Matrix4[] = [];
    const budColors: THREE.Color[] = [];
    for (let index = 0; index < density; index += 1) {
      const x = (random() - 0.5) * 100;
      const z = (random() - 0.5) * 100;
      const y = terrainHeightAt(seed, x, z) - 0.2;
      const height = 0.8 + random() * 4;
      const tilt = (random() - 0.5) * 0.24;
      dummy.position.set(x, y + height * 0.5, z);
      dummy.scale.set(1, height, 1);
      dummy.rotation.set(tilt, 0, tilt * 0.7);
      dummy.updateMatrix();
      trunkMatrices.push(dummy.matrix.clone());
      const hue = 0.38 + random() * 0.18;
      const branchCount = 2 + Math.floor(random() * 4);
      for (let branch = 0; branch < branchCount; branch += 1) {
        const angle = branch / branchCount * Math.PI * 2 + random() * 0.6;
        const radius = (0.1 + branch * 0.08) * height * 0.42;
        dummy.position.set(x + Math.cos(angle) * radius, y + height * (0.55 + branch * 0.08), z + Math.sin(angle) * radius);
        dummy.scale.set(0.2 + random() * 0.18, 0.09 + random() * 0.08, 0.2 + random() * 0.18);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        budMatrices.push(dummy.matrix.clone());
        budColors.push(new THREE.Color().setHSL(hue, 0.55, 0.42 + random() * 0.16));
      }
    }
    return { trunkMatrices, budMatrices, budColors };
  }, [seed, density]);

  useEffect(() => {
    if (trunkRef.current) {
      trunkMatrices.forEach((matrix, index) => trunkRef.current!.setMatrixAt(index, matrix));
      trunkRef.current.instanceMatrix.needsUpdate = true;
    }
    if (budRef.current) {
      budMatrices.forEach((matrix, index) => {
        budRef.current!.setMatrixAt(index, matrix);
        budRef.current!.setColorAt(index, budColors[index]);
      });
      budRef.current.instanceMatrix.needsUpdate = true;
      if (budRef.current.instanceColor) budRef.current.instanceColor.needsUpdate = true;
    }
  }, [trunkMatrices, budMatrices, budColors]);

  useFrame(({ clock }) => {
    if (group.current) group.current.rotation.y = Math.sin(clock.elapsedTime * 0.5) * 0.008;
  });

  return (
    <group ref={group}>
      <instancedMesh ref={trunkRef} args={[undefined, undefined, density]} castShadow>
        <cylinderGeometry args={[0.022, 0.075, 1, 6]} />
        <meshStandardMaterial color="#274c3f" roughness={0.68} />
      </instancedMesh>
      <instancedMesh ref={budRef} args={[undefined, undefined, budMatrices.length]} castShadow>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial color="#ffffff" roughness={0.35} emissive="#7fbf8f" emissiveIntensity={0.55} />
      </instancedMesh>
    </group>
  );
}

function SimulatedFauna({ seed, density, tension = 20 }: { seed: string; density: number; tension?: number }) {
  const group = useRef<THREE.Group>(null);
  const fauna = useMemo(() => {
    const random = seededRandom(seed, "fauna");
    return Array.from({ length: density }, () => ({
      position: new THREE.Vector3((random() - 0.5) * 55, 0.2 + random() * 7, (random() - 0.5) * 55),
      velocity: new THREE.Vector3((random() - 0.5), (random() - 0.5) * 0.2, (random() - 0.5)).normalize().multiplyScalar(0.3 + random() * 0.45),
      scale: 0.2 + random() * 0.55,
      color: new THREE.Color().setHSL(0.47 + random() * 0.17, 0.5, 0.52),
    }));
  }, [seed, density]);

  useFrame(({ camera }, delta) => {
    if (!group.current) return;
    const agitation = 0.7 + Math.min(1.8, tension / 55);
    const fleeRadius = 14 + Math.min(26, tension * 0.32);
    group.current.children.forEach((child, index) => {
      const agent = fauna[index];
      const towardCenter = agent.position.clone().multiplyScalar(-0.0008);
      const fromPlayer = agent.position.clone().sub(camera.position);
      if (fromPlayer.lengthSq() < fleeRadius) agent.velocity.add(fromPlayer.normalize().multiplyScalar(delta * 1.8 * agitation));
      agent.velocity.add(towardCenter).clampLength(0.25, 1.05 * agitation);
      agent.position.addScaledVector(agent.velocity, delta * agitation);
      child.position.copy(agent.position);
      child.lookAt(agent.position.clone().add(agent.velocity));
    });
  });
  return (
    <group ref={group}>
      {fauna.map((agent, index) => (
        <group key={index} position={agent.position} scale={agent.scale}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.45, 1.6, 5]} />
            <meshPhysicalMaterial color={agent.color} emissive={agent.color} emissiveIntensity={0.5} roughness={0.3} clearcoat={0.6} />
          </mesh>
          <mesh position={[0, 0, 0.65]} scale={[1.3, 0.18, 0.55]}>
            <sphereGeometry args={[0.6, 12, 8]} />
            <meshBasicMaterial color="#c6ffeb" transparent opacity={0.52} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Structures({ count }: { count: number }) {
  return (
    <group position={[2, -1.2, -8]}>
      {Array.from({ length: count }, (_, index) => {
        const angle = index * 2.399;
        const radius = 2 + Math.sqrt(index) * 2.2;
        return (
          <group key={index} position={[Math.cos(angle) * radius, 0, Math.sin(angle) * radius]}>
            <mesh position={[0, 1.4, 0]}>
              <cylinderGeometry args={[0.08, 0.34, 2.8 + (index % 3), 6]} />
              <meshStandardMaterial color="#263b40" metalness={0.65} roughness={0.32} />
            </mesh>
            <mesh position={[0, 3 + (index % 3) * 0.48, 0]}>
              <octahedronGeometry args={[0.32, 0]} />
              <meshBasicMaterial color="#b6ffd8" />
            </mesh>
            <pointLight position={[0, 3, 0]} color="#78ffc4" intensity={3} distance={7} />
          </group>
        );
      })}
    </group>
  );
}

function RainSystem({ seed, intensity = 1 }: { seed: string; intensity?: number }) {
  const count = Math.floor(820 * intensity);
  const ref = useRef<THREE.Points>(null);
  const data = useMemo(() => {
    const random = seededRandom(seed, "rain");
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      pos[i * 3] = (random() - 0.5) * 110;
      pos[i * 3 + 1] = random() * 34;
      pos[i * 3 + 2] = (random() - 0.5) * 110;
      vel[i] = 14 + random() * 16;
    }
    return { pos, vel };
  }, [seed, count]);
  useFrame((_, delta) => {
    if (!ref.current) return;
    const attr = ref.current.geometry.attributes.position as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < count; i += 1) {
      arr[i * 3 + 1] -= data.vel[i] * delta;
      arr[i * 3] -= delta * 2.4;
      if (arr[i * 3 + 1] < -4) {
        arr[i * 3 + 1] = 28 + Math.random() * 8;
        arr[i * 3] = (Math.random() - 0.5) * 110;
      }
    }
    attr.needsUpdate = true;
  });
  return (
    <points ref={ref} renderOrder={2}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[data.pos, 3]} /></bufferGeometry>
      <pointsMaterial color="#b8d8e8" size={0.09} transparent opacity={0.5} depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

function Lightning({ seed }: { seed: string }) {
  const light = useRef<THREE.PointLight>(null);
  const phase = useMemo(() => (hashString(seed + "storm") % 90) / 10, [seed]);
  useFrame(({ clock }) => {
    if (!light.current) return;
    const cycle = (clock.elapsedTime + phase) % 9.5;
    const strike = cycle < 0.16;
    const flicker = strike ? 34 + Math.random() * 55 : cycle < 0.45 ? 3 : 0;
    light.current.intensity = THREE.MathUtils.lerp(light.current.intensity, flicker, 0.35);
  });
  const random = seededRandom(seed, "bolt-pos");
  const x = (random() - 0.5) * 60;
  const z = -20 - random() * 50;
  return <pointLight ref={light} position={[x, 26, z]} color="#dce8ff" intensity={0} distance={130} decay={1.6} />;
}

function ThermalVents({ seed, count = 5 }: { seed: string; count?: number }) {
  const vents = useMemo(() => {
    const random = seededRandom(seed, "vents");
    return Array.from({ length: count }, (_, index) => ({
      position: [(random() - 0.5) * 70, -2.1, (random() - 0.5) * 60 - 8] as [number, number, number],
      height: 2.2 + random() * 4.5,
      hue: 0.04 + random() * 0.05,
      id: index,
    }));
  }, [seed, count]);
  return (
    <group>
      {vents.map((vent) => (
        <group key={vent.id} position={vent.position}>
          <mesh position={[0, vent.height * 0.22, 0]} castShadow>
            <coneGeometry args={[0.9, vent.height * 0.6, 8]} />
            <meshPhysicalMaterial color="#241a16" emissive="#150d08" emissiveIntensity={0.4} roughness={0.85} />
          </mesh>
          <mesh position={[0, vent.height * 0.62, 0]} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[0.55, vent.height * 0.7, 10, 1, true]} />
            <meshBasicMaterial color="#ff7a30" transparent opacity={0.25} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>
          <mesh position={[0, vent.height * 0.5, 0]} scale={0.42}>
            <sphereGeometry args={[1, 14, 10]} />
            <meshBasicMaterial color="#ffae60" transparent opacity={0.8} blending={THREE.AdditiveBlending} />
          </mesh>
          <pointLight position={[0, vent.height * 0.55, 0]} color="#ff8a45" intensity={9} distance={13} />
        </group>
      ))}
    </group>
  );
}

function RealmBody({ realm, seed, density, quality }: { realm: import("../game/procedural").Realm; seed: string; density: number; quality: WorldProps["quality"] }) {
  const group = useRef<THREE.Group>(null);
  const random = useMemo(() => seededRandom(seed, realm.id), [seed, realm.id]);
  const color = useMemo(() => new THREE.Color(realm.color), [realm.color]);
  const items = useMemo(() => {
    const count = Math.floor(density * 1.4);
    return Array.from({ length: count }, (_, index) => ({
      id: index,
      p: [(random() - 0.5) * 70, (random() - 0.5) * 30 + 4, (random() - 0.5) * 70 - 12] as [number, number, number],
      s: 0.2 + random() * 1.6,
      spin: (random() - 0.5) * 0.6,
      v: 0.2 + random() * 0.7,
      hueShift: (random() - 0.5) * 0.12,
    }));
  }, [density, random]);

  useFrame(({ clock }) => {
    if (!group.current) return;
    group.current.children.forEach((child, index) => {
      const item = items[index];
      child.position.y = item.p[1] + Math.sin(clock.elapsedTime * item.v + item.id) * 0.9;
      child.rotation.y = clock.elapsedTime * item.spin * 0.4;
      child.rotation.x = clock.elapsedTime * item.spin * 0.2;
    });
  });

  const archetype = realm.archetype;
  if (realm.kind === "authored") return null;
  return (
    <>
      <color attach="background" args={[realm.fog]} />
      <fog attach="fog" args={[realm.fog, 9, 220]} />
      <ambientLight intensity={0.24} color={realm.color} />
      <hemisphereLight args={[realm.color, realm.fog, 0.42]} />
      <directionalLight position={[-14, 20, 10]} color={realm.color} intensity={1.8} />
      <pointLight position={[4, 6, -8]} color={realm.color} intensity={60} distance={80} />
      <pointLight position={[-8, -2, -14]} color={new THREE.Color(realm.fog).offsetHSL(0.1, 0.2, 0.2)} intensity={40} distance={60} />
      <pointLight position={[12, 4, 20]} color={realm.color} intensity={35} distance={90} />
      <pointLight position={[-18, -4, -28]} color={realm.fog} intensity={48} distance={70} />
      <AtmosphericShafts color={realm.color} />
      <group ref={group}>
        {items.map((item) => {
          const c = color.clone().offsetHSL(item.hueShift, 0, 0);
          if (archetype === "foam" || archetype === "plasma-sea") {
            return (
              <mesh key={item.id} position={item.p} scale={item.s}>
                <sphereGeometry args={[1, 14, 10]} />
                <meshPhysicalMaterial color={c} emissive={c} emissiveIntensity={archetype === "plasma-sea" ? 0.9 : 0.25} transparent opacity={0.42} transmission={0.5} roughness={0.1} clearcoat={1} />
              </mesh>
            );
          }
          if (archetype === "vascular" || archetype === "marrow") {
            return (
              <mesh key={item.id} position={item.p} rotation={[item.spin, item.id, 0.4]} scale={[item.s * 0.4, item.s * 3.2, item.s * 0.4]}>
                <capsuleGeometry args={[1, 1, 4, 8]} />
                <meshPhysicalMaterial color={c} emissive={c} emissiveIntensity={0.3} roughness={0.35} clearcoat={0.6} />
              </mesh>
            );
          }
          if (archetype === "crystal-grove" || archetype === "mirror-field") {
            return (
              <mesh key={item.id} position={item.p} scale={[item.s, item.s * 2.6, item.s]}>
                <octahedronGeometry args={[0.8, 0]} />
                <meshPhysicalMaterial color={c} emissive={c} emissiveIntensity={0.55} transmission={0.4} roughness={0.06} clearcoat={1} metalness={0.5} />
              </mesh>
            );
          }
          if (archetype === "storm" || archetype === "circuit") {
            return (
              <mesh key={item.id} position={item.p} scale={item.s}>
                <boxGeometry args={[1, 1, 1]} />
                <meshPhysicalMaterial color={c} emissive={c} emissiveIntensity={archetype === "storm" ? 0.8 : 0.5} wireframe={archetype === "circuit"} roughness={0.2} metalness={0.7} />
              </mesh>
            );
          }
          if (archetype === "helix") {
            return (
              <mesh key={item.id} position={item.p} scale={item.s} rotation={[0.3, item.id, 0.4]}>
                <torusKnotGeometry args={[0.7, 0.16, 48, 6, 2, 3]} />
                <meshPhysicalMaterial color={c} emissive={c} emissiveIntensity={0.5} roughness={0.2} clearcoat={0.8} />
              </mesh>
            );
          }
          if (archetype === "hive") {
            return (
              <mesh key={item.id} position={item.p} scale={item.s} rotation={[Math.PI / 2, 0, item.spin]}>
                <cylinderGeometry args={[0.8, 0.8, 0.3, 6]} />
                <meshPhysicalMaterial color={c} emissive={c} emissiveIntensity={0.5} roughness={0.25} metalness={0.4} clearcoat={0.8} />
              </mesh>
            );
          }
          if (archetype === "forest-depth") {
            return (
              <mesh key={item.id} position={item.p} scale={[item.s * 0.3, item.s * 2.2, item.s * 0.3]}>
                <coneGeometry args={[1, 1, 6]} />
                <meshPhysicalMaterial color={c} emissive={c} emissiveIntensity={0.35} roughness={0.6} />
              </mesh>
            );
          }
          if (archetype === "titan") {
            return (
              <mesh key={item.id} position={item.p} scale={[item.s * 4, item.s * 0.7, item.s * 1.8]} rotation={[0, item.spin, 0.2]}>
                <sphereGeometry args={[1, 18, 12]} />
                <meshPhysicalMaterial color={c} emissive={c} emissiveIntensity={0.18} roughness={0.7} clearcoat={0.3} />
              </mesh>
            );
          }
          return (
            <mesh key={item.id} position={item.p} scale={item.s}>
              <icosahedronGeometry args={[1, 1]} />
              <meshPhysicalMaterial color={c} emissive={c} emissiveIntensity={0.45} roughness={0.3} />
            </mesh>
          );
        })}
      </group>
      <DriftParticles seed={`${seed}:${realm.id}`} count={density * 14} color={realm.color} radius={34} speed={0.02} />
      <Sparkles count={quality === "low" ? 120 : 300} position={[0, 2, -8]} scale={[60, 30, 60]} size={2} speed={0.4} color={realm.color} opacity={0.6} />
      {archetype === "storm" && <Lightning seed={`${seed}:storm-realm`} />}
      {(archetype === "vascular" || archetype === "titan" || archetype === "helix") && (
        <mesh position={[0, -3, -20]}>
          <torusGeometry args={[9, 1.5, 18, 90]} />
          <meshPhysicalMaterial color={color.clone().multiplyScalar(0.4)} emissive={color.clone().multiplyScalar(0.3)} emissiveIntensity={0.6} transparent opacity={0.5} roughness={0.35} />
        </mesh>
      )}
      {(archetype === "crystal-grove" || archetype === "mirror-field" || archetype === "hive") && (
        <group position={[0, -2, -14]}>
          {Array.from({ length: 6 }, (_, i) => (
            <mesh key={i} position={[Math.cos(i / 6 * Math.PI * 2) * 5.5, 0.5 + (i % 3) * 0.7, Math.sin(i / 6 * Math.PI * 2) * 5.5]} rotation={[0, i, i * 0.4]}>
              <torusGeometry args={[1.2, 0.04, 8, 44]} />
              <meshBasicMaterial color={realm.color} transparent opacity={0.4} />
            </mesh>
          ))}
        </group>
      )}
      <mesh position={[0, -3.4, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[420, 420, 1, 1]} />
        <meshStandardMaterial color={color.clone().multiplyScalar(0.18)} roughness={0.9} metalness={0.2} emissive={color.clone().multiplyScalar(0.12)} emissiveIntensity={0.6} />
      </mesh>
      <Sparkles count={260} position={[0, 2, 0]} scale={[120, 40, 120]} size={1.6} speed={0.18} color={realm.color} opacity={0.65} />
      <DriftParticles seed={`${realm.id}:ambient`} count={480} color={realm.color} radius={80} speed={0.014} />
      <DriftParticles seed={`${realm.id}:mist`} count={240} color={realm.fog} radius={60} speed={-0.008} />
    </>
  );
}

function CombatArms({ creature, attackSignal, grabSignal, cameraMode }: { creature: CreatureDefinition; attackSignal: number; grabSignal: number; cameraMode: "first" | "third" | "orbit" }) {
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Mesh>(null);
  const rightArm = useRef<THREE.Mesh>(null);
  const slash = useRef<THREE.Mesh>(null);
  const attackBirth = useRef(-10);
  const grabBirth = useRef(-10);
  const seenAttack = useRef(0);
  const seenGrab = useRef(0);
  const color = useMemo(() => new THREE.Color().setHSL(creature.hue / 360, 0.6, 0.55), [creature.hue]);

  useEffect(() => {
    if (!groupRef.current || cameraMode !== "first") return;
    const holder = groupRef.current;
    camera.add(holder);
    return () => { camera.remove(holder); };
  }, [camera, cameraMode]);

  useFrame(({ clock }) => {
    const time = clock.elapsedTime;
    if (attackSignal !== seenAttack.current) { seenAttack.current = attackSignal; attackBirth.current = time; }
    if (grabSignal !== seenGrab.current) { seenGrab.current = grabSignal; grabBirth.current = time; }
    const attackAge = time - attackBirth.current;
    const grabAge = time - grabBirth.current;
    const attackActive = attackAge < 0.42;
    const grabActive = grabAge < 0.55;
    const idleSway = Math.sin(time * 1.4) * 0.02;

    if (rightArm.current) {
      const punch = attackActive ? Math.sin(Math.min(attackAge / 0.42, 1) * Math.PI) : 0;
      rightArm.current.position.set(0.85, -0.72 + idleSway + punch * 0.1, -1.5 - punch * 1.55);
      rightArm.current.rotation.set(-0.35 - punch * 0.38, -0.3 - punch * 0.2, -0.2);
      const m = rightArm.current.material as THREE.MeshPhysicalMaterial;
      m.emissiveIntensity = 0.35 + punch * 1.1;
    }
    if (leftArm.current) {
      const scoop = grabActive ? Math.sin(Math.min(grabAge / 0.55, 1) * Math.PI) : 0;
      leftArm.current.position.set(-0.85, -0.72 + idleSway * 0.7 + scoop * 0.08, -1.5 - scoop * 1.6);
      leftArm.current.rotation.set(-0.35 - scoop * 0.4, 0.3 + scoop * 0.2, 0.2);
      const m = leftArm.current.material as THREE.MeshPhysicalMaterial;
      m.emissiveIntensity = 0.35 + scoop * 1.3;
    }
    if (slash.current) {
      const age = attackActive ? attackAge : grabAge;
      const active = (attackActive || grabActive) && age > 0.06 && age < 0.5;
      slash.current.visible = active;
      slash.current.position.set(0, 0.15 - idleSway, -2.1 - age * 2.4);
      slash.current.rotation.set(0.1, 0, -age * 5);
      slash.current.scale.setScalar(0.8 + age * 4);
      const m = slash.current.material as THREE.MeshBasicMaterial;
      m.opacity = Math.max(0, 0.8 - age * 1.4);
    }
  });

  if (cameraMode !== "first") return null;
  return (
    <group ref={groupRef}>
      <mesh ref={rightArm}>
        <capsuleGeometry args={[0.09, 0.75, 4, 10]} />
        <meshPhysicalMaterial color={color} emissive={color.clone().multiplyScalar(0.5)} emissiveIntensity={0.35} roughness={0.35} clearcoat={0.4} />
      </mesh>
      <mesh ref={leftArm}>
        <capsuleGeometry args={[0.09, 0.75, 4, 10]} />
        <meshPhysicalMaterial color={color} emissive={color.clone().multiplyScalar(0.5)} emissiveIntensity={0.35} roughness={0.35} clearcoat={0.4} />
      </mesh>
      <mesh ref={slash} scale={0}>
        <planeGeometry args={[1.6, 0.22]} />
        <meshBasicMaterial color="#b8ffe0" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

const causticsShader = {
  vertex: `
    varying vec2 vUv;
    void main() {
      vUv = uv * 20.0;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragment: `
    varying vec2 vUv;
    uniform float uTime;
    void main() {
      float a = sin(vUv.x + sin(vUv.y * 0.8) + uTime * 0.9) + cos(vUv.y - uTime * 0.7 + sin(vUv.x * 0.6));
      float b = sin((vUv.x + vUv.y) * 1.4 - uTime * 1.2);
      float pattern = pow(abs(a + b) * 0.5 + 0.5, 7.0);
      vec3 color = vec3(0.45, 0.95, 0.85) * pattern;
      gl_FragColor = vec4(color, pattern * 0.5);
    }
  `,
};

function CausticGlow() {
  const material = useRef<THREE.ShaderMaterial>(null);
  useFrame(({ clock }) => {
    if (material.current) material.current.uniforms.uTime.value = clock.elapsedTime;
  });
  return (
    <mesh position={[0, -1.88, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[88, 88, 1, 1]} />
      <shaderMaterial
        ref={material}
        vertexShader={causticsShader.vertex}
        fragmentShader={causticsShader.fragment}
        uniforms={{ uTime: { value: 0 } }}
        transparent
        opacity={0.85}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

function SkyFlock({ seed, count = 24 }: { seed: string; count?: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const birds = useMemo(() => {
    const random = seededRandom(seed, "sky-flock");
    return Array.from({ length: count }, (_, index) => ({
      angle: random() * Math.PI * 2,
      radius: 28 + random() * 16,
      height: 22 + random() * 16,
      speed: 0.12 + random() * 0.1,
      offset: index,
      wing: random() * Math.PI * 2,
    }));
  }, [seed, count]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const time = clock.elapsedTime;
    birds.forEach((bird, index) => {
      const angle = bird.angle + time * bird.speed;
      const x = Math.cos(angle) * bird.radius;
      const z = Math.sin(angle) * bird.radius;
      const y = bird.height + Math.sin(time * 0.7 + bird.offset) * 2.2;
      dummy.position.set(x, y, z);
      dummy.rotation.set(Math.sin(time * 0.9 + bird.offset) * 0.2, angle - Math.PI / 2, Math.sin(time * 14 + bird.wing) * 0.55);
      const scale = 0.6 + Math.sin(time * 14 + bird.wing) * 0.25;
      dummy.scale.set(0.38, 0.38, 0.38 * (0.7 + Math.abs(scale) * 0.6));
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(index, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <coneGeometry args={[1, 2.4, 4]} />
      <meshPhysicalMaterial color="#d8e8e0" emissive="#9fc8b8" emissiveIntensity={0.4} roughness={0.4} clearcoat={0.6} />
    </instancedMesh>
  );
}

function Portal({ position, color, targetRealm, onEnter }: { position: [number, number, number]; color: string; targetRealm: string; onEnter: (realmId: string) => void }) {
  const group = useRef<THREE.Group>(null);
  const disc = useRef<THREE.Mesh>(null);
  const lastEnter = useRef(-10);
  useFrame(({ camera, clock }, delta) => {
    if (!group.current) return;
    const tpl = group.current.rotation.z + delta * 0.9;
    group.current.rotation.z = tpl % (Math.PI * 2);
    const d = camera.position.distanceTo(group.current.position);
    const glow = d < 14 ? 1.4 : 0.9;
    if (disc.current) {
      disc.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 2.2) * 0.045);
      const mat = disc.current.material as THREE.MeshPhysicalMaterial;
      mat.emissiveIntensity = glow;
    }
    if (d < 5 && clock.elapsedTime - lastEnter.current > 4) {
      lastEnter.current = clock.elapsedTime;
      onEnter(targetRealm);
    }
  });
  return (
    <group ref={group} position={position} rotation={[Math.PI / 2.4, 0, 0]}>
      <mesh>
        <torusGeometry args={[2.4, 0.28, 12, 44]} />
        <meshPhysicalMaterial color={color} emissive={color} emissiveIntensity={1.2} roughness={0.2} clearcoat={1} />
      </mesh>
      <mesh ref={disc}>
        <circleGeometry args={[2.2, 32]} />
        <meshPhysicalMaterial color="#0a1218" emissive={color} emissiveIntensity={0.9} transparent opacity={0.75} roughness={0.05} clearcoat={1} side={THREE.DoubleSide} />
      </mesh>
      <pointLight color={color} intensity={16} distance={16} />
    </group>
  );
}

function PlanetWorld({ seed, density, structures, quality, storm = 0.7, ventCount = 5, tension = 20, attackSignal = 0, grabSignal = 0, onPrey, onRealmEnter }: { seed: string; density: number; structures: number; quality: WorldProps["quality"]; storm?: number; ventCount?: number; tension?: number; attackSignal?: number; grabSignal?: number; onPrey?: (count: number, kind: string) => void; onRealmEnter?: (realmId: string) => void }) {
  const microGatePos = useMemo(() => {
    const random = seededRandom(seed, "micro-gate");
    return [(random() - 0.5) * 30, 1.8, -12 - random() * 20] as [number, number, number];
  }, [seed]);
  return (
    <>
      <color attach="background" args={["#0b1718"]} />
      <fog attach="fog" args={["#243c39", 7, 120]} />
      <Sky distance={450000} sunPosition={[-18, 14, -28]} inclination={0.51} azimuth={0.16} turbidity={10} rayleigh={2.7} mieCoefficient={0.016} mieDirectionalG={0.91} />
      <hemisphereLight args={["#ffdca6", "#031517", 1.15]} />
      <directionalLight position={[-18, 24, 8]} color="#ffe0a7" intensity={4.2} castShadow shadow-mapSize={[quality === "ultra" ? 2048 : 1024, quality === "ultra" ? 2048 : 1024]} shadow-bias={-0.0002} />
      <pointLight position={[12, 3, -18]} color="#66e6ff" intensity={22} distance={45} />
      <InfiniteTerrain seed={seed} quality={quality} />
      <ReflectiveOcean quality={quality} />
      <CausticGlow />
      <SkyFlock seed={seed} count={quality === "low" ? 14 : 28} />
      {onRealmEnter && <Portal position={microGatePos} color="#9fe8ff" targetRealm="micro" onEnter={onRealmEnter} />}
      <AtmosphericShafts />
      <MonolithField seed={seed} />
      <DistrictLandmarks seed={seed} quality={quality} />
      <ThermalVents seed={seed} count={ventCount} />
      {storm > 0.4 && <RainSystem seed={seed} intensity={storm} />}
      {storm > 0.5 && <Lightning seed={seed} />}
      <AlienFlora seed={seed} density={density} />
      <MicroLifeSystem seed={seed} density={density} tension={tension} attackSignal={attackSignal} grabSignal={grabSignal} onPrey={onPrey} />
      <AttackWaveFX signal={attackSignal} />
      <GrabBeamFX signal={grabSignal} />
      <SimulatedFauna seed={seed} density={Math.max(6, Math.floor(density / 7))} tension={tension} />
      <Structures count={structures} />
      <DriftParticles seed={seed} count={density * 5} color="#d9ffe5" radius={46} speed={0.004} />
      <Sparkles count={quality === "low" ? 180 : 420} position={[0, 1.5, -10]} scale={[110, 18, 110]} size={2.2} speed={0.35} color="#c8ffe0" opacity={0.5} />
    </>
  );
}

function CellField({ seed, density }: { seed: string; density: number }) {
  const group = useRef<THREE.Group>(null);
  const cells = useMemo(() => {
    const random = seededRandom(seed, "cell-field");
    return Array.from({ length: density }, (_, index) => ({
      id: index,
      p: [(random() - 0.5) * 44, (random() - 0.5) * 27, (random() - 0.5) * 44] as [number, number, number],
      size: 0.3 + random() * 1.6,
      hue: 0.91 + random() * 0.09,
      speed: random() * 0.4 + 0.2,
    }));
  }, [seed, density]);
  useFrame(({ clock }) => {
    if (!group.current) return;
    group.current.children.forEach((child, index) => {
      const cell = cells[index];
      child.position.y = cell.p[1] + Math.sin(clock.elapsedTime * cell.speed + index) * 0.8;
      child.rotation.y = clock.elapsedTime * cell.speed * 0.2;
    });
  });
  return (
    <group ref={group}>
      {cells.map((cell) => {
        const color = new THREE.Color().setHSL(cell.hue % 1, 0.48, 0.55);
        return (
          <group key={cell.id} position={cell.p} scale={cell.size}>
            <mesh>
              <sphereGeometry args={[1, 18, 14]} />
              <meshPhysicalMaterial color={color} emissive={color} emissiveIntensity={0.32} transparent opacity={0.38} roughness={0.22} clearcoat={1} side={THREE.DoubleSide} />
            </mesh>
            <mesh scale={0.35}>
              <icosahedronGeometry args={[1, 1]} />
              <meshBasicMaterial color="#ffeb9d" transparent opacity={0.75} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function BiologicalCathedral() {
  const root = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!root.current) return;
    root.current.rotation.z = Math.sin(clock.elapsedTime * 0.11) * 0.08;
    root.current.rotation.y = clock.elapsedTime * 0.025;
  });
  return (
    <group ref={root} position={[-5, 1, -14]}>
      <mesh scale={[5.5, 7.8, 5.5]}>
        <sphereGeometry args={[1, 48, 36]} />
        <meshPhysicalMaterial color="#6d183f" emissive="#6d183f" emissiveIntensity={0.22} transmission={0.72} thickness={2.8} ior={1.36} attenuationColor="#ff6798" attenuationDistance={3.5} roughness={0.08} metalness={0.05} transparent opacity={0.55} side={THREE.DoubleSide} />
      </mesh>
      <mesh scale={[2.4, 3.4, 2.4]} rotation={[0.4, 0.2, 0.6]}>
        <icosahedronGeometry args={[1, 3]} />
        <meshPhysicalMaterial color="#ffc2d7" emissive="#ff6b9d" emissiveIntensity={1.1} transmission={0.55} thickness={1.4} ior={1.42} roughness={0.04} clearcoat={1} transparent opacity={0.74} />
      </mesh>
      {Array.from({ length: 12 }, (_, index) => {
        const angle = index / 12 * Math.PI * 2;
        return (
          <mesh key={index} position={[Math.cos(angle) * 5.7, Math.sin(index * 2.1) * 2.8, Math.sin(angle) * 5.7]} rotation={[angle, angle * 0.5, 0]}>
            <torusKnotGeometry args={[0.42, 0.08, 54, 7, 2, 3]} />
            <meshPhysicalMaterial color="#ffa3bf" emissive="#ff5f92" emissiveIntensity={0.7} metalness={0.2} roughness={0.18} clearcoat={1} />
          </mesh>
        );
      })}
    </group>
  );
}

function MicroWorld({ seed, density, onRealmEnter }: { seed: string; density: number; onRealmEnter?: (realmId: string) => void }) {
  return (
    <>
      <color attach="background" args={["#140910"]} />
      <fog attach="fog" args={["#321220", 8, 44]} />
      <ambientLight intensity={0.24} color="#ff99ba" />
      <pointLight position={[3, 4, 5]} color="#ff698d" intensity={42} distance={24} />
      <pointLight position={[-8, -4, -9]} color="#8c6cff" intensity={35} distance={26} />
      <AtmosphericShafts color="#ff6f9f" />
      <BiologicalCathedral />
      {onRealmEnter && <Portal position={[0, 0.5, -14]} color="#ffb8d0" targetRealm="planet" onEnter={onRealmEnter} />}
      <CellField seed={seed} density={Math.max(22, Math.floor(density * 0.75))} />
      <DriftParticles seed={seed} count={density * 16} color="#ffbad0" radius={28} speed={0.017} />
      <Sparkles count={260} position={[0, 0, -8]} scale={[36, 22, 36]} size={1.9} speed={0.6} color="#ffb8d0" opacity={0.55} />
      <mesh position={[0, 0, -18]}>
        <torusGeometry args={[7, 1.1, 18, 90]} />
        <meshPhysicalMaterial color="#5b1831" emissive="#6b1438" emissiveIntensity={0.8} transparent opacity={0.5} roughness={0.35} />
      </mesh>
    </>
  );
}

function LeafExpeditionDetail({ seed, quality }: { seed: string; quality: WorldProps["quality"] }) {
  const root = useRef<THREE.Group>(null);
  const vein = useMemo(() => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(-6, -3.4, -13), new THREE.Vector3(-2.4, -1.2, -12.3), new THREE.Vector3(0, 0, -11.5), new THREE.Vector3(2.2, 2.2, -11.2), new THREE.Vector3(5.8, 3.4, -11),
  ]), 48, 0.09, 8, false), []);
  const branches = useMemo(() => Array.from({ length: quality === "low" ? 5 : 9 }, (_, index) => {
    const angle = -1.2 + index * 0.33;
    const x = Math.cos(angle) * (2.2 + index * 0.38);
    const y = Math.sin(angle) * (2 + index * 0.25);
    return { id: index, x, y, rotation: angle - 0.3 };
  }), [quality]);
  useFrame(({ clock }) => {
    if (!root.current) return;
    root.current.rotation.z = Math.sin(clock.elapsedTime * 0.12) * 0.018;
  });
  return (
    <group ref={root}>
      <mesh position={[0, 0, -13]} rotation={[0, 0, 0]} scale={[1, 0.82, 1]}>
        <sphereGeometry args={[1, 48, 24]} />
        <meshPhysicalMaterial color="#315d38" emissive="#102b19" emissiveIntensity={0.35} roughness={0.68} transparent opacity={0.7} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={vein}>
        <meshPhysicalMaterial color="#b9ff9c" emissive="#6fe48b" emissiveIntensity={0.8} roughness={0.42} />
      </mesh>
      {branches.map((branch) => (
        <group key={branch.id} position={[branch.x, branch.y, -12]} rotation={[0, 0, branch.rotation]}>
          <mesh scale={[1.5, 0.045, 0.045]}><boxGeometry args={[1, 1, 1]} /><meshBasicMaterial color="#91df8b" transparent opacity={0.7} /></mesh>
          <mesh position={[0.6, 0.08, 0]} scale={[0.25, 0.25, 0.25]}><sphereGeometry args={[1, 10, 8]} /><meshBasicMaterial color="#d6ffb4" transparent opacity={0.78} /></mesh>
        </group>
      ))}
      <group position={[1.2, -0.2, -9.2]} rotation={[0, 0, -0.12]}>
        {Array.from({ length: 8 }, (_, index) => (
          <mesh key={index} position={[(index - 3.5) * 0.32, Math.sin(index * 0.8) * 0.07, 0]} scale={[0.25, 0.2, 0.34]}>
            <sphereGeometry args={[1, 12, 9]} />
            <meshPhysicalMaterial color={index % 2 ? "#d2a46d" : "#bb805d"} roughness={0.8} clearcoat={0.25} />
          </mesh>
        ))}
        <mesh position={[1.25, 0.02, 0]} scale={[0.32, 0.25, 0.36]}><sphereGeometry args={[1, 12, 9]} /><meshPhysicalMaterial color="#d2a46d" roughness={0.8} /></mesh>
        <pointLight position={[0, 0.4, 0.5]} color="#eaffb9" intensity={2.5} distance={4} />
      </group>
      <DriftParticles seed={`${seed}:leaf-dust`} count={quality === "low" ? 80 : 150} color="#d6ffb4" radius={15} speed={0.012} />
    </group>
  );
}

function DigestiveExpeditionDetail({ seed, quality }: { seed: string; quality: WorldProps["quality"] }) {
  const root = useRef<THREE.Group>(null);
  const rings = useMemo(() => Array.from({ length: quality === "low" ? 4 : 7 }, (_, index) => ({
    id: index,
    z: -6 - index * 3,
    scale: 1.05 + (index % 3) * 0.22,
  })), [quality]);
  useFrame(({ clock }) => {
    if (!root.current) return;
    root.current.rotation.z = Math.sin(clock.elapsedTime * 0.22) * 0.035;
    root.current.position.y = Math.sin(clock.elapsedTime * 0.5) * 0.12;
  });
  return (
    <group ref={root}>
      <ambientLight color="#ff6d95" intensity={0.16} />
      <pointLight position={[0, 0, -12]} color="#ff5f91" intensity={28} distance={23} />
      {rings.map((ring) => (
        <mesh key={ring.id} position={[Math.sin(ring.id * 1.7) * 0.6, Math.cos(ring.id * 1.2) * 0.7, ring.z]} rotation={[Math.PI / 2, 0, ring.id * 0.17]} scale={ring.scale}>
          <torusGeometry args={[3.6, 0.42, 16, 72]} />
          <meshPhysicalMaterial color={ring.id % 2 ? "#7c2449" : "#b43b63"} emissive="#8d183f" emissiveIntensity={0.54} roughness={0.3} clearcoat={0.7} transparent opacity={0.77} />
        </mesh>
      ))}
      <mesh position={[0, -1.1, -16]} scale={[4.3, 2.2, 1.2]}>
        <sphereGeometry args={[1, 42, 24]} />
        <meshPhysicalMaterial color="#9e2755" emissive="#ff4a84" emissiveIntensity={0.32} transmission={0.22} roughness={0.28} clearcoat={0.8} transparent opacity={0.72} />
      </mesh>
      <mesh position={[0, -2.35, -15]} rotation={[0, 0, 0]}>
        <circleGeometry args={[3.2, 48]} />
        <meshPhysicalMaterial color="#ff7e47" emissive="#ff4a32" emissiveIntensity={0.72} transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>
      <group position={[0, 1.2, -5.2]}>
        {Array.from({ length: 7 }, (_, index) => (
          <mesh key={index} position={[(index - 3) * 0.75, Math.abs(index - 3) * 0.12, 0]} rotation={[0, 0, (index - 3) * 0.04]} scale={[0.27, 0.88, 0.28]}>
            <coneGeometry args={[1, 1, 10]} />
            <meshPhysicalMaterial color="#f6e8dc" roughness={0.22} clearcoat={0.75} />
          </mesh>
        ))}
      </group>
      <DriftParticles seed={`${seed}:acid-bubbles`} count={quality === "low" ? 110 : 210} color="#ffb05e" radius={12} speed={0.028} />
      <Sparkles count={quality === "low" ? 70 : 140} position={[0, -1.5, -15]} scale={[9, 3, 9]} size={2.5} speed={0.65} color="#ffd06a" opacity={0.7} />
    </group>
  );
}

function SewerExpeditionDetail({ seed, quality }: { seed: string; quality: WorldProps["quality"] }) {
  const count = quality === "low" ? 4 : 7;
  return (
    <group>
      <color attach="background" args={["#061519"]} />
      <fog attach="fog" args={["#061519", 5, 48]} />
      <ambientLight color="#64cbd0" intensity={0.2} />
      <pointLight position={[0, 1, -12]} color="#67e0d2" intensity={24} distance={22} />
      {Array.from({ length: count }, (_, index) => (
        <group key={index} position={[0, 0, -6 - index * 5]} rotation={[0, 0, index % 2 ? 0.02 : -0.02]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.65, 1]}>
            <torusGeometry args={[4.8, 0.34, 14, 64]} />
            <meshPhysicalMaterial color="#294c50" emissive="#123e42" emissiveIntensity={0.45} roughness={0.6} metalness={0.22} />
          </mesh>
          <mesh position={[0, -2.55, 0]} rotation={[0, 0, 0]} scale={[1, 0.3, 1]}>
            <planeGeometry args={[8.5, 7]} />
            <meshPhysicalMaterial color="#174e56" emissive="#0a2d36" emissiveIntensity={0.44} transparent opacity={0.75} roughness={0.18} metalness={0.35} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
      <group position={[0, 0, -9]}>
        {[-3.2, -1.6, 0, 1.6, 3.2].map((x) => <mesh key={x} position={[x, 0, 0]} scale={[0.09, 3.4, 0.09]}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#8c9b8d" metalness={0.8} roughness={0.38} /></mesh>)}
      </group>
      <DriftParticles seed={`${seed}:sewer-spray`} count={quality === "low" ? 90 : 180} color="#8fe5d8" radius={24} speed={0.024} />
    </group>
  );
}

function ColossusExpeditionDetail({ seed, quality }: { seed: string; quality: WorldProps["quality"] }) {
  const root = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!root.current) return;
    root.current.position.y = Math.sin(clock.elapsedTime * 0.7) * 0.16;
    root.current.rotation.z = Math.sin(clock.elapsedTime * 0.43) * 0.012;
  });
  return (
    <group ref={root}>
      <ambientLight color="#e6ad7a" intensity={0.18} />
      <pointLight position={[2, 5, -15]} color="#ffc17e" intensity={32} distance={30} />
      <group position={[2, 1, -16]} rotation={[0, -0.18, 0]}>
        <mesh scale={[4.2, 2.2, 1.75]} castShadow><sphereGeometry args={[1, 32, 20]} /><meshPhysicalMaterial color="#6a422c" emissive="#2a160e" emissiveIntensity={0.25} roughness={0.8} clearcoat={0.18} /></mesh>
        <mesh position={[3.7, 1.1, 0]} scale={[1.35, 1.28, 1.22]} castShadow><sphereGeometry args={[1, 24, 18]} /><meshPhysicalMaterial color="#744a31" roughness={0.75} /></mesh>
        <mesh position={[4.7, 0.85, 0]} scale={[0.55, 0.35, 0.42]}><sphereGeometry args={[1, 16, 12]} /><meshPhysicalMaterial color="#24150f" roughness={0.7} /></mesh>
        {[-1, 1].map((side) => <mesh key={side} position={[4.1, 2.1, side * 0.8]} rotation={[side * 0.4, 0, side * 0.25]}><torusGeometry args={[0.72, 0.13, 10, 28, Math.PI * 1.5]} /><meshPhysicalMaterial color="#dbc48e" emissive="#8a6d3b" emissiveIntensity={0.2} roughness={0.34} /></mesh>)}
        {[-2.4, -0.6, 1.4, 3].map((x, index) => <mesh key={x} position={[x, -2, index % 2 ? 0.7 : -0.7]} scale={[0.35, 2.4, 0.35]}><capsuleGeometry args={[0.55, 1, 6, 10]} /><meshPhysicalMaterial color="#593520" roughness={0.84} /></mesh>)}
      </group>
      {[-14, -21, -28].map((z, index) => <mesh key={z} position={[-5 + index * 5, 1 + index * 0.4, z]} scale={[3.6 + index, 5.5 + index, 2.2]}><coneGeometry args={[1, 1, 6]} /><meshPhysicalMaterial color="#4a4a38" emissive="#22251c" emissiveIntensity={0.2} roughness={0.95} /></mesh>)}
      <DriftParticles seed={`${seed}:colossus-dust`} count={quality === "low" ? 90 : 180} color="#ffd09a" radius={28} speed={0.01} />
    </group>
  );
}

function ScenarioWorld({ scenario, seed, quality }: { scenario?: ExpeditionId; seed: string; quality: WorldProps["quality"] }) {
  if (!scenario || scenario === "frontier") return null;
  if (scenario === "leaf") return <LeafExpeditionDetail seed={seed} quality={quality} />;
  if (scenario === "digestion") return <DigestiveExpeditionDetail seed={seed} quality={quality} />;
  if (scenario === "sewer") return <SewerExpeditionDetail seed={seed} quality={quality} />;
  return <ColossusExpeditionDetail seed={seed} quality={quality} />;
}

function LifeStageWorld({ stageId, seed, quality }: { stageId?: LifeStageId; seed: string; quality: WorldProps["quality"] }) {
  const stage = lifeStageFor(stageId);
  if (!stageId || stage.id === "modern") return null;
  const detailCount = quality === "low" ? 5 : 9;
  return (
    <group>
      <ambientLight color={stage.color} intensity={0.12} />
      <pointLight position={[0, 5, -16]} color={stage.color} intensity={stage.id === "hadean" ? 35 : 18} distance={36} />
      {stage.id === "hadean" && <>
        <mesh position={[0, -2.4, -18]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[7, 64]} /><meshPhysicalMaterial color="#d33b2f" emissive="#ff542e" emissiveIntensity={1.1} transparent opacity={0.72} /></mesh>
        <DriftParticles seed={`${seed}:hadean`} count={quality === "low" ? 100 : 230} color="#ffb067" radius={22} speed={0.04} />
      </>}
      {stage.id === "archean" && <group position={[0, -1.8, -16]}>{Array.from({ length: detailCount }, (_, i) => <mesh key={i} position={[(i - detailCount / 2) * 1.1, Math.sin(i) * .2, (i % 3) * -1]} scale={[.55, .25 + (i % 4) * .15, .55]}><sphereGeometry args={[1, 14, 10]} /><meshPhysicalMaterial color="#ba8452" emissive="#9e572c" emissiveIntensity={.35} roughness={.8} /></mesh>)}</group>}
      {(stage.id === "cambrian" || stage.id === "ocean") && <group position={[0, -1.2, -14]}>{Array.from({ length: detailCount }, (_, i) => <mesh key={i} position={[Math.sin(i * 1.7) * 4, Math.cos(i * 1.2) * 1.8, -i * 1.4]} rotation={[0, i, i * .2]} scale={[.3 + i * .025, 1.2 + (i % 3) * .25, .3 + i * .025]}><capsuleGeometry args={[.45, 1, 5, 8]} /><meshPhysicalMaterial color={stage.color} emissive={stage.color} emissiveIntensity={.48} transparent opacity={.72} /></mesh>)}</group>}
      {(stage.id === "carboniferous" || stage.id === "jurassic" || stage.id === "cretaceous") && <group position={[0, -2, -18]}>{Array.from({ length: detailCount }, (_, i) => <group key={i} position={[(i - detailCount / 2) * 1.7, 0, (i % 3) * -2]}><mesh position={[0, 2 + (i % 3) * .6, 0]} scale={[.55 + (i % 2) * .3, 2.2 + (i % 4) * .5, .55 + (i % 2) * .3]}><coneGeometry args={[1, 1, 6]} /><meshPhysicalMaterial color={stage.color} emissive={stage.color} emissiveIntensity={.22} roughness={.85} /></mesh><mesh position={[0, 4.1 + (i % 3) * .6, 0]} scale={[1.1, .25, 1.1]}><sphereGeometry args={[1, 12, 8]} /><meshPhysicalMaterial color="#79be65" emissive="#3f8b4c" emissiveIntensity={.28} roughness={.7} /></mesh></group>)}</group>}
      {stage.id === "future" && <group position={[0, -1, -18]}>{Array.from({ length: 5 }, (_, i) => <mesh key={i} position={[(i - 2) * 2.4, 2 + (i % 2) * 1.4, -i * 2]} rotation={[0, i * .7, .35]}><torusKnotGeometry args={[.9, .14, 48, 6, 2, 3]} /><meshPhysicalMaterial color={stage.color} emissive={stage.color} emissiveIntensity={.8} metalness={.35} roughness={.12} /></mesh>)}</group>}
      {stage.id === "mars" && <group position={[0, -1.8, -16]}>{Array.from({ length: 7 }, (_, i) => <mesh key={i} position={[(i - 3) * 1.8, (i % 3) * .65, -i * 1.7]} scale={[.7, 2.4 + (i % 4) * .8, .7]}><coneGeometry args={[1, 1, 6]} /><meshPhysicalMaterial color="#8c3d32" emissive="#d35c42" emissiveIntensity={.28} roughness={.9} /></mesh>)}</group>}
      <DriftParticles seed={`${seed}:${stage.id}`} count={quality === "low" ? 70 : 150} color={stage.color} radius={25} speed={stage.id === "hadean" ? .035 : .014} />
    </group>
  );
}

const lensingShaders = {
  vertex: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragment: `
    varying vec2 vUv;
    uniform float uTime;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main() {
      vec2 center = vec2(0.5, 0.52);
      vec2 d = vUv - center;
      float r = max(length(d), 0.0001);
      float lensStrength = 0.02 / r;
      vec2 warped = center + d * (1.0 + lensStrength * 2.6);
      vec2 grid = floor(warped * vec2(200.0, 120.0));
      vec2 gridId = grid + 13.0;
      float starSeed = hash(gridId);
      float star = step(0.9975, starSeed);
      float twinkle = 0.5 + 0.5 * sin(uTime * (1.5 + starSeed * 4.0) + hash(gridId * 1.7) * 6.283);
      vec3 col = vec3(0.015, 0.018, 0.035);
      col += star * (0.4 + twinkle * 0.6) * vec3(0.85 + hash(gridId) * 0.15, 0.9, 1.0);
      float photonRing = smoothstep(0.012, 0.0, abs(r - 0.085));
      col += photonRing * vec3(1.1, 0.95, 0.85);
      float innerGlow = exp(-r * 5.5);
      col += innerGlow * vec3(0.3, 0.12, 0.55) * 0.85;
      float horizonShadow = smoothstep(0.055, 0.0, r);
      col = mix(col, vec3(0.0), horizonShadow * 0.96);
      float streak = smoothstep(0.4, 0.0, abs(d.y) - r * 0.35);
      col += streak * step(r, 0.4) * step(0.08, r) * vec3(0.5, 0.35, 0.8) * 0.22;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

function LensedStarfield() {
  const material = useRef<THREE.ShaderMaterial>(null);
  useFrame(({ clock }) => {
    if (material.current) material.current.uniforms.uTime.value = clock.elapsedTime;
  });
  return (
    <mesh position={[2, 3, -72]} renderOrder={-2}>
      <planeGeometry args={[170, 96]} />
      <shaderMaterial
        ref={material}
        vertexShader={lensingShaders.vertex}
        fragmentShader={lensingShaders.fragment}
        uniforms={{ uTime: { value: 0 } }}
        depthWrite={false}
        depthTest={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

const vortexShader = {
  vertex: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragment: `
    varying vec2 vUv;
    uniform float uTime;
    void main() {
      vec2 d = vUv - 0.5;
      float r = length(d);
      float a = atan(d.y, d.x);
      float spiral = sin(a * 5.0 - r * 22.0 + uTime * 2.4);
      vec3 col = mix(vec3(0.15, 0.02, 0.4), vec3(0.95, 0.75, 0.35), smoothstep(-1.0, 1.0, spiral) * (1.0 - r * 2.0));
      float alpha = (1.0 - smoothstep(0.2, 0.5, r)) * (0.45 + spiral * 0.25);
      gl_FragColor = vec4(col, max(alpha, 0.0));
    }
  `,
};

function WormholeRing({ position }: { position: [number, number, number] }) {
  const group = useRef<THREE.Group>(null);
  const disc = useRef<THREE.ShaderMaterial>(null);
  useFrame(({ clock }, delta) => {
    if (group.current) group.current.rotation.z += delta * 0.4;
    if (disc.current) disc.current.uniforms.uTime.value = clock.elapsedTime;
  });
  return (
    <group ref={group} position={position} rotation={[0.4, 0.1, 0.2]}>
      <mesh>
        <torusGeometry args={[3.4, 0.5, 16, 64]} />
        <meshPhysicalMaterial color="#4d2e99" emissive="#8a5fff" emissiveIntensity={0.8} metalness={0.7} roughness={0.2} clearcoat={1} />
      </mesh>
      <mesh ref={() => null}>
        <circleGeometry args={[3.2, 48]} />
        <shaderMaterial ref={disc} vertexShader={vortexShader.vertex} fragmentShader={vortexShader.fragment} uniforms={{ uTime: { value: 0 } }} transparent depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
      </mesh>
      <pointLight color="#8a5fff" intensity={36} distance={24} />
    </group>
  );
}

function CosmicBlackHole() {
  const root = useRef<THREE.Group>(null);
  const disk = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
  useFrame(({ clock }, delta) => {
    if (root.current) root.current.rotation.z += delta * 0.012;
    if (disk.current) disk.current.uniforms.uTime.value = clock.elapsedTime;
  });
  return (
    <group ref={root} position={[2, 0, -15]} rotation={[1.1, 0.1, 0]}>
      <mesh>
        <ringGeometry args={[3.05, 8.7, 256, 5]} />
        <shaderMaterial ref={disk} vertexShader={diskVertex} fragmentShader={diskFragment} uniforms={uniforms} transparent side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      {Array.from({ length: 7 }, (_, index) => (
        <mesh key={index} rotation={[0, 0, index * 0.12]}>
          <torusGeometry args={[3.16 + index * 0.7, 0.035 + index * 0.018, 8, 192]} />
          <meshBasicMaterial color={index < 2 ? "#fff9e9" : index < 4 ? "#e9ad8b" : "#705cc4"} transparent opacity={0.78 - index * 0.075} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      ))}
      <mesh><sphereGeometry args={[3.05, 48, 36]} /><meshBasicMaterial color="#000000" /></mesh>
      <mesh><torusGeometry args={[3.19, 0.052, 12, 220]} /><meshBasicMaterial color="#ffffff" toneMapped={false} /></mesh>
      <mesh scale={1.12}><sphereGeometry args={[3.05, 48, 36]} /><meshBasicMaterial color="#765aff" transparent opacity={0.035} side={THREE.BackSide} blending={THREE.AdditiveBlending} /></mesh>
      <pointLight color="#8e72ff" intensity={110} distance={55} />
    </group>
  );
}

function CosmicWorld({ seed, density }: { seed: string; density: number }) {
  return (
    <>
      <color attach="background" args={["#010106"]} />
      <fog attach="fog" args={["#03020a", 35, 130]} />
      <ambientLight intensity={0.08} />
      <LensedStarfield />
      <AtmosphericShafts color="#8e72ff" />
      <DriftParticles seed={`${seed}-stars`} count={density * 65} color="#d6e4ff" radius={110} speed={0.001} />
      <DriftParticles seed={`${seed}-dust`} count={density * 12} color="#8d6bff" radius={55} speed={-0.004} />
      <CosmicBlackHole />
      <WormholeRing position={[-16, 4, -36]} />
      <WormholeRing position={[14, -2, -42]} />
      <group position={[-12, 5, -25]}>
        <mesh><sphereGeometry args={[2.3, 64, 48]} /><meshPhysicalMaterial color="#8b775d" roughness={0.58} metalness={0.32} clearcoat={0.55} clearcoatRoughness={0.4} /></mesh>
        <mesh scale={1.12}><sphereGeometry args={[2.3, 30, 22]} /><meshBasicMaterial color="#e0a878" transparent opacity={0.08} side={THREE.BackSide} /></mesh>
      </group>
    </>
  );
}

function RecursiveGeometry({ seed, density }: { seed: string; density: number }) {
  const root = useRef<THREE.Group>(null);
  const forms = useMemo(() => {
    const random = seededRandom(seed, "recursion");
    return Array.from({ length: Math.max(18, Math.floor(density / 2)) }, (_, index) => ({
      position: [Math.sin(index * 1.7) * (4 + index * 0.18), Math.cos(index * 1.21) * (3 + index * 0.1), -index * 3.2] as [number, number, number],
      scale: 0.4 + random() * 1.8,
      spin: (random() - 0.5) * 0.5,
      hue: 0.6 + random() * 0.25,
    }));
  }, [seed, density]);
  useFrame(({ clock }) => {
    if (!root.current) return;
    root.current.children.forEach((child, index) => {
      child.rotation.x = clock.elapsedTime * forms[index].spin;
      child.rotation.y = clock.elapsedTime * forms[index].spin * 0.71;
    });
  });
  return (
    <group ref={root}>
      {forms.map((form, index) => (
        <mesh key={index} position={form.position} scale={form.scale}>
          {index % 3 === 0 ? <torusKnotGeometry args={[1, 0.12, 80, 7, 2, 3]} /> : index % 3 === 1 ? <icosahedronGeometry args={[1, 1]} /> : <octahedronGeometry args={[1, 2]} />}
          {index % 3 === 0 ? (
            <meshPhysicalMaterial color={new THREE.Color().setHSL(form.hue, 0.72, 0.58)} emissive={new THREE.Color().setHSL(form.hue, 0.8, 0.32)} emissiveIntensity={0.65} metalness={0.68} roughness={0.11} clearcoat={1} />
          ) : (
            <meshBasicMaterial color={new THREE.Color().setHSL(form.hue, 0.64, 0.65)} transparent opacity={0.42} wireframe blending={THREE.AdditiveBlending} />
          )}
        </mesh>
      ))}
    </group>
  );
}

function QuantumWorld({ seed, density }: { seed: string; density: number }) {
  return (
    <>
      <color attach="background" args={["#06030d"]} />
      <fog attach="fog" args={["#140529", 12, 100]} />
      <ambientLight intensity={0.25} color="#baadff" />
      <pointLight position={[0, 0, -20]} color="#8a6dff" intensity={80} distance={60} />
      <RecursiveGeometry seed={seed} density={density} />
      <DriftParticles seed={seed} count={density * 30} color="#c7afff" radius={62} speed={0.025} />
      {Array.from({ length: 10 }, (_, index) => (
        <mesh key={index} position={[0, 0, -index * 9 - 6]} rotation={[0, 0, index * 0.21]}>
          <torusGeometry args={[5.5 + Math.sin(index) * 1.4, 0.035, 7, 80]} />
          <meshBasicMaterial color={index % 2 ? "#77ffe5" : "#a273ff"} transparent opacity={0.25} />
        </mesh>
      ))}
    </>
  );
}

function GalaxyWorld({ seed }: { seed: string }) {
  const arms = useMemo(() => {
    const random = seededRandom(seed, "galaxy-arms");
    const pos = new Float32Array(4200 * 3);
    const cols = new Float32Array(4200 * 3);
    const c = new THREE.Color();
    for (let i = 0; i < 4200; i += 1) {
      const t = Math.pow(random(), 1.35);
      const armIndex = i % 3;
      const baseAngle = (Math.PI * 2 / 3) * armIndex;
      const dist = 2.2 + t * 23 + (random() - 0.5) * 1.2;
      const spread = (1 - t) * 0.45 + 0.12;
      const angle = baseAngle + Math.PI * 2 * t * 2.9 + (random() - 0.5) * spread;
      const sag = 0.25 + t * 0.45;
      pos[i * 3] = dist * Math.cos(angle);
      pos[i * 3 + 1] = (random() - 0.5) * sag;
      pos[i * 3 + 2] = dist * Math.sin(angle);
      c.setHSL(0.55 - t * 0.12 + random() * 0.08, 0.25 + (1 - t) * 0.7, 0.68 + t * 0.16);
      cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    return [pos, cols];
  }, [seed]);
  const halo = useMemo(() => {
    const pos = new Float32Array(1800 * 3);
    const cols = new Float32Array(1800 * 3);
    const color = new THREE.Color();
    const random2 = seededRandom(seed, "galaxy-halo");
    for (let i = 0; i < 1800; i += 1) {
      const u = 2 * Math.PI * random2();
      const v = Math.acos(2 * random2() - 1);
      const r = 20 + random2() * 38;
      pos[i * 3] = Math.sin(v) * Math.cos(u) * r;
      pos[i * 3 + 1] = (random2() - 0.5) * r * 0.55;
      pos[i * 3 + 2] = Math.sin(v) * Math.sin(u) * r;
      color.setHSL(0.58 + random2() * 0.12, 0.15 + random2() * 0.5, 0.55 + random2() * 0.3);
      cols[i * 3] = color.r; cols[i * 3 + 1] = color.g; cols[i * 3 + 2] = color.b;
    }
    return [pos, cols];
  }, [seed]);
  return (
    <>
      <color attach="background" args={["#07050d"]} />
      <fog attach="fog" args={["#110a19", 40, 180]} />
      <ambientLight intensity={0.06} />
      <points>
        <bufferGeometry><bufferAttribute attach="attributes-position" args={[arms[0], 3]} /><bufferAttribute attach="attributes-color" args={[arms[1], 3]} /></bufferGeometry>
        <pointsMaterial size={0.14} vertexColors transparent opacity={0.95} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>
      <points>
        <bufferGeometry><bufferAttribute attach="attributes-position" args={[halo[0], 3]} /><bufferAttribute attach="attributes-color" args={[halo[1], 3]} /></bufferGeometry>
        <pointsMaterial size={0.09} vertexColors transparent opacity={0.42} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>
      <group position={[0, 2.5, -30]} rotation={[1.05, 0.25, 0.18]}>
        <mesh><torusGeometry args={[4.1, 0.08, 10, 180]} /><meshBasicMaterial color="#ffe8c8" transparent opacity={0.75} /></mesh>
        <mesh><sphereGeometry args={[1.05, 36, 28]} /><meshBasicMaterial color="#1a0d06" /></mesh>
        <pointLight color="#ffb08a" intensity={130} distance={70} />
      </group>
      {Array.from({ length: 3 }, (_, i) => (
        <group key={i} position={[-4 - i * 2.5, 3.5 + i * 1.5, -20 - i * 4]}>
          <mesh scale={[2.2 + i * 0.6, 2.2 + i * 0.6, 2.2 + i * 0.6]}><icosahedronGeometry args={[1, 2]} /><meshStandardMaterial color={i === 1 ? "#1a1118" : "#221026"} roughness={0.78} metalness={0.28} /></mesh>
        </group>
      ))}
    </>
  );
}

function AtomicWorld({ seed, density }: { seed: string; density: number }) {
  const molecules = useMemo(() => {
    const random = seededRandom(seed, "atomic-grid");
    return Array.from({ length: Math.max(26, Math.floor(density * 0.6)) }, (_, index) => {
      const kind = index % 5;
      const px = (random() - 0.5) * 44;
      const py = (random() - 0.5) * 26;
      const pz = -index * 1.8 - 6 - random() * 12;
      return { index, kind, position: [px, py, pz] as [number, number, number], spin: (random() - 0.5) * 0.5 };
    });
  }, [seed, density]);
  const electrons = useMemo(() => Array.from({ length: 7 }, (_, i) => ({ angle: (i / 7) * Math.PI * 2, speed: 0.7 + i * 0.16, offset: i * 1.31 })), []);
  return (
    <>
      <color attach="background" args={["#041020"]} />
      <fog attach="fog" args={["#0a1e39", 9, 66]} />
      <ambientLight intensity={0.12} color="#48b8ff" />
      <pointLight position={[0, 10, 8]} color="#6cc8ff" intensity={90} distance={70} />
      <AtmosphericShafts color="#7cc8ff" />
      {molecules.map((mol) => {
        if (mol.kind === 0) {
          return (
            <group key={mol.index} position={mol.position} scale={0.8}>
              <mesh><sphereGeometry args={[0.42, 18, 14]} /><meshPhysicalMaterial color="#7ac8ff" emissive="#5ab8ff" emissiveIntensity={0.5} roughness={0.1} /></mesh>
              <mesh position={[0.52, 0, 0]}><sphereGeometry args={[0.22, 12, 9]} /><meshPhysicalMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.7} transparent opacity={0.8} /></mesh>
              <mesh position={[-0.52, 0, 0]}><sphereGeometry args={[0.22, 12, 9]} /><meshPhysicalMaterial color="#f0f8ff" emissive="#f0f8ff" emissiveIntensity={0.7} transparent opacity={0.55} /></mesh>
            </group>
          );
        }
        if (mol.kind === 1) {
          const hex = Array.from({ length: 6 }, (_, i) => {
            const a = (i / 6) * Math.PI * 2;
            return { a, pos: [Math.cos(a) * 1.05, Math.sin(a) * 1.05, 0] as [number, number, number] };
          });
          return (
            <group key={mol.index} position={mol.position} scale={0.9} rotation={[0.35, 0.15, 0.1]}>
              {hex.map((v, i) => (
                <group key={i} position={v.pos}>
                  <mesh><sphereGeometry args={[0.38, 14, 10]} /><meshPhysicalMaterial color={i % 3 === 0 ? "#ff9f80" : i % 3 === 1 ? "#ffd0a8" : "#e8f5ff"} emissive={i % 2 ? "#ff9f80" : "#8cc8ff"} emissiveIntensity={0.35} roughness={0.14} /></mesh>
                  {i < 6 && <mesh position={[(hex[(i + 1) % 6].pos[0] - v.pos[0]) / 2, (hex[(i + 1) % 6].pos[1] - v.pos[1]) / 2, 0]} rotation={[0, 0, (hex[(i + 1) % 6].pos[1] - v.pos[1]) / 2.1]}><cylinderGeometry args={[0.025, 0.025, 1.06, 6]} /><meshPhysicalMaterial color="#c8c0d0" metalness={0.75} roughness={0.26} /></mesh>}
                </group>
              ))}
            </group>
          );
        }
        if (mol.kind === 2) {
          return (
            <group key={mol.index} position={mol.position} scale={1.5} rotation={[0.1, 0.55, 0.2]}>
              {Array.from({ length: 5 }, (_, i) => (
                <group key={i}>
                  <mesh position={[0, i * 1.05, i * 0.35 * (i % 2 ? 1 : -1)]}><sphereGeometry args={[0.5, 14, 10]} /><meshPhysicalMaterial color={i % 2 ? "#ffb8ce" : "#8cc8ff"} emissive={i % 2 ? "#ff6f9f" : "#4fc8ff"} emissiveIntensity={0.4} roughness={0.12} /></mesh>
                  {i < 4 && <mesh position={[0, i * 1.05 + 0.52, i * 0.35 * (i % 2 ? 1 : -1) + 0.35 * ((i + 1) % 2 ? 1 : -1) * 0.11]} rotation={[0.2, 0.15, 0]}><cylinderGeometry args={[0.03, 0.03, 1.05, 5]} /><meshPhysicalMaterial color="#b8c0e8" metalness={0.6} roughness={0.3} /></mesh>}
                </group>
              ))}
            </group>
          );
        }
        if (mol.kind === 3) {
          return (
            <group key={mol.index} position={mol.position} scale={0.65} rotation={[0.05, 0.5, 0]}>
              {Array.from({ length: 2 }, (_, i) => {
                const a = (i / 2) * Math.PI * 2 + 0.5;
                return <mesh key={i} position={[Math.cos(a) * 0.7, Math.sin(a) * 0.7, 0]}><sphereGeometry args={[0.9, 24, 18]} /><meshPhysicalMaterial color="#78ffd0" emissive="#48c8a8" emissiveIntensity={0.3} transmission={0.15} roughness={0.08} clearcoat={1} /></mesh>;
              })}
            </group>
          );
        }
        return (
          <group key={mol.index} position={mol.position} scale={1.1}>
            {Array.from({ length: 3 }, (_, i) => {
              const a = (i / 3) * Math.PI * 2 + 0.4;
              return (
                <mesh key={i} position={[Math.cos(a) * 1.15, Math.sin(a) * 1.15, 0]}><sphereGeometry args={[0.28, 14, 10]} /><meshPhysicalMaterial color={i ? "#ffe8c8" : "#8cc8ff"} emissive={i ? "#ffd080" : "#48b8ff"} emissiveIntensity={0.5} roughness={0.1} /></mesh>
              );
            })}
            <mesh><sphereGeometry args={[0.55, 20, 16]} /><meshBasicMaterial color="#ffffff" transparent opacity={0.25} /></mesh>
          </group>
        );
      })}
      <group position={[0, -1.5, -24]}>
        {electrons.map((e) => (
          <mesh key={e.offset} position={[Math.cos(e.angle) * 5.2, Math.sin(e.angle * 1.2) * 0.3, Math.sin(e.angle) * 4.4]} scale={0.3}>
            <sphereGeometry args={[1, 16, 12]} /><meshBasicMaterial color="#b8f5ff" transparent opacity={0.85} blending={THREE.AdditiveBlending} />
          </mesh>
        ))}
        <mesh rotation={[1.2, 0.05, 0.12]}>
          <torusGeometry args={[5.2, 0.04, 10, 120]} /><meshBasicMaterial color="#48c8ff" transparent opacity={0.3} />
        </mesh>
        <mesh rotation={[-0.8, 0.2, -0.06]}>
          <torusGeometry args={[4.4, 0.035, 10, 120]} /><meshBasicMaterial color="#ffd8ff" transparent opacity={0.22} />
        </mesh>
      </group>
      <DriftParticles seed={seed} count={density * 22} color="#8fd8ff" radius={32} speed={0.03} />
    </>
  );
}

function ProceduralReflectionRig({ realm, quality }: { realm: ReturnType<typeof getRealm>; quality: WorldProps["quality"] }) {
  const palette: Record<string, [string, string, string]> = {
    void: ["#f0d6ff", "#8a4fff", "#ffcfee"],
    galaxy: ["#ffd8a8", "#a86fff", "#ff8fb9"],
    cosmos: ["#fff0c5", "#765cff", "#4dcfff"],
    planet: ["#ffe0af", "#6fffe0", "#7ea5ff"],
    micro: ["#ff739c", "#8c66ff", "#ffd09b"],
    atomic: ["#8fd8ff", "#5affd0", "#ffe083"],
    quantum: ["#8d71ff", "#5affdf", "#ff75ca"],
  };
  const [key, rim, fill] = realm.key ? palette[realm.key] : (
    (() => {
      const base = new THREE.Color(realm.color);
      const rimColor = base.clone().offsetHSL(0.35, 0.1, 0.15);
      const fillColor = new THREE.Color(realm.fog);
      return [realm.color, `#${rimColor.getHexString()}`, `#${fillColor.getHexString()}`] as [string, string, string];
    })()
  );
  return (
    <Environment resolution={quality === "ultra" ? 256 : 128} frames={1} background={false}>
      <Lightformer form="rect" intensity={4.5} color={key} position={[-8, 8, 3]} rotation={[0, 0.5, 0]} scale={[10, 4, 1]} />
      <Lightformer form="ring" intensity={3.5} color={rim} position={[7, 2, -6]} rotation={[0, -0.8, 0]} scale={6} />
      <Lightformer form="rect" intensity={2.2} color={fill} position={[0, -6, 2]} rotation={[Math.PI / 2, 0, 0]} scale={[14, 3, 1]} />
      <Lightformer form="circle" intensity={5} color="#ffffff" position={[0, 10, -12]} scale={3} />
    </Environment>
  );
}

function PlayerAvatar({ creature, characterName = creature.genus, layer = "planet", avatarRef, visible = true, attackSignal = 0, grabSignal = 0, cameraMode = "first" }: { creature: import("../game/procedural").CreatureDefinition; characterName?: string; layer?: string; avatarRef: React.MutableRefObject<THREE.Group | null>; visible?: boolean; attackSignal?: number; grabSignal?: number; cameraMode?: "first" | "third" | "orbit" }) {
  const { camera } = useThree();
  const creatureGroup = useMemo(() => {
    const color = new THREE.Color().setHSL(creature.hue / 360, 0.52, 0.55);
    const neon = new THREE.Color().setHSL(((creature.hue + 40) % 360) / 360, 0.75, 0.45);
    return { color, neon, bodyPlan: creature.bodyPlan, scale: creature.scale };
  }, [creature]);
  const slashRef = useRef<THREE.Mesh>(null);
  const shockwaveRef = useRef<THREE.Mesh>(null);
  const seenAttack = useRef(attackSignal);
  const seenGrab = useRef(grabSignal);
  const attackAt = useRef(-10);
  const grabAt = useRef(-10);
  const bobPhase = useRef(0);

  // In first-person mode, parent the avatar group to the camera (so limbs render in view).
  // In third-person mode, leave it in world space (it's positioned behind the camera in PlayerController).
  useEffect(() => {
    const holder = avatarRef.current;
    if (!holder) return;
    if (cameraMode === "first") {
      camera.add(holder);
      return () => { try { camera.remove(holder); } catch {} };
    }
    return undefined;
  }, [camera, cameraMode, avatarRef]);

  useFrame(({ clock }, delta) => {
    if (!avatarRef.current) return;
    const time = clock.elapsedTime;
    if (attackSignal !== seenAttack.current) { seenAttack.current = attackSignal; attackAt.current = time; }
    if (grabSignal !== seenGrab.current) { seenGrab.current = grabSignal; grabAt.current = time; }
    const attackAge = time - attackAt.current;
    const grabAge = time - grabAt.current;
    const lunge = attackAge < 0.3 ? Math.sin((attackAge / 0.3) * Math.PI) : 0;
    const scoop = grabAge < 0.45 ? Math.sin((grabAge / 0.45) * Math.PI) : 0;
    const isThird = cameraMode !== "first";
    bobPhase.current += delta * 3;
    const bob = isThird ? Math.sin(bobPhase.current) * 0.08 : 0;

    if (isThird) {
      // True third-person: the organism leads the camera, rather than hiding behind it.
      // The camera is its chase view; the avatar remains in the illuminated play space.
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const targetPos = camera.position.clone().addScaledVector(forward, 2.8);
      targetPos.y -= layer === "planet" ? 1.62 : 0.62 + bob * 0.15;
      avatarRef.current.position.lerp(targetPos, 1 - Math.exp(-delta * 14));
      const forwardYaw = Math.atan2(forward.x, forward.z);
      avatarRef.current.rotation.y = forwardYaw;
      avatarRef.current.rotation.x = lunge * 0.55 - scoop * 0.2 + (layer === "planet" ? 0 : Math.sin(time * 2.4) * 0.045);
      avatarRef.current.rotation.z = layer === "planet" ? Math.sin(time * 0.9) * 0.018 : Math.sin(time * 2.1) * 0.055;
      avatarRef.current.scale.setScalar(creatureGroup.scale * 0.85 * (1 + lunge * 0.25 + scoop * 0.15));
    } else {
      avatarRef.current.rotation.x = lunge * 0.55 - scoop * 0.2;
      avatarRef.current.rotation.z = 0;
      avatarRef.current.scale.setScalar(creatureGroup.scale * 0.55 * (1 + lunge * 0.3 + scoop * 0.2));
    }

    if (slashRef.current) {
      const age = attackAge < 0.35 ? attackAge : grabAge;
      const fading = age >= 0 && age < 0.35;
      slashRef.current.visible = fading;
      if (fading) {
        slashRef.current.position.set(0, 0.2, -0.9 - age * 3.4);
        slashRef.current.rotation.z = -age * 5;
        slashRef.current.scale.setScalar(0.5 + age * 4.2);
        const mat = slashRef.current.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, 0.85 - age * 2.4);
      }
    }
    if (shockwaveRef.current) {
      const active = attackAge >= 0 && attackAge < 0.6;
      shockwaveRef.current.visible = active;
      if (active) {
        shockwaveRef.current.scale.setScalar(0.3 + attackAge * 5);
        const mat = shockwaveRef.current.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, 0.7 - attackAge * 1.2);
        shockwaveRef.current.rotation.z = attackAge * 2;
      }
    }
  });

  const appendageCount = cameraMode !== "first" ? 8 : 0;
  return (
    <group ref={(node) => { if (node) avatarRef.current = node; }} visible={visible} scale={creatureGroup.scale * (cameraMode === "first" ? 0.55 : 0.85)}>
      {creatureGroup.bodyPlan === "crystalline" ? (
        <mesh castShadow><icosahedronGeometry args={[0.68, 1]} /><meshPhysicalMaterial color={creatureGroup.color} emissive={creatureGroup.neon} emissiveIntensity={0.5} roughness={0.15} metalness={0.4} clearcoat={1} /></mesh>
      ) : creatureGroup.bodyPlan === "fractal" ? (
        <mesh castShadow scale={[1.2, 0.55, 0.75]}><dodecahedronGeometry args={[0.7, 0]} /><meshPhysicalMaterial color={creatureGroup.color} emissive={creatureGroup.neon} emissiveIntensity={0.4} roughness={0.25} /></mesh>
      ) : creatureGroup.bodyPlan === "colonial" ? (
        <group>
          <mesh castShadow scale={[0.9, 0.7, 0.9]}><sphereGeometry args={[0.78, 28, 20]} /><meshPhysicalMaterial color={creatureGroup.color} emissive={creatureGroup.neon} emissiveIntensity={0.32} transparent opacity={0.55} roughness={0.15} clearcoat={1} /></mesh>
          <mesh position={[0.3, 0.18, 0]} scale={0.32}><sphereGeometry args={[0.7, 14, 10]} /><meshPhysicalMaterial color={creatureGroup.color} emissive={creatureGroup.neon} emissiveIntensity={0.7} roughness={0.2} /></mesh>
        </group>
      ) : creatureGroup.bodyPlan === "plasma" ? (
        <mesh castShadow scale={[0.9, 0.78, 0.9]}><sphereGeometry args={[0.78, 24, 20]} /><meshPhysicalMaterial color={creatureGroup.color} emissive={creatureGroup.neon} emissiveIntensity={1.1} transparent opacity={0.62} roughness={0.12} transmission={0.1} clearcoat={1} /></mesh>
      ) : (
        <>
          {/* Body */}
          <mesh castShadow scale={creatureGroup.bodyPlan === "bilateral" ? [1.14, 0.64, 0.58] : [0.9, 0.78, 0.9]}>
            <sphereGeometry args={[0.78, 30, 22]} />
            <meshPhysicalMaterial color={creatureGroup.color} emissive={creatureGroup.neon} emissiveIntensity={0.4} roughness={0.22} clearcoat={0.65} clearcoatRoughness={0.18} />
          </mesh>
          {/* Head (third-person only, forward facing) */}
          {cameraMode !== "first" && (
            <mesh position={[0, 0.18, 0.72]} castShadow>
              <sphereGeometry args={[0.38, 20, 14]} />
              <meshPhysicalMaterial color={creatureGroup.color} emissive={creatureGroup.neon} emissiveIntensity={0.55} roughness={0.18} clearcoat={0.8} />
            </mesh>
          )}
          {/* Eyes */}
          {cameraMode !== "first" && (
            <>
              <mesh position={[-0.17, 0.26, 0.9]}>
                <sphereGeometry args={[0.08, 10, 8]} />
                <meshBasicMaterial color="#0a0e14" />
              </mesh>
              <mesh position={[0.17, 0.26, 0.9]}>
                <sphereGeometry args={[0.08, 10, 8]} />
                <meshBasicMaterial color="#0a0e14" />
              </mesh>
              <mesh position={[-0.17, 0.28, 0.94]} scale={0.4}>
                <sphereGeometry args={[0.08, 6, 5]} />
                <meshBasicMaterial color="#ffffff" />
              </mesh>
              <mesh position={[0.17, 0.28, 0.94]} scale={0.4}>
                <sphereGeometry args={[0.08, 6, 5]} />
                <meshBasicMaterial color="#ffffff" />
              </mesh>
            </>
          )}
        </>
      )}
      {/* Walking legs / feelers (third-person only) */}
      {Array.from({ length: appendageCount }, (_, i) => {
        const angle = (i / appendageCount) * Math.PI * 2;
        const isFront = Math.cos(angle) > 0.2;
        const side = Math.sin(angle) > 0 ? 1 : -1;
        return (
          <group key={i} position={[side * (isFront ? 0.32 : 0.46), -0.42, (isFront ? 0.35 : -0.35) * Math.cos(angle) * 2]}>
            <mesh rotation={[0, 0, side * 0.3]} scale={[0.09, 0.38, 0.09]}>
              <cylinderGeometry args={[1, 1, 1, 5]} />
              <meshPhysicalMaterial color={creatureGroup.color} emissive={creatureGroup.neon} emissiveIntensity={0.3} roughness={0.4} />
            </mesh>
            <mesh position={[side * 0.08, -0.28, 0]} rotation={[0, 0, side * 0.7]} scale={[0.06, 0.28, 0.06]}>
              <cylinderGeometry args={[1, 1, 1, 5]} />
              <meshPhysicalMaterial color={creatureGroup.color} emissive={creatureGroup.neon} emissiveIntensity={0.5} roughness={0.4} />
            </mesh>
          </group>
        );
      })}
      {cameraMode !== "first" && (
        <Text position={[0, 1.32, 0]} rotation={[0, Math.PI, 0]} fontSize={0.19} color="#d9ffe5" anchorX="center" anchorY="middle" outlineWidth={0.025} outlineColor="#06100b" fillOpacity={0.92}>
          {characterName}
        </Text>
      )}
      {/* Forward slash plane */}
      <mesh ref={slashRef} visible={false}>
        <planeGeometry args={[1.7, 0.24]} />
        <meshBasicMaterial color={creatureGroup.neon} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {/* Expanding shockwave ring on attack */}
      <mesh ref={shockwaveRef} rotation={[Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.75, 0.95, 48]} />
        <meshBasicMaterial color={creatureGroup.neon} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <pointLight color={creatureGroup.neon} intensity={cameraMode !== "first" ? 3.5 : 1.8} distance={cameraMode !== "first" ? 6 : 3.2} />
    </group>
  );
}

function CinematicEffects({ realm, quality, bloom = true, godRays = true, vignette = true, chromaticAberration = true, filmGrain = true }: { realm: ReturnType<typeof getRealm>; quality: WorldProps["quality"]; bloom?: boolean; godRays?: boolean; vignette?: boolean; chromaticAberration?: boolean; filmGrain?: boolean }) {
  const [sun, setSun] = useState<THREE.Mesh | null>(null);
  const config: Record<string, { position: [number, number, number]; scale: number; color: string }> = {
    void: { position: [0, 0, -70], scale: 7.5, color: "#f0d0ff" },
    galaxy: { position: [0, 0, -60], scale: 5.5, color: "#ffd8b8" },
    cosmos: { position: [2, 0, -15.8], scale: 2.65, color: "#fff6de" },
    planet: { position: [-18, 14, -28], scale: 3.5, color: "#fff0c9" },
    micro: { position: [3.5, 4.5, -13], scale: 1.15, color: "#ff779f" },
    atomic: { position: [0, 0.5, -35], scale: 2.5, color: "#8fd8ff" },
    quantum: { position: [0, 0, -48], scale: 4.5, color: "#8f76ff" },
  };
  const source = realm.key ? config[realm.key] : { position: [0, 0.8, -44] as [number, number, number], scale: 3.4, color: realm.color };
  const intense = realm.archetype === "storm" || realm.archetype === "plasma-sea" || realm.id === "quantum";
  return (
    <>
      <mesh ref={setSun} position={source.position} scale={source.scale} renderOrder={-1}>
        <sphereGeometry args={[1, 32, 24]} />
        <meshBasicMaterial color={source.color} transparent opacity={realm.id === "cosmos" ? 0.55 : 0.92} depthWrite={false} toneMapped={false} />
      </mesh>
      <EffectComposer multisampling={quality === "ultra" ? 4 : 0}>
        {godRays && sun && (
          <GodRays
            sun={sun}
            samples={quality === "ultra" ? 60 : 32}
            density={0.95}
            decay={0.92}
            weight={realm.id === "planet" ? 0.34 : 0.26}
            exposure={realm.id === "planet" ? 0.46 : 0.34}
            clampMax={1}
            blur
          />
        )}
        {bloom && <Bloom intensity={intense ? 1.8 : realm.id === "cosmos" ? 1.2 : 0.95} luminanceThreshold={0.36} luminanceSmoothing={0.72} mipmapBlur />}
        {chromaticAberration && (realm.id === "quantum" || realm.id === "cosmos" || realm.archetype === "helix") && <ChromaticAberration offset={new THREE.Vector2(intense ? 0.0009 : 0.0003, intense ? 0.0006 : 0.00015)} radialModulation modulationOffset={0.35} blendFunction={BlendFunction.NORMAL} />}
        {filmGrain && <Noise opacity={intense ? 0.035 : 0.016} blendFunction={BlendFunction.SOFT_LIGHT} />}
        {vignette && <Vignette offset={0.12} darkness={0.72} />}
      </EffectComposer>
    </>
  );
}

export function GameWorld(props: WorldProps) {
  const density = props.quality === "low" ? 40 : props.quality === "medium" ? 70 : 100;
  const avatarRef = useRef<THREE.Group | null>(null);
  const realm = getRealm(props.realmId ?? props.layer);
  const authoredKey = realm.key ?? props.layer;
  const physics = realmPhysics(props.seed, realm);
  const terrainParams = worldParams(props.seed);
  return (
    <Canvas
      shadows={props.shadows !== false && props.quality !== "low"}
      dpr={Math.max(0.5, Math.min(2, (props.quality === "low" ? 1 : props.quality === "ultra" ? 1.65 : 1.3) * (props.renderScale ?? 100) / 100))}
      camera={{ position: [0, 2, 12], fov: props.fov ?? 65, near: 0.05, far: 500 }}
      gl={{ antialias: props.antialiasing !== false && props.quality !== "low", powerPreference: "high-performance", logarithmicDepthBuffer: authoredKey === "cosmos" || authoredKey === "galaxy" }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = authoredKey === "planet" ? 1.15 : 1.32;
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
      }}
    >
      <PlayerController layer={authoredKey} seed={props.seed} paused={props.paused} reducedMotion={props.reducedMotion} onLockChange={props.onLockChange} onPosition={props.onPosition} physics={physics} cameraMode={props.cameraMode} attackSignal={props.attackSignal} />
      {authoredKey === "void" && <QuantumWorld seed={props.seed} density={density} />}
      {authoredKey === "galaxy" && <GalaxyWorld seed={props.seed} />}
      {authoredKey === "cosmos" && <CosmicWorld seed={props.seed} density={density} />}
      {authoredKey === "planet" && <PlanetWorld seed={props.seed} density={density} structures={props.structures} quality={props.quality} storm={terrainParams.stormBias} ventCount={terrainParams.ventCount} tension={props.tension} attackSignal={props.attackSignal} grabSignal={props.grabSignal} onPrey={props.onPrey} onRealmEnter={props.onRealmEnter} />}
      {authoredKey === "micro" && <MicroWorld seed={props.seed} density={density} onRealmEnter={props.onRealmEnter} />}
      {authoredKey === "atomic" && <AtomicWorld seed={props.seed} density={density} />}
      {authoredKey === "quantum" && <QuantumWorld seed={props.seed} density={density} />}
      {!realm.key && <RealmBody realm={realm} seed={props.seed} density={density} quality={props.quality} />}
      <ScenarioWorld scenario={props.scenario} seed={props.seed} quality={props.quality} />
      <LifeStageWorld stageId={props.lifeStage} seed={props.seed} quality={props.quality} />
      {props.creature && <PlayerAvatar creature={props.creature} characterName={props.characterName ?? props.creature.genus} layer={authoredKey} avatarRef={avatarRef} visible={props.cameraMode !== "first"} attackSignal={props.attackSignal} grabSignal={props.grabSignal} cameraMode={props.cameraMode ?? "third"} />}
      {props.creature && <CombatArms creature={props.creature} attackSignal={props.attackSignal ?? 0} grabSignal={props.grabSignal ?? 0} cameraMode={props.cameraMode ?? "first"} />}
      {props.creature && props.cameraShake !== false && !props.reducedMotion && <CombatCameraShake attackSignal={props.attackSignal ?? 0} grabSignal={props.grabSignal ?? 0} />}
      {props.creature && <CombatParticleBurstWithClock creatureHue={props.creature.hue} attackSignal={props.attackSignal ?? 0} grabSignal={props.grabSignal ?? 0} />}
      <ProceduralReflectionRig realm={realm} quality={props.quality} />
      {props.quality !== "low" && <CinematicEffects realm={realm} quality={props.quality} bloom={props.bloom} godRays={props.godRays} vignette={props.vignette} chromaticAberration={props.chromaticAberration} filmGrain={props.filmGrain} />}
    </Canvas>
  );
}