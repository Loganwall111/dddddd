# Multiplayer status and architecture

**Playable local multiplayer shipped (v0.2):** `src/net/net.ts` implements the message
protocol over `BroadcastChannel`, so any tabs/windows of the same browser on this machine
can share a world — host advertises on a discovery channel, clients join, and positions,
block edits and chat sync live (remote players render as skinned humanoids with name tags).
Terrain is deterministic per seed, so only edits travel the wire. Cross-device play needs a
WebSocket relay speaking the same protocol; singleplayer still runs fully offline.

There is no external server in this repository. This document records the seams that were
kept clean so a hosted mode can be added without rewriting the engine, and the
responsibilities a real server-authoritative implementation must take on.

## Implemented transport (BroadcastChannel)

- `NetSession.host(meta)` — opens room channel, advertises on `mass-awakening-discovery-v1`.
- `NetSession.join(advert)` — hello/welcome handshake carries world seed/mode.
- Messages: `hello | welcome | pos | block | chat | bye` (see `src/net/net.ts`).
- `Game.frame()` sends `pos` at 10 Hz, prunes silent peers, and lerps remote models.
- Block edits broadcast from `onBlockBreak/onBlockPlace`, applied via `onBlock`.

## Existing seams

- **Player controller is decoupled from world data.** `PlayerController` reads/writes the world
  only through `WorldManager.getBlockWorld/setBlockWorld` and `raycast`. Its input state and
  physics state are plain data (`PlayerState`) that can be serialized.
- **World mutations funnel through one API.** All block changes go through
  `WorldManager.setBlockWorld`, which is the single choke point to broadcast edits.
- **Simulation/rendering split.** `Game.frame()` separates simulation updates (player, mobs,
  drops, furnaces, weather, boss) from `scene.render()`. The simulation step could be driven by
  network snapshots instead of local input.
- **Deterministic generation.** Terrain is a pure function of `(seed, worldType, dimension,
  chunkCoord)` — clients can generate terrain locally and only block *edits* need to be sent.
- **Persistence format is already delta-ish.** Saves store chunk block arrays keyed by
  `(dim, cx, cz)` — the same shape a chunk-update packet would carry.

## Transport abstraction (to be built)

A `NetTransport` interface with `connect/disconnect/send/onMessage` and two implementations —
`LoopbackTransport` (singleplayer) and `WebSocketTransport` — lets gameplay code stay
transport-agnostic.

## Server-authoritative responsibilities (required for real hosted play)

1. **Chunk truth.** The server owns authoritative chunk state, applies validated edits, and
   relays them. Clients predict locally and reconcile.
2. **Movement validation.** Client positions are treated as claims; the server re-simulates
   against voxel collision to reject cheating.
3. **Inventory authority.** Item stacks, crafting, and container contents must be validated
   server-side (clients are not trusted).
4. **Entity replication.** Mob AI and the boss should simulate on the server with interest
   management (only entities near a player are replicated).
5. **Save ownership.** World saving moves to the server; the IndexedDB layer becomes a client
   cache for assets/settings only.
6. **Identity/sessioning.** Join handshake, player identity, and dimension-scoped interest
   areas for broadcast.

A minimal first slice would replicate: join → identity → position streams → block edits
(via the existing `setBlockWorld` choke point) → simple chat-free co-op.
