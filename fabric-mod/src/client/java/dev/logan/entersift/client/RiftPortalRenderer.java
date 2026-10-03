package dev.logan.entersift.client;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.logan.entersift.RiftPortalEntity;
import dev.logan.entersift.RiftShape;
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
 * 0.36 shader-plane rift.
 *
 * The opening is one world-positioned quad — the shape. The stepped silhouette, symmetrical outline,
 * frosted destination, ripple, hollow border fragments and the birth sequence are all in
 * {@code assets/entersift/shaders/core/rift.fsh} (the rendertype_rift_portal program). There is no
 * block mesh, no cube loop and no particle storm standing in for the border. Rising energy cubes
 * stay a separate, sparse particle.
 *
 * Canvas cell extents ({@link #U0}..{@link #V1}) are duplicated in the shader and must stay in sync.
 */
public final class RiftPortalRenderer extends EntityRenderer<RiftPortalEntity, RiftPortalRenderer.State> {
    static final Identifier THE_SIFT = SiftContent.id("the_sift");
    static final float GROWN = 100f;
    /** Cell-space extents of the canvas. The body occupies x 0..11, y 0..8; the margin holds fragments and bolts. */
    static final float U0 = -4.5f, U1 = 15.5f, V0 = -4.0f, V1 = 12.0f;
    static final int SUB_X = 6, SUB_Y = 8;
    static final float FROST_NEAR = 7.5f, FROST_CLEAR = 1.6f, FROST_ALPHA = 0.5f;
    static final float FADE_NEAR = 0.06f, FADE_FAR = 1.0f;
    static final float[] VIBRANT_PINK_DAY = rgb(0xFF6FA8);
    static final float[] DEEP_AMBER_NIGHT = rgb(0xDB7840);
    /** Blue / magenta curtain hues, used when the GPU shader is off so the fallback still reads as a rift. */
    static final float[][] CURTAIN = {rgb(0x2F6BFF), rgb(0x9FF6FF), rgb(0xD13CFF), rgb(0x7A3CFF)};

    private static final Map<Integer, Integer> LAST_MOTE = new LinkedHashMap<>(32, 0.75f, true) {
        @Override protected boolean removeEldestEntry(Map.Entry<Integer, Integer> eldest) { return size() > 64; }
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
        s.view = viewCode(s.type, s.inSift, s.seed);
        motes(e, s);
    }

    @Override
    protected AABB getBoundingBoxForCulling(RiftPortalEntity e, float partial) {
        float r = Math.max(e.riftWidth(), e.riftHeight()) * 0.9f + 6f;
        return e.getBoundingBox().inflate(r, r * 1.4f, r);
    }

    /**
     * The window's style index. 0-5 are the destinations; 6 and 7 are the reference styles (white cross and
     * the steep olive wall). Rift types 1 and 2 alternate between the plain destination colour and a
     * reference style so every world shows several colours of rift, as the references do.
     */
    static int viewCode(RiftType type, boolean inSift, long seed) {
        float pick = RiftShape.hash(seed, 7, 233);
        if (type == RiftType.SIFT || type == RiftType.OVERWORLD) return pick < 0.30f ? 6 : pick < 0.60f ? 0 : 5;
        if (type == RiftType.NETHER) return pick < 0.30f ? 7 : pick < 0.60f ? 1 : 5;
        if (type == RiftType.END) return pick < 0.40f ? 6 : 2;
        return type.id; // 4 ritual portal (cyan mosaic)
    }

    /** Per-destination colours, used by the no-shader fallback. The GPU path reads the same tones from rift.fsh. */
    private record Look(float[] core, float[] halo, float[] wallFront, float[] wallBack, float[] frost) {}

    private static final Look[] LOOKS = {
        new Look(c(1f, 0.99f, 0.97f), c(1f, 0.58f, 0.46f), c(1f, 0.86f, 0.78f), c(0.88f, 0.42f, 0.44f), c(0.90f, 0.75f, 0.76f)),
        new Look(c(1f, 0.97f, 0.86f), c(1f, 0.38f, 0.18f), c(0.96f, 0.52f, 0.44f), c(0.58f, 0.12f, 0.20f), c(0.86f, 0.44f, 0.40f)),
        new Look(c(0.98f, 1f, 0.92f), c(0.82f, 0.56f, 0.96f), c(0.94f, 0.68f, 0.86f), c(0.46f, 0.24f, 0.54f), c(0.52f, 0.44f, 0.58f)),
        new Look(c(1f, 1f, 1f), c(1f, 0.62f, 0.58f), c(1f, 0.84f, 0.80f), c(0.84f, 0.38f, 0.48f), c(0.88f, 0.81f, 0.83f)),
        new Look(c(0.94f, 1f, 1f), c(0.22f, 0.94f, 1f), c(0.62f, 0.98f, 1f), c(0.08f, 0.46f, 0.64f), c(0.40f, 0.70f, 0.78f)),
        new Look(c(1f, 0.99f, 0.72f), c(1f, 0.86f, 0.18f), c(1f, 0.92f, 0.48f), c(0.78f, 0.54f, 0.12f), c(0.92f, 0.88f, 0.66f)),
        new Look(c(1f, 1f, 1f), c(1f, 0.92f, 0.94f), c(1f, 0.98f, 0.98f), c(0.96f, 0.88f, 0.90f), c(0.97f, 0.96f, 0.96f)),
        new Look(c(1f, 0.86f, 0.62f), c(1f, 0.62f, 0.30f), c(0.96f, 0.80f, 0.62f), c(0.52f, 0.30f, 0.18f), c(0.52f, 0.55f, 0.60f)),
    };

    private static Look lookFor(int value) {
        if (value < 0 || value >= LOOKS.length) return LOOKS[0];
        return LOOKS[value];
    }

    static float frostProximity(Vector3f cam) {
        if (!SiftBudget.riftProximity) return 1f;
        float dz = Math.abs(cam.z);
        float f = clamp((dz - FROST_CLEAR) / (FROST_NEAR - FROST_CLEAR), 0f, 1f);
        return f * f * (3f - 2f * f);
    }

    /** 1 the instant the rift snaps into existence, 0 once it has dissolved into full colour. */
    static float whiteFlash(float age) {
        return 1f - clamp((age - 30f) / 32f, 0f, 1f);
    }

    private static Look whiten(Look look, float k) {
        float[] w = c(1f, 1f, 1f);
        return new Look(mix(look.core(), w, k * 0.85f), mix(look.halo(), w, k * 0.85f),
            mix(look.wallFront(), w, k * 0.92f), mix(look.wallBack(), w, k * 0.92f), mix(look.frost(), w, k * 0.80f));
    }

    /**
     * Packs style, night, tall-variant and destination kind into one 8-bit channel. Alpha carries progress.
     */
    static float encodeView(State s) {
        boolean tall = RiftShape.tallVariant(s.w, s.h);
        int flags = (s.view & 7) | (s.night ? 8 : 0) | (tall ? 16 : 0) | ((s.type.id & 7) << 5);
        // setColor truncates, so nudge up so the stored byte is exactly `flags`.
        return flags == 0 ? 0f : (flags + 0.01f) / 255f;
    }

    @Override
    public void submit(State s, PoseStack pose, SubmitNodeCollector out, CameraRenderState camera) {
        if (SiftRenderTypes.irisShadowPass()) return;
        Look look = lookFor(s.view);
        Vector3f cam = new Vector3f((float) (camera.pos.x - s.ex), (float) (camera.pos.y - s.ey), (float) (camera.pos.z - s.ez))
            .rotateY((float) Math.toRadians(s.yaw + 180f));
        boolean gpu = SiftBudget.riftShader;
        RenderType glowT = gpu ? SiftRenderTypes.RIFT_GLOW : SiftRenderTypes.GLOW;
        RenderType winT = gpu ? (RiftScene.request() ? SiftRenderTypes.RIFT_REFRACT : SiftRenderTypes.RIFT) : SiftRenderTypes.GLASS;
        float age = s.age;
        float fl = whiteFlash(age);
        Look look2 = fl > 0.001f ? whiten(look, fl) : look;
        float frost = 0.55f * frostProximity(cam);
        float progress = clamp(age / GROWN, 0f, 1f);
        float code = encodeView(s);
        pose.pushPose();
        try {
            // +Z faces the player. The shader draws both sides (cull off) so the opening reads from either face.
            pose.rotate(new Quaternionf().rotationY((float) Math.toRadians(-s.yaw + 180f)));
            if (gpu) {
                out.submitCustomGeometry(pose, winT, (p, vc) -> canvas(p, vc, s, code, progress));
                // Thick frame. The shader owns the fill; these walls are the sides, and they dissolve at the back.
                out.submitCustomGeometry(pose, SiftRenderTypes.RIFT_WALL, (p, vc) -> housing(p, vc, s, progress));
                if (progress > 0.28f && progress < 0.62f)
                    out.submitCustomGeometry(pose, SiftRenderTypes.RIFT_WALL, (p, vc) -> groundRing(p, vc, s, progress));
                if (SiftBudget.riftEffects && SiftBudget.riftBloom)
                    out.submitCustomGeometry(pose, glowT, (p, vc) -> canvas(p, vc, s, code, progress));
            } else {
                out.submitCustomGeometry(pose, winT, (p, vc) -> fallback(p, vc, s, look2, frost, fl));
                if (fl > 0.05f) out.submitCustomGeometry(pose, glowT, (p, vc) -> fallback(p, vc, s, look2, frost, fl));
            }
        } finally {
            pose.popPose();
        }
    }

    /** One subdivided quad. Colour is data: r,g canvas uv, b packed flags, a lifecycle progress. */
    private static void canvas(PoseStack.Pose p, VertexConsumer vc, State s, float code, float progress) {
        float cw = s.w / 11f, ch = s.h / 8f;
        float x0 = -s.w / 2f + U0 * cw, x1 = -s.w / 2f + U1 * cw;
        float y0 = RiftShape.BASE + V0 * ch, y1 = RiftShape.BASE + V1 * ch;
        if (!Float.isFinite(x0 + x1 + y0 + y1)) return;
        for (int i = 0; i < SUB_X; i++) for (int j = 0; j < SUB_Y; j++) {
            float u0 = i / (float) SUB_X, u1 = (i + 1) / (float) SUB_X;
            float v0 = j / (float) SUB_Y, v1 = (j + 1) / (float) SUB_Y;
            float px0 = x0 + (x1 - x0) * u0, px1 = x0 + (x1 - x0) * u1;
            float py0 = y0 + (y1 - y0) * v0, py1 = y0 + (y1 - y0) * v1;
            vert(p, vc, px0, py0, u0, v0, code, progress);
            vert(p, vc, px1, py0, u1, v0, code, progress);
            vert(p, vc, px1, py1, u1, v1, code, progress);
            vert(p, vc, px0, py1, u0, v1, code, progress);
        }
    }

    private static void vert(PoseStack.Pose p, VertexConsumer vc, float x, float y, float u, float v, float code, float progress) {
        if (!SiftBudget.take(vc)) return;
        if (!Float.isFinite(x + y)) { x = 0f; y = 0f; }
        vc.addVertex(p, x, y, 0f).setColor(u, v, code, clamp(progress, 0f, 1f));
    }

    /** No-shader stand-in: a frosted pane the size of the opening, not a reconstruction of the SDF. */
    private static void fallback(PoseStack.Pose p, VertexConsumer vc, State s, Look look, float frost, float flash) {
        float[] face = mix(look.frost(), s.night ? DEEP_AMBER_NIGHT : VIBRANT_PINK_DAY, 0.25f);
        face = mix(face, CURTAIN[2], s.night ? 0.35f : 0.05f);
        if (flash > 0.01f) face = mix(face, c(1f, 1f, 1f), flash);
        float a = 0.55f + 0.3f * frost;
        float x0 = -s.w / 2f, x1 = s.w / 2f, y0 = RiftShape.BASE, y1 = RiftShape.BASE + s.h;
        col(p, vc, x0, y0, face, a);
        col(p, vc, x1, y0, face, a);
        col(p, vc, x1, y1, look.core(), a);
        col(p, vc, x0, y1, look.core(), a);
    }

    private static void col(PoseStack.Pose p, VertexConsumer vc, float x, float y, float[] c, float a) {
        if (!SiftBudget.take(vc)) return;
        if (!Float.isFinite(x + y)) return;
        vc.addVertex(p, x, y, 0f).setColor(Math.min(1f, c[0]), Math.min(1f, c[1]), Math.min(1f, c[2]), clamp(a, 0f, 1f));
    }

    /**
     * Side walls and hollow border frames. White on the front lip, tinted through the depth,
     * gone at the back. The wave is applied only to side edges and corners.
     */
    private static void housing(PoseStack.Pose p, VertexConsumer vc, State s, float progress) {
        if (progress < 0.58f) return;
        float grow = clamp((progress - 0.58f) / 0.42f, 0f, 1f);
        RiftShape sh = RiftShape.build(s.type, s.seed, s.w, s.h);
        float[] front = c(1f, 1f, 1f);
        float[] wall = s.night ? c(1f, 0.62f, 0.74f) : c(1f, 0.78f, 0.68f);
        float[] gone = s.night ? c(0.45f, 0.22f, 0.32f) : c(0.62f, 0.42f, 0.40f);
        for (int i = 0; i < sh.cols; i++) for (int j = 0; j < sh.rows; j++) {
            if (!sh.on(i, j)) continue;
            boolean L = !sh.on(i - 1, j), R = !sh.on(i + 1, j), D = !sh.on(i, j - 1), U = !sh.on(i, j + 1);
            if (!L && !R && !D && !U) continue;
            float x0 = sh.x(i), x1 = sh.x(i + 1), y0 = sh.y(j), y1 = sh.y(j + 1);
            float zBack = -Math.max(sh.d(i, j), 0.85f) * grow;
            boolean corner = (L || R) && (D || U);
            if (L) edge(p, vc, true, x0, y0, y1, zBack, wave(true, corner, y0, y1, s.time), front, wall, gone, grow);
            if (R) edge(p, vc, true, x1, y0, y1, zBack, wave(true, corner, y0, y1, s.time), front, wall, gone, grow);
            if (D) edge(p, vc, false, y0, x0, x1, zBack, 0f, front, wall, gone, grow);
            if (U) edge(p, vc, false, y1, x0, x1, zBack, corner ? wave(false, true, x0, x1, s.time) : 0f, front, wall, gone, grow);
        }
        // Hollow frames are part of the border. Faint in the day, full at night.
        float frame = grow * (s.night ? 1f : 0.30f);
        for (float[] q : sh.sats) sat(p, vc, q, frame, s.time, front, wall, gone);
        if (s.night) nightFlanks(p, vc, s);
    }

    /** Side edge waves. Top and bottom edges stay put unless they are a corner. */
    private static float wave(boolean side, boolean corner, float a, float b, float time) {
        if (!side && !corner) return 0f;
        float m = (a + b) * 0.5f;
        float k = side ? 1f : 0.65f;
        return k * (0.07f * (float) Math.sin(m * 1.9 + time * 1.1) + 0.025f * (float) Math.sin(m * 3.7 - time * 1.7));
    }

    /** One exposed edge: a front lip in the opening plane, then a wall that fades out at the back. */
    private static void edge(PoseStack.Pose p, VertexConsumer vc, boolean vertical, float at, float a, float b,
                             float zBack, float wave, float[] front, float[] wall, float[] gone, float grow) {
        float lip = 0.11f;
        float zLip = 0.03f;
        if (vertical) {
            float x = at + wave;
            put(p, vc, x - lip, a, zLip, front, 0.92f * grow);
            put(p, vc, x + 0.04f, a, zLip, front, 0.92f * grow);
            put(p, vc, x + 0.04f, b, zLip, front, 0.92f * grow);
            put(p, vc, x - lip, b, zLip, front, 0.92f * grow);
            put(p, vc, x, a, 0f, front, 0.88f * grow);
            put(p, vc, x, b, 0f, front, 0.88f * grow);
            put(p, vc, x, b, zBack, gone, 0f);
            put(p, vc, x, a, zBack, gone, 0f);
            put(p, vc, x, a, -0.08f, wall, 0.55f * grow);
            put(p, vc, x, b, -0.08f, wall, 0.55f * grow);
            put(p, vc, x, b, zBack, gone, 0f);
            put(p, vc, x, a, zBack, gone, 0f);
        } else {
            float y = at + wave;
            put(p, vc, a, y - lip, zLip, front, 0.92f * grow);
            put(p, vc, b, y - lip, zLip, front, 0.92f * grow);
            put(p, vc, b, y + 0.04f, zLip, front, 0.92f * grow);
            put(p, vc, a, y + 0.04f, zLip, front, 0.92f * grow);
            put(p, vc, a, y, 0f, front, 0.88f * grow);
            put(p, vc, b, y, 0f, front, 0.88f * grow);
            put(p, vc, b, y, zBack, gone, 0f);
            put(p, vc, a, y, zBack, gone, 0f);
        }
    }

    /** Detached hollow frame. No fill. The back face is not drawn; the walls fade to nothing. */
    private static void sat(PoseStack.Pose p, VertexConsumer vc, float[] q, float grow, float time,
                            float[] front, float[] wall, float[] gone) {
        float x0 = q[0], y0 = q[1], x1 = q[2], y1 = q[3];
        int mask = (int) q[7];
        float zBack = Math.min(q[5], -0.55f) * grow;
        float wob = wave(true, true, y0, y1, time) * 0.45f;
        if ((mask & 1) == 0) edge(p, vc, true, x0 + wob, y0, y1, zBack, 0f, front, wall, gone, grow);
        if ((mask & 2) == 0) edge(p, vc, true, x1 + wob, y0, y1, zBack, 0f, front, wall, gone, grow);
        if ((mask & 4) == 0) edge(p, vc, false, y0, x0, x1, zBack, 0f, front, wall, gone, grow);
        if ((mask & 8) == 0) edge(p, vc, false, y1, x0, x1, zBack, 0f, front, wall, gone, grow);
    }

    /** Phase 2: a sharp ring on the ground, scaling out. Not a particle sheet. */
    private static void groundRing(PoseStack.Pose p, VertexConsumer vc, State s, float progress) {
        float t = clamp((progress - 0.28f) / 0.32f, 0f, 1f);
        float radius = 0.35f + t * s.w * 0.9f;
        float a = 0.75f * (1f - t);
        float[] white = c(1f, 1f, 1f);
        int n = 40;
        float y = 0.04f;
        for (int i = 0; i < n; i++) {
            double a0 = i * Math.PI * 2 / n, a1 = (i + 1) * Math.PI * 2 / n;
            float c0 = (float) Math.cos(a0), s0 = (float) Math.sin(a0);
            float c1 = (float) Math.cos(a1), s1 = (float) Math.sin(a1);
            float r1 = radius + 0.07f;
            put(p, vc, c0 * radius, y, s0 * radius, white, a);
            put(p, vc, c1 * radius, y, s1 * radius, white, a);
            put(p, vc, c1 * r1, y, s1 * r1, white, a * 0.2f);
            put(p, vc, c0 * r1, y, s0 * r1, white, a * 0.2f);
        }
    }

    /** Night flanks. Wide, soft, and off the opening so they don't cap the window. */
    private static void nightFlanks(PoseStack.Pose p, VertexConsumer vc, State s) {
        float y0 = 0.05f, y1 = s.h + 1.4f, z = -0.4f;
        float[] blue = c(0.18f, 0.42f, 1f), mag = c(0.72f, 0.22f, 0.95f), cyan = c(0.45f, 0.95f, 1f);
        slab(p, vc, -s.w * 0.85f, -s.w * 0.55f, y0, y1, z, blue, 0.16f);
        slab(p, vc, s.w * 0.55f, s.w * 0.85f, y0, y1, z, mag, 0.16f);
        slab(p, vc, -s.w * 0.55f, -s.w * 0.42f, y0, y1, z + 0.05f, cyan, 0.08f);
    }

    private static void slab(PoseStack.Pose p, VertexConsumer vc, float x0, float x1, float y0, float y1, float z, float[] c, float a) {
        put(p, vc, x0, y0, z, c, 0f);
        put(p, vc, x1, y0, z, c, a);
        put(p, vc, x1, y1, z, c, a);
        put(p, vc, x0, y1, z, c, 0f);
    }

    private static void put(PoseStack.Pose p, VertexConsumer vc, float x, float y, float z, float[] c, float a) {
        if (!SiftBudget.take(vc)) return;
        if (!Float.isFinite(x + y + z)) return;
        vc.addVertex(p, x, y, z).setColor(Math.min(1f, c[0]), Math.min(1f, c[1]), Math.min(1f, c[2]), clamp(a, 0f, 1f));
    }

    /** Sparse rising cubes. Night only. The border fragments are frames; these are the dissolving motes. */
    private static void motes(RiftPortalEntity e, State s) {
        if (!SiftBudget.riftEffects || s.age < 8f || !s.night) return;
        int tick = e.age();
        if (tick % 6 != 0) return;
        Integer prev = LAST_MOTE.get(e.getId());
        if (prev != null && prev == tick) return;
        LAST_MOTE.put(e.getId(), tick);
        double ang = tick * 0.55;
        float yaw = (float) Math.toRadians(s.yaw);
        double lx = Math.cos(ang) * s.w * 0.22;
        double lz = 0.12;
        double wx = lx * Math.cos(yaw) - lz * Math.sin(yaw);
        double wz = lx * Math.sin(yaw) + lz * Math.cos(yaw);
        try {
            RiftEnergyCubeParticle.spawn(s.ex + wx, s.ey + 0.35, s.ez + wz, s.type, tick);
        } catch (Throwable ignored) {
            // A mote must never take the rift renderer down with it.
        }
    }

    private static float clamp(float v, float lo, float hi) { return Math.max(lo, Math.min(hi, v)); }
    private static float[] c(float r, float g, float b) { return new float[]{r, g, b}; }
    static float[] rgb(int hex) { return new float[]{(hex >> 16 & 255) / 255f, (hex >> 8 & 255) / 255f, (hex & 255) / 255f}; }
    private static float[] mix(float[] a, float[] b, float t) {
        return new float[]{a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t};
    }
}
