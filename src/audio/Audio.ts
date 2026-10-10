export class GameAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private volume = .65;
  private music = .2;
  private ambient:GainNode|null=null;
  private ambientFilter:BiquadFilterNode|null=null;
  private waveGain:GainNode|null=null;
  private nextBird=0;
  private nextCricket=0;
  private nextDrip=0;
  private ambienceClock=0;
  private musicOscillators: OscillatorNode[] = [];
  private currentBiome = 'plains';
  private musicRoot = 110;
  private musicScale = [0, 2, 4, 7, 9, 12];
  private musicBeat = 0;
  private nextMusicNote = 5;
  async unlock() {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain(); this.master.gain.value = this.volume; this.master.connect(this.context.destination);
      this.musicGain = this.context.createGain(); this.musicGain.gain.value = this.volume === 0 ? 0 : this.music * .045; this.musicGain.connect(this.context.destination);
      const droneIntervals = [0, 7, 12, 19];
      droneIntervals.forEach((interval, i) => {
        const osc = this.context!.createOscillator(), gain = this.context!.createGain();
        osc.frequency.value = this.musicRoot * Math.pow(2, interval / 12); osc.type = i === 1 ? 'triangle' : 'sine';
        gain.gain.value = .4 / (i + 1); osc.connect(gain); gain.connect(this.musicGain!); osc.start();
        this.musicOscillators.push(osc);
      });
      const noise=this.context.createBuffer(1,this.context.sampleRate*3,this.context.sampleRate),data=noise.getChannelData(0);let brown=0;
      for(let i=0;i<data.length;i++){brown=(brown+(Math.random()*2-1)*.024)/1.025;data[i]=brown;}
      const source=this.context.createBufferSource();source.buffer=noise;source.loop=true;this.ambientFilter=this.context.createBiquadFilter();this.ambientFilter.type='lowpass';this.ambientFilter.frequency.value=800;
      this.ambient=this.context.createGain();this.ambient.gain.value=.025;source.connect(this.ambientFilter);this.ambientFilter.connect(this.ambient);this.ambient.connect(this.master);source.start();
      // Slow wave swell used near coasts and open water.
      this.waveGain=this.context.createGain();this.waveGain.gain.value=0;
      const lfo=this.context.createOscillator(),lfoGain=this.context.createGain();lfo.frequency.value=.11;lfoGain.gain.value=.028;lfo.connect(lfoGain);lfoGain.connect(this.waveGain.gain);lfo.start();
      const waveFilter=this.context.createBiquadFilter();waveFilter.type='bandpass';waveFilter.frequency.value=420;waveFilter.Q.value=.6;
      const waveSource=this.context.createBufferSource();waveSource.buffer=noise;waveSource.loop=true;waveSource.playbackRate.value=1.4;
      waveSource.connect(waveFilter);waveFilter.connect(this.waveGain);this.waveGain.connect(this.master);waveSource.start();
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }
  setVolume(volume: number, music: number) {
    this.volume = volume / 100; this.music = music / 100;
    if(volume===0&&typeof window!=='undefined'&&'speechSynthesis'in window)window.speechSynthesis.cancel();
    if (this.master) this.master.gain.value = this.volume;
    if (this.musicGain) this.musicGain.gain.value = this.volume === 0 ? 0 : this.music * .045;
  }
  play(kind: 'click' | 'mine' | 'place' | 'step' | 'jump' | 'collect' | 'hurt' | 'fuse' | 'explosion' | 'portal', attenuation = 1) {
    if (!this.context || !this.master || this.context.state !== 'running') return;
    const ctx = this.context, now = ctx.currentTime, gain = ctx.createGain(); gain.connect(this.master);
    const noisy = ['mine', 'place', 'step', 'explosion', 'hurt'].includes(kind);
    const duration = kind === 'explosion' ? 1.25 : kind === 'portal' ? .9 : .09;
    const loudness = (kind === 'step' ? .11 : kind === 'explosion' ? .65 : .2) * attenuation;
    gain.gain.setValueAtTime(loudness, now); gain.gain.exponentialRampToValueAtTime(.001, now + duration);
    if (noisy) {
      const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate), values = buffer.getChannelData(0);
      for (let i = 0; i < values.length; i++) values[i] = (Math.random() * 2 - 1) * (1 - i / values.length);
      const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = kind === 'explosion' ? 480 : kind === 'step' ? 380 : 1400;
      source.buffer = buffer; source.connect(filter); filter.connect(gain); source.start(); source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
    } else {
      const osc = ctx.createOscillator(); osc.type = kind === 'fuse' ? 'square' : 'sine';
      const frequency = kind === 'collect' ? 660 : kind === 'portal' ? 130 : kind === 'fuse' ? 230 : kind === 'jump' ? 200 : 440;
      osc.frequency.setValueAtTime(frequency, now); osc.frequency.exponentialRampToValueAtTime(kind === 'portal' ? 600 : frequency * .6, now + duration);
      osc.connect(gain); osc.start(); osc.stop(now + duration); osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    }
  }
  thunder(delay = 0.6, intensity = 1) {
    if (!this.context || !this.master || this.context.state !== 'running') return;
    const ctx = this.context, t = ctx.currentTime + Math.max(0, delay);
    const duration = 1.6 + Math.random() * 1.4;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate), values = buffer.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < values.length; i++) { brown = (brown + (Math.random() * 2 - 1) * 0.06) / 1.03; const env = Math.min(1, i / (ctx.sampleRate * 0.06)) * Math.pow(1 - i / values.length, 1.4); values[i] = brown * env * 3.2; }
    const source = ctx.createBufferSource(); source.buffer = buffer;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.setValueAtTime(420, t); filter.frequency.exponentialRampToValueAtTime(55, t + duration);
    const gain = ctx.createGain(); gain.gain.setValueAtTime(0.0001, t); gain.gain.exponentialRampToValueAtTime(0.55 * intensity, t + 0.08); gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    source.connect(filter); filter.connect(gain); gain.connect(this.master); source.start(t);
    const sub = ctx.createOscillator(), subGain = ctx.createGain(); sub.type = 'sine'; sub.frequency.setValueAtTime(52, t); sub.frequency.exponentialRampToValueAtTime(34, t + duration);
    subGain.gain.setValueAtTime(0.0001, t); subGain.gain.exponentialRampToValueAtTime(0.16 * intensity, t + 0.12); subGain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    sub.connect(subGain); subGain.connect(this.master); sub.start(t); sub.stop(t + duration + 0.1);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
    sub.onended = () => { sub.disconnect(); subGain.disconnect(); };
  }
  note(index:number){
    if(!this.context||!this.master)return;const t=this.context.currentTime;
    for(const harmonic of [1,2,3]){const osc=this.context.createOscillator(),gain=this.context.createGain();osc.type='sine';osc.frequency.value=[261.63,329.63,392,493.88][index%4]*harmonic;gain.gain.setValueAtTime(.2/harmonic,t);gain.gain.exponentialRampToValueAtTime(.0001,t+1.2);osc.connect(gain);gain.connect(this.master);osc.start();osc.stop(t+1.2);osc.onended=()=>{osc.disconnect();gain.disconnect();};}
  }
  creature(kind:string,attenuation:number){
    if(!this.context||!this.master||attenuation<.02)return;
    const frequency=kind==='cow'?95:kind==='sheep'?240:kind==='pig'?135:kind==='sniffer'?72:kind==='chicken'?530:kind==='wolf'?190:kind==='shade'?62:0;
    if(!frequency)return;const ctx=this.context,t=ctx.currentTime,osc=ctx.createOscillator(),gain=ctx.createGain(),filter=ctx.createBiquadFilter();
    osc.type=kind==='sheep'?'triangle':'sawtooth';osc.frequency.setValueAtTime(frequency,t);osc.frequency.linearRampToValueAtTime(frequency*1.3,t+.12);osc.frequency.exponentialRampToValueAtTime(frequency*.75,t+.55);
    filter.type='lowpass';filter.frequency.value=kind==='chicken'?1900:700;gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(.045*attenuation,t+.08);gain.gain.exponentialRampToValueAtTime(.0001,t+.65);
    osc.connect(filter);filter.connect(gain);gain.connect(this.master);osc.start();osc.stop(t+.68);osc.onended=()=>{osc.disconnect();filter.disconnect();gain.disconnect();};
  }
  private chirp(variant: number, gainValue = 0.024) {
    if (!this.context || !this.master) return;
    const ctx = this.context, t = ctx.currentTime, osc = ctx.createOscillator(), gain = ctx.createGain();
    const base = [1350, 1650, 1150][variant % 3];
    osc.frequency.setValueAtTime(base, t); osc.frequency.exponentialRampToValueAtTime(base * 1.7, t + 0.09); osc.frequency.exponentialRampToValueAtTime(base * 0.9, t + 0.22);
    if (variant === 2) { osc.frequency.exponentialRampToValueAtTime(base * 1.4, t + 0.32); }
    gain.gain.setValueAtTime(gainValue, t); gain.gain.exponentialRampToValueAtTime(0.0001, t + (variant === 2 ? 0.42 : 0.3));
    osc.connect(gain); gain.connect(this.master); osc.start(); osc.stop(t + 0.45); osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }
  private cricket() {
    if (!this.context || !this.master) return;
    const ctx = this.context, t = ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      const osc = ctx.createOscillator(), gain = ctx.createGain(); osc.type = 'sine'; osc.frequency.value = 4300 + Math.random() * 300;
      gain.gain.setValueAtTime(0.0001, t + i * 0.09); gain.gain.exponentialRampToValueAtTime(0.008, t + i * 0.09 + 0.02); gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.07);
      osc.connect(gain); gain.connect(this.master); osc.start(t + i * 0.09); osc.stop(t + i * 0.09 + 0.1);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    }
  }
  private drip() {
    if (!this.context || !this.master) return;
    const ctx = this.context, t = ctx.currentTime, osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.frequency.setValueAtTime(820 + Math.random() * 320, t); osc.frequency.exponentialRampToValueAtTime(360, t + 0.14);
    gain.gain.setValueAtTime(0.03, t); gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    osc.connect(gain); gain.connect(this.master); osc.start(); osc.stop(t + 0.42); osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }
  speak(text:string,enabled=true){if(!enabled||this.volume===0||!('speechSynthesis'in window))return;window.speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text);utterance.rate=.91;utterance.pitch=.87;utterance.volume=this.volume*.8;window.speechSynthesis.speak(utterance);}
  private profileForBiome(biome: string) {
    if (['ocean','beach','reef','mangrove','marsh','willow'].includes(biome)) return { root: 130.81, scale: [0,2,4,7,9,12,14], drones: [0,7,12,19] };
    if (['snow','glacier','taiga','peaks','silver'].includes(biome)) return { root: 98, scale: [0,2,5,7,9,12,14], drones: [0,5,12,17] };
    if (['desert','badlands','bones','savanna','volcanic','crag'].includes(biome)) return { root: biome === 'volcanic' ? 73.42 : 92.5, scale: [0,3,5,7,10,12,15], drones: [0,5,10,15] };
    if (['mushroom','toxic','crystal','darkwood','sift','hollows'].includes(biome)) return { root: 123.47, scale: [0,2,6,7,11,14,18], drones: [0,6,12,18] };
    if (['jungle','cherry','lavender','autumn','aspen'].includes(biome)) return { root: 110, scale: [0,2,3,7,9,12,14], drones: [0,7,12,15] };
    return { root: 110, scale: [0,2,4,7,9,12,14], drones: [0,7,12,19] };
  }
  private setBiomeMusic(biome: string) {
    if (biome === this.currentBiome) return;
    this.currentBiome = biome;
    const profile = this.profileForBiome(biome);
    this.musicRoot = profile.root;
    this.musicScale = profile.scale;
    if (!this.context || !this.musicOscillators.length) return;
    const now = this.context.currentTime;
    profile.drones.forEach((interval, i) => {
      const frequency = this.musicRoot * Math.pow(2, interval / 12);
      this.musicOscillators[i]?.frequency.setTargetAtTime(frequency, now, 2.2);
    });
  }
  private playSceneNote() {
    if (!this.context || !this.musicGain || this.music <= 0) return;
    const ctx = this.context, now = ctx.currentTime;
    const steps = [0, 2, 4, 1, 3, 5, 2, 4];
    const scaleIndex = steps[this.musicBeat++ % steps.length] % this.musicScale.length;
    const octave = this.musicBeat % 4 === 0 ? 2 : 1;
    const frequency = this.musicRoot * Math.pow(2, this.musicScale[scaleIndex] / 12) * octave;
    const osc = ctx.createOscillator(), gain = ctx.createGain(), filter = ctx.createBiquadFilter();
    osc.type = this.musicBeat % 3 === 0 ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(frequency, now);
    filter.type = 'lowpass'; filter.frequency.value = this.musicBeat % 3 === 0 ? 1450 : 2200;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.09);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.8);
    osc.connect(filter); filter.connect(gain); gain.connect(this.musicGain);
    osc.start(now); osc.stop(now + 2.85);
    osc.onended = () => { osc.disconnect(); filter.disconnect(); gain.disconnect(); };
  }
  updateAmbience(dt:number,dimension:string,weather:string,underwater:boolean,night:boolean,biome='plains',height=40,underground=false){
    this.ambienceClock+=dt;
    this.setBiomeMusic(biome);
    if (this.ambienceClock > this.nextMusicNote) {
      this.nextMusicNote = this.ambienceClock + 4.2 + Math.random() * 3.8;
      this.playSceneNote();
    }
    if(!this.context||!this.ambient||!this.ambientFilter)return;
    const coastal = ['ocean','beach','reef','mangrove','marsh'].includes(biome);
    const forest = ['woodland','birch','taiga','jungle','redwood','darkwood','cherry','autumn','silver','willow'].includes(biome);
    const arid = ['desert','badlands','bones','savanna','volcanic'].includes(biome);
    const loud=weather==='storm'?.22:weather==='rain'||weather==='snow'?.11:underwater?.08:underground?.035:arid?.035:.025;
    this.ambient.gain.setTargetAtTime(loud,this.context.currentTime,1);
    this.ambientFilter.frequency.setTargetAtTime(underwater?180:underground?240:dimension==='nether'?450:weather!=='clear'?3000:arid?1400:850,this.context.currentTime,1);
    if(this.waveGain) this.waveGain.gain.setTargetAtTime(coastal&&!underwater&&weather==='clear'?1:coastal?0.5:0,this.context.currentTime,2);
    if(dimension==='overworld'&&!underwater&&!underground&&weather==='clear'&&!night&&(forest||biome==='plains'||biome==='meadow'||biome==='lavender')&&this.ambienceClock>this.nextBird){
      this.nextBird=this.ambienceClock+(forest?3.5:6)+Math.random()*(forest?6:10);this.chirp(Math.floor(Math.random()*3));
    }
    if(dimension==='overworld'&&!underwater&&!underground&&night&&weather==='clear'&&this.ambienceClock>this.nextCricket){this.nextCricket=this.ambienceClock+2.5+Math.random()*4;this.cricket();}
    if(underground&&!underwater&&this.ambienceClock>this.nextDrip){this.nextDrip=this.ambienceClock+2+Math.random()*6;this.drip();}
    void height;
  }
  dispose() { if('speechSynthesis'in window)window.speechSynthesis.cancel();void this.context?.close(); this.context = null;this.master=null;this.ambient=null; }
}
