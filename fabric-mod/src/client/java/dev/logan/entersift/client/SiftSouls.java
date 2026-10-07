package dev.logan.entersift.client;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.logan.entersift.SiftContent;
import java.util.ArrayList;
import java.util.List;
import net.fabricmc.fabric.api.client.rendering.v1.level.LevelRenderEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.phys.Vec3;

/**
 * 0.17: far more frequent, with fully blue trails (no white).
 * 0.14 wandering souls (Dungeons II ref): small white skull-like heads with dark eyes that swoop in
 * long loops through the Sift, each dragging a glowing blue comet trail with thin white streaks.
 *
 * Purely visual and client-side. Souls live on a 64-block world grid (so they stay put as the
 * camera moves); each one follows a tilted, slowly precessing ellipse above the terrain. The trail is
 * a camera-facing ribbon sampled back along the soul's own path, tapering and fading to nothing.
 * Trails use the additive {@link SiftRenderTypes#GLOW}; heads are tiny opaque cubes ({@code SOLID}).
 */
public final class SiftSouls {
    private SiftSouls() {}

    private static final int CELL = 32, TRAIL = 18;
    private static final float TRAIL_DT = 0.06f;

    private record Soul(double cx, double cy, double cz, double r, double squash, double tilt, double w, double phase, double bobPhase) {
        double[] at(double t) {
            double a = phase + w * t;
            double lx = Math.cos(a) * r, lz = Math.sin(a) * r * squash;
            double x = cx + lx * Math.cos(tilt) - lz * Math.sin(tilt);
            double z = cz + lx * Math.sin(tilt) + lz * Math.cos(tilt);
            double y = cy + Math.sin(a * 0.5 + bobPhase) * 5.0 + Math.sin(a * 1.7) * 1.2;
            return new double[]{x, y, z};
        }
    }

    public static void register() {
        LevelRenderEvents.COLLECT_SUBMITS.register(context -> {
            Minecraft mc = Minecraft.getInstance();
            if (mc.level == null || !mc.level.dimension().identifier().equals(SiftContent.id("the_sift"))) return;
            Vec3 cam = context.levelState().cameraRenderState.pos;
            double t = (System.nanoTime() / 1.0e9) % 100000.0;
            float range = Math.min(mc.options.renderDistance().get() * 16f, 112f);
            List<Soul> souls = collect(mc, cam, range);
            if (souls.isEmpty()) return;
            PoseStack pose = context.poseStack();
            pose.pushPose();
            try {
                var out = context.submitNodeCollector();
                out.submitCustomGeometry(pose, SiftRenderTypes.GLOW, (p, vc) -> { for (Soul s : souls) trail(p, vc, s, t, cam, range); });
                out.submitCustomGeometry(pose, SiftRenderTypes.SOLID, (p, vc) -> { for (Soul s : souls) head(p, vc, s, t, cam); });
            } finally {
                pose.popPose();
            }
        });
    }

    private static float hash(int a, int b, int c) {
        int h = a * 374761393 + b * 668265263 + c * 2147483647;
        h = (h ^ (h >>> 13)) * 1274126177;
        return ((h ^ (h >>> 16)) & 0x7fffffff) / (float) 0x7fffffff;
    }

    private static List<Soul> collect(Minecraft mc, Vec3 cam, float range) {
        List<Soul> out = new ArrayList<>();
        int x0 = (int) Math.floor((cam.x - range) / CELL), x1 = (int) Math.floor((cam.x + range) / CELL);
        int z0 = (int) Math.floor((cam.z - range) / CELL), z1 = (int) Math.floor((cam.z + range) / CELL);
        for (int i = x0; i <= x1; i++) for (int j = z0; j <= z1; j++) {
            for (int k = 0; k < 3; k++) { // 0.17: much more frequent (32-block grid, up to 3 per cell)
                if (hash(i, j, 300 + k) > (k == 0 ? 0.9f : k == 1 ? 0.6f : 0.35f)) continue;
                double cx = (i + 0.2 + 0.6 * hash(i, j, 310 + k)) * CELL, cz = (j + 0.2 + 0.6 * hash(i, j, 320 + k)) * CELL;
                double dx = cx - cam.x, dz = cz - cam.z;
                if (dx * dx + dz * dz > (range + 30) * (range + 30)) continue;
                int ground = mc.level.getHeight(Heightmap.Types.MOTION_BLOCKING, (int) cx, (int) cz);
                double r = 10 + 16 * hash(i, j, 330 + k);
                double speed = (5.0 + 4.0 * hash(i, j, 340 + k)) * (hash(i, j, 350 + k) > 0.5 ? 1 : -1); // blocks / second
                out.add(new Soul(cx, ground + 10 + 18 * hash(i, j, 360 + k), cz, r, 0.45 + 0.4 * hash(i, j, 370 + k),
                    hash(i, j, 380 + k) * Math.PI, speed / r, hash(i, j, 390 + k) * Math.PI * 2, hash(i, j, 395 + k) * 6));
            }
        }
        return out;
    }

    // ------------------------------------------------------------------ trail
    private static final float[] HEAD_C = {0.55f, 0.84f, 1f}, MID_C = {0.22f, 0.52f, 1f}, TAIL_C = {0.1f, 0.2f, 0.9f}, STREAK_C = {0.62f, 0.9f, 1f};

    private static void trail(PoseStack.Pose p, VertexConsumer vc, Soul s, double t, Vec3 cam, float range) {
        double[][] pts = new double[TRAIL][];
        for (int i = 0; i < TRAIL; i++) {
            double[] w = s.at(t - i * TRAIL_DT);
            pts[i] = new double[]{w[0] - cam.x, w[1] - cam.y, w[2] - cam.z};
        }
        double d0 = Math.sqrt(pts[0][0] * pts[0][0] + pts[0][2] * pts[0][2]);
        float fade = 1f - smooth(range * 0.7f, range, (float) d0);
        if (fade < 0.02f) return;
        for (int i = 0; i < TRAIL - 1; i++) {
            float f0 = i / (float) (TRAIL - 1), f1 = (i + 1) / (float) (TRAIL - 1);
            float w0 = 0.36f * (1 - f0) + 0.03f, w1 = 0.36f * (1 - f1) + 0.03f;
            float a0 = (1 - f0) * (1 - f0) * 0.85f * fade, a1 = (1 - f1) * (1 - f1) * 0.85f * fade;
            float[] c0 = grad(f0), c1 = grad(f1);
            float[] side0 = side(pts, i), side1 = side(pts, i + 1);
            ribbon(p, vc, pts[i], pts[i + 1], side0, side1, w0 * 3.2f, w1 * 3.2f, c0, c1, a0 * 0.3f, a1 * 0.3f); // soft blue glow
            ribbon(p, vc, pts[i], pts[i + 1], side0, side1, w0, w1, c0, c1, a0, a1);                              // core
            for (float off : new float[]{0.42f}) {                                                        // thin white streaks
                double[] q0 = shift(pts[i], side0, off * w0 * 1.6f), q1 = shift(pts[i + 1], side1, off * w1 * 1.6f);
                ribbon(p, vc, q0, q1, side0, side1, 0.035f, 0.03f, STREAK_C, STREAK_C, a0 * 0.5f, a1 * 0.5f);
            }
        }
    }

    private static float[] grad(float f) {
        return f < 0.35f ? mix(HEAD_C, MID_C, f / 0.35f) : mix(MID_C, TAIL_C, (f - 0.35f) / 0.65f);
    }

    /** Unit vector across the trail at sample i, perpendicular to the path and to the view ray. */
    private static float[] side(double[][] pts, int i) {
        double[] a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        double tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2];
        double[] v = pts[i];
        double sx = ty * v[2] - tz * v[1], sy = tz * v[0] - tx * v[2], sz = tx * v[1] - ty * v[0];
        double l = Math.sqrt(sx * sx + sy * sy + sz * sz);
        if (!(l > 1e-6)) return new float[]{0f, 1f, 0f};
        return new float[]{(float) (sx / l), (float) (sy / l), (float) (sz / l)};
    }

    private static double[] shift(double[] q, float[] s, float d) {
        return new double[]{q[0] + s[0] * d, q[1] + s[1] * d, q[2] + s[2] * d};
    }

    private static void ribbon(PoseStack.Pose p, VertexConsumer vc, double[] a, double[] b, float[] sa, float[] sb,
                               float wa, float wb, float[] ca, float[] cb, float aa, float ab) {
        v(p, vc, a[0] - sa[0] * wa, a[1] - sa[1] * wa, a[2] - sa[2] * wa, ca, aa);
        v(p, vc, a[0] + sa[0] * wa, a[1] + sa[1] * wa, a[2] + sa[2] * wa, ca, aa);
        v(p, vc, b[0] + sb[0] * wb, b[1] + sb[1] * wb, b[2] + sb[2] * wb, cb, ab);
        v(p, vc, b[0] - sb[0] * wb, b[1] - sb[1] * wb, b[2] - sb[2] * wb, cb, ab);
    }

    // ------------------------------------------------------------------ head
    private static void head(PoseStack.Pose p, VertexConsumer vc, Soul s, double t, Vec3 cam) {
        double[] w = s.at(t), prev = s.at(t - 0.05);
        double x = w[0] - cam.x, y = w[1] - cam.y, z = w[2] - cam.z;
        if (x * x + y * y + z * z > 150 * 150) return;
        double fx = w[0] - prev[0], fz = w[2] - prev[2];
        double fl = Math.sqrt(fx * fx + fz * fz);
        if (!(fl > 1e-6)) { fx = 1; fz = 0; fl = 1; }
        float[] f = {(float) (fx / fl), 0f, (float) (fz / fl)}, r = {-f[2], 0f, f[0]}, u = {0f, 1f, 0f};
        float h = 0.26f;
        float[] white = {0.93f, 0.97f, 1f}, shade = {0.74f, 0.82f, 0.92f}, dark = {0.08f, 0.1f, 0.18f};
        float[][] corners = new float[8][];
        for (int k = 0; k < 8; k++) {
            float sf = (k & 1) == 0 ? -h : h, sr = (k & 2) == 0 ? -h : h, su = (k & 4) == 0 ? -h : h;
            corners[k] = new float[]{(float) x + f[0] * sf + r[0] * sr, (float) y + su, (float) z + f[2] * sf + r[2] * sr};
        }
        int[][] faces = {{1, 3, 7, 5}, {0, 4, 6, 2}, {2, 6, 7, 3}, {0, 1, 5, 4}, {4, 5, 7, 6}, {0, 2, 3, 1}};
        for (int k = 0; k < faces.length; k++) {
            float[] c = k == 4 ? white : (k == 5 ? shade : (k == 0 ? white : mix(white, shade, 0.4f)));
            for (int idx : faces[k]) v(p, vc, corners[idx][0], corners[idx][1], corners[idx][2], c, 1f);
        }
        // Face on the front (+f): two dark eyes and a small mouth, just in front of the surface.
        float fx0 = (float) x + f[0] * (h + 0.005f), fz0 = (float) z + f[2] * (h + 0.005f);
        square(p, vc, fx0, (float) y + 0.06f, fz0, r, u, -0.12f, 0.07f, dark);
        square(p, vc, fx0, (float) y + 0.06f, fz0, r, u, 0.12f, 0.07f, dark);
        square(p, vc, fx0, (float) y - 0.12f, fz0, r, u, 0f, 0.045f, dark);
    }

    private static void square(PoseStack.Pose p, VertexConsumer vc, float cx, float cy, float cz, float[] r, float[] u, float along, float half, float[] c) {
        float ox = cx + r[0] * along, oz = cz + r[2] * along;
        v(p, vc, ox - r[0] * half, cy - half, oz - r[2] * half, c, 1f);
        v(p, vc, ox + r[0] * half, cy - half, oz + r[2] * half, c, 1f);
        v(p, vc, ox + r[0] * half, cy + half, oz + r[2] * half, c, 1f);
        v(p, vc, ox - r[0] * half, cy + half, oz - r[2] * half, c, 1f);
    }

    // ------------------------------------------------------------------ helpers
    private static void v(PoseStack.Pose p, VertexConsumer vc, double x, double y, double z, float[] c, float a) {
        if (!SiftBudget.take(vc)) return; // 0.16: never exceed 16-bit quad indices in one batch
        if (!Double.isFinite(x + y + z)) { x = 0; y = 0; z = 0; a = 0f; }
        vc.addVertex(p, (float) x, (float) y, (float) z).setColor(Math.min(1f, c[0]), Math.min(1f, c[1]), Math.min(1f, c[2]), a);
    }

    private static float[] mix(float[] a, float[] b, float t) {
        return new float[]{a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t};
    }

    private static float smooth(float e0, float e1, float x) {
        float t = Math.max(0f, Math.min(1f, (x - e0) / (e1 - e0)));
        return t * t * (3 - 2 * t);
    }
}
