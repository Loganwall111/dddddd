package dev.logan.entersift.client;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.logan.entersift.RiftPortalEntity;
import dev.logan.entersift.RiftType;
import dev.logan.entersift.SiftContent;
import dev.logan.entersift.SiftTimeState;
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
        float w, h, age, rawAge, yaw, time;
        long seed;
        double ex, ey, ez;
        boolean inSift, night;
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
        s.rawAge = e.age() + partial;
        // Phase F (Closing): during the final 100 ticks before MAX_TICKS (6000), reverse the sequence cleanly.
        float closeRem = RiftPortalEntity.MAX_TICKS - s.rawAge;
        if (closeRem < 100f && s.rawAge > GROWN) {
            s.age = Math.max(0f, closeRem);
        } else {
            s.age = e.age() >= GROWN ? GROWN + 100f : s.rawAge;
        }
        s.time = (float) ((System.nanoTime() / 1.0e9) % 3600.0);
        s.yaw = e.getYRot();
        s.seed = e.blockPosition().asLong() * 31 + s.type.id;
        s.ex = e.getX(); s.ey = e.getY(); s.ez = e.getZ();
        var level = net.minecraft.client.Minecraft.getInstance().level;
        s.inSift = level != null && level.dimension().identifier().equals(THE_SIFT);
        long day = level == null ? 0L : level.getOverworldClockTime() % 24000L;
        s.night = (day >= 11500L && day <= 23300L) || SiftTimeState.currentParameters().isThriveDominant(); // evening through midnight or THRIVE
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
        new Look(c(1f, 1f, 1f), c(1f, 0.55f, 0.80f), c(1f, 0.98f, 0.97f), c(1f, 0.80f, 0.86f)),         // 3 sift: pink
        new Look(c(0.9f, 1f, 1f), c(0.35f, 0.95f, 1f), c(0.90f, 1f, 1f), c(0.45f, 0.80f, 0.90f)),        // 4 portal: cyan
        new Look(c(1f, 0.97f, 0.55f), c(1f, 0.88f, 0.20f), c(1f, 0.96f, 0.75f), c(0.90f, 0.78f, 0.30f)),  // 5 gold
    };

    /** Night curtain colours: electric blue, pale cyan, deep magenta, purple. */
    static final float[][] CURTAIN = {rgb(0x2F6BFF), rgb(0x9FF6FF), rgb(0xD13CFF), rgb(0x7A3CFF)};

    // ------------------------------------------------------------------ slow wave (crack-free)

    /**
     * The rift's slow sway. A smooth function of position only, so every shared corner moves identically.
     * Amplitude grows toward the bottom of the cluster ("the bottoms are wavy"); periods are 10-15 s.
     */
    static final class Warp {
        static final Warp STILL = new Warp(0f, 0f, 1f, false);
        final float t, base, h;
        final boolean on;
        Warp(float t, float base, float h, boolean on) { this.t = t; this.base = base; this.h = h; this.on = on; }
        float amp(float y) {
            if (!on) return 0f;
            float low = Math.max(0f, Math.min(1f, 1f - (y - base) / h));
            return 0.035f + 0.11f * low * low;
        }
        float dx(float x, float y, float z) { return amp(y) * (float) Math.sin(t * 0.55f + y * 0.8f + z * 0.5f); }
        float dy(float x, float y, float z) { return amp(y) * 0.35f * (float) Math.sin(t * 0.42f + x * 0.9f); }
        float dz(float x, float y, float z) { return amp(y) * 0.8f * (float) Math.sin(t * 0.47f + x * 0.7f + y * 0.4f); }
    }

    /** Coloured vertex (walls, rims, glow). */
    private static void col(PoseStack.Pose p, VertexConsumer vc, Warp wv, float x, float y, float z, float[] c, float a) {
        if (!SiftBudget.take(vc)) return;
        float wx = x + wv.dx(x, y, z), wy = y + wv.dy(x, y, z), wz = z + wv.dz(x, y, z);
        if (!Float.isFinite(wx + wy + wz)) { wx = 0f; wy = 0f; wz = 0f; a = 0f; }
        vc.addVertex(p, wx, wy, wz).setColor(Math.min(1f, c[0]), Math.min(1f, c[1]), Math.min(1f, c[2]), Math.max(0f, Math.min(1f, a)));
    }

    /** Window vertex: colour carries (face u, face v, view code, colorReveal). The shader samples by view direction. */
    private static void win(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, float x, float y, float z, float code) {
        win(p, vc, wv, sh, x, y, z, code, 1f);
    }

    private static void win(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, float x, float y, float z, float code, float colorReveal) {
        if (!SiftBudget.take(vc)) return;
        float span = Math.max(sh.w, sh.h) * 1.15f;
        float u = clamp(0.5f + x / span, 0f, 1f), v = clamp(0.5f + (y - sh.cy()) / span, 0f, 1f);
        float wx = x + wv.dx(x, y, z), wy = y + wv.dy(x, y, z), wz = z + wv.dz(x, y, z);
        if (!Float.isFinite(wx + wy + wz)) { wx = 0f; wy = 0f; wz = 0f; }
        vc.addVertex(p, wx, wy, wz).setColor(u, v, code, clamp(colorReveal, 0.04f, 1f));
    }

    /** Phase D Color Reveal factor in [0.05, 1.0]: 0.05 = Phase C White Ignition, 1.0 = Phase E full Color Reveal. */
    private static float colorRevealForAge(float age) {
        if (age < CLUSTER_START) return 0.05f;
        float t = clamp((age - CLUSTER_START) / (GROWN - CLUSTER_START), 0f, 1f);
        return 0.05f + 0.95f * (t * t * (3f - 2f * t));
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
        SiftTimeState.Parameters params = SiftTimeState.currentParameters();
        float age = s.age;
        Warp wv = new Warp(s.time, RiftShape.BASE, sh.h, true);
        Warp still = Warp.STILL;
        float code = (s.view + (s.night ? 8 : 0) + 0.5f) / 16f;
        pose.pushPose();
        try {
            pose.rotate(new Quaternionf().rotationY((float) Math.toRadians(-s.yaw)));
            // Layer 1, 2 & 4: Distant atmospheric fade, Back distortion / opening depth field,
            // and Wavy dark outer "soul face" bands (translucent charcoal on SKY_BLEND)
            if (age > 0.5f) {
                float a = age;
                out.submitCustomGeometry(pose, SiftRenderTypes.SKY_BLEND, (p, vc) -> {
                    backDistortionField(p, vc, wv, sh, look, s, a, params);
                    if (a >= SEED_START) {
                        wavyOuterSoulBands(p, vc, wv, sh, s, a, params);
                    }
                });
            }
            if (age < RIPPLE_END + 6 && age < GROWN) {
                float a = age;
                out.submitCustomGeometry(pose, glowT, (p, vc) -> { ripple(p, vc, still, sh, look, a); spark(p, vc, still, sh, s, cam, look, a); });
            }
            if (age >= SEED_START && age < appearAt(1) + 8) {
                float a = age;
                out.submitCustomGeometry(pose, glowT, (p, vc) -> {
                    seedBox(p, vc, still, sh, look, a);
                    seedGlow(p, vc, still, sh, s, cam, look, a);
                    whiteIgnitionCore(p, vc, wv, sh, look, a, params);
                });
            }
            if (age >= CLUSTER_START) {
                float a = age;
                if (gpu) out.submitCustomGeometry(pose, winT, (p, vc) -> windows(p, vc, wv, sh, a, code, s));
                else out.submitCustomGeometry(pose, winT, (p, vc) -> windowsFlat(p, vc, wv, sh, a, s));
                out.submitCustomGeometry(pose, wallT, (p, vc) -> walls(p, vc, wv, sh, look, a, s));
                out.submitCustomGeometry(pose, glowT, (p, vc) -> {
                    rims(p, vc, wv, sh, look, cam, a, s);
                    innerCoreLuminance(p, vc, wv, sh, look, a, s, params);
                });
                out.submitCustomGeometry(pose, wallT, (p, vc) -> frame(p, vc, wv, sh, look, a));
                if (SiftBudget.riftEffects) out.submitCustomGeometry(pose, glowT, (p, vc) -> {
                    energyCubes(p, vc, sh, s, a);
                    floatingLightSquares(p, vc, wv, sh, s, a, params);
                    volumetricGodRaysAndBloom(p, vc, wv, sh, look, cam, s, a, params);
                });
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

    /** PHASE 1: flat translucent puddle ripple in the wall plane, 0 % -> 100 % over ticks 0-30, gone by 36. */
    private static void ripple(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, Look look, float age) {
        float f = Math.min(1f, age / RIPPLE_END), ease = 1 - (1 - f) * (1 - f);
        float fade = age <= RIPPLE_END ? 1f : Math.max(0f, 1f - (age - RIPPLE_END) / 6f);
        float radius = Math.max(sh.w, sh.h) * 0.62f;
        for (int rn = 0; rn < 3; rn++) {
            float rr = Math.max(0.001f, ease - rn * 0.22f) * radius;
            float a = fade * (rn == 0 ? 0.5f : 0.28f) * (1 - f * 0.5f);
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

    /** PHASE 1 spark: erratic lightning flashing over the ripple (re-aimed every 2 ticks, flickering on and off). */
    private static void spark(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, State s, Vector3f cam, Look look, float age) {
        if (age > RIPPLE_END) return;
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
        halo(p, vc, wv, 0f, sh.cy(), 0.2f, 1.1f * k, look.halo(), 0.35f * k);
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
        float reveal = colorRevealForAge(age);
        for (int i = 0; i < sh.cols; i++) for (int j = 0; j < sh.rows; j++) {
            if (!shown(sh, i, j, age)) continue;
            float tierReveal = clamp((age - appearAt(sh.tier[i][j])) / 16f, 0.05f, 1f) * reveal;
            float x0 = sh.x(i), x1 = sh.x(i + 1), y0 = sh.y(j), y1 = sh.y(j + 1), z = -sh.d(i, j);
            win(p, vc, wv, sh, x0, y0, z, code, tierReveal); win(p, vc, wv, sh, x1, y0, z, code, tierReveal);
            win(p, vc, wv, sh, x1, y1, z, code, tierReveal); win(p, vc, wv, sh, x0, y1, z, code, tierReveal);
        }
        for (float[] b : sh.sats) {
            if (age < satAt(b)) continue;
            win(p, vc, wv, sh, b[0], b[1], b[5], code, reveal); win(p, vc, wv, sh, b[2], b[1], b[5], code, reveal);
            win(p, vc, wv, sh, b[2], b[3], b[5], code, reveal); win(p, vc, wv, sh, b[0], b[3], b[5], code, reveal);
        }
        if (age >= GROWN) for (int k = 0; k < 7; k++) {               // floating hollow cubes show the view too
            float[] c = cube(sh, s, k);
            float q = c[3], z = c[2] - q;
            win(p, vc, wv, sh, c[0] - q, c[1] - q, z, code, reveal); win(p, vc, wv, sh, c[0] + q, c[1] - q, z, code, reveal);
            win(p, vc, wv, sh, c[0] + q, c[1] + q, z, code, reveal); win(p, vc, wv, sh, c[0] - q, c[1] + q, z, code, reveal);
        }
    }

    // ------------------------------------------------------------------ Layer 1, 2, 4, 6, 7, 8, 9 Sift Rift Stack

    /**
     * Layer 1 & Layer 2: Distant atmospheric fade & Back distortion / opening depth field.
     * Renders a soft radial atmospheric depth field behind the Rift opening with chromatic
     * cyan/violet/magenta distortion rings and smooth edge falloff (never a flat black rectangle).
     * Active from Phase A (Dormant) & Phase B (Distortion) through Phase E (Stable) and Phase F (Closing).
     */
    private static void backDistortionField(
        PoseStack.Pose p,
        VertexConsumer vc,
        Warp wv,
        RiftShape sh,
        Look look,
        State s,
        float age,
        SiftTimeState.Parameters params
    ) {
        float phaseScale = age < RIPPLE_END ? clamp(age / RIPPLE_END, 0.08f, 1f) : 1f;
        float rx = sh.w * 0.68f * phaseScale * params.backDistortionStrength();
        float ry = sh.h * 0.72f * phaseScale * params.backDistortionDepth();
        float cy = sh.cy();
        float zBack = -sh.maxDepth - 0.14f;

        int rings = 4;
        int segs = 28;
        for (int ri = 0; ri < rings; ri++) {
            float f0 = (float) ri / rings;
            float f1 = (float) (ri + 1) / rings;
            // Deep atmospheric chromatic depth (abyssal indigo -> cyan/magenta halo -> 0)
            float[] col0 = {
                0.06f + 0.18f * f0 * params.magentaWeight(),
                0.10f + 0.24f * f0 * params.cyanWeight(),
                0.20f + 0.28f * f0
            };
            float[] col1 = {
                0.08f + 0.22f * f1 * look.halo()[0],
                0.14f + 0.28f * f1 * look.halo()[1],
                0.22f + 0.30f * f1 * look.halo()[2]
            };
            float a0 = (1f - f0) * 0.56f * params.backDistortionDepth() * phaseScale;
            float a1 = (ri == rings - 1) ? 0f : (1f - f1) * 0.56f * params.backDistortionDepth() * phaseScale;

            for (int si = 0; si < segs; si++) {
                double t0 = si * Math.PI * 2.0 / segs;
                double t1 = (si + 1) * Math.PI * 2.0 / segs;
                float wob0 = 1f + 0.09f * (float) Math.sin(t0 * 3.0 + s.time * 0.45f) + 0.05f * (float) Math.cos(t0 * 5.0 - s.time * 0.31f);
                float wob1 = 1f + 0.09f * (float) Math.sin(t1 * 3.0 + s.time * 0.45f) + 0.05f * (float) Math.cos(t1 * 5.0 - s.time * 0.31f);

                float x00 = (float) Math.cos(t0) * rx * f0 * wob0;
                float y00 = cy + (float) Math.sin(t0) * ry * f0 * wob0;
                float x10 = (float) Math.cos(t1) * rx * f0 * wob1;
                float y10 = cy + (float) Math.sin(t1) * ry * f0 * wob1;
                float x11 = (float) Math.cos(t1) * rx * f1 * wob1;
                float y11 = cy + (float) Math.sin(t1) * ry * f1 * wob1;
                float x01 = (float) Math.cos(t0) * rx * f1 * wob0;
                float y01 = cy + (float) Math.sin(t0) * ry * f1 * wob0;

                col(p, vc, wv, x00, y00, zBack, col0, a0);
                col(p, vc, wv, x10, y10, zBack, col0, a0);
                col(p, vc, wv, x11, y11, zBack, col1, a1);
                col(p, vc, wv, x01, y01, zBack, col1, a1);
            }
        }
    }

    /**
     * Layer 4: Wavy Dark Outer Bands ("Soul Face" Silhouettes) framing the Rift.
     * Slow-moving, soft-edged, translucent charcoal/near-black wavy bands driven by
     * layered low-frequency sine/cosine deformation around the Rift aperture.
     */
    private static void wavyOuterSoulBands(
        PoseStack.Pose p,
        VertexConsumer vc,
        Warp wv,
        RiftShape sh,
        State s,
        float age,
        SiftTimeState.Parameters params
    ) {
        float reveal = clamp((age - SEED_START) / (GROWN - SEED_START), 0f, 1f);
        float peakAlpha = clamp(0.72f * params.darkBandOpacity() * reveal, 0f, 0.88f);
        if (peakAlpha <= 0.01f) return;

        float[] charcoal = {0.045f, 0.055f, 0.095f};
        float[] charcoalEdge = {0.08f, 0.11f, 0.18f};
        int vSteps = 22;
        float yBot = RiftShape.BASE - 0.35f;
        float yTop = RiftShape.BASE + sh.h + 0.35f;

        for (int side = -1; side <= 1; side += 2) {
            for (int vi = 0; vi < vSteps; vi++) {
                float v0 = (float) vi / vSteps;
                float v1 = (float) (vi + 1) / vSteps;
                float y0 = yBot + (yTop - yBot) * v0;
                float y1 = yBot + (yTop - yBot) * v1;

                float taper0 = (float) Math.sin(v0 * Math.PI);
                float taper1 = (float) Math.sin(v1 * Math.PI);

                // Layered low-frequency sine/cosine deformation ("soul face" curves and hollows)
                float wave0 = (float) (
                    0.22 * Math.sin(v0 * Math.PI * 2.0 + s.time * 0.36 + side * 0.8)
                    + 0.14 * Math.cos(v0 * Math.PI * 3.0 - s.time * 0.24 + side * 1.7)
                );
                float wave1 = (float) (
                    0.22 * Math.sin(v1 * Math.PI * 2.0 + s.time * 0.36 + side * 0.8)
                    + 0.14 * Math.cos(v1 * Math.PI * 3.0 - s.time * 0.24 + side * 1.7)
                );

                float baseSpan0 = (sh.w * 0.46f * (0.42f + 0.58f * taper0)) + wave0;
                float baseSpan1 = (sh.w * 0.46f * (0.42f + 0.58f * taper1)) + wave1;

                float bandThick0 = (0.35f + 0.55f * taper0) * (0.75f + 0.25f * (float) Math.sin(v0 * 5.0f + s.time * 0.28f));
                float bandThick1 = (0.35f + 0.55f * taper1) * (0.75f + 0.25f * (float) Math.sin(v1 * 5.0f + s.time * 0.28f));

                float innerX0 = side * baseSpan0;
                float innerX1 = side * baseSpan1;
                float midX0 = innerX0 + side * bandThick0 * 0.45f;
                float midX1 = innerX1 + side * bandThick1 * 0.45f;
                float outerX0 = innerX0 + side * bandThick0;
                float outerX1 = innerX1 + side * bandThick1;

                float a0 = peakAlpha * (0.35f + 0.65f * taper0);
                float a1 = peakAlpha * (0.35f + 0.65f * taper1);
                float zBand = COLLAR + 0.04f;

                // Inner feather -> dark wavy spine
                col(p, vc, wv, innerX0, y0, zBand, charcoalEdge, 0f);
                col(p, vc, wv, midX0, y0, zBand, charcoal, a0);
                col(p, vc, wv, midX1, y1, zBand, charcoal, a1);
                col(p, vc, wv, innerX1, y1, zBand, charcoalEdge, 0f);

                // Dark wavy spine -> outer feather
                col(p, vc, wv, midX0, y0, zBand, charcoal, a0);
                col(p, vc, wv, outerX0, y0, zBand, charcoalEdge, 0f);
                col(p, vc, wv, outerX1, y1, zBand, charcoalEdge, 0f);
                col(p, vc, wv, midX1, y1, zBand, charcoal, a1);
            }
        }
    }

    /**
     * Phase C: White Ignition flare during opening (age 31..75) and Phase F Closing collapse.
     */
    private static void whiteIgnitionCore(
        PoseStack.Pose p,
        VertexConsumer vc,
        Warp wv,
        RiftShape sh,
        Look look,
        float age,
        SiftTimeState.Parameters params
    ) {
        float ig = clamp((age - SEED_START) / (CLUSTER_START - SEED_START), 0f, 1f);
        float fadeOut = 1f - clamp((age - CLUSTER_START) / 18f, 0f, 1f);
        float strength = ig * fadeOut * params.riftGlowIntensity();
        if (strength <= 0.01f) return;

        float[] white = c(1f, 1f, 1f);
        float[] cyanWhite = c(0.82f, 0.99f, 1f);
        float hw = sh.w * (0.12f + 0.26f * ig);
        float hh = sh.h * (0.18f + 0.30f * ig);
        float cy = sh.cy();
        rect(p, vc, wv, -hw * 0.45f, cy - hh, hw * 0.45f, cy + hh, 0.08f, white, clamp(0.92f * strength, 0f, 1f));
        rect(p, vc, wv, -hw, cy - hh * 0.85f, hw, cy + hh * 0.85f, 0.04f, cyanWhite, clamp(0.48f * strength, 0f, 1f));
    }

    /**
     * Layer 5 & Layer 6: Colored interior energy veil & Inner high-luminance glow spine.
     */
    private static void innerCoreLuminance(
        PoseStack.Pose p,
        VertexConsumer vc,
        Warp wv,
        RiftShape sh,
        Look look,
        float age,
        State s,
        SiftTimeState.Parameters params
    ) {
        float reveal = colorRevealForAge(age);
        float whiteIgnition = (1f - reveal) * clamp((age - CLUSTER_START + 10f) / 15f, 0f, 1f);
        float glowMul = params.riftGlowIntensity();
        float[] white = c(1f, 1f, 1f);
        float[] cyan = rgb(0x3FF3FF);
        float[] magenta = rgb(0xFFB8E0);
        float[] mint = rgb(0xA8F5C8);

        int steps = 16;
        float yBot = RiftShape.BASE + 0.15f;
        float yTop = RiftShape.BASE + sh.h - 0.15f;
        for (int i = 0; i < steps; i++) {
            float v0 = (float) i / steps;
            float v1 = (float) (i + 1) / steps;
            float y0 = yBot + (yTop - yBot) * v0;
            float y1 = yBot + (yTop - yBot) * v1;
            float env0 = (float) Math.sin(v0 * Math.PI);
            float env1 = (float) Math.sin(v1 * Math.PI);

            float sway0 = 0.14f * (float) Math.sin(v0 * 5.0f + s.time * 0.48f);
            float sway1 = 0.14f * (float) Math.sin(v1 * 5.0f + s.time * 0.48f);
            float spineW0 = sh.w * 0.11f * env0;
            float spineW1 = sh.w * 0.11f * env1;

            float[] c0 = mix(white, mix(cyan, Look.class.isInstance(look) ? look.core() : mint, 0.4f), reveal);
            float[] c1 = mix(white, mix(magenta, mint, 0.5f + 0.5f * (float) Math.sin(v1 * 4f + s.time * 0.3f)), reveal);

            float a0 = clamp((0.26f * glowMul + 0.55f * whiteIgnition) * env0, 0f, 0.92f);
            float a1 = clamp((0.26f * glowMul + 0.55f * whiteIgnition) * env1, 0f, 0.92f);
            float zSpine = -sh.maxDepth * 0.35f;

            col(p, vc, wv, sway0 - spineW0, y0, zSpine, c1, a0 * 0.25f);
            col(p, vc, wv, sway0, y0, zSpine, c0, a0);
            col(p, vc, wv, sway1, y1, zSpine, c0, a1);
            col(p, vc, wv, sway1 - spineW1, y1, zSpine, c1, a1 * 0.25f);

            col(p, vc, wv, sway0, y0, zSpine, c0, a0);
            col(p, vc, wv, sway0 + spineW0, y0, zSpine, c1, a0 * 0.25f);
            col(p, vc, wv, sway1 + spineW1, y1, zSpine, c1, a1 * 0.25f);
            col(p, vc, wv, sway1, y1, zSpine, c0, a1);
        }
    }

    /**
     * Layer 7: 18 deterministic, soft-edged, semi-translucent luminous floating light squares
     * of varied small, medium, and larger sizes drifting in 3D depth around and through the Rift.
     */
    private static void floatingLightSquares(
        PoseStack.Pose p,
        VertexConsumer vc,
        Warp wv,
        RiftShape sh,
        State s,
        float age,
        SiftTimeState.Parameters params
    ) {
        float ramp = clamp((age - CLUSTER_START) / (GROWN - CLUSTER_START), 0f, 1f);
        float bright = params.floatingSquareBrightness() * ramp;
        if (bright <= 0.01f) return;

        float[][] pal = ENERGY[Math.max(0, Math.min(ENERGY.length - 1, s.type.id))];
        float[] white = c(1f, 1f, 1f);
        int count = 16; // Controlled 8..24 floating light squares

        for (int i = 0; i < count; i++) {
            float h1 = RiftShape.hash(s.seed, i, 201);
            float h2 = RiftShape.hash(s.seed, i, 202);
            float h3 = RiftShape.hash(s.seed, i, 203);
            float h4 = RiftShape.hash(s.seed, i, 204);

            float drift = (h2 + s.time * (0.035f + 0.025f * h3)) % 1f;
            float env = (float) Math.sin(drift * Math.PI);
            if (env < 0.05f) continue;

            float cx = (h1 - 0.5f) * sh.w * 1.08f + 0.12f * (float) Math.sin(s.time * 0.42f + i);
            float cy = RiftShape.BASE + drift * sh.h;
            float cz = mix(-sh.maxDepth * 0.85f, 0.75f, h4) + 0.08f * (float) Math.cos(s.time * 0.35f + i * 1.7f);

            // Varied small, medium, and larger sizes
            float tierSize = (i < 3) ? 0.26f : (i < 9 ? 0.16f : 0.09f);
            float hx = tierSize * (0.85f + 0.30f * h3);
            float hy = tierSize * (0.85f + 0.30f * h4);

            float pulse = 0.72f + 0.28f * (float) Math.sin(s.time * (1.1f + 0.6f * h1) + i * 2.3f);
            float alpha = clamp(0.58f * bright * env * pulse, 0f, 0.92f);

            float[] tint = pal[i % pal.length];
            float[] coreCol = mix(tint, white, 0.48f);

            // Soft outer glow margin (soft-edged square)
            float feather = 1.65f;
            rect(p, vc, wv, cx - hx * feather, cy - hy * feather, cx + hx * feather, cy + hy * feather, cz, tint, alpha * 0.24f);
            // Semi-translucent luminous square core
            rect(p, vc, wv, cx - hx, cy - hy, cx + hx, cy + hy, cz + 0.005f, coreCol, alpha);
        }
    }

    /**
     * Layer 8 & Layer 9: Soft accumulated volumetric god-ray light shafts and multi-stage Rift bloom.
     * Moderate in FLOW and dramatically amplified in THRIVE.
     */
    private static void volumetricGodRaysAndBloom(
        PoseStack.Pose p,
        VertexConsumer vc,
        Warp wv,
        RiftShape sh,
        Look look,
        Vector3f cam,
        State s,
        float age,
        SiftTimeState.Parameters params
    ) {
        float ramp = clamp((age - CLUSTER_START) / (GROWN - CLUSTER_START), 0f, 1f);
        float rayIntensity = params.godRayIntensity() * ramp;
        float bloomStrength = params.riftBloomStrength() * ramp;
        if (rayIntensity <= 0.01f && bloomStrength <= 0.01f) return;

        float cy = sh.cy();
        float[] coreCol = mix(look.halo(), c(1f, 1f, 1f), 0.35f);

        // Layer 8: 16 soft overlapping accumulated volumetric light shafts radiating from the Rift
        int rayCount = params.isThriveDominant() ? 20 : 14;
        for (int i = 0; i < rayCount; i++) {
            float h1 = RiftShape.hash(s.seed, i, 301);
            float h2 = RiftShape.hash(s.seed, i, 302);
            double ang = (i / (double) rayCount) * Math.PI * 2.0 + 0.08 * Math.sin(s.time * 0.22 + i);
            float reach = Math.max(sh.w, sh.h) * (0.72f + 0.55f * h1) * (params.isThriveDominant() ? 1.32f : 1.0f);
            float spread = (0.38f + 0.42f * h2) * (params.isThriveDominant() ? 1.2f : 1.0f);

            float dx = (float) Math.cos(ang);
            float dy = (float) Math.sin(ang);
            float px = -dy * spread;
            float py = dx * spread;

            float shimmer = 0.74f + 0.26f * (float) Math.sin(s.time * (0.35f + 0.2f * h1) + i * 1.9f);
            float a = clamp(0.085f * rayIntensity * shimmer, 0f, 0.38f);
            float[] rayCol = CURTAIN[i % CURTAIN.length];
            float[] tipCol = mix(rayCol, look.halo(), 0.5f);
            float zRay = -sh.maxDepth * 0.25f;

            // Soft feathered shaft quad (core -> outer tip)
            col(p, vc, wv, -px * 0.25f, cy - py * 0.25f, zRay, coreCol, a);
            col(p, vc, wv, px * 0.25f, cy + py * 0.25f, zRay, coreCol, a);
            col(p, vc, wv, dx * reach + px, cy + dy * reach + py, zRay + 0.15f, tipCol, 0f);
            col(p, vc, wv, dx * reach - px, cy + dy * reach - py, zRay + 0.15f, tipCol, 0f);
        }

        // Layer 9: Soft radial bloom envelope around the Rift core & aperture
        halo(p, vc, wv, 0f, cy, -sh.maxDepth * 0.2f, Math.max(sh.w, sh.h) * 0.78f, look.halo(), clamp(0.16f * bloomStrength, 0f, 0.42f));
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
            if (zl <= 0) rim(p, vc, wv, cam, x0, y0, x0, y1, lip(zl), -d, core, halo, zl < 0, flash, jit);
            if (zr <= 0) rim(p, vc, wv, cam, x1, y0, x1, y1, lip(zr), -d, core, halo, zr < 0, flash, jit);
            if (zd <= 0) rim(p, vc, wv, cam, x0, y0, x1, y0, lip(zd), -d, core, halo, zd < 0, flash, jit);
            if (zu <= 0) rim(p, vc, wv, cam, x0, y1, x1, y1, lip(zu), -d, core, halo, zu < 0, flash, jit);
        }
        for (float[] q : sh.sats) {
            if (age < satAt(q)) continue;
            float flash = Math.max(0f, 1f - (age - satAt(q)) / 6f);
            int m = (int) q[7];
            if ((m & 1) == 0) rim(p, vc, wv, cam, q[0], q[1], q[0], q[3], q[4], q[5], core, halo, false, flash, jit);
            if ((m & 2) == 0) rim(p, vc, wv, cam, q[2], q[1], q[2], q[3], q[4], q[5], core, halo, false, flash, jit);
            if ((m & 4) == 0) rim(p, vc, wv, cam, q[0], q[1], q[2], q[1], q[4], q[5], core, halo, false, flash, jit);
            if ((m & 8) == 0) rim(p, vc, wv, cam, q[0], q[3], q[2], q[3], q[4], q[5], core, halo, false, flash, jit);
            float[][] corners = {{q[0], q[1], m & 5}, {q[2], q[1], m & 6}, {q[0], q[3], m & 9}, {q[2], q[3], m & 10}};
            for (float[] cr : corners)
                if (cr[2] == 0) line(p, vc, wv, cam, new float[]{cr[0], cr[1], q[4]}, new float[]{cr[0], cr[1], q[5]}, 0.05f, core, 0.8f);
        }
    }

    /** Front neon rim at {@code zf} (full or lip) and a faint line where the wall meets the window at {@code zb}. */
    private static void rim(PoseStack.Pose p, VertexConsumer vc, Warp wv, Vector3f cam, float xa, float ya, float xb, float yb, float zf, float zb,
                            float[] core, float[] halo, boolean lip, float flash, float[] jit) {
        float k = lip ? 0.75f : 1f, a = lip ? 0.85f : 1f;
        float[] fa = {xa, ya, zf + 0.006f}, fb = {xb, yb, zf + 0.006f};
        band(p, vc, wv, cam, fa, fb, (0.065f + 0.05f * flash) * k, (0.32f + 0.15f * flash) * k, core, halo, a);
        line(p, vc, wv, cam, fa, fb, 0.8f * k, halo, 0.04f);
        line(p, vc, wv, cam, new float[]{xa + jit[0], ya + jit[1], zf + 0.01f}, new float[]{xb + jit[0], yb + jit[1], zf + 0.01f}, 0.04f * k, core, 0.22f);
        line(p, vc, wv, cam, new float[]{xa - jit[1], ya + jit[0], zf + 0.012f}, new float[]{xb - jit[1], yb + jit[0], zf + 0.012f}, 0.04f * k, halo, 0.18f);
        band(p, vc, wv, cam, new float[]{xa, ya, zb + 0.012f}, new float[]{xb, yb, zb + 0.012f}, 0.035f, 0.14f, core, halo, 0.35f);
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
            for (int[] e : edges) line(p, vc, wv, cam, v[e[0]], v[e[1]], 0.045f, core, 0.95f);
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
            if (U) { rect(p, vc, wv, x0, y1, x1, y1 + F, C, face, 1f);
                wall(p, vc, wv, x0 - (L ? F : 0), y1 + F, x1 + (R ? F : 0), y1 + F, C, 0f, side, side, 1f); }
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
            float x = (RiftShape.hash(g, k, 1) - 0.5f) * sh.w * 0.85f + (RiftShape.hash(g, k, 4) - 0.5f) * 0.5f * secs;
            float y = sh.cy() + (RiftShape.hash(g, k, 2) - 0.5f) * sh.h * 0.8f + (0.15f + 0.35f * RiftShape.hash(g, k, 5)) * secs;
            float z = -0.4f * RiftShape.hash(g, k, 3) + (0.45f + 0.7f * RiftShape.hash(g, k, 6)) * secs;
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
    private static float mix(float a, float b, float t) { return a + (b - a) * t; }
    private static float[] mix(float[] a, float[] b, float t) {
        return new float[]{a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t};
    }
}
