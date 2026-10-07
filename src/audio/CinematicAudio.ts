type AudioScene = string;

export interface RealmAudioProfile {
  frequencies: [number, number, number];
  filter: [number, number];
  shimmer: [number, number];
  noiseLevel: number;
  melodyBase: number;
}

interface ActiveVoice {
  stop: () => void;
}

class CinematicAudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambience: ActiveVoice | null = null;
  private scene: AudioScene = "boot";
  private profile: RealmAudioProfile | null = null;
  private volume = 0.55;
  private unlocked = false;
  private lastHover = 0;
  private lastFootstep = 0;

  setScene(scene: AudioScene, volume: number, profile?: RealmAudioProfile) {
    const changed = scene !== this.scene || (profile && JSON.stringify(profile) !== JSON.stringify(this.profile));
    this.scene = scene;
    if (profile) this.profile = profile;
    this.volume = Math.max(0, Math.min(1, volume / 100));
    if (this.master) this.master.gain.setTargetAtTime(this.volume * 0.62, this.context!.currentTime, 0.12);
    if (this.unlocked && (changed || !this.ambience)) this.startAmbience();
  }

  async unlock() {
    if (!this.context) this.createContext();
    if (!this.context) return;
    await this.context.resume();
    if (!this.unlocked) {
      this.unlocked = true;
      this.startAmbience();
      this.cinematicHit(0.75);
    }
  }

  whoosh(pitch = 1) {
    if (!this.unlocked || !this.context || !this.master) return;
    const now = this.context.currentTime;
    const noise = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    noise.buffer = this.createNoise(0.4);
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(600 * pitch, now);
    filter.frequency.exponentialRampToValueAtTime(2400 * pitch, now + 0.25);
    filter.Q.value = 2.5;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    noise.connect(filter).connect(gain).connect(this.master);
    noise.start(now);
    noise.stop(now + 0.45);
  }

  thump() {
    if (!this.unlocked || !this.context || !this.master) return;
    const now = this.context.currentTime;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.2);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.15, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.35);
  }

  footstep(speed = 1) {
    const now = performance.now();
    if (!this.unlocked || !this.context || !this.master) return;
    const interval = Math.max(180, 420 - speed * 60);
    if (now - this.lastFootstep < interval) return;
    this.lastFootstep = now;
    const t = this.context.currentTime;
    const noise = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    const pan = this.context.createStereoPanner();
    noise.buffer = this.createNoise(0.1);
    filter.type = "bandpass";
    filter.frequency.value = 180 + Math.random() * 80;
    filter.Q.value = 2.4;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.045 + speed * 0.03, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    pan.pan.value = (Math.random() - 0.5) * 0.4;
    noise.connect(filter).connect(gain).connect(pan).connect(this.master);
    noise.start(t);
    noise.stop(t + 0.13);
  }

  hover() {
    const now = performance.now();
    if (!this.unlocked || !this.context || !this.master || now - this.lastHover < 70) return;
    this.lastHover = now;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(390, this.context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(620, this.context.currentTime + 0.065);
    filter.type = "bandpass";
    filter.frequency.value = 720;
    filter.Q.value = 1.4;
    gain.gain.setValueAtTime(0.0001, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.022, this.context.currentTime + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + 0.11);
    oscillator.connect(filter).connect(gain).connect(this.master);
    oscillator.start();
    oscillator.stop(this.context.currentTime + 0.12);
  }

  select() {
    if (!this.unlocked || !this.context || !this.master) return;
    const now = this.context.currentTime;
    [94, 141, 282].forEach((frequency, index) => {
      const oscillator = this.context!.createOscillator();
      const gain = this.context!.createGain();
      oscillator.type = index === 0 ? "sine" : "triangle";
      oscillator.frequency.setValueAtTime(frequency, now);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.35, now + 0.22);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.035 / (index + 1), now + index * 0.018 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34 + index * 0.04);
      oscillator.connect(gain).connect(this.master!);
      oscillator.start(now + index * 0.018);
      oscillator.stop(now + 0.45);
    });
  }

  cinematicHit(intensity = 1) {
    if (!this.unlocked || !this.context || !this.master) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const lowpass = this.context.createBiquadFilter();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(68, now);
    oscillator.frequency.exponentialRampToValueAtTime(27, now + 1.5);
    lowpass.type = "lowpass";
    lowpass.frequency.value = 180;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18 * intensity, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.7);
    oscillator.connect(lowpass).connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + 1.8);
    this.noiseBurst(0.8 * intensity, 110, 1.2);
  }

  transition(inward: boolean) {
    if (!this.unlocked || !this.context || !this.master) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = "sawtooth";
    oscillator.frequency.setValueAtTime(inward ? 150 : 36, now);
    oscillator.frequency.exponentialRampToValueAtTime(inward ? 28 : 320, now + 1.5);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.035, now + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.65);
    oscillator.connect(gain).connect(this.master);
    oscillator.start();
    oscillator.stop(now + 1.7);
  }

  discovery() {
    if (!this.unlocked || !this.context || !this.master) return;
    const now = this.context.currentTime;
    [220, 330, 440, 660].forEach((frequency, index) => {
      const oscillator = this.context!.createOscillator();
      const gain = this.context!.createGain();
      const pan = this.context!.createStereoPanner();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      pan.pan.value = -0.6 + index * 0.4;
      gain.gain.setValueAtTime(0.0001, now + index * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.025, now + index * 0.09 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.09 + 0.65);
      oscillator.connect(pan).connect(gain).connect(this.master!);
      oscillator.start(now + index * 0.09);
      oscillator.stop(now + index * 0.09 + 0.7);
    });
  }

  attack() {
    if (!this.unlocked || !this.context || !this.master) return;
    const now = this.context.currentTime;
    const sweep = this.context.createOscillator();
    const gain = this.context.createGain();
    sweep.type = "sawtooth";
    sweep.frequency.setValueAtTime(260, now);
    sweep.frequency.exponentialRampToValueAtTime(62, now + 0.28);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.075, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
    sweep.connect(gain).connect(this.master);
    sweep.start(now);
    sweep.stop(now + 0.34);
    this.noiseBurst(0.22, 900, 0.8);
  }

  grab() {
    if (!this.unlocked || !this.context || !this.master) return;
    const now = this.context.currentTime;
    [110, 165, 247].forEach((f, i) => {
      const osc = this.context!.createOscillator();
      const gain = this.context!.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(f * 0.6, now + i * 0.05);
      osc.frequency.exponentialRampToValueAtTime(f * 1.4, now + i * 0.05 + 0.22);
      gain.gain.setValueAtTime(0.0001, now + i * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.05 / (i + 1), now + i * 0.05 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.05 + 0.4);
      osc.connect(gain).connect(this.master!);
      osc.start(now + i * 0.05);
      osc.stop(now + i * 0.05 + 0.45);
    });
  }

  pickup() {
    if (!this.unlocked || !this.context || !this.master) return;
    const now = this.context.currentTime;
    [660, 880, 990].forEach((f, i) => {
      const osc = this.context!.createOscillator();
      const gain = this.context!.createGain();
      osc.type = "triangle";
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, now + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.028, now + i * 0.06 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.06 + 0.35);
      osc.connect(gain).connect(this.master!);
      osc.start(now + i * 0.06);
      osc.stop(now + i * 0.06 + 0.4);
    });
  }

  private createContext() {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    this.context = new AudioContextClass();
    this.master = this.context.createGain();
    const compressor = this.context.createDynamicsCompressor();
    const convolver = this.context.createConvolver();
    convolver.buffer = this.createImpulse(2.8, 2.7);
    this.master.gain.value = this.volume * 0.62;
    this.master.connect(compressor);
    this.master.connect(convolver);
    convolver.connect(compressor);
    compressor.threshold.value = -18;
    compressor.knee.value = 18;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.02;
    compressor.release.value = 0.5;
    compressor.connect(this.context.destination);
  }

  private startAmbience() {
    if (!this.context || !this.master) return;
    this.ambience?.stop();
    const defaults: Record<string, RealmAudioProfile> = {
      boot: { frequencies: [32, 48, 96], filter: [310, 0.8], shimmer: [1480, 1.1], noiseLevel: 0.025, melodyBase: 146.83 },
      menu: { frequencies: [38, 57, 114], filter: [310, 0.8], shimmer: [1480, 1.1], noiseLevel: 0.025, melodyBase: 146.83 },
      loading: { frequencies: [27, 54, 162], filter: [310, 0.8], shimmer: [1480, 1.1], noiseLevel: 0.025, melodyBase: 146.83 },
    };
    const defaultsByKey: Record<string, RealmAudioProfile> = {
      void: { frequencies: [19, 38, 76], filter: [280, 0.9], shimmer: [1480, 1.1], noiseLevel: 0.02, melodyBase: 146.83 },
      galaxy: { frequencies: [24, 48, 96], filter: [310, 0.9], shimmer: [1380, 1.1], noiseLevel: 0.025, melodyBase: 146.83 },
      cosmos: { frequencies: [31, 46, 92], filter: [310, 0.8], shimmer: [1380, 1.1], noiseLevel: 0.025, melodyBase: 164.81 },
      planet: { frequencies: [52, 78, 156], filter: [720, 0.8], shimmer: [980, 1.1], noiseLevel: 0.09, melodyBase: 196 },
      micro: { frequencies: [67, 101, 202], filter: [720, 0.8], shimmer: [720, 1.1], noiseLevel: 0.06, melodyBase: 220 },
      atomic: { frequencies: [89, 178, 356], filter: [900, 0.9], shimmer: [1480, 1.2], noiseLevel: 0.04, melodyBase: 246.94 },
      quantum: { frequencies: [41, 123, 369], filter: [1100, 4], shimmer: [1480, 1.1], noiseLevel: 0.03, melodyBase: 261.63 },
      ...defaults,
    };
    const profile = this.profile ?? defaultsByKey[this.scene] ?? defaults.menu!;
    const frequencies = profile.frequencies;
    const melodyBase = profile.melodyBase;
    const noiseLevel = profile.noiseLevel;
    const scene = this.scene;
    const nodes: OscillatorNode[] = [];
    const sceneGain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    const shimmer = this.context.createBiquadFilter();
    const noise = this.context.createBufferSource();
    const noiseGain = this.context.createGain();
    sceneGain.gain.value = 0.0001;
    sceneGain.gain.exponentialRampToValueAtTime(0.13, this.context.currentTime + 1.5);
    filter.type = "lowpass";
    filter.frequency.value = profile.filter[0];
    filter.Q.value = profile.filter[1];
    shimmer.type = "bandpass";
    shimmer.frequency.value = profile.shimmer[0];
    shimmer.Q.value = profile.shimmer[1];
    frequencies.forEach((frequency, index) => {
      const oscillator = this.context!.createOscillator();
      const voiceGain = this.context!.createGain();
      const panner = this.context!.createStereoPanner();
      oscillator.type = index === 2 && scene === "quantum" ? "triangle" : "sine";
      oscillator.frequency.value = frequency;
      oscillator.detune.value = index === 1 ? 4 : index === 2 ? -7 : 0;
      voiceGain.gain.value = [0.42, 0.18, 0.055][index] ?? 0.1;
      panner.pan.value = index === 0 ? 0 : index === 1 ? -0.45 : 0.45;
      oscillator.connect(voiceGain).connect(panner).connect(filter);
      oscillator.start();
      nodes.push(oscillator);
    });
    noise.buffer = this.createNoise(5);
    noise.loop = true;
    noiseGain.gain.value = noiseLevel;
    noise.connect(shimmer).connect(noiseGain).connect(sceneGain);
    filter.connect(sceneGain);
    sceneGain.connect(this.master);
    noise.start();

    // Generative ambient melody: pentatonic plucks drifting over the pad.
    let melodyInterval: number | null = null;
    if (scene !== "loading") {
      const scale = [0, 3, 5, 7, 10, 12, 15, 17];
      const baseFreq = melodyBase;
      let step = 0;
      const playPluck = () => {
        if (!this.context || !this.master) return;
        const degree = scale[(step * 3 + Math.floor(Math.random() * 4)) % scale.length];
        const freq = baseFreq * Math.pow(2, degree / 12) * (Math.random() > 0.82 ? 2 : 1);
        const now = this.context.currentTime;
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();
        const pan = this.context.createStereoPanner();
        osc.type = scene === "micro" ? "sine" : "triangle";
        osc.frequency.value = freq;
        pan.pan.value = (Math.random() - 0.5) * 0.9;
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(scene === "boot" ? 0.012 : 0.026, now + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.9 + Math.random() * 1.4);
        osc.connect(pan).connect(gain).connect(this.master!);
        osc.start(now);
        osc.stop(now + 3.4);
        step += 1;
      };
      playPluck();
      melodyInterval = window.setInterval(playPluck, 1900 + Math.random() * 400);
    }

    this.ambience = {
      stop: () => {
        if (melodyInterval !== null) window.clearInterval(melodyInterval);
        const time = this.context?.currentTime ?? 0;
        sceneGain.gain.cancelScheduledValues(time);
        sceneGain.gain.setTargetAtTime(0.0001, time, 0.12);
        window.setTimeout(() => {
          nodes.forEach((node) => { try { node.stop(); } catch { /* Voice already ended. */ } });
          try { noise.stop(); } catch { /* Noise already ended. */ }
          sceneGain.disconnect();
        }, 650);
      },
    };
  }

  private noiseBurst(duration: number, frequency: number, amount: number) {
    if (!this.context || !this.master) return;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = this.createNoise(duration);
    filter.type = "lowpass";
    filter.frequency.value = frequency;
    gain.gain.setValueAtTime(0.12 * amount, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + duration);
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
  }

  private createNoise(seconds: number) {
    const length = Math.floor((this.context?.sampleRate ?? 44100) * seconds);
    const buffer = this.context!.createBuffer(2, length, this.context!.sampleRate);
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const data = buffer.getChannelData(channel);
      let last = 0;
      for (let index = 0; index < length; index += 1) {
        const white = Math.random() * 2 - 1;
        last = last * 0.975 + white * 0.025;
        data[index] = last * 2.8;
      }
    }
    return buffer;
  }

  private createImpulse(seconds: number, decay: number) {
    const length = Math.floor((this.context?.sampleRate ?? 44100) * seconds);
    const buffer = this.context!.createBuffer(2, length, this.context!.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let index = 0; index < length; index += 1) {
        data[index] = (Math.random() * 2 - 1) * Math.pow(1 - index / length, decay);
      }
    }
    return buffer;
  }
}

export const cinematicAudio = new CinematicAudioEngine();