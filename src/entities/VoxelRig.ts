import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Scene } from '@babylonjs/core/scene';
import { hash3, seedNumber } from '../world/noise';
import { DEFAULT_CHARACTER, type CharacterStyle } from '../core/types';
import { MOBS } from './registry';

export class VoxelRig {
  readonly root: Mesh;
  readonly head: TransformNode;
  readonly limbs: TransformNode[]=[];
  readonly wings: TransformNode[]=[];
  private mats=new Map<string,StandardMaterial>();
  private tail:TransformNode|null=null;
  private style:CharacterStyle;
  private kind:string;
  private scale=1;
  constructor(private scene:Scene,kind='player',character?:CharacterStyle){
    this.kind=kind;this.style={...DEFAULT_CHARACTER,...character};this.root=new Mesh(`${kind}-rig`,scene);this.root.isPickable=false;
    this.head=new TransformNode(`${kind}-head-pivot`,scene);this.head.parent=this.root;
    const def=MOBS[kind];if(def)this.scale=def.scale;
    if(kind==='player'||def?.model==='humanoid')this.humanoid(kind==='player');
    else if(def?.model==='dragon')this.dragon();
    else if(def?.model==='wither')this.wither();
    else if(def?.model==='bird')this.bird();
    else if(def?.model==='spider')this.spider();
    else if(def?.model==='fish')this.fish();
    else if(def?.model==='slime'){this.part(.9,.8,.9,0,.5,0,def.body);this.eyes(0,.65,.46,.24,def.accent);}
    else this.quadruped();
    this.root.scaling.setAll(this.scale);
  }
  material(hex:string,glow=false){
    const key=`${hex}:${glow}`;const found=this.mats.get(key);if(found)return found;
    const texture=new DynamicTexture(`skin-${key}`,16,this.scene,false,Texture.NEAREST_SAMPLINGMODE),ctx=texture.getContext(),base=Color3.FromHexString(hex),seed=seedNumber(hex);
    for(let x=0;x<16;x++)for(let y=0;y<16;y++){const v=.88+hash3(x,y,0,seed)*.21;ctx.fillStyle=`rgb(${base.r*255*v},${base.g*255*v},${base.b*255*v})`;ctx.fillRect(x,y,1,1);}texture.update();
    const mat=new StandardMaterial(key,this.scene);mat.diffuseTexture=texture;mat.specularColor.setAll(.025);if(glow)mat.emissiveColor=base.scale(.8);this.mats.set(key,mat);return mat;
  }
  private part(w:number,h:number,d:number,x:number,y:number,z:number,color:string,parent:TransformNode=this.root,glow=false){
    const m=MeshBuilder.CreateBox(`${this.kind}-part`,{width:w,height:h,depth:d},this.scene);m.position.set(x,y,z);m.parent=parent;m.material=this.material(color,glow);m.isPickable=false;m.receiveShadows=true;return m;
  }
  private limb(x:number,y:number,z:number,w:number,h:number,d:number,color:string){const p=new TransformNode('joint',this.scene);p.parent=this.root;p.position.set(x,y,z);this.part(w,h,d,0,-h/2,0,color,p);this.limbs.push(p);return p;}
  private eyes(x:number,y:number,z:number,spacing:number,color='#3c4642',parent:TransformNode=this.root){for(const s of [-1,1]){this.part(.085,.085,.018,x+s*spacing,y,z,'#e5e9dc',parent);this.part(.044,.066,.026,x+s*spacing,y,z+.016,color,parent);}}
  private humanoid(player:boolean){
    const def=MOBS[this.kind],skin=player?this.style.skin:def.body,shirt=player?this.style.shirt:def.accent,pants=player?this.style.trousers:'#4c5356';
    this.part(.52,.67,.28,0,1.06,0,shirt);this.head.position.set(0,1.64,0);this.part(.51,.49,.48,0,0,0,skin,this.head);
    this.eyes(0,.03,.25,.125,player?this.style.eyes:this.kind==='endling'?'#bd91d8':'#34382e',this.head);
    this.part(.12,.045,.016,0,-.13,.25,player?'#916047':'#5a483b',this.head);
    if(player){
      this.part(.53,.14,.5,0,.2,-.006,this.style.hair,this.head);
      this.part(.53,this.style.hairStyle==='long'?.57:.32,.11,0,this.style.hairStyle==='long'?-.05:.07,-.22,this.style.hair,this.head);
      if(this.style.hairStyle==='mohawk')this.part(.17,.15,.48,0,.33,0,this.style.hair,this.head);
      this.part(.15,.16,.035,-.15,.11,.25,this.style.hair,this.head);
    }else if(this.kind==='villager'){this.part(.12,.2,.17,0,-.04,.31,skin,this.head);this.part(.64,.1,.59,0,.23,0,'#6d6141',this.head);this.part(.5,.14,.48,0,.34,0,'#8e7b48',this.head);}
    if(this.kind!=='creeper')for(const s of [-1,1]){const joint=this.limb(s*.39,1.38,0,.23,.65,.25,skin);this.part(.24,.26,.26,0,-.13,0,shirt,joint);}
    for(const s of [-1,1]){const joint=this.limb(s*.137,.735,0,.25,.72,.28,this.kind==='creeper'?skin:pants);if(player)this.part(.26,.14,.31,0,-.66,.014,this.style.boots,joint);}
    if(this.kind==='skeleton'){for(let y=.84;y<1.38;y+=.17)this.part(.56,.055,.05,0,y,.18,'#b7b19d');}
  }
  private quadruped(){
    const d=MOBS[this.kind]||MOBS.sheep,sniffer=d.model==='sniffer';
    this.part(sniffer?1.15:.82,sniffer?.85:.7,sniffer?1.6:1.28,0,.9,0,d.body);
    this.head.position.set(0,.96,sniffer?.92:.75);this.part(sniffer?.85:.53,.55,.59,0,0,0,d.accent,this.head);
    this.eyes(0,.09,.31,sniffer?.27:.17,'#3c4234',this.head);this.part(.33,.22,.2,0,-.12,.37,d.accent,this.head);
    if(sniffer){for(let i=0;i<7;i++)this.part(.16,.18,.17,(i%3-1)*.35,1.42,Math.floor(i/3)*.4-.4,i%2?'#83934b':'#b18c57');}
    for(const x of [-.28,.28])for(const z of [-.43,.43])this.limb(x,.67,z,.21,.65,.23,d.accent);
    for(const s of [-1,1])this.part(.15,this.kind==='rabbit'?.5:.17,.16,s*.23,.3,0,d.body,this.head);
    this.tail=new TransformNode('tail',this.scene);this.tail.parent=this.root;this.tail.position.set(0,1,-.65);this.part(.15,.17,this.kind==='fox'?.75:.25,0,0,-.15,d.body,this.tail);
    if(this.kind==='cow')for(let i=0;i<5;i++)this.part(.18,.18,.02,(i%3-1)*.22,.85+Math.floor(i/3)*.25,.65,d.accent);
  }
  private bird(){const d=MOBS[this.kind];this.part(.3,.25,.62,0,.5,0,d.body);this.head.position.set(0,.58,.3);this.part(.23,.22,.25,0,0,0,d.body,this.head);this.part(.12,.08,.19,0,-.04,.2,d.accent,this.head);this.eyes(0,.015,.135,.075,'#242c2a',this.head);for(const s of [-1,1]){const p=new TransformNode('wing',this.scene);p.parent=this.root;p.position.set(s*.13,.57,0);this.part(.6,.055,.27,s*.29,0,0,d.body,p);this.wings.push(p);}for(const s of [-1,1])this.limb(s*.09,.35,.02,.055,.22,.06,d.accent);}
  private dragon(){const d=MOBS[this.kind];this.part(1.8,1.35,4.6,0,0,0,d.body);this.head.position.set(0,.4,3);this.part(1.2,.95,1.8,0,0,0,d.body,this.head);this.eyes(0,.15,.93,.39,d.accent,this.head);for(const s of [-1,1]){const p=new TransformNode('dragon-wing',this.scene);p.parent=this.root;p.position.set(s*.8,.35,-.3);this.part(4.7,.12,3,s*2.2,0,0,d.accent,p);this.part(2.4,.09,1.7,s*5.2,-.1,-.8,d.accent,p);this.wings.push(p);this.limb(s*.7,-.35,1,.43,1.4,.48,d.body);}this.tail=new TransformNode('dragon-tail',this.scene);this.tail.parent=this.root;this.tail.position.set(0,-.2,-2.1);for(let i=0;i<5;i++)this.part(.6-i*.07,.5-i*.05,1,0,-i*.07,-i*.85,d.body,this.tail);}
  private wither(){const d=MOBS[this.kind];this.part(.65,1.7,.5,0,1.1,0,d.body);this.part(2.6,.33,.45,0,1.75,0,d.body);for(const x of [-.96,0,.96]){this.part(.6,.6,.6,x,2.15,0,d.body);this.eyes(x,2.2,.32,.17,d.accent);}for(let i=0;i<3;i++)this.part(1.1-i*.2,.1,.35,0,.8+i*.3,0,d.accent);}
  private spider(){const d=MOBS[this.kind];this.part(.85,.45,1.1,0,.5,0,d.body);this.head.position.set(0,.45,.64);this.part(.5,.36,.45,0,0,0,d.body,this.head);this.eyes(0,.05,.25,.15,d.accent,this.head);for(let i=0;i<4;i++)for(const s of [-1,1]){const p=this.limb(s*.4,.52,i*.28-.4,.08,.1,1,d.body);p.rotation.y=s*(.7+i*.3);p.rotation.z=s*.3;}}
  private fish(){const d=MOBS[this.kind];this.part(.22,.35,.9,0,.3,0,d.body);this.head.position.set(0,.3,.42);this.eyes(0,.08,.08,.09,d.accent,this.head);this.tail=new TransformNode('fish-tail',this.scene);this.tail.parent=this.root;this.tail.position.set(0,.3,-.45);this.part(.06,.45,.22,0,0,-.1,d.accent,this.tail);}
  animate(time:number,moving:number,attack=0){
    const swing=Math.sin(time*7)*.65*Math.min(1,moving);
    this.limbs.forEach((p,i)=>{if(MOBS[this.kind]?.model==='spider')p.rotation.x=Math.sin(time*9+i)*.18;else p.rotation.x=(i%2===0?1:-1)*swing-(i<2?attack*.8:0);});
    this.wings.forEach((p,i)=>p.rotation.z=(i===0?-1:1)*(.16+Math.sin(time*(this.kind==='dragon'?2.4:8))*.48));
    if(this.tail)this.tail.rotation.y=Math.sin(time*3)*.22;
    if(this.kind==='sniffer'||MOBS[this.kind]?.model==='sniffer')this.head.rotation.x=Math.sin(time*.8)*.22;
    if(MOBS[this.kind]?.model==='slime'){this.root.scaling.y=this.scale*(.86+Math.abs(Math.sin(time*3))*.24);}
  }
  flash(hurt:boolean){this.root.scaling.setAll(this.scale*(hurt?1.035:1));}
  dispose(){this.root.dispose();this.mats.forEach(m=>m.dispose(false,true));this.mats.clear();}
}