// Sky: atmospheric sun/moon, simple procedural clouds as sprites/planes, stars,
// and a dynamic day/night color gradient. Also drives a directional sun light
// with shadows.
import {
  Scene, DirectionalLight, Vector3, Color3, Color4,
  MeshBuilder, StandardMaterial, DynamicTexture, HemisphericLight, GlowLayer,
  ShadowGenerator, Matrix, VertexData, Mesh
} from "@babylonjs/core";
import { DIMENSIONS, DimensionDef } from "../dimensions/dimensions";

export interface SkyState {
  timeOfDay: number; // 0..1, 0.25=sunrise, 0.5=noon, 0.75=sunset, 0/1=midnight
  timeSpeed: number; // how fast time passes (fraction per second)
  dimension: DimensionDef;
}

export class SkySystem {
  scene: Scene;
  sun: DirectionalLight;
  moon: DirectionalLight;
  hemi: HemisphericLight;
  glow?: GlowLayer;
  sunMesh: any;
  moonMesh: any;
  skyMat: StandardMaterial;
  skyMesh: any;
  clouds: any[] = [];
  starsMat: StandardMaterial;
  starsMesh: any;
  state: SkyState;
  shadows?: ShadowGenerator;

  constructor(scene: Scene) {
    this.scene = scene;
    this.state = { timeOfDay: 0.3, timeSpeed: 1 / 600, dimension: DIMENSIONS.overworld };

    // Lights
    this.hemi = new HemisphericLight("hemi", new Vector3(0,1,0), scene);
    this.hemi.intensity = 0.45;

    this.sun = new DirectionalLight("sun", new Vector3(0,-1,0), scene);
    this.sun.intensity = 1.2;
    this.sun.diffuse = new Color3(1, 0.95, 0.8);

    this.moon = new DirectionalLight("moon", new Vector3(0,1,0), scene);
    this.moon.intensity = 0.25;
    this.moon.diffuse = new Color3(0.6,0.7,1.0);

    // Sky dome (a large inverted sphere with a gradient material)
    this.skyMesh = MeshBuilder.CreateSphere("skydome", { diameter: 900, segments: 32 }, scene);
    this.skyMesh.isPickable = false;
    this.skyMesh.infiniteDistance = true;
    this.skyMat = new StandardMaterial("skymat", scene);
    this.skyMat.disableLighting = true;
    this.skyMat.backFaceCulling = false;
    this.skyMesh.material = this.skyMat;
    // Flip normals by scaling
    this.skyMesh.scaling.set(-1,1,-1);

    // Sun and moon billboards
    this.sunMesh = MeshBuilder.CreateSphere("sun", { diameter: 30 }, scene);
    this.sunMesh.isPickable = false;
    this.sunMesh.infiniteDistance = true;
    const sunMat = new StandardMaterial("sunmat", scene);
    sunMat.disableLighting = true; sunMat.emissiveColor = new Color3(1, 0.9, 0.6);
    this.sunMesh.material = sunMat;

    this.moonMesh = MeshBuilder.CreateSphere("moon", { diameter: 20 }, scene);
    this.moonMesh.isPickable = false;
    this.moonMesh.infiniteDistance = true;
    const moonMat = new StandardMaterial("moonmat", scene);
    moonMat.disableLighting = true; moonMat.emissiveColor = new Color3(0.85, 0.9, 1);
    this.moonMesh.material = moonMat;

    // Stars (points)
    this.starsMesh = this.buildStars();
    this.starsMat = (this.starsMesh.material as StandardMaterial);

    // Clouds: sprite planes
    this.createClouds();

    // Glow
    try {
      this.glow = new GlowLayer("glow", scene, { mainTextureFixedSize: 256 });
      this.glow.intensity = 0.35;
    } catch(e) { /* HDR required; skip if unavailable */ }
  }

  private buildStars() {
    // Star dome sphere with a painted stars texture
    const starDome = MeshBuilder.CreateSphere("starDome", { diameter: 800, segments: 24 }, this.scene);
    starDome.isPickable = false;
    starDome.infiniteDistance = true;
    starDome.scaling.set(-1,1,-1);
    const starCanvas = document.createElement("canvas");
    starCanvas.width = 512; starCanvas.height = 512;
    const sctx = starCanvas.getContext("2d")!;
    sctx.fillStyle = "rgba(0,0,0,0)";
    sctx.fillRect(0,0,512,512);
    for (let i = 0; i < 600; i++) {
      const x = Math.random()*512, y = Math.random()*512;
      const r = Math.random()*1.2+0.4;
      const a = Math.random()*0.9+0.1;
      sctx.fillStyle = `rgba(255,255,255,${a})`;
      sctx.fillRect(x,y,r,r);
      // halo
      const g = sctx.createRadialGradient(x+r/2,y+r/2,0,x+r/2,y+r/2,r*2);
      g.addColorStop(0, `rgba(220,230,255,${a*0.4})`);
      g.addColorStop(1, `rgba(255,255,255,0)`);
      sctx.fillStyle = g;
      sctx.beginPath(); sctx.arc(x+r/2,y+r/2,r*2,0,Math.PI*2); sctx.fill();
    }
    // Milky way band
    const mg = sctx.createLinearGradient(0, 200, 512, 320);
    mg.addColorStop(0, "rgba(120,140,200,0)");
    mg.addColorStop(0.5, "rgba(180,200,255,0.15)");
    mg.addColorStop(1, "rgba(120,140,200,0)");
    sctx.fillStyle = mg;
    sctx.fillRect(0,180,512,160);
    const mat = new StandardMaterial("starsmat", this.scene);
    mat.disableLighting = true;
    mat.useAlphaFromDiffuseTexture = true;
    mat.backFaceCulling = false;
    const tex = new DynamicTexture("startex", { width:512, height:512 } as any, this.scene, false);
    const tctx = tex.getContext() as CanvasRenderingContext2D;
    (tctx as any).drawImage(starCanvas,0,0);
    tex.update(false);
    tex.hasAlpha = true;
    mat.diffuseTexture = tex;
    mat.emissiveColor = new Color3(1,1,1);
    starDome.material = mat;
    return starDome;
  }

  private createClouds() {
    for (let i = 0; i < 12; i++) {
      const c = MeshBuilder.CreatePlane(`cloud${i}`, { width: 60 + Math.random()*60, height: 20 + Math.random()*20 }, this.scene);
      c.isPickable = false; c.infiniteDistance = true;
      const mat = new StandardMaterial(`cloudmat${i}`, this.scene);
      mat.disableLighting = true;
      mat.emissiveColor = new Color3(1,1,1);
      mat.alpha = 0.75;
      // Generate cloud texture
      const tex = this.makeCloudTexture();
      mat.diffuseTexture = tex;
      mat.opacityTexture = tex;
      c.material = mat;
      const angle = Math.random() * Math.PI * 2;
      const dist = 300 + Math.random()*100;
      c.position.set(Math.cos(angle)*dist, 90 + Math.random()*20, Math.sin(angle)*dist);
      c.rotation.y = angle + Math.PI/2;
      this.clouds.push(c);
    }
  }

  private makeCloudTexture() {
    const c = document.createElement("canvas");
    c.width = 64; c.height = 32;
    const ctx = c.getContext("2d")!;
    const g = ctx.createLinearGradient(0,0,0,32);
    g.addColorStop(0,"rgba(255,255,255,0)");
    g.addColorStop(0.3,"rgba(255,255,255,0.8)");
    g.addColorStop(0.7,"rgba(255,255,255,0.8)");
    g.addColorStop(1,"rgba(255,255,255,0)");
    ctx.fillStyle = g;
    // Puffs
    for (let i = 0; i < 8; i++) {
      const x = Math.random()*64;
      const y = 8 + Math.random()*16;
      const r = 4 + Math.random()*8;
      const pg = ctx.createRadialGradient(x,y,1,x,y,r);
      pg.addColorStop(0,"rgba(255,255,255,0.9)");
      pg.addColorStop(1,"rgba(255,255,255,0)");
      ctx.fillStyle = pg;
      ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
    }
    const tex = new DynamicTexture("cloudtex", c as any, this.scene, false);
    tex.hasAlpha = true;
    return tex;
  }

  enableShadows() {
    this.shadows = new ShadowGenerator(1024, this.sun);
    this.shadows.useBlurExponentialShadowMap = true;
    this.shadows.blurKernel = 32;
    this.shadows.depthScale = 60;
  }

  setDimension(dim: DimensionDef) {
    this.state.dimension = dim;
    this.scene.ambientColor = new Color3(dim.ambient[0], dim.ambient[1], dim.ambient[2]);
    this.hemi.groundColor = new Color3(dim.ambient[0]*0.3, dim.ambient[1]*0.3, dim.ambient[2]*0.3);
  }

  update(dt: number) {
    this.state.timeOfDay = (this.state.timeOfDay + dt * this.state.timeSpeed) % 1;
    const t = this.state.timeOfDay;
    // Sun angle: sunrise at 0.25 (east, low), noon at 0.5 (overhead), sunset at 0.75, midnight 0
    const sunAngle = (t - 0.25) * Math.PI * 2;
    const sunDir = new Vector3(-Math.cos(sunAngle), Math.sin(sunAngle), 0.3);
    this.sun.direction.copyFrom(sunDir.negate());
    this.moon.direction.copyFrom(sunDir);

    // Position sun/moon in sky
    const r = 450;
    this.sunMesh.position.copyFrom(sunDir.scale(r));
    this.moonMesh.position.copyFrom(sunDir.scale(-r));

    // Daylight intensity curve
    const dayFactor = Math.max(0, Math.sin((t - 0.25) * Math.PI * 2));
    const twilight = Math.max(0, 1 - Math.abs(dayFactor - 0.25)*6);
    this.sun.intensity = 1.2 * dayFactor;
    this.moon.intensity = 0.25 * (1 - dayFactor);
    this.hemi.intensity = 0.25 + 0.3 * dayFactor;

    // Sky color gradient
    const dim = this.state.dimension;
    let topColor: Color3, bottomColor: Color3;
    if (dim.id === "nether") {
      topColor = new Color3(0.25,0.05,0.05);
      bottomColor = new Color3(0.5,0.15,0.08);
    } else if (dim.id === "end") {
      topColor = new Color3(0.05,0.02,0.1);
      bottomColor = new Color3(0.1,0.05,0.18);
    } else {
      // Day colors
      const day = new Color3(0.3,0.55,0.95);
      const sunset = new Color3(1.0,0.45,0.2);
      const night = new Color3(0.03,0.04,0.12);
      if (dayFactor > 0.3) {
        topColor = day;
        bottomColor = new Color3(0.7,0.8,1.0);
      } else if (dayFactor > 0.01) {
        const k = dayFactor / 0.3;
        topColor = sunset.scale(1 - k).add(day.scale(k));
        bottomColor = new Color3(1.0,0.55,0.3).scale(1 - k).add(new Color3(0.8,0.85,1.0).scale(k));
      } else {
        topColor = night;
        bottomColor = new Color3(0.1,0.07,0.2);
      }
    }
    this.skyMat.emissiveColor = topColor;
    // Use scene fog
    this.scene.fogColor = bottomColor;
    this.scene.fogMode = 2; // EXP
    this.scene.fogDensity = dim.id === "nether" ? 0.018 : (dim.id === "end" ? 0.012 : 0.008);
    // Hemisphere light colors
    this.hemi.diffuse = topColor;
    this.hemi.groundColor = new Color3(0.3,0.25,0.2);

    // Sun material
    (this.sunMesh.material as StandardMaterial).emissiveColor = dayFactor > 0.1 ? new Color3(1,0.9,0.6) : new Color3(0.3,0.3,0.5);
    (this.moonMesh.material as StandardMaterial).emissiveColor = dayFactor < 0.2 ? new Color3(0.85,0.9,1) : new Color3(0.1,0.1,0.15);
    this.sunMesh.isVisible = dim.hasSky;
    this.moonMesh.isVisible = dim.hasSky && dayFactor < 0.3;
    this.starsMesh.isVisible = dim.hasSky && dayFactor < 0.2;
    this.clouds.forEach(c => c.isVisible = dim.id === "overworld");
    if (this.glow) this.glow.intensity = 0.3 + 0.2 * (1 - dayFactor);

    // Move clouds slowly
    for (const c of this.clouds) {
      c.rotation.y += dt * 0.002;
      // drift
      c.position.x += dt * 0.3;
      if (c.position.x > 400) c.position.x = -400;
    }

    // Update shadow light direction
    if (this.shadows) {
      this.shadows.getShadowMap()?.refreshRate;
    }
  }
}
