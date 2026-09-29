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
    private static final float[][] MID = {rgb(0x9FEFC8), rgb(0xC4F4E4), rgb(0xD884AE), rgb(0xE08E4C)}; // noon: mint + pearl white
    /** Zenith base colour per stage. */
    /** Zenith per stage: pale violet overhead by day and noon, soft blue-violet at evening, hazy gold at night. */
    private static final float[][] ZENITH = {rgb(0xC6B8EC), rgb(0xECEAF6), rgb(0x9C5A8E), rgb(0xE8A860)}; // evening crimson-magenta overhead
    /** Four soft lava-lamp tints per stage (0.12: pastel and faint; they only shimmer over the gradient). */
    private static final float[][][] BLOBS = {
        {rgb(0xB8F5E0), rgb(0xA8DCF2), rgb(0xD8CAF4), rgb(0xF2CCDE)},
        {rgb(0xC8FFE6), rgb(0xF0FFF8), rgb(0xB4F2DE), rgb(0xE0D6FA)},
        {rgb(0xF0B0CC), rgb(0xB8E0E4), rgb(0xD2B4EA), rgb(0xF4C4B4)},
        {rgb(0xFFCC74), rgb(0xF2AE56), rgb(0xFFE0A4), rgb(0xCC6E5E)}};
    /** Dusty crimson highlights in the night haze. */
    private static final float[] PILLAR = rgb(0xA84E56);
    /** Aurora curtain colours from the trailer: mint green, pale white-cyan, soft pink, pale violet. */
    private static final float[][] AURORA = {rgb(0x7DFFC4), rgb(0xCFFFF4), rgb(0xFFA6CC), rgb(0xC8B4FF)};

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
            Palette pal = palette(tick);
            Vec3 cam = context.levelState().cameraRenderState.pos;
            float beamRange = Math.min(chunks * 16f, 176f);
            List<float[]> beams = collectBeams(mc, cam, beamRange, tick);
            PoseStack pose = context.poseStack();
            pose.pushPose(); // balanced: every push is popped even if a submit throws
            try {
                var out = context.submitNodeCollector();
                // Layer 1: opaque lava-lamp dome (writes depth, no OIT, no fog).
                out.submitCustomGeometry(pose, SiftRenderTypes.SKY, (p, vc) -> dome(p, vc, radius, pal, seconds));
                // Layers 2-3 in the sky: soft aurora curtains and multi-coloured light columns (additive, no sun).
                out.submitCustomGeometry(pose, SiftRenderTypes.GLOW, (p, vc) -> {
                    softPanels(p, vc, radius * 0.985f, pal, seconds);   // 0.16 layer 2: blurred voxel panels in arcs
                    auroraCurtains(p, vc, radius * 0.98f, pal, seconds);
                    skyRays(p, vc, radius * 0.96f, pal, seconds);
                });
                // World-space diagonal beams slicing into the terrain, with a tint pool where each one lands.
                if (!beams.isEmpty()) out.submitCustomGeometry(pose, SiftRenderTypes.GLOW, (p, vc) -> worldBeams(p, vc, beams, cam, pal, seconds, beamRange));
            } finally {
                pose.popPose();
            }
        });
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

    private static float[] skyColour(float x, float y, float z, Palette pal, float t) {
        float up = Math.max(0f, y);
        // 0.12: smooth three-stop gradient (horizon -> mid -> zenith), like the trailer frames.
        float[] c = lerp(pal.horizon(), pal.mid(), smooth(0.02f, 0.45f, up));
        c = lerp(c, pal.zenith(), smooth(0.4f, 0.95f, up));
        for (int k = 0; k < 4; k++) {
            float w = smooth(0.05f, 0.7f, blob(k, x, y, z, t)) * 0.3f; // faint pastel shimmer only
            c = lerp(c, pal.blobs()[k], w);
        }
        if (pal.noon() > 0.01f) { // pearl sheen around the zenith at noon
            float pearl = smooth(0.55f, 1f, up) * 0.35f * pal.noon();
            c = lerp(c, new float[]{0.96f, 1f, 0.97f}, pearl);
        }
        if (pal.pillars() > 0.01f) { // soft crimson vertical pillars at night: columns in azimuth, fading upward
            float az = (float) Math.atan2(z, x);
            float col = noise((float) Math.cos(az) * 3.2f + t * 0.01f, (float) Math.sin(az) * 3.2f, t * 0.02f)
                + 0.35f * noise((float) Math.cos(az) * 7f, (float) Math.sin(az) * 7f + t * 0.015f, y * 1.5f);
            float edge = smooth(0.02f, 0.6f, col) * (1 - smooth(0.25f, 0.95f, up)) * smooth(-0.1f, 0.12f, y);
            c = lerp(c, PILLAR, edge * 0.45f * pal.pillars());
        }
        // Melt into the fog colour at and below the horizon: no seam against distant terrain.
        float haze = 1 - smooth(-0.02f, 0.2f, y);
        return lerp(c, pal.horizon(), haze);
    }

    private static void dome(PoseStack.Pose p, VertexConsumer vc, float r, Palette pal, float t) {
        float[][][] cache = new float[AZ + 1][EL + 1][];
        float[][][] pos = new float[AZ + 1][EL + 1][];
        for (int i = 0; i <= AZ; i++) for (int j = 0; j <= EL; j++) {
            double az = i / (double) AZ * Math.PI * 2;
            // Denser rings near the horizon, where the colour changes fastest.
            double s = j / (double) EL * 2 - 1;
            double el = Math.signum(s) * Math.pow(Math.abs(s), 1.35) * Math.PI / 2;
            float x = (float) (Math.cos(el) * Math.cos(az)), y = (float) Math.sin(el), z = (float) (Math.cos(el) * Math.sin(az));
            pos[i][j] = new float[]{x, y, z};
            cache[i][j] = skyColour(x, y, z, pal, t);
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
    private static float auroraStrength(Palette pal) { return 0.7f + 0.3f * (1 - pal.noon()); }

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
            double e0 = 0.1 + 0.55 * hash(k, 3, 0), height = 0.3 + 0.32 * hash(k, 4, 0);
            float[] bottom = lerp(AURORA[k % 3], pal.blobs()[k % 4], 0.2f);          // mint, white-cyan or pink
            float[] top = lerp(AURORA[(k + 2) % 4], pal.blobs()[(k + 1) % 4], 0.2f);
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

    private static final int ARCS = 3, PANELS = 9, PANEL_GRID = 6;

    /**
     * 0.16 sky layer 2 (new Sift refs): semi-transparent rectangular "voxel" panels laid along sweeping
     * arcs that drift diagonally across the sky. Each panel is a tilted rectangle tessellated into a
     * 6x6 grid whose vertex alpha falls off with smoothstep toward every edge, so it reads as a soft,
     * blurred glowing block, never a hard-edged quad (the 0.13 rule still holds). Additive (GLOW),
     * base alpha 0.14, mint / pearl / pink / violet, so the gradient sky always shows through.
     */
    private static void softPanels(PoseStack.Pose p, VertexConsumer vc, float r, Palette pal, float t) {
        float strength = auroraStrength(pal);
        float[][] grid = new float[(PANEL_GRID + 1) * (PANEL_GRID + 1)][];
        float[] ga = new float[grid.length];
        for (int k = 0; k < ARCS; k++) {
            double arcAz = hash(k, 11, 0) * Math.PI * 2 + t * 0.006 * (k % 2 == 0 ? 1 : -1);
            double arcEl = 0.28 + 0.34 * hash(k, 12, 0), arcSpan = 1.6 + 0.9 * hash(k, 13, 0), bow = 0.18 + 0.2 * hash(k, 14, 0);
            for (int i = 0; i < PANELS; i++) {
                float f = (i + 0.5f) / PANELS;
                // Panels slide along their arc (scrolling diagonal stripes) and wrap around.
                float slide = (float) ((f + t * 0.004 * (1 + k * 0.3)) % 1.0);
                double az = arcAz + arcSpan * (slide - 0.5);
                double el = arcEl + bow * Math.sin(Math.PI * slide) - bow * 0.5 + 0.03 * Math.sin(t * 0.07 + i);
                double rot = Math.atan2(bow * Math.PI * Math.cos(Math.PI * slide), arcSpan) + 0.25 * (hash(k, i, 15) - 0.5);
                double hw = 0.07 + 0.08 * hash(k, i, 16), hh = 0.035 + 0.05 * hash(k, i, 17);
                float ends = smooth(0f, 0.15f, slide) * smooth(1f, 0.85f, slide);
                float alpha = 0.14f * strength * ends * (0.6f + 0.4f * (float) Math.sin(t * 0.21f + i * 1.3f + k));
                if (alpha < 0.004f) continue;
                float[] c = lerp(AURORA[(k + i) % 4], pal.blobs()[i % 4], 0.3f);
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
