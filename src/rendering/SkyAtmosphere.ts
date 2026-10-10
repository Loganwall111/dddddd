import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import { DIMENSIONS, type DimensionId, type Season, type Settings, type Weather } from '../core/types';

export const NOISE_GLSL = `
float h3(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float n3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fb(vec3 p){return n3(p)*.57+n3(p*2.03+11.7)*.28+n3(p*4.01-5.4)*.15;}
`;
const vertex = `precision highp float;attribute vec3 position;uniform mat4 world;uniform mat4 worldViewProjection;varying vec3 vWorld;void main(){vWorld=(world*vec4(position,1.)).xyz;gl_Position=worldViewProjection*vec4(position,1.);}`;
const fragment = `precision highp float;varying vec3 vWorld;uniform vec3 eye;uniform vec3 sun;uniform vec3 topColor;uniform vec3 horizonColor;uniform float time;uniform float night;uniform float cover;uniform float cloudSteps;uniform float realm;uniform float rainbow;
${NOISE_GLSL}
vec3 spectrum(float t){return .55+.45*cos(6.28318*(vec3(0.,.33,.67)+t));}
float cloudDensity(vec3 p){float vertical=smoothstep(116.,131.,p.y)*(1.-smoothstep(159.,184.,p.y));vec3 q=p*.019+vec3(time*.009,0.,time*.003);return smoothstep(.42-cover*.1,.7-cover*.16,fb(q)+.24*n3(p*.09+vec3(time*.01,0.,0.)))*vertical;}
void main(){
 vec3 d=normalize(vWorld-eye);float altitude=max(d.y,0.);vec3 col=mix(horizonColor,topColor,pow(altitude,.42));
 float sunDot=max(dot(d,sun),0.);
 col+=vec3(1.,.82,.52)*pow(sunDot,900.)*(1.-night)*1.6;
 col+=vec3(1.,.72,.42)*pow(sunDot,10.)*(1.-night)*.22;
 vec2 polar=vec2(atan(d.z,d.x)*.1591549+.5,asin(clamp(d.y,-1.,1.))*.63662);
 if(realm>2.5){float rings=pow(max(0.,sin(length(d.xz)*48.+sin(polar.x*25.+time*.12)*.6-time*.15)),28.);col+=spectrum(d.y*.8+time*.008)*rings*.17*smoothstep(.3,.9,d.y);col+=vec3(.04,.23,.15)*fb(d*7.+time*.025);}
 if(rainbow>.01&&d.y>0.){vec3 center=normalize(vec3(-sun.x,.03,-sun.z));float arc=acos(clamp(dot(d,center),-1.,1.));float stripe=smoothstep(.63,.65,arc)*(1.-smoothstep(.71,.73,arc));col+=spectrum((arc-.65)*10.)*stripe*rainbow*.32;}

 if(cloudSteps>0.&&realm<1.5&&d.y>.035){float start=max(0.,(116.-eye.y)/d.y),end=max(0.,(184.-eye.y)/d.y);float stride=(end-start)/cloudSteps;float dither=h3(vec3(gl_FragCoord.xy*.7,time));start+=dither*stride*.9;float trans=1.;vec3 light=vec3(0.);for(int i=0;i<32;i++){if(float(i)>=cloudSteps||trans<.03)break;vec3 p=eye+d*(start+(float(i)+.5)*stride);float density=cloudDensity(p);float shade=exp(-cloudDensity(p+sun*12.)*2.5);vec3 tint=mix(vec3(.3,.35,.42),vec3(1.06,1.,.9),shade)*(1.-night*.82);float alpha=1.-exp(-density*min(stride,19.)*.14);light+=tint*alpha*trans;trans*=1.-alpha;}col=col*trans+light;}
 gl_FragColor=vec4(max(col,vec3(.001)),1.);
}`;

export class SkyAtmosphere {
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
  private clock=16;
  private afterRain=0;
  private wasRaining=false;
  constructor(scene: Scene){
    this.material=new ShaderMaterial('aether-atmospheric-scattering',scene,{vertexSource:vertex,fragmentSource:fragment},{attributes:['position'],uniforms:['world','worldViewProjection','eye','sun','topColor','horizonColor','time','night','cover','cloudSteps','realm','rainbow']});
    this.material.backFaceCulling=false;this.material.disableDepthWrite=true;
    this.mesh=MeshBuilder.CreateSphere('volumetric-sky-dome',{diameter:1500,segments:20,sideOrientation:Mesh.BACKSIDE},scene);this.mesh.material=this.material;this.mesh.isPickable=false;this.mesh.infiniteDistance=false;
  }
  update(dt:number,time:number,position:Vector3,sun:Vector3,dimension:DimensionId,weather:Weather,_season:Season,settings:Settings){
    this.clock+=settings.reducedMotion?0:dt;const day=Math.max(0,Math.sin(time*Math.PI*2)),night=1-Math.min(1,day*3);
    const alien=dimension==='nether'||dimension==='end'||dimension==='crystal',sift=dimension==='sift';
    const top=alien||sift?Color3.FromHexString(DIMENSIONS[dimension].sky):Color3.Lerp(new Color3(.012,.022,.064),new Color3(.15,.5,.92),Math.min(1,day*1.8));
    const horizon=alien||sift?Color3.FromHexString(DIMENSIONS[dimension].fog):Color3.Lerp(new Color3(.06,.09,.15),weather==='clear'?new Color3(.68,.85,.9):new Color3(.42,.5,.55),Math.min(1,day*2));
    if(!alien&&!sift&&day>0&&day<.45)horizon.copyFrom(Color3.Lerp(horizon,new Color3(1,.55,.3),.5*(1-day/.45)));
    if(this.wasRaining&&weather==='clear')this.afterRain=75;this.wasRaining=weather!=='clear';this.afterRain=Math.max(0,this.afterRain-dt);
    this.mesh.position.copyFrom(position);const m=this.material;
    m.setVector3('eye',position);m.setVector3('sun',sun);m.setColor3('topColor',top);m.setColor3('horizonColor',horizon);m.setFloat('time',this.clock);
    m.setFloat('night',dimension==='end'?1:sift?.8:night);m.setFloat('cover',weather==='clear'?.3:1);
    m.setFloat('cloudSteps',settings.volumetricClouds&&!alien?(settings.quality==='cinematic'?28:settings.quality==='performance'?10:18):0);
    m.setFloat('realm',sift?3:alien?2:0);m.setFloat('rainbow',!alien&&!sift?Math.min(1,this.afterRain/12)*day:0);
  }
}