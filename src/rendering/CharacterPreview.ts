import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3,Color4 } from '@babylonjs/core/Maths/math.color';
import { VoxelRig } from '../entities/VoxelRig';
import type { CharacterStyle } from '../core/types';

export class CharacterPreview {
  private engine:Engine;private scene:Scene;private rig:VoxelRig;private angle=-.35;private dragging=false;private x=0;private clock=0;private observer:ResizeObserver;
  constructor(private canvas:HTMLCanvasElement,style:CharacterStyle){
    this.engine=new Engine(canvas,true,{alpha:true,preserveDrawingBuffer:false});this.engine.setHardwareScalingLevel(1);this.scene=new Scene(this.engine);this.scene.clearColor=new Color4(0,0,0,0);
    const camera=new FreeCamera('character-preview-camera',new Vector3(0,1.08,3.5),this.scene);camera.setTarget(new Vector3(0,.96,0));camera.fov=.64;camera.minZ=.1;
    new HemisphericLight('character-fill',Vector3.Up(),this.scene).intensity=.95;const light=new DirectionalLight('character-key',new Vector3(-.4,-.7,-.5),this.scene);light.intensity=.65;light.diffuse=new Color3(1,.96,.86);
    this.rig=new VoxelRig(this.scene,'player',style);this.engine.runRenderLoop(()=>{this.clock+=.016;this.rig.root.rotation.y=this.angle;this.rig.animate(this.clock,this.dragging?.15:.06);this.scene.render();});
    canvas.addEventListener('pointerdown',this.down);canvas.addEventListener('pointermove',this.move);canvas.addEventListener('pointerup',this.up);canvas.addEventListener('pointercancel',this.up);
    this.observer=new ResizeObserver(()=>this.engine.resize());this.observer.observe(canvas);this.engine.resize();
  }
  setStyle(style:CharacterStyle){this.rig.dispose();this.rig=new VoxelRig(this.scene,'player',style);}
  private down=(event:PointerEvent)=>{this.dragging=true;this.x=event.clientX;this.canvas.setPointerCapture(event.pointerId);};
  private move=(event:PointerEvent)=>{if(!this.dragging)return;this.angle+=(event.clientX-this.x)*.012;this.x=event.clientX;};
  private up=()=>{this.dragging=false;};
  dispose(){this.observer.disconnect();this.canvas.removeEventListener('pointerdown',this.down);this.canvas.removeEventListener('pointermove',this.move);this.canvas.removeEventListener('pointerup',this.up);this.canvas.removeEventListener('pointercancel',this.up);this.rig.dispose();this.scene.dispose();this.engine.dispose();}
}