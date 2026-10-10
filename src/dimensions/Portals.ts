import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { MirrorTexture } from '@babylonjs/core/Materials/Textures/mirrorTexture';
import { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Plane } from '@babylonjs/core/Maths/math.plane';
import { Scene } from '@babylonjs/core/scene';
import type { VoxelWorld } from '../world/World';
import { generateChunk, surfaceHeight } from '../world/generator';
import { meshChunk } from '../world/mesher';
import { createBlockMaterial } from '../blocks/textures';
import { CONTENT as B, block } from '../blocks/registry';
import { DIMENSIONS, type DimensionId, type Settings, type Target, type WorldSave } from '../core/types';
import type { GameAudio } from '../audio/Audio';
import { advanceResonance, NOTE_NAMES } from './portalRules';
import { NOISE_GLSL } from '../rendering/SkyAtmosphere';

const vertex=`precision highp float;attribute vec3 position;attribute vec2 uv;uniform mat4 worldViewProjection;varying vec2 vUV;void main(){vUV=uv;gl_Position=worldViewProjection*vec4(position,1.);}`;
const fragment=`precision highp float;varying vec2 vUV;uniform sampler2D otherworld;uniform float time;uniform float opening;uniform vec3 tint;${NOISE_GLSL}
void main(){vec2 p=vUV-.5;float border=max(abs(p.x),abs(p.y));float ripple=fb(vec3(floor(vUV*vec2(32.,48.))*.21,time*.28));float aperture=smoothstep(.0,.9,opening);float edge=.48*aperture+sin(vUV.y*39.+time*2.)*.015;if(abs(p.x)>edge)discard;vec2 uv=vUV+vec2(sin(vUV.y*24.+time),cos(vUV.x*18.-time))*.007;vec3 world=texture2D(otherworld,uv).rgb;float rim=pow(clamp(border/.5,0.,1.),14.);vec3 magic=tint*(.12+rim*1.8+step(.76,ripple)*.2);vec3 color=mix(world,world*tint*1.5,.2)+magic;float lattice=step(.94,fract(vUV.y*70.-time*.14))*.055;gl_FragColor=vec4(color+lattice,.93);}`;
interface PortalView { mesh: Mesh; material: ShaderMaterial; age: number; id: number }

class OtherworldWindow {
  readonly scene: Scene;
  readonly texture: RenderTargetTexture;
  readonly camera: FreeCamera;
  private disposed=false;
  private built=0;
  private material;
  constructor(parent:Scene,private dimension:DimensionId,private world:VoxelWorld){
    this.scene=new Scene(parent.getEngine());this.scene.clearColor=Color4.FromHexString(`${DIMENSIONS[dimension].sky}ff`);this.scene.fogMode=Scene.FOGMODE_EXP2;this.scene.fogColor=Color3.FromHexString(DIMENSIONS[dimension].fog);this.scene.fogDensity=.018;
    this.camera=new FreeCamera('rift-destination-camera',new Vector3(3,48,-4),this.scene);this.camera.minZ=.1;this.camera.maxZ=220;this.scene.activeCamera=this.camera;
    new HemisphericLight('rift-window-light',Vector3.Up(),this.scene).intensity=1.5;
    this.material=createBlockMaterial(this.scene);this.material.environmentIntensity=0;
    this.texture=new RenderTargetTexture(`live-window-${dimension}`,256,this.scene,false);this.texture.activeCamera=this.camera;this.texture.renderList=[];this.texture.clearColor=this.scene.clearColor;
    this.buildNext();
  }
  private buildNext(){
    if(this.disposed||this.built>=9)return;
    const i=this.built++,cx=i%3-1,cz=Math.floor(i/3)-1,cfg={...this.world.config,dimension:this.dimension};
    const arrays=meshChunk(generateChunk(cx,cz,cfg,this.world.save.edits[this.dimension]||{}).padded),mesh=new Mesh(`window-chunk-${i}`,this.scene),data=new VertexData();
    data.positions=arrays.positions;data.normals=arrays.normals;data.uvs=arrays.uvs;data.colors=arrays.colors;data.indices=arrays.indices;
    if(arrays.positions.length)data.applyToMesh(mesh);mesh.position.set(cx*16,0,cz*16);mesh.material=this.material;mesh.freezeWorldMatrix();this.texture.renderList!.push(mesh);
    this.camera.position.y=surfaceHeight(3,-4,cfg)+3.5;
    setTimeout(()=>this.buildNext(),75);
  }
  render(yaw:number,pitch:number){if(this.disposed||!this.built)return;this.camera.rotation.set(Math.max(-.5,Math.min(.5,pitch)),yaw,0);this.scene.updateTransformMatrix();this.texture.render(true);}
  dispose(){this.disposed=true;this.texture.dispose();this.scene.dispose();}
}

export class PortalSystem {
  private views=new Map<string,PortalView>();
  private mirrors=new Map<string,{mesh:Mesh;texture:MirrorTexture;material:StandardMaterial}>();
  private windows=new Map<DimensionId,OtherworldWindow>();
  private clock=0;
  private scan=0;
  private previewClock=0;
  private signature='';
  constructor(private scene:Scene,private world:VoxelWorld,private save:WorldSave,private audio:GameAudio,private toast:(text:string)=>void){}
  private destination(id:number):DimensionId{return id===B.SIFT_PORTAL?(this.save.dimension==='sift'?'overworld':'sift'):DIMENSIONS[this.save.dimension].next;}
  private buildViews(){
    const markers=new Map<string,{x:number;y:number;z:number;id:number}>();const mirrorKeys=new Set<string>();
    for(const chunk of this.world.chunks.values())for(const p of chunk.specials||[]){if(block(p.id).portal)markers.set(`${p.x},${p.y},${p.z}`,p);else if(p.id===B.MIRROR){const key=`${p.x},${p.y},${p.z}`;mirrorKeys.add(key);if(!this.mirrors.has(key))this.addMirror(key,p.x,p.y,p.z);}}
    const used=new Set<string>(),keys=new Set<string>();
    for(const [key,p] of markers){
      if(used.has(key))continue;let minX=p.x,maxX=p.x,minY=p.y,maxY=p.y;const queue=[p];used.add(key);
      for(let i=0;i<queue.length&&i<200;i++){const q=queue[i];minX=Math.min(minX,q.x);maxX=Math.max(maxX,q.x);minY=Math.min(minY,q.y);maxY=Math.max(maxY,q.y);for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const k=`${q.x+dx},${q.y+dy},${q.z}`,next=markers.get(k);if(next&&next.id===p.id&&!used.has(k)){queue.push(next);used.add(k);}}}
      if(this.world.isLoaded(minX-1,p.z)&&this.world.isLoaded(maxX+1,p.z)){
        const isFrame=(x:number,y:number)=>[25,B.ANCIENT_FRAME,B.END_FRAME,B.RIFT_STONE].includes(this.world.getBlock(x,y,p.z));
        let framed=queue.length===(maxX-minX+1)*(maxY-minY+1);
        for(let x=minX-1;x<=maxX+1;x++)if(!isFrame(x,minY-1)||!isFrame(x,maxY+1))framed=false;
        for(let y=minY;y<=maxY;y++)if(!isFrame(minX-1,y)||!isFrame(maxX+1,y))framed=false;
        if(!framed){for(const q of queue)this.world.setBlock(q.x,q.y,q.z,0);continue;}
      }
      const portalKey=`${minX},${minY},${p.z}:${maxX},${maxY}:${p.id}`;keys.add(portalKey);if(this.views.has(portalKey))continue;
      const dest=this.destination(p.id);let window=this.windows.get(dest);if(!window){window=new OtherworldWindow(this.scene,dest,this.world);this.windows.set(dest,window);}
      const material=new ShaderMaterial(`rift-shader-${portalKey}`,this.scene,{vertexSource:vertex,fragmentSource:fragment},{attributes:['position','uv'],uniforms:['worldViewProjection','time','opening','tint'],samplers:['otherworld'],needAlphaBlending:true});material.backFaceCulling=false;material.setTexture('otherworld',window.texture);material.setColor3('tint',Color3.FromHexString(p.id===B.SIFT_PORTAL?'#6edaca':'#ba8af0'));material.setFloat('opening',0);material.setFloat('time',this.clock);
      const mesh=MeshBuilder.CreatePlane('framed-dimensional-rift',{width:maxX-minX+1,height:maxY-minY+1,sideOrientation:Mesh.DOUBLESIDE},this.scene);mesh.position.set((minX+maxX+1)/2,(minY+maxY+1)/2,p.z+.5);mesh.material=material;mesh.isPickable=false;this.views.set(portalKey,{mesh,material,age:0,id:p.id});
    }
    for(const [key,v]of this.views)if(!keys.has(key)){v.mesh.dispose();v.material.dispose();this.views.delete(key);}
    for(const [key,v]of this.mirrors)if(!mirrorKeys.has(key)){v.mesh.dispose();v.texture.dispose();v.material.dispose();this.mirrors.delete(key);}
  }
  private addMirror(key:string,x:number,y:number,z:number){
    if(this.mirrors.size>=8)return;
    const texture=new MirrorTexture(`silver-mirror-${key}`,256,this.scene,true);texture.mirrorPlane=new Plane(0,0,-1,z-.006);texture.level=.95;texture.refreshRate=2;
    const material=new StandardMaterial('polished-mirror',this.scene);material.diffuseColor=new Color3(.06,.08,.09);material.specularColor=Color3.White();material.reflectionTexture=texture;
    const mesh=MeshBuilder.CreatePlane('mirror-surface',{width:.9,height:.9,sideOrientation:Mesh.DOUBLESIDE},this.scene);mesh.position.set(x+.5,y+.5,z-.008);mesh.material=material;mesh.isPickable=false;
    this.mirrors.set(key,{mesh,texture,material});
  }
  update(dt:number,yaw:number,pitch:number,settings:Settings){
    this.clock+=dt;this.scan+=dt;this.previewClock+=dt;
    if(this.scan>.5){this.scan=0;const sig=[...this.world.chunks.entries()].map(([k,c])=>`${k}:${c.revision}`).join('|')+Object.keys(this.save.edits[this.save.dimension]||{}).length;if(sig!==this.signature){this.signature=sig;this.buildViews();}}
    for(const v of this.views.values()){v.age+=dt;v.material.setFloat('time',this.clock);v.material.setFloat('opening',Math.min(1,v.age/1.4));}
    if(this.previewClock>(settings.quality==='cinematic'?.12:.3)&&this.views.size){this.previewClock=0;for(const window of this.windows.values())window.render(yaw,pitch);}
    for(const mirror of this.mirrors.values()){mirror.texture.refreshRate=settings.reflections?2:0;mirror.texture.renderList=this.scene.meshes.filter(m=>m!==mirror.mesh&&!m.name.includes('mirror-surface')&&!m.name.includes('rift')&&!m.name.startsWith('item-')&&!m.name.includes('first-person'));}
  }
  note(target:Target){
    const note=block(target.id).note;if(note===undefined)return false;
    this.audio.note(note);const next=advanceResonance(this.save.noteProgress||0,note);this.save.noteProgress=next.progress;
    if(next.complete){
      if(this.save.dimension==='overworld'&&Math.hypot(target.x-42,target.z+28)<18){
        for(let x=39;x<=45;x++)for(let y=17;y<=23;y++)if((x===39||x===45||y===17||y===23)&&this.world.getBlock(x,y,-24)!==B.ANCIENT_FRAME){this.toast('The ancient frame is damaged. Restore it before playing the melody.');return true;}
        for(let x=40;x<=44;x++)for(let y=18;y<=22;y++)this.world.setBlock(x,y,-24,B.SIFT_PORTAL);
        this.save.portalKeys||=[];if(!this.save.portalKeys.includes('ancient-city'))this.save.portalKeys.push('ancient-city');this.world.unlockSift();this.signature='';this.audio.play('portal');this.toast('The ancient city answers. The Sift is open.');
      }else this.toast('The melody is right. Play it at the ancient city gate.');
    }else this.toast(`${NOTE_NAMES[note]}  |  Resonance ${next.progress}/5${next.progress===0?' - the melody resets.':''}`);
    return true;
  }
  createFrame(x:number,y:number,z:number,id=26){
    for(let dx=-2;dx<=2;dx++)for(let dy=0;dy<=5;dy++)if(!this.world.isLoaded(x+dx,z)||this.world.getBlock(x+dx,y+dy,z)!==0||y+dy>=127)return false;
    for(let dx=-2;dx<=2;dx++)for(let dy=0;dy<=5;dy++)this.world.setBlock(x+dx,y+dy,z,Math.abs(dx)===2||dy===0||dy===5?id===B.SIFT_PORTAL?B.ANCIENT_FRAME:25:id);
    this.signature='';this.audio.play('portal');return true;
  }
  activateFrame(target:Target){
    if(![25,B.ANCIENT_FRAME,B.END_FRAME].includes(target.id))return false;
    if(target.id===B.ANCIENT_FRAME){this.toast('Five notes awaken the old gate: C, G, E, B, C.');return true;}
    for(let ox=-4;ox<=0;ox++)for(let oy=-5;oy<=0;oy++){
      const x=target.x+ox,y=target.y+oy,z=target.z;let valid=true;
      for(let dx=0;dx<5&&valid;dx++)for(let dy=0;dy<6;dy++){const boundary=dx===0||dx===4||dy===0||dy===5,id=this.world.getBlock(x+dx,y+dy,z);if(boundary?id!==target.id:id!==0&&!block(id).portal){valid=false;break;}}
      if(valid){for(let dx=1;dx<4;dx++)for(let dy=1;dy<5;dy++)this.world.setBlock(x+dx,y+dy,z,26);this.signature='';this.audio.play('portal');return true;}
    }
    this.toast('Build a 5-wide, 6-high frame, then ignite it.');return true;
  }
  clear(){for(const v of this.views.values()){v.mesh.dispose();v.material.dispose();}this.views.clear();for(const v of this.mirrors.values()){v.mesh.dispose();v.texture.dispose();v.material.dispose();}this.mirrors.clear();for(const w of this.windows.values())w.dispose();this.windows.clear();this.signature='';}
  dispose(){this.clear();}
}