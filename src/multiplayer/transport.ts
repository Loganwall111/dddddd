export type NetworkMessage =
  | { type: 'presence'; id: string; name: string; dimension: string; position: [number, number, number]; timestamp: number }
  | { type: 'edit'; id: string; dimension: string; x: number; y: number; z: number; block: number }
  | { type: 'leave'; id: string };
export interface Transport { send(message: NetworkMessage): void; subscribe(listener: (message: NetworkMessage) => void): () => void; close(): void }
export class WebSocketTransport implements Transport {
  private socket: WebSocket;
  private listeners = new Set<(message: NetworkMessage) => void>();
  constructor(url: string, public onStatus: (status: 'connected' | 'disconnected' | 'error') => void) {
    if (!/^wss?:\/\//.test(url)) throw new Error('Use a ws:// or wss:// server address.');
    this.socket = new WebSocket(url);
    this.socket.onopen = () => onStatus('connected'); this.socket.onclose = () => onStatus('disconnected'); this.socket.onerror = () => onStatus('error');
    this.socket.onmessage = event => { try { const m = JSON.parse(event.data) as NetworkMessage; if (m && ['presence', 'edit', 'leave'].includes(m.type) && typeof m.id === 'string') this.listeners.forEach(listener => listener(m)); } catch { /* Invalid network packets are discarded at the boundary. */ } };
  }
  send(message: NetworkMessage) { if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message)); }
  subscribe(listener: (message: NetworkMessage) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  close() { this.socket.close(); this.listeners.clear(); }
}