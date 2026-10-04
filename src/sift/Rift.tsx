/* Rift opening — stepped "pixel cross" aperture with glowing rim, parallax
   interior, floating outline cubes, lightning arcs and sparkles.
   Original implementation of the visual language described in this repo's
   own design docs (fabric-mod/docs, README).                                  */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { RIFT_STYLES } from "./core";

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform vec3 uRim;
uniform vec3 uInner;
uniform vec3 uSky;
uniform float uTear;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

/* stepped pixel-cross silhouette */
float crossMask(vec2 p) {
  vec2 q = abs(p);
  float vert = step(q.x, 0.22) * step(q.y, 0.5);
  float horz = step(q.x, 0.5) * step(q.y, 0.22);
  float notchA = step(q.x, 0.36) * step(q.y, 0.36);
  return clamp(vert + horz + notchA * step(q.x,0.36)*step(q.y,0.36), 0.0, 1.0);
}
float pixelate(float v, vec2 p, float cells) {
  return v;
}

void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  /* pixel quantisation for the blocky silhouette */
  float cells = 24.0;
  vec2 pp = floor(p * cells) / cells + 0.5 / cells;
  float mask = crossMask(pp);
  /* tearing: open from centre outward */
  float tear = smoothstep(0.0, 1.0, uTear);
  float open = step(length(pp) * (1.4 - tear * 1.4), 1.0);
  mask *= open;

  /* rim = mask minus eroded mask */
  float er = crossMask(floor((p * (cells - 3.0)) ) / (cells - 3.0) + 0.5/(cells-3.0));
  float rim = mask * (1.0 - step(0.5, crossMask(pp * 0.82)));

  /* interior: drifting pixel clouds, two parallax layers */
  float t = uTime * 0.12;
  float c1 = vnoise(pp * 5.0 + vec2(t, -t * 0.7));
  float c2 = vnoise(pp * 11.0 - vec2(t * 1.7, t));
  float clouds = smoothstep(0.35, 0.8, c1 * 0.65 + c2 * 0.5);
  vec3 innerCol = mix(uSky * 0.7, uInner, clouds);
  innerCol += uInner * 0.25 * vnoise(pp * 23.0 + uTime * 0.4); /* sparkle grain */

  /* hot tearing cells */
  float hot = (1.0 - tear) * mask * step(0.75, hash(floor(pp * cells) + floor(uTime * 8.0)));

  vec3 col = mix(innerCol, uRim, clamp(rim * 1.4, 0.0, 1.0));
  col += vec3(1.0) * hot;
  float alpha = mask;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(col, alpha);
}`;

export function Rift({ styleId = "sift", width = 3, height = 3, animated = true, tear = 1, tearOverride }: {
  styleId?: string; width?: number; height?: number; animated?: boolean; tear?: number; tearOverride?: number;
}) {
  const tearOverrideRef = useRef<number | null>(tearOverride ?? null);
  tearOverrideRef.current = tearOverride ?? null;
  const style = RIFT_STYLES.find((s) => s.id === styleId) || RIFT_STYLES[1];
  const group = useRef<THREE.Group>(null);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uRim: { value: new THREE.Color(style.rim) },
      uInner: { value: new THREE.Color(style.inner) },
      uSky: { value: new THREE.Color(style.sky) },
      uTear: { value: animated ? 0.04 : tear },
    },
  }), [styleId]);

  /* floating hollow outline cubes */
  const cubes = useMemo(() => Array.from({ length: 4 }, (_, i) => ({
    r: 0.35 + Math.random() * 0.3,
    speed: 0.4 + Math.random() * 0.8,
    phase: Math.random() * Math.PI * 2,
    rad: width * 0.55 + Math.random() * 0.6,
  })), [width]);

  /* lightning arc geometry (updated per frame) */
  const arcRef = useRef<THREE.LineSegments>(null);
  const arcGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(2 * 24 * 3), 3));
    return g;
  }, []);
  const arcMat = useMemo(() => new THREE.LineBasicMaterial({
    color: new THREE.Color(style.rim), transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }), [styleId]);

  /* sparkles */
  const sparkGeo = useMemo(() => {
    const n = 60;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * width * 1.4;
      pos[i * 3 + 1] = (Math.random() - 0.5) * height * 1.4;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 0.4;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, [width, height]);
  const sparkMat = useMemo(() => new THREE.PointsMaterial({
    color: new THREE.Color(style.rim), size: 0.06, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }), [styleId]);

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    mat.uniforms.uTime.value = t;
    if (tearOverrideRef.current != null) mat.uniforms.uTear.value = tearOverrideRef.current;
    else if (animated) mat.uniforms.uTear.value = Math.min(1, mat.uniforms.uTear.value + dt * 0.45);
    if (!animated) return;
    if (group.current) {
      group.current.children.forEach((c, i) => {
        if ((c as any).isRiftCube) {
          const cfg = cubes[i % cubes.length];
          c.position.set(
            Math.cos(t * cfg.speed + cfg.phase) * cfg.rad,
            Math.sin(t * cfg.speed * 1.3 + cfg.phase) * cfg.rad * 0.7,
            Math.sin(t * cfg.speed + cfg.phase) * 0.6,
          );
          c.rotation.x += dt * cfg.speed; c.rotation.y += dt * cfg.speed * 0.7;
        }
      });
    }
    if (arcRef.current && Math.random() < 0.12) {
      const arr = (arcGeo.attributes.position as THREE.BufferAttribute);
      for (let a = 0; a < 2; a++) {
        let x = (Math.random() - 0.5) * width, y = (Math.random() - 0.5) * height, z = 0.05;
        for (let s = 0; s < 24; s++) {
          arr.setXYZ(a * 24 + s, x, y, z);
          x += (Math.random() - 0.5) * 0.3; y += (Math.random() - 0.5) * 0.3; z += (Math.random() - 0.5) * 0.1;
        }
      }
      arr.needsUpdate = true;
      arcMat.opacity = 0.5 + Math.random() * 0.5;
    }
  });

  const edgeGeo = useMemo(() => new THREE.BoxGeometry(0.5, 0.5, 0.5), []);
  const edgeMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: new THREE.Color(style.rim), wireframe: true, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }), [styleId]);

  return (
    <group ref={group}>
      <mesh material={mat}>
        <planeGeometry args={[width, height]} />
      </mesh>
      {/* back face for depth */}
      <mesh material={mat} position={[0, 0, -0.12]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[width * 0.96, height * 0.96]} />
      </mesh>
      {cubes.map((c, i) => (
        <mesh key={i} geometry={edgeGeo} material={edgeMat}
          ref={(m) => { if (m) (m as any).isRiftCube = true; }} />
      ))}
      <lineSegments ref={arcRef} geometry={arcGeo} material={arcMat} />
      <points geometry={sparkGeo} material={sparkMat} />
      {/* ground glow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -height / 2 + 0.02, 0]}>
        <circleGeometry args={[width * 0.8, 24]} />
        <meshBasicMaterial color={style.inner} transparent opacity={0.25} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}
