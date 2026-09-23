// Procedural physics audio: every sound is synthesized from simulation state.
// Water loudness follows flow energy, wind follows storm intensity, impacts and
// thunder are filtered-noise one-shots. No audio files.

export class LabAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private waterGain: GainNode | null = null;
  private waterFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private underwaterFilter: BiquadFilterNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private lastSplash = 0;
  enabled = true;

  private ensure(): boolean {
    if (!this.enabled) return false;
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.7;
        this.underwaterFilter = this.ctx.createBiquadFilter();
        this.underwaterFilter.type = "lowpass";
        this.underwaterFilter.frequency.value = 20000;
        this.master.connect(this.underwaterFilter);
        this.underwaterFilter.connect(this.ctx.destination);
        // shared 2s noise buffer
        const len = this.ctx.sampleRate * 2;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        // water loop
        const water = this.ctx.createBufferSource();
        water.buffer = this.noiseBuf; water.loop = true;
        this.waterFilter = this.ctx.createBiquadFilter();
        this.waterFilter.type = "bandpass"; this.waterFilter.frequency.value = 900; this.waterFilter.Q.value = 0.6;
        this.waterGain = this.ctx.createGain(); this.waterGain.gain.value = 0;
        water.connect(this.waterFilter); this.waterFilter.connect(this.waterGain); this.waterGain.connect(this.master);
        water.start();
        // wind loop
        const wind = this.ctx.createBufferSource();
        wind.buffer = this.noiseBuf; wind.loop = true; wind.playbackRate.value = 0.4;
        const wf = this.ctx.createBiquadFilter();
        wf.type = "lowpass"; wf.frequency.value = 320;
        this.windGain = this.ctx.createGain(); this.windGain.gain.value = 0;
        wind.connect(wf); wf.connect(this.windGain); this.windGain.connect(this.master);
        wind.start();
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return true;
    } catch {
      return false;
    }
  }

  unlock(): void {
    this.ensure();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(on ? 0.7 : 0, this.ctx.currentTime, 0.1);
    }
  }

  /** Continuous mix driven by simulation metrics. Call every frame. */
  update(flowEnergy: number, windStrength: number, underwater: boolean): void {
    if (!this.ensure() || !this.ctx) return;
    const t = this.ctx.currentTime;
    const w = Math.min(0.5, flowEnergy * 0.02);
    this.waterGain?.gain.setTargetAtTime(w, t, 0.25);
    this.waterFilter?.frequency.setTargetAtTime(500 + Math.min(2500, flowEnergy * 60), t, 0.3);
    this.windGain?.gain.setTargetAtTime(Math.min(0.4, windStrength * 0.012), t, 0.4);
    this.underwaterFilter?.frequency.setTargetAtTime(underwater ? 500 : 20000, t, 0.2);
  }

  private oneShot(dur: number, filterFreq: number, type: BiquadFilterType, peak: number, rate = 1): void {
    if (!this.ensure() || !this.ctx || !this.master || !this.noiseBuf) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.playbackRate.value = rate;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  splash(intensity: number): void {
    const now = performance.now();
    if (now - this.lastSplash < 90 || intensity < 2) return;
    this.lastSplash = now;
    this.oneShot(0.25 + Math.random() * 0.2, 1400 + Math.random() * 1800, "bandpass", Math.min(0.4, intensity * 0.012));
  }

  explosion(big: number): void {
    this.oneShot(1.4, 120, "lowpass", Math.min(0.8, 0.3 + big * 0.1), 0.5);
    this.oneShot(0.4, 2500, "highpass", 0.2, 1.4);
  }

  thunder(delayMs = 0): void {
    window.setTimeout(() => this.oneShot(2.2, 90, "lowpass", 0.55, 0.35), delayMs);
  }

  crack(): void {
    this.oneShot(0.18, 3000, "highpass", 0.22, 0.8 + Math.random() * 0.5);
  }

  portal(): void {
    if (!this.ensure() || !this.ctx || !this.master) return;
    try {
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(180, t);
      o.frequency.exponentialRampToValueAtTime(1400, t + 0.35);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + 0.55);
    } catch { /* audio unavailable */ }
  }

  /** One-shot weapon shot: filtered-noise crack + low thump. */
  gunshot(kind: "pistol" | "rifle" | "rocket" | "smg" | "shotgun"): void {
    if (!this.ensure()) return;
    const ctx = this.ctx!;
    const master = this.master!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = kind === "rocket" ? "lowpass" : "bandpass";
    f.frequency.value = kind === "pistol" ? 2400 : kind === "rifle" ? 1900 : kind === "smg" ? 2900 : kind === "shotgun" ? 950 : 700;
    f.Q.value = 0.8;
    const g = ctx.createGain();
    const peak = kind === "pistol" ? 0.5 : kind === "rifle" ? 0.36 : kind === "smg" ? 0.28 : kind === "shotgun" ? 0.62 : 0.6;
    const dur = kind === "rocket" ? 0.5 : kind === "shotgun" ? 0.2 : kind === "smg" ? 0.09 : 0.14;
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur);
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(kind === "rocket" ? 90 : 140, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    const og = ctx.createGain();
    og.gain.setValueAtTime(kind === "rocket" ? 0.7 : 0.3, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(og); og.connect(master);
    osc.start(t); osc.stop(t + 0.16);
  }

  throwWhoosh(): void {
    if (!this.ensure()) return;
    const ctx = this.ctx!;
    const master = this.master!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.4;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(2400, t + 0.22);
    f.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + 0.32);
  }

  dispose(): void {
    try {
      void this.ctx?.close();
    } catch { /* already closed */ }
    this.ctx = null;
  }
}
