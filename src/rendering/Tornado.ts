import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import type { VoxelWorld } from '../world/World';
import type { PlayerController } from '../player/Player';
import type { Settings, Weather } from '../core/types';
import { NOISE_GLSL } from './SkyAtmosphere';

const vertex=`precision highp float;attribute vec3 position;uniform mat4 world;uniform mat4 worldViewProjection;varying vec3 vWorld;void main(){vWorld=(world*vec4(position,1.)).xyz;gl_Position=worldViewProjection*vec4(position,1.);}`;
const fragment=`precision highp float;varying vec3 vWorld;uniform vec3 eye;uniform vec3 center;uniform float time;uniform float strength;${NOISE_GLSL}
void main(){vec3 ray=normalize(vWorld-eye);vec3 origin=eye-center;vec3 inv=1./ray;vec3 t0=(vec3(-23.,0.,-23.)-origin)*inv,t1=(vec3(23.,76.,23.)-origin)*inv;vec3 lo=min(t0,t1),hi=max(t0,t1);float near=max(max(lo.x,lo.y),lo.z),far=min(min(hi.x,hi.y),hi.z);if(far<near)discard;near=max(0.,near);float stride=(far-near)/28.;vec3 color=vec3(0.);float trans=1.;for(int i=0;i<28;i++){vec3 p=origin+ray*(near+(float(i)+.5)*stride);float h=clamp(p.y/76.,0.,1.);vec2 bend=vec2(sin(h*3.+time*.24),cos(h*4.+time*.17))*h*4.;float radius=1.+pow(h,1.65)*14.;vec2 q=p.xz-bend;float r=length(q);float angle=atan(q.y,q.x)+time*2.4+h*13.;float swirl=fb(vec3(cos(angle)*r*.34,p.y*.14-time*.8,sin(angle)*r*.34));float shell=exp(-pow((r-radius)/max(.8,radius*.42),2.));float density=shell*(.3+swirl*.7)*strength*smoothstep(0.,3.,p.y)*(1.-smoothstep(66.,76.,p.y));float a=1.-exp(-density*stride*.23);color+=mix(vec3(.19,.22,.23),vec3(.51,.55,.55),swirl)*a*trans;trans*=1.-a;}gl_FragColor=vec4(color,1.-trans);}`;
export class TornadoSystem{
  private mesh:Mesh|null=null;
  private material:ShaderMaterial|null=null;
  private position=Vector3.Zero();
  private clock=0;
  private life=0;
  private damageClock=0;
  private editClock=0;
  private nextNatural=50;
  onDamage?:(amount:number)=>void;
  onToast?:(message:string)=>void;
  constructor(private scene:Scene,private world:VoxelWorld){}
  summon(player:Vector3){
    if(this.mesh)return false;
    this.position.set(player.x+28,this.world.ground(player.x+28,player.z+24),player.z+24);this.life=100;
    this.material=new ShaderMaterial('volumetric-tornado',this.scene,{vertexSource:vertex,fragmentSource:fragment},{attributes:['position'],uniforms:['world','worldViewProjection','eye','center','time','strength'],needAlphaBlending:true});this.material.backFaceCulling=false;this.material.disableDepthWrite=true;
    this.mesh=MeshBuilder.CreateBox('tornado-volume',{width:46,height:76,depth:46},this.scene);this.mesh.material=this.material;this.mesh.isPickable=false;this.onToast?.('The wind is turning. Find shelter.');return true;
  }
  update(dt:number,weather:Weather,player:PlayerController,settings:Settings){
    this.clock+=dt;if(!settings.tornadoes||this.world.config.dimension!=='overworld'){this.clear();return;}
    if(weather==='storm'&&this.clock>this.nextNatural&&!this.mesh){this.nextNatural=this.clock+260;this.summon(player.position);}
    if(!this.mesh||!this.material)return;
    this.life-=dt;this.damageClock+=dt;this.editClock+=dt;
    this.position.x+=Math.sin(this.clock*.04)*dt*.7;this.position.z+=Math.cos(this.clock*.035)*dt*.6;
    this.position.y=this.world.ground(this.position.x,this.position.z);
    this.mesh.position.copyFrom(this.position).addInPlace(new Vector3(0,38,0));
    this.material.setVector3('eye',player.camera.position);this.material.setVector3('center',this.position);this.material.setFloat('time',this.clock);this.material.setFloat('strength',Math.min(1,(100-this.life)/6,this.life/8));
    const distance=Math.hypot(player.position.x-this.position.x,player.position.z-this.position.z);
    if(distance<14){const pull=Math.max(0,1-distance/14);const nx=player.position.x+(this.position.x-player.position.x)*pull*dt*.6,nz=player.position.z+(this.position.z-player.position.z)*pull*dt*.6;if(!player.collides(nx,player.position.y,nz))player.position.set(nx,player.position.y,nz);player.velocity.y=Math.max(player.velocity.y,pull*9);if(this.damageClock>1.8){this.onDamage?.(2);this.damageClock=0;}}
    if(this.editClock>.35){this.editClock=0;const a=this.clock*5,x=Math.floor(this.position.x+Math.sin(a)*3),z=Math.floor(this.position.z+Math.cos(a)*3),y=this.world.ground(x,z)-1;const id=this.world.getBlock(x,y,z);if([1,2,6,7,18,20,39,114,117,123].includes(id)&&Math.random()<.28)this.world.setBlock(x,y,z,0);}
    if(this.life<=0||distance>150)this.clear();
  }
  clear(){this.mesh?.dispose();this.material?.dispose();this.mesh=null;this.material=null;}
  dispose(){this.clear();}
}