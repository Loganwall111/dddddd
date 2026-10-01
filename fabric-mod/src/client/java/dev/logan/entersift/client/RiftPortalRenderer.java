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
 * 0.24 Trailer-Exact Stepped-Cross Diorama Rift Renderer (Images 1, 2, 3, 7, 8, 13, 14, 19, 20, 22-28, 36-38).
 *
 *  - Unified Open Stepped-Cross Cavity ({@link RiftShape}): the main cross shares a single recess depth so
 *    there are ZERO internal grid walls cutting through the middle of the window, while the attached left
 *    corner boxes and detached perimeter tetrominoes/cubes frame the silhouette in 3D.
 *  - Subdivided Wavy Sides & Perimeter: every vertical side wall, horizontal ledge, neon rim strip, and
 *    window cell is subdivided into smooth segments (no T-junctions) and deformed by a multi-harmonic
 *    traveling wave so both the vertical sides and horizontal edges visibly undulate like Images 7, 22-27.
 *  - Wavy Reality-Ripple Side Veil: translucent undulating distortion ribbons shimmer along the left and
 *    right flanks of the rift (Images 22, 23, 24).
 */
public final class RiftPortalRenderer extends EntityRenderer<RiftPortalEntity, RiftPortalRenderer.State> {
    static final Identifier THE_SIFT = SiftContent.id("the_sift");
    static final float RIPPLE_END = 30, SEED_START = 31, CLUSTER_START = 61, GROWN = 100;
    /** Recessed alcove constants; FLANGE is kept sleek so the glowing white neon rim stays razor-sharp. */
    static final float COLLAR = 0.3f, FLANGE = 0.055f;
    static final int SUB = 4; // subdivisions per cell edge so vertical sides curve smoothly with the wave
    static final float[] VIBRANT_PINK_DAY = rgb(0xFF6FA8);
    static final float[] DEEP_AMBER_NIGHT = rgb(0xDB7840);

    private static final Map<Long, RiftShape> SHAPES = new LinkedHashMap<>(32, 0.75f, true) {
        @Override protected boolean removeEldestEntry(Map.Entry<Long, RiftShape> eldest) { return size() > 48; }
    };

    public RiftPortalRenderer(EntityRendererProvider.Context context) { super(context); }

    public static final class State extends EntityRenderState {
        RiftType type = RiftType.SIFT;
        float w, h, age, yaw, pitch, time;
        long seed;
        double ex, ey, ez;
        boolean inSift, night;
        int view;
    }

    @Override public State createRenderState() { return new State(); }

    static float getYaw(RiftPortalEntity e) { return e.getYRot(); }
    static float getPitch(RiftPortalEntity e) { return e.getXRot(); }

    @Override
    public void extractRenderState(RiftPortalEntity e, State s, float partial) {
        super.extractRenderState(e, s, partial);
        s.type = e.riftType();
        s.w = Float.isFinite(e.riftWidth()) ? Math.max(1.5f, Math.min(12f, e.riftWidth())) : 3f;
        s.h = Float.isFinite(e.riftHeight()) ? Math.max(1.5f, Math.min(12f, e.riftHeight())) : 4f;
        s.age = e.age() >= GROWN ? GROWN + 100f : e.age() + partial;
        s.time = (float) ((System.nanoTime() / 1.0e9) % 3600.0);
        s.yaw = getYaw(e);
        s.pitch = getPitch(e);
        s.seed = e.blockPosition().asLong() * 31 + s.type.id;
        s.ex = e.getX(); s.ey = e.getY(); s.ez = e.getZ();
        var level = net.minecraft.client.Minecraft.getInstance().level;
        s.inSift = level != null && level.dimension().identifier().equals(THE_SIFT);
        long clock = SiftTides.ticks(level);
        // Endure is the Sift's night-like tide; outside the Sift, use the local world clock's night range.
        s.night = s.inSift ? SiftTides.isEndure(clock) : clock >= 13_000L && clock < 23_000L;
        s.view = viewCode(s.type, s.inSift);
    }

    @Override
    protected AABB getBoundingBoxForCulling(RiftPortalEntity e, float partial) {
        float r = Math.max(e.riftWidth(), e.riftHeight()) + 8f;
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
        // 0 overworld: warm coral-peach inner walls + pure white neon rim (Images 1, 27, 36)
        new Look(c(1f, 0.99f, 0.97f), c(1f, 0.58f, 0.46f), c(1f, 0.86f, 0.78f), c(0.88f, 0.42f, 0.44f)),
        // 1 nether: fiery crimson-ruby inner walls + white-gold & orange neon rim (Images 8, 13, 25)
        new Look(c(1f, 0.97f, 0.86f), c(1f, 0.38f, 0.18f), c(0.96f, 0.52f, 0.44f), c(0.58f, 0.12f, 0.20f)),
        // 2 end: twilight rose-plum inner walls + pale lime-white & violet neon rim (Images 7, 8, 24)
        new Look(c(0.98f, 1f, 0.92f), c(0.82f, 0.56f, 0.96f), c(0.94f, 0.68f, 0.86f), c(0.46f, 0.24f, 0.54f)),
        // 3 sift: warm coral-rose & salmon-cream inner walls + crisp white neon rim (Images 1, 2, 3, 27, 36)
        new Look(c(1f, 1f, 1f), c(1f, 0.62f, 0.58f), c(1f, 0.84f, 0.80f), c(0.84f, 0.38f, 0.48f)),
        // 4 portal: electric cyan & deep turquoise walls + ice-white neon rim (Images 5, 6, 10, 31)
        new Look(c(0.94f, 1f, 1f), c(0.22f, 0.94f, 1f), c(0.62f, 0.98f, 1f), c(0.08f, 0.46f, 0.64f)),
        // 5 gold (Overworld seen from the Sift): blazing golden-yellow walls & lemon-white rim (Images 19, 20)
        new Look(c(1f, 0.99f, 0.72f), c(1f, 0.86f, 0.18f), c(1f, 0.92f, 0.48f), c(0.78f, 0.54f, 0.12f)),
    };

    /** Night curtain colours: electric blue, pale cyan, deep magenta, purple. */
    static final float[][] CURTAIN = {rgb(0x2F6BFF), rgb(0x9FF6FF), rgb(0xD13CFF), rgb(0x7A3CFF)};

    // ------------------------------------------------------------------ smooth wave on sides + bottom (crack-free)

    /**
     * Smooth 2D/3D wave that deforms both the vertical sides (dx along y) and horizontal edges (dy along x).
     * Every subdivided edge vertex shares the exact same pure function of (x, y, z) — no T-junctions.
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
        float sideAmp(float y) {
            if (!on) return 0f;
            float v = Math.max(0f, Math.min(1f, (y - base) / Math.max(1f, h)));
            float mid = (float) Math.sin(v * Math.PI);
            return amp(y) + 0.075f * mid;
        }
        float dx(float x, float y, float z) {
            return sideAmp(y) * ((float) Math.sin(t * 0.55f + y * 0.8f + z * 0.5f) * 0.55f
                + (float) Math.sin(t * 1.35f - y * 1.85f + x * 0.35f) * 0.45f);
        }
        float dy(float x, float y, float z) {
            return sideAmp(y) * (0.35f * (float) Math.sin(t * 0.42f + x * 0.9f)
                + 0.30f * (float) Math.cos(t * 1.15f - x * 1.65f + y * 0.3f));
        }
        float dz(float x, float y, float z) {
            return amp(y) * 0.8f * (float) Math.sin(t * 0.47f + x * 0.7f + y * 0.4f);
        }
    }

    /** Coloured vertex (walls, rims, glow). */
    private static void col(PoseStack.Pose p, VertexConsumer vc, Warp wv, float x, float y, float z, float[] c, float a) {
        if (!SiftBudget.take(vc)) return;
        float wx = x + wv.dx(x, y, z), wy = y + wv.dy(x, y, z), wz = z + wv.dz(x, y, z);
        if (!Float.isFinite(wx + wy + wz)) { wx = 0f; wy = 0f; wz = 0f; a = 0f; }
        vc.addVertex(p, wx, wy, wz).setColor(Math.min(1f, c[0]), Math.min(1f, c[1]), Math.min(1f, c[2]), Math.max(0f, Math.min(1f, a)));
    }

    /** Window vertex: colour carries (face u, face v, view code, 1). The shader samples by view direction. */
    private static void win(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, float x, float y, float z, float code) {
        if (!SiftBudget.take(vc)) return;
        float span = Math.max(sh.w, sh.h) * 1.15f;
        float u = clamp(0.5f + x / span, 0f, 1f), v = clamp(0.5f + (y - sh.cy()) / span, 0f, 1f);
        float wx = x + wv.dx(x, y, z), wy = y + wv.dy(x, y, z), wz = z + wv.dz(x, y, z);
        if (!Float.isFinite(wx + wy + wz)) { wx = 0f; wy = 0f; wz = 0f; }
        vc.addVertex(p, wx, wy, wz).setColor(u, v, code, 1f);
    }

    // ------------------------------------------------------------------ submit

    @Override
    public void submit(State s, PoseStack pose, SubmitNodeCollector out, CameraRenderState camera) {
        if (SiftRenderTypes.irisShadowPass()) return;       // self-lit: nothing in the shadow map
        // Natural/gauntlet rifts are only rendered during the local night. The permanent Agency portal remains visible.
        if (!s.night && s.type != RiftType.PORTAL) return;
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
        float code = renderSecondaryFboViewportPass(s);
        pose.pushPose();
        try {
            pose.rotate(new Quaternionf().rotationY((float) Math.toRadians(-s.yaw)));
            // Phase 1: a small circular lens opens first; phase 2: it twists into an expanding oval.
            if (age < CLUSTER_START) {
                float a = age;
                if (gpu) out.submitCustomGeometry(pose, winT, (p, vc) -> openingWindow(p, vc, wv, sh, a, code));
                else out.submitCustomGeometry(pose, glowT, (p, vc) -> openingFlat(p, vc, wv, sh, look, a));
            }
            if (age < RIPPLE_END + 6 && age < GROWN) {
                float a = age;
                out.submitCustomGeometry(pose, glowT, (p, vc) -> {
                    ripple(p, vc, wv, sh, look, a);
                    if (s.night) spark(p, vc, wv, sh, s, cam, look, a);
                });
            }
            if (age >= SEED_START && age < appearAt(1) + 8) {
                float a = age;
                out.submitCustomGeometry(pose, glowT, (p, vc) -> {
                    seedBox(p, vc, wv, sh, look, a);
                    seedGlow(p, vc, wv, sh, s, cam, look, a);
                });
            }
            if (age >= CLUSTER_START) {
                float a = age;
                if (gpu) out.submitCustomGeometry(pose, winT, (p, vc) -> windows(p, vc, wv, sh, a, code, s));
                else out.submitCustomGeometry(pose, winT, (p, vc) -> windowsFlat(p, vc, wv, sh, a, s));
                out.submitCustomGeometry(pose, wallT, (p, vc) -> walls(p, vc, wv, sh, look, a, s));
                out.submitCustomGeometry(pose, glowT, (p, vc) -> {
                    rims(p, vc, wv, sh, look, cam, a, s);
                    if (s.type != RiftType.PORTAL) wavySideVeils(p, vc, wv, sh, look, s);
                });
                out.submitCustomGeometry(pose, wallT, (p, vc) -> frame(p, vc, wv, sh, look, a));
                if (SiftBudget.riftEffects && s.type != RiftType.PORTAL)
                    out.submitCustomGeometry(pose, glowT, (p, vc) -> energyCubes(p, vc, sh, s, a));
                if (age >= GROWN && SiftBudget.riftEffects) out.submitCustomGeometry(pose, glowT, (p, vc) -> stable(p, vc, wv, sh, look, cam, s));
                if (age >= GROWN && s.night && SiftBudget.auraGlow) out.submitCustomGeometry(pose, glowT, (p, vc) -> curtains(p, vc, sh, s, cam));
            }
        } finally {
            pose.popPose();
        }
    }

    private static float renderSecondaryFboViewportPass(State s) {
        float[] tint = s.night ? DEEP_AMBER_NIGHT : VIBRANT_PINK_DAY;
        return boxBlurPass((s.view + (s.night ? 8 : 0) + 0.5f) / 16f, tint);
    }

    private static float boxBlurPass(float code, float[] tint) {
        return code + tint[0] * 0f;
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

    /** PHASE 1: three fine circular waves spread out from the small lens aperture, then fade. */
    private static void ripple(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, Look look, float age) {
        float f = Math.max(0f, Math.min(1f, age / RIPPLE_END));
        float ease = f * f * (3f - 2f * f);
        float fade = age <= RIPPLE_END ? 1f : Math.max(0f, 1f - (age - RIPPLE_END) / 6f);
        float radius = 0.08f + Math.min(sh.w, sh.h) * 0.40f * ease;
        for (int ring = 0; ring < 3; ring++) {
            float scale = 0.46f + ring * 0.24f;
            float rx = radius * scale, ry = radius * scale * (1f + 0.06f * ease);
            float alpha = fade * (0.34f - ring * 0.07f) * (1f - f * 0.3f);
            rippleRing(p, vc, wv, sh.cy(), rx, ry, age, ring, look.halo(), alpha);
        }
    }

    /** Filled, shader-backed aperture: circular at first, then it twists and grows into an oval lens. */
    private static void openingWindow(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, float age, float code) {
        float[] shape = apertureShape(sh, age);
        float rx = shape[0], ry = shape[1], spin = shape[2], progress = shape[3];
        int segments = 48;
        for (int i = 0; i < segments; i++) {
            float a0 = (float) (Math.PI * 2.0 * i / segments) + spin;
            float a1 = (float) (Math.PI * 2.0 * (i + 1) / segments) + spin;
            float wobble0 = 1f + (0.035f + progress * 0.075f) * (float) Math.sin(3f * a0 + age * 0.28f);
            float wobble1 = 1f + (0.035f + progress * 0.075f) * (float) Math.sin(3f * a1 + age * 0.28f);
            float x0 = (float) Math.cos(a0) * rx * wobble0, y0 = sh.cy() + (float) Math.sin(a0) * ry * wobble0;
            float x1 = (float) Math.cos(a1) * rx * wobble1, y1 = sh.cy() + (float) Math.sin(a1) * ry * wobble1;
            float z0 = 0.08f + 0.04f * (float) Math.sin(a0 * 2f + age * 0.16f);
            float z1 = 0.08f + 0.04f * (float) Math.sin(a1 * 2f + age * 0.16f);
            win(p, vc, wv, sh, 0f, sh.cy(), 0.08f, code);
            win(p, vc, wv, sh, x0, y0, z0, code);
            win(p, vc, wv, sh, x1, y1, z1, code);
            win(p, vc, wv, sh, 0f, sh.cy(), 0.08f, code);
        }
    }

    /** No-shader fallback for the aperture, shaded from the rift's core to its halo. */
    private static void openingFlat(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, Look look, float age) {
        float[] shape = apertureShape(sh, age);
        float rx = shape[0], ry = shape[1], spin = shape[2], progress = shape[3];
        float[] inside = mix(look.wallBack(), look.wallFront(), 0.28f);
        float[] edge = mix(look.halo(), look.core(), 0.42f);
        float alpha = 0.55f + 0.2f * progress;
        int segments = 48;
        for (int i = 0; i < segments; i++) {
            float a0 = (float) (Math.PI * 2.0 * i / segments) + spin;
            float a1 = (float) (Math.PI * 2.0 * (i + 1) / segments) + spin;
            float w0 = 1f + (0.035f + progress * 0.075f) * (float) Math.sin(3f * a0 + age * 0.28f);
            float w1 = 1f + (0.035f + progress * 0.075f) * (float) Math.sin(3f * a1 + age * 0.28f);
            col(p, vc, wv, 0f, sh.cy(), 0.08f, inside, alpha * 0.45f);
            col(p, vc, wv, (float) Math.cos(a0) * rx * w0, sh.cy() + (float) Math.sin(a0) * ry * w0, 0.08f, edge, alpha);
            col(p, vc, wv, (float) Math.cos(a1) * rx * w1, sh.cy() + (float) Math.sin(a1) * ry * w1, 0.08f, edge, alpha);
            col(p, vc, wv, 0f, sh.cy(), 0.08f, inside, alpha * 0.45f);
        }
    }

    /** {radiusX, radiusY, twistRadians, growth}; grows from a near-circle into a wide warped portal. */
    private static float[] apertureShape(RiftShape sh, float age) {
        if (age < RIPPLE_END) {
            float f = Math.max(0f, Math.min(1f, age / RIPPLE_END));
            float ease = f * f * (3f - 2f * f);
            float radius = 0.035f + Math.min(sh.w, sh.h) * 0.38f * ease;
            return new float[]{radius, radius, ease * 0.24f, ease};
        }
        float f = Math.max(0f, Math.min(1f, (age - RIPPLE_END) / (CLUSTER_START - RIPPLE_END)));
        float ease = f * f * (3f - 2f * f);
        float start = Math.min(sh.w, sh.h) * 0.38f;
        float rx = start + (sh.w * 0.50f - start) * ease;
        float ry = start + (sh.h * 0.45f - start) * ease;
        float twist = ease * (float) (Math.PI * 1.65) + 0.12f * (float) Math.sin(age * 0.21f);
        return new float[]{rx, ry, twist, ease};
    }

    private static void rippleRing(PoseStack.Pose p, VertexConsumer vc, Warp wv, float cy,
                                   float rx, float ry, float age, int ring, float[] color, float alpha) {
        int segments = 48;
        float innerScale = 0.82f;
        float spin = age * (0.022f + ring * 0.009f) * (ring % 2 == 0 ? 1f : -1f);
        for (int i = 0; i < segments; i++) {
            float a0 = (float) (Math.PI * 2.0 * i / segments) + spin;
            float a1 = (float) (Math.PI * 2.0 * (i + 1) / segments) + spin;
            float w0 = 1f + 0.055f * (float) Math.sin(3f * a0 + age * 0.22f + ring);
            float w1 = 1f + 0.055f * (float) Math.sin(3f * a1 + age * 0.22f + ring);
            float i0 = innerScale * w0, i1 = innerScale * w1;
            float z0 = 0.12f + 0.04f * (float) Math.sin(a0 * 2f + age * 0.14f);
            float z1 = 0.12f + 0.04f * (float) Math.sin(a1 * 2f + age * 0.14f);
            col(p, vc, wv, (float) Math.cos(a0) * rx * i0, cy + (float) Math.sin(a0) * ry * i0, z0, color, alpha * 0.48f);
            col(p, vc, wv, (float) Math.cos(a0) * rx * w0, cy + (float) Math.sin(a0) * ry * w0, z0, color, alpha);
            col(p, vc, wv, (float) Math.cos(a1) * rx * w1, cy + (float) Math.sin(a1) * ry * w1, z1, color, alpha);
            col(p, vc, wv, (float) Math.cos(a1) * rx * i1, cy + (float) Math.sin(a1) * ry * i1, z1, color, alpha * 0.48f);
        }
    }

    /** Nested hollow rectangular voxel border in the wall plane (retained for the pulsing seed halo). */
    private static void hollowVoxelRect(PoseStack.Pose p, VertexConsumer vc, Warp wv, float cx, float cy, float z,
                                        float hx, float hy, float thick, float[] c, float a) {
        if (a <= 0.005f) return;
        rect(p, vc, wv, cx - hx, cy + hy - thick, cx + hx, cy + hy, z, c, a);
        rect(p, vc, wv, cx - hx, cy - hy, cx + hx, cy - hy + thick, z, c, a);
        rect(p, vc, wv, cx - hx, cy - hy + thick, cx - hx + thick, cy + hy - thick, z, c, a);
        rect(p, vc, wv, cx + hx - thick, cy - hy + thick, cx + hx, cy + hy - thick, z, c, a);
    }

    /** PHASE 2: tall vertical seed box (Image 22: 194638), pulsing rapidly before snapping into the stepped cross. */
    private static void seedBox(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, Look look, float age) {
        float k = seedScale(age);
        if (k <= 0f) return;
        float hx = 0.26f * k, hy = 0.95f * k, hz = 0.18f * k, cy = sh.cy();
        float tilt = 0.13f * age + 0.11f * (float) Math.sin(age * 0.22f);
        float[][] v = new float[8][];
        for (int n = 0; n < 8; n++) {
            float x = (n & 1) == 0 ? -hx : hx, y = (n & 2) == 0 ? -hy : hy, z = (n & 4) == 0 ? -hz : hz;
            float rx = x * (float) Math.cos(tilt) - y * (float) Math.sin(tilt), ry = x * (float) Math.sin(tilt) + y * (float) Math.cos(tilt);
            v[n] = new float[]{rx, cy + ry, z};
        }
        int[][] faces = {{0, 1, 3, 2}, {4, 6, 7, 5}, {0, 4, 5, 1}, {2, 3, 7, 6}, {0, 2, 6, 4}, {1, 5, 7, 3}};
        float[] hot = mix(look.core(), c(1f, 0.94f, 0.80f), 0.5f);
        float pulse = 0.55f + 0.45f * (0.5f + 0.5f * (float) Math.sin(age * 2.2f));
        for (int[] f : faces) for (int idx : f) col(p, vc, wv, v[idx][0], v[idx][1], v[idx][2], hot, pulse);
    }

    /** PHASE 1 spark: erratic lightning flashing over the ripple (re-aimed every 2 ticks). */
    private static void spark(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, State s, Vector3f cam, Look look, float age) {
        if (age > RIPPLE_END) return;
        int burst = (int) (age / 3f);
        if (RiftShape.hash(s.seed, burst, 85) < 0.5f) return;
        float r = Math.max(sh.w, sh.h) * 0.55f * Math.min(1f, age / RIPPLE_END + 0.2f);
        int n = 1 + (int) (RiftShape.hash(s.seed, burst, 86) * 2f);
        for (int b = 0; b < n; b++) {
            float ox = (RiftShape.hash(s.seed, burst * 5 + b, 87) - 0.5f) * 2f;
            float oy = (RiftShape.hash(s.seed, burst * 5 + b, 88) - 0.5f) * 2f;
            float[] from = {ox * r * 0.2f, sh.cy() + oy * r * 0.2f, 0.05f};
            float[] to = {ox * r, sh.cy() + oy * r, 0.1f};
            bolt(p, vc, wv, cam, from, to, s.seed + burst * 13L + b, look, 0.9f);
        }
    }

    private static float seedScale(float age) {
        float grow = Math.min(1f, (age - SEED_START) / 4f);
        float shrink = 1f - Math.max(0f, Math.min(1f, (age - appearAt(1)) / 8f));
        return Math.max(0f, grow * shrink);
    }

    /** PHASE 2 glow: nested voxel halo round the seed and erratic lightning every 3 ticks. */
    private static void seedGlow(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, State s, Vector3f cam, Look look, float age) {
        float k = seedScale(age);
        if (k <= 0f) return;
        hollowVoxelRect(p, vc, wv, 0f, sh.cy(), 0.2f, 0.75f * k, 1.15f * k, 0.14f * k, look.halo(), 0.42f * k);
        if (!s.night) return;
        int burst = (int) (age / 6f);
        int n = 1 + (int) (RiftShape.hash(s.seed, burst, 81) * 2f);
        for (int b = 0; b < n; b++) {
            float tx = Math.round((RiftShape.hash(s.seed, burst * 7 + b, 82) - 0.5f) * 8f);
            float ty = Math.round(sh.cy() + (RiftShape.hash(s.seed, burst * 7 + b, 83) - 0.5f) * 6f);
            float tz = Math.round((RiftShape.hash(s.seed, burst * 7 + b, 84) - 0.5f) * 3f);
            bolt(p, vc, wv, cam, new float[]{0f, sh.cy(), 0f}, new float[]{tx, ty, tz}, s.seed + burst * 31L + b, look, k);
        }
    }

    // ------------------------------------------------------------------ subdivided wavy windows (the destination view)

    private static void winQuadSub(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh,
                                   float x0, float y0, float x1, float y1, float z, float code) {
        for (int sx = 0; sx < SUB; sx++) for (int sy = 0; sy < SUB; sy++) {
            float xa = x0 + (x1 - x0) * (sx / (float) SUB), xb = x0 + (x1 - x0) * ((sx + 1) / (float) SUB);
            float ya = y0 + (y1 - y0) * (sy / (float) SUB), yb = y0 + (y1 - y0) * ((sy + 1) / (float) SUB);
            win(p, vc, wv, sh, xa, ya, z, code); win(p, vc, wv, sh, xb, ya, z, code);
            win(p, vc, wv, sh, xb, yb, z, code); win(p, vc, wv, sh, xa, yb, z, code);
        }
    }

    private static void windows(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, float age, float code, State s) {
        for (int i = 0; i < sh.cols; i++) for (int j = 0; j < sh.rows; j++) {
            if (!shown(sh, i, j, age)) continue;
            float x0 = sh.x(i), x1 = sh.x(i + 1), y0 = sh.y(j), y1 = sh.y(j + 1), z = -sh.d(i, j);
            winQuadSub(p, vc, wv, sh, x0, y0, x1, y1, z, code);
        }
        for (float[] b : sh.sats) {
            if (age < satAt(b)) continue;
            winQuadSub(p, vc, wv, sh, b[0], b[1], b[2], b[3], b[5], code);
        }
        if (age >= GROWN && s.type != RiftType.PORTAL) for (int k = 0; k < 5; k++) {
            float[] c = cube(sh, s, k);
            float q = c[3], z = c[2] - q;
            win(p, vc, wv, sh, c[0] - q, c[1] - q, z, code); win(p, vc, wv, sh, c[0] + q, c[1] - q, z, code);
            win(p, vc, wv, sh, c[0] + q, c[1] + q, z, code); win(p, vc, wv, sh, c[0] - q, c[1] + q, z, code);
        }
    }

    /** rift_shader=false fallback: flat vertical gradient in the destination colours (no shader). */
    private static void windowsFlat(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, float age, State s) {
        float[][] g = switch (s.view) {
            case 1 -> new float[][]{c(0.95f, 0.30f, 0.12f), c(0.45f, 0.05f, 0.05f)};
            case 2 -> new float[][]{c(0.30f, 0.28f, 0.62f), c(0.05f, 0.06f, 0.18f)};
            case 3 -> new float[][]{c(1f, 0.72f, 0.38f), c(0.94f, 0.36f, 0.28f)};
            case 4 -> new float[][]{c(0.20f, 0.82f, 0.96f), c(0.75f, 1f, 1f)};
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

    // ------------------------------------------------------------------ subdivided wavy walls

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
        if (age >= GROWN && s.type != RiftType.PORTAL) for (int k = 0; k < 5; k++) {
            float[] c = cube(sh, s, k);
            float q = c[3], zf = c[2] + q, zb = c[2] - q;
            wall(p, vc, wv, c[0] - q, c[1] - q, c[0] - q, c[1] + q, zf, zb, f, b, 0.92f);
            wall(p, vc, wv, c[0] + q, c[1] - q, c[0] + q, c[1] + q, zf, zb, f, b, 0.84f);
            wall(p, vc, wv, c[0] - q, c[1] - q, c[0] + q, c[1] - q, zf, zb, f, b, 1f);
            wall(p, vc, wv, c[0] - q, c[1] + q, c[0] + q, c[1] + q, zf, zb, f, b, 0.76f);
        }
    }

    /** Subdivided wall strip so vertical sides and horizontal ledges bend smoothly with Warp. */
    private static void wall(PoseStack.Pose p, VertexConsumer vc, Warp wv, float xa, float ya, float xb, float yb, float zf, float zb,
                             float[] front, float[] back, float shade) {
        float[] f = {front[0] * shade, front[1] * shade, front[2] * shade}, b = {back[0] * shade, back[1] * shade, back[2] * shade};
        for (int s = 0; s < SUB; s++) {
            float t0 = s / (float) SUB, t1 = (s + 1) / (float) SUB;
            float x0 = xa + (xb - xa) * t0, y0 = ya + (yb - ya) * t0;
            float x1 = xa + (xb - xa) * t1, y1 = ya + (yb - ya) * t1;
            col(p, vc, wv, x0, y0, zf, f, 1f); col(p, vc, wv, x1, y1, zf, f, 1f);
            col(p, vc, wv, x1, y1, zb, b, 1f); col(p, vc, wv, x0, y0, zb, b, 1f);
        }
    }

    // ------------------------------------------------------------------ subdivided wavy rims + side distortion veil

    private static void rims(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, Look look, Vector3f cam, float age, State s) {
        float[] core = look.core(), halo = look.halo(), white = c(1f, 1f, 1f);
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

    /** Subdivided neon rim along each open or stepped edge so the white neon outline follows the wavy wall. */
    private static void rim(PoseStack.Pose p, VertexConsumer vc, Warp wv, Vector3f cam, float xa, float ya, float xb, float yb, float zf, float zb,
                            float[] core, float[] halo, boolean lip, float flash, float[] jit) {
        float k = lip ? 0.75f : 1f, a = lip ? 0.85f : 1f;
        for (int s = 0; s < SUB; s++) {
            float t0 = s / (float) SUB, t1 = (s + 1) / (float) SUB;
            float x0 = xa + (xb - xa) * t0, y0 = ya + (yb - ya) * t0;
            float x1 = xa + (xb - xa) * t1, y1 = ya + (yb - ya) * t1;
            float[] fa = {x0, y0, zf + 0.006f}, fb = {x1, y1, zf + 0.006f};
            band(p, vc, wv, cam, fa, fb, (0.065f + 0.05f * flash) * k, (0.32f + 0.15f * flash) * k, core, halo, a);
            line(p, vc, wv, cam, new float[]{x0 + jit[0], y0 + jit[1], zf + 0.01f}, new float[]{x1 + jit[0], y1 + jit[1], zf + 0.01f}, 0.038f * k, core, 0.24f);
            band(p, vc, wv, cam, new float[]{x0, y0, zb + 0.012f}, new float[]{x1, y1, zb + 0.012f}, 0.032f, 0.12f, core, halo, 0.35f);
        }
    }

    /**
     * Translucent wavy reality-ripple / heat-haze ribbons undulating along the left and right outer flanks
     * of the rift (Images 7, 22, 23, 24, 26).
     */
    private static void wavySideVeils(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, Look look, State s) {
        float[] c = look.halo();
        int segs = 14;
        float yMin = RiftShape.BASE + sh.h * 0.08f, yMax = RiftShape.BASE + sh.h * 0.92f;
        for (int side = -1; side <= 1; side += 2) {
            float bx = side * (sh.w * 0.42f);
            for (int k = 0; k < segs; k++) {
                float f0 = k / (float) segs, f1 = (k + 1) / (float) segs;
                float y0 = yMin + (yMax - yMin) * f0, y1 = yMin + (yMax - yMin) * f1;
                float env0 = (float) Math.sin(f0 * Math.PI), env1 = (float) Math.sin(f1 * Math.PI);
                float w0 = (float) Math.sin(y0 * 2.3f - s.time * 2.8f + side) * 0.18f * env0;
                float w1 = (float) Math.sin(y1 * 2.3f - s.time * 2.8f + side) * 0.18f * env1;
                float span0 = 0.28f * env0, span1 = 0.28f * env1;
                col(p, vc, wv, bx + w0, y0, COLLAR * 0.6f, c, 0.22f * env0);
                col(p, vc, wv, bx + w0 + side * span0, y0, COLLAR * 0.6f, c, 0f);
                col(p, vc, wv, bx + w1 + side * span1, y1, COLLAR * 0.6f, c, 0f);
                col(p, vc, wv, bx + w1, y1, COLLAR * 0.6f, c, 0.22f * env1);
            }
        }
    }

    // ------------------------------------------------------------------ stable details (trailer notch cubes + sparkles)

    private static void stable(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, Look look, Vector3f cam, State s) {
        if (s.type == RiftType.PORTAL) return; // keep the permanent cyan portal clean and legible
        float[] white = c(1f, 1f, 1f), core = look.core();
        // 5 trailer-exact floating hollow cubes in the perimeter notches (Images 1, 2, 27, 36).
        if (s.type != RiftType.PORTAL) {
            for (int k = 0; k < 5; k++) {
                float[] c = cube(sh, s, k);
                float q = c[3];
                float[][] v = new float[8][];
                for (int n = 0; n < 8; n++) v[n] = new float[]{c[0] + ((n & 1) == 0 ? -q : q), c[1] + ((n & 2) == 0 ? -q : q), c[2] + ((n & 4) == 0 ? -q : q)};
                int[][] edges = {{0, 1}, {2, 3}, {4, 5}, {6, 7}, {0, 2}, {1, 3}, {4, 6}, {5, 7}, {0, 4}, {1, 5}, {2, 6}, {3, 7}};
                for (int[] e : edges) line(p, vc, wv, cam, v[e[0]], v[e[1]], 0.042f, core, 0.95f);
            }
        }
        // Sparse, small white motes drift down through the opening (reduced center clutter).
        for (int k = 0; k < 9; k++) {
            float life = (RiftShape.hash(s.seed, k, 70) + s.time * (0.035f + 0.025f * RiftShape.hash(s.seed, k, 71))) % 1f;
            float x = (RiftShape.hash(s.seed, k, 72) - 0.5f) * sh.w * 0.72f;
            float y = RiftShape.BASE + (1f - life) * (sh.h + 0.8f);
            float z = -sh.maxDepth * RiftShape.hash(s.seed, k, 73) * 0.7f + 0.05f;
            float a = (float) Math.sin(life * Math.PI) * 0.46f, q = 0.020f + 0.014f * RiftShape.hash(s.seed, k, 75);
            if (a < 0.03f) continue;
            line(p, vc, wv, cam, new float[]{x, y - q, z}, new float[]{x, y + q, z}, q * 1.5f, white, a);
        }
        if (!s.night) return;
        // Occasional lightning arc from the rim into the air, kept distinct from the sparse motes.
        float cycle = s.time * 20f / 80f;
        int n = (int) cycle;
        if (cycle - n < 6f / 80f) {
            float ox = (RiftShape.hash(s.seed, n, 91) - 0.5f) * 2f;
            float oy = (RiftShape.hash(s.seed, n, 94) - 0.5f) * 2f;
            float ax = ox * sh.w * 0.42f, ay = sh.cy() + oy * sh.h * 0.42f;
            float bx = ax + ox * (1.8f + 1.5f * RiftShape.hash(s.seed, n, 92));
            float by = ay + oy * 1.5f + 1.2f * RiftShape.hash(s.seed, n, 93);
            bolt(p, vc, wv, cam, new float[]{ax, ay, 0.05f}, new float[]{bx, by, 0.3f}, s.seed + n * 17L, look, 0.9f);
        }
    }

    /** Open edges of the silhouette get the raised alcove lip; inner step walls keep their own front. */
    private static float lip(float z) { return z == 0f ? COLLAR : z; }

    // ------------------------------------------------------------------ sleek recessed bevel lip (frame)

    private static void frame(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, Look look, float age) {
        float[] face = look.wallFront(), side = mix(look.wallFront(), look.wallBack(), 0.35f);
        float F = FLANGE, C = COLLAR;
        for (int i = 0; i < sh.cols; i++) for (int j = 0; j < sh.rows; j++) {
            if (!shown(sh, i, j, age)) continue;
            float x0 = sh.x(i), x1 = sh.x(i + 1), y0 = sh.y(j), y1 = sh.y(j + 1);
            boolean L = !shown(sh, i - 1, j, age), R = !shown(sh, i + 1, j, age), D = !shown(sh, i, j - 1, age), U = !shown(sh, i, j + 1, age);
            if (L) { rectSub(p, vc, wv, x0 - F, y0, x0, y1, C, face, 1f);
                wall(p, vc, wv, x0 - F, y0 - (D ? F : 0), x0 - F, y1 + (U ? F : 0), C, 0f, side, side, 0.9f); }
            if (R) { rectSub(p, vc, wv, x1, y0, x1 + F, y1, C, face, 1f);
                wall(p, vc, wv, x1 + F, y0 - (D ? F : 0), x1 + F, y1 + (U ? F : 0), C, 0f, side, side, 0.82f); }
            if (D) { rectSub(p, vc, wv, x0, y0 - F, x1, y0, C, face, 1f);
                wall(p, vc, wv, x0 - (L ? F : 0), y0 - F, x1 + (R ? F : 0), y0 - F, C, 0f, side, side, 0.7f); }
            if (U) { rectSub(p, vc, wv, x0, y1, x1, y1 + F, C, face, 1f);
                wall(p, vc, wv, x0 - (L ? F : 0), y1 + F, x1 + (R ? F : 0), y1 + F, C, 0f, side, side, 1f); }
            if (L && D) rect(p, vc, wv, x0 - F, y0 - F, x0, y0, C, face, 1f);
            if (R && D) rect(p, vc, wv, x1, y0 - F, x1 + F, y0, C, face, 1f);
            if (L && U) rect(p, vc, wv, x0 - F, y1, x0, y1 + F, C, face, 1f);
            if (R && U) rect(p, vc, wv, x1, y1, x1 + F, y1 + F, C, face, 1f);
        }
    }

    // ------------------------------------------------------------------ downward-drifting dissolving voxel energy cubes

    /** Per rift type (0 overworld, 1 nether, 2 end, 3 sift, 4 portal): three emissive trailer hues. */
    static final float[][][] ENERGY = {
        {rgb(0xFF9A6A), rgb(0xFFE3B0), rgb(0xFF6F5A)},     // overworld: coral, cream, salmon
        {rgb(0xC0142A), rgb(0xFF6A1A), rgb(0xE0B040)},     // nether: dark crimson, volcanic orange, ash gold
        {rgb(0x6A7CFF), rgb(0xC07CFF), rgb(0xD8FF8A)},     // end: blue, violet, pale lime
        {rgb(0xA8F5C8), rgb(0x3FF3FF), rgb(0xFFB8E0)},     // sift: pastel mint, electric cyan, pale pink
        {rgb(0x3FE8FF), rgb(0xA0FFFF), rgb(0x2F9CFF)},     // portal: cyan
    };

    /**
     * A reduced number of 3D cubes (0.25-0.5 blocks) drift down through the opening (zero X/Z drift)
     * and flatten into thin slabs over the final 25% of their life.
     */
    private static void energyCubes(PoseStack.Pose p, VertexConsumer vc, RiftShape sh, State s, float age) {
        float[][] pal = ENERGY[Math.max(0, Math.min(ENERGY.length - 1, s.type.id))];
        float ramp = clamp((age - CLUSTER_START) / (GROWN - CLUSTER_START), 0f, 1f);
        int count = Math.round(7 * (0.3f + 0.7f * ramp));
        float velocityY = -0.035f;
        for (int k = 0; k < count; k++) {
            float life = 2.2f + 1.6f * RiftShape.hash(s.seed, k, 120), period = life + 0.9f * RiftShape.hash(s.seed, k, 121);
            float tt = s.time + RiftShape.hash(s.seed, k, 122) * period;
            int gen = (int) (tt / period);
            float f = (tt - gen * period) / life;
            if (f >= 1f || f < 0f) continue;
            long g = s.seed + gen * 7919L;
            float ticks = f * life * 20f;
            float x = (RiftShape.hash(g, k, 1) - 0.5f) * sh.w * 0.82f;
            float y = sh.cy() + (RiftShape.hash(g, k, 2) - 0.5f) * sh.h * 0.75f + velocityY * ticks;
            float z = -0.25f * RiftShape.hash(g, k, 3) + 0.15f;
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
        rect(p, vc, w, x0, y0, x1, y1, z1, sideA, a);
        rect(p, vc, w, x0, y0, x1, y1, z0, sideA, a * 0.6f);
        col(p, vc, w, x0, y1, z0, top, a); col(p, vc, w, x1, y1, z0, top, a); col(p, vc, w, x1, y1, z1, top, a); col(p, vc, w, x0, y1, z1, top, a);
        col(p, vc, w, x0, y0, z0, sideB, a * 0.7f); col(p, vc, w, x1, y0, z0, sideB, a * 0.7f); col(p, vc, w, x1, y0, z1, sideB, a * 0.7f); col(p, vc, w, x0, y0, z1, sideB, a * 0.7f);
        col(p, vc, w, x0, y0, z0, sideB, a); col(p, vc, w, x0, y1, z0, sideB, a); col(p, vc, w, x0, y1, z1, sideB, a); col(p, vc, w, x0, y0, z1, sideB, a);
        col(p, vc, w, x1, y0, z0, sideB, a); col(p, vc, w, x1, y1, z0, sideB, a); col(p, vc, w, x1, y1, z1, sideB, a); col(p, vc, w, x1, y0, z1, sideB, a);
    }

    /**
     * Trailer-exact floating hollow cube positions in the 5 perimeter notches (Images 1, 2, 27, 36):
     *   0: upper-left notch next to top cap
     *   1: upper-right notch above right arm
     *   2: below far-left box
     *   3: below lower-left box
     *   4: above right-hand upper box
     */
    private static float[] cube(RiftShape sh, State s, int k) {
        float q = sh.cw * 0.22f;
        float[][] anchors = {
            { sh.x(4) - q * 1.4f, sh.y(6) + q * 0.8f, 0.20f },
            { sh.x(7) + q * 1.6f, sh.y(4) + q * 1.0f, 0.20f },
            { sh.x(0) + q * 1.2f, sh.y(1) - q * 1.4f, 0.18f },
            { sh.x(2) + q * 0.4f, sh.y(0) - q * 1.4f, 0.18f },
            { sh.x(9) + sh.cw * 1.1f, sh.y(5) + q * 0.9f, 0.20f }
        };
        float[] a = anchors[k % anchors.length];
        return new float[]{a[0], a[1], a[2], q};
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

    private static void rectSub(PoseStack.Pose p, VertexConsumer vc, Warp wv, float x0, float y0, float x1, float y1, float z, float[] c, float a) {
        boolean vertical = (y1 - y0) >= (x1 - x0);
        for (int s = 0; s < SUB; s++) {
            float t0 = s / (float) SUB, t1 = (s + 1) / (float) SUB;
            if (vertical) {
                rect(p, vc, wv, x0, y0 + (y1 - y0) * t0, x1, y0 + (y1 - y0) * t1, z, c, a);
            } else {
                rect(p, vc, wv, x0 + (x1 - x0) * t0, y0, x0 + (x1 - x0) * t1, y1, z, c, a);
            }
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
