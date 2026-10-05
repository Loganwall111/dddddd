package dev.logan.entersift.client;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.logan.entersift.RiftPortalEntity;
import dev.logan.entersift.RiftType;
import dev.logan.entersift.RiftShape;
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
 * 0.27 reference-inspired stepped-cross rift renderer (visual parity unverified) (Images 1, 2, 3, 7, 8, 13, 14, 19, 20, 22-28, 36-38).
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
    static final float RIPPLE_END = 60, SEED_START = 0, CLUSTER_START = 8, GROWN = 100;
    /** Recessed alcove constants; FLANGE is kept sleek so the glowing white neon rim stays razor-sharp. */
    /** 0.32: the references' borders are thick chunky bevels, not hairline inlays. */
    static final float COLLAR = 0.12f, FLANGE = 0.06f;
    /**
     * 0.37 real-geometry constants. LIP is the front plane of every frosted panel (the side walls run
     * from here to the panel's back plane), PROUD is how far the outer frame band stands in front of
     * the glass, and BACK_FLOOR is the alpha the deepest faces dissolve to. Together they give the
     * rift a visible thickness in oblique views instead of reading as a flat sheet.
     */
    static final float LIP = COLLAR, PROUD = COLLAR + 0.085f;
    /** 0.37 varied lightning tints: white, ice, magenta, violet, warm gold, mint. */
    static final float[][] BOLT_TINTS = {rgb(0xFFFFFF), rgb(0xBFE9FF), rgb(0xFFA6E6), rgb(0xC9A6FF), rgb(0xFFE6A8), rgb(0x9FF0D8)};
    /**
     * 0.28 back fading (reference screenshots): the frosted voxel structure recedes behind the opening
     * plane (negative Z) and dissolves instead of ending on a hard backside. Faces fade to nothing over
     * FADE_NEAR..FADE_FAR; edges keep a fraction so the wireframe stays readable while it recedes.
     * The window itself is deliberately exempt — the opening stays clear.
     */
    static final float FADE_NEAR = 0.06f, FADE_FAR = 1.0f;
    /**
     * Placement timing (reference placement sequence): the seed throws lightning while the box rebuilds, ONE
     * gigantic white band appears on the land and races out to ~62 blocks, the rift snaps in and flares
     * white, and a few ticks later the white dissolves into the rift's colours.
     */
    static final float SHOCK_END = 40f, RIFT_BIRTH = 42f, RIFT_COLOUR = 48f;
    /** Distance (blocks) at which the frosted layer starts to clear, and where it is as clear as it gets. */
    static final float FROST_NEAR = 7.5f, FROST_CLEAR = 1.6f, FROST_ALPHA = 0.5f;
    static final int SUB = 4; // subdivisions per cell edge so vertical sides curve smoothly with the wave
    static final float[] VIBRANT_PINK_DAY = rgb(0xFF6FA8);
    static final float[] DEEP_AMBER_NIGHT = rgb(0xDB7840);

    /**
     * 6-Phase Rift Opening & Closing Lifecycle:
     *   Phase A (DORMANT)        -> pre-ignition
     *   Phase B (DISTORTION)     -> seed bar, shockwave, radial back distortion, bolts
     *   Phase C (WHITE_IGNITION) -> intense white flash & stepped aperture birth
     *   Phase D (COLOR_REVEAL)   -> white flash dissolves into cyan/pink/magenta/style colours
     *   Phase E (STABLE_OPEN)    -> full shader-extruded idle Rift with wavy dark bands, floating squares, and god rays
     *   Phase F (CLOSING)        -> inward contraction and clean fade before removal
     */
    public enum LifecyclePhase {
        DORMANT, DISTORTION, WHITE_IGNITION, COLOR_REVEAL, STABLE_OPEN, CLOSING
    }

    public static LifecyclePhase phaseForAge(float age) {
        if (age <= 0f) return LifecyclePhase.DORMANT;
        if (age < RIFT_BIRTH - 6f) return LifecyclePhase.DISTORTION;
        if (age <= RIFT_BIRTH + 1f) return LifecyclePhase.WHITE_IGNITION;
        if (age < GROWN) return LifecyclePhase.COLOR_REVEAL;
        if (age >= RiftPortalEntity.MAX_TICKS - 30f) return LifecyclePhase.CLOSING;
        return LifecyclePhase.STABLE_OPEN;
    }

    private static final Map<Long, RiftShape> SHAPES = new LinkedHashMap<>(32, 0.75f, true) {
        @Override protected boolean removeEldestEntry(Map.Entry<Long, RiftShape> eldest) { return size() > 48; }
    };

    public RiftPortalRenderer(EntityRendererProvider.Context context) { super(context); }

    public static final class State extends EntityRenderState {
        RiftType type = RiftType.SIFT;
        float w, h, age, yaw, pitch, time;
        long seed, clock;
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
        s.clock = clock;
        // Endure is the Sift's night-like tide; outside the Sift, use the local world clock's night range.
        s.night = s.inSift ? SiftTides.isEndure(clock) : clock >= 13_000L && clock < 23_000L;
        s.view = viewCode(s.type, s.inSift, s.seed);
        var mc = net.minecraft.client.Minecraft.getInstance();
        // 0.37: the rising energy CUBES are retired by default — the references show a light
        // column instead (see lightBeam). The particles only run if a player re-enables them.
        if (SiftBudget.riftEnergyCubes && level != null && !mc.isPaused() && SiftBudget.riftEffects && e.age() >= 60 && s.type != RiftType.PORTAL) {
            if (level.getRandom().nextFloat() < 0.22f) {
                double ang = Math.toRadians(-s.yaw + 180f);
                double ox = (level.getRandom().nextDouble() - 0.5) * s.w * 0.85;
                double oy = RiftShape.BASE + level.getRandom().nextDouble() * s.h * 0.75;
                double oz = (level.getRandom().nextDouble() - 0.5) * 0.45;
                double wx = s.ex + ox * Math.cos(ang) + oz * Math.sin(ang);
                double wz = s.ez - ox * Math.sin(ang) + oz * Math.cos(ang);
                RiftEnergyCubeParticle.spawn(wx, s.ey + oy, wz, s.type, level.getRandom().nextInt(3));
            }
        }
    }

    @Override
    protected AABB getBoundingBoxForCulling(RiftPortalEntity e, float partial) {
        // While the placement blast is still running the structure's visible footprint is the whole shockwave,
        // so the culling box has to grow with it or the band pops out when the camera pulls back.
        boolean blasting = SiftBudget.riftShock && e.age() <= SHOCK_END + 4f;
        float r = Math.max(e.riftWidth(), e.riftHeight()) + (blasting ? 68f : 8f);
        return e.getBoundingBox().inflate(r, blasting ? 26f : r * 2f, r);
    }

    /**
     * Destination shown in the window (the rift type IS the destination): 0 Overworld (coral sky, blocky
     * cream clouds), 1 Nether (crimson smoke, fortress), 2 End (blue starlit islands), 3 Sift (mint sky,
     * pillars; pink-white at night), 4 ritual portal (cyan mosaic), 5 the Overworld seen from the Sift (gold).
     */
    /**
     * The window's style index. 0-5 are the destinations; 6 and 7 are the reference styles (white cross and
     * the steep olive wall). Rift types 1 and 2 alternate between the plain destination colour and a
     * reference style so every world shows several colours of rift, as the references do.
     */
    static int viewCode(RiftType type, boolean inSift, long seed) {
        float pick = RiftShape.hash(seed, 7, 233); // stable per rift, and the only source of the style
        if (type == RiftType.SIFT) return pick < 0.50f ? 3 : pick < 0.80f ? 4 : 7;
        if (type == RiftType.OVERWORLD) return pick < 0.50f ? 0 : pick < 0.82f ? 3 : 7;
        if (type == RiftType.NETHER) return pick < 0.70f ? 1 : 3;
        if (type == RiftType.END) return pick < 0.70f ? 2 : 4;
        return type.id;
    }

    /** Per-destination colours: rim core, rim halo, wall at the lip, wall at the back (trailer frames). */
    private record Look(float[] core, float[] halo, float[] wallFront, float[] wallBack, float[] frost) {}

    /**
     * Eight rift styles. 0-5 are the destinations; 6 is the white reference rift (17345525) and 7 the
     * steep green-grey wall (The_Nether). The last two are full-colour variants with a grey frosted layer
     * so they stay close to the reference, which is what the references show: some rifts green, some
     * lime, some red, some yellow, some orange. Frost tones are the measured averages of the reference
     * crops (olive #6e7781, red #9a3d36, yellow #d9c96c, orange #daa687, pink #dfcfd5) lifted to a
     * frosted brightness so they read as glass, not paint.
     */
    private static final Look[] LOOKS = {
        // 0 overworld: warm coral-peach inner walls + pure white neon rim + warm pink frost
        new Look(c(1f, 0.99f, 0.97f), c(1f, 0.58f, 0.46f), c(1f, 0.86f, 0.78f), c(0.88f, 0.42f, 0.44f), c(0.90f, 0.75f, 0.76f)),
        // 1 nether: fiery crimson-ruby walls + white-gold rim + measured red frost (#9a3d36)
        new Look(c(1f, 0.97f, 0.86f), c(1f, 0.38f, 0.18f), c(0.96f, 0.52f, 0.44f), c(0.58f, 0.12f, 0.20f), c(0.86f, 0.44f, 0.40f)),
        // 2 end: twilight rose-plum walls + pale lime-white & violet rim + blue-grey frost
        new Look(c(0.98f, 1f, 0.92f), c(0.82f, 0.56f, 0.96f), c(0.94f, 0.68f, 0.86f), c(0.46f, 0.24f, 0.54f), c(0.52f, 0.44f, 0.58f)),
        // 3 sift: warm coral-rose walls + crisp white rim + measured pink frost (#dfcfd5)
        new Look(c(1f, 1f, 1f), c(1f, 0.62f, 0.58f), c(1f, 0.84f, 0.80f), c(0.84f, 0.38f, 0.48f), c(0.88f, 0.81f, 0.83f)),
        // 4 portal: electric cyan walls + ice-white rim
        new Look(c(0.94f, 1f, 1f), c(0.22f, 0.94f, 1f), c(0.62f, 0.98f, 1f), c(0.08f, 0.46f, 0.64f), c(0.40f, 0.70f, 0.78f)),
        // 5 gold (Overworld seen from the Sift): blazing golden walls + lemon-white rim + measured yellow frost (#d9c96c)
        new Look(c(1f, 0.99f, 0.72f), c(1f, 0.86f, 0.18f), c(1f, 0.92f, 0.48f), c(0.78f, 0.54f, 0.12f), c(0.92f, 0.88f, 0.66f)),
        // 6 the white reference rift (17345525): everything white, the pure glowing cross
        new Look(c(1f, 1f, 1f), c(1f, 0.92f, 0.94f), c(1f, 0.98f, 0.98f), c(0.96f, 0.88f, 0.90f), c(0.97f, 0.96f, 0.96f)),
        // 7 the steep wall reference (The_Nether): measured olive-grey frost (#6e7781), orange inner glow
        new Look(c(1f, 0.86f, 0.62f), c(1f, 0.62f, 0.30f), c(0.96f, 0.80f, 0.62f), c(0.52f, 0.30f, 0.18f), c(0.52f, 0.55f, 0.60f)),
    };

    /** 0-5 come from the destination; 6 (white) and 7 (steep wall) are the reference styles, chosen per rift. */
    private static Look lookFor(int value) {
        if (value < 0 || value >= LOOKS.length) { // non-destructive guard: wrap instead of clamping to a wrong one
            value = ((value % LOOKS.length) + LOOKS.length) % LOOKS.length;
        }
        return LOOKS[value];
    }

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

    /** 1 at the front plane, 0 once the geometry has receded FADE_FAR behind it. */
    /**
     * 0.31 proximity: 1 while the camera is far from the rift, easing to 0 as it approaches, so the frosted
     * layer clears as you walk up to the opening without ever becoming fully transparent. The distance is
     * measured in the rift's own rotated frame: dz is how far the camera stands in front of the plane.
     */
    static float frostProximity(Vector3f cam) {
        if (!SiftBudget.riftProximity) return 1f;
        float dz = Math.abs(cam.z);
        float f = clamp((dz - FROST_CLEAR) / (FROST_NEAR - FROST_CLEAR), 0f, 1f);
        return f * f * (3f - 2f * f); // smoothstep, so it eases rather than snapping
    }

    static float backFade(float z) {
        if (!SiftBudget.riftBackFade) return 1f;
        float f = clamp((-z - FADE_NEAR) / (FADE_FAR - FADE_NEAR), 0f, 1f);
        return 1f - f * f * (3f - 2f * f);
    }

    private static float faceA(float z, float a) { return a * backFade(z); }

    private static float edgeA(float z, float a) { return a * (0.45f + 0.55f * backFade(z)); }

    /** Detached boxes fade with their distance from the opening centre, not only with depth. */
    /**
     * 0.32 tip fade: the outer boxes dissolve to nothing at the ends, exactly as the reference rifts fade
     * out — 1 in the middle of the structure, 0 past the arms. Applied to the rims and the frosted panels.
     */
    static float tipFade(RiftShape sh, float x, float y) {
        if (!SiftBudget.riftTipFade) return 1f;
        float dx = x / Math.max(0.001f, sh.w * 0.5f), dy = (y - sh.cy()) / Math.max(0.001f, sh.h * 0.5f);
        float r = (float) Math.sqrt(dx * dx + dy * dy);
        float f = clamp((r - 0.30f) / 0.75f, 0f, 1f);
        return 1f - f * f * f;
    }

    /**
     * 0.32 wavy border: a slow travelling wave applied to the SIDE borders of the silhouette (never to the
     * recessed steps inside it), so the outer edges undulate like the reference rifts.
     */
    static float borderWave(float along, float time) {
        // 0.33: two travelling sines with the amplitudes raised — the references' side borders are
        // strongly corrugated, not gently bowed.
        return 0.18f * (float) Math.sin(along * 1.9f + time * 1.1f)
             + 0.075f * (float) Math.sin(along * 3.7f - time * 1.7f);
    }

    static float spokeFade(RiftShape sh, float x, float y) {
        if (!SiftBudget.riftBackFade) return 1f;
        float dx = x / Math.max(0.001f, sh.w * 0.5f), dy = (y - sh.cy()) / Math.max(0.001f, sh.h * 0.5f);
        float r = (float) Math.sqrt(dx * dx + dy * dy);
        float f = clamp((r - 1.05f) / 1.15f, 0f, 1f);
        return 1f - 0.5f * f * f;
    }

    /** Coloured vertex (walls, rims, glow). */
    private static void col(PoseStack.Pose p, VertexConsumer vc, Warp wv, float x, float y, float z, float[] c, float a) {
        if (!SiftBudget.take(vc)) return;
        float wx = x + wv.dx(x, y, z), wy = y + wv.dy(x, y, z), wz = z + wv.dz(x, y, z);
        if (!Float.isFinite(wx + wy + wz)) { wx = 0f; wy = 0f; wz = 0f; a = 0f; }
        vc.addVertex(p, wx, wy, wz).setColor(Math.min(1f, c[0]), Math.min(1f, c[1]), Math.min(1f, c[2]), Math.max(0f, Math.min(1f, a)));
    }

    /**
     * Window vertex. Colour carries (face u, face v, view code, alpha) and alpha is split: the fraction
     * above {@link #FROST_ALPHA} is the proximity term the shader turns into "the frosted layer clears as
     * you get closer", the rest is the ordinary fade. A vertex with no proximity data packs 0 + fade/2.
     */
    private static void win(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, float x, float y, float z, float code, float fade) {
        win(p, vc, wv, sh, x, y, z, code, fade, 0f);
    }

    /** One pane across a rect, with the uv mapped over that rect (the opening's own 0..1 face uv). */
    private static void winPaneSub(PoseStack.Pose p, VertexConsumer vc, Warp wv,
                                   float x0, float y0, float x1, float y1, float z, float code, float fade, float frost) {
        for (int sx = 0; sx < SUB; sx++) for (int sy = 0; sy < SUB; sy++) {
            float xa = x0 + (x1 - x0) * (sx / (float) SUB), xb = x0 + (x1 - x0) * ((sx + 1) / (float) SUB);
            float ya = y0 + (y1 - y0) * (sy / (float) SUB), yb = y0 + (y1 - y0) * ((sy + 1) / (float) SUB);
            for (float[] q : new float[][]{{xa, ya}, {xb, ya}, {xb, yb}, {xa, yb}}) {
                if (!SiftBudget.take(vc)) return;
                float wx = q[0] + wv.dx(q[0], q[1], z), wy = q[1] + wv.dy(q[0], q[1], z), wz = z + wv.dz(q[0], q[1], z);
                if (!Float.isFinite(wx + wy + wz)) { wx = 0f; wy = 0f; wz = 0f; }
                float u = clamp((q[0] - x0) / (x1 - x0), 0f, 1f), v = clamp((q[1] - y0) / (y1 - y0), 0f, 1f);
                vc.addVertex(p, wx, wy, wz).setColor(u, v, code, clamp(fade, 0f, 1f) * 0.5f + clamp(frost, 0f, 1f) * 0.5f);
            }
        }
    }

    private static void win(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, float x, float y, float z, float code, float fade, float frostTint) {
        if (!SiftBudget.take(vc)) return;
        float span = Math.max(sh.w, sh.h) * 1.15f;
        float u = clamp(0.5f + x / span, 0f, 1f), v = clamp(0.5f + (y - sh.cy()) / span, 0f, 1f);
        float wx = x + wv.dx(x, y, z), wy = y + wv.dy(x, y, z), wz = z + wv.dz(x, y, z);
        if (!Float.isFinite(wx + wy + wz)) { wx = 0f; wy = 0f; wz = 0f; }
        float a = clamp(fade, 0f, 1f) * 0.5f + clamp(frostTint, 0f, 1f) * 0.5f;
        vc.addVertex(p, wx, wy, wz).setColor(u, v, code, a);
    }

    // ------------------------------------------------------------------ submit

    @Override
    public void submit(State s, PoseStack pose, SubmitNodeCollector out, CameraRenderState camera) {
        if (SiftRenderTypes.irisShadowPass()) return;       // self-lit: nothing in the shadow map
        // 0.26 rifts now open any time (day or night, any dimension, even in the Sift) — only the aura
        // (curtains / energyCubes / spark / night motes) remains midnight-gated. The next line is kept as
        RiftShape sh = SHAPES.computeIfAbsent(s.seed * 1315423911L + Float.floatToIntBits(s.w) * 131L + Float.floatToIntBits(s.h),
            k -> RiftShape.build(s.type, s.seed, s.w, s.h));
        Look look = lookFor(s.view);
        // Fix front-face: the rift's +Z window must face the player direction, not away. The original
        // `-s.yaw` placed the bright fractured side behind the observer; adding 180 deg flips it so the
        // neon-rimmed cavity faces the camera (Image 2, 6, 7). Cam is rotated oppositely to stay consistent.
        Vector3f cam = new Vector3f((float) (camera.pos.x - s.ex), (float) (camera.pos.y - s.ey), (float) (camera.pos.z - s.ez))
            .rotateY((float) Math.toRadians(s.yaw + 180f));
        boolean gpu = SiftBudget.riftShader;
        // 0.37: the GPU path draws the same REAL geometry as the fallback — the rift is a stepped
        // voxel structure with thickness, not one flat SDF canvas. Only the render types differ.
        RenderType wallT = gpu ? SiftRenderTypes.RIFT_WALL : SiftRenderTypes.GLASS;
        RenderType glowT = gpu ? SiftRenderTypes.RIFT_GLOW : SiftRenderTypes.GLOW;
        RenderType winT = gpu
            ? (RiftScene.request() ? SiftRenderTypes.RIFT_MEMBRANE_REFRACT : SiftRenderTypes.RIFT_MEMBRANE)
            : SiftRenderTypes.GLASS;
        float age = s.age;
        // 0.29r: the rift snaps in white and dissolves into its colours a few ticks later.
        float fl = whiteFlash(age);
        Look look2 = fl > 0.001f ? whiten(look, fl) : look;
        // 0.31: how frosted the glazed square is right now — full when you are away from it, light when close.
        float frost = 0.55f * frostProximity(cam);
        float wf = 1f - 0.75f * fl;
        Warp wv = Warp.STILL; // crisp voxel edges; distortion belongs behind the opening
        Warp still = Warp.STILL;
        float code = encodeView(s);
        pose.pushPose();
        try {
            pose.rotate(new Quaternionf().rotationY((float) Math.toRadians(-s.yaw + 180f)));
            if (age <= SHOCK_END) out.submitCustomGeometry(pose, glowT, (p, vc) -> shockwave(p, vc, still, sh, look, s, cam, age));
            if (age < CLUSTER_START) {
                // Summon: seed bar, arcs, shock ripples and the reference's mixed-colour lightning.
                float a = age;
                out.submitCustomGeometry(pose, glowT, (p, vc) -> {
                    seedBox(p, vc, still, sh, look, a, cam);
                    if (SiftBudget.riftEffects) seedBolts(p, vc, sh, s, cam, look, a);
                    summonBolts(p, vc, still, sh, s, cam, look, a);
                    if (SiftBudget.riftEffects && SiftBudget.riftFlares) rotatingArcs(p, vc, sh, s, cam, a);
                    if (SiftBudget.riftEffects && SiftBudget.riftBloom) seedShell(p, vc, sh, s, a);
                    if (a > 4f) ripple(p, vc, still, sh, look, (a - 4f) * 15f);
                });
            }
            if (age >= CLUSTER_START) {
                float a = age;
                // Paint order is deepest first: the recessed membrane, then the voxel shell
                // (panels + reveal walls + proud frame), then everything additive on top.
                if (gpu) out.submitCustomGeometry(pose, winT, (p, vc) -> windows(p, vc, wv, sh, a, code, s, wf, frost));
                else out.submitCustomGeometry(pose, winT, (p, vc) -> windowsFlat(p, vc, wv, sh, a, s, wf, frost, look2));
                out.submitCustomGeometry(pose, wallT, (p, vc) -> {
                    boxFaces(p, vc, wv, sh, look2, cam, a);
                    walls(p, vc, wv, sh, look2, a, s);
                    frame(p, vc, wv, sh, look2, a);
                });
                out.submitCustomGeometry(pose, glowT, (p, vc) -> {
                    rims(p, vc, wv, sh, look2, cam, a, s);
                    if (SiftBudget.riftEffects && SiftBudget.riftBloom) bloomShell(p, vc, sh, look2, a);
                    if (SiftBudget.riftEffects) riftBolts(p, vc, wv, sh, s, cam, look, a);
                    summonBolts(p, vc, wv, sh, s, cam, look, a);
                    if (SiftBudget.riftEffects && SiftBudget.riftFlares) {
                        glitchTeeth(p, vc, sh, s, a);
                        clawRibbons(p, vc, sh, s, cam, a);
                    }
                    if (SiftBudget.riftEffects && SiftBudget.riftSpill && s.type != RiftType.PORTAL) wavySideVeils(p, vc, wv, sh, look2, s);
                    if (SiftBudget.riftEffects) riftGodRayShafts(p, vc, sh, look2, s, a);
                    if (SiftBudget.riftBeam) lightBeam(p, vc, sh, look2, s, cam, a);
                    else if (SiftBudget.riftEnergyCubes && SiftBudget.riftEffects && s.type != RiftType.PORTAL) energyCubes(p, vc, sh, s, cam, a);
                    if (age >= GROWN && SiftBudget.riftEffects) stable(p, vc, wv, sh, look2, cam, s);
                });
            }
        } finally {
            pose.popPose();
        }
    }

    /** Encodes palette and tide; framebuffer capture belongs to RiftScene, not this method. */
    private static float encodeView(State s) {
        return (s.view + (s.night ? 8 : 0) + 0.5f) / 32f;
    }

    // ------------------------------------------------------------------ timeline

    /** Seed explodes for 0–8 ticks; ravine tiers grow at 8, 33, 58, 83, settling by 100. */
    /** The box steps in during the last stretch of the blast, so the rift is born white right after it. */
    private static float appearAt(int tier) { return RIFT_BIRTH - 6f + Math.min(tier, RiftShape.TIERS - 1) * 2f; }

    /** 1 the instant the rift snaps into existence, 0 once it has dissolved into full colour. */
    static float whiteFlash(float age) {
        return 1f - clamp((age - RIFT_BIRTH) / (RIFT_COLOUR - RIFT_BIRTH), 0f, 1f);
    }

    /** The same palette pushed to white, so the whole rift flares before the colours come back in. */
    private static Look whiten(Look look, float k) {
        float[] w = c(1f, 1f, 1f);
        return new Look(mix(look.core(), w, k * 0.85f), mix(look.halo(), w, k * 0.85f),
            mix(look.wallFront(), w, k * 0.92f), mix(look.wallBack(), w, k * 0.92f), mix(look.frost(), w, k * 0.80f));
    }

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
            win(p, vc, wv, sh, 0f, sh.cy(), 0.08f, code, 1f); // aperture fan: opening stays clear
            win(p, vc, wv, sh, x0, y0, z0, code, 1f);
            win(p, vc, wv, sh, x1, y1, z1, code, 1f);
            win(p, vc, wv, sh, 0f, sh.cy(), 0.08f, code, 1f);
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
    private static void seedBox(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, Look look, float age, Vector3f cam) {
        float k = seedScale(age);
        if (k <= 0f) return;
        float stretch = clamp(age / 40f, 0f, 1f);
        // Reference placement frames: a tall, thin, tilted glowing slab that slowly turns while it grows.
        float hx = 0.30f, hy = 0.72f + 0.42f * stretch, hz = 0.11f, cy = sh.cy();
        float tilt = 0.52f + 0.10f * (float) Math.sin(age * 0.22f);
        float spin = age * 0.26f;
        float ct = (float) Math.cos(tilt), st = (float) Math.sin(tilt), cs = (float) Math.cos(spin), ss = (float) Math.sin(spin);
        float[][] v = new float[8][];
        for (int n = 0; n < 8; n++) {
            float x = (n & 1) == 0 ? -hx : hx, y = (n & 2) == 0 ? -hy : hy, z = (n & 4) == 0 ? -hz : hz;
            float rx = x * ct - y * st, ry = x * st + y * ct;
            v[n] = new float[]{rx * cs + z * ss, cy + ry, -rx * ss + z * cs};
        }
        int[][] faces = {{0, 1, 3, 2}, {4, 6, 7, 5}, {0, 4, 5, 1}, {2, 3, 7, 6}, {0, 2, 6, 4}, {1, 5, 7, 3}};
        float[] hot = c(1f, 0.98f, 1f);
        float pulse = 0.55f + 0.45f * (0.5f + 0.5f * (float) Math.sin(age * 2.2f));
        for (int[] f : faces) for (int idx : f) col(p, vc, wv, v[idx][0], v[idx][1], v[idx][2], hot, pulse);
        // Bright edges so the slab reads as the glowing monolith from the placement references.
        int[][] outline = {{0, 1}, {2, 3}, {0, 2}, {1, 3}, {4, 5}, {6, 7}, {4, 6}, {5, 7}, {0, 4}, {1, 5}, {2, 6}, {3, 7}};
        for (int[] e : outline) line(p, vc, Warp.STILL, cam, v[e[0]], v[e[1]], 0.05f, hot, pulse * 0.85f);
    }

    /** Six step-locked, rotating arcs, each six segments; pale pink tips. */
    private static void rotatingArcs(PoseStack.Pose p, VertexConsumer vc, RiftShape sh, State s, Vector3f cam, float age) {
        long seed = (long) (age / 4f) * 42107L;
        var random = new java.util.Random(seed);
        for (int arc = 0; arc < 6; arc++) {
            float angle = arc * (float) Math.PI / 3f + age * 0.055f;
            float[] prev = {0, sh.cy(), 0};
            for (int segment = 1; segment <= 6; segment++) {
                float radius = segment * 0.22f;
                float[] next = {(float) Math.cos(angle) * radius + (random.nextFloat() - 0.5f) * 0.25f,
                    sh.cy() + (float) Math.sin(angle) * radius + (random.nextFloat() - 0.5f) * 0.25f,
                    (random.nextFloat() - 0.5f) * 0.3f};
                line(p, vc, Warp.STILL, cam, prev, next, 0.027f, c(1f, 0.94f, 0.97f), 0.9f);
                line(p, vc, Warp.STILL, cam, prev, next, 0.10f, c(1f, 0.52f, 0.76f), 0.14f);
                prev = next;
            }
        }
    }

    /** Inflated six-face glare cubes, not an external post-processing bloom dependency. */
    private static void seedShell(PoseStack.Pose p, VertexConsumer vc, RiftShape sh, State s, float age) {
        float drift = (float) Math.sin(age * 0.32f) * 0.06f;
        for (int layer = 0; layer < 3; layer++) {
            float r = 0.36f + layer * 0.12f;
            shellBox(p, vc, drift - r, sh.cy() - r, -r, drift + r, sh.cy() + r, r,
                layer == 1 ? c(0.55f, 0.96f, 1f) : c(1f, 0.62f, 0.86f), 0.07f / (layer + 1));
        }
        // Brief non-destructive white cross: clearing terrain here would damage player builds.
        if (age < 3f) {
            rect(p, vc, Warp.STILL, -0.9f, sh.cy() - 0.025f, 0.9f, sh.cy() + 0.025f, 0.1f, c(1, 1, 1), 0.8f);
            rect(p, vc, Warp.STILL, -0.025f, sh.cy() - 0.9f, 0.025f, sh.cy() + 0.9f, 0.1f, c(1, 1, 1), 0.8f);
        }
    }

    /** Rim-only inflated shell: no giant filled rectangle obscuring the clear interior. */
    private static void bloomShell(PoseStack.Pose p, VertexConsumer vc, RiftShape sh, Look look, float age) {
        for (int i = 0; i < sh.cols; i++) for (int j = 0; j < sh.rows; j++) {
            if (!shown(sh, i, j, age)) continue;
            float x0 = sh.x(i), x1 = sh.x(i + 1), y0 = sh.y(j), y1 = sh.y(j + 1);
            for (int layer = 1; layer <= 3; layer++) {
                float r = layer * 0.045f, alpha = 0.045f / layer;
                if (!shown(sh, i - 1, j, age)) shellBox(p, vc, x0 - r, y0 - r, -r, x0 + r, y1 + r, r, look.halo(), alpha);
                if (!shown(sh, i + 1, j, age)) shellBox(p, vc, x1 - r, y0 - r, -r, x1 + r, y1 + r, r, look.halo(), alpha);
                if (!shown(sh, i, j - 1, age)) shellBox(p, vc, x0 - r, y0 - r, -r, x1 + r, y0 + r, r, look.halo(), alpha);
                if (!shown(sh, i, j + 1, age)) shellBox(p, vc, x0 - r, y1 - r, -r, x1 + r, y1 + r, r, look.halo(), alpha);
            }
        }
    }

    /** Fifteen small teeth along each exposed horizontal boundary, refreshed every four ticks. */
    private static void glitchTeeth(PoseStack.Pose p, VertexConsumer vc, RiftShape sh, State s, float age) {
        if (SiftBudget.riftShader && age > RIFT_BIRTH) return;
        int step = (int) (s.time * 5f);
        for (int tooth = 0; tooth < 15; tooth++) {
            int i = Math.min(sh.cols - 1, tooth * sh.cols / 15);
            float x = sh.x(i) + sh.cw * ((tooth * 0.618f) % 1f);
            float height = 0.025f + RiftShape.hash(s.seed, tooth, step) * 0.10f;
            for (int j = 0; j < sh.rows; j++) {
                if (!shown(sh, i, j, age)) continue;
                if (!shown(sh, i, j + 1, age)) rect(p, vc, Warp.STILL, x, sh.y(j + 1), x + 0.035f, sh.y(j + 1) + height, 0.015f, c(1, 0.86f, 0.93f), 0.65f);
                if (!shown(sh, i, j - 1, age)) rect(p, vc, Warp.STILL, x, sh.y(j) - height, x + 0.035f, sh.y(j), 0.015f, c(1, 0.86f, 0.93f), 0.65f);
            }
        }
    }

    /** Two curling ribbon tendrils. Opening-only sideways glitch leaves the collision plane unchanged. */
    private static void clawRibbons(PoseStack.Pose p, VertexConsumer vc, RiftShape sh, State s, Vector3f cam, float age) {
        if (SiftBudget.riftShader && age > RIFT_BIRTH) return;
        float glitch = age >= 20 && age <= 60 ? 0.08f * (float) Math.sin(Math.floor(age / 4) * 2.7) : 0;
        for (int side : new int[]{-1, 1}) {
            float[] previous = {side * sh.w * 0.52f, sh.cy() - sh.h * 0.3f, 0.1f};
            for (int segment = 1; segment <= 14; segment++) {
                float f = segment / 14f;
                float[] next = {side * (sh.w * 0.52f + 0.3f * (float) Math.sin(f * 5 + s.time)) + glitch,
                    sh.cy() + sh.h * (f * 0.75f - 0.3f),
                    0.1f + 0.22f * (float) Math.sin(f * 4 + s.time * 0.5f)};
                band(p, vc, Warp.STILL, cam, previous, next, 0.012f, 0.14f * (1 - f) + 0.015f,
                    c(1f, 0.92f, 0.95f), side < 0 ? c(1f, 0.45f, 0.65f) : c(0.45f, 0.85f, 1f), 0.3f * (1 - f));
                previous = next;
            }
        }
    }

    private static void shellBox(PoseStack.Pose p, VertexConsumer vc, float x0, float y0, float z0,
                                  float x1, float y1, float z1, float[] color, float alpha) {
        float[][] v = {{x0,y0,z0},{x1,y0,z0},{x0,y1,z0},{x1,y1,z0},
                       {x0,y0,z1},{x1,y0,z1},{x0,y1,z1},{x1,y1,z1}};
        int[][] faces = {{0,1,3,2},{4,6,7,5},{0,4,5,1},{2,3,7,6},{0,2,6,4},{1,5,7,3}};
        for (int[] face : faces) for (int index : face)
            col(p, vc, Warp.STILL, v[index][0], v[index][1], v[index][2], color, faceA(v[index][2], alpha));
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
                                   float x0, float y0, float x1, float y1, float z, float code, float fade) {
        winQuadSub(p, vc, wv, sh, x0, y0, x1, y1, z, code, fade, 0f);
    }

    private static void winQuadSub(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh,
                                   float x0, float y0, float x1, float y1, float z, float code, float fade, float frost) {
        for (int sx = 0; sx < SUB; sx++) for (int sy = 0; sy < SUB; sy++) {
            float xa = x0 + (x1 - x0) * (sx / (float) SUB), xb = x0 + (x1 - x0) * ((sx + 1) / (float) SUB);
            float ya = y0 + (y1 - y0) * (sy / (float) SUB), yb = y0 + (y1 - y0) * ((sy + 1) / (float) SUB);
            win(p, vc, wv, sh, xa, ya, z, code, fade, frost); win(p, vc, wv, sh, xb, ya, z, code, fade, frost);
            win(p, vc, wv, sh, xb, yb, z, code, fade, frost); win(p, vc, wv, sh, xa, yb, z, code, fade, frost);
        }
    }

    private static void windows(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, float age, float code, State s, float fade, float frost) {
        // 0.37: with the stepped-box look the opening is only the glazed square; every other cell is
        // solid frosted slab geometry (boxFaces), on the GPU path as well as the fallback.
        boolean boxFace = SiftBudget.riftBoxFace;
        if (boxFace) {
            // ONE pane across the whole glazed square. Drawing it cell by cell put a visible 3x3 grid of
            // glass tiles in the opening; the reference photos show a single frosted sheet.
            int i0 = sh.cols, i1 = -1, j0 = sh.rows, j1 = -1;
            for (int i = 0; i < sh.cols; i++) for (int j = 0; j < sh.rows; j++) {
                if (!sh.windowCell(i, j)) continue;
                i0 = Math.min(i0, i); i1 = Math.max(i1, i);
                j0 = Math.min(j0, j); j1 = Math.max(j1, j);
            }
            if (i1 >= i0 && j1 >= j0) {
                float x0 = sh.x(i0), x1 = sh.x(i1 + 1), y0 = sh.y(j0), y1 = sh.y(j1 + 1);
                // The membrane's own uv spans the opening (its cavity shading is keyed off the pane edge),
                // and it sits at the deepest recess of the cells it covers, flush with the reveal walls.
                float z = -sh.d(i0, j0);
                winPaneSub(p, vc, wv, x0, y0, x1, y1, z, code, fade, frost);
            }
            return; // satellites and cubes are frosted boxes too, drawn by boxFaces
        }
        for (int i = 0; i < sh.cols; i++) for (int j = 0; j < sh.rows; j++) {
            if (!shown(sh, i, j, age)) continue;
            float x0 = sh.x(i), x1 = sh.x(i + 1), y0 = sh.y(j), y1 = sh.y(j + 1), z = -sh.d(i, j);
            // The glazed square keeps a frosted sheet over it that clears (never fully) as the camera closes in.
            winQuadSub(p, vc, wv, sh, x0, y0, x1, y1, z, code, fade, frost);
        }
        if (boxFace) return; // satellites and cubes are frosted boxes too, drawn by boxFaces
        for (float[] b : sh.sats) {
            if (age < satAt(b)) continue;
            winQuadSub(p, vc, wv, sh, b[0], b[1], b[2], b[3], b[5], code,
                fade * spokeFade(sh, (b[0] + b[2]) * 0.5f, (b[1] + b[3]) * 0.5f) * backFade(b[5]));
        }
        if (age >= GROWN && s.type != RiftType.PORTAL) for (int k = 0; k < 5; k++) {
            float[] c = cube(sh, s, k);
            float q = c[3], z = c[2] - q;
            float f = fade * spokeFade(sh, c[0], c[1]) * backFade(z);
            win(p, vc, wv, sh, c[0] - q, c[1] - q, z, code, f); win(p, vc, wv, sh, c[0] + q, c[1] - q, z, code, f);
            win(p, vc, wv, sh, c[0] + q, c[1] + q, z, code, f); win(p, vc, wv, sh, c[0] - q, c[1] + q, z, code, f);
        }
    }

    /**
     * The frosted voxel box, as REAL extruded geometry since 0.37: every body cell that is not the glazed
     * square is a slab with a front pane on the {@link #LIP} plane, a back pane at the cell's own recess
     * depth (which dissolves with depth) and a lit inset frame. {@link #walls} closes the sides, including
     * the reveal around the opening. This is what turns the rift from "a window" into the references'
     * stepped grey box with one glazed square, and what gives it visible thickness in oblique views.
     */
    private static void boxFaces(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, Look look, Vector3f cam, float age) {
        if (!SiftBudget.riftBoxFace) return;
        // The frosted layer carries the rift's own colour (green / lime / red / yellow / orange), and the
        // frosted tips are the cells furthest from the window, warmed towards the inner glow.
        float[] face = look.frost();
        float[] tip = mix(look.frost(), look.core(), 0.30f);
        float[] pane = mix(face, tip, clamp((age - RIFT_BIRTH) / 30f, 0f, 1f));
        float[] back = mix(look.wallBack(), look.frost(), 0.35f);
        float[] edge = mix(look.core(), c(1f, 1f, 1f), 0.45f);
        // 0.37: every frosted cell is a REAL extruded slab. The front face sits on the lip plane and stays
        // crisp; the back face sits at the cell's recess depth and dissolves (backFade), so the structure
        // reads solid at the front and melts into nothing behind the opening, as the references do.
        // Cells are emitted deepest first so the translucent faces layer in the right order.
        int n = 0;
        float[] key = new float[sh.cols * sh.rows];
        int[] idx = new int[sh.cols * sh.rows];
        for (int i = 0; i < sh.cols; i++) for (int j = 0; j < sh.rows; j++) {
            if (!shown(sh, i, j, age) || sh.windowCell(i, j)) continue;
            key[n] = sh.d(i, j);
            idx[n] = i * sh.rows + j;
            n++;
        }
        for (int a = 1; a < n; a++) {            // insertion sort, deepest (largest z-recess) first
            float k = key[a];
            int q = idx[a], b = a - 1;
            while (b >= 0 && key[b] < k) { key[b + 1] = key[b]; idx[b + 1] = idx[b]; b--; }
            key[b + 1] = k;
            idx[b + 1] = q;
        }
        for (int a = 0; a < n; a++) {
            int i = idx[a] / sh.rows, j = idx[a] % sh.rows;
            float z = -sh.d(i, j);
            boolean tipCell = Math.abs(i - 5) + Math.abs(j - 3) >= 4;
            float cx = (sh.x(i) + sh.x(i + 1)) * 0.5f, cy2 = (sh.y(j) + sh.y(j + 1)) * 0.5f;
            float tf = tipFade(sh, cx, cy2) * spokeFade(sh, cx, cy2);
            if (tf <= 0.02f) continue;
            float x0 = sh.x(i), x1 = sh.x(i + 1), y0 = sh.y(j), y1 = sh.y(j + 1);
            float[] col = tipCell ? pane : face;
            // Front face on the lip plane: crisp, full strength.
            rectSub(p, vc, wv, x0, y0, x1, y1, LIP, col, 0.82f * tf);   // frosted glass, not paint
            // Back face at the recess depth: dissolves with depth (0.20 floor far back).
            float ba = (0.20f + 0.80f * backFade(z)) * 0.85f * tf;
            if (ba > 0.01f) rectSub(p, vc, wv, x0, y0, x1, y1, z, back, ba);
            // Lit border around the glazed square, so the hole reads as cut into the box.
            float ea = 0.55f * tf;
            // 0.33: every frosted slab is a PANE IN A FRAME — the references show white lines on both sides
            // of each beam, so a bright inset rectangle sits inside each panel's own silhouette.
            float in = 0.13f, ie = 0.28f * tf;
            float zf = LIP + 0.012f;           // 0.37: the inset frame rides on the panel's front lip
            line(p, vc, wv, cam, new float[]{x0 + in, y0 + in, zf}, new float[]{x1 - in, y0 + in, zf}, 0.045f, edge, ie);
            line(p, vc, wv, cam, new float[]{x0 + in, y1 - in, zf}, new float[]{x1 - in, y1 - in, zf}, 0.045f, edge, ie);
            line(p, vc, wv, cam, new float[]{x0 + in, y0 + in, zf}, new float[]{x0 + in, y1 - in, zf}, 0.045f, edge, ie);
            line(p, vc, wv, cam, new float[]{x1 - in, y0 + in, zf}, new float[]{x1 - in, y1 - in, zf}, 0.045f, edge, ie);
            if (isWindow(sh, i - 1, j)) line(p, vc, wv, cam, new float[]{x0, y0, LIP + 0.006f}, new float[]{x0, y1, LIP + 0.006f}, 0.08f, edge, ea);
            if (isWindow(sh, i + 1, j)) line(p, vc, wv, cam, new float[]{x1, y0, LIP + 0.006f}, new float[]{x1, y1, LIP + 0.006f}, 0.08f, edge, ea);
            if (isWindow(sh, i, j - 1)) line(p, vc, wv, cam, new float[]{x0, y0, LIP + 0.006f}, new float[]{x1, y0, LIP + 0.006f}, 0.08f, edge, ea);
            if (isWindow(sh, i, j + 1)) line(p, vc, wv, cam, new float[]{x0, y1, LIP + 0.006f}, new float[]{x1, y1, LIP + 0.006f}, 0.08f, edge, ea);
        }
        // The detached satellites stay HOLLOW, exactly like the reference's small outlined boxes (17345525):
        // rims() already draws their lit edges and corner posts, so no frosted pane goes on them.
        // 0.37 keeps them hollow but makes the hollow REAL: walls() closes each satellite into an
        // extruded open box (front ring on the lip plane, back ring at the recess depth), so the corner
        // posts and the two white outlines now sit on a genuine three-dimensional shell.
    }

    private static boolean isWindow(RiftShape sh, int i, int j) {
        return sh.on(i, j) && sh.windowCell(i, j);
    }

    /** rift_shader=false fallback: flat vertical gradient in the destination colours (no shader). */
    private static void windowsFlat(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, float age, State s, float fade, float frost, Look look) {
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
            if (SiftBudget.riftBoxFace && !sh.windowCell(i, j)) continue; // boxFaces draws the frosted panels
            float x0 = sh.x(i), x1 = sh.x(i + 1), y0 = sh.y(j), y1 = sh.y(j + 1), z = -sh.d(i, j);
            // 0.34 no-shader path: still a DESTINATION, never a clear pane onto the world behind the rift.
            float[] zenith = mix(g[1], g[0], 0.25f), horizonC = mix(g[0], c(1f, 1f, 1f), 0.30f);
            float[] ground = mix(g[1], c(0.03f, 0.04f, 0.06f), 0.55f);
            float v = (j + 0.5f) / sh.rows;                                     // 0 bottom .. 1 top
            float[] col = v > 0.30f ? mix(horizonC, zenith, (v - 0.30f) / 0.70f) : mix(ground, horizonC, v / 0.30f);
            float sun = (float) Math.exp(-Math.abs(v - 0.62f) * 6f) * (float) Math.exp(-Math.abs(i - 5.5f) * 0.55f);
            col = mix(col, c(1f, 1f, 1f), Math.min(0.85f, sun * 0.9f));
            col = mix(col, mix(look.frost(), look.core(), 0.25f), frost * 2f);
            float a = 0.82f * fade;
            col(p, vc, wv, x0, y0, z, col, a); col(p, vc, wv, x1, y0, z, col, a);
            col(p, vc, wv, x1, y1, z, col, a); col(p, vc, wv, x0, y1, z, col, a);
        }
        if (SiftBudget.riftBoxFace) return;
        for (float[] b : sh.sats) {
            if (age < satAt(b)) continue;
            float f = fade * spokeFade(sh, (b[0] + b[2]) * 0.5f, (b[1] + b[3]) * 0.5f) * backFade(b[5]);
            col(p, vc, wv, b[0], b[1], b[5], g[0], f); col(p, vc, wv, b[2], b[1], b[5], g[0], f);
            col(p, vc, wv, b[2], b[3], b[5], g[1], f); col(p, vc, wv, b[0], b[3], b[5], g[1], f);
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
            // 0.37: the REVEAL around the glazed opening. Where a frosted panel meets a window cell the
            // panel turns the corner back to the membrane plane, so the opening reads as a real hole
            // through thick glass (the strongest 3D cue in the reference screenshots).
            // The wall front is the lip plane, the back is the shared recess depth.
            if (zl > 0f && isWindow(sh, i - 1, j) && shown(sh, i - 1, j, age)) wall(p, vc, wv, x0, y0, x0, y1, lip(0f), -d, f, b, 0.90f);
            if (zr > 0f && isWindow(sh, i + 1, j) && shown(sh, i + 1, j, age)) wall(p, vc, wv, x1, y0, x1, y1, lip(0f), -d, f, b, 0.82f);
            if (zd > 0f && isWindow(sh, i, j - 1) && shown(sh, i, j - 1, age)) wall(p, vc, wv, x0, y0, x1, y0, lip(0f), -d, f, b, 1f);
            if (zu > 0f && isWindow(sh, i, j + 1) && shown(sh, i, j + 1, age)) wall(p, vc, wv, x0, y1, x1, y1, lip(0f), -d, f, b, 0.74f);
        }
        for (float[] q : sh.sats) {
            if (age < satAt(q)) continue;
            int m = (int) q[7];
            float sp = spokeFade(sh, (q[0] + q[2]) * 0.5f, (q[1] + q[3]) * 0.5f);
            if ((m & 1) == 0) wall(p, vc, wv, q[0], q[1], q[0], q[3], q[4], q[5], f, b, 0.92f, sp);
            if ((m & 2) == 0) wall(p, vc, wv, q[2], q[1], q[2], q[3], q[4], q[5], f, b, 0.84f, sp);
            if ((m & 4) == 0) wall(p, vc, wv, q[0], q[1], q[2], q[1], q[4], q[5], f, b, 1f, sp);
            if ((m & 8) == 0) wall(p, vc, wv, q[0], q[3], q[2], q[3], q[4], q[5], f, b, 0.76f, sp);
        }
        if (age >= GROWN && s.type != RiftType.PORTAL) for (int k = 0; k < 5; k++) {
            float[] c = cube(sh, s, k);
            float q = c[3], zf = c[2] + q, zb = c[2] - q;
            float sp = spokeFade(sh, c[0], c[1]);
            wall(p, vc, wv, c[0] - q, c[1] - q, c[0] - q, c[1] + q, zf, zb, f, b, 0.92f, sp);
            wall(p, vc, wv, c[0] + q, c[1] - q, c[0] + q, c[1] + q, zf, zb, f, b, 0.84f, sp);
            wall(p, vc, wv, c[0] - q, c[1] - q, c[0] + q, c[1] - q, zf, zb, f, b, 1f, sp);
            wall(p, vc, wv, c[0] - q, c[1] + q, c[0] + q, c[1] + q, zf, zb, f, b, 0.76f, sp);
        }
    }

    /** Subdivided wall strip so vertical sides and horizontal ledges bend smoothly with Warp. */
    private static void wall(PoseStack.Pose p, VertexConsumer vc, Warp wv, float xa, float ya, float xb, float yb, float zf, float zb,
                             float[] front, float[] back, float shade) {
        wall(p, vc, wv, xa, ya, xb, yb, zf, zb, front, back, shade, 1f);
    }

    private static void wall(PoseStack.Pose p, VertexConsumer vc, Warp wv, float xa, float ya, float xb, float yb, float zf, float zb,
                             float[] front, float[] back, float shade, float alphaMul) {
        float[] f = {front[0] * shade, front[1] * shade, front[2] * shade}, b = {back[0] * shade, back[1] * shade, back[2] * shade};
        float af = faceA(zf, alphaMul), ab = faceA(zb, alphaMul);
        // 0.37: the side faces used to be 16% filler on the GPU path because the shader painted the front
        // for us. Now that the shell is real extruded geometry those side faces ARE the 3D read, so the
        // stepped-structure option lifts them to near solid; the timid 0.16 stays for rift_structure_3d=false.
        float wallScale = SiftBudget.riftShader ? (SiftBudget.riftStructure3d ? 0.72f : 0.16f) : 1f;
        for (int s = 0; s < SUB; s++) {
            float t0 = s / (float) SUB, t1 = (s + 1) / (float) SUB;
            float x0 = xa + (xb - xa) * t0, y0 = ya + (yb - ya) * t0;
            float x1 = xa + (xb - xa) * t1, y1 = ya + (yb - ya) * t1;
            col(p, vc, wv, x0, y0, zf, f, af * wallScale); col(p, vc, wv, x1, y1, zf, f, af * wallScale);
            col(p, vc, wv, x1, y1, zb, b, ab * wallScale); col(p, vc, wv, x0, y0, zb, b, ab * wallScale);
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
            // 0.32: silhouette edges get the full wave and the tip fade; recessed internal steps keep a
            // quarter of the wave so the middle of the box stays crisp.
            float cxm = (x0 + x1) * 0.5f, cym = (y0 + y1) * 0.5f;
            if (zl <= 0) rim(p, vc, wv, cam, x0, y0, x0, y1, lip(zl), -d, core, halo, zl < 0, flash, jit,
                zl < 0 ? 0.25f : 1f, s.time, tipFade(sh, x0, cym), cxm, cym);
            if (zr <= 0) rim(p, vc, wv, cam, x1, y0, x1, y1, lip(zr), -d, core, halo, zr < 0, flash, jit,
                zr < 0 ? 0.25f : 1f, s.time, tipFade(sh, x1, cym), cxm, cym);
            if (zd <= 0) rim(p, vc, wv, cam, x0, y0, x1, y0, lip(zd), -d, core, halo, zd < 0, flash, jit,
                zd < 0 ? 0.25f : 1f, s.time, tipFade(sh, cxm, y0), cxm, cym);
            if (zu <= 0) rim(p, vc, wv, cam, x0, y1, x1, y1, lip(zu), -d, core, halo, zu < 0, flash, jit,
                zu < 0 ? 0.25f : 1f, s.time, tipFade(sh, cxm, y1), cxm, cym);
        }
        for (float[] q : sh.sats) {
            if (age < satAt(q)) continue;
            float flash = Math.max(0f, 1f - (age - satAt(q)) / 6f);
            float sp = spokeFade(sh, (q[0] + q[2]) * 0.5f, (q[1] + q[3]) * 0.5f);
            int m = (int) q[7];
            float qcx = (q[0] + q[2]) * 0.5f, qcy = (q[1] + q[3]) * 0.5f;
            if ((m & 1) == 0) rim(p, vc, wv, cam, q[0], q[1], q[0], q[3], q[4], q[5], core, halo, false, flash, jit,
                1f, s.time, sp * tipFade(sh, q[0], qcy), qcx, qcy);
            if ((m & 2) == 0) rim(p, vc, wv, cam, q[2], q[1], q[2], q[3], q[4], q[5], core, halo, false, flash, jit,
                1f, s.time, sp * tipFade(sh, q[2], qcy), qcx, qcy);
            if ((m & 4) == 0) rim(p, vc, wv, cam, q[0], q[1], q[2], q[1], q[4], q[5], core, halo, false, flash, jit,
                1f, s.time, sp * tipFade(sh, qcx, q[1]), qcx, qcy);
            if ((m & 8) == 0) rim(p, vc, wv, cam, q[0], q[3], q[2], q[3], q[4], q[5], core, halo, false, flash, jit,
                1f, s.time, sp * tipFade(sh, qcx, q[3]), qcx, qcy);
            float[][] corners = {{q[0], q[1], m & 5}, {q[2], q[1], m & 6}, {q[0], q[3], m & 9}, {q[2], q[3], m & 10}};
            for (float[] cr : corners)
                if (cr[2] == 0) line(p, vc, wv, cam, new float[]{cr[0], cr[1], q[4]}, new float[]{cr[0], cr[1], q[5]}, 0.05f, core, 0.8f * sp);
        }
    }

    /** Subdivided neon rim along each open or stepped edge so the white neon outline follows the wavy wall. */
    private static void rim(PoseStack.Pose p, VertexConsumer vc, Warp wv, Vector3f cam, float xa, float ya, float xb, float yb, float zf, float zb,
                            float[] core, float[] halo, boolean lip, float flash, float[] jit, float wave, float time, float fade,
                            float cx, float cy) {
        if (SiftBudget.riftShader && lip) return;
        float k = lip ? 0.75f : 1f, a = (lip ? 0.85f : 1f) * fade * (SiftBudget.riftShader ? 0.55f : 1f);
        // 0.33: the references' beams are white on BOTH sides with translucent glass between, so every border
        // also carries an inner line running parallel to it, offset towards the cell centre.
        float inx = 0f, iny = 0f;
        if (Math.abs(yb - ya) >= Math.abs(xb - xa)) inx = Math.signum(cx - xa); else iny = Math.signum(cy - ya);
        float inside = 0.13f * k;
        // 0.28: overlap neighbouring segments so the neon outline is a continuous band instead of dots.
        float overlap = (0.05f + 0.04f * flash) * k;
        for (int s = 0; s < SUB; s++) {
            float t0 = s / (float) SUB, t1 = (s + 1) / (float) SUB;
            float x0 = xa + (xb - xa) * t0, y0 = ya + (yb - ya) * t0;
            float x1 = xa + (xb - xa) * t1, y1 = ya + (yb - ya) * t1;
            // 0.32: vertical side borders undulate; horizontal borders ride a smaller wave.
            if (wave > 0f && !SiftBudget.riftShader) {
                if (Math.abs(yb - ya) >= Math.abs(xb - xa)) { x0 += borderWave(y0, time) * wave; x1 += borderWave(y1, time) * wave; }
                else { y0 += borderWave(x0, time) * wave * 0.55f; y1 += borderWave(x1, time) * wave * 0.55f; }
            }
            float dxs = x1 - x0, dys = y1 - y0, dlen = Math.max(1e-4f, (float) Math.sqrt(dxs * dxs + dys * dys));
            float ox = dxs / dlen * overlap, oy = dys / dlen * overlap;
            float[] fa = {x0 - ox, y0 - oy, zf + 0.006f}, fb = {x1 + ox, y1 + oy, zf + 0.006f};
            // 0.32: thick soft borders — the references' edges are broad glowing bands, not thin lines.
            band(p, vc, wv, cam, fa, fb, (0.20f + 0.12f * flash) * k, (0.58f + 0.24f * flash) * k, core, halo, a);
            if (!SiftBudget.riftShader) {
                line(p, vc, wv, cam, new float[]{x0 + jit[0] - ox, y0 + jit[1] - oy, zf + 0.01f}, new float[]{x1 + jit[0] + ox, y1 + jit[1] + oy, zf + 0.01f}, 0.075f * k, core, 0.30f * fade);
                line(p, vc, wv, cam, new float[]{x0 - ox + inx * inside, y0 - oy + iny * inside, zf + 0.014f},
                    new float[]{x1 + ox + inx * inside, y1 + oy + iny * inside, zf + 0.014f}, 0.05f * k, core, 0.35f * fade);
            }
            band(p, vc, wv, cam, new float[]{x0 - ox, y0 - oy, zb + 0.012f}, new float[]{x1 + ox, y1 + oy, zb + 0.012f}, 0.05f, 0.18f, core, halo, 0.40f * fade * (SiftBudget.riftShader ? 0.5f : 1f));
        }
    }

    /**
     * Translucent wavy reality-ripple / heat-haze ribbons undulating along the left and right outer flanks
     * of the rift (Images 7, 22, 23, 24, 26).
     */
    private static void wavySideVeils(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, Look look, State s) {
        if (SiftBudget.riftShader) return;
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
        // 0.28: the flat backdrop quad that used to sit behind the rift was removed. It read as a
        // floating transparent rectangle ("it is just a window"). The stepped cavity, its outer box
        // walls and the depth fade now carry the back of the structure instead.
    }

    /** Summon distortion stretch + ring/ripple (Image 7 right-most): on `age < 30` the ground around the anchor
     *  emits a thin expanding ring and behind the opening a short-lived vertical stretch veil.
     *  This was missing — the rift previously popped without the trailer's stretched reality tear. */
    private static void summonDistortion(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, Look look, State s, float age) {
        if (age >= RIPPLE_END + 10f) return;
        float f = clamp(age / RIPPLE_END, 0f, 1f);
        float ease = f * f * (3f - 2f * f);
        // Expanding ground ring at the anchor's feet
        float ringR = 0.35f + ease * Math.max(sh.w, sh.h) * 0.55f;
        float ringA = (1f - ease) * 0.38f;
        rippleRing(p, vc, wv, RiftShape.BASE + 0.02f, ringR, ringR, age * 1.6f, 0, look.halo(), ringA);
        // Vertical stretch behind the window (trailer's stretched veil)
        float stretchH = (1f - ease) * sh.h * 0.85f;
        float stretchA = (1f - ease) * 0.22f;
        if (stretchH > 0.05f) {
            float y0 = RiftShape.BASE;
            float y1 = RiftShape.BASE + stretchH;
            float z = -0.02f;
            float[] c = look.halo();
            // Three vertical streaks fanning slightly
            for (int k = -1; k <= 1; k++) {
                float x = k * sh.w * 0.14f;
                float w = 0.10f + Math.abs(k) * 0.06f;
                // twist with age
                float skew = (float) Math.sin(s.time * 2.2f + k) * 0.12f * (1f - ease);
                col(p, vc, wv, x - w + skew, y0, z, c, stretchA);
                col(p, vc, wv, x + w + skew, y0, z, c, stretchA);
                col(p, vc, wv, x + w - skew, y1, z, c, 0f);
                col(p, vc, wv, x - w - skew, y1, z, c, 0f);
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
                float sp = spokeFade(sh, c[0], c[1]);
                for (int[] e : edges) line(p, vc, wv, cam, v[e[0]], v[e[1]], 0.042f, core, 0.95f * sp);
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
        // 0.37: the frame is real geometry on the GPU path too, and it stands PROUD of the glass,
        // so the outer frames read as three-dimensional rails from every angle.
        // The references' frame is white/cream against the coloured shell, so the flange leans white
        // rather than wearing the wall's own peach.
        float[] face = mix(look.wallFront(), c(1f, 1f, 1f), 0.28f);
        float[] side = mix(face, look.wallBack(), 0.35f);
        float F = FLANGE, C = PROUD;
        for (int i = 0; i < sh.cols; i++) for (int j = 0; j < sh.rows; j++) {
            if (!shown(sh, i, j, age)) continue;
            float x0 = sh.x(i), x1 = sh.x(i + 1), y0 = sh.y(j), y1 = sh.y(j + 1);
            boolean L = !shown(sh, i - 1, j, age), R = !shown(sh, i + 1, j, age), D = !shown(sh, i, j - 1, age), U = !shown(sh, i, j + 1, age);
            if (L) { rectSub(p, vc, wv, x0 - F, y0, x0, y1, C, face, 1f);
                wall(p, vc, wv, x0 - F, y0 - (D ? F : 0), x0 - F, y1 + (U ? F : 0), C, C - 0.14f, side, side, 0.9f); }
            if (R) { rectSub(p, vc, wv, x1, y0, x1 + F, y1, C, face, 1f);
                wall(p, vc, wv, x1 + F, y0 - (D ? F : 0), x1 + F, y1 + (U ? F : 0), C, C - 0.14f, side, side, 0.82f); }
            if (D) { rectSub(p, vc, wv, x0, y0 - F, x1, y0, C, face, 1f);
                wall(p, vc, wv, x0 - (L ? F : 0), y0 - F, x1 + (R ? F : 0), y0 - F, C, C - 0.14f, side, side, 0.7f); }
            if (U) { rectSub(p, vc, wv, x0, y1, x1, y1 + F, C, face, 1f);
                wall(p, vc, wv, x0 - (L ? F : 0), y1 + F, x1 + (R ? F : 0), y1 + F, C, C - 0.14f, side, side, 1f); }
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
     * Midnight-only aura cubes (Image 6): large, highly translucent, thin-tall stretching rectangles
     * that drift UPWARD and surround the rift's perimeter, not its interior. The rift itself opens
     * any time; this aura is the only midnight-gated element. The string `velocityY = -0.035f` is
     * Previously they were small opaque 0.25-0.5 cubes drifting down inside the window.
     */
    private static void energyCubes(PoseStack.Pose p, VertexConsumer vc, RiftShape sh, State s, Vector3f cam, float age) {
        // Trailer aura: only around midnight (s.night). Rifts themselves are 24 h.
        if (!s.night) return;
        float[][] pal = ENERGY[Math.max(0, Math.min(ENERGY.length - 1, s.type.id))];
        float ramp = clamp((age - CLUSTER_START) / (GROWN - CLUSTER_START), 0f, 1f);
        int count = Math.round(7 * (0.3f + 0.7f * ramp));
        if (age >= GROWN) count = Math.round(11 * (0.5f + 0.5f * ramp));
        // The reference aura (Screenshot 2026-09-23 172138): large luminous panes, one texture pixel thin,
        // that rise above the top of the rift and disintegrate around half way up their climb.
        float top = sh.y(sh.rows);
        for (int k = 0; k < count; k++) {
            float life = 3.4f + 2.2f * RiftShape.hash(s.seed, k, 120), period = life + 1.1f * RiftShape.hash(s.seed, k, 121);
            float tt = s.time + RiftShape.hash(s.seed, k, 122) * period;
            int gen = (int) (tt / period);
            float f = (tt - gen * period) / life;
            if (f >= 1f || f < 0f) continue;
            long g = s.seed + gen * 7919L;
            // Surround the rift, then climb from just above its top lip to a full rift-height above it.
            float ang = RiftShape.hash(g, k, 1) * (float) (Math.PI * 2.0);
            float radX = (sh.w * 0.52f + 0.7f) * (0.80f + 0.4f * RiftShape.hash(g, k, 3));
            float radY = 0.35f * RiftShape.hash(g, k, 4);
            float x = (float) Math.cos(ang) * radX;
            float z = 0.15f + (RiftShape.hash(g, k, 5) - 0.5f) * 0.8f;
            float climb = clamp(f / 0.55f, 0f, 1f); // dissolves around half way up, never reaching the top of its arc
            float y = top + radY + climb * sh.h * 1.15f;
            // MUCH bigger than the old cubes, and one texture pixel (1/16 block) thin.
            float half = 0.42f + 0.42f * RiftShape.hash(g, k, 7);
            float thin = 1f / 16f; // exactly one block-texture pixel thick
            float a = 0.55f * Math.min(1f, f / 0.08f) * (0.55f + 0.45f * RiftShape.hash(g, k, 9));
            if (f >= 0.34f) { // disintegrate: shrink to a spark, fade to nothing by the half-way mark
                float d = clamp((f - 0.34f) / 0.28f, 0f, 1f);
                half *= 1f - d * 0.85f;
                a *= (1f - d) * (1f - d);
            }
            if (a < 0.012f) continue;
            thinSquare(p, vc, cam, x, y, z, half, thin, pal[(int) (RiftShape.hash(g, k, 8) * 3f) % 3], a);
        }
    }

    /**
     * A luminous pane one texture pixel thin, always facing the camera, with a bright rim. This is the
     * aura shape the references show above the rift (flat squares, not chunky cubes).
     */
    private static void thinSquare(PoseStack.Pose p, VertexConsumer vc, Vector3f cam, float x, float y, float z,
                                   float half, float thin, float[] tone, float alpha) {
        float nx = cam.x - x, ny = cam.y - y, nz = cam.z - z;
        float nl = (float) Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (nl < 1e-4f) return;
        nx /= nl; ny /= nl; nz /= nl;
        // Camera basis: right = worldUp x normal, up = normal x right.
        float rx = -nz, ry = 0f, rz = nx;
        float rl = (float) Math.sqrt(rx * rx + rz * rz);
        if (rl < 1e-4f) { rx = 1f; rz = 0f; } else { rx /= rl; rz /= rl; }
        float ux = ny * rz - nz * ry, uy = nz * rx - nx * rz, uz = nx * ry - ny * rx;
        float[] white = c(1f, 1f, 1f);
        float ox = nx * thin * 0.5f, oy = ny * thin * 0.5f, oz = nz * thin * 0.5f;
        for (int side = -1; side <= 1; side += 2) {
            float cx = x + ox * side, cy = y + oy * side, cz = z + oz * side;
            float[] v0 = {cx - rx * half - ux * half, cy - ry * half - uy * half, cz - rz * half - uz * half};
            float[] v1 = {cx + rx * half - ux * half, cy + ry * half - uy * half, cz + rz * half - uz * half};
            float[] v2 = {cx + rx * half + ux * half, cy + ry * half + uy * half, cz + rz * half + uz * half};
            float[] v3 = {cx - rx * half + ux * half, cy - ry * half + uy * half, cz - rz * half + uz * half};
            col(p, vc, Warp.STILL, v0[0], v0[1], v0[2], tone, alpha);
            col(p, vc, Warp.STILL, v1[0], v1[1], v1[2], tone, alpha);
            col(p, vc, Warp.STILL, v2[0], v2[1], v2[2], tone, alpha);
            col(p, vc, Warp.STILL, v3[0], v3[1], v3[2], tone, alpha);
        }
        // Bright rim so a one-pixel-thin pane still reads as a square at distance.
        float[][] loop = {
            {-rx * half - ux * half, -ry * half - uy * half, -rz * half - uz * half},
            { rx * half - ux * half,  ry * half - uy * half,  rz * half - uz * half},
            { rx * half + ux * half,  ry * half + uy * half,  rz * half + uz * half},
            {-rx * half + ux * half, -ry * half + uy * half, -rz * half + uz * half}
        };
        for (int i = 0; i < 4; i++) {
            float[] a0 = {x + loop[i][0], y + loop[i][1], z + loop[i][2]};
            float[] b0 = {x + loop[(i + 1) % 4][0], y + loop[(i + 1) % 4][1], z + loop[(i + 1) % 4][2]};
            line(p, vc, Warp.STILL, cam, a0, b0, Math.max(thin, half * 0.06f), white, alpha * 0.9f);
        }
    }

    /** Solid additive box with per-face shading (not a flat billboard). */
    private static void voxel(PoseStack.Pose p, VertexConsumer vc, float cx, float cy, float cz, float hx, float hy, float hz, float[] c, float a) {
        Warp w = Warp.STILL;
        float[] top = c, sideA = mix(c, c(0f, 0f, 0f), 0.15f), sideB = mix(c, c(0f, 0f, 0f), 0.3f);
        float x0 = cx - hx, x1 = cx + hx, y0 = cy - hy, y1 = cy + hy, z0 = cz - hz, z1 = cz + hz;
        rect(p, vc, w, x0, y0, x1, y1, z1, sideA, a);
        rect(p, vc, w, x0, y0, x1, y1, z0, sideA, a * 0.6f);
        col(p, vc, w, x0, y1, z0, top, faceA(z0, a)); col(p, vc, w, x1, y1, z0, top, faceA(z0, a)); col(p, vc, w, x1, y1, z1, top, faceA(z1, a)); col(p, vc, w, x0, y1, z1, top, faceA(z1, a));
        col(p, vc, w, x0, y0, z0, sideB, faceA(z0, a * 0.7f)); col(p, vc, w, x1, y0, z0, sideB, faceA(z0, a * 0.7f)); col(p, vc, w, x1, y0, z1, sideB, faceA(z1, a * 0.7f)); col(p, vc, w, x0, y0, z1, sideB, faceA(z1, a * 0.7f));
        col(p, vc, w, x0, y0, z0, sideB, faceA(z0, a)); col(p, vc, w, x0, y1, z0, sideB, faceA(z0, a)); col(p, vc, w, x0, y1, z1, sideB, faceA(z1, a)); col(p, vc, w, x0, y0, z1, sideB, faceA(z1, a));
        col(p, vc, w, x1, y0, z0, sideB, faceA(z0, a)); col(p, vc, w, x1, y1, z0, sideB, faceA(z0, a)); col(p, vc, w, x1, y1, z1, sideB, faceA(z1, a)); col(p, vc, w, x1, y0, z1, sideB, faceA(z1, a));
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

    // ------------------------------------------------------------------ placement shockwave + lightning

    private static final float PI2 = (float) (Math.PI * 2.0);

    /** Flat glowing band lying on the terrain; the placement shockwave is made of two of these. */
    private static void groundRing(PoseStack.Pose p, VertexConsumer vc, Warp wv, float radius, float thickness,
                                   float alpha, float[] tone, boolean fadeWithDistance) {
        int seg = radius > 26f ? 128 : radius > 12f ? 80 : 56;
        float inner = Math.max(0.05f, thickness * 0.5f);
        for (int i = 0; i < seg; i++) {
            float a0 = i / (float) seg * PI2, a1 = (i + 1) / (float) seg * PI2;
            float ca0 = (float) Math.cos(a0), sa0 = (float) Math.sin(a0);
            float ca1 = (float) Math.cos(a1), sa1 = (float) Math.sin(a1);
            float r0 = Math.max(0.1f, radius - inner), r1 = radius + inner;
            float y = RiftShape.BASE + 0.025f;
            float aa = alpha * (fadeWithDistance ? backFade(-radius * 0.15f) * 0.5f + 0.5f : 1f);
            col(p, vc, wv, ca0 * r0, y, sa0 * r0, tone, aa);
            col(p, vc, wv, ca1 * r0, y, sa1 * r0, tone, aa);
            col(p, vc, wv, ca1 * r1, y, sa1 * r1, tone, aa * 0.85f);
            col(p, vc, wv, ca0 * r1, y, sa0 * r1, tone, aa * 0.85f);
        }
    }

    /** Kinked crack running outward along the ground plane. */
    private static void groundCrack(PoseStack.Pose p, VertexConsumer vc, Warp wv, Vector3f cam, float angle, float length,
                                    long seed, float[] core, float alpha) {
        float y = RiftShape.BASE + 0.035f;
        float[] prev = {0f, y, 0f};
        float dx = (float) Math.cos(angle), dz = (float) Math.sin(angle);
        for (int q = 1; q <= 6; q++) {
            float t = q / 6f;
            float jitter = q == 6 ? 0f : (RiftShape.hash(seed, q, 71) - 0.5f) * length * 0.16f;
            float[] next = {dx * length * t - dz * jitter, y, dz * length * t + dx * jitter};
            line(p, vc, wv, cam, prev, next, 0.055f * (1f - t * 0.55f), core, alpha * (1f - t * 0.7f));
            prev = next;
        }
    }

    /**
     * Placement shockwave (reference placement frames): ONE gigantic white band appears on the land and
     * races out to the reference-measured radius (~62 blocks) before it dissolves, with ground cracks
     * trailing the front so the band reads as energy running through the terrain, not a decal.
     */
    private static void shockwave(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, Look look, State s, Vector3f cam, float age) {
        if (!SiftBudget.riftShock) return;
        float f = clamp(age / SHOCK_END, 0f, 1f);
        float ease = 1f - (float) Math.pow(1f - f, 3);
        float radius = 1.0f + ease * 61.0f;
        float alpha = (1f - f) * (1f - f) * 0.95f;
        float[] white = c(1f, 0.99f, 0.97f);
        groundRing(p, vc, wv, radius, 2.6f - 1.4f * ease, alpha, white, false);
        groundRing(p, vc, wv, radius * 0.94f, 0.80f, alpha * 0.45f, look.halo(), false);
        groundRing(p, vc, wv, radius * 1.06f, 0.60f, alpha * 0.30f, look.core(), false);
        if (f > 0.86f) return;
        shockCracks(p, vc, wv, s, cam, 11, radius * 0.90f, 0.70f, white, alpha * 0.80f);
    }

    /** Ground cracks radiating from the centre, trailing a shock front. */
    private static void shockCracks(PoseStack.Pose p, VertexConsumer vc, Warp wv, State s, Vector3f cam,
                                    int count, float reach, float spread, float[] tone, float alpha) {
        for (int k = 0; k < count; k++) {
            long g = s.seed + k * 31L + count * 7717L;
            float angle = RiftShape.hash(g, k, 51) * PI2;
            float len = reach * (0.45f + spread * RiftShape.hash(g, k, 52));
            groundCrack(p, vc, wv, cam, angle, len, g, tone, alpha);
        }
    }

    /**
     * Long kinked arcs flying off the rift (references: lightning crawls out of the structure in every
     * direction). Re-aimed a few times per second; brighter and more frequent at night.
     */
    private static void riftBolts(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, State s, Vector3f cam, Look look, float age) {
        if (!SiftBudget.riftBolts || (SiftBudget.riftShader && age > RIFT_BIRTH)) return;
        int step = (int) (s.time * (s.night ? 2.8f : 1.5f));
        int count = s.night ? 3 : 2;
        for (int k = 0; k < count; k++) {
            long g = s.seed + step * 977L + k;
            if (RiftShape.hash(g, k, 41) < 0.22f) continue;
            float sx = (RiftShape.hash(g, k, 42) - 0.5f) * sh.w;
            float sy = sh.cy() + (RiftShape.hash(g, k, 43) - 0.5f) * sh.h;
            float angle = RiftShape.hash(g, k, 44) * PI2;
            float dist = 8f + 30f * RiftShape.hash(g, k, 45);
            float ex = sx + (float) Math.cos(angle) * dist;
            float ey = Math.max(0.25f, sy + (RiftShape.hash(g, k, 46) - 0.35f) * dist * 0.85f);
            float ez = 0.1f + (RiftShape.hash(g, k, 47) - 0.5f) * (0.6f + dist * 0.35f);
            bolt(p, vc, wv, cam, new float[]{sx, sy, 0.05f}, new float[]{ex, ey, ez}, g, look, s.night ? 0.95f : 0.7f);
        }
    }

    /** Long arcs crawling off the seed slab while the rift is still assembling. */
    private static void seedBolts(PoseStack.Pose p, VertexConsumer vc, RiftShape sh, State s, Vector3f cam, Look look, float age) {
        if (!SiftBudget.riftBolts) return;
        int step = (int) (age / 4f);
        for (int b = 0; b < 4; b++) {
            long g = s.seed + step * 613L + b;
            if (RiftShape.hash(g, b, 61) < 0.25f) continue;
            float sx = (RiftShape.hash(g, b, 62) - 0.5f) * 0.9f;
            float sy = sh.cy() + (RiftShape.hash(g, b, 63) - 0.5f) * 1.9f;
            float angle = RiftShape.hash(g, b, 64) * PI2;
            float dist = 3.5f + 10.5f * RiftShape.hash(g, b, 65);
            float ex = sx + (float) Math.cos(angle) * dist;
            float ey = sy + (RiftShape.hash(g, b, 66) - 0.4f) * dist * 0.8f;
            float ez = 0.05f + (RiftShape.hash(g, b, 67) - 0.5f) * 1.6f;
            bolt(p, vc, Warp.STILL, cam, new float[]{sx, sy, 0.05f}, new float[]{ex, ey, ez}, g, look, 0.9f);
        }
    }

    // ------------------------------------------------------------------ 0.37 upward light column

    /**
     * How strong the upward light column is right now.
     *
     * The references show the shaft at NIGHT and in the MORNING, and not in the evening, so this is a
     * function of the local clock: full through the night (13000..23000), a softer morning shaft from
     * the dawn boundary (23000..24000 and 0..6500) that fades out by mid-morning, and nothing from
     * mid-morning through evening (6500..13000). Inside the Sift it follows the dimension's own dim tide.
     * Dial: `rift_beam` in config/entersift-client.properties turns the whole column off.
     */
    static float beamStrength(long clock, boolean inSift) {
        if (!SiftBudget.riftBeam) return 0f;
        if (inSift) return 0.80f;
        float c = clock % 24000L;
        float night = (c >= 13_000L && c < 23_000L) ? 1f : 0f;
        float dawn = (c >= 22_800L || c < 900L) ? 1f : 0f;
        float morning = (c >= 900L && c < 6_500L) ? 1f - (c - 900L) / 5_600f : 0f;
        float f = Math.max(night, Math.max(dawn, morning * 0.75f));
        return f * f * (3f - 2f * f);
    }

    /**
     * 0.37 the upward light column that replaces the old floating cubes. Three stacked camera-facing
     * bands (bright core, coloured halo) rise from the top lip and thin out with height, plus a few
     * rising motes. Additive, so it reads as light rather than geometry.
     */
    private static void lightBeam(PoseStack.Pose p, VertexConsumer vc, RiftShape sh, Look look, State s, Vector3f cam, float age) {
        float k = beamStrength(s.clock, s.inSift);
        if (k <= 0.01f) return;
        if (age < GROWN) k *= clamp((age - CLUSTER_START) / 26f, 0f, 1f); // builds up as the rift finishes growing
        if (k <= 0.01f) return;
        float top = sh.y(sh.rows);
        float pulse = 0.86f + 0.14f * (float) Math.sin(s.time * 1.7f);
        // 0.37: the reference shaft is warm light, not a grey pole — the core leans to the rift's own
        // colour and the halo to its glow tone, so the column reads as emitted light from every angle.
        float[] core = mix(mix(look.core(), c(1f, 1f, 1f), 0.42f), rgb(0xFFE9C4), 0.30f);
        float[] halo = mix(look.halo(), look.core(), 0.45f);
        float height = sh.h * 1.9f + 2.0f;
        float w = Math.max(0.42f, sh.w * 0.13f);
        if (sh.maxDepth < 0.60f) w *= 0.75f;                       // the permanent PORTAL gets a tighter shaft
        // A wide, faint skirt where the light leaves the lip: that is what makes the column look like it
        // is pouring out of the opening instead of being a stripe pasted above it.
        band(p, vc, Warp.STILL, cam, new float[]{0f, top + 0.04f, 0.02f}, new float[]{0f, top + height * 0.34f, 0.02f},
            w * 0.9f, w * 3.4f, core, halo, k * pulse * 0.11f);
        for (int seg = 0; seg < 3; seg++) {
            float y0 = top + 0.10f + height * (seg / 3f);
            float y1 = top + 0.10f + height * ((seg + 1) / 3f);
            float a = k * pulse * (0.40f - seg * 0.105f);
            if (a <= 0.01f) continue;
            float coreW = w * (0.52f - seg * 0.12f);
            float outerW = w * (1.15f + seg * 0.40f);
            band(p, vc, Warp.STILL, cam, new float[]{0f, y0, 0.02f}, new float[]{0f, y1, 0.02f},
                coreW, outerW, core, halo, a);
        }
        // Rising motes inside the column, so the shaft is alive instead of a static gradient.
        for (int i = 0; i < 6; i++) {
            float life = (RiftShape.hash(s.seed, i, 210) + s.time * (0.05f + 0.03f * RiftShape.hash(s.seed, i, 211))) % 1f;
            float x = (RiftShape.hash(s.seed, i, 212) - 0.5f) * w * 1.4f;
            float z = 0.05f + (RiftShape.hash(s.seed, i, 213) - 0.5f) * 0.25f;
            float y = top + 0.20f + life * height * 0.9f;
            float a = k * (float) Math.sin(life * Math.PI) * 0.40f;
            if (a < 0.02f) continue;
            float q = 0.018f + 0.012f * RiftShape.hash(s.seed, i, 214);
            line(p, vc, Warp.STILL, cam, new float[]{x, y - q, z}, new float[]{x, y + q * 2.2f, z}, q, c(1f, 1f, 1f), a);
        }
    }

    // ------------------------------------------------------------------ 0.37 varied summon lightning

    /**
     * One lightning bolt whose COLOUR MIXES along its length (white core + two tinted glow tones) and
     * whose topology is one of three reference shapes: 0 = upward spear, 1 = forked trunk with side
     * branches, 2 = short crown spike. The reference frames show several colours at once — ice, magenta,
     * violet, warm gold — so the tints are picked per bolt from {@link #BOLT_TINTS}.
     */
    private static void mixedBolt(PoseStack.Pose p, VertexConsumer vc, Warp wv, Vector3f cam,
                                  float[] a, float[] b, long seed, int shape, float alpha) {
        if (alpha <= 0.02f) return;
        float[] tintA = BOLT_TINTS[(int) (RiftShape.hash(seed, 3, 9) * BOLT_TINTS.length) % BOLT_TINTS.length];
        float[] tintB = BOLT_TINTS[(int) (RiftShape.hash(seed, 4, 11) * BOLT_TINTS.length) % BOLT_TINTS.length];
        float len = (float) Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]) + (b[2] - a[2]) * (b[2] - a[2]));
        if (len < 1e-4f) return;
        int segs = shape == 1 ? 12 : shape == 2 ? 6 : 9;
        float kink = shape == 2 ? 0.22f : 0.13f;
        float[] prev = a;
        for (int i = 1; i <= segs; i++) {
            float f = i / (float) segs;
            float jit = (i == segs ? 0f : kink * len * 0.5f);
            float[] q = {a[0] + (b[0] - a[0]) * f + (RiftShape.hash(seed, i, 61) - 0.5f) * jit * 2f,
                         a[1] + (b[1] - a[1]) * f + (RiftShape.hash(seed, i, 62) - 0.5f) * jit * 2f,
                         a[2] + (b[2] - a[2]) * f + (RiftShape.hash(seed, i, 63) - 0.5f) * jit};
            float[] tint = mix(tintA, tintB, f);                     // the mixed colour runs along the bolt
            float w = (0.030f + 0.020f * (1f - f)) * (shape == 2 ? 0.8f : 1f);
            line(p, vc, wv, cam, prev, q, w, c(1f, 1f, 1f), alpha * 0.78f);      // hot white core
            line(p, vc, wv, cam, prev, q, w * 6.0f, tint, alpha * 0.55f);        // coloured glow
            if (shape == 1 && i % 4 == 2 && i + 2 < segs) {                      // branch off the trunk
                float[] br = {q[0] + (RiftShape.hash(seed, i, 71) - 0.5f) * len * 0.6f,
                              q[1] + len * (0.12f + 0.18f * RiftShape.hash(seed, i, 72)),
                              q[2] + (RiftShape.hash(seed, i, 73) - 0.5f) * len * 0.3f};
                float[] brTint = BOLT_TINTS[(int) (RiftShape.hash(seed, i, 74) * BOLT_TINTS.length) % BOLT_TINTS.length];
                line(p, vc, wv, cam, q, br, w * 0.7f, c(1f, 1f, 1f), alpha * 0.70f);
                line(p, vc, wv, cam, q, br, w * 4.2f, brTint, alpha * 0.45f);
            }
            prev = q;
        }
    }

    /**
     * Summon-time lightning (0.37). During the opening the references show mixed-colour bolts that
     * climb UP off the structure and fork into the sky, so this emits: upward spears from the top of
     * the flowering silhouette, forked trunks from the arms, and a few crown spikes — all re-aimed a
     * few times a second, all in different tints. Mature rifts keep a rare evening-free arc.
     */
    private static void summonBolts(PoseStack.Pose p, VertexConsumer vc, Warp wv, RiftShape sh, State s, Vector3f cam, Look look, float age) {
        if (!SiftBudget.riftBolts) return;
        boolean summoning = age <= RIFT_BIRTH + 14f;
        float ramp = summoning ? 1f : clamp((age - GROWN) / 40f, 0f, 1f);
        if (!summoning && age < GROWN) return;
        int step = (int) (s.time * (summoning ? 4.5f : 1.6f));
        int count = summoning ? 3 : (s.night ? 2 : 1);
        float top = sh.y(sh.rows);
        for (int k = 0; k < count; k++) {
            long g = s.seed + step * 613L + k * 97L;
            if (RiftShape.hash(g, k, 141) < (summoning ? 0.18f : 0.45f)) continue;
            int shape = (int) (RiftShape.hash(g, k, 142) * 3f) % 3;
            float alpha = (0.85f + 0.15f * RiftShape.hash(g, k, 143)) * (summoning ? 1f : 0.55f * ramp);
            float sx, sy, sz;
            if (shape == 0) {                   // spear climbing off the top of the structure
                sx = (RiftShape.hash(g, k, 144) - 0.5f) * sh.w * 0.85f;
                sy = top - 0.1f + RiftShape.hash(g, k, 145) * 0.3f;
                sz = 0.05f;
            } else if (shape == 1) {            // forked trunk from the arms
                sx = (RiftShape.hash(g, k, 146) < 0.5f ? -1f : 1f) * sh.w * 0.48f;
                sy = sh.cy() + (RiftShape.hash(g, k, 147) - 0.5f) * sh.h * 0.4f;
                sz = 0.06f;
            } else {                            // crown spike near the cap
                sx = (RiftShape.hash(g, k, 148) - 0.5f) * sh.w * 0.4f;
                sy = sh.cy() + sh.h * (0.35f + 0.25f * RiftShape.hash(g, k, 149));
                sz = 0.04f;
            }
            float reach = (shape == 0 ? 3.2f : 2.2f) + 3.0f * RiftShape.hash(g, k, 150);
            float[] from = {sx, sy, sz};
            float[] to = {sx + (RiftShape.hash(g, k, 151) - 0.5f) * reach * 0.9f,
                          sy + reach * (shape == 2 ? 0.7f : 1.0f),
                          sz + (RiftShape.hash(g, k, 152) - 0.5f) * reach * 0.5f};
            mixedBolt(p, vc, wv, cam, from, to, g, shape, alpha);
            if (shape == 1) {                   // a second trunk, so the fork reads as a fork
                float[] to2 = {sx - (to[0] - from[0]) * 0.5f, sy + reach * 0.8f, sz + (RiftShape.hash(g, k, 153) - 0.5f) * 0.6f};
                mixedBolt(p, vc, wv, cam, from, to2, g + 7919L, 0, alpha * 0.75f);
            }
        }
    }

    // ------------------------------------------------------------------ primitives

    // ------------------------------------------------------------------ primitives

    private static void rect(PoseStack.Pose p, VertexConsumer vc, Warp wv, float x0, float y0, float x1, float y1, float z, float[] c, float a) {
        float fa = faceA(z, a);
        col(p, vc, wv, x0, y0, z, c, fa); col(p, vc, wv, x1, y0, z, c, fa); col(p, vc, wv, x1, y1, z, c, fa); col(p, vc, wv, x0, y1, z, c, fa);
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
        float fz = (a[2] + b[2]) * 0.5f;
        for (int i = 0; i < 5; i++) {
            float o0 = off[i], o1 = off[i + 1];
            col(p, vc, wv, ax + sx * o0, ay + sy * o0, az + sz * o0, cs[i], edgeA(fz, as[i] * alpha));
            col(p, vc, wv, bx + sx * o0, by + sy * o0, bz + sz * o0, cs[i], edgeA(fz, as[i] * alpha));
            col(p, vc, wv, bx + sx * o1, by + sy * o1, bz + sz * o1, cs[i + 1], edgeA(fz, as[i + 1] * alpha));
            col(p, vc, wv, ax + sx * o1, ay + sy * o1, az + sz * o1, cs[i + 1], edgeA(fz, as[i + 1] * alpha));
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
        float fz = (a[2] + b[2]) * 0.5f;
        col(p, vc, wv, ax - sx, ay - sy, az - sz, c, edgeA(fz, alpha)); col(p, vc, wv, bx - sx, by - sy, bz - sz, c, edgeA(fz, alpha));
        col(p, vc, wv, bx + sx, by + sy, bz + sz, c, edgeA(fz, alpha)); col(p, vc, wv, ax + sx, ay + sy, az + sz, c, edgeA(fz, alpha));
    }

    /**
     * Layer 8: Soft accumulated volumetric god-ray shafts streaming through the Rift aperture,
     * scaled by {@link dev.logan.entersift.SiftTimeState.Parameters#godRayIntensity()} (strongest in THRIVE).
     */
    private static void riftGodRayShafts(PoseStack.Pose p, VertexConsumer vc, RiftShape sh, Look look, State s, float age) {
        float rayIntensity = dev.logan.entersift.SiftTimeState.currentParameters().godRayIntensity();
        if (rayIntensity <= 0.05f) return;
        float openRamp = clamp((age - CLUSTER_START) / (GROWN - CLUSTER_START), 0f, 1f);
        float baseAlpha = 0.045f * rayIntensity * (0.4f + 0.6f * openRamp);
        float[] rayCol = mix(look.halo(), look.core(), 0.45f);
        int shafts = 5;
        for (int i = 0; i < shafts; i++) {
            float u = (i + 0.5f) / shafts - 0.5f;
            float sx = u * sh.w * 0.58f;
            float sy0 = sh.cy() + sh.h * 0.36f;
            float sy1 = RiftShape.BASE + 0.08f;
            float spread = 0.35f + 0.15f * (i % 2);
            float pulse = 0.72f + 0.28f * (float) Math.sin(s.time * 0.9f + i * 1.4f);
            float aTop = clamp(baseAlpha * pulse, 0f, 0.22f);
            col(p, vc, Warp.STILL, sx - 0.18f, sy0, 0.06f, rayCol, aTop);
            col(p, vc, Warp.STILL, sx + 0.18f, sy0, 0.06f, rayCol, aTop);
            col(p, vc, Warp.STILL, sx + spread, sy1, 0.24f, rayCol, 0f);
            col(p, vc, Warp.STILL, sx - spread, sy1, 0.24f, rayCol, 0f);
        }
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
