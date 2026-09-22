// All custom GLSL for the lab: fluid surface points, spectral-style ocean,
// atmosphere, portals, accretion disks, vortex funnels and the final
// gravitational-lensing composite (HDR grade + ACES + underwater optics).

import * as THREE from "three";

/* ------------------------------------------------------------------ */
/* SPH fluid points                                                    */
/* ------------------------------------------------------------------ */
export function makeFluidPointsMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: 1 },
      uScale: { value: 600 },
      uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.3) },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      attribute vec3 aData; // size, alpha, foam(>0) / ice(<0)
      varying vec3 vColor;
      varying vec3 vData;
      uniform float uPixelRatio;
      uniform float uScale;
      void main() {
        vColor = aColor;
        vData = aData;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float dist = max(-mv.z, 0.1);
        gl_PointSize = clamp(aData.x * uScale * uPixelRatio / dist, 1.0, 260.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying vec3 vData;
      uniform vec3 uSunDir;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv) * 2.0;
        if (d > 1.0) discard;
        // fake sphere normal for a watery highlight
        vec3 n = vec3(uv * 2.0, sqrt(max(0.0, 1.0 - d * d)));
        float diff = 0.45 + 0.55 * max(dot(n, normalize(uSunDir)), 0.0);
        vec3 h = normalize(normalize(uSunDir) + vec3(0.0, 0.0, 1.0));
        float spec = pow(max(dot(n, h), 0.0), 60.0);
        float foam = clamp(vData.z, 0.0, 1.0);
        float ice = clamp(-vData.z, 0.0, 1.0);
        vec3 col = vColor * diff + vec3(1.0) * spec * 0.7;
        col = mix(col, vec3(0.92, 0.96, 0.97), foam * 0.85);
        col = mix(col, vec3(0.62, 0.78, 0.9), ice * 0.8);
        float alpha = vData.y * smoothstep(1.0, 0.72, d);
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
  });
}

/* ------------------------------------------------------------------ */
/* Ocean: Gerstner displacement + depth color + shore foam + ice       */
/* ------------------------------------------------------------------ */
export function makeOceanMaterial(heightTex: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uStorm: { value: 0 },
      uSeaLevel: { value: 0 },
      uHeightTex: { value: heightTex },
      uWorldSize: { value: 240 },
      uHMin: { value: -20 },
      uHMax: { value: 44 },
      uDeep: { value: new THREE.Color(0.008, 0.10, 0.19) },
      uShallow: { value: new THREE.Color(0.05, 0.35, 0.42) },
      uSky: { value: new THREE.Color(0.45, 0.62, 0.78) },
      uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.3) },
      uSunColor: { value: new THREE.Color(1.0, 0.9, 0.78) },
      uIce: { value: 0 },
      uFogColor: { value: new THREE.Color(0.55, 0.68, 0.78) },
      uFogDensity: { value: 0.0016 },
      uCamPos: { value: new THREE.Vector3() },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uStorm;
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying float vCrest;
      vec3 gerstner(vec2 dir, float freq, float amp, float speed, vec3 p, float t, inout vec3 nrm, inout float crest) {
        float f = dot(dir, p.xz) * freq + t * speed;
        float c = cos(f);
        float s = sin(f);
        p.x += dir.x * amp * c;
        p.z += dir.y * amp * c;
        p.y += amp * s;
        nrm.x -= dir.x * freq * amp * c;
        nrm.z -= dir.y * freq * amp * c;
        nrm.y -= freq * amp * s;
        crest += s * amp;
        return p;
      }
      void main() {
        vec3 p = position;
        // plane is rotated -PI/2 so local xy maps to world xz
        vec3 wp = (modelMatrix * vec4(p, 1.0)).xyz;
        vec3 nrm = vec3(0.0, 1.0, 0.0);
        float crest = 0.0;
        float amp = 0.22 + uStorm * 1.5;
        float t = uTime;
        p = gerstner(normalize(vec2(1.0, 0.35)), 0.11, amp * 1.0, 1.1, p, t, nrm, crest);
        p = gerstner(normalize(vec2(-0.7, 1.0)), 0.21, amp * 0.55, 1.5, p, t, nrm, crest);
        p = gerstner(normalize(vec2(0.4, -1.0)), 0.42, amp * 0.28, 2.1, p, t, nrm, crest);
        p = gerstner(normalize(vec2(-1.0, -0.4)), 0.85, amp * 0.12, 2.8, p, t, nrm, crest);
        vCrest = crest;
        vNormal = normalize(normalMatrix * nrm);
        vec4 world = modelMatrix * vec4(p, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uStorm;
      uniform float uSeaLevel;
      uniform sampler2D uHeightTex;
      uniform float uWorldSize;
      uniform float uHMin;
      uniform float uHMax;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform vec3 uSky;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform float uIce;
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      uniform vec3 uCamPos;
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying float vCrest;
      void main() {
        // detail ripple normal
        vec2 p = vWorld.xz;
        float e = 0.35;
        vec2 t = vec2(uTime * 0.7, uTime * 0.45);
        float h0 = sin(p.x * 1.4 + t.x) * sin(p.y * 1.1 - t.y) + 0.5 * sin(p.x * 3.1 - t.y * 1.7) * sin(p.y * 2.7 + t.x);
        float hx = sin((p.x + e) * 1.4 + t.x) * sin(p.y * 1.1 - t.y) + 0.5 * sin((p.x + e) * 3.1 - t.y * 1.7) * sin(p.y * 2.7 + t.x);
        float hz = sin(p.x * 1.4 + t.x) * sin((p.y + e) * 1.1 - t.y) + 0.5 * sin(p.x * 3.1 - t.y * 1.7) * sin((p.y + e) * 2.7 + t.x);
        vec3 n = normalize(vNormal + vec3((h0 - hx) * 0.35, 0.0, (h0 - hz) * 0.35));
        // terrain depth under this fragment (shore foam + shallow tint)
        vec2 huv = vWorld.xz / uWorldSize + 0.5;
        float terrainH = uHMin;
        if (huv.x > 0.0 && huv.x < 1.0 && huv.y > 0.0 && huv.y < 1.0) {
          terrainH = mix(uHMin, uHMax, texture2D(uHeightTex, huv).r);
        } else {
          terrainH = -18.0;
        }
        float depth = clamp(uSeaLevel - terrainH, 0.0, 30.0);
        vec3 base = mix(uShallow, uDeep, clamp(depth / 14.0, 0.0, 1.0));
        vec3 v = normalize(uCamPos - vWorld);
        float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
        vec3 r = reflect(-v, n);
        vec3 skyRef = mix(uSky * 0.7, uSky * 1.15, clamp(r.y, 0.0, 1.0));
        vec3 col = mix(base, skyRef, clamp(fres * 1.15, 0.0, 1.0));
        // sun glitter
        float spec = pow(max(dot(r, normalize(uSunDir)), 0.0), 220.0) * 2.2;
        spec += pow(max(dot(r, normalize(uSunDir)), 0.0), 24.0) * 0.18;
        col += uSunColor * spec;
        // foam: shoreline + crests + storm whitecaps
        float shore = smoothstep(2.6, 0.15, depth);
        float lap = 0.5 + 0.5 * sin(uTime * 1.4 - depth * 2.2 + h0 * 2.0);
        float crestFoam = smoothstep(0.55 + uStorm * 0.4, 1.6 + uStorm * 1.2, vCrest + h0 * 0.35);
        float foam = clamp(shore * (0.35 + 0.65 * lap) + crestFoam, 0.0, 1.0);
        foam *= 0.75 + 0.25 * sin(h0 * 9.0 + uTime * 2.0);
        col = mix(col, vec3(0.9, 0.94, 0.94), clamp(foam, 0.0, 1.0) * 0.9);
        // freeze-over
        col = mix(col, vec3(0.55, 0.68, 0.78), uIce * 0.85);
        // fog
        float dist = length(uCamPos - vWorld);
        float fog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
        col = mix(col, uFogColor, clamp(fog, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

/* ------------------------------------------------------------------ */
/* Sky dome                                                            */
/* ------------------------------------------------------------------ */
export function makeSkyMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uStorm: { value: 0 },
      uFlash: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.3) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_Position.z = gl_Position.w * 0.99999;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uStorm;
      uniform float uFlash;
      uniform vec3 uSunDir;
      varying vec3 vDir;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec3 d = normalize(vDir);
        float up = clamp(d.y, -1.0, 1.0);
        vec3 zen = mix(vec3(0.10, 0.28, 0.55), vec3(0.03, 0.05, 0.09), uStorm);
        vec3 hor = mix(vec3(0.62, 0.74, 0.82), vec3(0.16, 0.2, 0.26), uStorm);
        vec3 col = mix(hor, zen, pow(clamp(up, 0.0, 1.0), 0.6));
        if (up < 0.0) col = mix(hor, vec3(0.05, 0.08, 0.1), clamp(-up * 3.0, 0.0, 1.0));
        // sun
        float s = max(dot(d, normalize(uSunDir)), 0.0);
        vec3 sunTint = mix(vec3(1.0, 0.85, 0.65), vec3(0.5, 0.55, 0.6), uStorm);
        col += sunTint * (pow(s, 900.0) * 4.0 + pow(s, 18.0) * 0.25) * (1.0 - uStorm * 0.75);
        // clouds
        vec2 cuv = d.xz / max(d.y + 0.25, 0.08);
        float cl = 0.0;
        cl += sin(cuv.x * 1.3 + uTime * 0.05) * sin(cuv.y * 1.7 - uTime * 0.03);
        cl += 0.5 * sin(cuv.x * 3.1 - uTime * 0.07 + cuv.y * 2.2);
        cl += 0.25 * sin(cuv.x * 6.7 + uTime * 0.11) * sin(cuv.y * 5.3 - uTime * 0.06);
        cl = cl * 0.5 + 0.5;
        float cover = smoothstep(1.0 - 0.25 - uStorm * 0.55, 1.15, cl);
        vec3 cloudCol = mix(vec3(0.95, 0.96, 0.98), vec3(0.12, 0.14, 0.18), uStorm);
        float horiz = smoothstep(0.0, 0.25, up);
        col = mix(col, cloudCol, cover * horiz * 0.85);
        // stars near zenith
        vec2 sp = floor(d.xz / max(d.y, 0.2) * 90.0);
        float star = step(0.992, hash(sp)) * smoothstep(0.25, 0.8, up);
        col += vec3(0.8, 0.9, 1.0) * star * (0.35 + uStorm * 0.4);
        // lightning wash
        col += vec3(0.75, 0.82, 1.0) * uFlash * (0.35 + cover * 0.65);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
}

/* ------------------------------------------------------------------ */
/* Portal disc                                                         */
/* ------------------------------------------------------------------ */
export function makePortalMaterial(hue: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uHue: { value: hue },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uHue;
      varying vec2 vUv;
      vec3 hsv(float h, float s, float v) {
        vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
        return v * mix(vec3(1.0), k, s);
      }
      void main() {
        vec2 c = vUv - 0.5;
        float r = length(c) * 2.0;
        float a = atan(c.y, c.x);
        float swirl = sin(a * 3.0 - uTime * 3.0 + r * 9.0) * 0.5 + 0.5;
        float bands = sin(a * 7.0 + uTime * 5.0 - r * 14.0) * 0.5 + 0.5;
        vec3 col = hsv(uHue + r * 0.12 + swirl * 0.05, 0.9, 0.25 + swirl * 0.9 + bands * 0.35);
        col += hsv(uHue, 0.4, 1.0) * smoothstep(0.75, 1.0, r) * 1.6;
        float alpha = smoothstep(1.0, 0.92, r) * 0.92;
        // dark throat in the middle
        col *= smoothstep(0.0, 0.35, r) * 0.85 + 0.15;
        gl_FragColor = vec4(col * 1.6, alpha);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

/* ------------------------------------------------------------------ */
/* Black hole accretion disk                                           */
/* ------------------------------------------------------------------ */
export function makeDiskMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        vec2 c = vUv - 0.5;
        float r = length(c) * 2.0;
        float a = atan(c.y, c.x);
        float inner = 0.28;
        float band = smoothstep(inner, inner + 0.12, r) * smoothstep(1.0, 0.55, r);
        float streaks = 0.5 + 0.5 * sin(a * 9.0 - uTime * (6.0 / (0.35 + r)) + sin(a * 23.0 + uTime * 2.0) * 0.6);
        float doppler = 0.55 + 0.45 * cos(a + 0.6); // one side brighter (beaming)
        vec3 hot = vec3(1.0, 0.75, 0.42);
        vec3 edge = vec3(0.9, 0.25, 0.08);
        vec3 col = mix(hot, edge, smoothstep(inner, 1.0, r));
        col *= (0.35 + streaks * 0.9) * doppler * 2.4;
        col += vec3(0.4, 0.5, 1.0) * pow(smoothstep(0.5, 1.0, doppler) * (1.0 - r), 2.0);
        float alpha = band * (0.55 + streaks * 0.45);
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/* ------------------------------------------------------------------ */
/* Whirlpool funnel                                                    */
/* ------------------------------------------------------------------ */
export function makeFunnelMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uStrength: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uStrength;
      varying vec2 vUv;
      void main() {
        float spiral = sin(vUv.x * 28.0 - uTime * 7.0 * uStrength + vUv.y * 10.0) * 0.5 + 0.5;
        float bands = sin(vUv.x * 12.0 + uTime * 3.0 - vUv.y * 22.0) * 0.5 + 0.5;
        vec3 col = mix(vec3(0.25, 0.55, 0.65), vec3(0.9, 0.97, 0.98), spiral * 0.5 + bands * 0.3);
        float alpha = (0.25 + spiral * 0.45) * smoothstep(0.0, 0.15, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
        gl_FragColor = vec4(col, alpha * 0.85);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

/* ------------------------------------------------------------------ */
/* Final composite: gravitational lensing + HDR grade                  */
/* ------------------------------------------------------------------ */
export function makeCompositeMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null as THREE.Texture | null },
      uTime: { value: 0 },
      uLens: { value: [new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0)] },
      uLensOn: { value: 1 },
      uUnderwater: { value: 0 },
      uFlash: { value: 0 },
      uVignette: { value: 0.32 },
      uGrain: { value: 0.05 },
      uAspect: { value: 1.7 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float uTime;
      uniform vec4 uLens[3];
      uniform float uLensOn;
      uniform float uUnderwater;
      uniform float uFlash;
      uniform float uVignette;
      uniform float uGrain;
      uniform float uAspect;
      varying vec2 vUv;
      vec3 aces(vec3 x) {
        return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
      }
      void main() {
        vec2 uv = vUv;
        // gravitational lensing: bend sample coords around each mass
        for (int i = 0; i < 3; i++) {
          vec4 L = uLens[i];
          if (L.w > 0.0001) {
            vec2 d = (uv - L.xy) * vec2(uAspect, 1.0);
            float r = max(length(d), 1e-4);
            float bend = L.w * (L.z * L.z) / (r * r + L.z * L.z * 0.12);
            bend = min(bend, 0.45);
            uv -= (d / r) * bend / vec2(uAspect, 1.0) * uLensOn;
          }
        }
        // underwater wobble
        uv += uUnderwater * vec2(
          sin(uv.y * 40.0 + uTime * 3.0) * 0.004,
          cos(uv.x * 34.0 - uTime * 2.2) * 0.004
        );
        vec3 col = texture2D(tDiffuse, clamp(uv, 0.001, 0.999)).rgb;
        // underwater grade
        vec3 water = col * vec3(0.25, 0.65, 0.7);
        float depthFog = uUnderwater * 0.55;
        col = mix(col, water * (1.0 - depthFog) + vec3(0.02, 0.12, 0.14) * depthFog, uUnderwater);
        col += vec3(0.75, 0.82, 1.0) * uFlash * 0.35;
        // HDR grade
        col = aces(col * 1.12);
        col = pow(max(col, 0.0), vec3(1.0 / 2.2));
        // vignette + grain
        vec2 vc = vUv - 0.5;
        col *= 1.0 - uVignette * dot(vc, vc) * 2.2;
        float g = fract(sin(dot(vUv * (uTime + 13.0), vec2(12.9898, 78.233))) * 43758.5453);
        col += (g - 0.5) * uGrain;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
}
