import { PostProcess } from '@babylonjs/core/PostProcesses/postProcess';
import { Effect } from '@babylonjs/core/Materials/effect';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import type { Scene } from '@babylonjs/core/scene';
import { DIMENSIONS, type DimensionId } from '../core/types';

// Underwater view: Beer-Lambert absorption, projected seabed caustics, Snell's window
// (the bright cone of sky visible above you, edge at the 48.6 degree critical angle) and
// total internal reflection of the seabed everywhere outside that cone.
const FRAGMENT = `precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform sampler2D depthSampler;
uniform float time;
uniform float immersion;
uniform float farPlane;
uniform float toxic;
uniform float tanX;
uniform float tanY;
uniform vec3 camFwd;
uniform vec3 camRight;
uniform vec3 camUp;
uniform vec3 camPos;
uniform vec3 sunDirW;

vec3 rayDir(vec2 uv){return normalize(camFwd+camRight*((uv.x-.5)*2.*tanX)+camUp*((.5-uv.y)*2.*tanY));}
vec2 dirToUV(vec3 d){float f=max(dot(d,camFwd),1e-3);float x=dot(d,camRight)/(f*tanX);float y=dot(d,camUp)/(f*tanY);return vec2(.5+.5*x,.5-.5*y);}
float caustic(vec2 p,float t){
  float c=0.;
  vec2 q=p;
  for(int i=0;i<3;i++){
    q+=vec2(sin(q.y*1.7+t*.9),cos(q.x*1.5-t*.8))*.55;
    c+=1./(1.+10.*abs(sin(q.x*1.1+q.y*.9+t*.4)*cos(q.y*1.3-q.x*.7+t*.5)));
  }
  return pow(c/3.,2.4);
}
void main(){
  vec2 uv=vUV;
  uv+=vec2(sin(uv.y*23.+time*1.7),cos(uv.x*19.+time*1.3))*.0018*immersion;
  vec3 color=texture2D(textureSampler,uv).rgb;
  float dist=texture2D(depthSampler,uv).r*farPlane;
  vec3 d=rayDir(uv);

  float dd=min(dist,60.);
  vec3 absorption=exp(-dd*vec3(.06,.022,.016)*immersion);
  vec3 water=mix(vec3(.012,.2,.27),vec3(.19,.12,.28),toxic);
  color=color*absorption+water*(1.-absorption);

  // Caustics projected onto the seabed (looking downward).
  float bottom=smoothstep(.05,-.25,d.y);
  vec3 groundPos=camPos+d*min(dist,80.);
  float cau=caustic(groundPos.xz*.22,time*.8);
  color+=vec3(.42,.92,.86)*cau*bottom*exp(-dist*.035)*.55*immersion;

  // Snell's window: rays steeper than the critical angle leave the water as a bright cone of sky.
  float up=smoothstep(.02,.2,d.y);
  float inWindow=smoothstep(.655,.675,d.y);
  vec3 skyCol=mix(vec3(.55,.82,.92),vec3(.92,.98,1.),smoothstep(.66,1.,d.y));
  skyCol+=vec3(1.,.9,.6)*pow(max(0.,dot(d,sunDirW)),120.)*1.4;
  // Outside the window the surface acts as a mirror: reflect the lit water below.
  // Mirror about the screen row where the window edge sits, so the reflected seabed starts
  // right at the surface line and gets deeper toward the bottom of the frame.
  float edgeY=dirToUV(normalize(vec3(d.x,.665,d.z))).y;
  vec2 mUV=vec2(uv.x,clamp(2.*edgeY-uv.y,0.,1.));
  vec3 mirrored=texture2D(textureSampler,mUV).rgb;
  vec3 tirCol=mirrored*vec3(.62,.9,.95)*.9+water*.12;
  color=mix(color,tirCol,up*(1.-inWindow)*.85*immersion);
  color=mix(color,skyCol,up*inWindow*immersion);
  float ring=smoothstep(.02,0.,abs(d.y-.665))*.5;
  color+=ring*vec3(.7,.95,1.)*immersion*up;

  float vignette=1.-smoothstep(.18,.9,length(vUV-.5));
  color*=mix(1.,.73+.27*vignette,immersion);
  gl_FragColor=vec4(color,1.);
}`;
Effect.ShadersStore['aetherUnderwaterFragmentShader'] = FRAGMENT;

const UNIFORMS = ['time', 'immersion', 'farPlane', 'toxic', 'tanX', 'tanY', 'camFwd', 'camRight', 'camUp', 'camPos', 'sunDirW'];

export class Underwater {
  private pass: PostProcess;
  private attached = false;
  private clock = 0;
  private immersion = 0;
  private dimension: DimensionId = 'overworld';
  private sunDirW = new Vector3(0, 1, 0);

  constructor(private scene: Scene, private camera: Camera, depthMap: () => BaseTexture | null) {
    this.pass = new PostProcess('underwater-absorption', 'aetherUnderwater', UNIFORMS, ['depthSampler'], 1, null, Texture.BILINEAR_SAMPLINGMODE, scene.getEngine());
    this.pass.onApply = (effect) => {
      const depth = depthMap();
      if (depth) effect.setTexture('depthSampler', depth);
      const engine = this.scene.getEngine();
      const tanY = Math.tan(camera.fov / 2);
      effect.setFloat('time', this.clock);
      effect.setFloat('immersion', this.immersion);
      effect.setFloat('farPlane', camera.maxZ);
      effect.setFloat('toxic', this.dimension === 'sift' ? 1 : 0);
      effect.setFloat('tanY', tanY);
      effect.setFloat('tanX', tanY * engine.getAspectRatio(camera));
      effect.setVector3('camFwd', camera.getDirection(Vector3.Forward()));
      effect.setVector3('camRight', camera.getDirection(Vector3.Right()));
      effect.setVector3('camUp', camera.getDirection(Vector3.Up()));
      effect.setVector3('camPos', camera.position);
      effect.setVector3('sunDirW', this.sunDirW);
    };
  }

  get immersionLevel() { return this.immersion; }

  /** Unit vector pointing from the scene toward the sun. */
  setSunDirection(direction: Vector3) { this.sunDirW.copyFrom(direction); }

  update(dt: number, dimension: DimensionId, submergedOverride?: boolean) {
    this.clock += dt; this.dimension = dimension;
    const submerged = dimension !== 'nether' && (submergedOverride ?? this.camera.position.y < DIMENSIONS[dimension].water + 0.05);
    this.immersion += (Number(submerged) - this.immersion) * Math.min(1, dt * 7);
    if (submerged && !this.attached) { this.camera.attachPostProcess(this.pass); this.attached = true; }
    if (!submerged && this.attached && this.immersion < 0.01) { this.camera.detachPostProcess(this.pass); this.attached = false; }
  }

  dispose() {
    if (this.attached) this.camera.detachPostProcess(this.pass);
    this.pass.dispose(this.camera);
  }
}
