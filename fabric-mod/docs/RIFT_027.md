# Rift correction pass — 0.27.0-alpha

Baseline: the successful `ad86c346702279d2b0b06d3778c0ae6f9671a08e` 0.26 build
linked by the user. The branch also preserves the earlier interrupted attempt's
textured 3D staff assets, rather than reverting them to flat sprites.

## Changes

- Both staffs have 26.3 item definitions, textured 3D shafts, grip/head details,
  floating tip cubes, and explicit inventory/held transforms. No missing-model path.
- Rift opening: small cube → rotating/elongating bar with lightning → brief ring
  → stepped cross over 100 ticks. Removed the old initial oval and veil geometry.
- Clearer alpha-blended window and side walls, crisp rigid white edges, recessed
  corners and detached hollow boxes. No depth-writing opaque window.
- Native-renderer background refraction copies opaque terrain once per frame;
  the lens samples this separate texture, not the current color attachment.
  Reallocates on resolution/format changes. Failure uses translucent fallback.
- No giant rift curtains. Low-opacity cubes rise, shrink and dissolve instead of
  stretching into rods. General Sift world beams are suppressed during Endure.
- Server-side swept crossing tests the actual stepped silhouette and recessed
  planes in rift-local coordinates. Standing nearby, walking alongside, opening
  a rift around a stationary player, and crossing empty corners do not trigger it.
- Eight-tick contact glitch, then the walkable tunnel. No three-second orange
  flare or legacy cinematic fallback. Third-person uses a white world-space pixel
  shell/scatter around the traveller; it does not wash out the observer's HUD.
- Rift arrivals search a dry, supported, open surface clearing, with room for the
  player and rift. No cave carving, forced y=64 assumption, sky pad, or blue ritual
  plaza. A matching rift stands behind the player for 60 ticks before disappearing.
- Safe landing search is bounded to 289 candidates (one per tick, within 64 blocks
  of the destination origin). If none is safe, the player stays in the tunnel;
  walking back to the entrance returns to their saved source. Nether destinations
  use an open dry shelf below bedrock because that dimension has no outdoor grass.
- The separate ancient-city **ritual** portal is still cyan and keeps its existing
  return plaza. Those are deliberately not used for ordinary rift arrivals.

## Verification and limitations

Offline validation, regeneration checks, Java geometry tests and dedicated-server
smoke tests cover data, crossings, safe surface selection and registry loading.
The build workflow also compiles all core GLSL variants and the bundled shaderpack.

These are reference-guided changes, **not a verified 1:1 trailer reproduction**.
No graphical Minecraft client is available in the coding sandbox. The destination
vista remains procedural, not a live render of another dimension. With an active
Iris pack the native scene-copy lens is disabled (Iris owns different render targets);
transparency, rim geometry and cubes remain. Iris-specific refraction needs a
separate compatibility pass and graphical verification.

## In-game acceptance checklist

1. Remove the older mod JAR; install only `sift-overhaul-0.27.0-alpha.jar` on client
   and server. Keep a backup of existing worlds.
2. `/give @s entersift:rift_staff` and `rift_staff_blue`: check inventory, both
   first-person hands and third-person at multiple angles; no black/purple faces.
3. `/function entersift:dev/riftcheck`: watch opening in daylight, night and Endure.
   Verify cube/bar/ring/cross order, rigid white edges and readable terrain behind it.
4. Stand 0.5, 1 and 3 blocks from it; walk parallel and through empty corners.
   None should teleport. Cross the actual window in both directions and at a
   45-degree rift rotation; this should trigger the short glitch and tunnel.
5. Repeat with two players: only the crossing player travels; observers see white
   pixels around them, not a screen overlay. Check local third-person too.
6. Complete tunnels to all four destinations. Verify dry ground, headroom, open
   surface outside the Nether, matching arrival rift and disappearance after 3s.
   If blocked, walk back out of the tunnel rather than spawning inside terrain.
7. Check night aura: rising transparent cubes, no pillar curtains. Resize the
   window, change dimensions, reload resources, then test with Iris off/on.
   Refraction is currently expected only with Iris packs **off**.
