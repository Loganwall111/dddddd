// Local multiplayer transport built on BroadcastChannel: every tab of the same
// browser (same origin) can join one shared session. Terrain is deterministic
// per seed, so only player positions, block edits and chat travel the wire.
// A WebSocket transport for cross-device play can implement the same message
// protocol (see docs/MULTIPLAYER.md).
import { WorldType } from "../world/generator";

export interface WorldMetaLite {
  seed: number;
  worldType: WorldType;
  gameMode: "creative" | "survival";
  worldName: string;
}

export interface Advert {
  room: string;
  hostName: string;
  meta: WorldMetaLite;
  players: number;
}

export interface PeerState {
  id: string;
  name: string;
  x: number; y: number; z: number;
  yaw: number; pitch: number;
  lastSeen: number;
}

type Msg =
  | { t: "hello"; id: string; name: string }
  | { t: "welcome"; to: string; meta: WorldMetaLite; hostId: string; hostName: string }
  | { t: "pos"; id: string; name: string; x: number; y: number; z: number; yaw: number; pitch: number }
  | { t: "block"; id: string; x: number; y: number; z: number; b: number }
  | { t: "chat"; id: string; name: string; text: string }
  | { t: "bye"; id: string };

type AdvertMsg =
  | { t: "advert"; room: string; hostName: string; meta: WorldMetaLite; players: number }
  | { t: "who" };

export interface NetEvents {
  onChat?: (name: string, text: string) => void;
  onBlock?: (x: number, y: number, z: number, b: number) => void;
  onWelcome?: (meta: WorldMetaLite) => void;   // client: host accepted us
  onPeerJoined?: (id: string, name: string) => void;
  onPeerLeft?: (id: string) => void;
}

const DISC = "mass-awakening-discovery-v1";

export class NetSession {
  selfId = Math.random().toString(36).slice(2, 10);
  name = "Player" + Math.floor(Math.random() * 900 + 100);
  role: "host" | "client" | "none" = "none";
  room = "mass-awakening";
  peers = new Map<string, PeerState>();
  meta: WorldMetaLite | null = null;
  events: NetEvents = {};
  private chan: BroadcastChannel | null = null;
  private advertTimer: number | null = null;

  static supported(): boolean { return typeof BroadcastChannel !== "undefined"; }

  // ------- discovery (main menu) -------
  static listGames(onList: (games: Advert[]) => void): () => void {
    if (!NetSession.supported()) { onList([]); return () => {}; }
    const seen = new Map<string, Advert & { last: number }>();
    const ch = new BroadcastChannel(DISC);
    const push = () => {
      const now = Date.now();
      for (const [k, v] of seen) if (now - v.last > 4000) seen.delete(k);
      onList([...seen.values()]);
    };
    ch.onmessage = (ev) => {
      const m = ev.data as AdvertMsg;
      if (m.t === "advert") { seen.set(m.room, { room: m.room, hostName: m.hostName, meta: m.meta, players: m.players, last: Date.now() }); push(); }
    };
    ch.postMessage({ t: "who" } satisfies AdvertMsg);
    const iv = window.setInterval(() => { ch.postMessage({ t: "who" } satisfies AdvertMsg); push(); }, 1200);
    return () => { clearInterval(iv); ch.close(); };
  }

  // ------- host -------
  host(meta: WorldMetaLite) {
    this.close();
    this.meta = meta;
    this.role = "host";
    this.chan = new BroadcastChannel(this.room);
    this.chan.onmessage = (ev) => this.handle(ev.data as Msg);
    this.advertTimer = window.setInterval(() => {
      const d = new BroadcastChannel(DISC);
      d.postMessage({ t: "advert", room: this.room, hostName: this.name, meta, players: this.peers.size + 1 } satisfies AdvertMsg);
      setTimeout(() => d.close(), 300);
    }, 1500);
  }

  // ------- client -------
  join(advert: Advert) {
    this.close();
    this.room = advert.room;
    this.role = "client";
    this.chan = new BroadcastChannel(this.room);
    this.chan.onmessage = (ev) => this.handle(ev.data as Msg);
    this.post({ t: "hello", id: this.selfId, name: this.name });
    // retry hello a few times in case host was busy
    let n = 0;
    const iv = setInterval(() => {
      if (this.meta || ++n > 5) { clearInterval(iv); return; }
      this.post({ t: "hello", id: this.selfId, name: this.name });
    }, 600);
  }

  leave() {
    this.post({ t: "bye", id: this.selfId });
    this.close();
  }

  private close() {
    if (this.advertTimer) { clearInterval(this.advertTimer); this.advertTimer = null; }
    if (this.chan) { this.chan.close(); this.chan = null; }
    this.peers.clear();
    this.role = "none";
    this.meta = null;
  }

  private post(m: Msg) { try { this.chan?.postMessage(m); } catch { /* channel closed */ } }

  sendPos(x: number, y: number, z: number, yaw: number, pitch: number) {
    this.post({ t: "pos", id: this.selfId, name: this.name, x, y, z, yaw, pitch });
  }
  sendBlock(x: number, y: number, z: number, b: number) {
    this.post({ t: "block", id: this.selfId, x, y, z, b });
  }
  sendChat(text: string) {
    this.post({ t: "chat", id: this.selfId, name: this.name, text });
    this.events.onChat?.(this.name, text);
  }

  private handle(m: Msg) {
    if ((m as any).id === this.selfId) return;
    switch (m.t) {
      case "hello":
        if (this.role === "host" && this.meta) {
          this.post({ t: "welcome", to: m.id, meta: this.meta, hostId: this.selfId, hostName: this.name });
          this.upsertPeer(m.id, m.name, undefined);
          this.events.onPeerJoined?.(m.id, m.name);
        }
        break;
      case "welcome":
        if (this.role === "client" && m.to === this.selfId && !this.meta) {
          this.meta = m.meta;
          this.upsertPeer(m.hostId, m.hostName, undefined);
          this.events.onWelcome?.(m.meta);
          this.events.onPeerJoined?.(m.hostId, m.hostName);
        }
        break;
      case "pos":
        this.upsertPeer(m.id, m.name, { x: m.x, y: m.y, z: m.z, yaw: m.yaw, pitch: m.pitch });
        break;
      case "block":
        this.upsertPeer(m.id, "peer", undefined);
        this.events.onBlock?.(m.x, m.y, m.z, m.b);
        break;
      case "chat":
        this.upsertPeer(m.id, m.name, undefined);
        this.events.onChat?.(m.name, m.text);
        break;
      case "bye": {
        if (this.peers.delete(m.id)) this.events.onPeerLeft?.(m.id);
        break;
      }
    }
  }

  private upsertPeer(id: string, name: string, pos?: { x: number; y: number; z: number; yaw: number; pitch: number }) {
    let p = this.peers.get(id);
    if (!p) { p = { id, name, x: 0, y: -100, z: 0, yaw: 0, pitch: 0, lastSeen: Date.now() }; this.peers.set(id, p); }
    if (name && name !== "peer") p.name = name;
    if (pos) { p.x = pos.x; p.y = pos.y; p.z = pos.z; p.yaw = pos.yaw; p.pitch = pos.pitch; }
    p.lastSeen = Date.now();
  }

  // called from game loop: drop silent peers
  prunePeers() {
    const now = Date.now();
    for (const [id, p] of this.peers) {
      if (now - p.lastSeen > 7000) { this.peers.delete(id); this.events.onPeerLeft?.(id); }
    }
  }
}
