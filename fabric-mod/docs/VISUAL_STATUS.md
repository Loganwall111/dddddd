# Sift Rift & Sky Dome Visual Architecture — 0.22

## 1. Independent Sift Time-State System (`SiftTimeState` & `/sift time`)

The Sift's atmosphere and Rift visuals are controlled by `dev.logan.entersift.SiftTimeState`, completely independent from the Overworld day/night clock:

- **`/sift time set flow`** (`State.FLOW`):
  - Bright Sift atmospheric state dominated by cyan, turquoise, pale blue, pastel green, subtle pink/magenta, subtle upper-dome rainbow dispersion, large wavy dark charcoal "soul face" boundaries, and soft luminous shapes.
  - Maps the supplied panoramic `sift_flow_sky.png` (`art/sift-day-sky.png`) seamlessly across the upper sky dome.
- **`/sift time set thrive`** (`State.THRIVE`):
  - Near-night Sift atmospheric state with darker blue/cyan base, stronger magenta/pink accents, heightened contrast, **extremely strong accumulated soft volumetric god rays / light shafts**, stronger Rift luminance/bloom, and deeper back distortion.
  - Maps the supplied panoramic `sift_thrive_sky.png` (`art/sift-night-sky.png`) seamlessly across the upper sky dome.
- **`/sift time set lymph`** (aliases: `lava_lamp`, `lavalamp`, `legacy`, `pulse` — `State.LYMPH`):
  - Preserves and integrates the organic lava-lamp / lymph-field Sift atmosphere with metaball blobs, soft panels, and its own Rift parameter set.
- **`/sift time` / `/sift time query`**:
  - Displays the active Sift time state, lock/cycle mode, independent Sift clock ticks, and interpolated parameters.
- **`/sift time cycle on|off`**:
  - Toggles smooth automatic cycling along the independent Sift clock.

## 2. Sift Sky Dome (`SiftSky.java`)

- **Layer 0 & 1 — Background Sky Dome & Panoramic PNG Overlay**:
  - Equirectangular panoramic sampling (`samplePanorama`) of `/assets/entersift/textures/sky/sift_flow_sky.png` and `/assets/entersift/textures/sky/sift_thrive_sky.png` blended smoothly across 360° azimuth and faded into the horizon (`HORIZON` keyframes) with zero seams.
  - Includes upper-dome subtle rainbow dispersion in `FLOW` and organic metaball modulation in `LYMPH`.
- **Layer 2 — Soft Luminous Shapes & Wavy Dark "Soul Face" Bands (`softPanels`, `wavySoulBands`)**:
  - Slow-moving, soft-edged, translucent charcoal/near-black (`0x0B0E18`) wavy bands driven by layered low-frequency sine/cosine deformation (`sin`, `cos`, `smooth`, `mix`) that pinch and bow apart around luminous hollows to form the signature "soul face" silhouettes.
- **Layers 3–9 — Giant Sky Rift, Floating Light Squares & Volumetric God Rays**:
  - High in the Sift sky dome sits the Giant Sky Rift (`skyRiftBackDistortion`, `skyRiftOuterBands`, `skyRiftApertureAndEnergy`, `skyRiftFloatingSquares`) with 18 deterministic, soft-edged, semi-translucent floating light squares and accumulated soft volumetric god-ray shafts (`skyRays`), dramatically amplified in `THRIVE`.

## 3. World Rift 10-Layer Stack & Opening/Closing Sequence (`RiftPortalRenderer.java`, `RiftShape.java`, `rift.fsh`)

- **Layer 1 & 2 — Distant Atmospheric Fade & Back Distortion / Opening Depth (`backDistortionField`)**:
  - Concentric organic deformed depth rings rendered behind the Rift opening on `SiftRenderTypes.SKY_BLEND` with chromatic cyan/violet/magenta depth and smooth outer feather (never a flat black hole or opaque rectangle).
- **Layer 3 — Giant Vertically-Dominant Organic Rift Aperture (`RiftShape`, `windows`, `walls`, `frame`)**:
  - Crack-free (`no T-junctions`) recessed stepped/curved aperture with slow breathing wave deformation (`Warp`).
- **Layer 4 — Wavy Dark Outer Bands (`wavyOuterSoulBands`)**:
  - Translucent charcoal wavy outer bands framing the Rift perimeter with layered low-frequency sine/cosine waves.
- **Layer 5 & 6 — Colored Interior Energy & Inner Glow (`rift.fsh`, `innerCoreLuminance`, `rims`)**:
  - Direction-sampled viewport (`vec3 dir = normalize(worldRay);`) with cyan, turquoise, pastel green, pink/magenta, violet, and soft yellow interior energy currents, wavy dark soul bands, volumetric shafts, and a high-luminance white-cyan vertical core spine.
- **Layer 7 — Floating Light Squares (`floatingLightSquares`, `energyCubes`)**:
  - 16 deterministic, soft-edged, semi-translucent luminous square/rectangular fragments of small, medium, and larger sizes floating in 3D depth around and through the Rift.
- **Layer 8 & 9 — Volumetric God Rays & Bloom (`volumetricGodRaysAndBloom`, `curtains`)**:
  - Soft overlapping accumulated volumetric light shafts and radial bloom envelope, scaled by `SiftTimeState` (`godRayIntensity` and `riftBloomStrength`).
- **Opening & Closing Animation Sequence (Phases A–F)**:
  - **Phase A (Dormant, `age 0..10`)**: Subtle distortion seed and faint luminance.
  - **Phase B (Distortion, `age 10..35`)**: Radial back-distortion depth field expands and lightning sparks ripple across the distortion plane.
  - **Phase C (White Ignition, `age 31..65`)**: Central seed and vertical rupture ignite with pure brilliant white luminance (`whiteIgnitionCore`).
  - **Phase D (Color Reveal, `age 61..100`)**: White ignition transitions smoothly (`colorRevealForAge`) into cyan, turquoise, pastel green, pink, magenta, and violet as tiers snap open and wavy dark outer bands unfurl.
  - **Phase E (Stable Open Rift, `age 100..5900`)**: Full colored interior depth, breathing waves, wavy dark outer bands, floating light squares, volumetric god rays, and bloom.
  - **Phase F (Closing, `age 5900..6000`)**: Clean reverse sequence — color drains back toward white, outer bands and floating squares contract, aperture collapses, and back distortion fades out.
