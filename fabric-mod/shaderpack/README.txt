DUNGEONS II OVERWORLD 0.12 - optional Iris shader pack bundled with Enter the Sift
===============================================================================
OFF by default. The mod copies Dungeons-II-Overworld-0.12.zip into shaderpacks/ only if it is
missing; it never selects or enables it. Turn it on in Video Settings > Shader Packs.

What it does (Overworld): warm sun and cool lavender-blue shadows, chunky volumetric
Dungeons-style clouds (bright white tops, lavender undersides, peach horizon), volumetric sun
god rays, water reflections and waterfall foam, soft distance blur and a saturated grade.
Nether/End get a light colour grade only.

The Sift (0.12): its sky, aurora, beams, rifts and colours are drawn by the mod in vanilla Java.
The mod registers its render pipelines with Iris (sky dome -> gbuffers_skybasic, glow and rift
frames -> gbuffers_basic), and this pack draws those as exact vertex colour, so the Sift looks the
same with the pack on as with it off. world_sift only adds an optional soft glow (Sift sky glow).

Original work, no third-party shader source. Not GPU-validated on every driver.
