import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Water } from "three/examples/jsm/objects/Water.js";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { cinematicAudio } from "../../audio/CinematicAudio";
import { worldBus, type EnvState } from "../../game/bus";
import { seededRandom } from "../../game/procedural";

/* ------------------------------------------------------------------ */
/* Procedural water normal map                                         */
/* ------------------------------------------------------------------ */

function makeWaterNormals(seed: string, size = 256) {
  const random = seededRandom(seed, "water-normals");
  const grid = 32;
  const lattice: number[][] = [];
  for (let y = 0; y <= grid; y += 1) {
    lattice[y] = [];
    for (let x = 0; x <= grid; x += 1) lattice[y][x] = random();
  }
  const sample = (u: number, v: number) => {
    const gx = ((u % 1) * grid) % grid;
    const gy = ((v % 1) * grid) % grid;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = gx - x0;
    const fy = gy - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const h00 = lattice[y0][x0];
    const h10 = lattice[y0][(x0 + 1) % grid];
    const h01 = lattice[(y0 + 1) % grid][x0];
    const h11 = lattice[(y0 + 1) % grid][(x0 + 1) % grid];
    return h00 * (1 - sx) * (1 - sy) + h10 * sx * (1 - sy) + h01 * (1 - sx) * sy + h11 * sx * sy;
  };
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      height[y * size + x] =
        sample(u * 3, v * 3) * 0.55 +
        sample(u * 7 + 0.3, v * 7) * 0.28 +
        sample(u * 15 + 0.7, v * 15 + 0.2) * 0.17;
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const image = ctx.createImageData(size, size);
    const strength = 2.6;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const left = height[y * size + ((x - 1 + size) % size)];
        const right = height[y * size + ((x + 1) % size)];
        const up = height[((y - 1 + size) % size) * size + x];
        const down = height[((y + 1) % size) * size + x];
        const nx = (left - right) * strength;
        const ny = (up - down) * strength;
        const nz = 1;
        const length = Math.hypot(nx, ny, nz);
        const index = (y * size + x) * 4;
        image.data[index] = ((nx / length) * 0.5 + 0.5) * 255;
        image.data[index + 1] = ((ny / length) * 0.5 + 0.5) * 255;
        image.data[index + 2] = ((nz / length) * 0.5 + 0.5) * 255;
        image.data[index + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/* ------------------------------------------------------------------ */
/* The ocean surface — real planar reflections + travelling waves       */
/* ------------------------------------------------------------------ */

interface OceanProps {
  env: EnvState;
  seed: string;
  quality: "low" | "medium" | "ultra";
}

export function Ocean({ env, seed, quality }: OceanProps) {
  const mesh = useRef<THREE.Mesh>(null);
  const [submerged, setSubmerged] = useState(false);
  const wasUnder = useRef(false);

  const water = useMemo(() => {
    const segments = quality === "low" ? 40 : quality === "medium" ? 72 : 104;
    const geometry = new THREE.PlaneGeometry(700, 700, segments, segments);
    const normals = makeWaterNormals(seed);
    const instance = new Water(geometry, {
      textureWidth: quality === "ultra" ? 1024 : 512,
      textureHeight: quality === "ultra" ? 1024 : 512,
      waterNormals: normals,
      sunDirection: new THREE.Vector3(0, 1, 0),
      sunColor: 0xfff2d0,
      waterColor: 0x063d49,
      distortionScale: 3.4,
      fog: true,
      alpha: 1,
    });
    instance.material.uniforms.size.value = 4.5;
    return instance;
  }, [seed, quality]);

  const base = useMemo(() => {
    // Copy of the flat grid so wave displacement never accumulates.
    const attr = (water.geometry as THREE.PlaneGeometry).attributes.position as THREE.BufferAttribute;
    return Float32Array.from(attr.array as Float32Array);
  }, [water]);

  useEffect(() => {
    return () => {
      water.geometry.dispose();
      (water.material as THREE.Material).dispose();
    };
  }, [water]);

  useFrame(({ camera: cam }, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1);
    const time = performance.now() / 1000;
    if (!mesh.current) return;
    mesh.current.position.set(cam.position.x, env.waterLevel, cam.position.z);

    const attr = (water.geometry as THREE.PlaneGeometry).attributes.position as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const px = mesh.current.position.x;
    const pz = mesh.current.position.z;
    const amp = 1 + Math.min(1.4, env.rain) * 1.5 + env.storm * 0.8;
    for (let i = 0; i < arr.length; i += 3) {
      const wx = base[i] + px;
      const wz = -base[i + 1] + pz;
      let h =
        Math.sin(wx * 0.055 + time * 0.9) * 0.34 +
        Math.sin(wz * 0.047 - time * 0.72) * 0.3 +
        Math.sin((wx + wz) * 0.031 + time * 0.5) * 0.26 +
        Math.sin(wx * 0.16 - time * 1.6) * 0.1 +
        Math.sin(wz * 0.19 + time * 1.23) * 0.08;
      if (env.rain > 0.25) {
        h += Math.sin(wx * 1.7 + time * 7.0) * 0.024 * env.rain + Math.sin(wz * 2.1 - time * 8.3) * 0.02 * env.rain;
      }
      arr[i + 2] = base[i + 2] + h * amp;
    }
    attr.needsUpdate = true;

    const uniforms = (water.material as THREE.ShaderMaterial).uniforms;
    uniforms.time.value += delta * (0.5 + Math.min(1, env.rain) * 0.55);
    (uniforms.sunDirection.value as THREE.Vector3).copy(env.sunDir);
    uniforms.waterColor.value.lerp(new THREE.Color(env.underwater ? "#032832" : env.night > 0.6 ? "#02141f" : "#063d49"), 0.03);

    // Underwater transition with a splash.
    const under = cam.position.y < env.waterLevel - 0.16;
    if (under !== wasUnder.current) {
      wasUnder.current = under;
      setSubmerged(under);
      env.underwater = under;
      worldBus.emit({ type: "underwater", active: under });
      worldBus.emit({ type: "splash", strength: 1, x: cam.position.x, z: cam.position.z });
      cinematicAudio.splash();
      cinematicAudio.setUnderwater(under);
    }
  });

  return (
    <>
      <primitive ref={mesh} object={water} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1} />
      {submerged && <UnderwaterRealm env={env} quality={quality} />}
      <SplashFX env={env} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Underwater: mirrored ceiling, shafts, bubbles, jellies               */
/* ------------------------------------------------------------------ */

function UnderwaterRealm({ env, quality }: { env: EnvState; quality: OceanProps["quality"] }) {
  const { camera } = useThree();
  const reflector = useMemo(() => {
    const resolution = quality === "ultra" ? 1024 : 512;
    const instance = new Reflector(new THREE.PlaneGeometry(700, 700), {
      textureWidth: resolution,
      textureHeight: resolution,
      color: 0x9fd4de,
      clipBias: 0.003,
    });
    instance.rotation.x = -Math.PI / 2;
    const mat = instance.material as THREE.ShaderMaterial;
    mat.transparent = true;
    mat.side = THREE.DoubleSide;
    mat.uniforms.uTime = { value: 0 };
    mat.uniforms.uFade = { value: 0 };
    mat.fragmentShader = /* glsl */ `
      uniform vec3 color;
      uniform sampler2D tDiffuse;
      uniform float uTime;
      uniform float uFade;
      varying vec4 vUv;
      void main() {
        vec2 uv = vUv.xy / vUv.w;
        uv += vec2(
          sin(uv.y * 44.0 + uTime * 1.7) + cos(uv.x * 29.0 - uTime * 1.2),
          cos(uv.x * 37.0 - uTime * 1.45) + sin(uv.y * 25.0 + uTime * 0.95)
        ) * 0.0042;
        vec3 base = texture2D(tDiffuse, uv).rgb;
        vec3 tint = mix(vec3(0.015, 0.16, 0.21), base, 0.7);
        gl_FragColor = vec4(tint, 0.92 * uFade);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `;
    mat.needsUpdate = true;
    return instance;
  }, [quality]);

  const shafts = useRef<THREE.Group>(null);
  const bubbles = useRef<THREE.Points>(null);
  const motes = useRef<THREE.Points>(null);
  const jellies = useRef<THREE.Group>(null);

  const bubbleData = useMemo(() => {
    const count = quality === "low" ? 120 : 300;
    const random = seededRandom("bubbles", "sea");
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      pos[i * 3] = (random() - 0.5) * 44;
      pos[i * 3 + 1] = -2 - random() * 16;
      pos[i * 3 + 2] = (random() - 0.5) * 44;
      vel[i] = 0.7 + random() * 1.7;
    }
    return { count, pos, vel };
  }, [quality]);

  const moteData = useMemo(() => {
    const count = quality === "low" ? 90 : 220;
    const random = seededRandom("sea-motes", "sea");
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      pos[i * 3] = (random() - 0.5) * 60;
      pos[i * 3 + 1] = -2.4 - random() * 14;
      pos[i * 3 + 2] = (random() - 0.5) * 60;
    }
    return { count, pos };
  }, [quality]);

  const jelliesData = useMemo(() => {
    const random = seededRandom("jellies", "sea");
    return Array.from({ length: quality === "low" ? 4 : 8 }, (_, index) => ({
      id: index,
      angle: random() * Math.PI * 2,
      radius: 8 + random() * 26,
      depth: -3.5 - random() * 9,
      speed: 0.05 + random() * 0.12,
      scale: 0.5 + random() * 1.15,
      hue: random() > 0.5 ? "#6fe0ff" : "#e07aff",
      phase: random() * Math.PI * 2,
    }));
  }, [quality]);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / 900);
      const mat = reflector.material as THREE.ShaderMaterial;
      mat.uniforms.uFade.value = t;
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      reflector.geometry.dispose();
      (reflector.material as THREE.Material).dispose();
    };
  }, [reflector]);

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    (reflector.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
    reflector.position.set(camera.position.x, env.waterLevel - 0.06, camera.position.z);

    if (shafts.current) {
      shafts.current.children.forEach((child, index) => {
        child.rotation.z = Math.sin(t * 0.24 + index * 1.7) * 0.12;
        const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = 0.05 + Math.sin(t * 0.6 + index) * 0.018;
      });
      shafts.current.position.set(camera.position.x, 0, camera.position.z);
    }

    if (bubbles.current) {
      const attr = bubbles.current.geometry.attributes.position as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      for (let i = 0; i < bubbleData.count; i += 1) {
        arr[i * 3 + 1] += bubbleData.vel[i] * delta;
        arr[i * 3] += Math.sin(t * 1.8 + i) * delta * 0.24;
        if (arr[i * 3 + 1] > env.waterLevel - 0.2) {
          arr[i * 3 + 1] = env.waterLevel - 15 - Math.random() * 6;
          arr[i * 3] = camera.position.x + (Math.random() - 0.5) * 44;
          arr[i * 3 + 2] = camera.position.z + (Math.random() - 0.5) * 44;
        }
      }
      attr.needsUpdate = true;
      bubbles.current.position.set(0, 0, 0);
    }

    if (motes.current) {
      motes.current.rotation.y = t * 0.012;
      motes.current.position.set(camera.position.x, 0, camera.position.z);
    }

    if (jellies.current) {
      jellies.current.children.forEach((child, index) => {
        const data = jelliesData[index];
        const pulse = Math.sin(t * 1.4 + data.phase);
        child.position.set(
          camera.position.x + Math.cos(data.angle + t * data.speed) * data.radius,
          data.depth + pulse * 0.5 + Math.sin(t * 0.3 + index) * 0.8,
          camera.position.z + Math.sin(data.angle + t * data.speed) * data.radius,
        );
        child.scale.setScalar(data.scale * (1 + pulse * 0.06));
        child.rotation.y = t * 0.2 + index;
        child.traverse((node) => {
          const mat = (node as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
          if (mat && "emissiveIntensity" in mat) mat.emissiveIntensity = 1.1 + pulse * 0.7;
        });
      });
    }
  });

  return (
    <>
      <primitive object={reflector} renderOrder={2} />
      <group ref={shafts}>
        {Array.from({ length: 7 }, (_, index) => (
          <mesh key={index} position={[(index - 3) * 9, env.waterLevel - 8, -6 - (index % 3) * 7]} rotation={[0.16, 0, 0.04 * index]}>
            <coneGeometry args={[2.6 + (index % 3) * 0.9, 16, 14, 1, true]} />
            <meshBasicMaterial color="#8fe8ef" transparent opacity={0.05} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} />
          </mesh>
        ))}
      </group>
      <points ref={bubbles} renderOrder={3}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[bubbleData.pos, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#c8f2ff" size={0.13} transparent opacity={0.7} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
      </points>
      <points ref={motes} renderOrder={3}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[moteData.pos, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#7fd8d0" size={0.08} transparent opacity={0.4} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
      </points>
      <group ref={jellies}>
        {jelliesData.map((jelly) => (
          <group key={jelly.id}>
            <mesh>
              <sphereGeometry args={[0.7, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.58]} />
              <meshStandardMaterial
                color={jelly.hue}
                emissive={jelly.hue}
                emissiveIntensity={1.2}
                transparent
                opacity={0.42}
                side={THREE.DoubleSide}
                depthWrite={false}
              />
            </mesh>
            {Array.from({ length: 6 }, (_, tentacle) => (
              <mesh key={tentacle} position={[Math.cos((tentacle / 6) * Math.PI * 2) * 0.36, -0.75, Math.sin((tentacle / 6) * Math.PI * 2) * 0.36]}>
                <cylinderGeometry args={[0.014, 0.004, 1.5, 5]} />
                <meshBasicMaterial color={jelly.hue} transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} />
              </mesh>
            ))}
            <pointLight color={jelly.hue} intensity={2.4} distance={6} />
          </group>
        ))}
      </group>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Splash rings when diving in / out                                   */
/* ------------------------------------------------------------------ */

interface Splash {
  id: number;
  x: number;
  z: number;
  age: number;
}

function SplashFX({ env }: { env: EnvState }) {
  const group = useRef<THREE.Group>(null);
  const splashes = useRef<Splash[]>([]);
  const nextId = useRef(1);

  useEffect(() => {
    return worldBus.on((event) => {
      if (event.type === "splash" && splashes.current.length < 5) {
        splashes.current.push({ id: nextId.current++, x: event.x, z: event.z, age: 0 });
      }
    });
  }, []);

  useFrame((_, delta) => {
    if (!group.current) return;
    splashes.current = splashes.current.filter((splash) => splash.age < 1);
    const alive = splashes.current;
    group.current.children.forEach((child, index) => {
      const splash = alive[index];
      const mesh = child as THREE.Mesh;
      if (!splash) {
        mesh.visible = false;
        return;
      }
      mesh.visible = true;
      mesh.position.set(splash.x, env.waterLevel + 0.05, splash.z);
      const t = splash.age;
      mesh.scale.setScalar(1 + t * 9);
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.75 * (1 - t);
    });
    splashes.current = alive.map((splash) => ({ ...splash, age: splash.age + delta * 1.15 }));
  });

  return (
    <group ref={group}>
      {Array.from({ length: 5 }, (_, index) => (
        <mesh key={index} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
          <ringGeometry args={[0.42, 0.58, 40]} />
          <meshBasicMaterial color="#d8f6ff" transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}
    </group>
  );
}
