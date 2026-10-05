package dev.logan.entersift.client;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.logan.entersift.SiftContent;
import net.fabricmc.fabric.api.client.rendering.v1.level.LevelRenderEvents;
import net.minecraft.client.Minecraft;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.resources.Identifier;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.phys.Vec3;

/**
 * 0.9 Sift sky: a procedural "lava lamp" of slowly drifting, merging colour blobs. There are no
 * textures, panoramas or shader packs; everything is computed in Java every frame.
 *
 * How it is drawn (vanilla/Fabric only): Fabric 26.3 has no sky hook, so the sky is a finely
 * tessellated sphere submitted in COLLECT_SUBMITS with {@link SiftRenderTypes#SOLID}. That type
 * uses the core {@code position_color} shader, which has no fog term, and it depth-tests normally.
 * The sphere sits beyond the last rendered chunk and inside the far plane, so terrain always stays
 * in front and the blobs show wherever the sky is open. Colours are per vertex; the GPU blends
 * them smoothly between vertices, which is what gives the soft lava-lamp edges.
 *
 * Horizon: the lowest band fades to exactly the fog colour of timeline entersift:sift_cycle
 * (same keyframes, see STAGE_TICKS), so distant terrain melts into the sky without a seam.
 *
 * Cycle (world clock, 24000 ticks). The ground and ichor are tinted by the same timeline via
 * sky_light_color, so they follow the sky's dominant colour.
 *   day      soft teal-blue horizon -> radiant mint-green -> pale violet overhead (trailer frames)
 *   noon     the same, brighter, with a pearl sheen at the zenith
 *   evening  dusty rose horizon, lilac and soft blue-violet above
 *   night    soft hazy amber-gold backdrop with dusty crimson highlights
 * 0.13: there is NO sun in the Sift (the day/night cycle stays). Its light comes from soft
 * multi-coloured columns falling from the sky itself and coloured beams that land on the ground.
 *
 * 0.12 layer stack (render types from {@link SiftRenderTypes}; no OIT, so terrain does not flicker):
 *   1. opaque gradient dome with a faint pastel lava-lamp shimmer
 *   2. soft trans-aurora curtains: long wavy vertical sheets, additive, base alpha 0.18, smoothstep
 *      falloff on every margin (no rectangles, no hard lines anywhere in the sky)
 *   3. world-space diagonal light beams, soft across their width, tinting the ground where they land
 */
public final class SiftSky {
    private SiftSky() {}

    // Keyframes shared with tools/phase10.py (timeline). Index = stage: 0 day, 1 noon, 2 evening, 3 night.
    static final int[] STAGE_TICKS = {0, 3500, 5000, 8500, 11000, 14500, 16500, 22500};
    static final int[] STAGE_AT = {0, 0, 1, 1, 2, 2, 3, 3};

    /** Horizon / fog colour per stage (identical to the timeline's fog_color and sky_color). */
    static final float[][] HORIZON = {rgb(0x7FD3CF), rgb(0x8FC2C4), rgb(0xC86A92), rgb(0xDB7840)}; // 0.16 spec: cyan, mint, magenta-rose, amber
    /** 0.12 middle band per stage: radiant mint-green by day, lilac at evening, deeper amber at night. */
    /** 0.17: deeper, saturated teal toward the zenith (the ref sky is teal, not milky white). */
    private static final float[][] MID = {rgb(0x5CC8C4), rgb(0x78C6C0), rgb(0xB45C8C), rgb(0xC8683A)};
    /** Zenith base colour per stage. */
    /** Zenith per stage: pale violet overhead by day and noon, soft blue-violet at evening, hazy gold at night. */
    private static final float[][] ZENITH = {rgb(0x2E9AA6), rgb(0x4AA8AC), rgb(0x7A3C7C), rgb(0x9A4A30)}; // 0.17 teal overhead
    /** Four soft lava-lamp tints per stage (0.12: pastel and faint; they only shimmer over the gradient). */
    private static final float[][][] BLOBS = {
        {rgb(0xF08CB4), rgb(0x7FF0D0), rgb(0x4FD0E0), rgb(0xFFA8C8)},   // 0.17: pink / mint / teal, no pastel white
        {rgb(0x9CF0D8), rgb(0xF0A0C0), rgb(0x60D0D0), rgb(0xB8F0DC)},
        {rgb(0xFF8CB8), rgb(0x70D0D8), rgb(0xD080C0), rgb(0xFFA890)},
        {rgb(0xFFB060), rgb(0xE86A50), rgb(0xFFD08A), rgb(0xC05A70)}};
    /** Dusty crimson highlights in the night haze. */
    private static final float[] PILLAR = rgb(0xA84E56);
    /** Aurora curtain colours from the trailer: mint green, pale white-cyan, soft pink, pale violet. */
    private static final float[][] AURORA = {rgb(0x7DFFC4), rgb(0x5FE0E0), rgb(0xFF8CC0), rgb(0xB89CFF)};
    /** 0.17 panel sky (rose / frost biomes): teal, green and pink translucent rectangles. */
    private static final float[][] PANEL_COLS = {rgb(0x3FE0C0), rgb(0x7FF0A0), rgb(0xFF8FC0), rgb(0x2FB8C8), rgb(0xFFB0D0)};
    /** 0.17 swirl sky (coral / tidepool biomes): soft pink and teal blobs. */
    private static final float[][] SWIRL_COLS = {rgb(0xFF9CC4), rgb(0x4FD6CF), rgb(0xFF7FB0), rgb(0x3FB8C0), rgb(0xFFC0D8)};
    /** Biomes that get the swirl sky; every other Sift biome gets the panel sky. */
    static final java.util.Set<String> SWIRL_BIOMES = java.util.Set.of("coral_expanse", "tidepool_reef", "singer_meadow", "soul_valley");
    /** 0 = panel sky, 1 = swirl sky; eased toward the camera biome's target so crossing a border blends. */
    private static float swirl = -1f;
    private static long swirlAt;
    /**
     * 0.21 biome states, eased like the swirl weight:
     *  A  Singer Meadow: pale mint (#8FC2C4) and pearl-white lava lamp with electric-cyan aurora arcs;
     *  B  red canyon biomes (Rose Spires, Frostbloom Spires): heavy magenta / dusty rose / crimson.
     */
    static final java.util.Set<String> MEADOW_BIOMES = java.util.Set.of("singer_meadow");
    static final java.util.Set<String> BASIN_BIOMES = java.util.Set.of("rose_spires", "titan_crags");
    private static final float[] MEADOW_MINT = rgb(0x8FC2C4), PEARL = rgb(0xF2F8F4), ELECTRIC_CYAN = rgb(0x3FF3FF);
    private static final float[] BASIN_CRIMSON = rgb(0xB8384A), BASIN_ROSE = rgb(0xC87A8A), BASIN_MAGENTA = rgb(0x9A2F78);
    static float meadow = 0f, basin = 0f;

    private static final int AZ = 72, EL = 36;
    private static int lastRadius = -1;

    private static float[] rgb(int c) { return new float[]{(c >> 16 & 255) / 255f, (c >> 8 & 255) / 255f, (c & 255) / 255f}; }

    public static void register() {
        SiftRenderTypes.initialize();
        LevelRenderEvents.COLLECT_SUBMITS.register(context -> {
            Minecraft mc = Minecraft.getInstance();
            if (mc.level == null) return;
            // 0.11 dimension guard: only ever draw inside the entersift namespace, and only in the Sift.
            Identifier dim = mc.level.dimension().identifier();
            if (!dim.toString().startsWith("entersift:") || !dim.equals(SiftContent.id("the_sift"))) return;
            float partial = context.levelState().worldPartialTicks;
            float tick = (float) (mc.level.getOverworldClockTime() % 24000L) + partial;
            float seconds = (float) ((System.nanoTime() / 1.0e9) % 7200.0);
            int chunks = mc.options.renderDistance().get();
            // Beyond the furthest chunk corner (~1.45 x render distance), inside the far plane (4 x).
            float radius = Math.max(96f, chunks * 16f * 2.4f);
            if ((int) radius != lastRadius) {
                lastRadius = (int) radius;
                org.slf4j.LoggerFactory.getLogger("entersift").info("[Sift] lava-lamp sky radius {} blocks", lastRadius);
            }
            updateMode(mc, context.levelState().cameraRenderState.pos);
            final float sw = swirl;
            Palette pal = palette(tick);
            Vec3 cam = context.levelState().cameraRenderState.pos;
            float beamRange = Math.min(chunks * 16f, 176f);
            List<float[]> beams = collectBeams(mc, cam, beamRange, tick);
            PoseStack pose = context.poseStack();
            pose.pushPose(); // balanced: every push is popped even if a submit throws
            try {
                var out = context.submitNodeCollector();
                // Layer 1: opaque lava-lamp dome (writes depth, no OIT, no fog).
                out.submitCustomGeometry(pose, SiftRenderTypes.SKY, (p, vc) -> dome(p, vc, radius, pal, seconds, sw));
                // 0.22: the NEW animated skybox as a giant overlay dome just INSIDE the main dome: faint
                // additive wavy bands on their own shell, so the original lava-lamp dome stays visible
                // underneath it everywhere (the reference Sift sky is a layered sky, not one flat gradient).
                out.submitCustomGeometry(pose, SiftRenderTypes.GLOW, (p, vc) -> overlayDome(p, vc, radius * 0.995f, pal, seconds));
                // Layer 2 (alpha blended, keeps colours saturated): panels or swirling blobs by biome.
                out.submitCustomGeometry(pose, SiftRenderTypes.SKY_BLEND, (p, vc) -> {
                    if (sw < 0.98f) softPanels(p, vc, radius * 0.985f, pal, seconds, 1f - sw);
                    if (sw > 0.02f) swirlBlobs(p, vc, radius * 0.985f, pal, seconds, sw);
                    // 0.23.3: quilt LAST - the smooth blob layers were washing the rectangles out
                    quiltPatches(p, vc, radius * 0.988f, pal, seconds);
                });
                // Layer 3 in the sky: soft aurora curtains and multi-coloured light columns (additive, no sun).
                out.submitCustomGeometry(pose, SiftRenderTypes.GLOW, (p, vc) -> {
                    auroraCurtains(p, vc, radius * 0.98f, pal, seconds);
                    wavyArches(p, vc, radius * 0.99f, pal, seconds);
                    skyRays(p, vc, radius * 0.96f, pal, seconds);
                });
                // World-space diagonal beams slicing into the terrain, with a tint pool where each one lands.
                if (!beams.isEmpty()) out.submitCustomGeometry(pose, SiftRenderTypes.GLOW, (p, vc) -> worldBeams(p, vc, beams, cam, pal, seconds, beamRange));
            } finally {
                pose.popPose();
            }
        });
    }

    /** 0.17: which of the two Sift skies the camera's biome uses, eased over ~3 s. */
    private static void updateMode(Minecraft mc, Vec3 camPos) {
        float target = 0f, tMeadow = 0f, tBasin = 0f;
        try {
            var key = mc.level.getBiome(net.minecraft.core.BlockPos.containing(camPos)).unwrapKey();
            String path = key.isPresent() ? key.get().identifier().getPath() : "";
            if (SWIRL_BIOMES.contains(path)) target = 1f;
            if (MEADOW_BIOMES.contains(path)) tMeadow = 1f;
            if (BASIN_BIOMES.contains(path)) tBasin = 1f;
        } catch (Throwable ignored) { }
        long now = System.nanoTime();
        if (swirl < 0f) { swirl = target; meadow = tMeadow; basin = tBasin; swirlAt = now; return; }
        float dt = Math.min(0.25f, (now - swirlAt) / 1.0e9f);
        swirlAt = now;
        float step = dt / 3f;
        swirl = ease(swirl, target, step);
        meadow = ease(meadow, tMeadow, step);
        basin = ease(basin, tBasin, step);
    }

    private static float ease(float v, float target, float step) {
        return v < target ? Math.min(target, v + step) : Math.max(target, v - step);
    }

    // ------------------------------------------------------------------ cycle

    /** Colours for the current tick, blended between the two neighbouring stages. */
    record Palette(float[] horizon, float[] mid, float[] zenith, float[][] blobs, float pillars, float noon) {}

    static float[] stageMix(float tick) {
        int n = STAGE_TICKS.length;
        for (int i = 0; i < n; i++) {
            int a = STAGE_TICKS[i], b = i + 1 < n ? STAGE_TICKS[i + 1] : 24000 + STAGE_TICKS[0];
            if (tick >= a && tick < b) {
                float f = (tick - a) / (float) (b - a);
                // Linear, exactly like the timeline interpolates fog_color, so the horizon stays seamless.
                return new float[]{STAGE_AT[i], STAGE_AT[(i + 1) % n], f};
            }
        }
        return new float[]{0, 0, 0};
    }

    private static float[] lerp(float[] a, float[] b, float f) {
        return new float[]{a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f};
    }

    static Palette palette(float tick) {
        float[] m = stageMix(tick);
        int a = (int) m[0], b = (int) m[1];
        float f = m[2];
        float[][] blobs = new float[4][];
        for (int k = 0; k < 4; k++) blobs[k] = lerp(BLOBS[a][k], BLOBS[b][k], f);
        float pillars = (a == 3 ? 1 - f : 0) + (b == 3 ? f : 0);
        float noon = (a == 1 ? 1 - f : 0) + (b == 1 ? f : 0);
        return new Palette(lerp(HORIZON[a], HORIZON[b], f), lerp(MID[a], MID[b], f), lerp(ZENITH[a], ZENITH[b], f), blobs, pillars, noon);
    }

    /** Sun direction: rises in the east (+X) at tick 0, overhead at 6000, sets at 12000. */
    static float[] sunDirection(float tick) {
        double a = (tick - 6000.0) / 24000.0 * Math.PI * 2;
        return new float[]{(float) -Math.sin(a), (float) Math.cos(a), 0.18f};
    }

    // ------------------------------------------------------------------ noise

    private static final int[] PERM = new int[512];
    static {
        java.util.Random r = new java.util.Random(0x5117L);
        int[] p = new int[256];
        for (int i = 0; i < 256; i++) p[i] = i;
        for (int i = 255; i > 0; i--) { int j = r.nextInt(i + 1); int t = p[i]; p[i] = p[j]; p[j] = t; }
        for (int i = 0; i < 512; i++) PERM[i] = p[i & 255];
    }

    private static float fade(float t) { return t * t * t * (t * (t * 6 - 15) + 10); }

    private static float grad(int h, float x, float y, float z) {
        int g = h & 15;
        float u = g < 8 ? x : y, v = g < 4 ? y : (g == 12 || g == 14 ? x : z);
        return ((g & 1) == 0 ? u : -u) + ((g & 2) == 0 ? v : -v);
    }

    /** Classic 3D Perlin noise, roughly in [-1, 1]. */
    static float noise(float x, float y, float z) {
        int X = (int) Math.floor(x) & 255, Y = (int) Math.floor(y) & 255, Z = (int) Math.floor(z) & 255;
        x -= (float) Math.floor(x); y -= (float) Math.floor(y); z -= (float) Math.floor(z);
        float u = fade(x), v = fade(y), w = fade(z);
        int A = PERM[X] + Y, AA = PERM[A] + Z, AB = PERM[A + 1] + Z, B = PERM[X + 1] + Y, BA = PERM[B] + Z, BB = PERM[B + 1] + Z;
        float x1 = mix(grad(PERM[AA], x, y, z), grad(PERM[BA], x - 1, y, z), u);
        float x2 = mix(grad(PERM[AB], x, y - 1, z), grad(PERM[BB], x - 1, y - 1, z), u);
        float y1 = mix(x1, x2, v);
        x1 = mix(grad(PERM[AA + 1], x, y, z - 1), grad(PERM[BA + 1], x - 1, y, z - 1), u);
        x2 = mix(grad(PERM[AB + 1], x, y - 1, z - 1), grad(PERM[BB + 1], x - 1, y - 1, z - 1), u);
        return mix(y1, mix(x1, x2, v), w);
    }

    private static float mix(float a, float b, float t) { return a + (b - a) * t; }

    private static float smooth(float e0, float e1, float x) {
        float t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
        return t * t * (3 - 2 * t);
    }

    /** Two-octave drifting field for blob k; warped by a slow flow so blobs stretch, merge and split. */
    private static float blob(int k, float x, float y, float z, float t) {
        float s = 1.35f, drift = t * (0.018f + 0.006f * k);
        float wx = noise(x * 0.8f + 11 * k, y * 0.8f + drift, z * 0.8f) * 0.6f;
        float wy = noise(x * 0.8f, y * 0.8f + 23 * k, z * 0.8f - drift) * 0.6f;
        float n = noise((x + wx) * s + 37 * k + drift, (y + wy) * s * 1.2f - drift * 0.7f, z * s + drift * 0.5f)
            + 0.45f * noise(x * s * 2.1f - drift, y * s * 2.1f + 51 * k, z * s * 2.1f + drift);
        return n;
    }

    // ------------------------------------------------------------------ geometry

    private static float[] skyColour(float x, float y, float z, Palette pal, float t, float sw) {
        float up = Math.max(0f, y);
        // 0.12: smooth three-stop gradient (horizon -> mid -> zenith), like the trailer frames.
        float[] c = lerp(pal.horizon(), pal.mid(), smooth(0.02f, 0.45f, up));
        c = lerp(c, pal.zenith(), smooth(0.4f, 0.95f, up));
        // 0.17 swirl sky: rotate the sample around the vertical by a noise-driven angle, so the blobs
        // wind into slow pink / teal spirals; the panel sky keeps only a faint shimmer.
        float sx = x, sz = z;
        if (sw > 0.01f) {
            float ang = sw * 2.4f * noise(x * 0.9f + t * 0.004f, y * 1.1f, z * 0.9f - t * 0.003f);
            float ca = (float) Math.cos(ang), sa = (float) Math.sin(ang);
            sx = x * ca - z * sa; sz = x * sa + z * ca;
        }
        for (int k = 0; k < 4; k++) {
            float w = smooth(0.05f, 0.7f, blob(k, sx, y, sz, t)) * (0.22f + 0.5f * sw);
            float[] tint = sw > 0.01f ? lerp(pal.blobs()[k], lerp(SWIRL_COLS[k], pal.blobs()[k], 0.35f), sw) : pal.blobs()[k];
            c = lerp(c, tint, w);
        }
        if (pal.noon() > 0.01f) { // pearl sheen around the zenith at noon
            float pearl = smooth(0.55f, 1f, up) * 0.12f * pal.noon(); // 0.17: much fainter (was washing the sky white)
            c = lerp(c, new float[]{0.96f, 1f, 0.97f}, pearl);
        }
        if (pal.pillars() > 0.01f) { // soft crimson vertical pillars at night: columns in azimuth, fading upward
            float az = (float) Math.atan2(z, x);
            float col = noise((float) Math.cos(az) * 3.2f + t * 0.01f, (float) Math.sin(az) * 3.2f, t * 0.02f)
                + 0.35f * noise((float) Math.cos(az) * 7f, (float) Math.sin(az) * 7f + t * 0.015f, y * 1.5f);
            float edge = smooth(0.02f, 0.6f, col) * (1 - smooth(0.25f, 0.95f, up)) * smooth(-0.1f, 0.12f, y);
            c = lerp(c, PILLAR, edge * 0.45f * pal.pillars());
        }
        // 0.21 biome states (kept weaker at night so the amber night stage still reads).
        float dayK = 1f - 0.5f * pal.pillars();
        float[] horizon = pal.horizon();
        if (meadow > 0.01f) {
            float[] m = lerp(MEADOW_MINT, PEARL, smooth(0.15f, 0.95f, up) * 0.7f);
            m = lerp(m, PEARL, smooth(0.1f, 0.7f, blob(1, sx, y, sz, t)) * 0.35f);      // pearl lava-lamp blobs
            c = lerp(c, m, meadow * 0.75f * dayK);
            horizon = lerp(horizon, MEADOW_MINT, meadow * 0.6f * dayK);
        }
        if (basin > 0.01f) {
            float[] b = lerp(BASIN_CRIMSON, BASIN_ROSE, smooth(0f, 0.4f, up));
            b = lerp(b, BASIN_MAGENTA, smooth(0.35f, 0.95f, up));
            c = lerp(c, b, basin * 0.8f * dayK);
            horizon = lerp(horizon, BASIN_ROSE, basin * 0.7f * dayK);
        }
        // Melt into the fog colour at and below the horizon: no seam against distant terrain.
        float haze = 1 - smooth(-0.02f, 0.2f, y);
        return lerp(c, horizon, haze);
    }

    private static void dome(PoseStack.Pose p, VertexConsumer vc, float r, Palette pal, float t, float sw) {
        float[][][] cache = new float[AZ + 1][EL + 1][];
        float[][][] pos = new float[AZ + 1][EL + 1][];
        for (int i = 0; i <= AZ; i++) for (int j = 0; j <= EL; j++) {
            double az = i / (double) AZ * Math.PI * 2;
            // Denser rings near the horizon, where the colour changes fastest.
            double s = j / (double) EL * 2 - 1;
            double el = Math.signum(s) * Math.pow(Math.abs(s), 1.35) * Math.PI / 2;
            float x = (float) (Math.cos(el) * Math.cos(az)), y = (float) Math.sin(el), z = (float) (Math.cos(el) * Math.sin(az));
            pos[i][j] = new float[]{x, y, z};
            cache[i][j] = skyColour(x, y, z, pal, t, sw);
        }
        for (int i = 0; i < AZ; i++) for (int j = 0; j < EL; j++) {
            v(p, vc, pos[i][j], r, cache[i][j], 1f);
            v(p, vc, pos[i + 1][j], r, cache[i + 1][j], 1f);
            v(p, vc, pos[i + 1][j + 1], r, cache[i + 1][j + 1], 1f);
            v(p, vc, pos[i][j + 1], r, cache[i][j + 1], 1f);
        }
    }

    private static void v(PoseStack.Pose p, VertexConsumer vc, float[] d, float r, float[] c, float a) {
        if (!SiftBudget.take(vc)) return; // 0.16: never exceed 16-bit quad indices in one batch
        // 0.13 guard: a NaN/infinite vertex would stretch across the screen; collapse it instead (keeps quads intact).
        if (!Float.isFinite(d[0] + d[1] + d[2])) { vc.addVertex(p, 0f, 0f, 0f).setColor(0f, 0f, 0f, 0f); return; }
        vc.addVertex(p, d[0] * r, d[1] * r, d[2] * r).setColor(Math.min(1f, c[0]), Math.min(1f, c[1]), Math.min(1f, c[2]), a);
    }

    // ------------------------------------------------------------------ 0.11 sky layers

    private static float hash(int a, int b, int c) {
        long h = a * 0x9E3779B97F4A7C15L + b * 0xBF58476D1CE4E5B9L + c * 0x94D049BB133111EBL + 0x5117L;
        h ^= h >>> 31; h *= 0x7FB5D329728EA185L; h ^= h >>> 27;
        return (h >>> 40) / (float) (1L << 24);
    }

    private static float[] dir(double az, double el) {
        return new float[]{(float) (Math.cos(el) * Math.cos(az)), (float) Math.sin(el), (float) (Math.cos(el) * Math.sin(az))};
    }

    private static float[] bright(float[] c, float w) { return lerp(c, new float[]{1f, 1f, 1f}, w); }

    /** How strongly the aurora shows: a little fainter at noon, strongest in the evening and at night. */
    private static float auroraStrength(Palette pal) { return (0.7f + 0.3f * (1 - pal.noon())) * (1f + 0.8f * meadow); }

    private static final int CURTAINS = 7, CURTAIN_SEGS = 56, CURTAIN_ROWS = 8;
    /** 0.12: base transparency of every curtain (strict additive blending, SiftRenderTypes.GLOW). */
    static final float CURTAIN_ALPHA = 0.18f;

    /**
     * 0.12 trans-aurora curtains (replaces the 0.11 streaks and rectangular shard panels). Each curtain
     * is a long, vertical, wavy sheet hanging from a baseline that meanders around the sky. It is
     * tessellated into a grid and every vertex carries its own alpha, so the sheet is an ultra-soft,
     * anti-aliased gradient: smoothstep falloff at both ends and at the top and bottom margins,
     * shimmering folds along its length, and a colour that shifts from the bottom (mint or white-cyan)
     * to the top (pink or violet). There are no hard edges, and the gradient sky shows through.
     */
    private static void auroraCurtains(PoseStack.Pose p, VertexConsumer vc, float r, Palette pal, float t) {
        float strength = auroraStrength(pal);
        float[][] row = new float[CURTAIN_ROWS + 1][];
        float[] rowA = new float[CURTAIN_ROWS + 1];
        float[][] prev = null;
        float[] prevA = null;
        for (int k = 0; k < CURTAINS; k++) {
            double a0 = hash(k, 1, 0) * Math.PI * 2 + t * (0.004 + 0.003 * (k % 3)) * (k % 2 == 0 ? 1 : -1);
            double span = 1.3 + 1.1 * hash(k, 2, 0);
            double e0 = 0.1 + 0.55 * hash(k, 3, 0) + 0.25 * meadow, height = 0.3 + 0.32 * hash(k, 4, 0);  // meadow: high ceiling arcs
            float[] bottom = lerp(lerp(AURORA[k % 3], pal.blobs()[k % 4], 0.2f), ELECTRIC_CYAN, meadow * 0.6f);  // mint, white-cyan or pink
            float[] top = lerp(lerp(AURORA[(k + 2) % 4], pal.blobs()[(k + 1) % 4], 0.2f), PEARL, meadow * 0.3f);
            float pulse = 0.8f + 0.2f * (float) Math.sin(t * 0.17f + k * 1.9f);
            prev = null;
            for (int sgi = 0; sgi <= CURTAIN_SEGS; sgi++) {
                float f = sgi / (float) CURTAIN_SEGS;
                // Wavy baseline: slow meander in elevation, folds in azimuth that ripple along the curtain.
                double az = a0 + span * f + 0.035 * Math.sin(f * 14 + t * 0.23 + k) + 0.02 * Math.sin(f * 31 - t * 0.31);
                double el = e0 + 0.07 * Math.sin(f * 4.2 + k * 2.3 + t * 0.05) + 0.03 * Math.sin(f * 9.7 - t * 0.09);
                float ends = smooth(0f, 0.22f, f) * smooth(1f, 0.78f, f);
                float fold = 0.55f + 0.45f * (0.5f + 0.5f * noise(f * 9f + k * 7.1f, t * 0.06f, k * 3.3f));
                float base = CURTAIN_ALPHA * strength * pulse * ends * fold;
                for (int j = 0; j <= CURTAIN_ROWS; j++) {
                    float v = j / (float) CURTAIN_ROWS;
                    // Soft bottom edge, long upward fade: smoothstep falloff on both vertical margins.
                    float prof = smooth(0f, 0.18f, v) * (1f - smooth(0.3f, 1f, v));
                    double lean = 0.06 * v * Math.sin(f * 6 + t * 0.12 + k);   // curtains sway a little as they rise
                    row[j] = dir(az + lean, el + height * v);
                    rowA[j] = base * prof;
                }
                if (prev != null) for (int j = 0; j < CURTAIN_ROWS; j++) {
                    float v0 = j / (float) CURTAIN_ROWS, v1 = (j + 1) / (float) CURTAIN_ROWS;
                    float[] c0 = lerp(bottom, top, smooth(0.1f, 0.9f, v0)), c1 = lerp(bottom, top, smooth(0.1f, 0.9f, v1));
                    if (prevA[j] + prevA[j + 1] + rowA[j] + rowA[j + 1] < 0.002f) continue;
                    v(p, vc, prev[j], r, c0, prevA[j]); v(p, vc, row[j], r, c0, rowA[j]);
                    v(p, vc, row[j + 1], r, c1, rowA[j + 1]); v(p, vc, prev[j + 1], r, c1, prevA[j + 1]);
                }
                if (prev == null) { prev = new float[CURTAIN_ROWS + 1][]; prevA = new float[CURTAIN_ROWS + 1]; }
                System.arraycopy(row, 0, prev, 0, row.length);
                System.arraycopy(rowA, 0, prevA, 0, rowA.length);
            }
        }
    }

    // ------------------------------------------------------------------ 0.23 quilted pastel sky

    private static final int QAZ = 12, QEL = 5;
    /** 0.23 MCD2 reference: the Sift sky is a QUILT of huge soft pastel rectangles (mint / pink / peach /
     *  lilac / cream), not a smooth gradient. Tiles drift slowly and each fades with smoothstep toward
     *  its borders so neighbouring patches blend like brushed candy (alpha blended over the dome). */
    private static final float[][] QUILT = {rgb(0xFFB8D0), rgb(0xFFDCA8), rgb(0xF0A8B8), rgb(0xF8F4E8),
        rgb(0xC8B8F0), rgb(0xFFC8C0), rgb(0x9FF0D8), rgb(0xF0E0B8)};   // 0.23.4: warm-weighted like the MCD2 sample (5 warm / 2 cool-ish / 1 lilac)

    private static void quiltPatches(PoseStack.Pose p, VertexConsumer vc, float r, Palette pal, float t) {
        float drift = t * 0.0045f;
        for (int i = 0; i < QAZ; i++) for (int j = 0; j < QEL; j++) {
            float h = hash(i, j, 171);
            float[] col = lerp(QUILT[(int) (h * QUILT.length) % QUILT.length], pal.blobs()[(i + j) % 4], 0.10f);
            float alpha = 0.62f + 0.25f * hash(i, j, 172);   // 0.23.4: near-opaque - in the MCD2 ref the quilt IS the sky; seams still whisper the old dome through
            alpha *= 0.85f + 0.15f * (float) Math.sin(t * 0.09f + h * 6.28f);
            double az0 = (i / (float) QAZ + drift) * Math.PI * 2, az1 = ((i + 1) / (float) QAZ + drift) * Math.PI * 2;
            double el0 = -0.05 + j / (float) QEL * 1.5, el1 = -0.05 + (j + 1) / (float) QEL * 1.5;
            int g = 4;   // tessellate so the smoothstep border falloff is soft
            float[][] d = new float[(g + 1) * (g + 1)][];
            float[][] a = new float[g + 1][g + 1];
            for (int gy = 0; gy <= g; gy++) for (int gx = 0; gx <= g; gx++) {
                float sx = gx / (float) g * 2 - 1, sy = gy / (float) g * 2 - 1;
                double az = az0 + (az1 - az0) * gx / g, el = el0 + (el1 - el0) * gy / g;
                d[gy * (g + 1) + gx] = dir(az, el);
                a[gy][gx] = alpha * smooth(1f, 0.90f, Math.abs(sx)) * smooth(1f, 0.90f, Math.abs(sy));
            }
            for (int gy = 0; gy < g; gy++) for (int gx = 0; gx < g; gx++) {
                int a0 = gy * (g + 1) + gx, a1 = a0 + 1, a2 = a0 + g + 2, a3 = a0 + g + 1;
                v(p, vc, d[a0], r, col, a[gy][gx]); v(p, vc, d[a1], r, col, a[gy][gx + 1]);
                v(p, vc, d[a2], r, col, a[gy + 1][gx + 1]); v(p, vc, d[a3], r, col, a[gy + 1][gx]);
            }
        }
    }

    // ------------------------------------------------------------------ 0.22 wavy sky layers

    private static final int ARCHES = 5, ARCH_SEGS = 96;

    /**
     * 0.22 accuracy pass: the reference Sift sky is crossed by long WAVY ribbon arches - undulating,
     * near-horizontal luminous lines - not only by vertical curtains. Each arch meanders all the way
     * around the sky: its elevation centre is a sum of three travelling sine undulations (so the line
     * itself is wavy and animates), and the alpha falls to zero with smoothstep across the band, so an
     * arch is a soft glowing wavy line with no hard edge anywhere. Additive; the domes show through.
     */
    private static void wavyArches(PoseStack.Pose p, VertexConsumer vc, float r, Palette pal, float t) {
        float strength = auroraStrength(pal);
        for (int k = 0; k < ARCHES; k++) {
            float base = 0.20f + 0.15f * k + 0.05f * hash(k, 141, 0);
            float drift = t * (0.006f + 0.004f * (k % 3)) * (k % 2 == 0 ? 1f : -1f);
            float[] col = lerp(AURORA[k % AURORA.length], pal.blobs()[k % 4], 0.3f);
            float pulse = 0.75f + 0.25f * (float) Math.sin(t * 0.15f + k * 2.1f);
            float half = 0.035f + 0.02f * hash(k, 142, 0);
            float[][] prevD = null; float[] prevA = null;
            for (int sgi = 0; sgi <= ARCH_SEGS; sgi++) {
                float f = sgi / (float) ARCH_SEGS;
                double az = f * Math.PI * 2 + drift;
                // The wavy line itself: three undulations travelling at different speeds/directions.
                double el = base
                    + 0.055 * Math.sin(az * 3.0 + t * 0.10 + k * 1.7)
                    + 0.030 * Math.sin(az * 6.0 - t * 0.061 + k)
                    + 0.018 * Math.sin(az * 11.0 + t * 0.13 + k * 0.7);
                float a = 0.09f * strength * pulse;   // 0.23.3: arches subtler - MCD2 quilt reads first
                // Column of three directions: band edges fade to zero alpha, centre carries the glow.
                float[][] dNow = {dir(az, el - half), dir(az, el), dir(az, el + half)};
                float[] aNow = {0f, a, 0f};
                if (prevD != null) for (int q = 0; q < 2; q++) {
                    v(p, vc, prevD[q], r, col, prevA[q]); v(p, vc, prevD[q + 1], r, col, prevA[q + 1]);
                    v(p, vc, dNow[q + 1], r, col, aNow[q + 1]); v(p, vc, dNow[q], r, col, aNow[q]);
                }
                prevD = dNow; prevA = aNow;
            }
        }
    }

    private static final int OAZ = 60, OEL = 22;

    /**
     * 0.22: the animated overlay dome ("a giant dome over the main skybox"). A slightly smaller shell
     * carrying faint additive WAVY horizontal bands (elevation bands whose edges undulate with noise in
     * azimuth and travel slowly upward). Peak alpha ~0.06, so the original lava-lamp dome underneath
     * stays fully visible; together with {@link #wavyArches} this is the new animated Sift skybox layer.
     */
    private static void overlayDome(PoseStack.Pose p, VertexConsumer vc, float r, Palette pal, float t) {
        float[][] dirs = new float[(OAZ + 1) * (OEL + 1)][];
        float[][] cols = new float[(OAZ + 1) * (OEL + 1)][];
        float[] alphas = new float[(OAZ + 1) * (OEL + 1)];
        for (int i = 0; i <= OAZ; i++) for (int j = 0; j <= OEL; j++) {
            double az = i / (double) OAZ * Math.PI * 2;
            float el = -0.05f + (j / (float) OEL) * 1.5f;
            // Wavy band pattern: sine in elevation, edges displaced by azimuthal noise, drifting up.
            float wob = noise((float) Math.cos(az) * 2.2f, (float) Math.sin(az) * 2.2f, t * 0.05f);
            float b = (float) Math.sin(el * 9.0 + 1.7 * wob + t * 0.06);
            float band = smooth(0.45f, 0.9f, b);
            int idx = i * (OEL + 1) + j;
            dirs[idx] = dir(az, el);
            cols[idx] = lerp(pal.blobs()[0], pal.blobs()[2], band);
            alphas[idx] = 0.06f * band * (0.6f + 0.4f * (float) Math.sin(t * 0.1 + az * 2.0));
        }
        for (int i = 0; i < OAZ; i++) for (int j = 0; j < OEL; j++) {
            int a0 = i * (OEL + 1) + j, a1 = (i + 1) * (OEL + 1) + j, a2 = a1 + 1, a3 = a0 + 1;
            if (alphas[a0] + alphas[a1] + alphas[a2] + alphas[a3] < 0.002f) continue;
            v(p, vc, dirs[a0], r, cols[a0], alphas[a0]); v(p, vc, dirs[a1], r, cols[a1], alphas[a1]);
            v(p, vc, dirs[a2], r, cols[a2], alphas[a2]); v(p, vc, dirs[a3], r, cols[a3], alphas[a3]);
        }
    }

    private static final int ARCS = 4, PANELS = 6, PANEL_GRID = 8; // 0.18: fewer, much larger panels

    /**
     * 0.16 sky layer 2 (new Sift refs): semi-transparent rectangular "voxel" panels laid along sweeping
     * arcs that drift diagonally across the sky. Each panel is a tilted rectangle tessellated into a
     * 6x6 grid whose vertex alpha falls off with smoothstep toward every edge, so it reads as a soft,
     * blurred glowing block, never a hard-edged quad (the 0.13 rule still holds). Additive (GLOW),
     * base alpha 0.14, mint / pearl / pink / violet, so the gradient sky always shows through.
     */
    private static void softPanels(PoseStack.Pose p, VertexConsumer vc, float r, Palette pal, float t, float weight) {
        float strength = auroraStrength(pal) * weight;
        float[][] grid = new float[(PANEL_GRID + 1) * (PANEL_GRID + 1)][];
        float[] ga = new float[grid.length];
        for (int k = 0; k < ARCS; k++) {
            double arcAz = hash(k, 11, 0) * Math.PI * 2 + t * 0.006 * (k % 2 == 0 ? 1 : -1);
            double arcEl = 0.3 + 0.36 * hash(k, 12, 0), arcSpan = 2.6 + 1.2 * hash(k, 13, 0), bow = 0.18 + 0.2 * hash(k, 14, 0);
            for (int i = 0; i < PANELS; i++) {
                float f = (i + 0.5f) / PANELS;
                // Panels slide along their arc (scrolling diagonal stripes) and wrap around.
                float slide = (float) ((f + t * 0.004 * (1 + k * 0.3)) % 1.0);
                double az = arcAz + arcSpan * (slide - 0.5);
                double el = arcEl + bow * Math.sin(Math.PI * slide) - bow * 0.5 + 0.03 * Math.sin(t * 0.07 + i);
                double rot = Math.atan2(bow * Math.PI * Math.cos(Math.PI * slide), arcSpan) + 0.25 * (hash(k, i, 15) - 0.5);
                double hw = 0.30 + 0.28 * hash(k, i, 16), hh = 0.17 + 0.16 * hash(k, i, 17); // 0.18: huge panels (17-33 deg wide)
                float ends = smooth(0f, 0.15f, slide) * smooth(1f, 0.85f, slide);
                float alpha = 0.36f * strength * ends * (0.7f + 0.3f * (float) Math.sin(t * 0.21f + i * 1.3f + k)); // translucent, not additive
                if (alpha < 0.004f) continue;
                float[] c = lerp(PANEL_COLS[(k * 3 + i) % PANEL_COLS.length], pal.blobs()[i % 4], 0.2f);
                double cr = Math.cos(rot), sr = Math.sin(rot), ce = Math.max(0.2, Math.cos(el));
                for (int gy = 0; gy <= PANEL_GRID; gy++) for (int gx = 0; gx <= PANEL_GRID; gx++) {
                    float sx = gx / (float) PANEL_GRID * 2 - 1, sy = gy / (float) PANEL_GRID * 2 - 1;
                    double lx = sx * hw, ly = sy * hh;
                    grid[gy * (PANEL_GRID + 1) + gx] = dir(az + (lx * cr - ly * sr) / ce, el + lx * sr + ly * cr);
                    ga[gy * (PANEL_GRID + 1) + gx] = alpha * smooth(1f, 0.35f, Math.abs(sx)) * smooth(1f, 0.35f, Math.abs(sy));
                }
                for (int gy = 0; gy < PANEL_GRID; gy++) for (int gx = 0; gx < PANEL_GRID; gx++) {
                    int a0 = gy * (PANEL_GRID + 1) + gx, a1 = a0 + 1, a2 = a0 + PANEL_GRID + 2, a3 = a0 + PANEL_GRID + 1;
                    if (ga[a0] + ga[a1] + ga[a2] + ga[a3] < 0.002f) continue;
                    v(p, vc, grid[a0], r, c, ga[a0]); v(p, vc, grid[a1], r, c, ga[a1]);
                    v(p, vc, grid[a2], r, c, ga[a2]); v(p, vc, grid[a3], r, c, ga[a3]);
                }
            }
        }
    }

    private static final int SWIRL_BLOBS = 22, BLOB_RINGS = 3;

    /**
     * 0.17 swirl sky layer (coral / tidepool refs): big soft pink and teal blobs, alpha blended, that
     * orbit slowly around a few drifting swirl centres and stretch along their path. Each blob is a
     * disc whose alpha falls to zero at the rim (three rings), so nothing has an edge.
     */
    private static void swirlBlobs(PoseStack.Pose p, VertexConsumer vc, float r, Palette pal, float t, float weight) {
        for (int k = 0; k < SWIRL_BLOBS; k++) {
            int centre = k % 3;
            double cAz = hash(centre, 81, 0) * Math.PI * 2 + t * 0.003 * (centre % 2 == 0 ? 1 : -1);
            double cEl = 0.35 + 0.3 * hash(centre, 82, 0);
            double orbit = 0.18 + 0.32 * hash(k, 83, 0), w = (0.02 + 0.02 * hash(k, 84, 0)) * (k % 2 == 0 ? 1 : -1);
            double ph = hash(k, 85, 0) * Math.PI * 2 + t * w;
            double az = cAz + orbit * Math.cos(ph) / Math.max(0.3, Math.cos(cEl));
            double el = Math.max(0.03, Math.min(1.35, cEl + orbit * 0.6 * Math.sin(ph)));
            float size = 0.22f + 0.22f * hash(k, 86, 0); // 0.18: much bigger swirl blobs
            float[] c = lerp(SWIRL_COLS[k % SWIRL_COLS.length], pal.blobs()[k % 4], 0.25f);
            float alpha = weight * (0.3f + 0.12f * (float) Math.sin(t * 0.17f + k * 1.7f));
            float[] f = dir(az, el);
            float[] a = norm(cross(f, new float[]{0f, 1f, 0f}));
            float[] b = norm(cross(a, f));
            // Stretch along the orbit direction a little (streaky swirl).
            float[] along = norm(new float[]{a[0] * (float) -Math.sin(ph) + b[0] * (float) Math.cos(ph) * 0.6f,
                a[1] * (float) -Math.sin(ph) + b[1] * (float) Math.cos(ph) * 0.6f, a[2] * (float) -Math.sin(ph) + b[2] * (float) Math.cos(ph) * 0.6f});
            float[] across = norm(cross(along, f));
            float[] la = {along[0] * 1.6f, along[1] * 1.6f, along[2] * 1.6f};
            for (int ringIdx = 0; ringIdx < BLOB_RINGS; ringIdx++) {
                float in = size * ringIdx / BLOB_RINGS, out = size * (ringIdx + 1) / BLOB_RINGS;
                float aIn = alpha * falloff(ringIdx / (float) BLOB_RINGS), aOut = alpha * falloff((ringIdx + 1) / (float) BLOB_RINGS);
                ring(p, vc, r, f, la, across, in, out, c, aIn, aOut);
            }
        }
    }

    private static float falloff(float x) { return 1f - smooth(0f, 1f, x); }

    /** 0.13 god-ray hues from the trailer: rainbow light columns (red, orange, yellow, green, teal, blue, violet, magenta). */
    static final float[][] RAYS = {rgb(0xFF6B7A), rgb(0xFFA54F), rgb(0xFFE070), rgb(0x8CFF9E),
        rgb(0x6FF2E6), rgb(0x7DB8FF), rgb(0xB48CFF), rgb(0xFF7AD9)};
    private static final int SKY_RAYS = 11;

    /**
     * 0.13 god rays without a sun: soft, multi-coloured columns of light falling from high in the
     * sky toward the horizon, leaning slightly and drifting slowly. Every column is two quads per
     * segment with the alpha on the centre line and zero at both edges, and the alpha fades out
     * near the zenith and toward the ground, so none of them has a hard edge.
     */
    private static void skyRays(PoseStack.Pose p, VertexConsumer vc, float r, Palette pal, float t) {
        float strength = 0.75f + 0.25f * (1 - pal.noon());
        int segs = 12;
        for (int k = 0; k < SKY_RAYS; k++) {
            double az0 = hash(k, 61, 0) * Math.PI * 2 + t * 0.0025 * (k % 2 == 0 ? 1 : -1);
            double w = 0.045 + 0.075 * hash(k, 62, 0), lean = (hash(k, 63, 0) - 0.5) * 0.5;
            double top = 0.95 + 0.4 * hash(k, 64, 0);
            float[] c = lerp(RAYS[k % RAYS.length], pal.blobs()[k % 4], 0.15f);
            float base = 0.16f * strength * (0.65f + 0.35f * (float) Math.sin(t * 0.13f + k * 2.7f));
            for (int sg = 0; sg < segs; sg++) {
                double f0 = sg / (double) segs, f1 = (sg + 1) / (double) segs;
                double e0 = -0.02 + top * f0, e1 = -0.02 + top * f1;
                double a0z = az0 + lean * f0, a1z = az0 + lean * f1;
                double w0 = w * (1.6 - 0.8 * f0), w1 = w * (1.6 - 0.8 * f1);   // wider low down, like light spreading
                float al0 = base * smooth(-0.02f, 0.35f, (float) e0) * (1 - smooth(0.7f, 1.0f, (float) f0));
                float al1 = base * smooth(-0.02f, 0.35f, (float) e1) * (1 - smooth(0.7f, 1.0f, (float) f1));
                if (al0 + al1 < 0.002f) continue;
                v(p, vc, dir(a0z - w0, e0), r, c, 0f); v(p, vc, dir(a0z, e0), r, c, al0);
                v(p, vc, dir(a1z, e1), r, c, al1); v(p, vc, dir(a1z - w1, e1), r, c, 0f);
                v(p, vc, dir(a0z, e0), r, c, al0); v(p, vc, dir(a0z + w0, e0), r, c, 0f);
                v(p, vc, dir(a1z + w1, e1), r, c, 0f); v(p, vc, dir(a1z, e1), r, c, al1);
            }
        }
    }

    // ------------------------------------------------------------------ world beams

    private static final int BEAM_CELL = 72;

    /** Beam landing points {x, groundY, z, seed, colourIndex} on a fixed world grid around the camera. */
    private static List<float[]> collectBeams(Minecraft mc, Vec3 cam, float range, float tick) {
        List<float[]> out = new ArrayList<>();
        int cx0 = (int) Math.floor((cam.x - range) / BEAM_CELL), cx1 = (int) Math.floor((cam.x + range) / BEAM_CELL);
        int cz0 = (int) Math.floor((cam.z - range) / BEAM_CELL), cz1 = (int) Math.floor((cam.z + range) / BEAM_CELL);
        int day = (int) (mc.level.getOverworldClockTime() / 24000L);
        for (int cx = cx0; cx <= cx1; cx++) for (int cz = cz0; cz <= cz1; cz++) {
            if (hash(cx, cz, 91 + day) < 0.45f) continue;
            int x = cx * BEAM_CELL + (int) (hash(cx, cz, 92) * BEAM_CELL), z = cz * BEAM_CELL + (int) (hash(cx, cz, 93) * BEAM_CELL);
            double dx = x + 0.5 - cam.x, dz = z + 0.5 - cam.z;
            if (dx * dx + dz * dz > range * range) continue;
            int y = mc.level.getHeight(Heightmap.Types.MOTION_BLOCKING, x, z);
            if (y <= -60) continue; // chunk not loaded
            out.add(new float[]{x + 0.5f, y, z + 0.5f, hash(cx, cz, 94), (int) (hash(cx, cz, 95) * 4)});
        }
        return out;
    }

    /**
     * Diagonal translucent light beams in world space, slicing down from high above into the ground.
     * Colours follow the 4-stage timeline; each beam fades with distance and pools a soft additive tint
     * on the terrain where it lands. Positions are camera-relative (x - cam).
     */
    private static void worldBeams(PoseStack.Pose p, VertexConsumer vc, List<float[]> beams, Vec3 cam, Palette pal, float t, float range) {
        // All beams share one slow-turning slant, so they read as light falling from the sky (there is no sun).
        double turn = t * 0.004;
        float[] axis = norm(new float[]{0.32f * (float) Math.cos(turn), 1f, 0.32f * (float) Math.sin(turn)});
        for (float[] b : beams) {
            float gx = (float) (b[0] - cam.x), gy = (float) (b[1] - cam.y), gz = (float) (b[2] - cam.z);
            float dist = (float) Math.sqrt(gx * gx + gz * gz);
            float fade = smooth(6f, 22f, dist) * (1 - smooth(range * 0.55f, range, dist));
            if (fade < 0.01f) continue;
            float pulse = 0.7f + 0.3f * (float) Math.sin(t * 0.4f + b[3] * 20f);
            float[] c = lerp(bright(RAYS[(int) (b[3] * RAYS.length) % RAYS.length], 0.15f), pal.blobs()[(int) b[4]], 0.2f); // multi-coloured
            float alpha = 0.24f * fade * pulse, width = 2.5f + 3f * b[3], len = 200f;
            float[] bottom = {gx, gy - 1.5f, gz}, top = {gx + axis[0] * len, gy + axis[1] * len, gz + axis[2] * len};
            // Billboard around the beam axis toward the camera (camera is at the origin).
            float[] mid = {(bottom[0] + top[0]) / 2, (bottom[1] + top[1]) / 2, (bottom[2] + top[2]) / 2};
            float[] side = norm(cross(axis, mid));
            float[] s0 = {side[0] * width / 2, side[1] * width / 2, side[2] * width / 2};
            int segs = 6;
            for (int k = 0; k < segs; k++) {
                float f0 = k / (float) segs, f1 = (k + 1) / (float) segs;
                float a0 = alpha * (1 - f0) * (1 - f0), a1 = alpha * (1 - f1) * (1 - f1);
                float w0 = 1 + f0 * 1.5f, w1 = 1 + f1 * 1.5f; // widens with height
                float[] p0 = at(bottom, top, f0), p1 = at(bottom, top, f1);
                // 0.12: soft across the width (centre alpha, edges 0), so beams read as light, not slabs.
                bv(p, vc, p0[0] - s0[0] * w0, p0[1] - s0[1] * w0, p0[2] - s0[2] * w0, c, 0f);
                bv(p, vc, p0[0], p0[1], p0[2], c, a0);
                bv(p, vc, p1[0], p1[1], p1[2], c, a1);
                bv(p, vc, p1[0] - s0[0] * w1, p1[1] - s0[1] * w1, p1[2] - s0[2] * w1, c, 0f);
                bv(p, vc, p0[0], p0[1], p0[2], c, a0);
                bv(p, vc, p0[0] + s0[0] * w0, p0[1] + s0[1] * w0, p0[2] + s0[2] * w0, c, 0f);
                bv(p, vc, p1[0] + s0[0] * w1, p1[1] + s0[1] * w1, p1[2] + s0[2] * w1, c, 0f);
                bv(p, vc, p1[0], p1[1], p1[2], c, a1);
            }
            // Ground tint pool: a soft horizontal disc just above the landing surface.
            float pool = width * 1.8f, py = gy + 0.06f;
            int n = 20;
            for (int k = 0; k < n; k++) {
                double t0 = k * Math.PI * 2 / n, t1 = (k + 1) * Math.PI * 2 / n;
                bv(p, vc, gx, py, gz, c, alpha * 1.1f); bv(p, vc, gx, py, gz, c, alpha * 1.1f);
                bv(p, vc, gx + (float) Math.cos(t1) * pool, py, gz + (float) Math.sin(t1) * pool, c, 0f);
                bv(p, vc, gx + (float) Math.cos(t0) * pool, py, gz + (float) Math.sin(t0) * pool, c, 0f);
            }
        }
    }

    private static float[] at(float[] a, float[] b, float f) {
        return new float[]{a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f};
    }

    private static void bv(PoseStack.Pose p, VertexConsumer vc, float x, float y, float z, float[] c, float a) {
        if (!SiftBudget.take(vc)) return; // 0.16: never exceed 16-bit quad indices in one batch
        if (!Float.isFinite(x + y + z)) { x = 0f; y = 0f; z = 0f; a = 0f; }
        vc.addVertex(p, x, y, z).setColor(Math.min(1f, c[0]), Math.min(1f, c[1]), Math.min(1f, c[2]), a);
    }

    private static float[] on(float[] f, float[] d, float along, float[] side, float w) {
        return new float[]{f[0] + d[0] * along + side[0] * w, f[1] + d[1] * along + side[1] * w, f[2] + d[2] * along + side[2] * w};
    }

    /** Filled disc (inner alpha -> outer alpha) of angular radius outer around direction f. */
    private static void ring(PoseStack.Pose p, VertexConsumer vc, float r, float[] f, float[] a, float[] b,
                             float inner, float outer, float[] c, float aIn, float aOut) {
        int n = 32;
        for (int k = 0; k < n; k++) {
            float t0 = k / (float) n * 6.2831855f, t1 = (k + 1) / (float) n * 6.2831855f;
            float[] q0 = norm(on(f, a, outer * (float) Math.cos(t0), b, outer * (float) Math.sin(t0)));
            float[] q1 = norm(on(f, a, outer * (float) Math.cos(t1), b, outer * (float) Math.sin(t1)));
            float[] q2 = norm(on(f, a, inner * (float) Math.cos(t1), b, inner * (float) Math.sin(t1)));
            float[] q3 = norm(on(f, a, inner * (float) Math.cos(t0), b, inner * (float) Math.sin(t0)));
            v(p, vc, q3, r, c, aIn); v(p, vc, q2, r, c, aIn); v(p, vc, q1, r, c, aOut); v(p, vc, q0, r, c, aOut);
        }
    }

    private static float[] cross(float[] u, float[] w) {
        return new float[]{u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]};
    }

    private static float[] norm(float[] u) {
        float l = (float) Math.sqrt(u[0] * u[0] + u[1] * u[1] + u[2] * u[2]);
        if (!(l > 1e-6f)) return new float[]{0f, 1f, 0f}; // degenerate: never divide by zero (NaN streaks)
        return new float[]{u[0] / l, u[1] / l, u[2] / l};
    }
}
