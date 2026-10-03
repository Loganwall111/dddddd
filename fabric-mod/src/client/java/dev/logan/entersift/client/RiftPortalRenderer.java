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
 * 0.22 rift renderer — COMPLETE REWRITE. The construction is specified in {@code docs/RIFT_SPEC.md}:
 *
 *  - a fixed voxel cross ({@link RiftShape}) with concentric recessed plates (2.0 blocks of recess),
 *  - a crisp white rim on every plate edge with a soft halo and a jittering ghost copy,
 *  - a milky interior (value-noise clouds) with a white-hot core and a per-destination tint,
 *  - a white opening animation: fade in (0-14) -> the whole rift is WHITE (14-54) -> the destination
 *    colour bleeds in from the centre outward (54-86) -> the wave settles (86-130) -> stable,
 *  - a back fade (deeper plates fade out) and a back distortion (a boiling strip behind every step),
 *  - wavy exteriors: the whole rift sways, most strongly along the bottom,
 *  - floating light squares and small drifting cubes around and inside the opening.
 *
 * DELETED in 0.22 (the sources of the "chaotic mess"): the ripple ring, the seed box, the per-tier pop-in
 * flashes, the lightning bolts, the hollow window cubes, the energy-cube disintegrators, the destination
 * sky paintings in the window and every texture-based interior. The walk-through tunnel is untouched.
 */
public final class RiftPortalRenderer extends EntityRenderer<RiftPortalEntity, RiftPortalRenderer.State> {
    static final Identifier THE_SIFT = SiftContent.id("the_sift");

    /** Opening animation, in ticks (20 = 1 s). Mirrored by {@code RiftPortalEntity.GROWN}. */
    static final float FADE_END = 14f, WHITE_END = 54f, COLOUR_END = 86f, SETTLE_END = 130f;
    /** The recessed alcove: front lip stands COLLAR in front of the anchor plane, FLANGE wide. */
    static final float COLLAR = 0.30f, FLANGE = 0.16f;
    /** Rim widths (blocks) and the ghost-copy jitter. */
    static final float RIM = 0.075f, RIM_HALO = 0.16f, JITTER = 0.03f;

    private static final Map<Long, RiftShape> SHAPES = new LinkedHashMap<>(32, 0.75f, true) {
        @Override protected boolean removeEldestEntry(Map.Entry<Long, RiftShape> eldest) { return size() > 64; }
    };

    public RiftPortalRenderer(EntityRendererProvider.Context context) { super(context); }

    public static final class State extends EntityRenderState {
        RiftType type = RiftType.SIFT;
        float w, h, age, yaw, time;
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
        s.age = e.age() >= SETTLE_END ? SETTLE_END + 100f : e.age() + partial;   // re-tracking never replays
        s.time = (float) ((System.nanoTime() / 1.0e9) % 3600.0);
        s.yaw = e.getYRot();
        s.seed = e.blockPosition().asLong() * 31 + s.type.id;
        s.ex = e.getX(); s.ey = e.getY(); s.ez = e.getZ();
        var level = net.minecraft.client.Minecraft.getInstance().level;
        s.inSift = level != null && level.dimension().identifier().equals(THE_SIFT);
        long day = level == null ? 0L : level.getOverworldClockTime() % 24000L;
        s.night = day >= 11500L && day <= 23300L;
        s.view = viewCode(s.type, s.inSift);
    }

    @Override
    protected AABB getBoundingBoxForCulling(RiftPortalEntity e, float partial) {
        float r = Math.max(e.riftWidth(), e.riftHeight()) + 5f;      // squares and aura reach past the cross
        return e.getBoundingBox().inflate(r, r * 2f, r);
    }

    /** Destination shown in the window (the rift type IS the destination). */
    static int viewCode(RiftType type, boolean inSift) {
        if (inSift && (type == RiftType.SIFT || type == RiftType.OVERWORLD)) return 5;
        return type.id;
    }

    /** Per-destination look: interior tint, rim halo, frame face, aura. */
    private record Look(float[] tint, float[] halo, float[] frame) {}

    private static final Look[] LOOKS = {
        new Look(rgb(0xFFE2A8), rgb(0xFFB86A), rgb(0xFFF3DC)),   // 0 overworld: warm gold
        new Look(rgb(0xFF6242), rgb(0xFF3A1E), rgb(0xFFE8DE)),   // 1 nether: burning red
        new Look(rgb(0xC6A4FF), rgb(0x9A6CFF), rgb(0xF2E8FF)),   // 2 end: violet
        new Look(rgb(0xFFC2DE), rgb(0xFF8CC0), rgb(0xFFF2F8)),   // 3 sift: pink
        new Look(rgb(0x9BF2FF), rgb(0x35E0FF), rgb(0xEAFEFF)),   // 4 portal: cyan
        new Look(rgb(0xFFE98A), rgb(0xFFD23C), rgb(0xFFFBE0)),   // 5 gold, Overworld seen from the Sift
    };

    private static float[] rgb(int c) { return new float[]{(c >> 16 & 255) / 255f, (c >> 8 & 255) / 255f, (c & 255) / 255f}; }

    // ------------------------------------------------------------------ slow wave (wavy exteriors)

    /**
     * The rift's sway. A pure function of position, so shared cell corners always move together and the
     * gapless mesh can never crack. Amplitude grows toward the bottom (spec section 5); periods 10-15 s.
     */
    static final class Warp {
        static final Warp STILL = new Warp(0f, 0f, 1f, false);
        final float t, base, h, k;
        final boolean on;
        Warp(float t, float base, float h, boolean on) { this(t, base, h, on, 1f); }
        Warp(float t, float base, float h, boolean on, float k) { this.t = t; this.base = base; this.h = h; this.on = on; this.k = k; }
        float amp(float y) {
            if (!on) return 0f;
            float low = Math.max(0f, Math.min(1f, 1f - (y - base) / h));
            return (0.045f + 0.13f * low * low) * k;
        }
        float dx(float x, float y, float z) { return amp(y) * (float) Math.sin(t * 0.50f + y * 0.8f + z * 0.5f); }
        float dy(float x, float y, float z) { return amp(y) * 0.35f * (float) Math.sin(t * 0.42f + x * 0.9f); }
        float dz(float x, float y, float z) { return amp(y) * 0.8f * (float) Math.sin(t * 0.47f + x * 0.7f + y * 0.4f); }
    }

    /**
     * Extra displacement of the OUTER silhouette only: the outline undulates as if the tear were alive.
     * Wave (spec section 5, "wavy exteriors"). Applied to rim vertices, keyed on the local edge position.
     */
    private static float edgeWave(float u, float t) { return 0.075f * (float) Math.sin(u * 5.1f + t * 1.6f) + 0.035f * (float) Math.sin(u * 11.3f - t * 2.3f); }

    // ------------------------------------------------------------------ model-space helpers

    /** Model-space offset of a vertex: the slow wave plus the wavy outline (edge parameter u in blocks). */
    private static float[] warp(float x, float y, float z, float u, Warp wv) {
        float ex = 0f, ey = edgeWave(u, wv.t) * (wv.on ? 1f : 0f);
        return new float[]{x + wv.dx(x, y, z) + ex, y + wv.dy(x, y, z) + ey, z + wv.dz(x, y, z)};
    }

    private static void col(PoseStack.Pose p, VertexConsumer vc, Warp wv, float x, float y, float z, float[] c, float a) {
        if (!SiftBudget.take(vc)) return;
        float[] q = warp(x, y, z, y, wv);
        if (!Float.isFinite(q[0] + q[1] + q[2])) { q[0] = 0f; q[1] = 0f; q[2] = 0f; a = 0f; }
        vc.addVertex(p, q[0], q[1], q[2]).setColor(Math.min(1f, c[0]), Math.min(1f, c[1]), Math.min(1f, c[2]), Math.max(0f, Math.min(1f, a)));
    }

    /**
     * Window vertex: colour carries (face u, face v, view code, colour phase). The core shader paints the
     * milk on the GPU with the exact same maths as {@link #interior}, so both modes look identical; the
     * alpha channel is the 0..1 destination-colour phase (0 = the white opening phase).
     */
    private static void win(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, float x, float y, float z, float code, float colourK) {
        if (!SiftBudget.take(vc)) return;
        float span = Math.max(sh.w, sh.h) * 1.15f;
        float u = clamp(0.5f + x / span, 0f, 1f), v = clamp(0.5f + (y - sh.cy()) / span, 0f, 1f);
        float[] q = warp(x, y, z, y, wv);
        if (!Float.isFinite(q[0] + q[1] + q[2])) { q[0] = 0f; q[1] = 0f; q[2] = 0f; }
        vc.addVertex(p, q[0], q[1], q[2]).setColor(u, v, code, clamp(colourK, 0f, 1f));
    }

    // ------------------------------------------------------------------ submit

    @Override
    public void submit(State s, PoseStack pose, SubmitNodeCollector out, CameraRenderState camera) {
        if (SiftRenderTypes.irisShadowPass()) return;                       // self-lit: nothing in the shadow map
        RiftShape sh = SHAPES.computeIfAbsent(s.seed * 1315423911L + Float.floatToIntBits(s.w) * 131L + Float.floatToIntBits(s.h),
            k -> RiftShape.build(s.type, s.seed, s.w, s.h).meshed());
        int vi = Math.max(0, Math.min(LOOKS.length - 1, s.view));
        Look look = LOOKS[vi];
        float[] tint = look.tint();
        if (s.night) tint = mix(tint, WHITE, 0.12f);
        Vector3f cam = new Vector3f((float) (camera.pos.x - s.ex), (float) (camera.pos.y - s.ey), (float) (camera.pos.z - s.ez))
            .rotateY((float) Math.toRadians(s.yaw));
        boolean gpu = SiftBudget.riftShader;
        RenderType wallT = gpu ? SiftRenderTypes.RIFT_WALL : SiftRenderTypes.SOLID;
        RenderType glowT = gpu ? SiftRenderTypes.RIFT_GLOW : SiftRenderTypes.GLOW;
        RenderType winT = gpu ? SiftRenderTypes.RIFT : SiftRenderTypes.SOLID;
        float age = s.age;
        // Opening: a stronger, faster wave while the tear is fresh, settling to the 1x idle sway.
        float wk = age < FADE_END ? 2.1f : (age < SETTLE_END ? 1.6f - 0.6f * (age - FADE_END) / (SETTLE_END - FADE_END) : 1f);
        Warp wv = new Warp(s.time, RiftShape.BASE, sh.h, true, wk);
        float code = (s.view + (s.night ? 8 : 0) + 0.5f) / 16f;
        final float[] tintF = tint;
        pose.pushPose();
        try {
            pose.rotate(new Quaternionf().rotationY((float) Math.toRadians(-s.yaw)));
            // 1. Opening: rim ghost + centre glow, then the white phase (rims of the frame included).
            if (age < WHITE_END) out.submitCustomGeometry(pose, glowT, (p, vc) -> opening(p, vc, wv, sh, s, tintF, age));
            // 2. Interior plates: the milky window.
            if (gpu) out.submitCustomGeometry(pose, winT, (p, vc) -> interiorGpu(p, vc, wv, sh, code, age));
            else out.submitCustomGeometry(pose, winT, (p, vc) -> interior(p, vc, wv, sh, s, tintF, age));
            // 3. Plate return walls (the recessed alcove seen from the side), fading toward the back.
            out.submitCustomGeometry(pose, wallT, (p, vc) -> plates(p, vc, wv, sh, look, tintF, age));
            // 4. Crisp white rims, halos, ghost copies and the back-distortion strips.
            out.submitCustomGeometry(pose, glowT, (p, vc) -> rims(p, vc, wv, sh, look, tintF, s, age));
            // 5. Chunky alcove frame at the front lip.
            out.submitCustomGeometry(pose, wallT, (p, vc) -> frame(p, vc, wv, sh, look, age));
            if (SiftBudget.riftEffects && age >= FADE_END) out.submitCustomGeometry(pose, glowT, (p, vc) -> motes(p, vc, sh, s, tintF, age, cam));
            if (SiftBudget.auraGlow && age >= SETTLE_END) out.submitCustomGeometry(pose, glowT, (p, vc) -> aura(p, vc, sh, s, tintF, cam));
        } finally {
            pose.popPose();
        }
    }

    // ------------------------------------------------------------------ animation timeline

    /** 0 -> 1 over the first FADE_END ticks. */
    private static float fadeIn(float age) { return clamp(age / FADE_END, 0f, 1f); }

    /**
     * How much destination colour a cell has: 0 during the white phase, then a ring travelling OUT from
     * the centre (small radius takes colour first), full colour after COLOUR_END.
     */
    static float colourOf(float radial, float age) {
        if (age < WHITE_END) return 0f;
        if (age >= COLOUR_END) return 1f;
        float prog = (age - WHITE_END) / (COLOUR_END - WHITE_END);
        return clamp((prog * 1.4f - radial) / 0.4f, 0f, 1f);
    }

    /** The white wave that rolls across the plates while the rift is white (spec section 6). */
    private static float whiteWave(float u, float v, float t) { return 0.5f + 0.5f * (float) Math.sin(u * 2.3f + v * 1.7f - t * 2.4f); }

    // ------------------------------------------------------------------ 1. opening (fade + white)

    private static void opening(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, State s, float[] tint, float age) {
        float fade = fadeIn(age);
        float white = 1f - clamp((age - WHITE_END + 12f) / 12f, 0f, 1f);   // ghost rims fade out after the white phase
        float grow = 0.25f + 0.75f * fade;
        // Centre glow: a white hot spot that grows out of nothing and pulses while the tear opens.
        float pulse = 0.55f + 0.45f * (0.5f + 0.5f * (float) Math.sin(s.time * 6.1f));
        halo(p, vc, wv, 0f, sh.cy(), 0.06f, Math.max(sh.w, sh.h) * 0.55f * grow, WHITE, 0.55f * fade * pulse);
        // Rim ghost: the whole outline drawn early, wobbling, so the rift "fades in" instead of popping.
        float wob = 0.09f * (float) Math.sin(s.time * 5.3f);
        for (float[] e : sh.rimEdges) {
            float z = e[4] + 0.03f;
            float[] a = {(float) e[0], (float) e[1], z}, b = {(float) e[2], (float) e[3], z};
            a[0] += wob; a[1] -= wob; b[0] -= wob; b[1] += wob;
            line(p, vc, wv, a, b, RIM * 1.4f, WHITE, 0.85f * fade * white);
            band(p, vc, wv, a, b, RIM * 2.4f, RIM_HALO * 2.2f, WHITE, tint, 0.35f * fade * white);
        }
    }

    // ------------------------------------------------------------------ 2. interior (the milky window)

    /** CPU milky interior: value-noise clouds, white core, destination tint and the white/colour phases. */
    private static void interior(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, State s, float[] tint, float age) {
        if (age < FADE_END) return;                                     // nothing solid during the fade-in
        float t = s.time;
        for (int i = 0; i < sh.cols; i++) for (int j = 0; j < sh.rows; j++) {
            if (!sh.on(i, j)) continue;
            float d = -sh.depthOf(i, j), x0 = sh.x(i), x1 = sh.x(i + 1), y0 = sh.y(j), y1 = sh.y(j + 1);
            float k = colourOf(sh.radial(i, j), age);
            float wave = age < SETTLE_END ? whiteWave(sh.x(i) * 0.6f, sh.y(j) * 0.6f, t) : 0f;
            float[][] c = new float[4][];
            float[][] q = {{x0, y0}, {x1, y0}, {x1, y1}, {x0, y1}};
            for (int n = 0; n < 4; n++) c[n] = milkColour(q[n][0], q[n][1], sh, t, tint, k, wave);
            float a = backFade(sh, d);
            quad(p, vc, wv, x0, y0, x1, y1, d, c, a);
        }
    }

    /** GPU interior: the vertex colour stays (u, v, code, 1) and {@code core/rift.fsh} paints the milk. */
    private static void interiorGpu(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, float code, float age) {
        if (age < FADE_END) return;
        for (int i = 0; i < sh.cols; i++) for (int j = 0; j < sh.rows; j++) {
            if (!sh.on(i, j)) continue;
            float d = -sh.depthOf(i, j), x0 = sh.x(i), x1 = sh.x(i + 1), y0 = sh.y(j), y1 = sh.y(j + 1);
            float k = colourOf(sh.radial(i, j), age);
            win(p, vc, wv, sh, x0, y0, d, code, k); win(p, vc, wv, sh, x1, y0, d, code, k);
            win(p, vc, wv, sh, x1, y1, d, code, k); win(p, vc, wv, sh, x0, y1, d, code, k);
        }
    }

    /** One milky sample: tint -> white clouds, white core, white phase. */
    private static float[] milkColour(float x, float y, RiftShape sh, float t, float[] tint, float colourK, float wave) {
        float u = (x + sh.w / 2) / Math.max(0.001f, sh.w), v = (y - RiftShape.BASE) / Math.max(0.001f, sh.h);
        float n = fbm(u * 3.1f + t * 0.05f, v * 3.1f - t * 0.04f);
        float cloud = smooth(0.28f, 0.82f, n);
        float dx = u - 0.5f, dy = v - 0.5f;
        float core = (float) Math.exp(-(dx * dx + dy * dy) * 5.2f);
        float whiteK = clamp(0.18f + 0.72f * cloud + 0.75f * core + 0.25f * wave * (1f - colourK), 0f, 1f);
        float[] c = mix(tint, WHITE, whiteK);
        // Until COLOUR_END the rift is pure white; from there the destination tint bleeds in cell by cell.
        return mix(WHITE, c, colourK);
    }

    /** Plates deeper in the throat fade out (spec section 5, "back fade"). */
    private static float backFade(RiftShape sh, float depth) {
        return clamp(1f - 0.42f * (Math.abs(depth) / Math.max(0.01f, sh.maxDepth)), 0.35f, 1f);
    }

    private static void quad(PoseStack.Pose p, VertexConsumer vc, Warp wv, float x0, float y0, float x1, float y1, float z, float[][] c, float a) {
        col(p, vc, wv, x0, y0, z, c[0], a); col(p, vc, wv, x1, y0, z, c[1], a);
        col(p, vc, wv, x1, y1, z, c[2], a); col(p, vc, wv, x0, y1, z, c[3], a);
    }

    // ------------------------------------------------------------------ 3. plate return walls

    /** The vertical returns between plates: only visible from the side, shaded by depth. */
    private static void plates(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, Look look, float[] tint, float age) {
        float[] face = mix(look.frame(), tint, 0.35f), back = mix(look.frame(), tint, 0.75f);
        for (float[] q : sh.steps) {
            float zf = q[4], zb = q[5];
            float depth = Math.max(Math.abs(zf), Math.abs(zb));
            float a = backFade(sh, depth);
            float shade = clamp(1f - 0.30f * (depth / Math.max(0.01f, sh.maxDepth)), 0.55f, 1f);
            float[] cf = new float[]{face[0] * shade, face[1] * shade, face[2] * shade};
            float[] cb = new float[]{back[0] * shade, back[1] * shade, back[2] * shade};
            wall(p, vc, wv, q[0], q[1], q[2], q[3], zf, zb, cf, cb);
        }
    }

    private static void wall(PoseStack.Pose p, VertexConsumer vc, Warp wv, float xa, float ya, float xb, float yb, float zf, float zb,
                             float[] front, float[] back) {
        col(p, vc, wv, xa, ya, zf, front, 1f); col(p, vc, wv, xb, yb, zf, front, 1f);
        col(p, vc, wv, xb, yb, zb, back, backFadeAt(zb)); col(p, vc, wv, xa, ya, zb, back, backFadeAt(zb));
    }

    private static float backFadeAt(float z) { return clamp(1f - 0.30f * Math.abs(z), 0.45f, 1f); }

    // ------------------------------------------------------------------ 4. rims (crisp white + ghost + distortion)

    private static void rims(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, Look look, float[] tint, State s, float age) {
        float fade = fadeIn(age);
        float white = age >= WHITE_END ? 1f : clamp(age / WHITE_END, 0f, 1f);   // rims are white from early on
        float[] halo = mix(look.halo(), tint, 0.4f);
        // "Reality tear" ghost: two additive copies of every rim, offset by one vibrating vector.
        float jx = JITTER * (float) Math.sin(s.time * 7.3f), jy = JITTER * (float) Math.sin(s.time * 5.1f + 1.7f);
        for (float[] e : sh.rimEdges) {
            float xa = e[0], ya = e[1], xb = e[2], yb = e[3], z = e[4];
            float a = fade * clamp(backFade(sh, z) + 0.25f, 0f, 1f);
            if (a < 0.03f) continue;
            band(p, vc, wv, new float[]{xa, ya, z + 0.006f}, new float[]{xb, yb, z + 0.006f}, RIM, RIM_HALO, WHITE, halo, a * white);
            line(p, vc, wv, new float[]{xa + jx, ya + jy, z + 0.012f}, new float[]{xb + jx, yb + jy, z + 0.012f}, RIM * 0.6f, WHITE, 0.22f * white);
            line(p, vc, wv, new float[]{xa - jy, ya + jx, z + 0.014f}, new float[]{xb - jy, yb + jx, z + 0.014f}, RIM * 0.6f, halo, 0.18f * white);
        }
        if (age < FADE_END) return;
        // Back distortion: a boiling additive strip just behind every step edge (spec section 5).
        for (float[] q : sh.steps) {
            float z = q[4] - 0.06f;
            float wob = 0.05f * (float) Math.sin(s.time * 9f + (q[0] + q[1]) * 3f);
            float[] a = {q[0] + wob, q[1], z}, b = {q[2] + wob, q[3], z};
            line(p, vc, wv, a, b, 0.05f, mix(WHITE, halo, 0.45f), 0.30f * fade);
        }
    }

    // ------------------------------------------------------------------ 5. alcove frame

    /**
     * Chunky frame along every open silhouette edge: a flat FLANGE-wide face stands COLLAR in front of the
     * anchor plane and an outer wall drops back to it, so the opening sits in a thick alcove. The face is
     * the near-white "frame" colour of the destination, exactly like the cream frames in the references.
     */
    private static void frame(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, Look look, float age) {
        float[] face = look.frame(), side = mix(look.frame(), look.tint(), 0.45f);
        float F = FLANGE, C = COLLAR;
        for (int i = 0; i < sh.cols; i++) for (int j = 0; j < sh.rows; j++) {
            if (!sh.on(i, j)) continue;
            float x0 = sh.x(i), x1 = sh.x(i + 1), y0 = sh.y(j), y1 = sh.y(j + 1);
            boolean L = !sh.on(i - 1, j), R = !sh.on(i + 1, j), D = !sh.on(i, j - 1), U = !sh.on(i, j + 1);
            if (L) { rect(p, vc, wv, x0 - F, y0, x0, y1, C, face, 1f);
                wall(p, vc, wv, x0 - F, y0 - (D ? F : 0), x0 - F, y1 + (U ? F : 0), C, 0f, side, side); }
            if (R) { rect(p, vc, wv, x1, y0, x1 + F, y1, C, face, 1f);
                wall(p, vc, wv, x1 + F, y0 - (D ? F : 0), x1 + F, y1 + (U ? F : 0), C, 0f, side, side); }
            if (D) { rect(p, vc, wv, x0, y0 - F, x1, y0, C, face, 1f);
                wall(p, vc, wv, x0 - (L ? F : 0), y0 - F, x1 + (R ? F : 0), y0 - F, C, 0f, side, side); }
            if (U) { rect(p, vc, wv, x0, y1, x1, y1 + F, C, face, 1f);
                wall(p, vc, wv, x0 - (L ? F : 0), y1 + F, x1 + (R ? F : 0), y1 + F, C, 0f, side, side); }
            if (L && D) rect(p, vc, wv, x0 - F, y0 - F, x0, y0, C, face, 1f);
            if (R && D) rect(p, vc, wv, x1, y0 - F, x1 + F, y0, C, face, 1f);
            if (L && U) rect(p, vc, wv, x0 - F, y1, x0, y1 + F, C, face, 1f);
            if (R && U) rect(p, vc, wv, x1, y1, x1 + F, y1 + F, C, face, 1f);
        }
    }

    // ------------------------------------------------------------------ 6. floating light squares + cubes

    /**
     * The "weird floating light squares": additive camera-facing squares that drift up through and around
     * the opening (spec section 7), plus three small white cube outlines (spec section 8).
     */
    private static void motes(PoseStack.Pose p, VertexConsumer vc, RiftShape sh, State s, float[] tint, float age, Vector3f cam) {
        float burst = clamp((age - FADE_END) / 30f, 0f, 1f);
        for (int k = 0; k < 26; k++) {
            float speed = 0.15f + 0.60f * RiftShape.hash(s.seed, k, 11);
            float life = (RiftShape.hash(s.seed, k, 12) + s.time * speed / (sh.h + 2.2f)) % 1f;
            float spread = k < 16 ? 1.0f : (k < 24 ? 1.35f : 1.75f);
            float q = k < 16 ? 0.05f + 0.09f * RiftShape.hash(s.seed, k, 13)
                    : k < 24 ? 0.16f + 0.10f * RiftShape.hash(s.seed, k, 13)
                    : 0.30f + 0.15f * RiftShape.hash(s.seed, k, 13);
            float x = (RiftShape.hash(s.seed, k, 14) - 0.5f) * sh.w * spread;
            float y = RiftShape.BASE + life * (sh.h + 0.6f);
            float z = 0.6f - RiftShape.hash(s.seed, k, 15) * (sh.maxDepth + 1.2f);
            float a = (float) Math.sin(life * Math.PI) * 0.85f * burst;
            if (a < 0.03f) continue;
            float sway = 0.06f * (float) Math.sin(s.time * 0.8f + k);
            float[] c = mix(WHITE, tint, 0.25f);
            float[] v0 = {x + sway - q / 2, y - q / 2, z}, v1 = {x + sway + q / 2, y - q / 2, z};
            float[] v2 = {x + sway + q / 2, y + q / 2, z}, v3 = {x + sway - q / 2, y + q / 2, z};
            face(p, vc, v0, v1, v2, v3, c, a);
        }
        if (age < SETTLE_END) return;
        for (int k = 0; k < 3; k++) {
            float speed = 0.10f + 0.10f * RiftShape.hash(s.seed, k, 21);
            float life = (RiftShape.hash(s.seed, k, 22) + s.time * speed / (sh.h + 2f)) % 1f;
            float q = 0.10f + 0.08f * RiftShape.hash(s.seed, k, 23);
            float x = (RiftShape.hash(s.seed, k, 24) - 0.5f) * sh.w * 0.7f;
            float y = RiftShape.BASE + life * (sh.h + 0.4f);
            float z = -0.4f - 0.7f * RiftShape.hash(s.seed, k, 25);
            float a = (float) Math.sin(life * Math.PI) * 0.7f;
            if (a < 0.03f) continue;
            float[][] v = new float[8][];
            for (int n = 0; n < 8; n++) v[n] = new float[]{x + ((n & 1) == 0 ? -q : q), y + ((n & 2) == 0 ? -q : q), z + ((n & 4) == 0 ? -q : q)};
            int[][] edges = {{0, 1}, {2, 3}, {4, 5}, {6, 7}, {0, 2}, {1, 3}, {4, 6}, {5, 7}, {0, 4}, {1, 5}, {2, 6}, {3, 7}};
            for (int[] e : edges) line(p, vc, wvStill, v[e[0]], v[e[1]], 0.03f, WHITE, a * 0.8f);
        }
    }

    private static final Warp wvStill = Warp.STILL;

    /** A camera-facing square from four already-placed corners (the primitive itself stays axis-aligned). */
    private static void face(PoseStack.Pose p, VertexConsumer vc, float[] a, float[] b, float[] c, float[] d, float[] col, float alpha) {
        if (!SiftBudget.take(vc)) return;
        vc.addVertex(p, a[0], a[1], a[2]).setColor(col[0], col[1], col[2], alpha);
        vc.addVertex(p, b[0], b[1], b[2]).setColor(col[0], col[1], col[2], alpha);
        vc.addVertex(p, c[0], c[1], c[2]).setColor(col[0], col[1], col[2], alpha);
        vc.addVertex(p, d[0], d[1], d[2]).setColor(col[0], col[1], col[2], alpha);
    }

    // ------------------------------------------------------------------ 7. soft aura

    /** Five wide soft sheets on the rift's flanks; additive bells, no hard poles (spec section 9). */
    private static void aura(PoseStack.Pose p, VertexConsumer vc, RiftShape sh, State s, float[] tint, Vector3f cam) {
        float strength = s.night ? 0.30f : 0.18f;
        for (int k = 0; k < 5; k++) {
            float side = k % 2 == 0 ? -1f : 1f;
            float x = side * (sh.w * 0.42f + (k / 2) * 1.7f + 0.6f * RiftShape.hash(s.seed, k, 41));
            float z = -0.2f - 0.8f * RiftShape.hash(s.seed, k, 42);
            float width = 2.0f + 1.4f * RiftShape.hash(s.seed, k, 43);
            float height = 7f + 5f * RiftShape.hash(s.seed, k, 44);
            float vx = cam.x - x, vz = cam.z - z, len = (float) Math.sqrt(vx * vx + vz * vz);
            if (len < 1e-3f) continue;
            float rx = -vz / len, rz = vx / len;
            int strips = 6;
            float[] base = mix(tint, WHITE, 0.35f);
            float[] top = mix(base, WHITE, 0.55f);
            float[] ys = {-1f, 1.0f, height * 0.45f, height};
            float[] va = {0f, 1f, 0.75f, 0f};
            for (int st = 0; st < strips; st++) {
                float s0 = st / (float) strips * 2f - 1f, s1 = (st + 1) / (float) strips * 2f - 1f;
                float a0 = (float) Math.exp(-s0 * s0 * 2.6f), a1 = (float) Math.exp(-s1 * s1 * 2.6f);
                float o0 = s0 * width / 2, o1 = s1 * width / 2;
                for (int seg = 0; seg < 3; seg++) {
                    float[] cA = mix(base, top, ys[seg] / height), cB = mix(base, top, ys[seg + 1] / height);
                    col(p, vc, wvStill, x + rx * o0, ys[seg], z + rz * o0, cA, strength * a0 * va[seg]);
                    col(p, vc, wvStill, x + rx * o1, ys[seg], z + rz * o1, cA, strength * a1 * va[seg]);
                    col(p, vc, wvStill, x + rx * o1, ys[seg + 1], z + rz * o1, cB, strength * a1 * va[seg + 1]);
                    col(p, vc, wvStill, x + rx * o0, ys[seg + 1], z + rz * o0, cB, strength * a0 * va[seg + 1]);
                }
            }
        }
    }

    // ------------------------------------------------------------------ primitives

    private static void rect(PoseStack.Pose p, VertexConsumer vc, Warp wv, float x0, float y0, float x1, float y1, float z, float[] c, float a) {
        col(p, vc, wv, x0, y0, z, c, a); col(p, vc, wv, x1, y0, z, c, a);
        col(p, vc, wv, x1, y1, z, c, a); col(p, vc, wv, x0, y1, z, c, a);
    }

    private static void halo(PoseStack.Pose p, VertexConsumer vc, Warp wv, float cx, float cy, float z, float r, float[] c, float a) {
        int n = 40;
        for (int k = 0; k < n; k++) {
            double t0 = k * Math.PI * 2 / n, t1 = (k + 1) * Math.PI * 2 / n;
            col(p, vc, wv, cx, cy, z, c, a); col(p, vc, wv, cx, cy, z, c, a);
            col(p, vc, wv, cx + (float) Math.cos(t1) * r, cy + (float) Math.sin(t1) * r, z, c, 0f);
            col(p, vc, wv, cx + (float) Math.cos(t0) * r, cy + (float) Math.sin(t0) * r, z, c, 0f);
        }
    }

    /** Camera-facing gradient strip: halo (0) -> halo (0.4) -> white core (1) -> halo (0.4) -> halo (0). */
    private static void band(PoseStack.Pose p, VertexConsumer vc, Warp wv, float[] a, float[] b, float core, float outer,
                             float[] white, float[] halo, float alpha) {
        float dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
        float vx = (a[0] + b[0]) / 2, vy = (a[1] + b[1]) / 2, vz = (a[2] + b[2]) / 2;
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
    private static void line(PoseStack.Pose p, VertexConsumer vc, Warp wv, float[] a, float[] b, float width, float[] c, float alpha) {
        float dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
        float vx = (a[0] + b[0]) / 2, vy = (a[1] + b[1]) / 2, vz = (a[2] + b[2]) / 2;
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

    // ------------------------------------------------------------------ milky field (shared with rift.fsh)

    static final float[] WHITE = {1f, 1f, 1f};

    /** Scalar lerp; the vector overload below is for colours. */
    private static float mix(float a, float b, float t) { return a + (b - a) * t; }

    private static float hash21(float x, float y) {
        float n = (float) Math.sin(x * 127.1f + y * 311.7f) * 43758.5453f;
        return n - (float) Math.floor(n);
    }

    private static float vnoise(float x, float y) {
        float ix = (float) Math.floor(x), iy = (float) Math.floor(y);
        float fx = x - ix, fy = y - iy;
        fx = fx * fx * (3f - 2f * fx); fy = fy * fy * (3f - 2f * fy);
        return mix(mix(hash21(ix, iy), hash21(ix + 1f, iy), fx), mix(hash21(ix, iy + 1f), hash21(ix + 1f, iy + 1f), fx), fy);
    }

    private static float fbm(float x, float y) {
        float s = 0f, a = 0.5f;
        for (int i = 0; i < 3; i++) { s += a * vnoise(x, y); x = x * 2.03f + 17.1f; y = y * 2.03f + 9.2f; a *= 0.5f; }
        return s;
    }

    // ------------------------------------------------------------------ small helpers

    private static float clamp(float v, float lo, float hi) { return Math.max(lo, Math.min(hi, v)); }
    private static float smooth(float e0, float e1, float x) { float t = clamp((x - e0) / (e1 - e0), 0f, 1f); return t * t * (3f - 2f * t); }
    private static float[] mix(float[] a, float[] b, float t) {
        return new float[]{a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t};
    }
}
