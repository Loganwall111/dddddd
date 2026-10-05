# Beyond the Threshold — Fabric mod (Minecraft 1.20.1)

The overworld you generated is the skin of a nameless cosmic colossus.
A gigantic human eye opens above the clouds, reaches down, grabs you and
pixelates you into the truth. From then on the sky is a shader-raymarched
nebula holding the silhouette of the entity whose arm you stand on, black
holes lens the rendered frame with real einstein-ring deflection, the
membrane of reality can be cut open with a blade, and the **Radiate
Reality glasses** trigger the **Mandela Effect**: six procedural shader
realities, from absolute realism to backrooms.

Everything procedural — blocks, textures, dimensions, palettes, even the
registration code — is fabricated by **one script**: [`onepac.py`](onepac.py).

## The feature set (0.1.0-alpha)

* **The Eye intro** — on first join (or `/btt begin`) the Watcher eye
  entity looms, descends, grabs you; the `matrix_dissolve` post shader
  pixelates reality into raining code; when it releases, the threshold
  sky is awake.
* **Cosmic colossus skybox** — vanilla sky renderer replaced by a GLSL
  dome: nebula, stars, the head/shoulders/arms of the colossus with
  burning eyes, floating voxel isles, and a lensing black hole.
* **Black holes** (`Shattered Relic`) — inverse-square pull + tangential
  swirl, ragdoll grip (chaotic velocity, uncontrolled spin),
  spaghettification scaling, singularity travel into random dimensions,
  and nuke-physics collapse: flash, crater, shockwave ring of secondary
  detonations, screen shake. Real gravitational lensing is done in the
  `lensing` post shader (chromatic aberration, photon ring, doppler
  beaming, frame dragging).
* **Reality tears** (`Threshold Blade`) — cut the membrane; a jagged
  white-hot slit with a swirling other-side opens; walk through to
  travel. Sneak-use cycles the destination dimension.
* **Procedural multiverse** — 5 built-in dimensions (membrane, aurora,
  backrooms, ember, mycelia), each with its own sky palette, fog mood
  and terrain rebuilt from OnePac variant blocks (64 generated blocks in
  this seed). **Procedural inventories**: every dimension keeps its own
  inventory; new dimensions hand you a seeded starter kit.
* **Mandela Effect** (`Radiate Reality Glasses` + `V`) — six post-shader
  realities: `realism` (ACES grade, bloom, sharpen, grain), `psychedelic`,
  `blobs`, `backrooms`, `aurora`, `quantum`.
* **Realistic flowing water** — the vanilla water core shader is
  replaced: dual scrolling wave fields, procedural normals, fresnel sky
  sheen, sun glints, foam crests, depth absorption.
* **Config** — `B` opens the in-game menu; saved to
  `config/beyondthreshold.json`.
* `/btt` commands: `begin`, `blackhole`, `tear`, `glasses on|off`,
  `mandela <mode>`, `shrink <0.05-1>`, `grow`, `return`, `dimensions`.

## Build

```bash
cd beyond-threshold
./gradlew build          # jar in build/libs
```

CI (`.github/workflows/beyond-build.yml`) validates JSON/assets,
compile-checks **every GLSL program with glslangValidator**, builds the
mod and uploads the jar.

## OnePac — infinite procedural anything

```bash
python3 onepac.py --seed 424242 --variants 48 --dims 9
```

From one seed it generates variant block textures (pure-Python PNG
writer, no image libraries), blockstates/models/lang, dimension sky
palettes, item art, **and rewrites `BTTGeneratedContent.java`** — the
registration code itself. "Infinite" is just a bigger `--variants`.

## Architecture notes

* Post FX ride the vanilla `PostEffectProcessor` pipeline (mod-namespaced
  `shaders/post/*.json`), switched per-frame by `PostFxManager`; uniforms
  (black-hole screen positions, intensity, time) are pushed through
  `GlUniform`s.
* Sky + entity billboards are raw-GL shader geometry (`BttGL`), drawn in
  Fabric world-render events with depth-correct occlusion.
* Player state (glasses, threshold, intro) travels in scoreboard tags —
  synced and persistent for free.
