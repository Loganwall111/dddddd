/* VFX systems: soul drifts, ember fields, note shafts, outline shards,
   sparkle bursts and the aurora ribbon sky. All original shader code.       */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const POINT_VERT = /* glsl */ `
attribute float aSeed;
uniform float uTime;
uniform float uRise;
uniform float uSway;
varying float vFade;
void main() {
  vec3 p = position;
  float t = uTime * 0.25 + aSeed * 17.0;
  p.y = mod(p.y + uTime * uRise * (0.5 + fract(aSeed * 7.0) * 0.8), 8.0);
  p.x += sin(t * 1.7) * uSway;
  p.z += cos(t * 1.3) * uSway;
  vFade = smoothstep(0.0, 1.2, p.y) * (1.0 - smoothstep(5.5, 8.0, p.y));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = (34.0 / -mv.z) * (0.6 + fract(aSeed * 3.0) * 0.9);
  gl_Position = projectionMatrix * mv;
}`;

const POINT_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor;
varying float vFade;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = smoothstep(0.5, 0.05, d) * vFade;
  float core = smoothstep(0.18, 0.0, d);
  gl_FragColor = vec4(uColor * (0.7 + core * 1.6), a * 0.85);
  if (a < 0.01) discard;
}`;

export function ParticleDrift({ color = "#9fe8ff", count = 220, radius = 14, rise = 0.5, sway = 0.5, size = 1 }: {
  color?: string; count?: number; radius?: number; rise?: number; sway?: number; size?: number;
}) {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: POINT_VERT, fragmentShader: POINT_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 }, uColor: { value: new THREE.Color(color) },
      uRise: { value: rise }, uSway: { value: sway },
    },
  }), [color, rise, sway]);
  const geo = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = Math.random() * 8;
      pos[i * 3 + 2] = Math.sin(a) * r;
      seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    return g;
  }, [count, radius]);
  useFrame(({ clock }) => { mat.uniforms.uTime.value = clock.elapsedTime * size; });
  return <points geometry={geo} material={mat} />;
}

/* Coloured note light shaft (ritual right-click effect) */
export function LightShaft({ color = "#5af2ff", height = 9, radius = 0.35 }: {
  color?: string; height?: number; radius?: number;
}) {
  const mat = useMemo(() => {
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uH: { value: height } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `precision highp float; varying vec2 vUv; uniform vec3 uColor; uniform float uTime; uniform float uH;
        void main(){
          float edge = smoothstep(0.0,0.25,vUv.x)*smoothstep(1.0,0.75,vUv.x);
          float vert = smoothstep(0.0,0.15,vUv.y)*(1.0-smoothstep(0.55,1.0,vUv.y));
          float flick = 0.75+0.25*sin(uTime*9.0+vUv.y*40.0);
          gl_FragColor = vec4(uColor*(1.4*flick), edge*vert*0.8);
        }`,
    });
    return m;
  }, [color, height]);
  useFrame(({ clock }) => { mat.uniforms.uTime.value = clock.elapsedTime; });
  return (
    <group>
      <mesh material={mat} position={[0, height / 2, 0]}>
        <cylinderGeometry args={[radius, radius * 1.4, height, 10, 1, true]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <circleGeometry args={[radius * 2.4, 20]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

/* Aurora ribbon sky dome (Sift sky language: ribbons + rays + stars) */
const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
}`;
const SKY_FRAG = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform vec3 uTop; uniform vec3 uBottom;
uniform float uTime; uniform float uNight; uniform float uRibbons;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 col = mix(uBottom, uTop, pow(h, 1.25));
  /* aurora ribbons */
  float ang = atan(d.z, d.x);
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float band = 0.35 + fi * 0.14;
    float w = sin(ang * (3.0 + fi) + uTime * (0.12 + fi * 0.03) + fi * 2.1) * 0.08
            + sin(ang * (7.0 - fi) - uTime * 0.07) * 0.04;
    float y = d.y;
    float ribbon = exp(-pow((y - band - w) * (9.0 - fi), 2.0));
    vec3 rc = mix(vec3(0.35, 0.95, 0.85), vec3(1.0, 0.55, 0.8), fract(fi * 0.37 + uTime * 0.01));
    col += rc * ribbon * uRibbons * (0.55 + 0.45 * sin(uTime * 0.6 + fi));
  }
  /* stars at night */
  if (uNight > 0.5) {
    vec2 sp = vec2(ang * 40.0, d.y * 90.0);
    float star = step(0.998, hash(floor(sp)));
    col += vec3(star) * (0.6 + 0.4 * sin(uTime * 3.0 + hash(floor(sp)) * 40.0)) * smoothstep(0.0, 0.2, d.y);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

export function SkyDome({ top = "#39a59e", bottom = "#9fe8dc", night = false, ribbons = 1 }: {
  top?: string; bottom?: string; night?: boolean; ribbons?: number;
}) {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color(top) }, uBottom: { value: new THREE.Color(bottom) },
      uTime: { value: 0 }, uNight: { value: night ? 1 : 0 }, uRibbons: { value: ribbons },
    },
  }), [top, bottom, night, ribbons]);
  useFrame(({ clock }) => { mat.uniforms.uTime.value = clock.elapsedTime; });
  return (
    <mesh material={mat}>
      <sphereGeometry args={[300, 32, 24]} />
    </mesh>
  );
}

/* Ichor pool — animated pastel oil-slick liquid disc */
export function IchorPool({ radius = 4, color = "#c07ae0" }: { radius?: number; color?: string }) {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `precision highp float; varying vec2 vUv; uniform float uTime; uniform vec3 uColor;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float vn(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);}
      void main(){
        vec2 p=(vUv-0.5)*6.0;
        float n = vn(p*2.0+uTime*0.3)+vn(p*5.0-uTime*0.5)*0.5;
        float hue = fract(n*0.8+uTime*0.02);
        vec3 irid = 0.5+0.5*cos(6.2831*(hue+vec3(0.0,0.33,0.66)));
        vec3 col = mix(uColor, irid, 0.45) + 0.25*vn(p*16.0+uTime);
        float glint = step(0.86, vn(p*24.0-uTime*1.5));
        col += glint*0.8;
        float edge = smoothstep(0.5,0.46,length(vUv-0.5));
        gl_FragColor = vec4(col, 0.9*edge);
      }`,
  }), [color]);
  useFrame(({ clock }) => { mat.uniforms.uTime.value = clock.elapsedTime; });
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} material={mat}>
      <circleGeometry args={[radius, 40]} />
    </mesh>
  );
}

/* Floating outline shards */
export function OutlineShards({ count = 6, color = "#eafff5", radius = 3 }: {
  count?: number; color?: string; radius?: number;
}) {
  const ref = useRef<THREE.Group>(null);
  const items = useMemo(() => Array.from({ length: count }, () => ({
    ph: Math.random() * 6.28, sp: 0.3 + Math.random() * 0.7, s: 0.2 + Math.random() * 0.35,
  })), [count]);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({
    color, wireframe: true, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }), [color]);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    ref.current.children.forEach((c, i) => {
      const it = items[i];
      c.position.set(Math.cos(t * it.sp + it.ph) * radius, 1.5 + Math.sin(t * it.sp * 1.4 + it.ph) * 1.2, Math.sin(t * it.sp + it.ph) * radius);
      c.rotation.x += 0.01; c.rotation.y += 0.014;
    });
  });
  return (
    <group ref={ref}>
      {items.map((it, i) => (
        <mesh key={i} material={mat}>
          <boxGeometry args={[it.s, it.s, it.s]} />
        </mesh>
      ))}
    </group>
  );
}

export function VfxItem({ id, color }: { id: string; color?: string }) {
  switch (id) {
    case "souls": return <ParticleDrift color={color || "#9fe8ff"} />;
    case "embers": return <ParticleDrift color={color || "#ffab5a"} rise={0.9} sway={0.3} />;
    case "lightning": return <OutlineShards count={0} color="#000" />;
    case "shaft": return <LightShaft color={color || "#5af2ff"} />;
    case "shards": return <OutlineShards color={color || "#eafff5"} />;
    case "sparkle": return <ParticleDrift color={color || "#ffffff"} count={140} rise={0.2} sway={0.9} radius={4} />;
    case "ichor": return <IchorPool radius={4} />;
    default: return null;
  }
}
