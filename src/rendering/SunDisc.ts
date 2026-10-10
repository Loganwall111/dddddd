import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';

// Sun disc with limb darkening, an orange rim, and drifting granulation so it reads as a
// hot body rather than a flat emissive circle.
const VERTEX = `precision highp float;
attribute vec3 position;
attribute vec3 normal;
uniform mat4 world;
uniform mat4 worldViewProjection;
varying vec3 vN;
varying vec3 vW;
void main(){
  vN=normalize((world*vec4(normal,0.)).xyz);
  vW=(world*vec4(position,1.)).xyz;
  gl_Position=worldViewProjection*vec4(position,1.);
}`;

const FRAGMENT = `precision highp float;
varying vec3 vN;
varying vec3 vW;
uniform vec3 eye;
uniform vec3 uColor;
uniform float uTime;
uniform float uGlow;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y);}
void main(){
  vec3 n=normalize(vN);
  vec3 v=normalize(eye-vW);
  float mu=clamp(dot(n,v),0.,1.);
  float limb=.35+.65*pow(mu,.45);
  float gran=n2(n.xz*40.+uTime*.05)*.5+n2(n.xy*80.-uTime*.03)*.25;
  vec3 col=uColor*limb*(.85+.3*gran);
  col=mix(col,vec3(1.,.42,.14),(1.-mu)*.45);
  float rim=pow(1.-mu,3.)*.6;
  gl_FragColor=vec4(col*(1.+uGlow)+vec3(1.,.6,.3)*rim*uGlow,1.);
}`;

export class SunDiscMaterial {
  readonly material: ShaderMaterial;
  constructor(scene: Scene) {
    this.material = new ShaderMaterial('sun-disc-shader', scene, { vertexSource: VERTEX, fragmentSource: FRAGMENT }, {
      attributes: ['position', 'normal'],
      uniforms: ['world', 'worldViewProjection', 'eye', 'uColor', 'uTime', 'uGlow'],
    });
    this.material.backFaceCulling = false;
  }
  update(color: Color3, time: number, eye: Vector3, glow = 0.6) {
    this.material.setColor3('uColor', color);
    this.material.setFloat('uTime', time);
    this.material.setVector3('eye', eye);
    this.material.setFloat('uGlow', glow);
  }
  dispose() { this.material.dispose(); }
}
