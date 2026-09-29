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
 *   day      pale cyan-teal
 *   noon     saturated neon mint and pearl white
 *   evening  magenta, dusty rose and muted crimson
 *   night    heavy amber-gold with soft crimson vertical pillars
 * The only light shafts from the sky's sun are its single god ray, drawn here.
 *
 * 0.11 layer stack (render types from {@link SiftRenderTypes}; no OIT, so terrain no longer flickers):
 *   1. opaque lava-lamp dome (Cyan -> Mint -> Magenta -> Golden Amber through the day)
 *   2. linear diagonal aurora streaks scrolling sideways, and flat rectangular voxel shard panels
 *      grouped along sweeping arcs (aurora ribbons)
 *   3. world-space diagonal light beams slicing into the terrain, tinting the ground where they land
 */
public final class SiftSky {
    private SiftSky() {}

    // Keyframes shared with tools/phase10.py (timeline). Index = stage: 0 day, 1 noon, 2 evening, 3 night.
    static final int[] STAGE_TICKS = {0, 3500, 5000, 8500, 11000, 14500, 16500, 22500};
    static final int[] STAGE_AT = {0, 0, 1, 1, 2, 2, 3, 3};

    /** Horizon / fog colour per stage (identical to the timeline's fog_color and sky_color). */
    static final float[][] HORIZON = {rgb(0x7FD3CF), rgb(0x8CF2C4), rgb(0xC86A92), rgb(0xD99A3C)};
    /** Zenith base colour per stage. */
    private static final float[][] ZENITH = {rgb(0x9FE6E0), rgb(0x5CF5B4), rgb(0xA8457E), rgb(0xE8A838)};
    /** Four blob colours per stage. */
    private static final float[][][] BLOBS = {
        {rgb(0xC8F7F0), rgb(0x5CC4C8), rgb(0xE6FFFB), rgb(0x86D9E6)},
        {rgb(0x2EFFA8), rgb(0xF4FFF9), rgb(0x9DFFD8), rgb(0x16D99A)},
        {rgb(0xE040A8), rgb(0xD993A8), rgb(0x9E2B45), rgb(0xF07AB8)},
        {rgb(0xFFC23A), rgb(0xF59A1E), rgb(0xFFDA7A), rgb(0xD9782A)}};
    private static final float[] PILLAR = rgb(0xB8323F);

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
            float[] sun = norm(sunDirection(tick));
            Vec3 cam = context.levelState().cameraRenderState.pos;
            float beamRange = Math.min(chunks * 16f, 176f);
            List<float[]> beams = collectBeams(mc, cam, beamRange, tick);
            PoseStack pose = context.poseStack();
            pose.pushPose(); // balanced: every push is popped even if a submit throws
            try {
                var out = context.submitNodeCollector();
                // Layer 1: opaque lava-lamp dome (writes depth, no OIT, no fog).
                out.submitCustomGeometry(pose, SiftRenderTypes.SOLID, (p, vc) -> dome(p, vc, radius, pal, seconds));
                // Layers 2-3 in the sky: aurora streaks, voxel shard ribbons, the sun and its single god ray (additive).
                out.submitCustomGeometry(pose, SiftRenderTypes.GLOW, (p, vc) -> {
                    auroraStreaks(p, vc, radius * 0.985f, pal, seconds);
                    shardRibbons(p, vc, radius * 0.97f, pal, seconds);
                    if (sun[1] > -0.12f) sunAndRay(p, vc, radius * 0.96f, sun, pal);
                });
                // World-space diagonal beams slicing into the terrain, with a tint pool where each one lands.
                if (!beams.isEmpty()) out.submitCustomGeometry(pose, SiftRenderTypes.GLOW, (p, vc) -> worldBeams(p, vc, beams, cam, pal, sun, seconds, beamRange));
            } finally {
                pose.popPose();
            }
        });
    }

    // ------------------------------------------------------------------ cycle

    /** Colours for the current tick, blended between the two neighbouring stages. */
    record Palette(float[] horizon, float[] zenith, float[][] blobs, float pillars, float noon) {}

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
        return new Palette(lerp(HORIZON[a], HORIZON[b], f), lerp(ZENITH[a], ZENITH[b], f), blobs, pillars, noon);
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
        float[] c = lerp(pal.horizon(), pal.zenith(), smooth(0.05f, 0.75f, up));
        for (int k = 0; k < 4; k++) {
            float w = smooth(-0.02f, 0.55f, blob(k, x, y, z, t)) * 0.9f;
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
            c = lerp(c, PILLAR, edge * 0.8f * pal.pillars());
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

    /** How strongly the aurora shows: faint at noon, strongest in the evening and at night. */
    private static float auroraStrength(Palette pal) { return 0.55f + 0.45f * (1 - pal.noon()); }

    /**
     * Linear diagonal aurora streaks: long straight-ish bands laid diagonally across the sky, fading
     * upward like curtains, that scroll slowly sideways over the lava-lamp blobs.
     */
    private static void auroraStreaks(PoseStack.Pose p, VertexConsumer vc, float r, Palette pal, float t) {
        float strength = auroraStrength(pal);
        int streaks = 9, segs = 36;
        for (int k = 0; k < streaks; k++) {
            double a0 = hash(k, 1, 0) * Math.PI * 2 + t * (0.006 + 0.004 * (k % 3)); // horizontal scroll
            double span = 1.1 + 0.9 * hash(k, 2, 0);
            double e0 = 0.18 + 0.55 * hash(k, 3, 0), slope = (hash(k, 4, 0) - 0.5) * 0.7;
            double height = 0.10 + 0.12 * hash(k, 5, 0), skew = 0.08 + 0.1 * hash(k, 6, 0);
            float[] c = bright(pal.blobs()[k % 4], 0.35f);
            float base = (0.16f + 0.12f * hash(k, 7, 0)) * strength * (0.75f + 0.25f * (float) Math.sin(t * 0.21f + k * 1.3f));
            for (int s = 0; s < segs; s++) {
                double f0 = s / (double) segs, f1 = (s + 1) / (double) segs;
                float w0 = (float) Math.sin(Math.PI * f0), w1 = (float) Math.sin(Math.PI * f1);
                double az0 = a0 + span * f0, az1 = a0 + span * f1;
                double el0 = e0 + slope * span * f0, el1 = e0 + slope * span * f1;
                float[] b0 = dir(az0, el0), b1 = dir(az1, el1);
                float[] u0 = dir(az0 + skew, el0 + height), u1 = dir(az1 + skew, el1 + height);
                v(p, vc, b0, r, c, base * w0); v(p, vc, b1, r, c, base * w1);
                v(p, vc, u1, r, c, 0f); v(p, vc, u0, r, c, 0f);
                // A thin bright core line along the bottom edge of the curtain.
                float[] m0 = dir(az0 + skew * 0.15, el0 + height * 0.15), m1 = dir(az1 + skew * 0.15, el1 + height * 0.15);
                float[] core = bright(c, 0.5f);
                v(p, vc, b0, r, core, 0f); v(p, vc, b1, r, core, 0f);
                v(p, vc, m1, r, core, base * w1 * 0.9f); v(p, vc, m0, r, core, base * w0 * 0.9f);
            }
        }
    }

    /**
     * Flat, semi-transparent rectangular "voxel shard" panels, grouped along sweeping arcs so that
     * together they read as aurora ribbons (the big pale rectangles in the Sift trailer sky).
     */
    private static void shardRibbons(PoseStack.Pose p, VertexConsumer vc, float r, Palette pal, float t) {
        float strength = auroraStrength(pal);
        int arcs = 5;
        for (int m = 0; m < arcs; m++) {
            double centre = hash(m, 11, 0) * Math.PI * 2 + t * 0.0035 * (m % 2 == 0 ? 1 : -1);
            double width = 1.4 + 1.2 * hash(m, 12, 0), lift = 0.35 + 0.55 * hash(m, 13, 0), floor = 0.12 + 0.2 * hash(m, 14, 0);
            int panels = 12 + (int) (hash(m, 15, 0) * 8);
            for (int i = 0; i < panels; i++) {
                double f = (i + 0.5 + (hash(m, i, 16) - 0.5) * 0.6) / panels;
                double az = centre + (f - 0.5) * width;
                double el = floor + lift * Math.sin(Math.PI * f) + (hash(m, i, 17) - 0.5) * 0.08;
                // Voxel look: snap panel centres to a coarse angular grid.
                az = Math.round(az / 0.035) * 0.035; el = Math.round(el / 0.035) * 0.035;
                if (el < 0.06) continue;
                float[] n = dir(az, el);
                float[] east = norm(new float[]{(float) -Math.sin(az), 0f, (float) Math.cos(az)});
                float[] north = cross(n, east);
                // Tilt each panel along the arc's tangent (plus a little jitter), like sheets hanging in wind.
                double slope = Math.atan2(lift * Math.PI * Math.cos(Math.PI * f), width);
                double tilt = slope + (hash(m, i, 18) - 0.5) * 0.5 + 0.12 * Math.sin(t * 0.15 + i);
                float ct = (float) Math.cos(tilt), st = (float) Math.sin(tilt);
                float[] ax = {east[0] * ct + north[0] * st, east[1] * ct + north[1] * st, east[2] * ct + north[2] * st};
                float[] ay = {-east[0] * st + north[0] * ct, -east[1] * st + north[1] * ct, -east[2] * st + north[2] * ct};
                float hw = 0.03f + 0.045f * hash(m, i, 19), hh = 0.06f + 0.1f * hash(m, i, 20);
                float twinkle = 0.65f + 0.35f * (float) Math.sin(t * (0.25f + 0.2f * hash(m, i, 21)) + i * 2.1f);
                float alpha = (0.14f + 0.16f * hash(m, i, 22)) * twinkle * strength * smooth(0.04f, 0.25f, (float) el);
                float[] c = bright(pal.blobs()[(m + i) % 4], 0.45f + 0.3f * hash(m, i, 23));
                panel(p, vc, r, n, ax, ay, hw * 1.6f, hh * 1.25f, c, alpha * 0.25f); // soft bloom
                panel(p, vc, r, n, ax, ay, hw, hh, c, alpha);
            }
        }
    }

    private static void panel(PoseStack.Pose p, VertexConsumer vc, float r, float[] n, float[] ax, float[] ay, float hw, float hh, float[] c, float a) {
        float[][] q = {
            {n[0] - ax[0] * hw - ay[0] * hh, n[1] - ax[1] * hw - ay[1] * hh, n[2] - ax[2] * hw - ay[2] * hh},
            {n[0] + ax[0] * hw - ay[0] * hh, n[1] + ax[1] * hw - ay[1] * hh, n[2] + ax[2] * hw - ay[2] * hh},
            {n[0] + ax[0] * hw + ay[0] * hh, n[1] + ax[1] * hw + ay[1] * hh, n[2] + ax[2] * hw + ay[2] * hh},
            {n[0] - ax[0] * hw + ay[0] * hh, n[1] - ax[1] * hw + ay[1] * hh, n[2] - ax[2] * hw + ay[2] * hh}};
        for (float[] d : q) vc.addVertex(p, d[0] * r, d[1] * r, d[2] * r).setColor(Math.min(1f, c[0]), Math.min(1f, c[1]), Math.min(1f, c[2]), a);
    }

    /**
     * The sun disc with a soft corona, and exactly one god ray: an additive quad from the sun down to
     * the horizon below it, alpha 0.35 at the sun fading to 0 at the horizon. It follows the clock.
     */
    private static void sunAndRay(PoseStack.Pose p, VertexConsumer vc, float r, float[] f, Palette pal) {
        float[] up = Math.abs(f[1]) > 0.95f ? new float[]{1, 0, 0} : new float[]{0, 1, 0};
        float[] a = norm(cross(up, f)), b = cross(f, a);
        float[] core = {1f, 0.99f, 0.93f};
        float[] warm = lerp(pal.horizon(), core, 0.6f);
        float horizon = smooth(-0.12f, 0.08f, f[1]);
        if (f[1] > 0.02f) {
            double az = Math.atan2(f[2], f[0]), el = Math.asin(Math.max(-1f, Math.min(1f, f[1])));
            int segs = 12;
            for (int s = 0; s < segs; s++) {
                double t0 = s / (double) segs, t1 = (s + 1) / (double) segs;
                double e0 = el * (1 - t0), e1 = el * (1 - t1);
                double w0 = 0.035 + 0.22 * t0, w1 = 0.035 + 0.22 * t1;       // widens toward the horizon
                float a0 = 0.35f * (float) (1 - t0) * horizon, a1 = 0.35f * (float) (1 - t1) * horizon;
                v(p, vc, dir(az - w0, e0), r, warm, a0); v(p, vc, dir(az + w0, e0), r, warm, a0);
                v(p, vc, dir(az + w1, e1), r, warm, a1); v(p, vc, dir(az - w1, e1), r, warm, a1);
            }
        }
        ring(p, vc, r * 0.995f, f, a, b, 0.0f, 0.34f, warm, 0.45f * horizon, 0f);
        ring(p, vc, r * 0.99f, f, a, b, 0.0f, 0.12f, core, 0.8f * horizon, 0.25f * horizon);
        ring(p, vc, r * 0.985f, f, a, b, 0.0f, 0.055f, core, horizon, horizon);
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
    private static void worldBeams(PoseStack.Pose p, VertexConsumer vc, List<float[]> beams, Vec3 cam, Palette pal, float[] sun, float t, float range) {
        // All beams share one slant, leaning away from the sun so they read as light falling from the sky.
        float[] axis = norm(new float[]{-sun[0] * 0.45f + 0.2f, 1f, -sun[2] * 0.45f - 0.25f});
        for (float[] b : beams) {
            float gx = (float) (b[0] - cam.x), gy = (float) (b[1] - cam.y), gz = (float) (b[2] - cam.z);
            float dist = (float) Math.sqrt(gx * gx + gz * gz);
            float fade = smooth(6f, 22f, dist) * (1 - smooth(range * 0.55f, range, dist));
            if (fade < 0.01f) continue;
            float pulse = 0.7f + 0.3f * (float) Math.sin(t * 0.4f + b[3] * 20f);
            float[] c = bright(pal.blobs()[(int) b[4]], 0.3f);
            float alpha = 0.2f * fade * pulse, width = 2.5f + 3f * b[3], len = 200f;
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
                bv(p, vc, p0[0] - s0[0] * w0, p0[1] - s0[1] * w0, p0[2] - s0[2] * w0, c, a0);
                bv(p, vc, p0[0] + s0[0] * w0, p0[1] + s0[1] * w0, p0[2] + s0[2] * w0, c, a0);
                bv(p, vc, p1[0] + s0[0] * w1, p1[1] + s0[1] * w1, p1[2] + s0[2] * w1, c, a1);
                bv(p, vc, p1[0] - s0[0] * w1, p1[1] - s0[1] * w1, p1[2] - s0[2] * w1, c, a1);
            }
            // Bright core line.
            float[] core = bright(c, 0.6f);
            bv(p, vc, bottom[0] - s0[0] * 0.2f, bottom[1] - s0[1] * 0.2f, bottom[2] - s0[2] * 0.2f, core, alpha * 0.8f);
            bv(p, vc, bottom[0] + s0[0] * 0.2f, bottom[1] + s0[1] * 0.2f, bottom[2] + s0[2] * 0.2f, core, alpha * 0.8f);
            float[] q = at(bottom, top, 0.5f);
            bv(p, vc, q[0] + s0[0] * 0.3f, q[1] + s0[1] * 0.3f, q[2] + s0[2] * 0.3f, core, 0f);
            bv(p, vc, q[0] - s0[0] * 0.3f, q[1] - s0[1] * 0.3f, q[2] - s0[2] * 0.3f, core, 0f);
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
        return new float[]{u[0] / l, u[1] / l, u[2] / l};
    }
}
