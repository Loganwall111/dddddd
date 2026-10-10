import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import type { Scene } from '@babylonjs/core/scene';
import { VoxelRig } from '../entities/VoxelRig';
import { DEFAULT_CHARACTER, type CharacterStyle } from '../core/types';

export class PlayerVisual {
  rig:VoxelRig;
  private arm:TransformNode;
  private clock=0;
  constructor(private scene:Scene,private camera:FreeCamera,style:CharacterStyle=DEFAULT_CHARACTER){
    this.rig=new VoxelRig(scene,'player',style);this.rig.root.setEnabled(false);
    this.arm=new TransformNode('first-person-arm',scene);this.arm.parent=camera;this.createArm(style);
  }
  private createArm(style:CharacterStyle){
    // Slim Minecraft-proportioned arm: sleeve near the shoulder, skin toward the hand.
    const upper=MeshBuilder.CreateBox('first-person-sleeve',{width:.16,height:.24,depth:.17},this.scene);upper.parent=this.arm;upper.material=this.rig.material(style.shirt);upper.position.y=.12;upper.isPickable=false;upper.renderingGroupId=2;
    const lower=MeshBuilder.CreateBox('first-person-hand',{width:.15,height:.3,depth:.16},this.scene);lower.parent=this.arm;lower.material=this.rig.material(style.skin);lower.position.y=-.14;lower.isPickable=false;lower.renderingGroupId=2;
    const hand=MeshBuilder.CreateBox('first-person-fist',{width:.15,height:.09,depth:.16},this.scene);hand.parent=this.arm;hand.material=this.rig.material(style.skin);hand.position.set(0,-.32,.015);hand.isPickable=false;hand.renderingGroupId=2;
  }
  update(dt:number,position:Vector3,yaw:number,pitch:number,moving:boolean,mining:boolean,third:boolean){
    this.clock+=dt;this.arm.setEnabled(!third);this.rig.root.setEnabled(third);
    const bob = moving ? 1 : 0;
    this.arm.position.set(.36+Math.sin(this.clock*7)*.008*bob,-.3+Math.abs(Math.cos(this.clock*9))*.012*bob,.55);
    this.arm.rotation.set(-.14-(mining?Math.max(0,Math.sin(this.clock*16))*.75:Math.sin(this.clock*7)*.03*bob),-.16,.05);
    this.rig.root.position.copyFrom(position);this.rig.root.rotation.y=yaw;this.rig.head.rotation.x=pitch;this.rig.animate(this.clock,Number(moving),mining?.5:0);
  }
  setStyle(style:CharacterStyle){this.rig.dispose();this.arm.dispose();this.rig=new VoxelRig(this.scene,'player',style);this.arm=new TransformNode('first-person-arm',this.scene);this.arm.parent=this.camera;this.createArm(style);}
  dispose(){this.arm.dispose();this.rig.dispose();}
}
