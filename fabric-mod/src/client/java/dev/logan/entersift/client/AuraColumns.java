package dev.logan.entersift.client;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;

/**
 * 0.17 aura glow: soft vertical light columns (trailer look), drawn additively with
 * {@link SiftRenderTypes#GLOW}. Used behind rifts at night and above played note blocks instead of
 * beacon-like beams.
 *
 * Every column turns around its vertical axis to face the camera. It is split into strips across its
 * width with zero alpha at both outer edges, and into segments along its height with a smoothstep
 * fade at the bottom and a long fade to nothing at the top, so there are no hard edges. A wide faint
 * outer glow sits around a narrower, brighter core. The colour can run from {@code bottom} to
 * {@code top} (rainbow note columns), and the column sways and breathes slowly.
 */
public final class AuraColumns {
    private AuraColumns() {}

    private static final int SEGS = 10;

    /**
     * @param cx,y0,cz base centre (same space as the pose; camera-relative or entity-local)
     * @param camX,camZ camera position in the same space (for the billboard)
     */
    public static void column(PoseStack.Pose p, VertexConsumer vc, float cx, float y0, float cz, float height, float halfWidth,
                              float[] bottom, float[] top, float alpha, float camX, float camZ, float time, float seed) {
        if (alpha < 0.004f) return;
        float dx = camX - cx, dz = camZ - cz;
        float len = (float) Math.sqrt(dx * dx + dz * dz);
        float sx, sz;
        if (len < 1e-4f) { sx = 1f; sz = 0f; } else { sx = -dz / len; sz = dx / len; }
        float breathe = 0.82f + 0.18f * (float) Math.sin(time * 1.3f + seed * 11f);
        layer(p, vc, cx, y0, cz, height, halfWidth * 2.6f, sx, sz, bottom, top, alpha * 0.32f * breathe, time, seed);
        layer(p, vc, cx, y0, cz, height * 0.92f, halfWidth, sx, sz, bottom, top, alpha * breathe, time, seed);
        noteGlyphs(p, vc, cx, y0, cz, height, sx, sz, bottom, top, alpha * breathe, time, seed);
    }

    /** Floating pixel musical note glyphs (♪) rising inside each note-block rainbow column (Images 5, 6, 10). */
    private static void noteGlyphs(PoseStack.Pose p, VertexConsumer vc, float cx, float y0, float cz, float height,
                                   float sx, float sz, float[] bottom, float[] top, float alpha, float time, float seed) {
        for (int n = 0; n < 3; n++) {
            float life = (time * 0.32f + seed * 1.7f + n * 0.33f) % 1f;
            float env = (float) Math.sin(life * Math.PI);
            float a = Math.min(1f, alpha * 1.35f) * env;
            if (a < 0.04f) continue;
            float sway = (float) Math.sin(time * 1.8f + n * 2.1f + seed * 7f) * 0.28f;
            float nx = cx + sx * sway, nz = cz + sz * sway;
            float ny = y0 + 0.6f + life * Math.min(height * 0.65f, 6.5f);
            float[] c = mix(mix(bottom, top, life), new float[]{1f, 1f, 1f}, 0.35f);
            float u = 0.065f;
            // Note head (2x2 pixel block), vertical stem, and top flag
            quad(p, vc, nx, ny, nz, sx, sz, -2f * u, -u, 0f, u, c, a);
            quad(p, vc, nx, ny, nz, sx, sz, -0.4f * u, -u, 0.4f * u, 3.2f * u, c, a);
            quad(p, vc, nx, ny, nz, sx, sz, 0.4f * u, 1.8f * u, 2.0f * u, 3.0f * u, c, a);
        }
    }

    private static void quad(PoseStack.Pose p, VertexConsumer vc, float cx, float cy, float cz, float sx, float sz,
                             float x0, float y0, float x1, float y1, float[] c, float a) {
        v(p, vc, cx + sx * x0, cy + y0, cz + sz * x0, c, a);
        v(p, vc, cx + sx * x1, cy + y0, cz + sz * x1, c, a);
        v(p, vc, cx + sx * x1, cy + y1, cz + sz * x1, c, a);
        v(p, vc, cx + sx * x0, cy + y1, cz + sz * x0, c, a);
    }

    private static void layer(PoseStack.Pose p, VertexConsumer vc, float cx, float y0, float cz, float height, float hw,
                              float sx, float sz, float[] bottom, float[] top, float alpha, float time, float seed) {
        for (int k = 0; k < SEGS; k++) {
            float f0 = k / (float) SEGS, f1 = (k + 1) / (float) SEGS;
            float a0 = alpha * profile(f0), a1 = alpha * profile(f1);
            if (a0 + a1 < 0.003f) continue;
            // Crisp vertical stage-light column (Images 5, 6, 10, 29) with subtle shimmer.
            float o0 = 0.04f * f0 * (float) Math.sin(time * 0.9f + seed * 5f + f0 * 3f);
            float o1 = 0.04f * f1 * (float) Math.sin(time * 0.9f + seed * 5f + f1 * 3f);
            float w0 = hw * (1f + 0.08f * f0), w1 = hw * (1f + 0.08f * f1);
            float ya = y0 + height * f0, yb = y0 + height * f1;
            float[] c0 = mix(bottom, top, f0), c1 = mix(bottom, top, f1);
            float ax = cx + sx * o0, az = cz + sz * o0, bx = cx + sx * o1, bz = cz + sz * o1;
            // left half: edge (0) -> centre (a)
            v(p, vc, ax - sx * w0, ya, az - sz * w0, c0, 0f);
            v(p, vc, ax, ya, az, c0, a0);
            v(p, vc, bx, yb, bz, c1, a1);
            v(p, vc, bx - sx * w1, yb, bz - sz * w1, c1, 0f);
            // right half: centre (a) -> edge (0)
            v(p, vc, ax, ya, az, c0, a0);
            v(p, vc, ax + sx * w0, ya, az + sz * w0, c0, 0f);
            v(p, vc, bx + sx * w1, yb, bz + sz * w1, c1, 0f);
            v(p, vc, bx, yb, bz, c1, a1);
        }
    }

    /** Soft bottom (smoothstep over the first 12 %), long fade toward the top. */
    static float profile(float f) {
        return smooth(0f, 0.12f, f) * (1f - smooth(0.35f, 1f, f));
    }

    /** Hue (0..1) to an RGB colour at full saturation/value, softened toward white a touch. */
    public static float[] hue(float h) {
        h = h - (float) Math.floor(h);
        float r = Math.abs(h * 6f - 3f) - 1f, g = 2f - Math.abs(h * 6f - 2f), b = 2f - Math.abs(h * 6f - 4f);
        float[] c = {clamp(r), clamp(g), clamp(b)};
        return mix(c, new float[]{1f, 1f, 1f}, 0.18f);
    }

    private static float clamp(float v) { return Math.max(0f, Math.min(1f, v)); }

    static float smooth(float e0, float e1, float x) {
        float t = Math.max(0f, Math.min(1f, (x - e0) / (e1 - e0)));
        return t * t * (3 - 2 * t);
    }

    static float[] mix(float[] a, float[] b, float t) {
        return new float[]{a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t};
    }

    private static void v(PoseStack.Pose p, VertexConsumer vc, float x, float y, float z, float[] c, float a) {
        if (!SiftBudget.take(vc)) return;
        if (!Float.isFinite(x + y + z)) { x = 0f; y = 0f; z = 0f; a = 0f; }
        vc.addVertex(p, x, y, z).setColor(Math.min(1f, c[0]), Math.min(1f, c[1]), Math.min(1f, c[2]), Math.max(0f, Math.min(1f, a)));
    }
}
