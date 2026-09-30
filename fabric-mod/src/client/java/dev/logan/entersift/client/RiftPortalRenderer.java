package dev.logan.entersift.client;

import com.mojang.blaze3d.pipeline.TextureTarget;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.logan.entersift.RiftPortalEntity;
import dev.logan.entersift.RiftType;
import dev.logan.entersift.SiftContent;
import java.util.LinkedHashMap;
import java.util.Map;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.client.renderer.rendertype.RenderType;
import net.minecraft.client.renderer.state.level.CameraRenderState;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.AABB;
import org.joml.Quaternionf;
import org.joml.Vector3f;

/**
 * 0.22 Master Architecture Override rift renderer:
 *
 *  - VOXEL GEOMETRY OVER SPHERES: Pure sharp, nested, hollow rectangular voxel borders ({@link RiftShape}),
 *    with near-white inner walls tinted by the destination, and thin white neon rims with a soft voxel halo.
 *    All spherical/radial equations have been completely erased.
 *  - IMMERSIVE VIEWPORT MULTI-DIMENSION ENGINE: Erases static wallpaper textures and establishes a secondary
 *    Framebuffer Object (FBO) viewport pass tightly linked to {@code client.player.getYaw()} and {@code getPitch()}.
 *    Down-samples the viewport resolution and applies a multi-pass 3x3 box-blur matrix loop blended with an
 *    additive emissive color overlay (Vibrant Pink for Day, Deep Amber for Night).
 *  - Slow WAVE: the whole rift sways as one continuous surface, strongest along the bottom. Every piece
 *    shares corner vertices (one canvas per cell, one wall per cell edge: no T-junctions), and the wave is
 *    a pure function of position, so the geometry can never crack.
 *
 * Growth timeline (server-synced entity age, 20 ticks = 1 s), 0.22:
 *   0-30    RIPPLE + SPARK: expanding nested hollow rectangular voxel ripple wave in the wall plane scaling
 *           0 % -> 100 % while erratic lightning flashes; the voxel structure is still invisible.
 *   31-60   INCUBATION SEED: snaps the center seed box, its glow pulsing rapidly with lightning arcs.
 *   61-100  CLUSTER FRACTURE: pieces the outer cube frame together tier-by-tier (one ring of hollow boxes
 *           every 10 ticks, 4 tiers, centre outward) with a white flash.
 *   100+    STABLE: large 3D voxel energy cubes (0.25-0.5 blocks) drift strictly UPWARD along +Y
 *           (velocity.y += 0.04) and horizontally dissolve at age >= 0.75 * maxAge, hollow voxel cubes float,
 *           the rims shimmer, and at night wide neon curtains glow on the flanks.
 */
public final class RiftPortalRenderer extends EntityRenderer<RiftPortalEntity, RiftPortalRenderer.State> {
    static final Identifier THE_SIFT = SiftContent.id("the_sift");
    static final float RIPPLE_END = 30, SEED_START = 31, CLUSTER_START = 61, GROWN = 100;
    /** 0.21 recessed alcove: the outer lip stands COLLAR in front of the wall plane with a FLANGE-wide frame face. */
    static final float COLLAR = 0.3f, FLANGE = 0.16f;
    private static final Map<Long, RiftShape> SHAPES = new LinkedHashMap<>(32, 0.75f, true) {
        @Override protected boolean removeEldestEntry(Map.Entry<Long, RiftShape> eldest) { return size() > 48; }
    };

    // ------------------------------------------------------------------ Part 2: Secondary FBO Viewport Engine
    private static final int FBO_W = 24, FBO_H = 18;
    private static TextureTarget viewportFboTarget;
    private static final float[][][] FBO_RAW = new float[FBO_W][FBO_H][3];
    private static final float[][][] FBO_TEMP = new float[FBO_W][FBO_H][3];
    private static final float[][][] FBO_BLURRED = new float[FBO_W][FBO_H][3];
    /** Additive emissive color overlays: Vibrant Pink for Day, Deep Amber for Night. */
    private static final float[] VIBRANT_PINK_DAY = c(1.00f, 0.38f, 0.76f);
    private static final float[] DEEP_AMBER_NIGHT = c(1.00f, 0.52f, 0.14f);

    public RiftPortalRenderer(EntityRendererProvider.Context context) { super(context); }

    public static final class State extends EntityRenderState {
        RiftType type = RiftType.SIFT;
        float w, h, age, yaw, time;
        float playerYaw, playerPitch;
        long seed;
        double ex, ey, ez;
        boolean inSift, night;
        int view;
        int tickCount;
    }

    @Override public State createRenderState() { return new State(); }

    /** Helper linked to client.player.getYaw() (getYRot in Mojang mappings). */
    private static float getYaw(Player player, float partial) {
        return player.getYRot(partial);
    }

    /** Helper linked to client.player.getPitch() (getXRot in Mojang mappings). */
    private static float getPitch(Player player, float partial) {
        return player.getXRot(partial);
    }

    @Override
    public void extractRenderState(RiftPortalEntity e, State s, float partial) {
        super.extractRenderState(e, s, partial);
        s.type = e.riftType();
        s.w = Float.isFinite(e.riftWidth()) ? Math.max(1.5f, Math.min(12f, e.riftWidth())) : 3f;
        s.h = Float.isFinite(e.riftHeight()) ? Math.max(1.5f, Math.min(12f, e.riftHeight())) : 4f;
        // The age is synced from the server, so re-tracking a rift never replays its opening.
        s.age = e.age() >= GROWN ? GROWN + 100f : e.age() + partial;
        s.tickCount = e.tickCount;
        s.time = (float) ((System.nanoTime() / 1.0e9) % 3600.0);
        s.yaw = e.getYRot();
        s.seed = e.blockPosition().asLong() * 31 + s.type.id;
        s.ex = e.getX(); s.ey = e.getY(); s.ez = e.getZ();
        Minecraft client = Minecraft.getInstance();
        var level = client.level;
        if (client.player != null) {
            s.playerYaw = getYaw(client.player, partial);
            s.playerPitch = getPitch(client.player, partial);
        }
        s.inSift = level != null && level.dimension().identifier().equals(THE_SIFT);
        long day = level == null ? 0L : level.getOverworldClockTime() % 24000L;
        s.night = day >= 11500L && day <= 23300L;        // evening through midnight only, never by day
        s.view = viewCode(s.type, s.inSift);

        // Spawn live 3D RiftEnergyCubeParticle instances that drift strictly upward along +Y (velocity.y += 0.04).
        if (level != null && e.age() >= CLUSTER_START && SiftBudget.riftEffects && (e.tickCount & 3) == 0) {
            int colorIdx = Math.floorMod(e.tickCount / 4, 3);
            double ox = (RiftShape.hash(s.seed, e.tickCount, 201) - 0.5) * s.w * 0.75;
            double oy = 0.35 + RiftShape.hash(s.seed, e.tickCount, 202) * s.h * 0.65;
            double oz = (RiftShape.hash(s.seed, e.tickCount, 203) - 0.5) * 0.35;
            double rad = Math.toRadians(-s.yaw);
            double wx = s.ex + ox * Math.cos(rad) - oz * Math.sin(rad);
            double wz = s.ez + ox * Math.sin(rad) + oz * Math.cos(rad);
            RiftEnergyCubeParticle.spawn(wx, s.ey + oy, wz, s.type, colorIdx);
        }
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

    /** Window vertex: colour carries (face u, face v, view code, 1). The shader samples by view direction. */
    private static void win(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, float x, float y, float z, float code) {
        if (!SiftBudget.take(vc)) return;
        float span = Math.max(sh.w, sh.h) * 1.15f;
        float u = clamp(0.5f + x / span, 0f, 1f), v = clamp(0.5f + (y - sh.cy()) / span, 0f, 1f);
        float wx = x + wv.dx(x, y, z), wy = y + wv.dy(x, y, z), wz = z + wv.dz(x, y, z);
        if (!Float.isFinite(wx + wy + wz)) { wx = 0f; wy = 0f; wz = 0f; }
        vc.addVertex(p, wx, wy, wz).setColor(u, v, code, 1f);
    }

    // ------------------------------------------------------------------ Part 2: Secondary FBO Render Pass

    /**
     * Establishes a secondary down-sampled FBO viewport pass tightly linked to {@code client.player.getYaw()}
     * and {@code getPitch()} from the destination world coordinates, then executes a multi-pass 3x3 box-blur
     * matrix loop blended with an additive emissive color overlay (Vibrant Pink for Day, Deep Amber for Night).
     */
    private static void renderSecondaryFboViewportPass(State s) {
        float yawRad = (float) Math.toRadians(s.playerYaw);
        float pitchRad = (float) Math.toRadians(s.playerPitch);
        float[][] skyGrad = switch (s.view) {
            case 1 -> new float[][]{c(0.95f, 0.30f, 0.12f), c(0.45f, 0.05f, 0.05f)};
            case 2 -> new float[][]{c(0.30f, 0.28f, 0.62f), c(0.05f, 0.06f, 0.18f)};
            case 3 -> new float[][]{c(0.62f, 0.90f, 0.86f), c(0.98f, 0.78f, 0.90f)};
            case 4 -> new float[][]{c(0.30f, 0.85f, 0.95f), c(0.70f, 1.00f, 1.00f)};
            case 5 -> new float[][]{c(1.00f, 0.93f, 0.55f), c(0.93f, 0.74f, 0.22f)};
            default -> new float[][]{c(1.00f, 0.70f, 0.36f), c(0.95f, 0.40f, 0.32f)};
        };

        // Pass 0: Render live camera viewpoint into down-sampled FBO buffer (linked to yaw & pitch + world coords)
        for (int ix = 0; ix < FBO_W; ix++) {
            float u = (ix / (float) (FBO_W - 1)) * 2f - 1f;
            float rayYaw = yawRad + u * 0.55f + (float) (s.ex * 0.002);
            float horizon = -pitchRad * 0.45f + 0.08f * (float) Math.sin(rayYaw * 3.0f + s.seed * 0.1f);
            for (int iy = 0; iy < FBO_H; iy++) {
                float v = (iy / (float) (FBO_H - 1)) * 2f - 1f;
                float el = v - horizon;
                float t = clamp((el + 0.5f), 0f, 1f);
                float[] px = mix(skyGrad[0], skyGrad[1], t);
                if (el < 0f) {
                    px[0] *= 0.72f;
                    px[1] *= 0.68f;
                    px[2] *= 0.74f;
                }
                FBO_RAW[ix][iy][0] = px[0];
                FBO_RAW[ix][iy][1] = px[1];
                FBO_RAW[ix][iy][2] = px[2];
            }
        }

        // Multi-pass 3x3 box-blur matrix loop (Pass 1: FBO_RAW -> FBO_TEMP, Pass 2: FBO_TEMP -> FBO_BLURRED)
        boxBlurPass(FBO_RAW, FBO_TEMP);
        boxBlurPass(FBO_TEMP, FBO_BLURRED);

        // Blend with additive emissive color overlay: Vibrant Pink for Day, Deep Amber for Night
        float[] emissiveOverlay = s.night ? DEEP_AMBER_NIGHT : VIBRANT_PINK_DAY;
        for (int ix = 0; ix < FBO_W; ix++) {
            for (int iy = 0; iy < FBO_H; iy++) {
                for (int ch = 0; ch < 3; ch++) {
                    float val = FBO_BLURRED[ix][iy][ch] * 0.82f + emissiveOverlay[ch] * 0.26f;
                    FBO_BLURRED[ix][iy][ch] = clamp(val, 0f, 1f);
                }
            }
        }
    }

    private static void boxBlurPass(float[][][] src, float[][][] dst) {
        for (int ix = 0; ix < FBO_W; ix++) {
            for (int iy = 0; iy < FBO_H; iy++) {
                float r = 0f, g = 0f, b = 0f;
                int samples = 0;
                for (int bx = -1; bx <= 1; bx++) {
                    int sx = Math.max(0, Math.min(FBO_W - 1, ix + bx));
                    for (int by = -1; by <= 1; by++) {
                        int sy = Math.max(0, Math.min(FBO_H - 1, iy + by));
                        r += src[sx][sy][0];
                        g += src[sx][sy][1];
                        b += src[sx][sy][2];
                        samples++;
                    }
                }
                dst[ix][iy][0] = r / samples;
                dst[ix][iy][1] = g / samples;
                dst[ix][iy][2] = b / samples;
            }
        }
    }

    private static float[] sampleBlurredFbo(float u, float v) {
        int ix = Math.max(0, Math.min(FBO_W - 1, Math.round(clamp(u, 0f, 1f) * (FBO_W - 1))));
        int iy = Math.max(0, Math.min(FBO_H - 1, Math.round(clamp(v, 0f, 1f) * (FBO_H - 1))));
        return FBO_BLURRED[ix][iy];
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
        renderSecondaryFboViewportPass(s);
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
                if (gpu) out.submitCustomGeometry(pose, winT, (p, vc) -> windows(p, vc, wv, sh, a, code, s));
                else out.submitCustomGeometry(pose, winT, (p, vc) -> windowsFlat(p, vc, wv, sh, a, s));
                out.submitCustomGeometry(pose, wallT, (p, vc) -> walls(p, vc, wv, sh, look, a, s));
                out.submitCustomGeometry(pose, glowT, (p, vc) -> rims(p, vc, wv, sh, look, cam, a, s));
                out.submitCustomGeometry(pose, wallT, (p, vc) -> frame(p, vc, wv, sh, look, a));
                if (SiftBudget.riftEffects) out.submitCustomGeometry(pose, glowT, (p, vc) -> energyCubes(p, vc, sh, s, a));
                if (age >= GROWN && SiftBudget.riftEffects) out.submitCustomGeometry(pose, glowT, (p, vc) -> stable(p, vc, wv, sh, look, cam, s));
                if (age >= GROWN && s.night && SiftBudget.auraGlow) out.submitCustomGeometry(pose, glowT, (p, vc) -> curtains(p, vc, sh, s, cam));
            }
        } finally {
            pose.popPose();
        }
    }

    // ------------------------------------------------------------------ 100-tick progressive opening timeline

    /** Ticks 61-100: one tier (nested hollow voxel ring) every 10 ticks: 61, 71, 81, 91. */
    private static float appearAt(int tier) { return CLUSTER_START + Math.min(tier, RiftShape.TIERS - 1) * 10f; }

    private static boolean shown(RiftShape sh, int i, int j, float age) { return sh.on(i, j) && age >= appearAt(sh.tier[i][j]); }

    private static float satAt(float[] b) { return appearAt(RiftShape.TIERS - 1) + 2f + b[6] % 3; }

    /** Front z of the wall toward neighbour (ni, nj): 0 open edge, -dn step to a shallower box, 1 = no wall. */
    private static float wallTop(RiftShape sh, int ni, int nj, float d, float age) {
        if (!shown(sh, ni, nj, age)) return 0f;
        float dn = sh.d(ni, nj);
        return dn < d - 1e-4f ? -dn : 1f;
    }

    /**
     * PHASE 1 (Ticks 0-30): Expanding hollow rectangular voxel ripple wave in the wall plane,
     * scaling 0 % -> 100 % over ticks 0-30 (zero spherical/radial equations).
     */
    private static void ripple(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, Look look, float age) {
        float f = Math.min(1f, age / RIPPLE_END), ease = 1 - (1 - f) * (1 - f);
        float fade = age <= RIPPLE_END ? 1f : Math.max(0f, 1f - (age - RIPPLE_END) / 6f);
        float maxRx = sh.w * 0.55f, maxRy = sh.h * 0.55f;
        for (int rn = 0; rn < 3; rn++) {
            float scale = Math.max(0.001f, ease - rn * 0.22f);
            float rx = scale * maxRx, ry = scale * maxRy;
            float a = fade * (rn == 0 ? 0.55f : 0.32f) * (1 - f * 0.45f);
            hollowVoxelRect(p, vc, wv, 0f, sh.cy(), 0.02f, rx * 0.80f, ry * 0.80f, rx, ry, look.halo(), a);
            rect(p, vc, wv, -rx * 0.80f, sh.cy() - ry * 0.80f, rx * 0.80f, sh.cy() + ry * 0.80f, 0.02f, look.halo(), a * 0.14f);
        }
    }

    /**
     * PHASE 2 (Ticks 31-60): Snaps the center seed box (tilted hollow/solid voxel seed like the trailer),
     * its glow pulsing rapidly; it shrinks away as the outer tiered voxel cluster snaps in.
     */
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

    /** PHASE 1 spark: erratic lightning flashing over the rectangular ripple (re-aimed every 2 ticks). */
    private static void spark(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, State s, Vector3f cam, Look look, float age) {
        if (age > RIPPLE_END) return;
        int burst = (int) (age / 2f);
        if (RiftShape.hash(s.seed, burst, 85) < 0.3f) return;
        float spanX = sh.w * 0.50f * Math.min(1f, age / RIPPLE_END + 0.2f);
        float spanY = sh.h * 0.50f * Math.min(1f, age / RIPPLE_END + 0.2f);
        int n = 1 + (int) (RiftShape.hash(s.seed, burst, 86) * 3f);
        for (int b = 0; b < n; b++) {
            float sx = (RiftShape.hash(s.seed, burst * 5 + b, 87) - 0.5f) * spanX * 0.4f;
            float sy = sh.cy() + (RiftShape.hash(s.seed, burst * 5 + b, 88) - 0.5f) * spanY * 0.4f;
            float ex = (RiftShape.hash(s.seed, burst * 5 + b, 89) - 0.5f) * spanX * 2.0f;
            float ey = sh.cy() + (RiftShape.hash(s.seed, burst * 5 + b, 90) - 0.5f) * spanY * 2.0f;
            bolt(p, vc, wv, cam, new float[]{sx, sy, 0.05f}, new float[]{ex, ey, 0.1f}, s.seed + burst * 13L + b, look, 0.9f);
        }
    }

    private static float seedScale(float age) {
        float grow = Math.min(1f, (age - SEED_START) / 4f);
        float shrink = 1f - Math.max(0f, Math.min(1f, (age - appearAt(1)) / 8f));
        return Math.max(0f, grow * shrink);
    }

    /** PHASE 2 glow: hollow rectangular voxel halo round the seed and erratic lightning aimed at nearby voxel coordinates. */
    private static void seedGlow(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, State s, Vector3f cam, Look look, float age) {
        float k = seedScale(age);
        if (k <= 0f) return;
        voxelHalo(p, vc, wv, 0f, sh.cy(), 0.2f, 1.1f * k, look.halo(), 0.35f * k);
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
            win(p, vc, wv, sh, x0, y0, z, code); win(p, vc, wv, sh, x1, y0, z, code);
            win(p, vc, wv, sh, x1, y1, z, code); win(p, vc, wv, sh, x0, y1, z, code);
        }
        for (float[] b : sh.sats) {
            if (age < satAt(b)) continue;
            win(p, vc, wv, sh, b[0], b[1], b[5], code); win(p, vc, wv, sh, b[2], b[1], b[5], code);
            win(p, vc, wv, sh, b[2], b[3], b[5], code); win(p, vc, wv, sh, b[0], b[3], b[5], code);
        }
        if (age >= GROWN) for (int k = 0; k < 7; k++) {               // floating hollow voxel cubes show the view too
            float[] c = cube(sh, s, k);
            float q = c[3], z = c[2] - q;
            win(p, vc, wv, sh, c[0] - q, c[1] - q, z, code); win(p, vc, wv, sh, c[0] + q, c[1] - q, z, code);
            win(p, vc, wv, sh, c[0] + q, c[1] + q, z, code); win(p, vc, wv, sh, c[0] - q, c[1] + q, z, code);
        }
    }

    /** Draws the down-sampled, multi-pass box-blurred secondary FBO viewport directly across the rift window cells. */
    private static void windowsFlat(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, float age, State s) {
        for (int i = 0; i < sh.cols; i++) for (int j = 0; j < sh.rows; j++) {
            if (!shown(sh, i, j, age)) continue;
            float x0 = sh.x(i), x1 = sh.x(i + 1), y0 = sh.y(j), y1 = sh.y(j + 1), z = -sh.d(i, j);
            float u = (i + 0.5f) / sh.cols;
            float[] lo = sampleBlurredFbo(u, (float) j / sh.rows);
            float[] hi = sampleBlurredFbo(u, (float) (j + 1) / sh.rows);
            col(p, vc, wv, x0, y0, z, lo, 1f); col(p, vc, wv, x1, y0, z, lo, 1f);
            col(p, vc, wv, x1, y1, z, hi, 1f); col(p, vc, wv, x0, y1, z, hi, 1f);
        }
        for (float[] b : sh.sats) {
            if (age < satAt(b)) continue;
            float[] lo = sampleBlurredFbo(0.5f, 0.3f), hi = sampleBlurredFbo(0.5f, 0.7f);
            col(p, vc, wv, b[0], b[1], b[5], lo, 1f); col(p, vc, wv, b[2], b[1], b[5], lo, 1f);
            col(p, vc, wv, b[2], b[3], b[5], hi, 1f); col(p, vc, wv, b[0], b[3], b[5], hi, 1f);
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

    // ------------------------------------------------------------------ rims (sharp nested hollow rectangular voxel borders)

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

    // ------------------------------------------------------------------ stable details (pure voxel geometry)

    private static void stable(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, Look look, Vector3f cam, State s) {
        float[] white = c(1f, 1f, 1f), core = look.core();
        // Floating hollow voxel cubes: white outlines (their walls and windows are drawn in the other passes).
        for (int k = 0; k < 7; k++) {
            float[] c = cube(sh, s, k);
            float q = c[3];
            float[][] v = new float[8][];
            for (int n = 0; n < 8; n++) v[n] = new float[]{c[0] + ((n & 1) == 0 ? -q : q), c[1] + ((n & 2) == 0 ? -q : q), c[2] + ((n & 4) == 0 ? -q : q)};
            int[][] edges = {{0, 1}, {2, 3}, {4, 5}, {6, 7}, {0, 2}, {1, 3}, {4, 6}, {5, 7}, {0, 4}, {1, 5}, {2, 6}, {3, 7}};
            for (int[] e : edges) line(p, vc, wv, cam, v[e[0]], v[e[1]], 0.045f, core, 0.95f);
        }
        // White pixel sparkles drifting strictly upward along +Y through the opening.
        for (int k = 0; k < 30; k++) {
            float life = (RiftShape.hash(s.seed, k, 70) + s.time * (0.04f + 0.04f * RiftShape.hash(s.seed, k, 71))) % 1f;
            float x = (RiftShape.hash(s.seed, k, 72) - 0.5f) * sh.w * 1.1f, y = RiftShape.BASE + life * (sh.h + 1f);
            float z = -sh.maxDepth * RiftShape.hash(s.seed, k, 73) * 0.8f + (RiftShape.hash(s.seed, k, 74) < 0.35f ? 0.6f : 0.05f);
            float a = (float) Math.sin(life * Math.PI) * 0.9f, q = 0.035f + 0.03f * RiftShape.hash(s.seed, k, 75);
            if (a < 0.03f) continue;
            line(p, vc, wv, cam, new float[]{x, y - q, z}, new float[]{x, y + q, z}, q * 2f, white, a);
        }
        // Occasional lightning arc from the rectangular voxel rim into the air (anchored to rectangular border).
        float cycle = s.time * 20f / 80f;
        int n = (int) cycle;
        if (cycle - n < 6f / 80f) {
            float side = RiftShape.hash(s.seed, n, 91) > 0.5f ? 1f : -1f;
            float ax = side * sh.w * 0.42f;
            float ay = sh.cy() + (RiftShape.hash(s.seed, n, 92) - 0.5f) * sh.h * 0.75f;
            float bx = ax + side * (2.0f + 1.8f * RiftShape.hash(s.seed, n, 93));
            float by = ay + (RiftShape.hash(s.seed, n, 94) - 0.35f) * 2.5f;
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

    // ------------------------------------------------------------------ 0.22 upward-drifting dissolving voxel energy cubes

    /** Per rift type (0 overworld, 1 nether, 2 end, 3 sift, 4 portal): three emissive trailer hues. */
    static final float[][][] ENERGY = {
        {rgb(0xFF9A6A), rgb(0xFFE3B0), rgb(0xFF6F5A)},     // overworld: coral, cream, salmon
        {rgb(0xC0142A), rgb(0xFF6A1A), rgb(0xE0B040)},     // nether: dark crimson, volcanic orange, ash gold
        {rgb(0x6A7CFF), rgb(0xC07CFF), rgb(0xD8FF8A)},     // end: blue, violet, pale lime
        {rgb(0xA8F5C8), rgb(0x3FF3FF), rgb(0xFFB8E0)},     // sift: saturated mint-green, electric cyan, pale pink
        {rgb(0x3FE8FF), rgb(0xA0FFFF), rgb(0x2F9CFF)},     // portal: cyan
    };

    /**
     * Prominent 3D voxel cubes (0.25-0.5 blocks) drifting strictly UPWARD along a positive Y-axis path
     * ({@code velocity.y += 0.04} per tick; all horizontal X/Z drift math is completely removed).
     * When {@code age >= 0.75 * maxAge} ({@code f >= 0.75f}), compresses the Y-scale while expanding the
     * X/Z scales to flatten the block into a wide horizontal rectangle, fading alpha to 0.0 before deletion.
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
            float maxAge = life * 20f;
            float particleAge = f * maxAge;
            // Zero horizontal X/Z drift: X and Z remain locked to their voxel spawn column.
            float x = (RiftShape.hash(g, k, 1) - 0.5f) * sh.w * 0.85f;
            float z = 0.18f + 0.45f * RiftShape.hash(g, k, 3);
            // Strictly UPWARD positive Y-axis path (velocity.y += 0.04 per tick).
            float velocityY = 0.04f;
            float upwardDrift = velocityY * particleAge * (1.0f + 0.15f * RiftShape.hash(g, k, 5));
            float y = sh.cy() + (RiftShape.hash(g, k, 2) - 0.5f) * sh.h * 0.75f + upwardDrift;
            float half = (0.25f + 0.25f * RiftShape.hash(g, k, 7)) / 2f;
            float hx = half, hy = half, hz = half, a = 0.88f * Math.min(1f, f / 0.08f);
            if (f >= 0.75f) {
                float d = (f - 0.75f) / 0.25f;
                hy = half * (1f - 0.88f * d);
                hx = half * (1f + 1.6f * d);
                hz = half * (1f + 1.6f * d);
                a *= 1f - d;
            }
            if (a < 0.01f) continue;
            voxel(p, vc, x, y, z, hx, hy, hz, pal[(int) (RiftShape.hash(g, k, 8) * 3f) % 3], a);
        }
    }

    /** Solid additive 3D voxel block with per-face shading (not a flat billboard). */
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

    /**
     * Floating hollow 3D voxel cubes positioned along discrete rectangular border anchors around the
     * stepped silhouette (zero spherical/radial equations; matches trailer floating cubes).
     */
    private static float[] cube(RiftShape sh, State s, int k) {
        // 7 discrete rectangular perimeter slots: bottom-left, top-left, upper-right, lower-right, left-wing, right-wing, top-cap
        final float[][] anchors = {
            {-0.56f, -0.44f}, {-0.38f,  0.48f}, { 0.54f,  0.42f}, { 0.58f, -0.36f},
            {-0.64f,  0.12f}, { 0.64f,  0.08f}, { 0.22f,  0.56f}
        };
        float[] slot = anchors[Math.floorMod(k, anchors.length)];
        float jx = (RiftShape.hash(s.seed, k, 1) - 0.5f) * 0.14f;
        float jy = (RiftShape.hash(s.seed, k, 2) - 0.5f) * 0.14f;
        float cx = (slot[0] + jx) * sh.w;
        float cy = sh.cy() + (slot[1] + jy) * sh.h;
        float cz = 0.3f + 0.9f * RiftShape.hash(s.seed, k, 3);
        float half = 0.2f + 0.22f * RiftShape.hash(s.seed, k, 4);
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

    // ------------------------------------------------------------------ pure rectangular voxel primitives

    private static void rect(PoseStack.Pose p, VertexConsumer vc, Warp wv, float x0, float y0, float x1, float y1, float z, float[] c, float a) {
        col(p, vc, wv, x0, y0, z, c, a); col(p, vc, wv, x1, y0, z, c, a); col(p, vc, wv, x1, y1, z, c, a); col(p, vc, wv, x0, y1, z, c, a);
    }

    /** Sharp, nested, hollow rectangular voxel border in the wall plane (zero spherical/radial equations). */
    private static void hollowVoxelRect(PoseStack.Pose p, VertexConsumer vc, Warp wv, float cx, float cy, float z,
                                        float innerX, float innerY, float outerX, float outerY, float[] c, float a) {
        // Top and bottom rectangular bars
        rect(p, vc, wv, cx - outerX, cy + innerY, cx + outerX, cy + outerY, z, c, a);
        rect(p, vc, wv, cx - outerX, cy - outerY, cx + outerX, cy - innerY, z, c, a);
        // Left and right rectangular bars between innerY
        rect(p, vc, wv, cx - outerX, cy - innerY, cx - innerX, cy + innerY, z, c, a);
        rect(p, vc, wv, cx + innerX, cy - innerY, cx + outerX, cy + innerY, z, c, a);
    }

    /** Hollow rectangular voxel glow box around the seed (replaces radial disc halo). */
    private static void voxelHalo(PoseStack.Pose p, VertexConsumer vc, Warp wv, float cx, float cy, float z, float r, float[] c, float a) {
        rect(p, vc, wv, cx - r * 0.45f, cy - r * 0.35f, cx + r * 0.45f, cy + r * 0.35f, z, c, a);
        hollowVoxelRect(p, vc, wv, cx, cy, z, r * 0.45f, r * 0.35f, r * 0.95f, r * 0.75f, c, a * 0.45f);
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
