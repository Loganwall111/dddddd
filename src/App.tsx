import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, CircleHelp, Compass, Globe2, Keyboard, LoaderCircle, LogOut, Maximize, MountainSnow, Play, Settings2, Sparkles, UserRound, Volume2, VolumeX, Wifi, X } from 'lucide-react';
import { DEFAULT_SETTINGS, DEFAULT_CHARACTER, DIMENSIONS, type CharacterStyle, type DimensionId, type GameEvent, type GameSnapshot, type Settings, type WorldSave } from './core/types';
import type { Game } from './core/Game';
import { GameAudio } from './audio/Audio';
import { createWorld, exportWorld, getWorlds, loadSettings, saveWorld, storeSettings, loadCharacter, storeCharacter } from './persistence/storage';
import { WebSocketTransport } from './multiplayer/transport';
import { BackButton, Key, Mark, Modal, Toggle } from './ui/Common';
import { SettingsPanel } from './ui/SettingsPanel';
import { CreateWorld, DimensionsMenu, WorldSelection } from './ui/WorldMenus';
import { Inventory } from './ui/Inventory';
import { HUD } from './ui/HUD';
import { Chat } from './ui/Chat';
import { runCommand } from './commands/commands';
import { CharacterCreator } from './ui/CharacterCreator';
import { LivePanorama } from './ui/LivePanorama';

type Screen = 'home' | 'worlds' | 'create' | 'settings' | 'controls' | 'credits' | 'multiplayer' | 'dimensions' | 'loading' | 'playing' | 'pause' | 'inventory' | 'death' | 'worldoptions' | 'character' | 'dialogue' | 'chat';

function Controls({ onClose }: { onClose: () => void }) {
  const controls = [['W A S D', 'Move through the world'], ['Mouse', 'Look around'], ['Space', 'Jump / swim upward'], ['Shift', 'Sprint'], ['Ctrl / C', 'Crouch / descend in flight'], ['Left click', 'Mine blocks / attack'], ['Right click', 'Place / eat / use / ignite TNT'], ['1 - 9 / Scroll', 'Select a hotbar slot'], ['E', 'Open or close your inventory'], ['Q', 'Drop one selected item'], ['V / Double Space', 'Toggle Creative flight'], ['F', 'Toggle third-person view'], ['Esc', 'Pause and release the mouse']];
  return <Modal title="Find your feet." eyebrow="CONTROLS & FIELD GUIDE" onClose={onClose} wide><div className="controls-content"><div className="controls-list">{controls.map(([key, action]) => <div key={key}><Key>{key}</Key><span>{action}</span></div>)}</div><aside className="field-guide"><Compass size={30} strokeWidth={1}/><h3>A few things to know.</h3><p>Hold left click to mine. Dropped items are collected when you walk nearby.</p><p>Right-click a crafting bench, furnace, or chest to use it. Hold Shift to place a block against it instead.</p><p>Right-click TNT to light its fuse. Purple rift blocks transport you to the next dimension.</p><p>In Creative, every item is available in your inventory. In Survival, start with wood, then craft your way forward.</p><p className="fine-print">If your browser blocks pointer lock, hold Alt while moving the mouse to look. This game is designed for a desktop keyboard and mouse.</p></aside></div><footer className="modal-footer"><span className="fine-print">Your world autosaves every 30 seconds of play.</span><button className="button primary compact" onClick={onClose}>Ready to explore<ArrowRight size={15}/></button></footer></Modal>;
}

function Multiplayer({ onClose, onSolo }: { onClose: () => void; onSolo: () => void }) {
  const [address, setAddress] = useState(''), [status, setStatus] = useState('');
  const transport = useRef<WebSocketTransport | null>(null);
  useEffect(() => () => transport.current?.close(), []);
  const connect = () => {
    transport.current?.close(); setStatus('Connecting to server...');
    try { transport.current = new WebSocketTransport(address, state => setStatus(state === 'connected' ? 'Transport connected. This preview does not yet implement a hosted multiplayer game protocol.' : state === 'error' ? 'Could not reach this server. Check its address, TLS certificate, and WebSocket support.' : 'Connection closed.')); }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Connection failed.'); }
  };
  return <Modal title="Better, together." eyebrow="MULTIPLAYER" onClose={onClose}><div className="multiplayer-content"><Globe2 size={46} strokeWidth={1}/><p className="lead">A bigger adventure is on the horizon.</p><p>This release is a singleplayer sandbox. A modular WebSocket transport is included for developers, but a hosted, authoritative game server is not included.</p><label className="field">Test a compatible WebSocket endpoint<input type="url" placeholder="wss://your-server.example" value={address} onChange={e => setAddress(e.target.value)}/></label><button className="button secondary" disabled={!address.trim()} onClick={connect}><Wifi size={16}/>Test connection<ArrowUpRight size={15}/></button>{status && <p className="connection-status" role="status">{status}</p>}</div><footer className="modal-footer"><BackButton onClick={onClose}/><button className="button primary compact" onClick={onSolo}>Play singleplayer<ArrowRight size={16}/></button></footer></Modal>;
}

function WorldOptions({ game, onClose }: { game: Game; onClose: () => void }) {
  const [, refresh] = useState(0), save = game.save;
  const changed = () => { refresh(n => n + 1); game.refresh(); };
  return <Modal title="World Options" eyebrow="YOUR WORLD. YOUR RULES." onClose={onClose} wide><div className="world-options-body">
    <div className="setting-label">Game mode</div><div className="segmented">{(['creative', 'survival'] as const).map(mode => <button key={mode} className={save.mode === mode ? 'selected' : ''} onClick={() => { game.setMode(mode); changed(); }}>{mode}</button>)}</div>
    <div className="settings-grid"><div><div className="setting-label">Time of day</div><div className="segmented">{[['Day', .25], ['Sunset', .47], ['Night', .75]].map(([name,time]) => <button key={name} onClick={() => { save.time = Number(time); changed(); }}>{name}</button>)}</div></div><label className="field">Difficulty<select value={save.difficulty} onChange={e => { save.difficulty = e.target.value as WorldSave['difficulty']; changed(); }}><option value="peaceful">Peaceful</option><option value="normal">Normal</option><option value="hard">Hard</option></select></label></div>
    <div className="setting-label">Weather</div><div className="segmented">{(['clear', 'rain', 'storm'] as const).map(weather => <button key={weather} className={save.weather === weather ? 'selected' : ''} onClick={() => { save.weather = weather; save.cycleWeather = false; changed(); }}>{weather === 'clear' ? 'Clear skies' : weather === 'rain' ? 'Rainfall' : 'Thunderstorm'}</button>)}</div><Toggle label="Let weather change naturally" checked={save.cycleWeather} onChange={v => { save.cycleWeather = v; changed(); }}/>
    <div className="setting-label">Season</div><div className="segmented">{(['Spring','Summer','Autumn','Winter'] as const).map(season => <button key={season} className={save.season === season ? 'selected' : ''} onClick={() => { save.season = season; save.cycleSeasons = false; changed(); }}>{season==='Autumn'?'Fall':season}</button>)}</div><Toggle label="Let seasons change naturally" detail="Snow, frozen shallows, foliage, and seasonal particles adapt. Each season lasts 15 minutes." checked={save.cycleSeasons} onChange={v => { save.cycleSeasons = v; changed(); }}/>
    <button className="button secondary" onClick={()=>{if(save.dimension!=='overworld')game.toast('Tornadoes form in the Overworld.');else if(!game.settings.tornadoes)game.toast('Enable tornadoes in Graphics settings.');else game.tornadoes.summon(game.player.position);}}>Summon a tornado</button>
  </div><footer className="modal-footer"><span className="fine-print">Changes are included in your world save.</span><button className="button primary compact" onClick={onClose}>Done<Check size={15}/></button></footer></Modal>;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home'), [returnScreen, setReturnScreen] = useState<Screen>('home');
  const [livePanoramaReady, setLivePanoramaReady] = useState(false);
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS }), [settingsReady, setSettingsReady] = useState(false);
  const [worlds, setWorlds] = useState<WorldSave[]>([]), [activeWorld, setActiveWorld] = useState<WorldSave | null>(null);
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null), [loading, setLoading] = useState({ progress: 0, label: 'Preparing the first horizon' });
  const [enterPrompt, setEnterPrompt] = useState(false), [toast, setToast] = useState(''), [error, setError] = useState('');
  const [context, setContext] = useState<{ context?: 'crafting' | 'furnace' | 'chest'; key?: string }>({});
  const [busy, setBusy] = useState(false), [backend, setBackend] = useState('');
  const [character,setCharacter]=useState<CharacterStyle>({...DEFAULT_CHARACTER});
  const [dialogue,setDialogue]=useState<{name:string;text:string;profession:string}|null>(null);
  const [tourCaption,setTourCaption]=useState<{title:string;subtitle:string;index:number;total:number}|null>(null);
  const [tourLoading,setTourLoading]=useState<{active:boolean;progress:number;label:string}>({active:false,progress:0,label:''});
  const canvas = useRef<HTMLCanvasElement>(null), game = useRef<Game | null>(null), menuAudio = useRef(new GameAudio());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null), launching = useRef(false), mounted = useRef(true);
  const showToast = useCallback((message: string) => { setToast(message); if (toastTimer.current) clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 5500); }, []);
  const refreshWorlds = useCallback(() => { getWorlds().then(setWorlds).catch(() => showToast('Browser storage is unavailable. Check your privacy or storage settings.')); }, [showToast]);
  useEffect(() => {
    mounted.current = true; let canceled = false;
    loadSettings().then(value => { if (!canceled) { setSettings(value); setSettingsReady(true); } });
    loadCharacter().then(value=>{if(!canceled)setCharacter(value);});refreshWorlds();
    return () => { canceled = true; mounted.current = false; game.current?.dispose(); menuAudio.current.dispose(); if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, [refreshWorlds]);
  useEffect(() => {
    if (!settingsReady) return;
    game.current?.applySettings(settings); menuAudio.current.setVolume(settings.volume, settings.music);
    const timer = setTimeout(() => { storeSettings(settings).catch(() => showToast('Could not store preferences on this device.')); }, 250);
    return () => clearTimeout(timer);
  }, [settings, settingsReady, showToast]);
  const playClick = () => { if (game.current) game.current.audio.play('click', .3); else void menuAudio.current.unlock().then(() => menuAudio.current.play('click', .3)).catch(() => {}); };
  const open = (next: Screen, back: Screen = activeWorld ? 'pause' : 'home') => { playClick(); setReturnScreen(back); setScreen(next); };
  const handleEvent = useCallback((event: GameEvent) => {
    if (!mounted.current) return;
    if (event.type === 'snapshot') setSnapshot(event.data);
    else if (event.type === 'loading') { setLoading({ progress: event.progress, label: event.label }); setScreen('loading'); }
    else if (event.type === 'ready') { setBackend(event.backend); setScreen('playing'); setEnterPrompt(true); }
    else if (event.type === 'pause') { setScreen('pause'); setEnterPrompt(false); }
    else if (event.type === 'inventory') { setContext({ context: event.context, key: event.key }); setScreen('inventory'); }
    else if (event.type === 'toast') showToast(event.message);
    else if (event.type === 'death') setScreen('death');
    else if(event.type==='dialogue'){setDialogue(event);setScreen('dialogue');}
    else if (event.type === 'tour-caption') { setTourCaption({ title: event.title, subtitle: event.subtitle, index: event.index, total: event.total }); setScreen('playing'); setEnterPrompt(false); }
    else if (event.type === 'tour-loading') { setTourLoading({ active: event.active, progress: event.progress, label: event.label }); if (event.active) { setScreen('playing'); setEnterPrompt(false); } }
    else if (event.type === 'tour-end') { setTourCaption(null); setTourLoading({ active: false, progress: 1, label: '' }); setScreen('pause'); setEnterPrompt(false); }
    else if (event.type === 'error') { game.current?.pause(); if (game.current?.ready) setScreen('pause'); setError(event.message); }
  }, [showToast]);
  const startWorld = async (world: WorldSave) => {
    if (launching.current) return;
    launching.current = true; setScreen('loading'); setLoading({ progress: 0, label: 'Preparing your adventure' }); setActiveWorld(world); setSnapshot(null); setError(''); setTourCaption(null); setTourLoading({ active: false, progress: 0, label: '' });
    menuAudio.current.dispose();
    try {
      await saveWorld(world);
      game.current?.dispose(); game.current = null;
      const { Game: GameEngine } = await import('./core/Game');
      if (!mounted.current || !canvas.current) return;
      const instance = await GameEngine.create(canvas.current, settings, handleEvent);
      if (!mounted.current) { instance.dispose(); return; }
      game.current = instance;
      if (new URLSearchParams(location.search).has('qa')) (window as Window & { __AWAKENING__?: Game }).__AWAKENING__ = instance;
      await instance.start(world); refreshWorlds();
    } catch (cause) {
      game.current?.dispose(); game.current = null; setActiveWorld(null); setScreen('home');
      setError(cause instanceof Error ? cause.message : 'The graphics engine could not start. Please try a WebGL-capable browser.');
    } finally { launching.current = false; }
  };
  const resume = () => { if('speechSynthesis'in window)window.speechSynthesis.cancel();setScreen('playing'); setEnterPrompt(false); game.current?.resume(); };
  const quit = async () => {
    if (busy) return; setBusy(true);
    try { await game.current?.saveNow(); game.current?.dispose(); game.current = null; setActiveWorld(null); setSnapshot(null); setScreen('home'); refreshWorlds(); showToast('World saved. The adventure will be here.'); }
    catch { showToast('Saving failed. Your world is still open. Try exporting a backup.'); }
    finally { setBusy(false); }
  };
  const travel = (id: DimensionId) => {
    if (game.current) { void game.current.travel(id); }
    else { const world = createWorld(DIMENSIONS[id].name, '', 'creative', 'normal', 'normal'); world.dimension = id;world.character={...character};void startWorld(world); }
  };
  const fullscreen = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
    catch { showToast('Fullscreen is unavailable here. Try opening the app in its own browser tab.'); }
  };
  useEffect(() => {
    if (screen !== 'home') return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement) && !(event.target instanceof HTMLInputElement)) { setScreen('worlds'); event.preventDefault(); } };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [screen]);
  const [chatStart, setChatStart] = useState('');
  useEffect(() => {
    if (screen !== 'playing' || enterPrompt) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'KeyT' && event.code !== 'Slash') return;
      event.preventDefault();
      setChatStart(event.code === 'Slash' ? '/' : '');
      setScreen('chat');
      game.current?.pause();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, enterPrompt]);
  const submitChat = (text: string) => {
    const host = game.current?.commandHost();
    if (!host) throw new Error('The world is not ready yet.');
    const feedback = runCommand(text, host);
    showToast(feedback);
    return feedback;
  };
  const closeChat = () => { setScreen('playing'); game.current?.resume(); };
  const menuVisible = !activeWorld || screen === 'loading';
  return <div className={`app-shell classic-ui ${settings.reducedMotion ? 'reduced-motion' : ''} ${settings.highContrast ? 'high-contrast' : ''}`}>
    <canvas ref={canvas} className={`world-canvas ${activeWorld && screen !== 'loading' ? 'visible' : ''}`} tabIndex={0} aria-label="Aetherforged: Reincarnated 3D game world"/>
    <div className={`title-panorama ${menuVisible ? '' : 'panorama-hidden'}`} aria-hidden="true">{!livePanoramaReady && <img className="panorama-image" src="/assets/awakening-panorama.jpg" alt=""/>}<LivePanorama onReady={() => setLivePanoramaReady(true)} reducedMotion={settings.reducedMotion} active={menuVisible && !activeWorld}/><div className="cinematic-shade"/>{Array.from({ length: 8 }, (_, i) => <i className="ambient-mote" key={i} style={{ left: `${14 + i * 11}%`, top: `${40 + (i * 13) % 55}%`, animationDelay: `${i * -2.7}s`, animationDuration: `${12 + i * 2}s` }}/>)}</div>
    {!activeWorld && <header className="title-header"><div className="studio-signature"><Mark size={25}/><span>THE WORLDS REBORN UPDATE</span></div><div className="early-access"><i/>EARLY ACCESS <span>0.2</span></div></header>}
    {screen === 'home' && <main className="title-menu">
      <div className="classic-logo-wrap"><h1 className="main-wordmark" aria-label="Aetherforged: Reincarnated"><span>AETHERFORGED</span><span>REINCARNATED</span></h1><span className="splash-text">A whole new world!</span></div>
      <nav className="main-actions" aria-label="Main menu">
        <button className="menu-button main-play" onClick={() => { playClick(); refreshWorlds(); setScreen('worlds'); }}><span>Singleplayer</span></button>
        <button className="menu-button multiplayer-button" onClick={() => open('multiplayer')}><span>Multiplayer</span></button>
        <button className="menu-button dimensions-button" onClick={() => open('dimensions')}><span>Dimensions & Realms</span></button>
        <div className="secondary-actions"><button onClick={() => open('settings')}><Settings2 size={16}/>Options...</button><button onClick={() => open('character')}><UserRound size={16}/>Character...</button></div>
        <button className="menu-button help-menu-button" onClick={() => open('controls')}><span>Controls & Help</span></button>
      </nav>
      <p className="title-description">Same wonder. A whole new beginning.</p>
    </main>}
    {!activeWorld && <footer className="title-footer"><div className="version-label">Aetherforged: Reincarnated <span>0.2.0</span></div><div className="footer-actions"><button onClick={() => open('controls')}><Keyboard size={15}/><span>Controls</span></button><button onClick={() => open('credits')}><span>Credits</span></button><i/><button className="footer-icon" aria-label={settings.volume ? 'Mute audio' : 'Unmute audio'} title={settings.volume ? 'Mute audio' : 'Unmute audio'} onClick={() => { const volume = settings.volume ? 0 : 65; setSettings({ ...settings, volume }); if (volume) void menuAudio.current.unlock(); }}>{settings.volume ? <Volume2 size={17}/> : <VolumeX size={17}/>}</button><button className="footer-icon" aria-label="Toggle fullscreen" title="Toggle fullscreen" onClick={() => void fullscreen()}><Maximize size={16}/></button></div></footer>}
    {screen === 'worlds' && <WorldSelection worlds={worlds} onClose={() => setScreen('home')} onCreate={() => setScreen('create')} onPlay={world => void startWorld(world)} onRefresh={refreshWorlds} onMessage={showToast}/>}
    {screen === 'create' && <CreateWorld onClose={() => setScreen('worlds')} onCreate={world => {world.character={...character};void startWorld(world);}}/>}
    {screen === 'settings' && <SettingsPanel settings={settings} onChange={setSettings} onClose={() => setScreen(returnScreen)}/>}
    {screen === 'controls' && <Controls onClose={() => setScreen(returnScreen)}/>}
    {screen === 'multiplayer' && <Multiplayer onClose={() => setScreen('home')} onSolo={() => setScreen('worlds')}/>}
    {screen === 'dimensions' && <DimensionsMenu current={activeWorld?.dimension} onClose={() => setScreen(returnScreen)} onTravel={travel}/>}
    {screen === 'credits' && <Modal title="Credits" eyebrow="AETHERFORGED: REINCARNATED" onClose={() => setScreen(returnScreen)}><div className="credits-content"><Mark size={50}/><p className="lead">Small blocks. Extraordinary possibilities.</p><p>An original browser-based voxel sandbox built with Babylon.js, TypeScript, React, and Vite.</p><div className="credit-line"><span>WORLDS REBORN / 0.2</span><p>Original procedural artwork, PBR block materials, animated voxel creatures, six dimensions, and a world that changes with the seasons.</p></div><div className="credit-line"><span>SOUND & VOICES</span><p>Original Web Audio synthesis and optional device-provided speech. No extracted textures, models, or commercial soundtracks.</p></div><div className="credit-line"><span>THE SIFT</span><p>An original interpretation of your realm concept, not an official or announced Minecraft dimension. Independent, unaffiliated, and built for discovery.</p></div></div><footer className="modal-footer"><span className="fine-print">For everyone who ever placed their first block.</span><button className="button primary compact" onClick={() => setScreen(returnScreen)}>Done</button></footer></Modal>}
    {screen === 'loading' && <div className="loading-screen"><Mark size={40}/><span className="eyebrow">{activeWorld?.name || 'AETHERFORGED: REINCARNATED'}</span><h2>{loading.label}...</h2><div className="chunk-loading-grid">{Array.from({ length: 81 }, (_, i) => <span key={i} className={i < loading.progress * 81 ? 'loaded' : ''}/>)}</div><div className="loading-progress"><div><span style={{ width: `${Math.max(2, loading.progress * 100)}%` }}/></div><span>{Math.round(loading.progress * 100)}%</span></div><p>Preparing spawn area. A new story is taking shape.</p><small>Seed {activeWorld?.seed} <i/> {activeWorld?.preset === 'flat' ? 'Superflat' : activeWorld?.preset} <i/> {activeWorld?.mode}</small></div>}
    {screen === 'playing' && snapshot && <HUD snapshot={snapshot} settings={settings} onSelect={index => game.current?.select(index)}/>}
    {screen === 'playing' && enterPrompt && <div className="enter-world"><div className="enter-world-banner"><span className="eyebrow">WELCOME TO YOUR WORLD</span><h2>{activeWorld?.name}</h2><span>{snapshot?.season} <i/> {DIMENSIONS[activeWorld?.dimension || 'overworld'].name}</span><button className="button primary" onClick={resume}>Begin exploring<ArrowRight size={17}/></button><small><Key>WASD</Key>Move <Key>Mouse</Key>Look <Key>E</Key>Inventory</small></div><button className="enter-settings text-button" onClick={() => { setEnterPrompt(false); setScreen('pause'); }}><Settings2 size={15}/>Adjust your experience</button></div>}
    {screen === 'playing' && !enterPrompt && (tourCaption || tourLoading.active) && <section className={`tour-overlay ${tourLoading.active ? 'is-loading' : ''}`} aria-live="polite" aria-label="Cinematic tour">
      <span className="eyebrow">AETHERFORGED: REINCARNATED · CINEMATIC TOUR {tourCaption ? `· STOP ${tourCaption.index} / ${tourCaption.total}` : ''}</span>
      <h2>{tourCaption?.title || 'Mapping every Overworld biome'}</h2>
      <p>{tourCaption?.subtitle || 'Preparing a real-time route through the world.'}</p>
      {tourLoading.active && <div className="tour-loading-info" aria-live="polite"><span>{tourLoading.label || 'A living world is taking shape.'}</span><div className="tour-loadbar"><i style={{ width: `${Math.max(2, tourLoading.progress * 100)}%` }}/></div><small>{Math.round(tourLoading.progress * 100)}%</small></div>}
      {!tourLoading.active && <div className="tour-step-meter" aria-label={`Stop ${tourCaption?.index || 1} of ${tourCaption?.total || 34}`}><i style={{ width: `${Math.max(2, (tourCaption?.index || 1) / (tourCaption?.total || 34) * 100)}%` }}/></div>}
      <div className="tour-actions"><button className="button secondary" disabled={tourLoading.active} onClick={() => { playClick(); game.current?.nextTourStop(); }}>Skip stop<ArrowRight size={14}/></button><button className="button secondary" onClick={() => { playClick(); game.current?.stopTour(); }}>End tour</button></div>
    </section>}
    {screen === 'pause' && <div className="pause-backdrop"><section className="pause-menu"><h2>Game Menu</h2><p>{activeWorld?.name}<span>/</span>{snapshot?.biome}</p><button className="button primary" onClick={resume}><Play size={17} fill="currentColor"/>Back to Game</button><div className="pause-grid"><button className="button secondary" onClick={() => open('settings')}><Settings2 size={16}/>Options...</button><button className="button secondary" onClick={() => open('dimensions')}><Globe2 size={16}/>Dimensions</button><button className="button secondary" onClick={() => open('worldoptions')}><Sparkles size={16}/>World Rules</button><button className="button secondary" onClick={() => open('character')}><UserRound size={16}/>Character</button><button className="button secondary tour-launch" disabled={snapshot?.dimension !== 'overworld'} title="Visits every Overworld biome" onClick={() => { playClick(); game.current?.startTour(); }}><Compass size={16}/>Cinematic Tour</button></div><button className="button secondary save-exit" disabled={busy} onClick={() => void quit()}>{busy ? <LoaderCircle size={16} className="spin"/> : <LogOut size={16}/>}Save & Return to Title</button><button className="text-button pause-help" onClick={()=>open('controls')}><CircleHelp size={14}/>Controls & Field Guide</button><span className="pause-build">{backend} <i/> AETHERFORGED: REINCARNATED 0.2.0</span></section></div>}
    {screen === 'pause' && game.current && <div className="pause-backup"><button className="text-button" onClick={() => { game.current!.player.serialize(); exportWorld(game.current!.save); }}>Export a world backup<ArrowUpRight size={13}/></button></div>}
    {screen === 'chat' && <Chat initial={chatStart} onSubmit={submitChat} onClose={closeChat}/>}
    {screen === 'inventory' && game.current && <Inventory game={game.current} context={context.context} containerKey={context.key} onClose={resume}/>}
    {screen === 'worldoptions' && game.current && <WorldOptions game={game.current} onClose={() => { void game.current?.saveNow().catch(() => {}); setScreen('pause'); }}/>}
    {screen==='character'&&<CharacterCreator character={game.current?.save.character||character} onSave={async style=>{setCharacter(style);game.current?.setCharacter(style);try{await storeCharacter(style);await game.current?.saveNow();}catch{showToast('Could not save your character on this device. Export a backup before leaving.');}}} onClose={()=>setScreen(returnScreen)}/>}
    {screen==='dialogue'&&dialogue&&<Modal title={dialogue.name} eyebrow={dialogue.profession.toUpperCase()} onClose={resume} className="dialogue-modal"><div className="dialogue-body"><div className="villager-portrait"><UserRound size={42} strokeWidth={1}/></div><p>{dialogue.text}</p></div><div className="dialogue-options"><button className="button secondary" onClick={()=>{const text='Find the stairway at 42, -62. Below, play C, G, E, B, C on the resonance blocks. Walk through the shimmering frame, and do not trust the rainbow water.';setDialogue({...dialogue,text});game.current?.audio.speak(text,settings.npcVoice);}}>Tell me about the Sift</button><button className="button secondary" onClick={()=>game.current?.trade()}>Trade: 3 Coal for 2 Bread</button></div><footer className="modal-footer"><span className="fine-print">Voice uses your device's speech service.</span><button className="button primary" onClick={resume}>Goodbye</button></footer></Modal>}
    {screen === 'death' && <div className="death-backdrop"><section className="death-menu"><MountainSnow size={42} strokeWidth={1}/><span className="eyebrow">NOT THE END OF YOUR STORY</span><h2>The world remembers you.</h2><p>Your dropped items are waiting where you fell.<br/>Take a breath. Begin again.</p><button className="button primary" onClick={() => void game.current?.respawn()}>Return to the world<ArrowRight size={17}/></button><button className="text-button" onClick={() => void quit()}>Save & return to title</button></section></div>}
    {toast && <div className="toast" role="status"><span className="status-dot"/>{toast}<button className="icon-button" aria-label="Dismiss notification" onClick={() => setToast('')}><X size={14}/></button></div>}
    {error && <Modal title="We hit a rough patch." eyebrow="ENGINE NOTICE" onClose={() => setError('')}><div className="error-body"><p>{error}</p><small>Your existing saved worlds have not been deleted. For renderer errors, enable hardware acceleration or try a current Chrome, Edge, or Firefox browser.</small></div><footer className="modal-footer"><button className="button primary compact" onClick={() => setError('')}>Understood</button></footer></Modal>}
  </div>;
}
