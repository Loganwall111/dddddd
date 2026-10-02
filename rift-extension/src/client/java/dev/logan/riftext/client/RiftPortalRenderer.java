package dev.logan.riftext.client;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.logan.riftext.RiftExtensionClient;
import dev.logan.riftext.RiftPortalEntity;
import dev.logan.riftext.RiftType;
import dev.logan.riftext.RiftContent;
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
 * Trailer-accurate rift renderer for the Rift Extension mod.
 *
 * <p>Matches the Dungeons II trailer frames with:</p>
 * <ul>
 *   <li>A voxel puzzle cluster of hollow boxes recessed to different depths ({@link RiftShape}), with
 *       near-white inner walls tinted by the destination, and thin white neon rims with a soft halo.</li>
 *   <li>TRUE WINDOW interior: every back face samples the destination's sky by world-space view direction.</li>
 *   <li>Slow WAVE: the whole rift sways as one continuous surface, strongest along the bottom.</li>
 * </ul>
 *
 * <p>Growth timeline (server-synced entity age, 20 ticks = 1 s):</p>
 * <ul>
 *   <li>0-30    RIPPLE + SPARK: flat translucent ripple with erratic lightning</li>
 *   <li>31-60   INCUBATION SEED: tiny central box, glow pulsing rapidly</li>
 *   <li>61-100  CLUSTER FRACTURE: one ring of boxes every 10 ticks</li>
 *   <li>100+    STABLE: dissolving voxel energy cubes, floating hollow cubes, rim shimmer</li>
 * </ul>
 *
 * <p><b>Trailer accuracy improvements:</b> deeper alcove collar, wider flange frame, more pronounced
 * energy cube disintegration, tighter rim glow matching trailer neon look.</p>
 */
public final class RiftPortalRenderer extends EntityRenderer<RiftPortalEntity, RiftPortalRenderer.State> {
    static final Identifier THE_SIFT = RiftContent.id("the_sift");
    static final float RIPPLE_END = 30, SEED_START = 31, CLUSTER_START = 61, GROWN = 100;
    /** Trailer-accurate recessed alcove: the outer lip stands COLLAR in front of the wall plane with a FLANGE-wide frame face. */
    static final float COLLAR = 0.42f, FLANGE = 0.22f;
    private static final Map<Long, RiftShape> SHAPES = new LinkedHashMap<>(32, 0.75f, true) {
        @Override protected boolean removeEldestEntry(Map.Entry<Long, RiftShape> eldest) { return size() > 48; }
    };

    public RiftPortalRenderer(EntityRendererProvider.Context context) { super(context); }

    public static final class State extends EntityRenderState {
        RiftType type = RiftType.SIFT;
        float w, h, age, yaw, time;
        long seed;
        double ex, ey, ez;
        boolean inSift, night, noonOrNight;
        int view;
    }

    @Override public State createRenderState() { return new State(); }

    @Override
    public void extractRenderState(RiftPortalEntity e, State s, float partial) {
        super.extractRenderState(e, s, partial);
        s.type = e.riftType();
        s.w = Float.isFinite(e.riftWidth()) ? Math.max(1.5f, Math.min(12f, e.riftWidth())) : 3f;
        s.h = Float.isFinite(e.riftHeight()) ? Math.max(1.5f, Math.min(12f, e.riftHeight())) : 4f;
        s.age = e.age() >= GROWN ? GROWN + 100f : e.age() + partial;
        s.time = (float) ((System.nanoTime() / 1.0e9) % 3600.0);
        s.yaw = e.getYRot();
        s.seed = e.blockPosition().asLong() * 31 + s.type.id;
        s.ex = e.getX(); s.ey = e.getY(); s.ez = e.getZ();
        var level = net.minecraft.client.Minecraft.getInstance().level;
        s.inSift = level != null && level.dimension().identifier().equals(THE_SIFT);
        long day = level == null ? 0L : level.getOverworldClockTime() % 24000L;
        s.night = day >= 11500L && day <= 23300L;
        s.noonOrNight = s.night || (day >= 5000L && day <= 8000L);  // noon window + night
        s.view = viewCode(s.type, s.inSift);
    }

    @Override
    protected AABB getBoundingBoxForCulling(RiftPortalEntity e, float partial) {
        float r = Math.max(e.riftWidth(), e.riftHeight()) + 8f;
        return e.getBoundingBox().inflate(r, r * 2f, r);
    }

    static int viewCode(RiftType type, boolean inSift) {
        if (inSift && (type == RiftType.SIFT || type == RiftType.OVERWORLD)) return 5;
        return type.id;
    }

    /** Per-destination colours: rim core, rim halo, wall at the lip, wall at the back (trailer frames). */
    private record Look(float[] core, float[] halo, float[] wallFront, float[] wallBack) {}

    private static final Look[] LOOKS = {
        new Look(c(1f, 0.98f, 0.95f), c(1f, 0.62f, 0.50f), c(1f, 0.97f, 0.93f), c(1f, 0.78f, 0.66f)),
        new Look(c(1f, 0.96f, 0.85f), c(1f, 0.45f, 0.25f), c(1f, 0.92f, 0.85f), c(0.95f, 0.55f, 0.45f)),
        new Look(c(0.96f, 1f, 0.86f), c(0.75f, 0.95f, 0.60f), c(1f, 0.82f, 0.93f), c(0.82f, 0.44f, 0.68f)),
        new Look(c(1f, 1f, 1f), c(1f, 0.55f, 0.80f), c(1f, 0.98f, 0.97f), c(1f, 0.80f, 0.86f)),
        new Look(c(0.9f, 1f, 1f), c(0.35f, 0.95f, 1f), c(0.90f, 1f, 1f), c(0.45f, 0.80f, 0.90f)),
        new Look(c(1f, 0.97f, 0.55f), c(1f, 0.88f, 0.20f), c(1f, 0.96f, 0.75f), c(0.90f, 0.78f, 0.30f)),
    };

    static final float[][] CURTAIN = {rgb(0x2F6BFF), rgb(0x9FF6FF), rgb(0xD13CFF), rgb(0x7A3CFF)};

    // ------------------------------------------------------------------ WAVY borders (crack-free, multi-harmonic)

    /**
     * Dramatic wavy rift borders. Multiple harmonic frequencies create an organic, rippling
     * energy-tear look — like the rift edge is alive and undulating. Amplitude is strongest
     * at the bottom (gravity-anchored energy) and at the edges (border glow). Every shared
     * corner moves identically so geometry can never crack.
     */
    static final class Warp {
        static final Warp STILL = new Warp(0f, 0f, 1f, false);
        final float t, base, h;
        final boolean on;
        Warp(float t, float base, float h, boolean on) { this.t = t; this.base = base; this.h = h; this.on = on; }

        /** Wave amplitude — strongest at bottom, moderate at top, with an edge-boost term. */
        float amp(float y) {
            if (!on) return 0f;
            // Vertical falloff: bottom is waviest
            float low = Math.max(0f, Math.min(1f, 1f - (y - base) / h));
            return 0.06f + 0.18f * low * low;
        }

        /** Extra amplitude boost near edges of the rift (where the border glow is). */
        float edgeBoost(float x, float y, float z, float hw, float hh, float cy) {
            float xu = Math.max(0f, Math.abs(x) / hw - 0.4f);  // kicks in past 40% from centre
            float yu = Math.max(0f, (Math.abs(y - cy) / hh) - 0.3f);
            return 1f + 2.5f * Math.max(xu, yu);
        }

        float dx(float x, float y, float z) {
            float a = amp(y);
            // Primary slow sway + faster secondary ripple + very fast micro-shimmer
            return a * (
                0.6f  * (float) Math.sin(t * 0.55f + y * 0.8f + z * 0.5f)       // primary
              + 0.3f  * (float) Math.sin(t * 1.3f  + y * 1.6f + x * 0.4f)       // secondary (2.4x faster)
              + 0.1f  * (float) Math.sin(t * 3.1f  + z * 2.2f + y * 1.1f)       // shimmer (5.6x faster)
            );
        }
        float dy(float x, float y, float z) {
            float a = amp(y);
            return a * (
                0.35f * (float) Math.sin(t * 0.42f + x * 0.9f)                   // primary
              + 0.25f * (float) Math.sin(t * 1.1f  + z * 1.3f + y * 0.6f)       // secondary
              + 0.08f * (float) Math.sin(t * 2.8f  + x * 1.8f)                   // shimmer
            );
        }
        float dz(float x, float y, float z) {
            float a = amp(y);
            return a * (
                0.8f  * (float) Math.sin(t * 0.47f + x * 0.7f + y * 0.4f)       // primary (deepest)
              + 0.35f * (float) Math.sin(t * 1.2f  + y * 1.1f + z * 0.5f)       // secondary
              + 0.12f * (float) Math.sin(t * 2.6f  + x * 1.5f + z * 0.9f)       // shimmer
            );
        }
    }

    private static void col(PoseStack.Pose p, VertexConsumer vc, Warp wv, float x, float y, float z, float[] c, float a) {
        if (!SiftBudget.take(vc)) return;
        float wx = x + wv.dx(x, y, z), wy = y + wv.dy(x, y, z), wz = z + wv.dz(x, y, z);
        if (!Float.isFinite(wx + wy + wz)) { wx = 0f; wy = 0f; wz = 0f; a = 0f; }
        vc.addVertex(p, wx, wy, wz).setColor(Math.min(1f, c[0]), Math.min(1f, c[1]), Math.min(1f, c[2]), Math.max(0f, Math.min(1f, a)));
    }

    private static void win(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, float x, float y, float z, float code) {
        if (!SiftBudget.take(vc)) return;
        float span = Math.max(sh.w, sh.h) * 1.15f;
        float u = clamp(0.5f + x / span, 0f, 1f), v = clamp(0.5f + (y - sh.cy()) / span, 0f, 1f);
        float wx = x + wv.dx(x, y, z), wy = y + wv.dy(x, y, z), wz = z + wv.dz(x, y, z);
        if (!Float.isFinite(wx + wy + wz)) { wx = 0f; wy = 0f; wz = 0f; }
        vc.addVertex(p, wx, wy, wz).setColor(u, v, code, 1f);
    }

    // ------------------------------------------------------------------ submit — TRAILER GROWTH CYCLE

    /**
     * Trailer-accurate 6-phase growth cycle:
     *   0-20   REALITY TEAR: spatial distortion ripple, erratic lightning ripping reality open
     *   20-50  TWISTING GROWTH: rift grows with lightning twisting it, shapes flickering
     *   50-62  SHOCKWAVE: big white bands flash outward like a thunderclap
     *   62-82  WHITE CONSTRUCTION: rift appears completely white, building itself piece by piece
     *   82-100 COLOR REVEAL: white fades to actual destination colors
     *   100+   STABLE: full rift with all effects
     */
    @Override
    public void submit(State s, PoseStack pose, SubmitNodeCollector out, CameraRenderState camera) {
        if (SiftRenderTypes.irisShadowPass()) return;
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
        Warp wv = new Warp(s.time, RiftShape.BASE, sh.h, true);
        Warp still = Warp.STILL;
        float code = (s.view + (s.night ? 8 : 0) + 0.5f) / 16f;
        pose.pushPose();
        try {
            pose.rotate(new Quaternionf().rotationY((float) Math.toRadians(-s.yaw)));

            // PHASE 1: REALITY TEAR (0-20) — spatial distortion + erratic lightning
            if (age <= TEAR_END + 6 && age < GROWN) {
                float a = age;
                out.submitCustomGeometry(pose, glowT, (p, vc) -> {
                    realityTear(p, vc, still, sh, look, a);
                    tearLightning(p, vc, still, sh, s, cam, look, a);
                });
            }

            // PHASE 2: TWISTING GROWTH (20-50) — growing with lightning twisting it into shape
            if (age >= GROW_START && age < GROW_END + 6) {
                float a = age;
                out.submitCustomGeometry(pose, glowT, (p, vc) -> twistingGrowth(p, vc, still, sh, look, s, cam, a));
            }

            // PHASE 3: SHOCKWAVE (50-62) — big white bands flashing outward
            if (age >= SHOCK_START && age < SHOCK_END + 8) {
                float a = age;
                out.submitCustomGeometry(pose, glowT, (p, vc) -> shockwave(p, vc, still, sh, look, s, cam, a));
            }

            // PHASE 4: WHITE CONSTRUCTION (62-82) — rift appears white, building itself
            if (age >= BUILD_START && age < COLOR_START) {
                float a = age;
                out.submitCustomGeometry(pose, glowT, (p, vc) -> whiteConstruction(p, vc, wv, sh, look, cam, a, s));
            }

            // PHASE 5+6: COLOR REVEAL (82-100) + STABLE (100+) — actual rift
            if (age >= COLOR_START) {
                float a = age;
                // Color reveal: white fades to destination colors
                float colorFade = (age < GROWN) ? clamp((age - COLOR_START) / (GROWN - COLOR_START), 0f, 1f) : 1f;

                if (gpu) {
                    out.submitCustomGeometry(pose, winT, (p, vc) -> windows(p, vc, wv, sh, a, code, s));
                } else {
                    out.submitCustomGeometry(pose, winT, (p, vc) -> windowsFlat(p, vc, wv, sh, a, s));
                }
                out.submitCustomGeometry(pose, wallT, (p, vc) -> wallsColor(p, vc, wv, sh, look, a, s, colorFade));
                out.submitCustomGeometry(pose, glowT, (p, vc) -> rimsColor(p, vc, wv, sh, look, cam, a, s, colorFade));
                out.submitCustomGeometry(pose, wallT, (p, vc) -> frame(p, vc, wv, sh, look, a));
                if (SiftBudget.riftEffects && s.noonOrNight) out.submitCustomGeometry(pose, glowT, (p, vc) -> energyCubes(p, vc, sh, s, a));
                if (age >= GROWN && SiftBudget.riftEffects) out.submitCustomGeometry(pose, glowT, (p, vc) -> stable(p, vc, wv, sh, look, cam, s));
                if (age >= GROWN && s.night && SiftBudget.auraGlow) out.submitCustomGeometry(pose, glowT, (p, vc) -> curtains(p, vc, sh, s, cam));
            }
        } finally {
            pose.popPose();
        }
    }

    // ------------------------------------------------------------------ trailer growth timeline

    static final float TEAR_END = 20f;
    static final float GROW_START = 18f;
    static final float GROW_END = 50f;
    static final float SHOCK_START = 48f;
    static final float SHOCK_END = 62f;
    static final float BUILD_START = 60f;
    static final float COLOR_START = 82f;

    /** Edge fade: rift dissolves into nothing at the edges (trailer's "pulling back into nothing" look). */
    private static float edgeFade(float x, float y, float hw, float hh, float cy, float edgeDist) {
        float xu = Math.abs(x) / hw;
        float yu = Math.abs(y - cy) / hh;
        float dist = Math.max(xu, yu);
        return clamp(1f - (dist - edgeDist) / (1f - edgeDist), 0f, 1f);
    }

    private static float appearAt(int tier) { return COLOR_START + 2f + Math.min(tier, RiftShape.TIERS - 1) * 5f; }
    private static boolean shown(RiftShape sh, int i, int j, float age) { return sh.on(i, j) && age >= appearAt(sh.tier[i][j]); }
    private static float satAt(float[] b) { return appearAt(RiftShape.TIERS - 1) + 2f + b[6] % 3; }

    private static float wallTop(RiftShape sh, int ni, int nj, float d, float age) {
        if (!shown(sh, ni, nj, age)) return 0f;
        float dn = sh.d(ni, nj);
        return dn < d - 1e-4f ? -dn : 1f;
    }

    // ------------------------------------------------------------------ PHASE 1: REALITY TEAR (0-20)

    /**
     * The fabric of reality tears open. A spatial distortion ripple expands from the centre
     * with erratic lightning bolts ripping through the air. The rift hasn't formed yet —
     * just raw energy and distortion where reality is breaking.
     */
    private static void realityTear(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, Look look, float age) {
        float progress = clamp(age / TEAR_END, 0f, 1f);
        float ease = 1f - (1f - progress) * (1f - progress);
        float radius = Math.max(sh.w, sh.h) * 0.65f * ease;

        // Expanding distortion rings — the reality fabric warping
        for (int rn = 0; rn < 4; rn++) {
            float rr = Math.max(0.001f, radius * (1f - rn * 0.18f));
            float a = (0.55f - rn * 0.1f) * (1f - progress * 0.3f);
            // Inner ring is brighter, outer rings fade
            ring(p, vc, wv, 0f, sh.cy(), 0.02f, rr * 0.75f, rr, look.halo(), a * progress);
            ring(p, vc, wv, 0f, sh.cy(), 0.02f, 0f, rr * 0.75f, look.halo(), a * 0.12f * progress);
        }

        // Central energy burst — where the tear begins
        float burstA = (1f - progress) * 0.7f + 0.15f;
        float burstR = 0.4f + progress * 0.6f;
        halo(p, vc, wv, 0f, sh.cy(), 0.1f, burstR, c(1f, 1f, 1f), burstA * progress);

        // Spatial distortion: small erratic energy sparks at the tear point
        for (int k = 0; k < 6; k++) {
            float sparkLife = (RiftShape.hash(0, k, 200) + age * 0.12f) % 1f;
            if (sparkLife > 0.6f) continue;
            float ang = RiftShape.hash(0, k, 201) * (float) Math.PI * 2;
            float r = sparkLife * radius * 0.5f;
            float sx = (float) Math.cos(ang) * r, sy = sh.cy() + (float) Math.sin(ang) * r;
            float sparkA = (1f - sparkLife / 0.6f) * 0.8f * progress;
            line(p, vc, wv, new Vector3f(0, 0, 0), new float[]{sx, sy, 0.08f}, new float[]{sx * 1.2f, sy * 1.2f, 0.1f}, 0.06f, look.core(), sparkA);
        }
    }

    /** Phase 1 lightning: erratic bolts ripping through the air, more violent as tear progresses. */
    private static void tearLightning(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, State s, Vector3f cam, Look look, float age) {
        float progress = clamp(age / TEAR_END, 0f, 1f);
        int burst = (int) (age * 1.5f); // faster re-aim for more erratic feel
        float r = Math.max(sh.w, sh.h) * 0.6f * progress;
        // 3-6 bolts per burst, getting more numerous as tear progresses
        int n = 3 + (int) (progress * 3f);
        for (int b = 0; b < n; b++) {
            if (RiftShape.hash(s.seed, burst * 5 + b, 87) < 0.25f) continue;
            double a0 = RiftShape.hash(s.seed, burst * 5 + b, 87) * Math.PI * 2;
            double a1 = a0 + 1.0 + RiftShape.hash(s.seed, burst * 5 + b, 88) * 3.5;
            float[] from = {(float) Math.cos(a0) * r * 0.15f, sh.cy() + (float) Math.sin(a0) * r * 0.15f, 0.06f};
            float[] to = {(float) Math.cos(a1) * r, sh.cy() + (float) Math.sin(a1) * r, 0.12f};
            bolt(p, vc, wv, cam, from, to, s.seed + burst * 13L + b, look, 0.95f * progress);
        }
    }

    // ------------------------------------------------------------------ PHASE 2: TWISTING GROWTH (20-50)

    /**
     * The rift grows with lightning twisting it into shape. Different shapes flicker in and out
     * as the energy tries to stabilize. The voxel cluster starts appearing piece by piece,
     * each piece violently snapping in with lightning bending around it.
     */
    private static void twistingGrowth(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, Look look, State s, Vector3f cam, float age) {
        float progress = clamp((age - GROW_START) / (GROW_END - GROW_START), 0f, 1f);
        float hw = sh.w / 2f, hh = sh.h / 2f, cy = sh.cy();

        // Growing cluster pieces — each snaps in with a flash
        for (int i = 0; i < sh.cols; i++) for (int j = 0; j < sh.rows; j++) {
            if (!sh.on(i, j)) continue;
            float dist = Math.max(Math.abs((i + 0.5f) / sh.cols * 2f - 1f), Math.abs((j + 0.5f) / sh.rows * 2f - 1f));
            float appear = dist * 0.7f + 0.15f * RiftShape.hash(s.seed, i, j + 97);
            if (progress < appear) continue;

            float cellAge = clamp((progress - appear) / 0.15f, 0f, 1f);
            float x0 = sh.x(i), x1 = sh.x(i + 1), y0 = sh.y(j), y1 = sh.y(j + 1), z = -sh.d(i, j);

            // Edge fade — cells at the edge dissolve into nothing
            float cx = (x0 + x1) / 2f, cy2 = (y0 + y1) / 2f;
            float ef = edgeFade(cx, cy2, hw, hh, cy, 0.7f);

            // Lightning-twisted white flash on appearance
            float flash = Math.max(0f, 1f - (progress - appear) / 0.08f) * cellAge;
            float alpha = cellAge * ef;

            if (alpha < 0.01f) continue;

            // White construction color
            float[] white = {1f, 1f, 1f};
            float[] haloC = look.halo();

            // The cell glows white as it forms, with halo edges
            rect(p, vc, wv, x0, y0, x1, y1, z + 0.02f, white, alpha * (0.6f + flash * 0.4f));

            // Neon rim on each visible edge
            if (!sh.on(i - 1, j) || progress < appearAt(sh.tier[Math.max(0, i - 1)][j]) - COLOR_START)
                line(p, vc, wv, cam, new float[]{x0, y0, z + 0.02f}, new float[]{x0, y1, z + 0.02f}, 0.08f, haloC, alpha * 0.9f);
            if (!sh.on(i + 1, j) || progress < appearAt(sh.tier[Math.min(sh.cols - 1, i + 1)][j]) - COLOR_START)
                line(p, vc, wv, cam, new float[]{x1, y0, z + 0.02f}, new float[]{x1, y1, z + 0.02f}, 0.08f, haloC, alpha * 0.9f);
            if (!sh.on(i, j - 1) || progress < appearAt(sh.tier[i][Math.max(0, j - 1)]) - COLOR_START)
                line(p, vc, wv, cam, new float[]{x0, y0, z + 0.02f}, new float[]{x1, y0, z + 0.02f}, 0.08f, haloC, alpha * 0.9f);
            if (!sh.on(i, j + 1) || progress < appearAt(sh.tier[i][Math.min(sh.rows - 1, j + 1)]) - COLOR_START)
                line(p, vc, wv, cam, new float[]{x0, y1, z + 0.02f}, new float[]{x1, y1, z + 0.02f}, 0.08f, haloC, alpha * 0.9f);
        }

        // Lightning twisting around the growing rift — more violent as it grows
        int burst = (int) (age * 0.8f);
        int bolts = 4 + (int) (progress * 4f);
        for (int b = 0; b < bolts; b++) {
            if (RiftShape.hash(s.seed, burst * 7 + b, 90) < 0.2f) continue;
            float ang = RiftShape.hash(s.seed, burst * 7 + b, 91) * (float) Math.PI * 2;
            float r = Math.max(sh.w, sh.h) * 0.4f * progress;
            float tx = (float) Math.cos(ang) * r * (0.3f + 0.7f * RiftShape.hash(s.seed, burst * 7 + b, 92));
            float ty = cy + (float) Math.sin(ang) * r * (0.3f + 0.7f * RiftShape.hash(s.seed, burst * 7 + b, 93));
            bolt(p, vc, wv, cam, new float[]{0f, cy, 0.06f}, new float[]{tx, ty, 0.15f},
                s.seed + burst * 17L + b, look, 0.8f * progress);
        }

        // Flickering shape outlines — different shapes trying to form
        if (progress < 0.7f && RiftShape.hash(s.seed, (int)(age * 3f), 95) > 0.4f) {
            float flickerA = 0.3f * (1f - progress / 0.7f);
            float flickerR = Math.max(sh.w, sh.h) * (0.3f + 0.5f * progress);
            ring(p, vc, wv, 0f, cy, 0.05f, flickerR * 0.85f, flickerR, look.core(), flickerA);
        }
    }

    // ------------------------------------------------------------------ PHASE 3: SHOCKWAVE (48-62)

    /**
     * Big white bands flash outward like a thunderclap shockwave. The rift is fully grown
     * and the energy release sends concentric rings blasting outward. This is the dramatic
     * moment right before the rift settles.
     */
    private static void shockwave(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, Look look, State s, Vector3f cam, float age) {
        float progress = clamp((age - SHOCK_START) / (SHOCK_END - SHOCK_START), 0f, 1f);
        float cy = sh.cy();
        float maxR = Math.max(sh.w, sh.h) * 2.5f;

        // 3 shockwave bands expanding outward, staggered
        for (int band = 0; band < 3; band++) {
            float bandStart = band * 0.12f;
            float bandProgress = clamp((progress - bandStart) / (1f - bandStart), 0f, 1f);
            if (bandProgress <= 0f) continue;

            // Ease-out: fast start, slow finish
            float bp = 1f - (1f - bandProgress) * (1f - bandProgress);
            float r = bp * maxR;
            float thickness = 0.4f + 0.3f * (1f - bandProgress); // thick when close, thins as it expands

            // The band fades as it expands
            float a = (1f - bandProgress) * (band == 0 ? 0.85f : 0.55f);

            // White shockwave ring
            ring(p, vc, wv, 0f, cy, 0.03f, Math.max(0.001f, r - thickness), r, c(1f, 1f, 1f), a);

            // Bright core ring (thinner, brighter)
            ring(p, vc, wv, 0f, cy, 0.03f, r - thickness * 0.3f, r - thickness * 0.1f,
                c(1f, 1f, 1f), a * 1.2f);

            // Halo glow around the band
            halo(p, vc, wv, 0f, cy, 0.05f, r, look.halo(), a * 0.3f);
        }

        // Central flash — bright white pulse at the rift's centre
        float centralFlash = Math.max(0f, 1f - progress * 2.5f);
        if (centralFlash > 0f) {
            halo(p, vc, wv, 0f, cy, 0.08f, Math.max(sh.w, sh.h) * 0.8f, c(1f, 1f, 1f), centralFlash * 0.6f);
        }

        // Lightning during shockwave — explosive burst
        int burst = (int) (age * 2f);
        int n = 6 + (int) ((1f - progress) * 6f);
        for (int b = 0; b < n; b++) {
            if (RiftShape.hash(s.seed, burst * 3 + b, 100) < 0.15f) continue;
            double ang = RiftShape.hash(s.seed, burst * 3 + b, 101) * Math.PI * 2;
            float r = Math.max(sh.w, sh.h) * (0.3f + 1.5f * progress);
            float[] from = {0f, cy, 0.06f};
            float[] to = {(float) Math.cos(ang) * r, cy + (float) Math.sin(ang) * r * 0.8f, 0.2f};
            bolt(p, vc, wv, cam, from, to, s.seed + burst * 11L + b, look, (1f - progress) * 0.9f);
        }
    }

    // ------------------------------------------------------------------ PHASE 4: WHITE CONSTRUCTION (60-82)

    /**
     * The COMPLETE rift shape appears all at once in white — not voxel-by-voxel.
     * The white silhouette materializes as a whole, then fades to reveal colors.
     * Like a white ghost of the rift trying to build itself.
     */
    private static void whiteConstruction(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, Look look, Vector3f cam, float age, State s) {
        float progress = clamp((age - BUILD_START) / (COLOR_START - BUILD_START), 0f, 1f);
        float hw = sh.w / 2f, hh = sh.h / 2f, cy = sh.cy();
        float[] white = c(1f, 1f, 1f);
        float[] whiteWarm = c(1f, 0.98f, 0.95f);

        // The whole rift fades in as white — progressive opacity, not piece-by-piece
        float fadeIn = clamp(progress / 0.25f, 0f, 1f);  // fully visible by 25% of phase
        float flash = Math.max(0f, 1f - progress / 0.12f); // initial bright flash

        // Draw the complete rift shape in white
        for (int i = 0; i < sh.cols; i++) for (int j = 0; j < sh.rows; j++) {
            if (!sh.on(i, j)) continue;
            float x0 = sh.x(i), x1 = sh.x(i + 1), y0 = sh.y(j), y1 = sh.y(j + 1), z = -sh.d(i, j);
            float cx = (x0 + x1) / 2f, cy2 = (y0 + y1) / 2f;

            // Edge fade — rift dissolves into nothing at the edges
            float ef = edgeFade(cx, cy2, hw, hh, cy, 0.68f);
            float alpha = fadeIn * ef;
            if (alpha < 0.01f) continue;

            // White wall — the complete shape
            rect(p, vc, wv, x0, y0, x1, y1, z + 0.01f, white, alpha * (0.85f + flash * 0.15f));

            // White neon rim on open edges
            boolean L = !sh.on(i - 1, j), R = !sh.on(i + 1, j), D = !sh.on(i, j - 1), U = !sh.on(i, j + 1);
            float rimA = alpha * (0.95f + flash * 0.5f);
            if (L) line(p, vc, wv, cam, new float[]{x0, y0, z + 0.02f}, new float[]{x0, y1, z + 0.02f}, 0.12f, white, rimA);
            if (R) line(p, vc, wv, cam, new float[]{x1, y0, z + 0.02f}, new float[]{x1, y1, z + 0.02f}, 0.12f, white, rimA);
            if (D) line(p, vc, wv, cam, new float[]{x0, y0, z + 0.02f}, new float[]{x1, y0, z + 0.02f}, 0.12f, white, rimA);
            if (U) line(p, vc, wv, cam, new float[]{x0, y1, z + 0.02f}, new float[]{x1, y1, z + 0.02f}, 0.12f, white, rimA);
        }

        // Central white glow
        if (flash > 0f) halo(p, vc, wv, 0f, cy, 0.08f, Math.max(sh.w, sh.h) * 0.6f, whiteWarm, flash * 0.4f);

        // Construction lightning — energy arcs as the white form stabilizes
        int burst = (int) (age * 0.6f);
        int bolts = 3 + (int) ((1f - progress) * 4f);
        for (int b = 0; b < bolts; b++) {
            if (RiftShape.hash(s.seed, burst * 9 + b, 110) < 0.3f) continue;
            float ang = RiftShape.hash(s.seed, burst * 9 + b, 111) * (float) Math.PI * 2;
            float r = Math.max(sh.w, sh.h) * 0.35f;
            float tx = (float) Math.cos(ang) * r * RiftShape.hash(s.seed, burst * 9 + b, 112);
            float ty = cy + (float) Math.sin(ang) * r * RiftShape.hash(s.seed, burst * 9 + b, 113);
            bolt(p, vc, wv, cam, new float[]{0f, cy, 0.05f}, new float[]{tx, ty, 0.1f},
                s.seed + burst * 23L + b, look, (1f - progress) * 0.7f);
        }
    }

    // ------------------------------------------------------------------ COLOR REVEAL (82-100) walls + rims

    /** Walls that transition from white to destination colors. */
    private static void wallsColor(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, Look look, float age, State s, float colorFade) {
        float[] white = c(1f, 1f, 1f);
        float[] f = mix(white, look.wallFront(), colorFade);
        float[] b = mix(white, look.wallBack(), colorFade);
        float hw = sh.w / 2f, hh = sh.h / 2f, cy = sh.cy();

        for (int i = 0; i < sh.cols; i++) for (int j = 0; j < sh.rows; j++) {
            if (!shown(sh, i, j, age)) continue;
            float d = sh.d(i, j), x0 = sh.x(i), x1 = sh.x(i + 1), y0 = sh.y(j), y1 = sh.y(j + 1);
            float cx = (x0 + x1) / 2f, cy2 = (y0 + y1) / 2f;
            float ef = edgeFade(cx, cy2, hw, hh, cy, 0.72f);
            if (ef < 0.01f) continue;

            float zl = wallTop(sh, i - 1, j, d, age), zr = wallTop(sh, i + 1, j, d, age);
            float zd = wallTop(sh, i, j - 1, d, age), zu = wallTop(sh, i, j + 1, d, age);
            if (zl <= 0) wallFade(p, vc, wv, x0, y0, x0, y1, lip(zl), -d, f, b, 0.92f, ef);
            if (zr <= 0) wallFade(p, vc, wv, x1, y0, x1, y1, lip(zr), -d, f, b, 0.84f, ef);
            if (zd <= 0) wallFade(p, vc, wv, x0, y0, x1, y0, lip(zd), -d, f, b, 1f, ef);
            if (zu <= 0) wallFade(p, vc, wv, x0, y1, x1, y1, lip(zu), -d, f, b, 0.76f, ef);
        }
        for (float[] q : sh.sats) {
            if (age < satAt(q)) continue;
            int m = (int) q[7];
            if ((m & 1) == 0) wallFade(p, vc, wv, q[0], q[1], q[0], q[3], q[4], q[5], f, b, 0.92f, 1f);
            if ((m & 2) == 0) wallFade(p, vc, wv, q[2], q[1], q[2], q[3], q[4], q[5], f, b, 0.84f, 1f);
            if ((m & 4) == 0) wallFade(p, vc, wv, q[0], q[1], q[2], q[1], q[4], q[5], f, b, 1f, 1f);
            if ((m & 8) == 0) wallFade(p, vc, wv, q[0], q[3], q[2], q[3], q[4], q[5], f, b, 0.76f, 1f);
        }
// Floating cubes removed — replaced by light rectangles in energyCubes()

        // BACK WALL LAYER — draws a darker wall at a deeper Z to give the rift THICKNESS.
        // This creates the "deep alcove" look from the trailer where the rift has visible depth.
        float[] darkF = mix(f, b, 0.4f);  // darker than front
        float[] darkB = mix(b, c(0f, 0f, 0f), 0.3f);  // even darker
        for (int i = 0; i < sh.cols; i++) for (int j = 0; j < sh.rows; j++) {
            if (!shown(sh, i, j, age)) continue;
            float d = sh.d(i, j);
            float x0 = sh.x(i), x1 = sh.x(i + 1), y0 = sh.y(j), y1 = sh.y(j + 1);
            float cx = (x0 + x1) / 2f, cy2 = (y0 + y1) / 2f;
            float ef = edgeFade(cx, cy2, hw, hh, cy, 0.68f);
            if (ef < 0.01f) continue;
            // Back wall at deeper depth (adds visible thickness)
            float backZ = -d - 0.4f;
            wallFade(p, vc, wv, x0, y0, x1, y1, backZ, backZ - 0.2f, darkF, darkB, 0.5f, ef * 0.6f);
        }
    }

    private static void wallFade(PoseStack.Pose p, VertexConsumer vc, Warp wv, float xa, float ya, float xb, float yb, float zf, float zb,
                                 float[] front, float[] back, float shade, float ef) {
        float[] ft = {front[0] * shade * ef, front[1] * shade * ef, front[2] * shade * ef};
        float[] bk = {back[0] * shade * ef, back[1] * shade * ef, back[2] * shade * ef};
        col(p, vc, wv, xa, ya, zf, ft, 1f); col(p, vc, wv, xb, yb, zf, ft, 1f);
        col(p, vc, wv, xb, yb, zb, bk, 1f); col(p, vc, wv, xa, ya, zb, bk, 1f);
    }

    /** Rims that transition from white to destination colors with edge fade. */
    private static void rimsColor(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, Look look, Vector3f cam, float age, State s, float colorFade) {
        float[] white = c(1f, 1f, 1f);
        float[] core = mix(white, look.core(), colorFade);
        float[] haloC = mix(white, look.halo(), colorFade);
        float hw = sh.w / 2f, hh = sh.h / 2f, cy = sh.cy();
        float[] jit = {0.022f * (float) Math.sin(s.time * 7.3f), 0.022f * (float) Math.sin(s.time * 5.1f + 1.7f)};

        for (int i = 0; i < sh.cols; i++) for (int j = 0; j < sh.rows; j++) {
            if (!shown(sh, i, j, age)) continue;
            float d = sh.d(i, j), x0 = sh.x(i), x1 = sh.x(i + 1), y0 = sh.y(j), y1 = sh.y(j + 1);
            float flash = Math.max(0f, 1f - (age - appearAt(sh.tier[i][j])) / 6f);
            if (flash > 0f) rect(p, vc, wv, x0, y0, x1, y1, -d + 0.02f, white, flash * 0.85f);
            float zl = wallTop(sh, i - 1, j, d, age), zr = wallTop(sh, i + 1, j, d, age);
            float zd = wallTop(sh, i, j - 1, d, age), zu = wallTop(sh, i, j + 1, d, age);
            if (zl <= 0) rim(p, vc, wv, cam, x0, y0, x0, y1, lip(zl), -d, core, haloC, zl < 0, flash, jit, hw, hh, cy);
            if (zr <= 0) rim(p, vc, wv, cam, x1, y0, x1, y1, lip(zr), -d, core, haloC, zr < 0, flash, jit, hw, hh, cy);
            if (zd <= 0) rim(p, vc, wv, cam, x0, y0, x1, y0, lip(zd), -d, core, haloC, zd < 0, flash, jit, hw, hh, cy);
            if (zu <= 0) rim(p, vc, wv, cam, x0, y1, x1, y1, lip(zu), -d, core, haloC, zu < 0, flash, jit, hw, hh, cy);
        }
        for (float[] q : sh.sats) {
            if (age < satAt(q)) continue;
            float flash = Math.max(0f, 1f - (age - satAt(q)) / 6f);
            int m = (int) q[7];
            if ((m & 1) == 0) rim(p, vc, wv, cam, q[0], q[1], q[0], q[3], q[4], q[5], core, haloC, false, flash, jit, hw, hh, cy);
            if ((m & 2) == 0) rim(p, vc, wv, cam, q[2], q[1], q[2], q[3], q[4], q[5], core, haloC, false, flash, jit, hw, hh, cy);
            if ((m & 4) == 0) rim(p, vc, wv, cam, q[0], q[1], q[2], q[1], q[4], q[5], core, haloC, false, flash, jit, hw, hh, cy);
            if ((m & 8) == 0) rim(p, vc, wv, cam, q[0], q[3], q[2], q[3], q[4], q[5], core, haloC, false, flash, jit, hw, hh, cy);
            float[][] corners = {{q[0], q[1], m & 5}, {q[2], q[1], m & 6}, {q[0], q[3], m & 9}, {q[2], q[3], m & 10}};
            for (float[] cr : corners)
                if (cr[2] == 0) line(p, vc, wv, cam, new float[]{cr[0], cr[1], q[4]}, new float[]{cr[0], cr[1], q[5]}, 0.05f, core, 0.8f);
        }
    }

    // ------------------------------------------------------------------ windows (the destination view)

    private static void windows(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, float age, float code, State s) {
        for (int i = 0; i < sh.cols; i++) for (int j = 0; j < sh.rows; j++) {
            if (!shown(sh, i, j, age)) continue;
            float x0 = sh.x(i), x1 = sh.x(i + 1), y0 = sh.y(j), y1 = sh.y(j + 1), z = -sh.d(i, j);
            win(p, vc, wv, sh, x0, y0, z, code); win(p, vc, wv, sh, x1, y0, z, code);
            win(p, vc, wv, sh, x1, y1, z, code); win(p, vc, wv, sh, x0, y1, z, code);
        }
        for (float[] b : sh.sats) {
            if (age < satAt(b)) continue;
            win(p, vc, wv, sh, b[0], b[1], b[5], code); win(p, vc, wv, sh, b[2], b[1], b[5], code);
            win(p, vc, wv, sh, b[2], b[3], b[5], code); win(p, vc, wv, sh, b[0], b[3], b[5], code);
        }
// Floating cubes removed — replaced by light rectangles
    }

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
        // Edge-aware wavy warp: borders ripple more than the interior
        float hw = sh.w / 2f, hh = sh.h / 2f, cy = sh.cy();
        float[] jit = {0.022f * (float) Math.sin(s.time * 7.3f), 0.022f * (float) Math.sin(s.time * 5.1f + 1.7f)};
        for (int i = 0; i < sh.cols; i++) for (int j = 0; j < sh.rows; j++) {
            if (!shown(sh, i, j, age)) continue;
            float d = sh.d(i, j), x0 = sh.x(i), x1 = sh.x(i + 1), y0 = sh.y(j), y1 = sh.y(j + 1);
            float flash = Math.max(0f, 1f - (age - appearAt(sh.tier[i][j])) / 6f);
            if (flash > 0f) rect(p, vc, wv, x0, y0, x1, y1, -d + 0.02f, white, flash * 0.85f);
            float zl = wallTop(sh, i - 1, j, d, age), zr = wallTop(sh, i + 1, j, d, age);
            float zd = wallTop(sh, i, j - 1, d, age), zu = wallTop(sh, i, j + 1, d, age);
            // Use edge-aware warp for rim vertices — borders wave dramatically
            if (zl <= 0) rim(p, vc, wv, cam, x0, y0, x0, y1, lip(zl), -d, core, halo, zl < 0, flash, jit, hw, hh, cy);
            if (zr <= 0) rim(p, vc, wv, cam, x1, y0, x1, y1, lip(zr), -d, core, halo, zr < 0, flash, jit, hw, hh, cy);
            if (zd <= 0) rim(p, vc, wv, cam, x0, y0, x1, y0, lip(zd), -d, core, halo, zd < 0, flash, jit, hw, hh, cy);
            if (zu <= 0) rim(p, vc, wv, cam, x0, y1, x1, y1, lip(zu), -d, core, halo, zu < 0, flash, jit, hw, hh, cy);
        }
        for (float[] q : sh.sats) {
            if (age < satAt(q)) continue;
            float flash = Math.max(0f, 1f - (age - satAt(q)) / 6f);
            int m = (int) q[7];
            if ((m & 1) == 0) rim(p, vc, wv, cam, q[0], q[1], q[0], q[3], q[4], q[5], core, halo, false, flash, jit, hw, hh, cy);
            if ((m & 2) == 0) rim(p, vc, wv, cam, q[2], q[1], q[2], q[3], q[4], q[5], core, halo, false, flash, jit, hw, hh, cy);
            if ((m & 4) == 0) rim(p, vc, wv, cam, q[0], q[1], q[2], q[1], q[4], q[5], core, halo, false, flash, jit, hw, hh, cy);
            if ((m & 8) == 0) rim(p, vc, wv, cam, q[0], q[3], q[2], q[3], q[4], q[5], core, halo, false, flash, jit, hw, hh, cy);
            float[][] corners = {{q[0], q[1], m & 5}, {q[2], q[1], m & 6}, {q[0], q[3], m & 9}, {q[2], q[3], m & 10}};
            for (float[] cr : corners)
                if (cr[2] == 0) line(p, vc, wv, cam, new float[]{cr[0], cr[1], q[4]}, new float[]{cr[0], cr[1], q[5]}, 0.05f, core, 0.8f);
        }
    }

    /** Edge-boosted vertex: warps more at the rift borders for that wavy energy-tear look. */
    private static void colEdge(PoseStack.Pose p, VertexConsumer vc, Warp wv, float x, float y, float z, float[] c, float a,
                                float hw, float hh, float cy) {
        if (!SiftBudget.take(vc)) return;
        float boost = wv.edgeBoost(x, y, z, hw, hh, cy);
        float wx = x + wv.dx(x, y, z) * boost, wy = y + wv.dy(x, y, z) * boost, wz = z + wv.dz(x, y, z) * boost;
        if (!Float.isFinite(wx + wy + wz)) { wx = 0f; wy = 0f; wz = 0f; a = 0f; }
        vc.addVertex(p, wx, wy, wz).setColor(Math.min(1f, c[0]), Math.min(1f, c[1]), Math.min(1f, c[2]), Math.max(0f, Math.min(1f, a)));
    }

    /** Camera-facing line with edge boost for wavy borders. */
    private static void lineEdge(PoseStack.Pose p, VertexConsumer vc, Warp wv, Vector3f cam, float[] a, float[] b, float width, float[] c, float alpha,
                                 float hw, float hh, float cy) {
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
        colEdge(p, vc, wv, ax - sx, ay - sy, az - sz, c, alpha, hw, hh, cy);
        colEdge(p, vc, wv, bx - sx, by - sy, bz - sz, c, alpha, hw, hh, cy);
        colEdge(p, vc, wv, bx + sx, by + sy, bz + sz, c, alpha, hw, hh, cy);
        colEdge(p, vc, wv, ax + sx, ay + sy, az + sz, c, alpha, hw, hh, cy);
    }

    private static void rim(PoseStack.Pose p, VertexConsumer vc, Warp wv, Vector3f cam, float xa, float ya, float xb, float yb, float zf, float zb,
                            float[] core, float[] halo, boolean lip, float flash, float[] jit,
                            float hw, float hh, float cy) {
        float lk = lip ? 0.75f : 1f, la = lip ? 0.85f : 1f;
        float[] fa = {xa, ya, zf + 0.006f}, fb = {xb, yb, zf + 0.006f};
        bandEdge(p, vc, wv, cam, fa, fb, (0.065f + 0.05f * flash) * lk, (0.32f + 0.15f * flash) * lk, core, halo, la, hw, hh, cy);
        lineEdge(p, vc, wv, cam, fa, fb, 0.8f * lk, halo, 0.04f, hw, hh, cy);
        lineEdge(p, vc, wv, cam, new float[]{xa + jit[0], ya + jit[1], zf + 0.01f}, new float[]{xb + jit[0], yb + jit[1], zf + 0.01f}, 0.04f * lk, core, 0.22f, hw, hh, cy);
        lineEdge(p, vc, wv, cam, new float[]{xa - jit[1], ya + jit[0], zf + 0.012f}, new float[]{xb - jit[1], yb + jit[0], zf + 0.012f}, 0.04f * lk, halo, 0.18f, hw, hh, cy);
        bandEdge(p, vc, wv, cam, new float[]{xa, ya, zb + 0.012f}, new float[]{xb, yb, zb + 0.012f}, 0.035f, 0.14f, core, halo, 0.35f, hw, hh, cy);
    }

    /** Edge-boosted gradient band for wavy rim glow. */
    private static void bandEdge(PoseStack.Pose p, VertexConsumer vc, Warp wv, Vector3f cam, float[] a, float[] b, float core, float outer,
                                 float[] white, float[] halo, float alpha, float hw, float hh, float cy) {
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
            colEdge(p, vc, wv, ax + sx * o0, ay + sy * o0, az + sz * o0, cs[i], as[i] * alpha, hw, hh, cy);
            colEdge(p, vc, wv, bx + sx * o0, by + sy * o0, bz + sz * o0, cs[i], as[i] * alpha, hw, hh, cy);
            colEdge(p, vc, wv, bx + sx * o1, by + sy * o1, bz + sz * o1, cs[i + 1], as[i + 1] * alpha, hw, hh, cy);
            colEdge(p, vc, wv, ax + sx * o1, ay + sy * o1, az + sz * o1, cs[i + 1], as[i + 1] * alpha, hw, hh, cy);
        }
    }

    // ------------------------------------------------------------------ stable details

    private static void stable(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, Look look, Vector3f cam, State s) {
        float[] white = c(1f, 1f, 1f);
        for (int k = 0; k < 30; k++) {
            float life = (RiftShape.hash(s.seed, k, 70) + s.time * (0.04f + 0.04f * RiftShape.hash(s.seed, k, 71))) % 1f;
            float x = (RiftShape.hash(s.seed, k, 72) - 0.5f) * sh.w * 1.1f, y = RiftShape.BASE + life * (sh.h + 1f);
            float z = -sh.maxDepth * RiftShape.hash(s.seed, k, 73) * 0.8f + (RiftShape.hash(s.seed, k, 74) < 0.35f ? 0.6f : 0.05f);
            float a = (float) Math.sin(life * Math.PI) * 0.9f, q = 0.035f + 0.03f * RiftShape.hash(s.seed, k, 75);
            if (a < 0.03f) continue;
            line(p, vc, wv, cam, new float[]{x, y - q, z}, new float[]{x, y + q, z}, q * 2f, white, a);
        }
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

    private static float lip(float z) { return z == 0f ? COLLAR : z; }

    // ------------------------------------------------------------------ recessed alcove frame

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

    // ------------------------------------------------------------------ transparent light rectangles (energy particles)

    static final float[][][] ENERGY = {
        {rgb(0xFF9A6A), rgb(0xFFE3B0), rgb(0xFF6F5A)},
        {rgb(0xC0142A), rgb(0xFF6A1A), rgb(0xE0B040)},
        {rgb(0x6A7CFF), rgb(0xC07CFF), rgb(0xD8FF8A)},
        {rgb(0xA8F5C8), rgb(0x3FF3FF), rgb(0xFFB8E0)},
        {rgb(0x3FE8FF), rgb(0xA0FFFF), rgb(0x2F9CFF)},
    };

    /** Transparent light rectangles floating UP from the rift, growing, disintegrating at top. */
    private static void energyCubes(PoseStack.Pose p, VertexConsumer vc, RiftShape sh, State s, float age) {
        float[][] pal = ENERGY[Math.max(0, Math.min(ENERGY.length - 1, s.type.id))];
        float ramp = clamp((age - CLUSTER_START) / (GROWN - CLUSTER_START), 0f, 1f);
        int count = Math.round(14 * (0.3f + 0.7f * ramp));
        for (int k = 0; k < count; k++) {
            float life = 3.5f + 2.5f * RiftShape.hash(s.seed, k, 120);
            float period = life + 1.2f * RiftShape.hash(s.seed, k, 121);
            float tt = s.time + RiftShape.hash(s.seed, k, 122) * period;
            int gen = (int) (tt / period);
            float f = (tt - gen * period) / life;
            if (f >= 1f || f < 0f) continue;
            long g = s.seed + gen * 7919L;

            float startX = (RiftShape.hash(g, k, 1) - 0.5f) * sh.w * 0.7f;
            float startY = sh.cy() + (RiftShape.hash(g, k, 2) - 0.5f) * sh.h * 0.5f;
            float startZ = -0.3f * RiftShape.hash(g, k, 3) + 0.2f;

            // Float UP: strong Y drift, gentle sideways
            float x = startX + (RiftShape.hash(g, k, 4) - 0.5f) * 0.8f * f * f;
            float y = startY + f * (4f + 6f * RiftShape.hash(g, k, 5));
            float z = startZ + (0.3f + 0.5f * RiftShape.hash(g, k, 6)) * f;

            // BIG translucent rectangles, grow as they rise, wider than tall
            float halfW = (0.6f + 0.8f * RiftShape.hash(g, k, 7)) * (0.5f + 0.5f * f);
            float halfH = halfW * 0.3f;

            // Alpha: translucent, fade out at top (disintegrate)
            float a = 0.45f * Math.min(1f, f / 0.1f);
            if (f >= 0.7f) {
                float d = (f - 0.7f) / 0.3f;
                a *= 1f - d * d;
                halfW *= 1f + d * 0.8f;
                halfH *= 1f - d * 0.6f;
            }
            if (a < 0.01f) continue;

            float[] col = pal[(int) (RiftShape.hash(g, k, 8) * 3f) % 3];
            lightRectangle(p, vc, x, y, z, halfW, halfH, col, a, s);
        }
    }

    /** Flat translucent light rectangle — camera-facing, not a solid box. */
    private static void lightRectangle(PoseStack.Pose p, VertexConsumer vc, float cx, float cy, float cz,
                                        float hw, float hh, float[] c, float a, State s) {
        // Use the entity yaw to approximate camera direction for the billboard
        float yaw = (float) Math.toRadians(-s.yaw);
        float rx = (float) Math.sin(yaw), rz = (float) Math.cos(yaw);

        float x0 = cx - rx * hw, x1 = cx + rx * hw;
        float z0 = cz - rz * hw, z1 = cz + rz * hw;
        float y0 = cy - hh, y1 = cy + hh;

        Warp w = Warp.STILL;
        col(p, vc, w, x0, y0, z0, c, a);
        col(p, vc, w, x1, y0, z1, c, a);
        col(p, vc, w, x1, y1, z1, c, a);
        col(p, vc, w, x0, y1, z0, c, a);
    }

    private static float[] cube(RiftShape sh, State s, int k) {
        double a = RiftShape.hash(s.seed, k, 1) * Math.PI * 2;
        float reach = 0.8f + 0.45f * RiftShape.hash(s.seed, k, 2);
        float cx = (float) Math.cos(a) * sh.w / 2 * reach * 1.25f, cy = sh.cy() + (float) Math.sin(a) * sh.h / 2 * reach * 1.2f;
        float cz = 0.3f + 0.9f * RiftShape.hash(s.seed, k, 3), half = 0.2f + 0.22f * RiftShape.hash(s.seed, k, 4);
        return new float[]{cx, cy, cz, half};
    }

    // ------------------------------------------------------------------ night neon curtains

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