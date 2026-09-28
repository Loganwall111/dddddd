package dev.logan.entersift.client;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.logan.entersift.SiftContent;
import net.fabricmc.fabric.api.client.rendering.v1.level.LevelRenderEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.rendertype.RenderTypes;

/**
 * 0.9 Sift sky: a procedural "lava lamp" of slowly drifting, merging colour blobs. There are no
 * textures, panoramas or shader packs; everything is computed in Java every frame.
 *
 * How it is drawn (vanilla/Fabric only): Fabric 26.3 has no sky hook, so the sky is a finely
 * tessellated sphere submitted in COLLECT_SUBMITS with {@code RenderTypes.debugQuads()}. That type
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
 * The only light shafts in the Sift are the sun's god rays, drawn here.
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
        LevelRenderEvents.COLLECT_SUBMITS.register(context -> {
            Minecraft mc = Minecraft.getInstance();
            if (mc.level == null || !mc.level.dimension().identifier().equals(SiftContent.id("the_sift"))) return;
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
            float[] sun = sunDirection(tick);
            PoseStack pose = context.poseStack();
            context.submitNodeCollector().submitCustomGeometry(pose, RenderTypes.debugQuads(), (p, vc) -> {
                dome(p, vc, radius, pal, seconds);
                if (sun[1] > -0.12f) sunAndRays(p, vc, radius * 0.97f, sun, pal, seconds);
            });
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

    /** Sun disc with a soft corona and slowly turning god rays: the only light shafts in the Sift. */
    private static void sunAndRays(PoseStack.Pose p, VertexConsumer vc, float r, float[] dir, Palette pal, float t) {
        float len = (float) Math.sqrt(dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2]);
        float[] f = {dir[0] / len, dir[1] / len, dir[2] / len};
        // Tangent basis around the sun direction.
        float[] up = Math.abs(f[1]) > 0.95f ? new float[]{1, 0, 0} : new float[]{0, 1, 0};
        float[] a = norm(cross(up, f)), b = cross(f, a);
        float[] core = {1f, 0.99f, 0.93f};
        float[] warm = lerp(pal.horizon(), core, 0.6f);
        float horizon = smooth(-0.12f, 0.08f, f[1]);
        // Rays: long tapering fans, alpha fades to zero at the tips. Drawn first so the disc sits on top.
        int rays = 14;
        for (int k = 0; k < rays; k++) {
            float ang = k / (float) rays * 6.2831855f + t * 0.01f + 0.4f * noise(k * 1.7f, t * 0.05f, 0);
            float length = 0.55f + 0.35f * (0.5f + 0.5f * noise(k * 3.1f, t * 0.08f, 5));
            float width = 0.025f + 0.02f * (0.5f + 0.5f * noise(k * 2.3f, 9, t * 0.07f));
            float alpha = (0.18f + 0.12f * (0.5f + 0.5f * noise(k, t * 0.2f, 3))) * horizon;
            float ca = (float) Math.cos(ang), sa = (float) Math.sin(ang);
            float[] dirr = {a[0] * ca + b[0] * sa, a[1] * ca + b[1] * sa, a[2] * ca + b[2] * sa};
            float[] side = {-a[0] * sa + b[0] * ca, -a[1] * sa + b[1] * ca, -a[2] * sa + b[2] * ca};
            float[] p0 = on(f, dirr, 0.04f, side, -width), p1 = on(f, dirr, 0.04f, side, width);
            float[] p2 = on(f, dirr, length, side, width * 2.2f), p3 = on(f, dirr, length, side, -width * 2.2f);
            v(p, vc, norm(p0), r, warm, alpha); v(p, vc, norm(p1), r, warm, alpha);
            v(p, vc, norm(p2), r, warm, 0f); v(p, vc, norm(p3), r, warm, 0f);
        }
        // Corona rings then the disc.
        ring(p, vc, r * 0.995f, f, a, b, 0.0f, 0.34f, warm, 0.45f * horizon, 0f);
        ring(p, vc, r * 0.99f, f, a, b, 0.0f, 0.12f, core, 0.8f * horizon, 0.25f * horizon);
        ring(p, vc, r * 0.985f, f, a, b, 0.0f, 0.055f, core, horizon, horizon);
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
