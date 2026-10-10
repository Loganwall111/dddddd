import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import { initializeEngine } from '../core/engine';
import { createBlockMaterial } from '../blocks/textures';
import { VoxelWorld } from '../world/World';
import { Horizon } from '../world/Horizon';
import { Environment } from './Environment';
import { createWorld } from '../persistence/storage';
import { DEFAULT_SETTINGS, type Settings } from '../core/types';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';

export class Panorama {
  private scene:Scene;
  private world:VoxelWorld;
  private horizon:Horizon;
  private environment:Environment;
  private camera:FreeCamera;
  private angle=0;
  private last=performance.now();
  private dead=false;
  /** Paused while the title menu is hidden; resets the clock on resume so no large time step is applied. */
  private _paused=false;
  get paused(){return this._paused;}
  /** Stopping the loop while hidden means the canvas stops presenting frames behind the game. */
  set paused(value:boolean){if(value===this._paused)return;this._paused=value;if(this.dead)return;if(value)this.engine.stopRenderLoop(this.frame);else{this.last=performance.now();this.engine.runRenderLoop(this.frame);}}
  private constructor(private engine:AbstractEngine,public reducedMotion:boolean){
    this.scene=new Scene(engine);this.scene.skipPointerMovePicking=true;
    this.camera=new FreeCamera('rotating-title-panorama',new Vector3(-16,49,-10),this.scene);this.camera.inputs.clear();this.camera.minZ=.1;this.camera.maxZ=1100;this.camera.fov=1.12;this.camera.setTarget(new Vector3(18,33,39));this.angle=this.camera.rotation.y;
    const settings:Settings={...DEFAULT_SETTINGS,renderDistance:4,bloom:true,godRays:true,wetReflections:false,quality:'balanced',reducedMotion};
    const material=createBlockMaterial(this.scene);this.environment=new Environment(this.scene,this.camera,settings);this.engine.setHardwareScalingLevel(1.3);
    const save=createWorld('Panorama','Mass-Awakening-2048','creative','normal','peaceful');save.generationVersion=2;
    this.world=new VoxelWorld(this.scene,material,save);this.world.renderDistance=4;this.world.onMesh=(mesh,add)=>this.environment.track(mesh,add);
    this.horizon=new Horizon(this.scene,material);this.horizon.onMesh=(mesh,add)=>{if(add)this.environment.water.addToRenderList(mesh);else this.environment.water.removeFromRenderList(mesh);};
    this.horizon.onWater=data=>this.environment.updateWaterGeometry(data);
    this.world.stream(2,12,true);this.horizon.update(2,12,4,this.world.config);
    this.engine.runRenderLoop(this.frame);window.addEventListener('resize',this.resize);this.resize();
  }
  static async create(canvas:HTMLCanvasElement,reducedMotion:boolean,onReady:()=>void){
    const engine=await initializeEngine(canvas,{preferWebGL:true});let view:Panorama;
    try{view=new Panorama(engine,reducedMotion);}catch(error){engine.dispose();throw error;}
    void view.world.waitForSpawn(2,12,()=>{}).then(async()=>{if(view.dead)return;await view.scene.whenReadyAsync();if(!view.dead)onReady();}).catch(error=>{if(!view.dead)console.warn('Panorama terrain could not load.',error);});
    return view;
  }
  private frame=()=>{
    if(this.dead||this._paused||document.hidden)return;
    const now=performance.now(),dt=Math.min(.05,(now-this.last)/1000);this.last=now;
    if(!this.reducedMotion)this.angle+=dt*.012;
    this.camera.rotation.y=this.angle;this.camera.rotation.x=.15+Math.sin(this.angle*.7)*.035;
    this.environment.update(dt,.27,this.camera.position,'clear','Summer',this.world.config);this.scene.render();
  };
  private resize=()=>this.engine.resize();
  dispose(){if(this.dead)return;this.dead=true;this._paused=true;window.removeEventListener('resize',this.resize);this.engine.stopRenderLoop(this.frame);this.world.dispose();this.horizon.dispose();this.environment.dispose();this.scene.dispose();this.engine.dispose();}
}