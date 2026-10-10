import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Engine } from '@babylonjs/core/Engines/engine';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';

// Night sky layer: twinkling stars, a Milky Way band, animated aurora curtains and
// periodic shooting stars. Drawn additively on a dome that follows the camera.
const VERTEX = `precision highp float;
attribute vec3 position;
uniform mat4 worldViewProjection;
varying vec3 vDir;
void main(){vDir=position;gl_Position=worldViewProjection*vec4(position,1.);}`;

const FRAGMENT = `precision highp float;
varying vec3 vDir;
uniform float uTime;
uniform float uStars;
uniform float uAurora;
uniform float uShoot;
uniform vec3 uAur1;
uniform vec3 uAur2;

float h1(float n){return fract(sin(n)*43758.5453123);}
float h3(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float n3(vec3 p){
  vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  float a=mix(mix(h3(i),h3(i+vec3(1.,0.,0.)),f.x),mix(h3(i+vec3(0.,1.,0.)),h3(i+vec3(1.,1.,0.)),f.x),f.y);
  float b=mix(mix(h3(i+vec3(0.,0.,1.)),h3(i+vec3(1.,0.,1.)),f.x),mix(h3(i+vec3(0.,1.,1.)),h3(i+vec3(1.,1.,1.)),f.x),f.y);
  return mix(a,b,f.z);
}
float fbm(vec3 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*n3(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=.5;}return s;}

vec3 stars(vec3 d){
  vec3 col=vec3(0.);
  for(int L=0;L<2;L++){
    float N=L==0?120.:210.;
    vec3 p=d*N;
    vec3 c=floor(p);
    vec3 f=p-c-.5;
    float r=h3(c+float(L)*31.7);
    if(r>.9){
      vec3 j=vec3(h3(c+1.1),h3(c+2.3),h3(c+3.7))-.5;
      float dist=length(f-j*.6);
      float size=mix(.12,.22,h3(c+4.9));
      float core=1.-smoothstep(size*.2,size,dist);
      float tw=.65+.35*sin(uTime*(1.2+3.*h3(c+5.3))+r*400.);
      vec3 tint=mix(vec3(.72,.82,1.),vec3(1.,.93,.8),h3(c+6.1));
      col+=tint*core*tw*(.7+.6*h3(c+7.2));
    }
  }
  return col;
}

float milky(vec3 d){
  float band=exp(-pow(dot(d,normalize(vec3(.35,.85,.4))),2.)*18.);
  return band*(.35+.65*fbm(d*5.));
}

vec3 aurora(vec3 d){
  if(d.y<.015) return vec3(0.);
  float t=uTime*.07;
  float w=fbm(vec3(d.x*2.2,d.z*2.2,t));
  float curtainY=.26+.10*sin(d.x*3.1+d.z*2.3+t*4.)+.10*(w-.5);
  float band=exp(-pow((d.y-curtainY)*6.5,2.));
  float streak=pow(n3(vec3(d.x*46.+t*9.,d.z*46.,d.y*3.)),1.6);
  float shimmer=.6+.4*n3(vec3(d.x*12.,d.z*12.,t*30.));
  float fade=smoothstep(.015,.1,d.y)*(1.-smoothstep(.55,.9,d.y));
  vec3 col=mix(uAur1,uAur2,smoothstep(.22,.5,d.y+(w-.5)*.25));
  return col*band*(.25+.95*streak)*shimmer*fade*uAurora*2.1;
}

vec3 shooting(vec3 d){
  float period=8.;
  float slot=floor(uTime/period);
  float lt=uTime-slot*period;
  float r0=h1(slot*12.9898+1.);
  float r1=h1(slot*78.233+2.);
  float r2=h1(slot*37.719+3.);
  float dur=1.1;
  if(r0<.4||lt>dur+.5) return vec3(0.);
  float az=r1*6.2831853;
  float el=.4+.35*r2;
  vec3 start=normalize(vec3(cos(az)*cos(el),sin(el),sin(az)*cos(el)));
  vec3 side=normalize(cross(start,vec3(0.,1.,0.)));
  vec3 endp=normalize(start+side*.45-vec3(0.,.2,0.));
  float s=clamp(lt/dur,0.,1.);
  vec3 head=normalize(mix(start,endp,s));
  vec3 tail=normalize(mix(start,endp,max(0.,s-.25)));
  vec3 seg=head-tail;
  float L2=max(dot(seg,seg),1e-6);
  float t=clamp(dot(d-tail,seg)/L2,0.,1.);
  float dist=length(d-(tail+seg*t));
  float core=exp(-pow(dist/.0035,2.));
  float glow=exp(-dist/.02)*.35;
  float bright=mix(.15,1.,t);
  float fade=smoothstep(0.,.08,lt)*(1.-smoothstep(dur,dur+.5,lt));
  return vec3(.85,.93,1.)*(core+glow)*bright*fade*uShoot*1.6;
}

void main(){
  vec3 d=normalize(vDir);
  float horizon=smoothstep(0.,.22,d.y);
  vec3 col=stars(d)*uStars*horizon;
  col+=vec3(.16,.2,.3)*milky(d)*uStars*horizon*.9;
  col+=aurora(d);
  col+=shooting(d)*horizon;
  gl_FragColor=vec4(col,1.);
}`;

export interface NightSkyState {
  stars: number;
  aurora: number;
  shooting: number;
  aur1: Color3;
  aur2: Color3;
  reducedMotion: boolean;
}

export class NightSky {
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
  private clock = 0;

  constructor(scene: Scene) {
    this.material = new ShaderMaterial('night-sky-stars-aurora', scene, { vertexSource: VERTEX, fragmentSource: FRAGMENT }, {
      attributes: ['position'],
      uniforms: ['worldViewProjection', 'uTime', 'uStars', 'uAurora', 'uShoot', 'uAur1', 'uAur2'],
      needAlphaBlending: true,
    });
    this.material.alphaMode = Engine.ALPHA_ADD;
    this.material.disableDepthWrite = true;
    this.material.backFaceCulling = false;
    this.mesh = MeshBuilder.CreateSphere('night-sky-stars-aurora-dome', { diameter: 1200, segments: 32, sideOrientation: Mesh.BACKSIDE }, scene);
    this.mesh.material = this.material;
    this.mesh.isPickable = false;
    this.mesh.applyFog = false;
    this.mesh.setEnabled(false);
  }

  update(dt: number, position: Vector3, state: NightSkyState) {
    this.clock += state.reducedMotion ? dt * 0.25 : dt;
    const visible = state.stars + state.aurora + state.shooting > 0.001;
    this.mesh.setEnabled(visible);
    if (!visible) return;
    this.mesh.position.copyFrom(position);
    const m = this.material;
    m.setFloat('uTime', this.clock);
    m.setFloat('uStars', state.stars);
    m.setFloat('uAurora', state.aurora);
    m.setFloat('uShoot', state.shooting);
    m.setColor3('uAur1', state.aur1);
    m.setColor3('uAur2', state.aur2);
  }

  dispose() {
    this.mesh.dispose();
    this.material.dispose();
  }
}
