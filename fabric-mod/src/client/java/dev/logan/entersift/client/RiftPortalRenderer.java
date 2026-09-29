package dev.logan.entersift.client;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.logan.entersift.RiftPortalEntity;
import dev.logan.entersift.RiftType;
import dev.logan.entersift.SiftContent;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.client.renderer.state.level.CameraRenderState;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.resources.Identifier;
import net.minecraft.world.phys.AABB;
import org.joml.Quaternionf;
import org.joml.Vector3f;

/**
 * Renderer for {@link RiftPortalEntity}, matching the trailer footage frame by frame.
 *
 * The opening is a voxel "puzzle cluster": a main hollow body made of 0.5-block cells, plus
 * satellite hollow boxes that stick out of its rim at different depths. Each box is open at the
 * front. Its back face is a flat canvas showing the destination, its side walls are pale cream
 * tinted by the variant colour, and every rim is traced with a thick emissive edge and bloom.
 *
 * Growth timeline (synced entity age, 20 ticks = 1 s):
 *   0-20   PUDDLE RIPPLE: expanding translucent shockwave rings in the wall plane (PoseStack.scale).
 *   21-50  INCUBATION SEED: one small white-hot box at the centre, with erratic lightning bolts
 *          snapping to the surrounding block coordinates.
 *   51-80  VOXEL CLUSTER EXPANSION: a flipbook. Cells snap into view tier by tier, from the centre
 *          out, each popping from 0 to full size with a white-hot flash; satellites arrive last.
 *   80+    STABLE: the canvas scrolls slowly sideways, the lens-jitter shell shimmers around the rim
 *          ({@code sin(time * 0.4) * 0.05}), sparkles rise, hollow cubes drift and arcs flash.
 *
 * Variants (RiftType): SIFT wide jagged puzzle cross, pink/white #FFBFE0; NETHER chaotic squares,
 * dark red #FF3333; OVERWORLD stepped staircase, gold; END tall stack, violet; PORTAL cyan mosaic.
 * No shader pack, stencil or see-through tricks: the interior is deliberately a flat canvas.
 */
public final class RiftPortalRenderer extends EntityRenderer<RiftPortalEntity, RiftPortalRenderer.State> {
    private static final int LIGHT = 0x00F000F0;
    private static final float CELL = 0.5f, BASE = 0.25f, DEPTH = 0.55f;
    private static final int TIERS = 5;
    private static final Identifier[] INTERIOR = new Identifier[RiftType.values().length];
    private static final Map<Long, Shape> SHAPES = new LinkedHashMap<>(32, 0.75f, true) {
        @Override protected boolean removeEldestEntry(Map.Entry<Long, Shape> eldest) { return size() > 48; } // bounded: no leaks
    };

    static {
        for (RiftType t : RiftType.values()) INTERIOR[t.id] = SiftContent.id("textures/rift/interior_" + t.name + ".png");
    }

    public RiftPortalRenderer(EntityRendererProvider.Context context) { super(context); }

    public static final class State extends EntityRenderState {
        RiftType type = RiftType.SIFT;
        float w, h, age, yaw, time;
        long seed;
        double ex, ey, ez;
    }

    @Override public State createRenderState() { return new State(); }

    @Override
    public void extractRenderState(RiftPortalEntity e, State s, float partial) {
        super.extractRenderState(e, s, partial);
        s.type = e.riftType();
        s.w = e.riftWidth();
        s.h = e.riftHeight();
        s.age = e.age() >= RiftPortalEntity.GROWN + 20 ? 999f : e.age() + partial;
        s.time = (e.tickCount + partial) / 20f;
        s.yaw = e.getYRot();
        s.seed = e.blockPosition().asLong() * 31 + s.type.id;
        s.ex = e.getX(); s.ey = e.getY(); s.ez = e.getZ();
    }

    @Override
    protected AABB getBoundingBoxForCulling(RiftPortalEntity e, float partial) {
        float r = Math.max(e.riftWidth(), e.riftHeight()) + 2f;
        return e.getBoundingBox().inflate(r, r, r);
    }

    // ------------------------------------------------------------------ shape

    /** Body cells + satellites, in rift-local blocks (x across, y up, z = facing normal). */
    private record Shape(int cols, int rows, float cw, float ch, float w, float h, boolean[][] body, int[][] tier, List<float[]> sats) {
        boolean on(int i, int j) { return i >= 0 && j >= 0 && i < cols && j < rows && body[i][j]; }
        float x(int i) { return -w / 2 + i * cw; }
        float y(int j) { return BASE + j * ch; }
        float cy() { return BASE + h / 2; }
    }

    static float hash(long seed, int a, int b) {
        long h = seed * 0x9E3779B97F4A7C15L + a * 0xBF58476D1CE4E5B9L + b * 0x94D049BB133111EBL;
        h ^= h >>> 31; h *= 0x7FB5D329728EA185L; h ^= h >>> 27;
        return (h >>> 40) / (float) (1L << 24);
    }

    private static Shape shape(State s) {
        int cols = Math.max(4, Math.round(s.w / CELL)), rows = Math.max(4, Math.round(s.h / CELL));
        long key = s.seed * 1315423911L + cols * 131L + rows;
        return SHAPES.computeIfAbsent(key, k -> build(s.type, s.seed, cols, rows, s.w, s.h));
    }

    private static boolean inBody(RiftType type, long seed, float u, float v, float xb, float yb, int i, int j, int cols, int rows) {
        switch (type) {
            case SIFT: {
                float arm = 0.8f + 0.16f * hash(seed, j / 2, 7);
                boolean in = (Math.abs(u) < 0.42f && Math.abs(v) < 0.66f) || (Math.abs(u) < 0.17f && v > 0 && v < 0.98f)
                    || (Math.abs(v) < 0.3f && Math.abs(u) < arm);
                if (hash(seed, 1, 1) > 0.35f) in |= u < -0.48f && u > -0.8f && v < -0.28f && v > -0.72f;
                if (hash(seed, 2, 2) > 0.35f) in |= u > 0.5f && u < 0.82f && v > 0.28f && v < 0.58f;
                return in;
            }
            case NETHER: {
                if (Math.abs(xb) < 1.0f && Math.abs(yb) < 1.0f) return true;
                for (int k = 0; k < 6; k++) {
                    float cx = (hash(seed, k, 11) - 0.5f) * cols * CELL * 0.75f, cy = (hash(seed, k, 12) - 0.5f) * rows * CELL * 0.7f;
                    float hb = 0.35f + 0.6f * hash(seed, k, 13);
                    if (Math.abs(xb - cx) < hb && Math.abs(yb - cy) < hb) return true;
                }
                return false;
            }
            case OVERWORLD:
                return (Math.abs(u) < 0.45f && Math.abs(v) < 0.5f) || (u < -0.2f && u > -0.92f && v > -0.25f && v < 0.35f)
                    || (u > 0.15f && u < 0.86f && v > 0.05f && v < 0.75f) || (u > -0.35f && u < 0.1f && v > 0.4f && v < 0.96f)
                    || (u > 0.3f && u < 0.95f && v < -0.2f && v > -0.62f);
            case END: {
                int band = Math.min(3, (int) ((v + 1) / 2 * 4));
                float off = (hash(seed, band, 21) - 0.5f) * 0.5f, half = 0.34f + 0.26f * hash(seed, band, 22);
                return Math.abs(u - off) < half;
            }
            default: { // PORTAL (0.11, blue portal ref): a glowing rectangle with a crenellated rim and stepped corners
                int ci = Math.min(i, cols - 1 - i), cj = Math.min(j, rows - 1 - j);
                if (ci + cj < 2) return false;                                  // stepped corners
                if (cj == 0) return (i / 2) % 2 == 0;                            // merlons along the top and bottom
                if (ci == 0) return (j / 2) % 2 == 0;                            // and down both sides
                return true;
            }
        }
    }

    private static Shape build(RiftType type, long seed, int cols, int rows, float w, float h) {
        float cw = w / cols, ch = h / rows;
        boolean[][] body = new boolean[cols][rows];
        int[][] tier = new int[cols][rows];
        for (int i = 0; i < cols; i++) for (int j = 0; j < rows; j++) {
            float u = (i + 0.5f) / cols * 2 - 1, v = (j + 0.5f) / rows * 2 - 1;
            float xb = -w / 2 + (i + 0.5f) * cw, yb = -h / 2 + (j + 0.5f) * ch;
            body[i][j] = inBody(type, seed, u, v, xb, yb, i, j, cols, rows);
            // Tier: rings from the centre outward (the flipbook order), slightly shuffled.
            float d = Math.max(Math.abs(u), Math.abs(v)) * 0.85f + 0.15f * hash(seed, i, j + 97);
            tier[i][j] = Math.min(TIERS - 1, (int) (d * TIERS));
        }
        Shape proto = new Shape(cols, rows, cw, ch, w, h, body, tier, new ArrayList<>());
        int count = switch (type) { case SIFT -> 8; case NETHER -> 11; case OVERWORLD -> 6; case END -> 7; default -> 4; };
        for (int k = 0; k < count; k++) {
            // March out from the centre along a random direction to the body's rim; the satellite sits across it.
            double a = hash(seed, k, 31) * Math.PI * 2;
            float px = 0, py = 0;
            for (float r = 0; r < 1.5f; r += 0.02f) {
                float u = (float) Math.cos(a) * r, v = (float) Math.sin(a) * r;
                int i = (int) ((u + 1) / 2 * cols), j = (int) ((v + 1) / 2 * rows);
                if (!proto.on(i, j)) break;
                px = u * w / 2; py = v * h / 2;
            }
            float scatter = type == RiftType.NETHER ? 0.9f * hash(seed, k, 36) : 0.25f;
            px += (float) Math.cos(a) * scatter; py += (float) Math.sin(a) * scatter;
            float sw = 0.5f + 0.5f * hash(seed, k, 32), sh = 0.45f + 0.5f * hash(seed, k, 33);
            float zf = 0.12f + 0.7f * hash(seed, k, 34), zb = zf - (0.35f + 0.3f * hash(seed, k, 35));
            proto.sats().add(new float[]{px - sw / 2, BASE + h / 2 + py - sh / 2, px + sw / 2, BASE + h / 2 + py + sh / 2, zf, zb, k});
        }
        return proto;
    }

    // ------------------------------------------------------------------ timeline helpers

    private static final float RIPPLE_END = 20, SEED_START = 21, CLUSTER_START = 51, GROWN = 80;

    /** Tick at which tier k snaps in (tiers 0..4 = body rings, 5 = satellites). */
    private static float appearAt(int tier) { return CLUSTER_START + tier * (GROWN - CLUSTER_START - 4) / (float) TIERS; }

    /** Pop scale for something that appeared at tick {@code at}: 0 before, overshoot, then 1. */
    private static float pop(float age, float at) {
        float d = age - at;
        if (d < 0) return 0;
        if (d >= 4) return 1;
        float f = d / 4f, c = 1.70158f;
        return 1 + (c + 1) * (float) Math.pow(f - 1, 3) + c * (float) Math.pow(f - 1, 2); // easeOutBack
    }

    private static float heat(float age, float at) {
        float d = age - at;
        return d < 0 ? 0 : Math.max(0, 1 - d / 7f);
    }

    // ------------------------------------------------------------------ submit

    @Override
    public void submit(State s, PoseStack pose, SubmitNodeCollector collector, CameraRenderState camera) {
        Shape sh = shape(s);
        float[] edge = rgb(s.type.edge);
        Vector3f cam = new Vector3f((float) (camera.pos.x - s.ex), (float) (camera.pos.y - s.ey), (float) (camera.pos.z - s.ez))
            .rotateY((float) Math.toRadians(s.yaw));
        pose.pushPose();
        try {
        pose.rotate(new Quaternionf().rotationY((float) Math.toRadians(-s.yaw)));
        float age = s.age;
        if (age < RIPPLE_END + 8) {
            // PHASE 1: shockwave rings, grown with PoseStack.scale from 0 % to 100 %.
            float f = Math.min(1f, age / RIPPLE_END);
            float ease = 1 - (1 - f) * (1 - f);
            float radius = Math.max(sh.w(), sh.h()) * 0.62f;
            for (int rn = 0; rn < 2; rn++) {
                float rf = Math.max(0.001f, ease - rn * 0.25f);
                float alpha = (1 - f * 0.7f) * (rn == 0 ? 0.55f : 0.3f) * Math.min(1f, (RIPPLE_END + 8 - age) / 8f);
                pose.pushPose();
                try {
                    pose.translate(0, sh.cy(), 0);
                    pose.scale(radius * rf, radius * rf, 1f);
                    collector.submitCustomGeometry(pose, SiftRenderTypes.GLOW, (p, vc) -> ring(p, vc, 0.82f, 1f, edge, alpha));
                    collector.submitCustomGeometry(pose, SiftRenderTypes.GLOW, (p, vc) -> ring(p, vc, 0f, 0.82f, edge, alpha * 0.12f));
                } finally {
                    pose.popPose();
                }
            }
        }
        if (age >= SEED_START && age < appearAt(1) + 2) {
            // PHASE 2: the incubation seed and its erratic lightning.
            float grow = Math.min(1f, (age - SEED_START) / 4f), shrink = 1 - Math.max(0, Math.min(1, (age - appearAt(0)) / 8f));
            float k = grow * shrink * (1 + 0.12f * (float) Math.sin(age * 1.7f));
            collector.submitCustomGeometry(pose, SiftRenderTypes.SOLID, (p, vc) ->
                box(p, vc, -0.2f * k, sh.cy() - 0.12f * k, -0.12f * k, 0.2f * k, sh.cy() + 0.12f * k, 0.12f * k, new float[]{1f, 0.98f, 0.95f}, 1f));
            collector.submitCustomGeometry(pose, SiftRenderTypes.GLOW, (p, vc) -> seedBolts(p, vc, sh, s, cam, edge, age, k));
        }
        if (age >= CLUSTER_START) {
            // PHASE 3 + STABLE: the voxel cluster.
            collector.submitCustomGeometry(pose, RenderTypes.entityCutout(INTERIOR[s.type.id]), (p, vc) -> interior(p, vc, sh, s, age));
            collector.submitCustomGeometry(pose, SiftRenderTypes.SOLID, (p, vc) -> walls(p, vc, sh, s, edge, age));
            collector.submitCustomGeometry(pose, SiftRenderTypes.GLOW, (p, vc) -> flashes(p, vc, sh, age));
            collector.submitCustomGeometry(pose, SiftRenderTypes.GLOW, (p, vc) -> glow(p, vc, sh, s, cam, edge, age));
        }
        } finally {
            pose.popPose();
        }
    }

    // ------------------------------------------------------------------ interior canvas

    /** Flat destination canvas on the back faces, scrolling slowly sideways (U wraps without seams). */
    private static void interior(PoseStack.Pose p, VertexConsumer vc, Shape sh, State s, float age) {
        float scroll = s.time * 0.012f;
        for (int i = 0; i < sh.cols(); i++) for (int j = 0; j < sh.rows(); j++) {
            if (!sh.on(i, j)) continue;
            float k = pop(age, appearAt(sh.tier()[i][j]));
            if (k <= 0) continue;
            float[] r = scaled(sh.x(i), sh.y(j), sh.x(i) + sh.cw(), sh.y(j) + sh.ch(), k);
            canvas(p, vc, sh, r[0], r[1], r[2], r[3], -DEPTH, scroll);
        }
        for (float[] b : sh.sats()) {
            float k = pop(age, appearAt(TIERS) + b[6] % 3);
            if (k <= 0) continue;
            float[] r = scaled(b[0], b[1], b[2], b[3], k);
            canvas(p, vc, sh, r[0], r[1], r[2], r[3], b[5], scroll + 0.07f);
        }
    }

    private static void canvas(PoseStack.Pose p, VertexConsumer vc, Shape sh, float x0, float y0, float x1, float y1, float z, float scroll) {
        float span = Math.max(sh.w(), sh.h()) * 2f;
        float ua = x0 / span + 0.5f + scroll, ub = x1 / span + 0.5f + scroll;
        float v0 = clamp(0.5f - (y0 - sh.cy()) / (sh.h() * 1.3f), 0, 1), v1 = clamp(0.5f - (y1 - sh.cy()) / (sh.h() * 1.3f), 0, 1);
        float base = (float) Math.floor(ua);
        ua -= base; ub -= base;
        if (ub <= 1f) { texQuad(p, vc, x0, y0, x1, y1, z, ua, v0, ub, v1); return; }
        // Split exactly at the texture's wrap point, so any sampler address mode shows no seam.
        float xs = x0 + (x1 - x0) * (1f - ua) / (ub - ua);
        texQuad(p, vc, x0, y0, xs, y1, z, ua, v0, 1f, v1);
        texQuad(p, vc, xs, y0, x1, y1, z, 0f, v0, ub - 1f, v1);
    }

    private static void texQuad(PoseStack.Pose p, VertexConsumer vc, float x0, float y0, float x1, float y1, float z, float u0, float v0, float u1, float v1) {
        emit(p, vc, x0, y0, z, u0, v0, 0, 0, 1); emit(p, vc, x1, y0, z, u1, v0, 0, 0, 1);
        emit(p, vc, x1, y1, z, u1, v1, 0, 0, 1); emit(p, vc, x0, y1, z, u0, v1, 0, 0, 1);
        emit(p, vc, x0, y1, z, u0, v1, 0, 0, -1); emit(p, vc, x1, y1, z, u1, v1, 0, 0, -1);
        emit(p, vc, x1, y0, z, u1, v0, 0, 0, -1); emit(p, vc, x0, y0, z, u0, v0, 0, 0, -1);
    }

    private static void emit(PoseStack.Pose p, VertexConsumer vc, float x, float y, float z, float u, float v, float nx, float ny, float nz) {
        vc.addVertex(p, x, y, z).setColor(1f, 1f, 1f, 1f).setUv(u, v).setOverlay(OverlayTexture.NO_OVERLAY).setLight(LIGHT).setNormal(p, nx, ny, nz);
    }

    // ------------------------------------------------------------------ walls (pale cream, tinted)

    private static void walls(PoseStack.Pose p, VertexConsumer vc, Shape sh, State s, float[] edge, float age) {
        float[] front = mix(new float[]{1f, 0.97f, 0.9f}, edge, 0.28f), back = mix(new float[]{0.93f, 0.86f, 0.8f}, edge, 0.5f);
        for (int i = 0; i < sh.cols(); i++) for (int j = 0; j < sh.rows(); j++) {
            if (!sh.on(i, j)) continue;
            float at = appearAt(sh.tier()[i][j]), k = pop(age, at);
            if (k <= 0) continue;
            float[] r = scaled(sh.x(i), sh.y(j), sh.x(i) + sh.cw(), sh.y(j) + sh.ch(), k);
            if (!visible(sh, i - 1, j, age)) wall(p, vc, r[0], r[1], r[0], r[3], 0, -DEPTH, front, back, 0.92f);
            if (!visible(sh, i + 1, j, age)) wall(p, vc, r[2], r[1], r[2], r[3], 0, -DEPTH, front, back, 0.8f);
            if (!visible(sh, i, j - 1, age)) wall(p, vc, r[0], r[1], r[2], r[1], 0, -DEPTH, front, back, 1f);
            if (!visible(sh, i, j + 1, age)) wall(p, vc, r[0], r[3], r[2], r[3], 0, -DEPTH, front, back, 0.72f);
        }
        for (float[] b : sh.sats()) {
            float at = appearAt(TIERS) + b[6] % 3, k = pop(age, at);
            if (k <= 0) continue;
            float[] r = scaled(b[0], b[1], b[2], b[3], k);
            wall(p, vc, r[0], r[1], r[0], r[3], b[4], b[5], front, back, 0.92f);
            wall(p, vc, r[2], r[1], r[2], r[3], b[4], b[5], front, back, 0.8f);
            wall(p, vc, r[0], r[1], r[2], r[1], b[4], b[5], front, back, 1f);
            wall(p, vc, r[0], r[3], r[2], r[3], b[4], b[5], front, back, 0.72f);
        }
        // Floating hollow cubes (stable phase): tinted inner faces.
        if (age >= GROWN) for (int k = 0; k < 7; k++) {
            float[] c = cube(sh, s, k);
            float q = c[3];
            box(p, vc, c[0] - q, c[1] - q, c[2] - q, c[0] + q, c[1] + q, c[2] + q, mix(new float[]{1f, 0.95f, 0.9f}, edge, 0.45f), 1f);
        }
    }

    /** White-hot flash on each cell as it snaps in (additive). */
    private static void flashes(PoseStack.Pose p, VertexConsumer vc, Shape sh, float age) {
        if (age > GROWN + 8) return;
        for (int i = 0; i < sh.cols(); i++) for (int j = 0; j < sh.rows(); j++) {
            if (!sh.on(i, j)) continue;
            float at = appearAt(sh.tier()[i][j]), hot = heat(age, at), k = pop(age, at);
            if (hot <= 0 || k <= 0) continue;
            float[] r = scaled(sh.x(i), sh.y(j), sh.x(i) + sh.cw(), sh.y(j) + sh.ch(), k);
            rect(p, vc, r[0], r[1], r[2], r[3], -DEPTH + 0.02f, new float[]{1f, 1f, 1f}, hot * 0.9f);
        }
    }

    private static boolean visible(Shape sh, int i, int j, float age) {
        return sh.on(i, j) && pop(age, appearAt(sh.tier()[i][j])) >= 1f;
    }

    private static void wall(PoseStack.Pose p, VertexConsumer vc, float xa, float ya, float xb, float yb, float zf, float zb,
                             float[] front, float[] back, float shade) {
        float[] f = {front[0] * shade, front[1] * shade, front[2] * shade}, b = {back[0] * shade, back[1] * shade, back[2] * shade};
        col(p, vc, xa, ya, zf, f, 1f); col(p, vc, xb, yb, zf, f, 1f); col(p, vc, xb, yb, zb, b, 1f); col(p, vc, xa, ya, zb, b, 1f);
    }

    // ------------------------------------------------------------------ additive glow

    private static void glow(PoseStack.Pose p, VertexConsumer vc, Shape sh, State s, Vector3f cam, float[] edge, float age) {
        float[] core = {1f, 0.99f, 0.97f};
        float stable = Math.min(1f, Math.max(0f, (age - GROWN) / 10f));
        // Bloom halo behind the whole cluster.
        halo(p, vc, 0, sh.cy(), 0.02f, Math.max(sh.w(), sh.h()) * 0.85f * (0.4f + 0.6f * Math.min(1f, (age - CLUSTER_START) / 29f)), edge, 0.12f);
        for (int i = 0; i < sh.cols(); i++) for (int j = 0; j < sh.rows(); j++) {
            if (!sh.on(i, j)) continue;
            float at = appearAt(sh.tier()[i][j]), k = pop(age, at);
            if (k <= 0) continue;
            float[] r = scaled(sh.x(i), sh.y(j), sh.x(i) + sh.cw(), sh.y(j) + sh.ch(), k);
            float hot = heat(age, at);
            if (!visible(sh, i - 1, j, age)) rim(p, vc, cam, r[0], r[1], r[0], r[3], 0.01f, -DEPTH, core, edge, hot);
            if (!visible(sh, i + 1, j, age)) rim(p, vc, cam, r[2], r[1], r[2], r[3], 0.01f, -DEPTH, core, edge, hot);
            if (!visible(sh, i, j - 1, age)) rim(p, vc, cam, r[0], r[1], r[2], r[1], 0.01f, -DEPTH, core, edge, hot);
            if (!visible(sh, i, j + 1, age)) rim(p, vc, cam, r[0], r[3], r[2], r[3], 0.01f, -DEPTH, core, edge, hot);
            // LENS JITTER: an ultra-low-opacity perimeter shell pushed outward, oscillating with sin(time * 0.4) * 0.05.
            if (stable > 0) {
                float j0 = 0.16f + (float) Math.sin(s.ageInTicks * 0.4f) * 0.05f, j1 = 0.3f + (float) Math.sin(s.ageInTicks * 0.4f + 2.1f) * 0.05f;
                for (float jit : new float[]{j0, j1}) {
                    float a = 0.07f * stable;
                    if (!sh.on(i - 1, j)) ribbon(p, vc, cam, new float[]{r[0] - jit, r[1], -0.05f}, new float[]{r[0] - jit, r[3], -0.05f}, 0.34f, edge, a);
                    if (!sh.on(i + 1, j)) ribbon(p, vc, cam, new float[]{r[2] + jit, r[1], -0.05f}, new float[]{r[2] + jit, r[3], -0.05f}, 0.34f, edge, a);
                    if (!sh.on(i, j - 1)) ribbon(p, vc, cam, new float[]{r[0], r[1] - jit, -0.05f}, new float[]{r[2], r[1] - jit, -0.05f}, 0.34f, edge, a);
                    if (!sh.on(i, j + 1)) ribbon(p, vc, cam, new float[]{r[0], r[3] + jit, -0.05f}, new float[]{r[2], r[3] + jit, -0.05f}, 0.34f, edge, a);
                }
            }
        }
        for (float[] b : sh.sats()) {
            float at = appearAt(TIERS) + b[6] % 3, k = pop(age, at);
            if (k <= 0) continue;
            float[] r = scaled(b[0], b[1], b[2], b[3], k);
            float hot = heat(age, at);
            rim(p, vc, cam, r[0], r[1], r[0], r[3], b[4], b[5], core, edge, hot);
            rim(p, vc, cam, r[2], r[1], r[2], r[3], b[4], b[5], core, edge, hot);
            rim(p, vc, cam, r[0], r[1], r[2], r[1], b[4], b[5], core, edge, hot);
            rim(p, vc, cam, r[0], r[3], r[2], r[3], b[4], b[5], core, edge, hot);
            // The four depth edges make the satellite read as a 3D box.
            for (float[] c : new float[][]{{r[0], r[1]}, {r[2], r[1]}, {r[0], r[3]}, {r[2], r[3]}})
                ribbon(p, vc, cam, new float[]{c[0], c[1], b[4]}, new float[]{c[0], c[1], b[5]}, 0.06f, core, 0.8f);
        }
        if (age >= GROWN) {
            for (int k = 0; k < 7; k++) cubeOutline(p, vc, cam, cube(sh, s, k), core);
            sparkles(p, vc, cam, sh, s, edge);
            arcs(p, vc, cam, sh, s, edge);
        }
    }

    /** Front rim: thick white core + tinted halo + wide bloom; back rim thinner. White-hot while popping in. */
    private static void rim(PoseStack.Pose p, VertexConsumer vc, Vector3f cam, float xa, float ya, float xb, float yb, float zf, float zb,
                            float[] core, float[] edge, float hot) {
        float[] a = {xa, ya, zf}, b = {xb, yb, zf};
        ribbon(p, vc, cam, a, b, 0.13f + 0.1f * hot, core, 1f);
        ribbon(p, vc, cam, a, b, 0.32f, edge, 0.3f + 0.3f * hot);
        ribbon(p, vc, cam, a, b, 0.7f, edge, 0.07f);
        ribbon(p, vc, cam, new float[]{xa, ya, zb}, new float[]{xb, yb, zb}, 0.07f, core, 0.65f);
    }

    private static void seedBolts(PoseStack.Pose p, VertexConsumer vc, Shape sh, State s, Vector3f cam, float[] edge, float age, float k) {
        if (k <= 0.01f) return;
        float[] core = {1f, 1f, 1f};
        halo(p, vc, 0, sh.cy(), 0.03f, 1.2f * k, edge, 0.5f);
        long bucket = (long) (age / 2); // re-strike every 2 ticks: erratic
        int bolts = 5;
        for (int b = 0; b < bolts; b++) {
            if (hash(s.seed + bucket, b, 50) < 0.25f) continue;
            // Snap the far end to a surrounding block coordinate.
            float tx = Math.round((hash(s.seed + bucket, b, 51) - 0.5f) * (sh.w() + 3f)) + 0.5f;
            float ty = Math.round(sh.cy() + (hash(s.seed + bucket, b, 52) - 0.5f) * (sh.h() + 2f));
            float tz = (hash(s.seed + bucket, b, 53) - 0.5f) * 2f;
            bolt(p, vc, cam, new float[]{0, sh.cy(), 0}, new float[]{tx, ty, tz}, s.seed + bucket * 7 + b, core, edge, 1f);
        }
    }

    private static void arcs(PoseStack.Pose p, VertexConsumer vc, Vector3f cam, Shape sh, State s, float[] edge) {
        for (int k = 0; k < 2; k++) {
            float phase = (s.time * 0.35f + k * 0.5f + hash(s.seed, k, 40)) % 1f;
            if (phase > 0.07f) continue;
            long cycle = (long) (s.time * 0.35f + k * 0.5f + hash(s.seed, k, 40));
            double ang = hash(s.seed + cycle, k, 41) * Math.PI * 2;
            float[] a = {(float) Math.cos(ang) * sh.w() * 0.45f, sh.cy() + (float) Math.sin(ang) * sh.h() * 0.45f, 0};
            float len = 2.5f + 3f * hash(s.seed + cycle, k, 42);
            float[] b = {a[0] + (float) Math.cos(ang) * len, a[1] + (float) Math.sin(ang) * len * 0.5f + 0.8f, (hash(s.seed + cycle, k, 43) - 0.5f) * 1.5f};
            bolt(p, vc, cam, a, b, s.seed + (long) (s.time * 16) * 13 + k, new float[]{1f, 1f, 1f}, edge, 1f);
        }
    }

    private static void bolt(PoseStack.Pose p, VertexConsumer vc, Vector3f cam, float[] a, float[] b, long seed, float[] core, float[] edge, float alpha) {
        float[] prev = a;
        int steps = 10;
        float len = (float) Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]) + (b[2] - a[2]) * (b[2] - a[2]));
        for (int i = 1; i <= steps; i++) {
            float f = i / (float) steps, jit = i == steps ? 0 : len * 0.12f;
            float[] q = {a[0] + (b[0] - a[0]) * f + (hash(seed, i, 61) - 0.5f) * jit, a[1] + (b[1] - a[1]) * f + (hash(seed, i, 62) - 0.5f) * jit,
                a[2] + (b[2] - a[2]) * f + (hash(seed, i, 63) - 0.5f) * jit};
            ribbon(p, vc, cam, prev, q, 0.05f, core, alpha);
            ribbon(p, vc, cam, prev, q, 0.22f, edge, alpha * 0.3f);
            prev = q;
        }
    }

    private static void sparkles(PoseStack.Pose p, VertexConsumer vc, Vector3f cam, Shape sh, State s, float[] edge) {
        for (int k = 0; k < 26; k++) {
            float rise = (hash(s.seed, k, 70) + s.time * (0.05f + 0.05f * hash(s.seed, k, 71))) % 1f;
            float x = (hash(s.seed, k, 72) - 0.5f) * sh.w() * 1.2f, y = BASE - 0.2f + rise * (sh.h() + 1f);
            float z = -DEPTH * hash(s.seed, k, 73) + (hash(s.seed, k, 74) < 0.3f ? 0.5f : 0f);
            float a = (float) Math.sin(rise * Math.PI) * (0.6f + 0.4f * (float) Math.sin(s.time * 6 + k));
            if (a < 0.03f) continue;
            // Square pixel sparkles, like the white squares in the footage.
            ribbon(p, vc, cam, new float[]{x, y - 0.04f, z}, new float[]{x, y + 0.04f, z}, 0.08f, new float[]{1f, 1f, 1f}, a);
            ribbon(p, vc, cam, new float[]{x, y - 0.1f, z}, new float[]{x, y + 0.1f, z}, 0.2f, edge, a * 0.25f);
        }
    }

    // ------------------------------------------------------------------ floating hollow cubes

    private static float[] cube(Shape sh, State s, int k) {
        double a = hash(s.seed, k, 1) * Math.PI * 2;
        float reach = 0.7f + 0.4f * hash(s.seed, k, 2);
        float cx = (float) Math.cos(a) * sh.w() / 2 * reach * 1.2f + 0.15f * (float) Math.sin(s.time * 0.7f + k);
        float cy = sh.cy() + (float) Math.sin(a) * sh.h() / 2 * reach * 1.15f + 0.2f * (float) Math.sin(s.time * 0.9f + k * 1.7f);
        float cz = 0.2f + 0.6f * hash(s.seed, k, 3);
        float half = 0.1f + 0.14f * hash(s.seed, k, 4);
        return new float[]{cx, cy, cz, half};
    }

    private static void cubeOutline(PoseStack.Pose p, VertexConsumer vc, Vector3f cam, float[] c, float[] core) {
        float q = c[3];
        float[][] v = new float[8][];
        for (int n = 0; n < 8; n++) v[n] = new float[]{c[0] + ((n & 1) == 0 ? -q : q), c[1] + ((n & 2) == 0 ? -q : q), c[2] + ((n & 4) == 0 ? -q : q)};
        int[][] edges = {{0, 1}, {2, 3}, {4, 5}, {6, 7}, {0, 2}, {1, 3}, {4, 6}, {5, 7}, {0, 4}, {1, 5}, {2, 6}, {3, 7}};
        for (int[] e : edges) ribbon(p, vc, cam, v[e[0]], v[e[1]], 0.04f, core, 0.95f);
    }

    // ------------------------------------------------------------------ geometry helpers

    private static float[] scaled(float x0, float y0, float x1, float y1, float k) {
        float cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hx = (x1 - x0) / 2 * k, hy = (y1 - y0) / 2 * k;
        return new float[]{cx - hx, cy - hy, cx + hx, cy + hy};
    }

    private static float clamp(float v, float lo, float hi) { return Math.max(lo, Math.min(hi, v)); }

    private static float[] rgb(int c) { return new float[]{(c >> 16 & 255) / 255f, (c >> 8 & 255) / 255f, (c & 255) / 255f}; }

    private static float[] mix(float[] a, float[] b, float t) {
        return new float[]{a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t};
    }

    private static void col(PoseStack.Pose p, VertexConsumer vc, float x, float y, float z, float[] c, float a) {
        vc.addVertex(p, x, y, z).setColor(c[0], c[1], c[2], a);
    }

    /** Double-sided flat rectangle (position/colour types). */
    private static void rect(PoseStack.Pose p, VertexConsumer vc, float x0, float y0, float x1, float y1, float z, float[] c, float a) {
        col(p, vc, x0, y0, z, c, a); col(p, vc, x1, y0, z, c, a); col(p, vc, x1, y1, z, c, a); col(p, vc, x0, y1, z, c, a);
    }

    /** Closed box, six faces with simple directional shading. */
    private static void box(PoseStack.Pose p, VertexConsumer vc, float x0, float y0, float z0, float x1, float y1, float z1, float[] c, float a) {
        float[] s1 = {c[0] * 0.9f, c[1] * 0.9f, c[2] * 0.9f}, s2 = {c[0] * 0.78f, c[1] * 0.78f, c[2] * 0.78f};
        col(p, vc, x0, y1, z0, c, a); col(p, vc, x1, y1, z0, c, a); col(p, vc, x1, y1, z1, c, a); col(p, vc, x0, y1, z1, c, a);
        col(p, vc, x0, y0, z0, s2, a); col(p, vc, x1, y0, z0, s2, a); col(p, vc, x1, y0, z1, s2, a); col(p, vc, x0, y0, z1, s2, a);
        col(p, vc, x0, y0, z1, s1, a); col(p, vc, x1, y0, z1, s1, a); col(p, vc, x1, y1, z1, s1, a); col(p, vc, x0, y1, z1, s1, a);
        col(p, vc, x0, y0, z0, s1, a); col(p, vc, x1, y0, z0, s1, a); col(p, vc, x1, y1, z0, s1, a); col(p, vc, x0, y1, z0, s1, a);
        col(p, vc, x0, y0, z0, s2, a); col(p, vc, x0, y0, z1, s2, a); col(p, vc, x0, y1, z1, s2, a); col(p, vc, x0, y1, z0, s2, a);
        col(p, vc, x1, y0, z0, s2, a); col(p, vc, x1, y0, z1, s2, a); col(p, vc, x1, y1, z1, s2, a); col(p, vc, x1, y1, z0, s2, a);
    }

    /** Unit annulus in the z=0 plane (inner..outer radius), alpha fading toward the inner edge. */
    private static void ring(PoseStack.Pose p, VertexConsumer vc, float inner, float outer, float[] c, float a) {
        int n = 48;
        for (int k = 0; k < n; k++) {
            double t0 = k * Math.PI * 2 / n, t1 = (k + 1) * Math.PI * 2 / n;
            float c0 = (float) Math.cos(t0), s0 = (float) Math.sin(t0), c1 = (float) Math.cos(t1), s1 = (float) Math.sin(t1);
            col(p, vc, c0 * inner, s0 * inner, 0.01f, c, inner > 0 ? 0 : a);
            col(p, vc, c0 * outer, s0 * outer, 0.01f, c, a);
            col(p, vc, c1 * outer, s1 * outer, 0.01f, c, a);
            col(p, vc, c1 * inner, s1 * inner, 0.01f, c, inner > 0 ? 0 : a);
        }
    }

    /** Soft radial bloom disc (centre alpha -> 0 at the edge). */
    private static void halo(PoseStack.Pose p, VertexConsumer vc, float cx, float cy, float z, float r, float[] c, float a) {
        int n = 32;
        for (int k = 0; k < n; k++) {
            double t0 = k * Math.PI * 2 / n, t1 = (k + 1) * Math.PI * 2 / n;
            col(p, vc, cx, cy, z, c, a); col(p, vc, cx, cy, z, c, a);
            col(p, vc, cx + (float) Math.cos(t1) * r, cy + (float) Math.sin(t1) * r, z, c, 0f);
            col(p, vc, cx + (float) Math.cos(t0) * r, cy + (float) Math.sin(t0) * r, z, c, 0f);
        }
    }

    /** Camera-facing strip from a to b (rift-local). */
    private static void ribbon(PoseStack.Pose p, VertexConsumer vc, Vector3f cam, float[] a, float[] b, float width, float[] c, float alpha) {
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
        col(p, vc, ax - sx, ay - sy, az - sz, c, alpha); col(p, vc, bx - sx, by - sy, bz - sz, c, alpha);
        col(p, vc, bx + sx, by + sy, bz + sz, c, alpha); col(p, vc, ax + sx, ay + sy, az + sz, c, alpha);
    }
}
