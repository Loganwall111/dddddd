import { PostProcess } from '@babylonjs/core/PostProcesses/postProcess';
import { Effect } from '@babylonjs/core/Materials/effect';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Vector2, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import type { Scene } from '@babylonjs/core/scene';
import type { DepthRenderer } from '@babylonjs/core/Rendering/depthRenderer';

// Screen-space volumetric light scattering. For every pixel we march toward the sun's
// screen position and accumulate only samples whose depth is the far background (sky).
// Terrain, trees and buildings therefore block the rays and cast real shadows into them.
const FRAGMENT = `precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform sampler2D depthSampler;
uniform vec2 sunUV;
uniform float intensity;
uniform float decay;
uniform float density;
uniform vec3 tint;
void main(){
  vec3 base=texture2D(textureSampler,vUV).rgb;
  vec2 dStep=(vUV-sunUV)*density/48.;
  vec2 tc=vUV;
  float illum=1.;
  float acc=0.;
  for(int i=0;i<48;i++){
    tc-=dStep;
    float sky=step(.9995,texture2D(depthSampler,tc).r);
    acc+=sky*illum;
    illum*=decay;
  }
  float nearSun=exp(-length(vUV-sunUV)*1.6);
  float rays=acc/48.*nearSun*1.25;
  gl_FragColor=vec4(base+tint*rays*intensity,1.);
}`;
Effect.ShadersStore['aetherGodRaysFragmentShader'] = FRAGMENT;

export class GodRays {
  private pass: PostProcess;
  private attached = false;
  private sunUV = new Vector2(0.5, 0.5);
  private intensity = 0;
  private tint = new Color3(1, 0.86, 0.6);

  constructor(private scene: Scene, private camera: Camera, depth: DepthRenderer) {
    this.pass = new PostProcess('god-rays', 'aetherGodRays', ['sunUV', 'intensity', 'tint', 'decay', 'density'], ['depthSampler'], 0.5, null, Texture.BILINEAR_SAMPLINGMODE, scene.getEngine());
    this.pass.onApply = (effect) => {
      effect.setTexture('depthSampler', depth.getDepthMap());
      effect.setVector2('sunUV', this.sunUV);
      effect.setFloat('intensity', this.intensity);
      effect.setColor3('tint', this.tint);
      effect.setFloat('decay', 0.955);
      effect.setFloat('density', 1.35);
    };
  }

  /** sunWorld: a point far along the sun direction. intensity: 0 disables the pass entirely. */
  update(sunWorld: Vector3, intensity: number, tint: Color3) {
    const engine = this.scene.getEngine();
    const viewport = this.camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
    const p = Vector3.Project(sunWorld, Matrix.Identity(), this.scene.getTransformMatrix(), viewport);
    const inFront = p.z > 0 && p.z < 1;
    this.sunUV.set((p.x - viewport.x) / viewport.width, (p.y - viewport.y) / viewport.height);
    this.intensity = inFront ? intensity : 0;
    this.tint.copyFrom(tint);
    const wanted = this.intensity > 0.002;
    if (wanted && !this.attached) { this.camera.attachPostProcess(this.pass); this.attached = true; }
    if (!wanted && this.attached) { this.camera.detachPostProcess(this.pass); this.attached = false; }
  }

  dispose() {
    if (this.attached) this.camera.detachPostProcess(this.pass);
    this.pass.dispose(this.camera);
  }
}
