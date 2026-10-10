import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector2, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import { SSRRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssrRenderingPipeline';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { CascadedShadowGenerator } from '@babylonjs/core/Lights/Shadows/cascadedShadowGenerator';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';
import { GlowLayer } from '@babylonjs/core/Layers/glowLayer';
import { ReflectionProbe } from '@babylonjs/core/Probes/reflectionProbe';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import { Scene } from '@babylonjs/core/scene';
import type { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { WaterMaterial } from '@babylonjs/materials/water/waterMaterial';
import { DIMENSIONS, type DimensionId, type Season, type Settings, type Weather } from '../core/types';
import { SkyAtmosphere } from './SkyAtmosphere';
import { Underwater } from './Underwater';
import { GodRays } from './GodRays';
import { SunDiscMaterial } from './SunDisc';
import { NightSky } from './NightSky';
import type { DepthRenderer } from '@babylonjs/core/Rendering/depthRenderer';
import '@babylonjs/core/Rendering/depthRendererSceneComponent';
import { LightningSystem } from './Lightning';
import { getBiome, type GenConfig } from '../world/generator';
import './IridescentWater';
import type { WaterGeometry } from '../world/Horizon';

export class Environment {
  onError?: (message:string)=>void;
  onThunder?: (delay:number,intensity:number)=>void;
  readonly sun: DirectionalLight;
  readonly ambient: HemisphericLight;
  shadow: ShadowGenerator;
  readonly water: WaterMaterial;
  readonly waterMesh: Mesh;
  readonly sky: Mesh;
  private atmosphere: SkyAtmosphere;
  private sunDisc: Mesh;
  private sunMat: SunDiscMaterial;
  private sunHalo: Mesh;
  private rain: ParticleSystem;
  private snow: ParticleSystem;
  private motes: ParticleSystem;
  private glow: GlowLayer;
  private pipeline: DefaultRenderingPipeline;
  private probe: ReflectionProbe;
  private underwater: Underwater;
  private godRays: GodRays;
  private nightSky: NightSky;
  private depth: DepthRenderer;
  private lightning: LightningSystem;
  private ssr: SSRRenderingPipeline | null=null;
  private dimension: DimensionId='overworld';
  private elapsed=0;
  private settings: Settings;
  private waterTint=new Color3(.05,.42,.46);
  private biomeClock=0;
  private waterGeometryReady=false;
  bloodMoon = false;
  constructor(private scene:Scene,camera:FreeCamera,settings:Settings){
    this.settings=settings;
    this.sun=new DirectionalLight('dynamic-sun-and-moon',new Vector3(-.6,-.8,.3),scene);this.sun.position.set(80,120,-60);this.sun.intensity=2.4;this.sun.shadowMinZ=1;this.sun.shadowMaxZ=130;
    (this.sun as unknown as { shadowOrthoScale: number }).shadowOrthoScale = 0.7;
    this.ambient=new HemisphericLight('soft-skylight',Vector3.Up(),scene);this.ambient.diffuse=new Color3(.88,.94,1);this.ambient.groundColor=new Color3(.32,.35,.25);this.ambient.intensity=.82;
    this.shadow = this.createShadowMap(settings.quality === 'cinematic' ? 2048 : settings.quality === 'performance' ? 1024 : 2048, settings);
    this.atmosphere=new SkyAtmosphere(scene);this.sky=this.atmosphere.mesh;
    this.atmosphere.material.onError=(_effect,message)=>this.onError?.(`Atmosphere shader: ${message}`);
    this.sunDisc=MeshBuilder.CreateSphere('visible-sun-and-moon',{diameter:42,segments:16},scene);
    this.sunMat=new SunDiscMaterial(scene);this.sunDisc.material=this.sunMat.material;this.sunDisc.isPickable=false;
    this.sunHalo=MeshBuilder.CreateSphere('sun-halo',{diameter:110,segments:12},scene);
    const haloMat=new StandardMaterial('sun-halo-glow',scene);haloMat.emissiveColor=new Color3(1,.75,.42);haloMat.alpha=.16;haloMat.disableLighting=true;haloMat.fogEnabled=false;haloMat.disableDepthWrite=true;
    this.sunHalo.material=haloMat;this.sunHalo.isPickable=false;
    const bump=new DynamicTexture('layered-wave-normal-field',{width:256,height:256},scene,true),bc=bump.getContext();
    for(let x=0;x<256;x++)for(let y=0;y<256;y++){
      const a=Math.sin(x*Math.PI/16+Math.sin(y*Math.PI/32)*1.7)*.7+Math.sin((x+y)*Math.PI/8)*.3;
      const b=Math.cos(y*Math.PI/16+Math.sin(x*Math.PI/32))*.7+Math.sin((x-y)*Math.PI/8)*.3;
      bc.fillStyle=`rgb(${128+a*28},${128+b*28},248)`;bc.fillRect(x,y,1,1);
    }
    bump.update();bump.gammaSpace=false;bump.wrapU=Texture.WRAP_ADDRESSMODE;bump.wrapV=Texture.WRAP_ADDRESSMODE;
    this.water=new WaterMaterial('aether-reflection-refraction-water',scene,new Vector2(512,512));this.water.bumpTexture=bump;
    this.water.windForce=-4.2;this.water.waveHeight=.26;this.water.bumpHeight=.3;this.water.waveLength=.08;this.water.waveSpeed=26;this.water.windDirection=new Vector2(.8,1);
    this.water.waterColor=this.waterTint;this.water.waterColor2=new Color3(.015,.2,.27);this.water.colorBlendFactor=.16;this.water.colorBlendFactor2=.28;this.water.fresnelSeparate=true;this.water.backFaceCulling=true;// Underside is not drawn; looking up from below is handled by the underwater pass.
    this.waterMesh=MeshBuilder.CreateGround('lake-and-ocean-surface',{width:720,height:720,subdivisions:96},scene);this.waterMesh.material=this.water;this.waterMesh.position.y=26.1;this.waterMesh.isPickable=false;
    this.water.addToRenderList(this.sky);this.water.addToRenderList(this.sunDisc);
    this.probe=new ReflectionProbe('dynamic-sky-ibl',64,scene);this.probe.renderList?.push(this.sky,this.sunDisc);this.probe.refreshRate=120;scene.environmentTexture=this.probe.cubeTexture;
    this.glow=new GlowLayer('soft-emissive-bloom',scene,{blurKernelSize:24});this.glow.intensity=.24;this.glow.addExcludedMesh(this.sky);this.glow.addExcludedMesh(this.waterMesh);
    this.glow.customEmissiveColorSelector=(_mesh,_subMesh,material,color)=>{const m=material as StandardMaterial;if(m.emissiveTexture)color.set(1,1,1,1);else{const c=m.emissiveColor||Color3.Black();color.set(c.r,c.g,c.b,m.alpha);}};
    if(scene.getEngine().getCaps().drawBuffersExtension){
      try{this.ssr=new SSRRenderingPipeline('rain-reflections',scene,[camera],false);this.ssr.maxSteps=48;this.ssr.maxDistance=55;this.ssr.step=3;this.ssr.thickness=.5;this.ssr.ssrDownsample=1;this.ssr.blurDownsample=1;this.ssr.strength=.6;this.ssr.reflectivityThreshold=.025;this.ssr.isEnabled=false;}
      catch(error){console.warn('Screen-space reflections unavailable; water and mirrors retain their planar reflection path.',error);this.ssr?.dispose();this.ssr=null;}
    }
    this.pipeline=new DefaultRenderingPipeline('aether-cinematic-pipeline',false,scene,[camera]);
    this.pipeline.fxaaEnabled=false;
    try { (this.pipeline as unknown as { samples: number }).samples = 4; } catch { /* MSAA unsupported on this backend. */ }
    this.pipeline.bloomThreshold=.82;this.pipeline.bloomWeight=.15;this.pipeline.bloomKernel=48;
    this.pipeline.imageProcessing.toneMappingEnabled=settings.toneMapping;this.pipeline.imageProcessing.toneMappingType=ImageProcessingConfiguration.TONEMAPPING_ACES;
    this.pipeline.imageProcessing.exposure=1.26;this.pipeline.imageProcessing.contrast=1.12;
    try {
      this.pipeline.imageProcessing.colorCurvesEnabled=true;
      const curves = this.pipeline.imageProcessing.colorCurves; if(curves) curves.globalSaturation=42;
      this.pipeline.imageProcessing.vignetteEnabled=true;
      this.pipeline.imageProcessing.vignetteWeight=.3;
      this.pipeline.imageProcessing.ditheringEnabled=false;
    } catch { /* Older Babylon builds ignore cinematic grading extras. */ }
    // Film grain is the pipeline's real grain pass; switch it off explicitly.
    { const grain = (this.pipeline as unknown as { grain?: { enabled: boolean } }).grain; if (grain) grain.enabled = false; }
    try { (this.pipeline as unknown as { sharpenEnabled: boolean }).sharpenEnabled = true; } catch { /* Sharpen unsupported. */ }
    this.depth=scene.enableDepthRenderer(camera,false,true);this.depth.enabled=false;
    this.nightSky=new NightSky(scene);this.water.addToRenderList(this.nightSky.mesh);this.probe.renderList?.push(this.nightSky.mesh);
    this.godRays=new GodRays(scene,camera,this.depth);
    this.lightning=new LightningSystem(scene);this.lightning.onThunder=(d,i)=>this.onThunder?.(d,i);
    this.underwater=new Underwater(scene,camera,()=>this.depth.getDepthMap());
    this.rain=this.precipitation('rain',1400,false);this.snow=this.precipitation('snow',650,true);this.motes=this.precipitation('season-pollen',90,true);
    this.motes.direction1=new Vector3(.08,.02,.05);this.motes.direction2=new Vector3(.2,.06,.14);this.motes.minLifeTime=6;this.motes.maxLifeTime=10;this.motes.minSize=.014;this.motes.maxSize=.03;this.motes.minEmitBox.set(-11,1,-11);this.motes.maxEmitBox.set(11,6,11);
    this.scene.fogMode=Scene.FOGMODE_EXP2;this.applySettings(settings);
  }
  private createShadowMap(size: number, settings: Settings): ShadowGenerator {
    try {
      const cascaded = new CascadedShadowGenerator(size, this.sun);
      cascaded.numCascades = 3;
      cascaded.lambda = 0.85;
      cascaded.shadowMaxZ = 130;
      cascaded.stabilizeCascades = true;
      cascaded.usePercentageCloserFiltering = true;
      cascaded.filteringQuality = settings.quality === 'cinematic' ? ShadowGenerator.QUALITY_MEDIUM : ShadowGenerator.QUALITY_LOW;
      cascaded.cascadeBlendPercentage = 0.1;
      cascaded.bias = 0.0008;
      cascaded.normalBias = 0.02;
      cascaded.setDarkness(0.26);
      return cascaded;
    } catch (error) {
      console.warn('Cascaded shadow maps unavailable; falling back to a single filtered shadow map.', error);
      const shadow = new ShadowGenerator(size, this.sun);
      shadow.usePercentageCloserFiltering = true;
      shadow.filteringQuality = settings.quality === 'cinematic' ? ShadowGenerator.QUALITY_MEDIUM : ShadowGenerator.QUALITY_LOW;
      shadow.bias = 0.0008;
      shadow.normalBias = 0.02;
      shadow.setDarkness(0.26);
      return shadow;
    }
  }
  private precipitation(name:string,count:number,snow:boolean){
    const texture=new DynamicTexture(`${name}-sprite`,{width:8,height:snow?8:32},this.scene,false),ctx=texture.getContext();ctx.clearRect(0,0,8,32);ctx.fillStyle='rgba(235,244,242,.8)';ctx.fillRect(snow?2:3,snow?2:0,snow?4:2,snow?4:30);texture.update();texture.hasAlpha=true;
    const p=new ParticleSystem(name,count,this.scene);p.particleTexture=texture;p.emitter=Vector3.Zero();p.minEmitBox=new Vector3(-23,14,-23);p.maxEmitBox=new Vector3(23,22,23);
    p.direction1=new Vector3(-.7,snow?-1.2:-18,.2);p.direction2=new Vector3(-1.4,snow?-2:-22,0);p.minLifeTime=snow?6:.8;p.maxLifeTime=snow?12:1.5;p.minSize=snow?.07:.1;p.maxSize=snow?.17:.17;p.minScaleY=snow?1:7;p.maxScaleY=snow?1:10;
    p.color1=new Color4(.8,.87,.94,.45);p.color2=new Color4(.94,.97,1,.6);p.colorDead=new Color4(.8,.88,.9,0);p.emitRate=0;p.start();return p;
  }
  track(mesh:Mesh,add:boolean){if(add)this.shadow.addShadowCaster(mesh,true);else this.shadow.removeShadowCaster(mesh,true);for(const part of [mesh,...mesh.getChildMeshes()]){if(add)this.water.addToRenderList(part);else this.water.removeFromRenderList(part);}}
  setDimension(id:DimensionId){this.dimension=id;this.waterGeometryReady=false;this.waterMesh.setEnabled(false);this.waterMesh.position.y=DIMENSIONS[id].water+.1;this.biomeClock=10;}
  updateWaterGeometry(data:WaterGeometry){this.waterGeometryReady=true;if(data.positions.length){const vertex=new VertexData();vertex.positions=data.positions;vertex.normals=data.normals;vertex.uvs=data.uvs;vertex.indices=data.indices;vertex.applyToMesh(this.waterMesh);this.waterMesh.position.x=0;this.waterMesh.position.z=0;this.waterMesh.setEnabled(DIMENSIONS[this.dimension].water>0);}else this.waterMesh.setEnabled(false);}
  applySettings(settings:Settings){
    this.settings=settings;
    this.pipeline.imageProcessing.toneMappingEnabled=settings.toneMapping;this.sun.shadowEnabled=settings.shadows;
    const shadowSize = settings.quality === 'cinematic' ? 2048 : settings.quality === 'performance' ? 1024 : 2048;
    const map = this.shadow.getShadowMap();
    if (map && map.getSize().width !== shadowSize) {
      const casters = map.renderList?.slice() || [];
      this.shadow.dispose();
      this.shadow = this.createShadowMap(shadowSize, settings);
      for (const caster of casters) this.shadow.addShadowCaster(caster as Mesh, false);
    }
    const waterSize=settings.quality==='cinematic'?768:settings.quality==='performance'?256:512;this.water.enableRenderTargets(settings.reflections);
    for(const texture of [this.water.reflectionTexture,this.water.refractionTexture])if(texture){if(texture.getSize().width!==waterSize)texture.resize(waterSize);texture.refreshRate=settings.reflections?(settings.quality==='cinematic'?1:2):0;}
    this.glow.isEnabled=settings.bloom;this.pipeline.bloomEnabled=settings.bloom&&settings.quality!=='performance';
    this.scene.getEngine().setHardwareScalingLevel(settings.quality==='performance'?1.5:settings.quality==='cinematic'?1/Math.min(devicePixelRatio,1.6):1);
  }
  update(dt:number,time:number,position:Vector3,weather:Weather,season:Season,config?:GenConfig,submergedOverride?:boolean,worldAge=0){
    this.elapsed+=dt;this.biomeClock+=dt;
    const angle=time*Math.PI*2, sin=Math.sin(angle), cos=Math.cos(angle);
    const day=Math.max(0,sin),alien=this.dimension==='nether'||this.dimension==='end'||this.dimension==='crystal',sift=this.dimension==='sift';
    const night=1-Math.min(1,day*3);
    const dayNumber=Math.floor(worldAge/1200);
    this.bloodMoon=this.dimension==='overworld'&&dayNumber>0&&dayNumber%7===6&&time>.51&&time<.68;
    const elevation=Math.max(.14,Math.abs(sin));
    this.sun.direction.set(-cos*.82,-elevation,.38).normalize();this.sun.position.copyFrom(position.subtract(this.sun.direction.scale(95)));
    this.sun.intensity=alien?this.dimension==='nether'?.65:.95:.25+day*2.1;this.ambient.intensity=alien?.72:.3+day*.68;
    const golden=day>0&&day<.4?(1-day/.4):0;
    this.sun.diffuse=this.bloodMoon?new Color3(.92,.16,.09):golden>0?new Color3(1,.55+day*.9,.3+day*.9):day<.05?new Color3(.62,.74,1):new Color3(1,.96,.88);
    this.ambient.diffuse.copyFrom(this.bloodMoon?new Color3(.72,.12,.16):new Color3(.88,.94,1));
    if(this.bloodMoon)this.ambient.intensity*=.84;
    const raining=!alien&&weather!=='clear';if(raining){this.sun.intensity*=.5;this.ambient.intensity*=.8;}
    const fog=Color3.FromHexString(DIMENSIONS[this.dimension].fog);if(!alien&&!sift)fog.scaleInPlace(.2+Math.min(1,day*2)*.8);if(raining)fog.scaleInPlace(.82);if(this.bloodMoon)fog.copyFrom(Color3.Lerp(fog,new Color3(.22,.025,.045),.68));
    this.scene.fogColor=fog;this.scene.clearColor=Color4.FromColor3(fog);this.scene.fogDensity=(alien?.008:raining?.006:.0022)*(5/this.settings.renderDistance);
    const depth=DIMENSIONS[this.dimension].water-position.y;
    const submerged=(submergedOverride??depth>0)&&this.dimension!=='nether';
    if(submerged){this.scene.fogColor=sift?new Color3(.2,.14,.27):new Color3(.02,.22,.28);this.scene.fogDensity=.016+Math.min(.03,depth*.002);}
    const sunDir=this.sun.direction.clone().negate();
    this.atmosphere.update(dt,time,position,sunDir,this.dimension,weather,season,this.settings);
    this.sunDisc.position.copyFrom(position.add(sunDir.scale(420)));this.sunHalo.position.copyFrom(this.sunDisc.position);
    const nightBody=day<.06;
    this.sunDisc.setEnabled(!alien);this.sunHalo.setEnabled(!alien&&((!nightBody&&!raining)||this.bloodMoon));
    this.sunMat.update(this.bloodMoon?new Color3(.95,.035,.025):nightBody?new Color3(.72,.82,1):golden>0?new Color3(1,.62,.3):new Color3(1,.9,.62), this.elapsed, position);
    const haloMaterial=this.sunHalo.material as StandardMaterial;
    haloMaterial.emissiveColor.copyFrom(this.bloodMoon?new Color3(.9,.035,.025):golden>0?new Color3(1,.5,.22):new Color3(1,.78,.45));
    haloMaterial.alpha = this.bloodMoon ? 0.28 : 0.16;
    this.probe.position.copyFrom(position);if(!this.waterGeometryReady){this.waterMesh.position.x=Math.round(position.x/16)*16;this.waterMesh.position.z=Math.round(position.z/16)*16;}
    if(config&&this.biomeClock>2){this.biomeClock=0;this.waterTint=Color3.FromHexString(getBiome(position.x,position.z,config).water).scale(.75);}
    this.water.waterColor=this.dimension==='nether'?new Color3(.78,.12,.018):sift?new Color3(.22+.1*Math.sin(this.elapsed*.23),.28+.1*Math.sin(this.elapsed*.31+2),.31+.12*Math.cos(this.elapsed*.27)):this.waterTint;
    this.water.waterColor2=this.dimension==='nether'?new Color3(.8,.17,.025):this.water.waterColor.scale(.65);this.water.colorBlendFactor=this.dimension==='nether'?.94:sift?.42:.16;
    this.water.waveHeight=raining?.42:.26;this.water.bumpHeight=raining?.5:.3;
    this.rain.emitter=position;this.snow.emitter=position;this.motes.emitter=position;
    this.rain.emitRate=raining&&season!=='Winter'?(weather==='storm'?850:430):0;this.snow.emitRate=raining&&season==='Winter'?95:0;
    this.motes.emitRate=!alien&&weather==='clear'&&this.settings.quality!=='performance'?(season==='Spring'?3:season==='Autumn'?2:0):0;
    this.motes.color1=season==='Autumn'?new Color4(.8,.44,.17,.32):new Color4(.9,.85,.5,.26);this.motes.color2=new Color4(.95,.93,.8,.2);
    const sunWorld=position.add(sunDir.scale(800));const underwaterNow=this.underwater.immersionLevel>.01||submerged;
    this.underwater.setSunDirection(sunDir);
    const godIntensity=this.settings.godRays&&!alien&&!underwaterNow?Math.min(1,day*3)*(raining?.35:1)*(this.bloodMoon?.5:1):0;
    this.godRays.update(sunWorld,godIntensity*(golden>0?1.1:.55),golden>0?new Color3(1,.62,.36):new Color3(1,.92,.72));
    this.depth.enabled=godIntensity>.001||underwaterNow;
    const overworldSky=this.dimension==='overworld'||this.dimension==='sky';
    const cover=raining?1:0;
    this.nightSky.update(dt,position,{
      stars:(overworldSky?night:this.dimension==='end'?.6:0)*(1-cover*.85),
      aurora:overworldSky?night*(season==='Winter'?1:.7)*(1-cover*.9):0,
      shooting:overworldSky?night*(1-cover):0,
      aur1:this.dimension==='sky'?new Color3(.3,1,.8):new Color3(.2,1,.45),
      aur2:this.dimension==='sky'?new Color3(.7,.4,1):new Color3(.45,.25,1),
      reducedMotion:this.settings.reducedMotion,
    });
    this.lightning.update(dt,weather,position,alien,this.settings.reducedMotion);
    if(this.lightning.flashIntensity>0){this.ambient.intensity=Math.max(this.ambient.intensity,2.1*this.lightning.flashIntensity);this.sun.intensity+=this.lightning.flashIntensity*.8;}
    if (this.ssr) this.ssr.isEnabled = this.settings.quality !== 'performance'
      && this.ssr.isSupported
      && (this.settings.softwareRayTracing || (this.settings.wetReflections && raining));
    this.underwater.update(dt,this.dimension,submergedOverride);
  }
  dispose(){this.rain.dispose();this.snow.dispose();this.motes.dispose();this.underwater.dispose();this.godRays.dispose();this.nightSky.dispose();this.lightning.dispose();this.ssr?.dispose();this.pipeline.dispose();this.glow.dispose();this.probe.dispose();this.shadow.dispose();}
}
