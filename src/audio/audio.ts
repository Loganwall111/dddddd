// Simple procedural audio system. Generates sound effects via WebAudio so no
// binary assets are needed for Phase 1. Also supports positional audio.

export class AudioSystem {
  ctx: AudioContext | null = null;
  masterGain: GainNode | null = null;
  masterVolume = 0.7;

  ensure() {
    if (this.ctx) return;
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx: AudioContext = new AC();
    this.ctx = ctx;
    const mg = ctx.createGain();
    mg.gain.value = this.masterVolume;
    mg.connect(ctx.destination);
    this.masterGain = mg;
  }
  setVolume(v: number) {
    this.masterVolume = Math.max(0, Math.min(1, v));
    if (this.masterGain) this.masterGain.gain.value = this.masterVolume;
  }

  private tone(freq: number, duration: number, type: OscillatorType = "sine", gain = 0.2, slideTo?: number) {
    this.ensure(); if (!this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + duration);
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(gain, ctx.currentTime + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    o.connect(g); g.connect(this.masterGain);
    o.start(); o.stop(ctx.currentTime + duration + 0.02);
  }

  private noise(duration: number, filterFreq = 1000, q = 1, gain = 0.3) {
    this.ensure(); if (!this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const bufSize = Math.floor(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random()*2-1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = filterFreq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(gain, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    src.connect(f); f.connect(g); g.connect(this.masterGain);
    src.start(); src.stop(ctx.currentTime + duration + 0.02);
  }

  jump() { this.tone(380, 0.12, "square", 0.12, 540); }
  land() { this.noise(0.08, 200, 2, 0.18); }
  breakBlock() { this.noise(0.12, 500, 1.5, 0.22); this.tone(220,0.06,"sawtooth",0.08,120); }
  placeBlock() { this.tone(200, 0.06, "square", 0.15, 180); this.noise(0.05, 400, 2, 0.08); }
  mineTick() { this.noise(0.04, 800, 3, 0.08); }
  pickup() { this.tone(660, 0.06, "sine", 0.15, 880); setTimeout(()=>this.tone(880,0.08,"sine",0.15,1320),60); }
  click() { this.tone(500, 0.03, "square", 0.1); }
  explosion() { this.noise(0.9, 120, 0.6, 0.5); this.tone(60, 0.5, "sawtooth", 0.4, 30); }
  thunder() { this.noise(1.6, 90, 0.4, 0.4); this.tone(45, 1.2, "sawtooth", 0.25, 25); }
  fuse() { this.tone(200, 0.08, "square", 0.08, 220); }
  hurt() { this.noise(0.15, 400, 1, 0.2); this.tone(180,0.1,"sawtooth",0.15,100); }
  portal() { this.tone(220, 0.6, "sine", 0.25, 880); }
  uiClick() { this.tone(800, 0.03, "square", 0.08); }
  openInventory() { this.tone(400,0.05,"sine",0.1); setTimeout(()=>this.tone(600,0.05,"sine",0.08),40); }
  eat() { this.noise(0.1, 300, 2, 0.15); setTimeout(()=>this.noise(0.1,300,2,0.12),120); }
  step(surface: "grass"|"stone"|"wood"|"sand"|"gravel" = "grass") {
    const freq = surface === "stone" ? 800 : surface === "wood" ? 500 : surface === "sand" ? 400 : 700;
    this.noise(0.05, freq, 2, 0.08);
  }
}
