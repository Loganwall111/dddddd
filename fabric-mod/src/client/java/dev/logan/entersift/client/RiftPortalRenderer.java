package dev.logan.entersift.client;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.logan.entersift.RiftPortalEntity;
import dev.logan.entersift.RiftType;
import dev.logan.entersift.SiftContent;
import java.util.LinkedHashMap;
import java.util.Map;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.client.renderer.rendertype.RenderType;
import net.minecraft.client.renderer.state.level.CameraRenderState;
import net.minecraft.resources.Identifier;
import net.minecraft.world.phys.AABB;
import org.joml.Quaternionf;
import org.joml.Vector3f;

/**
 * 0.20 CLEAN-SLATE rift renderer (everything before 0.20 was deleted: textured interiors, veils, the
 * screen-copy lens, per-vertex jitter). Matches the Dungeons II trailer frames:
 *
 *  - A voxel puzzle cluster of hollow boxes recessed to different depths ({@link RiftShape}), with
 *    near-white inner walls tinted by the destination, and thin white neon rims with a soft halo.
 *  - TRUE WINDOW interior: every back face runs the rift core shader, which samples the destination's sky,
 *    blocky clouds and horizon by the WORLD-SPACE VIEW DIRECTION of each pixel. The picture therefore
 *    moves only with the camera's yaw and pitch, is identical across every quad (no splitting or
 *    shearing), and stays sharp and un-warped.
 *  - Slow WAVE: the whole rift sways as one continuous surface, strongest along the bottom. Every piece
 *    shares corner vertices (one canvas per cell, one wall per cell edge: no T-junctions), and the wave is
 *    a pure function of position, so the geometry can never crack.
 *
 * Growth timeline (server-synced entity age, 20 ticks = 1 s), 0.21:
 *   0-30    RIPPLE + SPARK: a flat translucent ripple in the wall plane scaling 0 % -> 100 % while erratic
 *           lightning flashes; the voxel structure is still invisible (the ripple is gone by tick 36).
 *   31-60   INCUBATION SEED: only the tiny central rectangular box, its glow pulsing rapidly.
 *   61-100  CLUSTER FRACTURE: one ring of boxes every 10 ticks (4 tiers, centre outward) with a white flash.
 *   100+    STABLE: large dissolving voxel energy cubes drift out, hollow cubes float, the rims shimmer,
 *           and at night wide neon curtains glow on the flanks.
 */
public final class RiftPortalRenderer extends EntityRenderer<RiftPortalEntity, RiftPortalRenderer.State> {
    static final Identifier THE_SIFT = SiftContent.id("the_sift");
    static final float RIPPLE_END = 30, SEED_START = 31, CLUSTER_START = 61, GROWN = 100;
    /** 0.21 recessed alcove: the outer lip stands COLLAR in front of the wall plane with a FLANGE-wide frame face. */
    static final float COLLAR = 0.3f, FLANGE = 0.16f;
    private static final Map<Long, RiftShape> SHAPES = new LinkedHashMap<>(32, 0.75f, true) {
        @Override protected boolean removeEldestEntry(Map.Entry<Long, RiftShape> eldest) { return size() > 48; }
    };

    public RiftPortalRenderer(EntityRendererProvider.Context context) { super(context); }

    public static final class State extends EntityRenderState {
        RiftType type = RiftType.SIFT;
        float w, h, age, yaw, time;
        long seed;
        double ex, ey, ez;
        boolean inSift, night;
        float glowK;   // 0.23: additive glow damper - day sky washes neon out to white
        int view;
    }

    @Override public State createRenderState() { return new State(); }

    @Override
    public void extractRenderState(RiftPortalEntity e, State s, float partial) {
        super.extractRenderState(e, s, partial);
        s.type = e.riftType();
        s.w = Float.isFinite(e.riftWidth()) ? Math.max(1.5f, Math.min(12f, e.riftWidth())) : 3f;
        s.h = Float.isFinite(e.riftHeight()) ? Math.max(1.5f, Math.min(12f, e.riftHeight())) : 4f;
        // The age is synced from the server, so re-tracking a rift never replays its opening.
        s.age = e.age() >= GROWN ? GROWN + 100f : e.age() + partial;
        s.time = (float) ((System.nanoTime() / 1.0e9) % 3600.0);
        s.yaw = e.getYRot();
        s.seed = e.blockPosition().asLong() * 31 + s.type.id;
        s.ex = e.getX(); s.ey = e.getY(); s.ez = e.getZ();
        var level = net.minecraft.client.Minecraft.getInstance().level;
        s.inSift = level != null && level.dimension().identifier().equals(THE_SIFT);
        long day = level == null ? 0L : level.getOverworldClockTime() % 24000L;
        s.night = day >= 11500L && day <= 23300L;        // evening through midnight only, never by day
        s.glowK = s.night ? 1f : 0.55f;                  // day: tighter, dimmer halo so pastels survive the bright sky
        s.view = viewCode(s.type, s.inSift);
    }

    @Override
    protected AABB getBoundingBoxForCulling(RiftPortalEntity e, float partial) {
        float r = Math.max(e.riftWidth(), e.riftHeight()) + 8f;   // night curtains reach past the cluster
        return e.getBoundingBox().inflate(r, r * 2f, r);
    }

    /**
     * Destination shown in the window (the rift type IS the destination): 0 Overworld (coral sky, blocky
     * cream clouds), 1 Nether (crimson smoke, fortress), 2 End (blue starlit islands), 3 Sift (mint sky,
     * pillars; pink-white at night), 4 ritual portal (cyan mosaic), 5 the Overworld seen from the Sift (gold).
     */
    static int viewCode(RiftType type, boolean inSift) {
        if (inSift && (type == RiftType.SIFT || type == RiftType.OVERWORLD)) return 5;
        return type.id;
    }

    /** Per-destination colours: rim core, rim halo, wall at the lip, wall at the back (trailer frames). */
    private record Look(float[] core, float[] halo, float[] wallFront, float[] wallBack) {}

    private static final Look[] LOOKS = {
        new Look(c(1f, 0.98f, 0.95f), c(1f, 0.62f, 0.50f), c(1f, 0.97f, 0.93f), c(1f, 0.78f, 0.66f)),   // 0 overworld: peach
        new Look(c(1f, 0.96f, 0.85f), c(1f, 0.45f, 0.25f), c(1f, 0.92f, 0.85f), c(0.95f, 0.55f, 0.45f)), // 1 nether
        new Look(c(0.96f, 1f, 0.86f), c(0.75f, 0.95f, 0.60f), c(1f, 0.82f, 0.93f), c(0.82f, 0.44f, 0.68f)), // 2 end: lime rims, pink walls
        new Look(c(1f, 1f, 1f), c(1f, 0.55f, 0.80f), c(0.93f, 0.89f, 0.97f), c(0.70f, 0.60f, 0.80f)), // 3 sift: pink rim, pale-lilac alcove walls (ref close-ups)
        new Look(c(0.9f, 1f, 1f), c(0.35f, 0.95f, 1f), c(0.90f, 1f, 1f), c(0.45f, 0.80f, 0.90f)),        // 4 portal: cyan
        new Look(c(1f, 0.97f, 0.55f), c(1f, 0.82f, 0.35f), c(0.97f, 0.85f, 0.58f), c(0.80f, 0.66f, 0.28f)),  // 5 gold (0.23: was blowing out to white by day)
    };

    /** Night curtain colours: electric blue, pale cyan, deep magenta, purple. */
    static final float[][] CURTAIN = {rgb(0x2F6BFF), rgb(0x9FF6FF), rgb(0xD13CFF), rgb(0x7A3CFF)};

    // ------------------------------------------------------------------ slow wave (crack-free)

    /**
     * The rift's slow sway. A smooth function of position only, so every shared corner moves identically.
     * 0.22: amplitude lives on the SIDES and peaks at the four corners (reference frames); the top and
     * bottom centre edges stay comparatively clean. Periods are 10-15 s.
     */
    static final class Warp {
        static final Warp STILL = new Warp(0f, 1f, 0f, 1f, false);
        final float t, halfW, cy, halfH;
        final boolean on;
        Warp(float t, float halfW, float cy, float halfH, boolean on) {
            this.t = t; this.halfW = Math.max(0.001f, halfW); this.cy = cy; this.halfH = Math.max(0.001f, halfH); this.on = on;
        }
        /**
         * 0.22 accuracy pass: the rift is wavy on the SIDES only, and waviest at the four corners (the
         * reference frames show undulating left/right edges and curled corner tabs, while the top and
         * bottom centre edges stay comparatively clean). Amplitude is a pure function of position, so
         * shared corner vertices still move identically and the mesh can never crack.
         */
        float amp(float x, float y) {
            if (!on) return 0f;
            float edge = Math.min(1f, Math.abs(x) / halfW);
            float vert = Math.min(1f, Math.abs(y - cy) / halfH);
            float e = edge * edge;
            return 0.05f + 0.26f * e * (0.45f + 0.55f * vert * vert);
        }
        float dx(float x, float y, float z) { return amp(x, y) * (float) Math.sin(t * 0.55f + y * 0.8f + z * 0.5f); }
        float dy(float x, float y, float z) { return amp(x, y) * 0.35f * (float) Math.sin(t * 0.42f + x * 0.9f); }
        float dz(float x, float y, float z) { return amp(x, y) * 0.8f * (float) Math.sin(t * 0.47f + x * 0.7f + y * 0.4f); }
    }

    /** Coloured vertex (walls, rims, glow). */
    private static void col(PoseStack.Pose p, VertexConsumer vc, Warp wv, float x, float y, float z, float[] c, float a) {
        if (!SiftBudget.take(vc)) return;
        float wx = x + wv.dx(x, y, z), wy = y + wv.dy(x, y, z), wz = z + wv.dz(x, y, z);
        if (!Float.isFinite(wx + wy + wz)) { wx = 0f; wy = 0f; wz = 0f; a = 0f; }
        vc.addVertex(p, wx, wy, wz).setColor(Math.min(1f, c[0]), Math.min(1f, c[1]), Math.min(1f, c[2]), Math.max(0f, Math.min(1f, a)));
    }

    /** Window vertex: colour carries (face u, face v, view code, 1). The shader samples by view direction. */
    private static void win(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, float x, float y, float z, float code, float gk) {
        if (!SiftBudget.take(vc)) return;
        float span = Math.max(sh.w, sh.h) * 1.15f;
        float u = clamp(0.5f + x / span, 0f, 1f), v = clamp(0.5f + (y - sh.cy()) / span, 0f, 1f);
        float wx = x + wv.dx(x, y, z), wy = y + wv.dy(x, y, z), wz = z + wv.dz(x, y, z);
        if (!Float.isFinite(wx + wy + wz)) { wx = 0f; wy = 0f; wz = 0f; }
        vc.addVertex(p, wx, wy, wz).setColor(u, v, code, gk);
    }

    // ------------------------------------------------------------------ submit

    @Override
    public void submit(State s, PoseStack pose, SubmitNodeCollector out, CameraRenderState camera) {
        if (SiftRenderTypes.irisShadowPass()) return;       // self-lit: nothing in the shadow map
        RiftShape sh = SHAPES.computeIfAbsent(s.seed * 1315423911L + Float.floatToIntBits(s.w) * 131L + Float.floatToIntBits(s.h),
            k -> RiftShape.build(s.type, s.seed, s.w, s.h));
        Look look = LOOKS[Math.max(0, Math.min(LOOKS.length - 1, s.view))];
        Vector3f cam = new Vector3f((float) (camera.pos.x - s.ex), (float) (camera.pos.y - s.ey), (float) (camera.pos.z - s.ez))
            .rotateY((float) Math.toRadians(s.yaw));
        boolean gpu = SiftBudget.riftShader;
        RenderType wallT = gpu ? SiftRenderTypes.RIFT_WALL : SiftRenderTypes.SOLID;
        RenderType glowT = gpu ? SiftRenderTypes.RIFT_GLOW : SiftRenderTypes.GLOW;
        RenderType winT = gpu ? SiftRenderTypes.RIFT : SiftRenderTypes.SOLID;
        float age = s.age;
        Warp wv = new Warp(s.time, sh.w / 2f, sh.cy(), sh.h / 2f, true);
        Warp still = Warp.STILL;
        float code = (s.view + (s.night ? 8 : 0) + 0.5f) / 16f;
        pose.pushPose();
        try {
            pose.rotate(new Quaternionf().rotationY((float) Math.toRadians(-s.yaw)));
            if (age < RIPPLE_END + 6 && age < GROWN) {
                float a = age;
                out.submitCustomGeometry(pose, glowT, (p, vc) -> { ripple(p, vc, still, sh, look, a); spark(p, vc, still, sh, s, cam, look, a); });
            }
            if (age >= SEED_START && age < appearAt(1) + 8) {
                float a = age;
                out.submitCustomGeometry(pose, glowT, (p, vc) -> { seedBox(p, vc, still, sh, look, a); seedGlow(p, vc, still, sh, s, cam, look, a); });
            }
            if (age >= CLUSTER_START) {
                float a = age;
                // 0.23: distorted rear field - a soft hazy dissolve blob BEHIND the whole cluster
                // (the references show the back of every rift melting into a wavy smoke-haze).
                if (SiftBudget.riftEffects) out.submitCustomGeometry(pose, glowT, (p, vc) -> rearHaze(p, vc, wv, sh, look, s));
                if (gpu) out.submitCustomGeometry(pose, winT, (p, vc) -> windows(p, vc, wv, sh, a, code, s));
                else out.submitCustomGeometry(pose, winT, (p, vc) -> windowsFlat(p, vc, wv, sh, a, s));
                out.submitCustomGeometry(pose, wallT, (p, vc) -> walls(p, vc, wv, sh, look, a, s));
                out.submitCustomGeometry(pose, glowT, (p, vc) -> rims(p, vc, wv, sh, look, cam, a, s));
                out.submitCustomGeometry(pose, wallT, (p, vc) -> frame(p, vc, wv, sh, look, a));
                // 0.23: the prominent 3D energy cubes drift at ALL times of day (references show them by day too).
                if (SiftBudget.riftEffects) out.submitCustomGeometry(pose, glowT, (p, vc) -> energyCubes(p, vc, sh, s, a));
                if (age >= GROWN && SiftBudget.riftEffects) out.submitCustomGeometry(pose, glowT, (p, vc) -> stable(p, vc, wv, sh, look, cam, s));
                if (age >= GROWN && s.night && SiftBudget.auraGlow) out.submitCustomGeometry(pose, glowT, (p, vc) -> curtains(p, vc, sh, s, cam));
            }
        } finally {
            pose.popPose();
        }
    }

    // ------------------------------------------------------------------ timeline

    /** One tier (ring of boxes) every 10 ticks: 61, 71, 81, 91. */
    private static float appearAt(int tier) { return CLUSTER_START + Math.min(tier, RiftShape.TIERS - 1) * 10f; }

    private static boolean shown(RiftShape sh, int i, int j, float age) { return sh.on(i, j) && age >= appearAt(sh.tier[i][j]); }

    private static float satAt(float[] b) { return appearAt(RiftShape.TIERS - 1) + 2f + b[6] % 3; }

    /** Front z of the wall toward neighbour (ni, nj): 0 open edge, -dn step to a shallower box, 1 = no wall. */
    private static float wallTop(RiftShape sh, int ni, int nj, float d, float age) {
        if (!shown(sh, ni, nj, age)) return 0f;
        float dn = sh.d(ni, nj);
        return dn < d - 1e-4f ? -dn : 1f;
    }

    /** PHASE 1: flat translucent puddle ripple in the wall plane, 0 % -> 100 % over ticks 0-30.
     *  0.23: the reference summon shows a HUGE bright ring (arcs spanning ~2.5x the rift) that lingers
     *  to about tick 48, so the radius multiplier and the fade-out were both raised. */
    private static void ripple(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, Look look, float age) {
        float f = Math.min(1f, age / RIPPLE_END), ease = 1 - (1 - f) * (1 - f);
        float fade = age <= RIPPLE_END ? 1f : Math.max(0f, 1f - (age - RIPPLE_END) / 18f);
        float radius = Math.max(sh.w, sh.h) * 1.35f;
        for (int rn = 0; rn < 3; rn++) {
            float rr = Math.max(0.001f, ease - rn * 0.22f) * radius;
            float a = fade * (rn == 0 ? 0.75f : 0.4f) * (1 - f * 0.35f);
            ring(p, vc, wv, 0f, sh.cy(), 0.02f, rr * 0.8f, rr, look.halo(), a);
            ring(p, vc, wv, 0f, sh.cy(), 0.02f, 0f, rr * 0.8f, look.halo(), a * 0.15f);
        }
    }

    /** PHASE 2: the tiny central seed box (tilted like the trailer), its glow pulsing rapidly; it shrinks away as the cluster snaps in. */
    private static void seedBox(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, Look look, float age) {
        float k = seedScale(age);
        if (k <= 0f) return;
        float hx = 0.45f * k, hy = 0.17f * k, hz = 0.17f * k, cy = sh.cy();
        float tilt = 0.18f * (float) Math.sin(age * 0.15f);
        float[][] v = new float[8][];
        for (int n = 0; n < 8; n++) {
            float x = (n & 1) == 0 ? -hx : hx, y = (n & 2) == 0 ? -hy : hy, z = (n & 4) == 0 ? -hz : hz;
            float rx = x * (float) Math.cos(tilt) - y * (float) Math.sin(tilt), ry = x * (float) Math.sin(tilt) + y * (float) Math.cos(tilt);
            v[n] = new float[]{rx, cy + ry, z};
        }
        int[][] faces = {{0, 1, 3, 2}, {4, 6, 7, 5}, {0, 4, 5, 1}, {2, 3, 7, 6}, {0, 2, 6, 4}, {1, 5, 7, 3}};
        float[] hot = mix(look.core(), c(1f, 1f, 1f), 0.6f);
        float pulse = 0.45f + 0.55f * (0.5f + 0.5f * (float) Math.sin(age * 2.2f));   // rapid alpha pulse (seed phase only)
        for (int[] f : faces) for (int idx : f) col(p, vc, wv, v[idx][0], v[idx][1], v[idx][2], hot, pulse);
    }

    /** PHASE 1 spark: erratic lightning flashing over the ripple (re-aimed every 2 ticks, flickering on and
     *  off). 0.23: the village-reference frames keep jagged bolts playing over the rift until ~tick 90. */
    private static void spark(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, State s, Vector3f cam, Look look, float age) {
        if (age > 90) return;
        int burst = (int) (age / 2f);
        if (RiftShape.hash(s.seed, burst, 85) < 0.3f) return;
        float r = Math.max(sh.w, sh.h) * 0.55f * Math.min(1f, age / RIPPLE_END + 0.2f);
        int n = 1 + (int) (RiftShape.hash(s.seed, burst, 86) * 3f);
        for (int b = 0; b < n; b++) {
            double a0 = RiftShape.hash(s.seed, burst * 5 + b, 87) * Math.PI * 2, a1 = a0 + 1.2 + RiftShape.hash(s.seed, burst * 5 + b, 88) * 2.5;
            float[] from = {(float) Math.cos(a0) * r * 0.2f, sh.cy() + (float) Math.sin(a0) * r * 0.2f, 0.05f};
            float[] to = {(float) Math.cos(a1) * r, sh.cy() + (float) Math.sin(a1) * r, 0.1f};
            bolt(p, vc, wv, cam, from, to, s.seed + burst * 13L + b, look, 0.9f);
        }
    }

    private static float seedScale(float age) {
        float grow = Math.min(1f, (age - SEED_START) / 4f);
        float shrink = 1f - Math.max(0f, Math.min(1f, (age - appearAt(1)) / 8f));
        return Math.max(0f, grow * shrink);
    }

    /** PHASE 2 glow: halo round the seed and erratic lightning re-aimed at nearby block positions every 3 ticks. */
    private static void seedGlow(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, State s, Vector3f cam, Look look, float age) {
        float k = seedScale(age);
        if (k <= 0f) return;
        halo(p, vc, wv, 0f, sh.cy(), 0.2f, 1.1f * k, look.halo(), 0.35f * k * s.glowK);
        int burst = (int) (age / 3f);
        int n = 2 + (int) (RiftShape.hash(s.seed, burst, 81) * 3f);
        for (int b = 0; b < n; b++) {
            float tx = Math.round((RiftShape.hash(s.seed, burst * 7 + b, 82) - 0.5f) * 8f);
            float ty = Math.round(sh.cy() + (RiftShape.hash(s.seed, burst * 7 + b, 83) - 0.5f) * 6f);
            float tz = Math.round((RiftShape.hash(s.seed, burst * 7 + b, 84) - 0.5f) * 3f);
            bolt(p, vc, wv, cam, new float[]{0f, sh.cy(), 0f}, new float[]{tx, ty, tz}, s.seed + burst * 31L + b, look, k);
        }
    }

    // ------------------------------------------------------------------ windows (the destination view)

    private static void windows(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, float age, float code, State s) {
        for (int i = 0; i < sh.cols; i++) for (int j = 0; j < sh.rows; j++) {
            if (!shown(sh, i, j, age)) continue;
            float x0 = sh.x(i), x1 = sh.x(i + 1), y0 = sh.y(j), y1 = sh.y(j + 1), z = -sh.d(i, j);
            win(p, vc, wv, sh, x0, y0, z, code, s.glowK); win(p, vc, wv, sh, x1, y0, z, code, s.glowK);
            win(p, vc, wv, sh, x1, y1, z, code, s.glowK); win(p, vc, wv, sh, x0, y1, z, code, s.glowK);
        }
        for (float[] b : sh.sats) {
            if (age < satAt(b)) continue;
            win(p, vc, wv, sh, b[0], b[1], b[5], code, s.glowK); win(p, vc, wv, sh, b[2], b[1], b[5], code, s.glowK);
            win(p, vc, wv, sh, b[2], b[3], b[5], code, s.glowK); win(p, vc, wv, sh, b[0], b[3], b[5], code, s.glowK);
        }
        if (age >= GROWN) for (int k = 0; k < 7; k++) {               // floating hollow cubes show the view too
            float[] c = cube(sh, s, k);
            float q = c[3], z = c[2] - q;
            win(p, vc, wv, sh, c[0] - q, c[1] - q, z, code, s.glowK); win(p, vc, wv, sh, c[0] + q, c[1] - q, z, code, s.glowK);
            win(p, vc, wv, sh, c[0] + q, c[1] + q, z, code, s.glowK); win(p, vc, wv, sh, c[0] - q, c[1] + q, z, code, s.glowK);
        }
    }

    /** rift_shader=false fallback: flat vertical gradient in the destination colours (no shader). */
    private static void windowsFlat(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, float age, State s) {
        float[][] g = switch (s.view) {
            case 1 -> new float[][]{c(0.95f, 0.30f, 0.12f), c(0.45f, 0.05f, 0.05f)};
            case 2 -> new float[][]{c(0.30f, 0.28f, 0.62f), c(0.05f, 0.06f, 0.18f)};
            case 3 -> new float[][]{c(0.62f, 0.90f, 0.86f), c(0.88f, 0.97f, 0.95f)};
            case 4 -> new float[][]{c(0.30f, 0.85f, 0.95f), c(0.70f, 1f, 1f)};
            case 5 -> new float[][]{c(1f, 0.93f, 0.55f), c(0.93f, 0.80f, 0.25f)};
            default -> new float[][]{c(1f, 0.70f, 0.36f), c(0.95f, 0.40f, 0.32f)};
        };
        for (int i = 0; i < sh.cols; i++) for (int j = 0; j < sh.rows; j++) {
            if (!shown(sh, i, j, age)) continue;
            float x0 = sh.x(i), x1 = sh.x(i + 1), y0 = sh.y(j), y1 = sh.y(j + 1), z = -sh.d(i, j);
            float[] lo = mix(g[0], g[1], (float) j / sh.rows), hi = mix(g[0], g[1], (float) (j + 1) / sh.rows);
            col(p, vc, wv, x0, y0, z, lo, 1f); col(p, vc, wv, x1, y0, z, lo, 1f);
            col(p, vc, wv, x1, y1, z, hi, 1f); col(p, vc, wv, x0, y1, z, hi, 1f);
        }
        for (float[] b : sh.sats) {
            if (age < satAt(b)) continue;
            col(p, vc, wv, b[0], b[1], b[5], g[0], 1f); col(p, vc, wv, b[2], b[1], b[5], g[0], 1f);
            col(p, vc, wv, b[2], b[3], b[5], g[1], 1f); col(p, vc, wv, b[0], b[3], b[5], g[1], 1f);
        }
    }

    // ------------------------------------------------------------------ walls

    private static void walls(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, Look look, float age, State s) {
        float[] f = look.wallFront(), b = look.wallBack();
        for (int i = 0; i < sh.cols; i++) for (int j = 0; j < sh.rows; j++) {
            if (!shown(sh, i, j, age)) continue;
            float d = sh.d(i, j), x0 = sh.x(i), x1 = sh.x(i + 1), y0 = sh.y(j), y1 = sh.y(j + 1);
            float zl = wallTop(sh, i - 1, j, d, age), zr = wallTop(sh, i + 1, j, d, age);
            float zd = wallTop(sh, i, j - 1, d, age), zu = wallTop(sh, i, j + 1, d, age);
            if (zl <= 0) wall(p, vc, wv, x0, y0, x0, y1, lip(zl), -d, f, b, 0.92f);
            if (zr <= 0) wall(p, vc, wv, x1, y0, x1, y1, lip(zr), -d, f, b, 0.84f);
            if (zd <= 0) wall(p, vc, wv, x0, y0, x1, y0, lip(zd), -d, f, b, 1f);
            if (zu <= 0) wall(p, vc, wv, x0, y1, x1, y1, lip(zu), -d, f, b, 0.76f);
        }
        for (float[] q : sh.sats) {
            if (age < satAt(q)) continue;
            int m = (int) q[7];
            if ((m & 1) == 0) wall(p, vc, wv, q[0], q[1], q[0], q[3], q[4], q[5], f, b, 0.92f);
            if ((m & 2) == 0) wall(p, vc, wv, q[2], q[1], q[2], q[3], q[4], q[5], f, b, 0.84f);
            if ((m & 4) == 0) wall(p, vc, wv, q[0], q[1], q[2], q[1], q[4], q[5], f, b, 1f);
            if ((m & 8) == 0) wall(p, vc, wv, q[0], q[3], q[2], q[3], q[4], q[5], f, b, 0.76f);
        }
        if (age >= GROWN) for (int k = 0; k < 7; k++) {
            float[] c = cube(sh, s, k);
            float q = c[3], zf = c[2] + q, zb = c[2] - q;
            wall(p, vc, wv, c[0] - q, c[1] - q, c[0] - q, c[1] + q, zf, zb, f, b, 0.92f);
            wall(p, vc, wv, c[0] + q, c[1] - q, c[0] + q, c[1] + q, zf, zb, f, b, 0.84f);
            wall(p, vc, wv, c[0] - q, c[1] - q, c[0] + q, c[1] - q, zf, zb, f, b, 1f);
            wall(p, vc, wv, c[0] - q, c[1] + q, c[0] + q, c[1] + q, zf, zb, f, b, 0.76f);
        }
    }

    private static void wall(PoseStack.Pose p, VertexConsumer vc, Warp wv, float xa, float ya, float xb, float yb, float zf, float zb,
                             float[] front, float[] back, float shade) {
        float[] f = {front[0] * shade, front[1] * shade, front[2] * shade}, b = {back[0] * shade, back[1] * shade, back[2] * shade};
        col(p, vc, wv, xa, ya, zf, f, 1f); col(p, vc, wv, xb, yb, zf, f, 1f);
        col(p, vc, wv, xb, yb, zb, b, 1f); col(p, vc, wv, xa, ya, zb, b, 1f);
    }

    // ------------------------------------------------------------------ rims (thin white neon + soft halo)

    private static void rims(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, Look look, Vector3f cam, float age, State s) {
        float[] core = look.core(), halo = look.halo(), white = c(1f, 1f, 1f);
        // 0.21 "reality tearing" shimmer: ghost copies of every rim, offset by one uniform vibrating vector
        // for the whole rift. They are additive overlays on top of intact geometry, so nothing can open up.
        float[] jit = {0.022f * (float) Math.sin(s.time * 7.3f), 0.022f * (float) Math.sin(s.time * 5.1f + 1.7f)};
        for (int i = 0; i < sh.cols; i++) for (int j = 0; j < sh.rows; j++) {
            if (!shown(sh, i, j, age)) continue;
            float d = sh.d(i, j), x0 = sh.x(i), x1 = sh.x(i + 1), y0 = sh.y(j), y1 = sh.y(j + 1);
            float flash = Math.max(0f, 1f - (age - appearAt(sh.tier[i][j])) / 6f);
            if (flash > 0f) rect(p, vc, wv, x0, y0, x1, y1, -d + 0.02f, white, flash * 0.85f);
            float zl = wallTop(sh, i - 1, j, d, age), zr = wallTop(sh, i + 1, j, d, age);
            float zd = wallTop(sh, i, j - 1, d, age), zu = wallTop(sh, i, j + 1, d, age);
            if (zl <= 0) rim(p, vc, wv, cam, x0, y0, x0, y1, lip(zl), -d, core, halo, zl < 0, flash, jit, s.glowK);
            if (zr <= 0) rim(p, vc, wv, cam, x1, y0, x1, y1, lip(zr), -d, core, halo, zr < 0, flash, jit, s.glowK);
            if (zd <= 0) rim(p, vc, wv, cam, x0, y0, x1, y0, lip(zd), -d, core, halo, zd < 0, flash, jit, s.glowK);
            if (zu <= 0) rim(p, vc, wv, cam, x0, y1, x1, y1, lip(zu), -d, core, halo, zu < 0, flash, jit, s.glowK);
        }
        for (float[] q : sh.sats) {
            if (age < satAt(q)) continue;
            float flash = Math.max(0f, 1f - (age - satAt(q)) / 6f);
            int m = (int) q[7];
            if ((m & 1) == 0) rim(p, vc, wv, cam, q[0], q[1], q[0], q[3], q[4], q[5], core, halo, false, flash, jit, s.glowK);
            if ((m & 2) == 0) rim(p, vc, wv, cam, q[2], q[1], q[2], q[3], q[4], q[5], core, halo, false, flash, jit, s.glowK);
            if ((m & 4) == 0) rim(p, vc, wv, cam, q[0], q[1], q[2], q[1], q[4], q[5], core, halo, false, flash, jit, s.glowK);
            if ((m & 8) == 0) rim(p, vc, wv, cam, q[0], q[3], q[2], q[3], q[4], q[5], core, halo, false, flash, jit, s.glowK);
            float[][] corners = {{q[0], q[1], m & 5}, {q[2], q[1], m & 6}, {q[0], q[3], m & 9}, {q[2], q[3], m & 10}};
            for (float[] cr : corners)
                if (cr[2] == 0) line(p, vc, wv, cam, new float[]{cr[0], cr[1], q[4]}, new float[]{cr[0], cr[1], q[5]}, 0.05f, core, 0.8f);
        }
    }

    /** Front neon rim at {@code zf} (full or lip) and a faint line where the wall meets the window at {@code zb}. */
    private static void rim(PoseStack.Pose p, VertexConsumer vc, Warp wv, Vector3f cam, float xa, float ya, float xb, float yb, float zf, float zb,
                            float[] core, float[] halo, boolean lip, float flash, float[] jit, float gk) {
        float k = lip ? 0.75f : 1f, a = lip ? 0.85f : 1f;
        float[] fa = {xa, ya, zf + 0.006f}, fb = {xb, yb, zf + 0.006f};
        band(p, vc, wv, cam, fa, fb, (0.105f + 0.05f * flash) * k, (0.36f + 0.12f * flash) * k * gk, core, halo, a * gk);
        line(p, vc, wv, cam, fa, fb, 0.8f * k, halo, 0.02f);
        line(p, vc, wv, cam, new float[]{xa + jit[0], ya + jit[1], zf + 0.01f}, new float[]{xb + jit[0], yb + jit[1], zf + 0.01f}, 0.04f * k, core, 0.12f);
        line(p, vc, wv, cam, new float[]{xa - jit[1], ya + jit[0], zf + 0.012f}, new float[]{xb - jit[1], yb + jit[0], zf + 0.012f}, 0.04f * k, halo, 0.10f);
        band(p, vc, wv, cam, new float[]{xa, ya, zb + 0.012f}, new float[]{xb, yb, zb + 0.012f}, 0.035f, 0.14f, core, halo, 0.35f * gk);
    }

    // ------------------------------------------------------------------ 0.23 distorted rear field

    /**
     * The trailer's "dissolved back": a wavy, soft-edged haze sheet floating BEHIND the cluster
     * (additive, no depth write). A 6x6 grid of quads whose per-vertex alpha comes from a drifting
     * hash/sine field, so the rear of the rift melts into cosmic smoke instead of ending in a flat
     * plane. Vertices undulate with the same warp, so it sways with the rift.
     */
    private static void rearHaze(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, Look look, State s) {
        int n = 6;
        float hw = sh.w * 0.85f, hh = sh.h * 0.8f, z = -sh.maxDepth - 0.9f;
        float[] haze = mix(look.halo(), c(1f, 1f, 1f), 0.35f);
        for (int i = 0; i < n; i++) for (int j = 0; j < n; j++) {
            float[][] vs = new float[4][2];
            float[][] al = new float[4][1];
            for (int q = 0; q < 4; q++) {
                int qi = i + (q == 1 || q == 2 ? 1 : 0), qj = j + (q >= 2 ? 1 : 0);
                float x = -hw + qi / (float) n * hw * 2, y = sh.cy() - hh + qj / (float) n * hh * 2;
                float h1 = RiftShape.hash(s.seed, qi * 7 + qj * 13, 151), h2 = RiftShape.hash(s.seed, qi * 5 + qj * 11, 152);
                float a = (0.16f + 0.20f * h1) * (0.55f + 0.45f * (float) Math.sin(s.time * 0.5f + h2 * 6.28f)) * (0.5f + 0.5f * s.glowK);
                // soft round falloff toward the sheet margin
                float mx = Math.abs(x) / hw, my = Math.abs(y - sh.cy()) / hh;
                a *= Math.max(0f, 1f - mx * mx) * Math.max(0f, 1f - my * my);
                vs[q] = new float[]{x, y};
                al[q][0] = a;
            }
            if (al[0][0] + al[1][0] + al[2][0] + al[3][0] < 0.01f) continue;
            col(p, vc, wv, vs[0][0], vs[0][1], z, haze, al[0][0]); col(p, vc, wv, vs[1][0], vs[1][1], z, haze, al[1][0]);
            col(p, vc, wv, vs[2][0], vs[2][1], z, haze, al[2][0]); col(p, vc, wv, vs[3][0], vs[3][1], z, haze, al[3][0]);
        }
    }

    // ------------------------------------------------------------------ stable details

    private static void stable(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, Look look, Vector3f cam, State s) {
        float[] white = c(1f, 1f, 1f), core = look.core();
        // Floating hollow cubes: white outlines (their walls and windows are drawn in the other passes).
        for (int k = 0; k < 7; k++) {
            float[] c = cube(sh, s, k);
            float q = c[3];
            float[][] v = new float[8][];
            for (int n = 0; n < 8; n++) v[n] = new float[]{c[0] + ((n & 1) == 0 ? -q : q), c[1] + ((n & 2) == 0 ? -q : q), c[2] + ((n & 4) == 0 ? -q : q)};
            int[][] edges = {{0, 1}, {2, 3}, {4, 5}, {6, 7}, {0, 2}, {1, 3}, {4, 6}, {5, 7}, {0, 4}, {1, 5}, {2, 6}, {3, 7}};
            for (int[] e : edges) line(p, vc, wv, cam, v[e[0]], v[e[1]], 0.045f, core, 0.95f * (0.5f + 0.5f * s.glowK));
        }
        // White pixel sparkles drifting slowly up through the opening (fade in and out over their life).
        for (int k = 0; k < 30; k++) {
            float life = (RiftShape.hash(s.seed, k, 70) + s.time * (0.04f + 0.04f * RiftShape.hash(s.seed, k, 71))) % 1f;
            float x = (RiftShape.hash(s.seed, k, 72) - 0.5f) * sh.w * 1.1f, y = RiftShape.BASE + life * (sh.h + 1f);
            float z = -sh.maxDepth * RiftShape.hash(s.seed, k, 73) * 0.8f + (RiftShape.hash(s.seed, k, 74) < 0.35f ? 0.6f : 0.05f);
            float a = (float) Math.sin(life * Math.PI) * 0.9f, q = 0.035f + 0.03f * RiftShape.hash(s.seed, k, 75);
            if (a < 0.03f) continue;
            line(p, vc, wv, cam, new float[]{x, y - q, z}, new float[]{x, y + q, z}, q * 2f, white, a);
        }
        // Occasional lightning arc from the rim into the air (one every ~4 s, visible for 6 ticks).
        float cycle = s.time * 20f / 80f;
        int n = (int) cycle;
        if (cycle - n < 6f / 80f) {
            double ang = RiftShape.hash(s.seed, n, 91) * Math.PI * 2;
            float ax = (float) Math.cos(ang) * sh.w * 0.45f, ay = sh.cy() + (float) Math.sin(ang) * sh.h * 0.45f;
            float bx = ax + (float) Math.cos(ang) * (2.5f + 2f * RiftShape.hash(s.seed, n, 92));
            float by = ay + (float) Math.sin(ang) * 2f + 1.5f * RiftShape.hash(s.seed, n, 93);
            bolt(p, vc, wv, cam, new float[]{ax, ay, 0.05f}, new float[]{bx, by, 0.3f}, s.seed + n * 17L, look, 0.9f);
        }
    }

    /** Open edges of the silhouette get the raised alcove lip; inner step walls keep their own front. */
    private static float lip(float z) { return z == 0f ? COLLAR : z; }

    // ------------------------------------------------------------------ 0.21 recessed alcove frame

    /**
     * Chunky double-layer frame: along every open edge of the silhouette a flat face FLANGE wide stands at
     * z = COLLAR and an outer wall drops back to the wall plane, so the opening sits recessed in a thick
     * alcove instead of lying flush on the blocks. Convex corners get a corner square and extended walls.
     */
    private static void frame(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, Look look, float age) {
        float[] face = look.wallFront(), side = mix(look.wallFront(), look.wallBack(), 0.35f);
        float F = FLANGE, C = COLLAR;
        for (int i = 0; i < sh.cols; i++) for (int j = 0; j < sh.rows; j++) {
            if (!shown(sh, i, j, age)) continue;
            float x0 = sh.x(i), x1 = sh.x(i + 1), y0 = sh.y(j), y1 = sh.y(j + 1);
            boolean L = !shown(sh, i - 1, j, age), R = !shown(sh, i + 1, j, age), D = !shown(sh, i, j - 1, age), U = !shown(sh, i, j + 1, age);
            if (L) { rect(p, vc, wv, x0 - F, y0, x0, y1, C, face, 1f);
                wall(p, vc, wv, x0 - F, y0 - (D ? F : 0), x0 - F, y1 + (U ? F : 0), C, 0f, side, side, 0.9f); }
            if (R) { rect(p, vc, wv, x1, y0, x1 + F, y1, C, face, 1f);
                wall(p, vc, wv, x1 + F, y0 - (D ? F : 0), x1 + F, y1 + (U ? F : 0), C, 0f, side, side, 0.82f); }
            if (D) { rect(p, vc, wv, x0, y0 - F, x1, y0, C, face, 1f);
                wall(p, vc, wv, x0 - (L ? F : 0), y0 - F, x1 + (R ? F : 0), y0 - F, C, 0f, side, side, 0.7f); }
            // 0.22: NO top flange. The wide flat face along the upper silhouette read as a weird white slab
            // sitting on top of the rift; the reference frames show only the thin white rim + glow up there.
            // The corner tabs below belong to the left/right flanges and stay.
            if (L && D) rect(p, vc, wv, x0 - F, y0 - F, x0, y0, C, face, 1f);
            if (R && D) rect(p, vc, wv, x1, y0 - F, x1 + F, y0, C, face, 1f);
            if (L && U) rect(p, vc, wv, x0 - F, y1, x0, y1 + F, C, face, 1f);
            if (R && U) rect(p, vc, wv, x1, y1, x1 + F, y1 + F, C, face, 1f);
        }
    }

    // ------------------------------------------------------------------ 0.21 dissolving voxel energy cubes

    /** Per rift type (0 overworld, 1 nether, 2 end, 3 sift, 4 portal): three emissive trailer hues. */
    static final float[][][] ENERGY = {
        {rgb(0xFF9A6A), rgb(0xFFE3B0), rgb(0xFF6F5A)},     // overworld: coral, cream, salmon
        {rgb(0xC0142A), rgb(0xFF6A1A), rgb(0xE0B040)},     // nether: dark crimson, volcanic orange, ash gold
        {rgb(0x6A7CFF), rgb(0xC07CFF), rgb(0xD8FF8A)},     // end: blue, violet, pale lime
        {rgb(0xA8F5C8), rgb(0x3FF3FF), rgb(0xFFB8E0)},     // sift: pastel mint, electric cyan, pale pink
        {rgb(0x3FE8FF), rgb(0xA0FFFF), rgb(0x2F9CFF)},     // portal: cyan
    };

    /**
     * Large 3D voxel cubes (0.25-0.5 blocks) drifting out of the rift, additive and emissive. Each one keeps
     * its cube shape for 75 % of its life, then flattens (Y squashes, X/Z stretch) into a wide thin slab
     * while fading to nothing: the trailer's disintegration flare. Deterministic from the wall clock, so it
     * costs no entities and no network traffic.
     */
    private static void energyCubes(PoseStack.Pose p, VertexConsumer vc, RiftShape sh, State s, float age) {
        float[][] pal = ENERGY[Math.max(0, Math.min(ENERGY.length - 1, s.type.id))];
        float ramp = clamp((age - CLUSTER_START) / (GROWN - CLUSTER_START), 0f, 1f);
        int count = Math.round(18 * (0.3f + 0.7f * ramp));
        for (int k = 0; k < count; k++) {
            float life = 2.2f + 1.6f * RiftShape.hash(s.seed, k, 120), period = life + 0.9f * RiftShape.hash(s.seed, k, 121);
            float tt = s.time + RiftShape.hash(s.seed, k, 122) * period;
            int gen = (int) (tt / period);
            float f = (tt - gen * period) / life;
            if (f >= 1f || f < 0f) continue;
            long g = s.seed + gen * 7919L;
            float secs = f * life;
            // 0.22 spec: strictly upward Y drift, absolute zero horizontal X/Z drift.
            float x = (RiftShape.hash(g, k, 1) - 0.5f) * sh.w * 0.85f;
            float y = sh.cy() + (RiftShape.hash(g, k, 2) - 0.5f) * sh.h * 0.8f + (0.15f + 0.35f * RiftShape.hash(g, k, 5)) * secs;
            float z = -0.4f * RiftShape.hash(g, k, 3);
            float half = (0.25f + 0.25f * RiftShape.hash(g, k, 7)) / 2f;
            float hx = half, hy = half, a = 0.85f * Math.min(1f, f / 0.08f);
            if (f >= 0.75f) {
                float d = (f - 0.75f) / 0.25f;
                hy = half * (1f - 0.88f * d);
                hx = half * (1f + 1.6f * d);
                a *= 1f - d;
            }
            if (a < 0.01f) continue;
            voxel(p, vc, x, y, z, hx, hy, hx, pal[(int) (RiftShape.hash(g, k, 8) * 3f) % 3], a);
        }
    }

    /** Solid additive box with per-face shading (not a flat billboard). */
    private static void voxel(PoseStack.Pose p, VertexConsumer vc, float cx, float cy, float cz, float hx, float hy, float hz, float[] c, float a) {
        Warp w = Warp.STILL;
        float[] top = c, sideA = mix(c, c(0f, 0f, 0f), 0.15f), sideB = mix(c, c(0f, 0f, 0f), 0.3f);
        float x0 = cx - hx, x1 = cx + hx, y0 = cy - hy, y1 = cy + hy, z0 = cz - hz, z1 = cz + hz;
        rect(p, vc, w, x0, y0, x1, y1, z1, sideA, a);                    // front
        rect(p, vc, w, x0, y0, x1, y1, z0, sideA, a * 0.6f);             // back
        col(p, vc, w, x0, y1, z0, top, a); col(p, vc, w, x1, y1, z0, top, a); col(p, vc, w, x1, y1, z1, top, a); col(p, vc, w, x0, y1, z1, top, a);
        col(p, vc, w, x0, y0, z0, sideB, a * 0.7f); col(p, vc, w, x1, y0, z0, sideB, a * 0.7f); col(p, vc, w, x1, y0, z1, sideB, a * 0.7f); col(p, vc, w, x0, y0, z1, sideB, a * 0.7f);
        col(p, vc, w, x0, y0, z0, sideB, a); col(p, vc, w, x0, y1, z0, sideB, a); col(p, vc, w, x0, y1, z1, sideB, a); col(p, vc, w, x0, y0, z1, sideB, a);
        col(p, vc, w, x1, y0, z0, sideB, a); col(p, vc, w, x1, y1, z0, sideB, a); col(p, vc, w, x1, y1, z1, sideB, a); col(p, vc, w, x1, y0, z1, sideB, a);
    }

    private static float[] cube(RiftShape sh, State s, int k) {
        double a = RiftShape.hash(s.seed, k, 1) * Math.PI * 2;
        float reach = 0.8f + 0.45f * RiftShape.hash(s.seed, k, 2);
        float cx = (float) Math.cos(a) * sh.w / 2 * reach * 1.25f, cy = sh.cy() + (float) Math.sin(a) * sh.h / 2 * reach * 1.2f;
        float cz = 0.3f + 0.9f * RiftShape.hash(s.seed, k, 3), half = 0.2f + 0.22f * RiftShape.hash(s.seed, k, 4);
        return new float[]{cx, cy, cz, half};
    }

    // ------------------------------------------------------------------ night neon curtains

    /**
     * Wide soft vertical curtains on the rift's outer flanks (not thin poles): each is a camera-facing sheet
     * 2.5-5 blocks wide made of 8 strips with a smooth bell profile, fading in above the ground and out toward
     * the top. Additive, depth-tested, no depth write, so they glow into the night sky without sorting errors.
     */
    private static void curtains(PoseStack.Pose p, VertexConsumer vc, RiftShape sh, State s, Vector3f cam) {
        Warp still = Warp.STILL;
        int n = 8;
        for (int k = 0; k < n; k++) {
            float side = k % 2 == 0 ? -1f : 1f, rank = k / 2;
            float hx = RiftShape.hash(s.seed, k, 101), hz = RiftShape.hash(s.seed, k, 102), hh = RiftShape.hash(s.seed, k, 103);
            float x = side * (sh.w * 0.35f + rank * 1.9f + hx * 1.2f);
            float z = -sh.maxDepth - 1.5f - 4f * hz;
            float width = 2.5f + 2.5f * hh, height = 18f + 16f * RiftShape.hash(s.seed, k, 104);
            float[] base = CURTAIN[(k + (int) (s.seed & 3)) % CURTAIN.length];
            float[] top = mix(base, CURTAIN[(k + 1) % CURTAIN.length], 0.35f);
            // Face the camera around the vertical axis.
            float vx = cam.x - x, vz = cam.z - z, len = (float) Math.sqrt(vx * vx + vz * vz);
            if (len < 1e-3f) continue;
            float rx = -vz / len, rz = vx / len;
            int strips = 8;
            float[] ys = {-1f, 1.2f, height * 0.45f, height};
            float[] va = {0f, 1f, 0.8f, 0f};
            for (int st = 0; st < strips; st++) {
                float s0 = st / (float) strips * 2f - 1f, s1 = (st + 1) / (float) strips * 2f - 1f;
                float a0 = (float) Math.exp(-s0 * s0 * 2.6f), a1 = (float) Math.exp(-s1 * s1 * 2.6f);
                float o0 = s0 * width / 2, o1 = s1 * width / 2;
                for (int seg = 0; seg < 3; seg++) {
                    float[] cA = mix(base, top, ys[seg] / height), cB = mix(base, top, ys[seg + 1] / height);
                    float peak = 0.3f;
                    col(p, vc, still, x + rx * o0, ys[seg], z + rz * o0, cA, peak * a0 * va[seg]);
                    col(p, vc, still, x + rx * o1, ys[seg], z + rz * o1, cA, peak * a1 * va[seg]);
                    col(p, vc, still, x + rx * o1, ys[seg + 1], z + rz * o1, cB, peak * a1 * va[seg + 1]);
                    col(p, vc, still, x + rx * o0, ys[seg + 1], z + rz * o0, cB, peak * a0 * va[seg + 1]);
                }
            }
        }
    }

    // ------------------------------------------------------------------ primitives

    private static void rect(PoseStack.Pose p, VertexConsumer vc, Warp wv, float x0, float y0, float x1, float y1, float z, float[] c, float a) {
        col(p, vc, wv, x0, y0, z, c, a); col(p, vc, wv, x1, y0, z, c, a); col(p, vc, wv, x1, y1, z, c, a); col(p, vc, wv, x0, y1, z, c, a);
    }

    /** Annulus in the wall plane (inner..outer), alpha fading toward the inner edge. */
    private static void ring(PoseStack.Pose p, VertexConsumer vc, Warp wv, float cx, float cy, float z, float inner, float outer, float[] c, float a) {
        int n = 48;
        for (int k = 0; k < n; k++) {
            double t0 = k * Math.PI * 2 / n, t1 = (k + 1) * Math.PI * 2 / n;
            float c0 = (float) Math.cos(t0), s0 = (float) Math.sin(t0), c1 = (float) Math.cos(t1), s1 = (float) Math.sin(t1);
            float ai = inner > 0 ? 0f : a;
            col(p, vc, wv, cx + c0 * inner, cy + s0 * inner, z, c, ai); col(p, vc, wv, cx + c0 * outer, cy + s0 * outer, z, c, a);
            col(p, vc, wv, cx + c1 * outer, cy + s1 * outer, z, c, a); col(p, vc, wv, cx + c1 * inner, cy + s1 * inner, z, c, ai);
        }
    }

    private static void halo(PoseStack.Pose p, VertexConsumer vc, Warp wv, float cx, float cy, float z, float r, float[] c, float a) {
        int n = 32;
        for (int k = 0; k < n; k++) {
            double t0 = k * Math.PI * 2 / n, t1 = (k + 1) * Math.PI * 2 / n;
            col(p, vc, wv, cx, cy, z, c, a); col(p, vc, wv, cx, cy, z, c, a);
            col(p, vc, wv, cx + (float) Math.cos(t1) * r, cy + (float) Math.sin(t1) * r, z, c, 0f);
            col(p, vc, wv, cx + (float) Math.cos(t0) * r, cy + (float) Math.sin(t0) * r, z, c, 0f);
        }
    }

    /** Jagged lightning: thin white core plus a soft coloured glow, 10 segments with random kinks. */
    private static void bolt(PoseStack.Pose p, VertexConsumer vc, Warp wv, Vector3f cam, float[] a, float[] b, long seed, Look look, float alpha) {
        float[] prev = a, white = c(1f, 1f, 1f);
        float len = (float) Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]) + (b[2] - a[2]) * (b[2] - a[2]));
        for (int i = 1; i <= 10; i++) {
            float f = i / 10f, jit = i == 10 ? 0 : len * 0.12f;
            float[] q = {a[0] + (b[0] - a[0]) * f + (RiftShape.hash(seed, i, 61) - 0.5f) * jit,
                a[1] + (b[1] - a[1]) * f + (RiftShape.hash(seed, i, 62) - 0.5f) * jit,
                a[2] + (b[2] - a[2]) * f + (RiftShape.hash(seed, i, 63) - 0.5f) * jit};
            line(p, vc, wv, cam, prev, q, 0.045f, white, alpha);
            line(p, vc, wv, cam, prev, q, 0.22f, look.halo(), alpha * 0.25f);
            prev = q;
        }
    }

    /** Camera-facing gradient strip: halo (0) -> halo (0.4) -> core (1) -> halo (0.4) -> halo (0). */
    private static void band(PoseStack.Pose p, VertexConsumer vc, Warp wv, Vector3f cam, float[] a, float[] b, float core, float outer,
                             float[] white, float[] halo, float alpha) {
        float dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
        float vx = (a[0] + b[0]) / 2 - cam.x, vy = (a[1] + b[1]) / 2 - cam.y, vz = (a[2] + b[2]) / 2 - cam.z;
        float sx = dy * vz - dz * vy, sy = dz * vx - dx * vz, sz = dx * vy - dy * vx;
        float len = (float) Math.sqrt(sx * sx + sy * sy + sz * sz), dl = (float) Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (len < 1e-6f || dl < 1e-6f) return;
        sx /= len; sy /= len; sz /= len;
        float e = core / 2, ex = dx / dl * e, ey = dy / dl * e, ez = dz / dl * e;
        float ax = a[0] - ex, ay = a[1] - ey, az = a[2] - ez, bx = b[0] + ex, by = b[1] + ey, bz = b[2] + ez;
        float half = Math.max(outer / 2, core * 1.3f);
        float[] off = {-half, -core * 1.15f, -core / 2, core / 2, core * 1.15f, half};
        float[][] cs = {halo, halo, white, white, halo, halo};
        float[] as = {0f, 0.4f, 1f, 1f, 0.4f, 0f};
        for (int i = 0; i < 5; i++) {
            float o0 = off[i], o1 = off[i + 1];
            col(p, vc, wv, ax + sx * o0, ay + sy * o0, az + sz * o0, cs[i], as[i] * alpha);
            col(p, vc, wv, bx + sx * o0, by + sy * o0, bz + sz * o0, cs[i], as[i] * alpha);
            col(p, vc, wv, bx + sx * o1, by + sy * o1, bz + sz * o1, cs[i + 1], as[i + 1] * alpha);
            col(p, vc, wv, ax + sx * o1, ay + sy * o1, az + sz * o1, cs[i + 1], as[i + 1] * alpha);
        }
    }

    /** Camera-facing flat strip from a to b. */
    private static void line(PoseStack.Pose p, VertexConsumer vc, Warp wv, Vector3f cam, float[] a, float[] b, float width, float[] c, float alpha) {
        float dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
        float vx = (a[0] + b[0]) / 2 - cam.x, vy = (a[1] + b[1]) / 2 - cam.y, vz = (a[2] + b[2]) / 2 - cam.z;
        float sx = dy * vz - dz * vy, sy = dz * vx - dx * vz, sz = dx * vy - dy * vx;
        float len = (float) Math.sqrt(sx * sx + sy * sy + sz * sz);
        if (len < 1e-6f) return;
        float k = width / 2 / len;
        sx *= k; sy *= k; sz *= k;
        float dl = (float) Math.sqrt(dx * dx + dy * dy + dz * dz);
        float ex = dl > 1e-6f ? dx / dl * width / 2 : 0, ey = dl > 1e-6f ? dy / dl * width / 2 : 0, ez = dl > 1e-6f ? dz / dl * width / 2 : 0;
        float ax = a[0] - ex, ay = a[1] - ey, az = a[2] - ez, bx = b[0] + ex, by = b[1] + ey, bz = b[2] + ez;
        col(p, vc, wv, ax - sx, ay - sy, az - sz, c, alpha); col(p, vc, wv, bx - sx, by - sy, bz - sz, c, alpha);
        col(p, vc, wv, bx + sx, by + sy, bz + sz, c, alpha); col(p, vc, wv, ax + sx, ay + sy, az + sz, c, alpha);
    }

    // ------------------------------------------------------------------ small helpers

    private static float clamp(float v, float lo, float hi) { return Math.max(lo, Math.min(hi, v)); }
    private static float[] c(float r, float g, float b) { return new float[]{r, g, b}; }
    static float[] rgb(int c) { return new float[]{(c >> 16 & 255) / 255f, (c >> 8 & 255) / 255f, (c & 255) / 255f}; }
    private static float[] mix(float[] a, float[] b, float t) {
        return new float[]{a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t};
    }
}
