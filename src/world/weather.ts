// Simple weather system: rain with particles, sky dimming, and occasional thunder.
import { Scene, ParticleSystem, Color4, Vector3, Texture } from "@babylonjs/core";

export class WeatherSystem {
  scene: Scene;
  raining = false;
  private rain?: ParticleSystem;
  private emitterPos = new Vector3(0, 0, 0);
  private changeTimer = 60; // seconds until next weather decision
  onThunder?: () => void;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  private makeRainTexture(): Texture {
    const c = document.createElement("canvas");
    c.width = 8; c.height = 8;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, 8, 8);
    ctx.fillStyle = "rgba(180,200,255,0.9)";
    ctx.fillRect(3, 0, 2, 8);
    const tex = new Texture(c as any, this.scene, false, false);
    tex.hasAlpha = true;
    return tex;
  }

  setRaining(on: boolean) {
    if (on === this.raining) return;
    this.raining = on;
    if (on) {
      this.rain = new ParticleSystem("rain", 1500, this.scene);
      this.rain.particleTexture = this.makeRainTexture();
      this.rain.emitter = this.emitterPos;
      this.rain.minEmitBox = new Vector3(-24, 20, -24);
      this.rain.maxEmitBox = new Vector3(24, 28, 24);
      this.rain.color1 = new Color4(0.6, 0.7, 0.95, 0.55);
      this.rain.color2 = new Color4(0.5, 0.6, 0.9, 0.45);
      this.rain.colorDead = new Color4(0.5, 0.6, 0.9, 0);
      this.rain.minSize = 0.06; this.rain.maxSize = 0.1;
      this.rain.minLifeTime = 0.7; this.rain.maxLifeTime = 1.0;
      this.rain.emitRate = 900;
      this.rain.gravity = new Vector3(0, -40, 0);
      this.rain.direction1 = new Vector3(-1, -8, -1);
      this.rain.direction2 = new Vector3(1, -12, 1);
      this.rain.minEmitPower = 8; this.rain.maxEmitPower = 14;
      this.rain.blendMode = ParticleSystem.BLENDMODE_STANDARD;
      this.rain.start();
    } else if (this.rain) {
      this.rain.stop();
      const r = this.rain;
      setTimeout(() => r.dispose(), 2000);
      this.rain = undefined;
    }
  }

  // Called each frame; keeps the rain box centered on the player and rolls weather.
  update(dt: number, playerPos: Vector3, dimOverworld: boolean) {
    this.emitterPos.copyFrom(playerPos);
    if (!dimOverworld) { this.setRaining(false); return; }
    this.changeTimer -= dt;
    if (this.changeTimer <= 0) {
      this.changeTimer = 90 + Math.random() * 120;
      const willRain = Math.random() < 0.28;
      this.setRaining(willRain);
    }
    // occasional thunder while raining
    if (this.raining && Math.random() < dt * 0.02) {
      if (this.onThunder) this.onThunder();
    }
  }
}
