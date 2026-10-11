import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { cinematicAudio } from "../../audio/CinematicAudio";
import { worldBus, type EnvState } from "../../game/bus";
import { seededRandom } from "../../game/procedural";

/* ------------------------------------------------------------------ */
/* Shared GLSL helpers                                                 */
/* ------------------------------------------------------------------ */

const NOISE_GLSL = /* glsl */ `
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { v += a * vnoise(p); p *= 2.17; a *= 0.5; } return v; }
`;

const DAY_LENGTH = 480; // seconds for a full day/night cycle
const SKY_DISTANCE = 1600;

function smooth01(x: number) {
  return Math.min(1, Math.max(0, x));
}

/* ------------------------------------------------------------------ */
/* Stars                                                               */
/* ------------------------------------------------------------------ */

function NightStars({ env, seed }: { env: EnvState; seed: string }) {
  const ref = useRef<THREE.Points>(null);
  const material = useRef<THREE.ShaderMaterial>(null);
  const { positions, phases, sizes } = useMemo(() => {
    const random = seededRandom(seed, "night-stars");
    const count = 2600;
    const positions = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(2 * random() - 1);
      const radius = 1350 + random() * 180;
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = Math.abs(radius * Math.cos(phi)) * (random() > 0.24 ? 1 : -0.35);
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
      phases[i] = random() * Math.PI * 2;
      sizes[i] = 1.4 + Math.pow(random(), 3) * 7.5;
    }
    return { positions, phases, sizes };
  }, [seed]);

  useFrame(({ clock }) => {
    if (!material.current) return;
    const twinkle = 0.72 + 0.28 * Math.sin(clock.elapsedTime * 0.9);
    material.current.uniforms.uTime.value = clock.elapsedTime;
    material.current.uniforms.uOpacity.value = env.night * (1 - Math.min(1, env.rain) * 0.8) * twinkle;
    if (ref.current) ref.current.rotation.y = clock.elapsedTime * 0.0035;
  });

  return (
    <points ref={ref} renderOrder={-9}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aPhase" args={[phases, 1]} />
        <bufferAttribute attach="attributes-aSize" args={[sizes, 1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={material}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={{
          uTime: { value: 0 },
          uOpacity: { value: 0 },
        }}
        vertexShader={/* glsl */ `
          attribute float aPhase;
          attribute float aSize;
          varying float vPhase;
          uniform float uTime;
          void main() {
            vPhase = aPhase;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            float tw = 0.75 + 0.25 * sin(uTime * 1.6 + aPhase * 3.1);
            gl_PointSize = aSize * tw * (900.0 / -mvPosition.z);
            gl_Position = projectionMatrix * mvPosition;
          }
        `}
        fragmentShader={/* glsl */ `
          varying float vPhase;
          uniform float uOpacity;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float star = smoothstep(0.5, 0.02, d);
            vec3 tint = mix(vec3(0.72, 0.82, 1.0), vec3(1.0, 0.92, 0.78), fract(vPhase * 0.61));
            gl_FragColor = vec4(tint, star * uOpacity);
          }
        `}
      />
    </points>
  );
}

/* ------------------------------------------------------------------ */
/* Deep-space planets visible from the night sky                        */
/* ------------------------------------------------------------------ */

const PLANET_CONFIGS = [
  { pos: [-1050, 420, -780] as const, size: 92, a: "#2a3f8f", b: "#8fd0ff", bands: 6.0, ring: true, ringTilt: [0.5, 0.2, 0.35] as const },
  { pos: [900, 300, -1020] as const, size: 54, a: "#7a2d4f", b: "#ffb37a", bands: 3.2, ring: false, ringTilt: [0, 0, 0] as const },
  { pos: [-260, 620, 1180] as const, size: 40, a: "#1f5a4a", b: "#a4ffd8", bands: 2.4, ring: true, ringTilt: [1.15, 0.1, 0.6] as const },
];

function DistantPlanets({ env, seed }: { env: EnvState; seed: string }) {
  const group = useRef<THREE.Group>(null);
  const materials = useRef<THREE.ShaderMaterial[]>([]);
  const nebulas = useRef<THREE.Sprite[]>([]);
  const texture = useMemo(() => {
    const random = seededRandom(seed, "planet-noise");
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 900; i += 1) {
        const x = random() * size;
        const y = random() * size;
        const r = 2 + random() * 14;
        const shade = Math.floor(120 + random() * 135);
        ctx.fillStyle = `rgba(${shade},${shade},${shade},${0.12 + random() * 0.2})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }, [seed]);

  useFrame(({ clock }) => {
    const night = env.night * (1 - Math.min(1, env.rain) * 0.85);
    materials.current.forEach((mat, index) => {
      if (!mat) return;
      mat.uniforms.uSunDir.value.copy(env.sunDir);
      mat.uniforms.uOpacity.value = Math.max(0.06, night);
      mat.uniforms.uTime.value = clock.elapsedTime * (0.4 + index * 0.13);
    });
    nebulas.current.forEach((sprite) => {
      if (sprite) (sprite.material as THREE.SpriteMaterial).opacity = night * 0.34;
    });
    if (group.current) group.current.rotation.y = clock.elapsedTime * 0.0016;
  });

  return (
    <group ref={group}>
      {PLANET_CONFIGS.map((config, index) => (
        <group key={index} position={[config.pos[0], config.pos[1], config.pos[2]]}>
          <mesh scale={config.size}>
            <sphereGeometry args={[1, 40, 28]} />
            <shaderMaterial
              ref={(mat) => { if (mat) materials.current[index] = mat; }}
              transparent
              uniforms={{
                uSunDir: { value: new THREE.Vector3(0, 1, 0) },
                uColorA: { value: new THREE.Color(config.a) },
                uColorB: { value: new THREE.Color(config.b) },
                uOpacity: { value: 0 },
                uTime: { value: 0 },
                uBands: { value: config.bands },
                uMap: { value: texture },
              }}
              vertexShader={/* glsl */ `
                varying vec3 vNormal;
                varying vec3 vWorld;
                varying vec2 vUvW;
                void main() {
                  vNormal = normalize(mat3(modelMatrix) * normal);
                  vUvW = uv;
                  vec4 world = modelMatrix * vec4(position, 1.0);
                  vWorld = world.xyz;
                  gl_Position = projectionMatrix * viewMatrix * world;
                }
              `}
              fragmentShader={/* glsl */ `
                varying vec3 vNormal;
                varying vec3 vWorld;
                varying vec2 vUvW;
                uniform vec3 uSunDir;
                uniform vec3 uColorA;
                uniform vec3 uColorB;
                uniform float uOpacity;
                uniform float uTime;
                uniform float uBands;
                uniform sampler2D uMap;
                void main() {
                  float sun = dot(normalize(vNormal), normalize(uSunDir));
                  float lit = smoothstep(-0.22, 0.65, sun);
                  float bands = 0.5 + 0.5 * sin(vWorld.y * 0.018 * uBands + uTime * 0.4 + vWorld.x * 0.004);
                  vec3 base = mix(uColorA, uColorB, bands * 0.65 + texture2D(uMap, vUvW * 3.0).r * 0.35);
                  vec3 col = mix(base * 0.14, base * 1.35, lit);
                  float rim = pow(1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0))), 2.6);
                  col += uColorB * rim * 0.28 * (0.3 + lit);
                  gl_FragColor = vec4(col, uOpacity);
                }
              `}
            />
          </mesh>
          {config.ring && (
            <mesh rotation={[config.ringTilt[0], config.ringTilt[1], config.ringTilt[2]]} scale={config.size}>
              <ringGeometry args={[1.45, 2.15, 72]} />
              <meshBasicMaterial
                color={config.b}
                transparent
                opacity={0.16}
                side={THREE.DoubleSide}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
              />
            </mesh>
          )}
          <sprite
            ref={(sprite) => { if (sprite) nebulas.current[index] = sprite; }}
            position={[config.pos[0] * 0.16, config.pos[1] * 0.16 - 40, config.pos[2] * 0.16]}
            scale={[560, 360, 1]}
          >
            <spriteMaterial
              color={index === 1 ? "#ff9ac2" : "#7a6bff"}
              map={undefined}
              transparent
              opacity={0}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </sprite>
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Aurora borealis                                                     */
/* ------------------------------------------------------------------ */

const AURORA_RIBBONS = [
  { pos: [0, 190, -760], width: 640, height: 190, tilt: 0.16, hue: 0 },
  { pos: [-330, 230, -700], width: 520, height: 150, tilt: -0.1, hue: 1 },
  { pos: [380, 210, -720], width: 560, height: 170, tilt: 0.08, hue: 2 },
];

function Aurora({ env }: { env: EnvState }) {
  const materials = useRef<THREE.ShaderMaterial[]>([]);
  useFrame(({ clock }) => {
    const intensity = env.night * (1 - Math.min(1, env.rain) * 0.9);
    materials.current.forEach((mat, index) => {
      if (!mat) return;
      mat.uniforms.uTime.value = clock.elapsedTime * (0.6 + index * 0.22);
      mat.uniforms.uIntensity.value = intensity * (0.55 + 0.45 * Math.sin(clock.elapsedTime * 0.11 + index * 2.4) ** 2);
    });
  });
  return (
    <group>
      {AURORA_RIBBONS.map((ribbon, index) => (
        <mesh key={index} position={[ribbon.pos[0], ribbon.pos[1], ribbon.pos[2]]} rotation={[ribbon.tilt, index * 0.6 - 0.5, ribbon.tilt * 0.5]} renderOrder={-7}>
          <planeGeometry args={[ribbon.width, ribbon.height, 220, 1]} />
          <shaderMaterial
            ref={(mat) => { if (mat) materials.current[index] = mat; }}
            transparent
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            uniforms={{ uTime: { value: 0 }, uIntensity: { value: 0 }, uHue: { value: ribbon.hue } }}
            vertexShader={/* glsl */ `
              uniform float uTime;
              varying vec2 vUv;
              varying float vWave;
              void main() {
                vUv = uv;
                vec3 p = position;
                float bend = sin(p.x * 0.011 + uTime * 0.32) + 0.55 * sin(p.x * 0.027 - uTime * 0.21);
                p.z += bend * 26.0;
                p.y += sin(p.x * 0.02 + uTime * 0.4) * 14.0 * uv.y;
                vWave = bend;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
              }
            `}
            fragmentShader={/* glsl */ `
              ${NOISE_GLSL}
              uniform float uTime;
              uniform float uIntensity;
              uniform float uHue;
              varying vec2 vUv;
              varying float vWave;
              void main() {
                if (uIntensity < 0.01) discard;
                float curtain = fbm(vec2(vUv.x * 16.0 + uTime * 0.22, uTime * 0.16 + vUv.y * 1.6));
                curtain += 0.5 * fbm(vec2(vUv.x * 38.0 - uTime * 0.4, uTime * 0.1));
                float shape = smoothstep(0.32, 0.85, curtain);
                float vertical = pow(1.0 - vUv.y, 1.35) * smoothstep(0.0, 0.14, vUv.y);
                float edges = smoothstep(0.0, 0.07, vUv.x) * smoothstep(1.0, 0.93, vUv.x);
                float alpha = shape * vertical * edges * uIntensity * 0.85;
                vec3 green = vec3(0.24, 1.0, 0.55);
                vec3 teal = vec3(0.2, 0.85, 0.95);
                vec3 violet = vec3(0.62, 0.3, 1.0);
                vec3 col = mix(green, teal, smoothstep(0.1, 0.75, vUv.y + vWave * 0.2));
                col = mix(col, violet, smoothstep(0.45, 1.0, vUv.y * (0.5 + uHue * 0.35)) * 0.8);
                gl_FragColor = vec4(col * (0.7 + shape * 0.9), alpha);
              }
            `}
          />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Clouds                                                              */
/* ------------------------------------------------------------------ */

function makeCloudTexture(seed: string) {
  const random = seededRandom(seed, "cloud-texture");
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, size, size);
    for (let i = 0; i < 46; i += 1) {
      const x = size * 0.5 + (random() - 0.5) * size * 0.62;
      const y = size * 0.5 + (random() - 0.5) * size * 0.4;
      const r = size * (0.08 + random() * 0.17);
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
      const alpha = 0.10 + random() * 0.13;
      gradient.addColorStop(0, `rgba(255,255,255,${alpha})`);
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return new THREE.CanvasTexture(canvas);
}

function CloudDeck({ env, seed }: { env: EnvState; seed: string }) {
  const group = useRef<THREE.Group>(null);
  const texture = useMemo(() => makeCloudTexture(seed), [seed]);
  const clouds = useMemo(() => {
    const random = seededRandom(seed, "cloud-deck");
    return Array.from({ length: 16 }, (_, index) => ({
      id: index,
      pos: [(random() - 0.5) * 900, 90 + random() * 130, (random() - 0.5) * 900] as [number, number, number],
      scale: 190 + random() * 260,
      speed: 1.6 + random() * 2.6,
      seed: random(),
    }));
  }, [seed]);

  useFrame(({ clock }, delta) => {
    if (!group.current) return;
    const cover = 0.16 + Math.min(1, env.rain) * 0.62;
    group.current.children.forEach((child, index) => {
      const mat = (child as THREE.Sprite).material as THREE.SpriteMaterial;
      const cloud = clouds[index];
      child.position.x += cloud.speed * delta * (1 + env.storm * 1.6);
      if (child.position.x > 520) child.position.x = -520;
      const dark = mat.color.clone().lerp(new THREE.Color("#f4f7ff"), 0);
      dark.lerp(new THREE.Color("#54626e"), Math.min(1, env.rain * 0.85));
      mat.color.copy(dark);
      const flicker = env.storm > 0.4 ? Math.random() * 0.1 : 0;
      mat.opacity = Math.min(0.9, cover * (0.7 + cloud.seed * 0.5) + flicker);
    });
    void clock;
  });

  return (
    <group ref={group} renderOrder={-6}>
      {clouds.map((cloud) => (
        <sprite key={cloud.id} position={cloud.pos} scale={[cloud.scale, cloud.scale * 0.42, 1]}>
          <spriteMaterial map={texture} transparent depthWrite={false} opacity={0.2} color="#54626e" fog={false} />
        </sprite>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Rainbow                                                             */
/* ------------------------------------------------------------------ */

function Rainbow({ env }: { env: EnvState }) {
  const material = useRef<THREE.ShaderMaterial>(null);
  const group = useRef<THREE.Group>(null);
  useFrame(({ camera, clock }) => {
    if (!material.current || !group.current) return;
    const visible = env.rainbow * env.sunUp * (1 - env.night);
    material.current.uniforms.uOpacity.value = THREE.MathUtils.lerp(material.current.uniforms.uOpacity.value, visible, 0.02);
    material.current.uniforms.uTime.value = clock.elapsedTime;
    // Position the bow opposite the sun, centered near the camera.
    const dir = env.sunDir.clone().multiplyScalar(-1);
    group.current.position.set(camera.position.x + dir.x * 480, Math.max(30, dir.y * 380 + 60), camera.position.z + dir.z * 480);
    group.current.lookAt(camera.position.x, 60, camera.position.z);
  });
  return (
    <group ref={group}>
      {[0, 1].map((pass) => (
        <mesh key={pass} renderOrder={-4}>
          <ringGeometry args={[430 + pass * 34, 500 + pass * 34, 96, 1, 0, Math.PI]} />
          <shaderMaterial
            ref={pass === 0 ? material : undefined}
            transparent
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            uniforms={{ uOpacity: { value: 0 }, uTime: { value: 0 }, uPass: { value: pass } }}
            vertexShader={/* glsl */ `
              varying vec2 vUv;
              varying vec3 vPos;
              void main() {
                vUv = uv;
                vPos = position;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
              }
            `}
            fragmentShader={/* glsl */ `
              uniform float uOpacity;
              uniform float uTime;
              uniform float uPass;
              varying vec2 vUv;
              varying vec3 vPos;
              void main() {
                if (uOpacity < 0.012) discard;
                float r = length(vPos);
                float inner = ${pass === 0 ? "432.0" : "462.0"};
                float outer = ${pass === 0 ? "502.0" : "536.0"};
                float t = clamp((r - inner) / (outer - inner), 0.0, 1.0);
                if (uPass > 0.5) t = 1.0 - t;
                vec3 spectral = vec3(
                  0.9 * smoothstep(0.55, 0.95, t) + 0.1,
                  sin(t * 3.14159) * 0.95,
                  0.95 * smoothstep(0.45, 0.0, t) + 0.05
                );
                float alpha = uOpacity * (uPass > 0.5 ? 0.16 : 0.34) * smoothstep(0.0, 0.16, vUv.y);
                gl_FragColor = vec4(spectral, alpha);
              }
            `}
          />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* The full sky: day/night cycle, sun, moon, weather machine            */
/* ------------------------------------------------------------------ */

interface WorldSkyProps {
  env: EnvState;
  seed: string;
  quality: "low" | "medium" | "ultra";
  shadows?: boolean;
  dayStart?: number;
}

export function WorldSky({ env, seed, quality, shadows = true, dayStart = 0.34 }: WorldSkyProps) {
  const { scene, camera } = useThree();
  const sky = useMemo(() => new Sky(), []);
  const skyGroup = useRef<THREE.Group>(null);
  const sunMesh = useRef<THREE.Mesh>(null);
  const moonMesh = useRef<THREE.Mesh>(null);
  const sunLight = useRef<THREE.DirectionalLight>(null);
  const moonLight = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const flash = useRef<THREE.PointLight>(null);
  const moonTexture = useMemo(() => {
    const random = seededRandom(seed, "moon-craters");
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#c9d4e8";
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 70; i += 1) {
        const x = random() * size;
        const y = random() * size;
        const r = 2 + random() * 16;
        const shade = 150 + Math.floor(random() * 60);
        ctx.fillStyle = `rgb(${shade},${shade + 6},${shade + 14})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(70,80,105,${0.16 + random() * 0.2})`;
        ctx.beginPath();
        ctx.arc(x + r * 0.2, y + r * 0.25, r * 0.72, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [seed]);

  const fogRef = useRef<THREE.FogExp2 | null>(null);
  const weather = useRef({
    phase: "clear" as EnvState["weatherKind"],
    timer: 62,
    thunder: 5,
    lastEmit: 0,
    lastClock: "",
    time: dayStart,
  });

  useEffect(() => {
    sky.scale.setScalar(SKY_DISTANCE);
    const uniforms = (sky.material as THREE.ShaderMaterial).uniforms;
    uniforms.turbidity.value = 6.5;
    uniforms.rayleigh.value = 2.2;
    uniforms.mieCoefficient.value = 0.012;
    uniforms.mieDirectionalG.value = 0.92;
    const createdFog = !scene.fog;
    if (createdFog) scene.fog = new THREE.FogExp2(new THREE.Color("#9fc4d4"), 0.0038);
    return () => {
      env.sunMesh = null;
      if (createdFog && scene.fog === fogRef.current) scene.fog = null;
    };
  }, [sky, scene, env]);

  useFrame(({ clock }, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1);
    const state = weather.current;

    // ---- time of day -------------------------------------------------
    state.time = (state.time + delta / DAY_LENGTH) % 1;
    env.timeOfDay = state.time;
    const angle = (state.time - 0.25) * Math.PI * 2;
    const elev = Math.sin(angle);
    const sunDir = env.sunDir.set(Math.cos(angle) * 0.82, elev, Math.cos(angle) * 0.4 - 0.42).normalize();
    env.moonDir.set(-sunDir.x, -elev, 0.42 - Math.cos(angle) * 0.4).normalize();
    env.sunUp = smooth01((elev + 0.05) / 0.14);
    env.night = smooth01((0.04 - elev) / 0.2);

    // ---- weather machine ---------------------------------------------
    state.timer -= delta;
    const targetRain = state.phase === "rain" ? 0.85 : state.phase === "storm" ? 1.45 : state.phase === "clearing" ? 0.1 : 0;
    const targetStorm = state.phase === "storm" ? 1 : 0;
    env.rain = THREE.MathUtils.lerp(env.rain, targetRain, 1 - Math.exp(-delta * (targetRain > env.rain ? 0.5 : 0.28)));
    env.storm = THREE.MathUtils.lerp(env.storm, targetStorm, 1 - Math.exp(-delta * 0.5));
    const wantRainbow = state.phase === "clearing" && env.sunUp > 0.2 ? 1 : 0;
    env.rainbow = THREE.MathUtils.lerp(env.rainbow, wantRainbow, 1 - Math.exp(-delta * 0.35));
    if (state.timer <= 0) {
      const order: Record<EnvState["weatherKind"], { next: EnvState["weatherKind"]; duration: [number, number] }> = {
        clear: { next: "clouds", duration: [55, 105] },
        clouds: { next: "rain", duration: [9, 14] },
        rain: { next: Math.random() > 0.42 ? "storm" : "clearing", duration: [30, 52] },
        storm: { next: "clearing", duration: [20, 30] },
        clearing: { next: "clear", duration: [42, 60] },
      };
      const step = order[state.phase];
      state.phase = step.next;
      state.timer = step.duration[0] + Math.random() * (step.duration[1] - step.duration[0]);
      env.weatherKind = state.phase;
      worldBus.emit({ type: "weather", kind: state.phase, rain: env.rain, storm: env.storm > 0.5 });
    }
    if (clock.elapsedTime - state.lastEmit > 1.4) {
      state.lastEmit = clock.elapsedTime;
      worldBus.emit({ type: "weather", kind: state.phase, rain: env.rain, storm: env.storm > 0.5 });
    }

    // ---- thunder ------------------------------------------------------
    if (env.storm > 0.5) {
      state.thunder -= delta;
      if (state.thunder <= 0) {
        state.thunder = 3.4 + Math.random() * 4.2;
        if (flash.current) {
          flash.current.position.set(camera.position.x + (Math.random() - 0.5) * 180, 90 + Math.random() * 60, camera.position.z - 80 - Math.random() * 140);
          flash.current.intensity = 2600 + Math.random() * 2600;
        }
        window.setTimeout(() => cinematicAudio.thunder(), 300 + Math.random() * 1100);
      }
    }
    if (flash.current) flash.current.intensity = THREE.MathUtils.lerp(flash.current.intensity, 0, 1 - Math.exp(-delta * 5.2));

    // ---- sky shader + fog ---------------------------------------------
    const uniforms = (sky.material as THREE.ShaderMaterial).uniforms;
    uniforms.sunPosition.value.copy(sunDir).multiplyScalar(100);
    uniforms.turbidity.value = 4.5 + env.rain * 9;
    uniforms.rayleigh.value = 1.4 + env.rain * 2.4 + (1 - env.sunUp) * 1.4;
    uniforms.mieCoefficient.value = 0.008 + env.rain * 0.02;
    sky.position.set(camera.position.x, 0, camera.position.z);

    if (scene.fog) {
      const fog = scene.fog as THREE.FogExp2;
      const day = new THREE.Color("#9fc6d8");
      const dusk = new THREE.Color("#e08a5e");
      const nightC = new THREE.Color("#0a1226");
      const rainC = new THREE.Color("#5d6a74");
      const underC = new THREE.Color("#05323c");
      const sunsetFactor = env.sunUp * Math.max(0, 1 - Math.abs(elev) * 3.4);
      const base = day.clone().lerp(nightC, env.night);
      base.lerp(dusk, sunsetFactor * 0.72);
      base.lerp(rainC, Math.min(1, env.rain) * 0.62);
      if (env.underwater) base.lerp(underC, 0.92);
      fog.color.lerp(base, 1 - Math.exp(-delta * 2.2));
      const targetDensity = env.underwater ? 0.05 : 0.0034 + Math.min(1, env.rain) * 0.0085 + env.night * 0.0012;
      fog.density = THREE.MathUtils.lerp(fog.density, targetDensity, 1 - Math.exp(-delta * 2));
    }

    // ---- sun -----------------------------------------------------------
    if (sunMesh.current) {
      sunMesh.current.position.set(camera.position.x, 0, camera.position.z).addScaledVector(sunDir, 1420);
      env.sunMesh = sunMesh.current;
    }
    if (sunLight.current) {
      sunLight.current.position.copy(camera.position).addScaledVector(sunDir, 90);
      sunLight.current.target.position.copy(camera.position);
      sunLight.current.target.updateMatrixWorld();
      const warm = new THREE.Color("#ffd9a0").lerp(new THREE.Color("#ff7a3c"), Math.max(0, 1 - env.sunUp) * 0.8);
      sunLight.current.color.lerp(warm, 0.08);
      sunLight.current.intensity = env.sunUp * (4.4 - Math.min(1, env.rain) * 3.1);
    }

    // ---- moon ----------------------------------------------------------
    if (moonMesh.current) {
      moonMesh.current.position.set(camera.position.x, 0, camera.position.z).addScaledVector(env.moonDir, 1280);
      moonMesh.current.rotation.y = clock.elapsedTime * 0.008;
    }
    if (moonLight.current) {
      moonLight.current.position.copy(camera.position).addScaledVector(env.moonDir, 80);
      moonLight.current.intensity = env.night * 0.85 * (1 - Math.min(1, env.rain) * 0.7);
    }
    if (hemi.current) {
      hemi.current.intensity = 0.34 + env.sunUp * 0.9 - Math.min(1, env.rain) * 0.24;
    }

    // ---- HUD clock ------------------------------------------------------
    const hours = Math.floor(state.time * 24);
    const minutes = Math.floor((state.time * 24 - hours) * 60);
    const label = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    if (label !== state.lastClock) {
      state.lastClock = label;
      worldBus.emit({ type: "clock", label, night: env.night });
    }
  });

  return (
    <>
      <primitive object={sky} renderOrder={-10} />
      <group ref={skyGroup}>
        <NightStars env={env} seed={seed} />
        <DistantPlanets env={env} seed={seed} />
        <Aurora env={env} />
        <CloudDeck env={env} seed={seed} />
        <Rainbow env={env} />
      </group>
      <mesh ref={sunMesh} renderOrder={-8}>
        <sphereGeometry args={[52, 32, 24]} />
        <meshBasicMaterial color="#fff3d6" toneMapped={false} transparent opacity={0.96} depthWrite={false} fog={false} />
      </mesh>
      <mesh ref={moonMesh} renderOrder={-8}>
        <sphereGeometry args={[30, 32, 24]} />
        <meshBasicMaterial map={moonTexture} color="#dfe9ff" toneMapped={false} transparent opacity={0.95} depthWrite={false} fog={false} />
      </mesh>
      <pointLight ref={flash} color="#dce8ff" intensity={0} distance={900} decay={1.4} />
      <ambientLight intensity={0.22} color="#8fb4c8" />
      <hemisphereLight ref={hemi} args={["#ffd9a6", "#0a1a20", 1]} />
      <directionalLight
        ref={sunLight}
        color="#ffe0a7"
        intensity={4}
        castShadow={shadows && quality !== "low"}
        shadow-mapSize={[quality === "ultra" ? 2048 : 1024, quality === "ultra" ? 2048 : 1024]}
        shadow-camera-left={-70}
        shadow-camera-right={70}
        shadow-camera-top={70}
        shadow-camera-bottom={-70}
        shadow-camera-far={320}
        shadow-bias={-0.00025}
      />
      <directionalLight ref={moonLight} color="#9db8e8" intensity={0} />
    </>
  );
}
