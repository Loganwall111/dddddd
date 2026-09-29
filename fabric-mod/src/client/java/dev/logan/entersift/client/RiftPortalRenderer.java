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
import net.minecraft.client.renderer.rendertype.RenderType;
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
 * The opening is a voxel "puzzle cluster": a main hollow body made of ~1-block cells (0.18), plus
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
 *   80+    STABLE: the marble interior flows, the scene around the rift is bent by a real gravitational
 *          lens (0.18, {@link SiftLens}), sparkles rise, hollow cubes drift and arcs flash.
 *
 * Variants (RiftType): SIFT wide jagged puzzle cross, pink/white #FFBFE0; NETHER chaotic squares,
 * dark red #FF3333; OVERWORLD stepped staircase, gold; END tall stack, violet; PORTAL cyan mosaic.
 * 0.18: in GPU mode every part (walls, rims, glow, interior, lens) is drawn by the core/rift GLSL program.
 */
public final class RiftPortalRenderer extends EntityRenderer<RiftPortalEntity, RiftPortalRenderer.State> {
    private static final int LIGHT = 0x00F000F0;
    private static final float BASE = 0.25f, DEPTH = 1.0f; // 0.18: deep hollow boxes like the trailer (was 0.55)

    /** 0.18: cell size scales with the rift (about one block per box) instead of a fixed half-block grid. */
    static float cell(float w, float h) { return clamp(Math.max(w, h) / 9f, 0.7f, 1.2f); }
    private static final int TIERS = 5;
    private static final Identifier[] INTERIOR = new Identifier[RiftType.values().length];
    private static final Map<Long, Shape> SHAPES = new LinkedHashMap<>(32, 0.75f, true) {
        @Override protected boolean removeEldestEntry(Map.Entry<Long, Shape> eldest) { return size() > 48; } // bounded: no leaks
    };

    /** 0.12 views: the Sift sunset seen from outside the Sift, the Overworld panorama seen from inside it. */
    static final Identifier VEIL = SiftContent.id("textures/rift/veil.png");
    static final Identifier VIEW_SIFT = SiftContent.id("textures/rift/view_sift.png");
    static final Identifier VIEW_OVERWORLD = SiftContent.id("textures/rift/view_overworld.png");
    static final Identifier THE_SIFT = SiftContent.id("the_sift");
    /** Interior canvas inset from the frame and walls (kills Z-fighting / jagged top borders). */
    static final float INSET = 0.01f;

    static {
        for (RiftType t : RiftType.values()) INTERIOR[t.id] = SiftContent.id("textures/rift/interior_" + t.name + ".png");
    }

    /**
     * 0.12 dual-dimension projection. Chosen every frame from the client level, so the swap is instant
     * on a dimension change. From outside the Sift, SIFT rifts show the Sift sunset (the ritual PORTAL
     * keeps its cyan mosaic); from inside the Sift, SIFT, PORTAL and OVERWORLD rifts show the Overworld
     * panorama. OVERWORLD rifts always show the panorama; NETHER and END keep their own canvases.
     */
    static Identifier view(RiftType type, boolean inSift) {
        return switch (type) {
            case OVERWORLD -> VIEW_OVERWORLD;
            case SIFT -> inSift ? VIEW_OVERWORLD : VIEW_SIFT;
            case PORTAL -> INTERIOR[type.id]; // 0.15: the ritual portal is always the bright cyan mosaic (blue portal ref)
            default -> INTERIOR[type.id];
        };
    }

    /**
     * 0.18.1 destination viewport for the GPU interior (the rift type IS the destination):
     * 0 Overworld = radiant peach-to-pink canvas with soft horizon clouds, 1 Nether = burning crimson
     * and fiery smoke, 2 End = deep cosmic purple starlight, 3 Sift = pale mint-cyan sky with vertical
     * pillars, 4 portal = cyan mosaic, 5 = the Overworld seen from inside the Sift (golden, white-hot core).
     */
    static int viewCode(State s) {
        if (s.inSift && (s.type == RiftType.SIFT || s.type == RiftType.OVERWORLD)) return 5;
        return s.type.id;
    }

    /** Frame colour: rifts that show the Overworld from inside the Sift get the yellow frame of the footage. */
    static int frame(RiftType type, boolean inSift) {
        return inSift && type == RiftType.SIFT ? RiftType.OVERWORLD.edge : type.edge;
    }

    /** Warm bloom colour for the outer gradient band (the pink bloom around the white neon edge). */
    static float[] bloom(int frame) {
        if (frame == RiftType.SIFT.edge) return new float[]{1f, 0.5f, 0.76f};
        if (frame == RiftType.OVERWORLD.edge) return new float[]{1f, 0.6f, 0.5f}; // 0.15: warm peach, not yellow (trailer ref)
        float[] c = rgb(frame);
        return new float[]{c[0], c[1] * 0.85f, c[2] * 0.9f};
    }

    /** Interior zoom by camera distance: ~1.0 at 24+ blocks, ~1.8 at 2 blocks (smoothstep in between). */
    static float zoom(float dist) {
        float t = clamp((24f - dist) / 22f, 0f, 1f);
        return 1f + 0.8f * t * t * (3f - 2f * t);
    }

    public RiftPortalRenderer(EntityRendererProvider.Context context) { super(context); }

    public static final class State extends EntityRenderState {
        RiftType type = RiftType.SIFT;
        float w, h, age, yaw, time;
        long seed;
        double ex, ey, ez;
        boolean inSift, night;
        Identifier view = VIEW_SIFT;
        int frame = RiftType.SIFT.edge;
    }

    @Override public State createRenderState() { return new State(); }

    @Override
    public void extractRenderState(RiftPortalEntity e, State s, float partial) {
        super.extractRenderState(e, s, partial);
        s.type = e.riftType();
        // 0.13: clamp the synced size (a NaN/0 size before the first sync would produce NaN geometry).
        s.w = Float.isFinite(e.riftWidth()) ? Math.max(1.5f, Math.min(12f, e.riftWidth())) : 3f;
        s.h = Float.isFinite(e.riftHeight()) ? Math.max(1.5f, Math.min(12f, e.riftHeight())) : 4f;
        s.age = e.age() >= RiftPortalEntity.GROWN + 20 ? 999f : e.age() + partial;
        s.time = (e.tickCount + partial) / 20f;
        s.yaw = e.getYRot();
        s.seed = e.blockPosition().asLong() * 31 + s.type.id;
        s.ex = e.getX(); s.ey = e.getY(); s.ez = e.getZ();
        var level = net.minecraft.client.Minecraft.getInstance().level;
        s.inSift = level != null && level.dimension().identifier().equals(THE_SIFT);
        long day = level == null ? 0L : level.getOverworldClockTime() % 24000L;
        s.night = day >= 11500L && day <= 23300L; // 0.18.1: neon columns from evening through midnight only, never by day
        s.view = view(s.type, s.inSift);
        s.frame = frame(s.type, s.inSift);
    }

    @Override
    protected AABB getBoundingBoxForCulling(RiftPortalEntity e, float partial) {
        float r = Math.max(e.riftWidth(), e.riftHeight()) + 2f;
        return e.getBoundingBox().inflate(r, r, r);
    }

    // ------------------------------------------------------------------ shape

    /** Body cells + satellites, in rift-local blocks (x across, y up, z = facing normal). */
    /**
     * 0.19 (trailer refs): the body is a stack of hollow BOXES at different depths, not one flat cut-out.
     * {@code depth[i][j]} is how far cell (i, j) is recessed; cells of one box share a depth, and where two
     * boxes meet, the deeper one shows a step wall with a white lip rim, like the footage.
     */
    private record Shape(int cols, int rows, float cw, float ch, float w, float h, boolean[][] body, int[][] tier, List<float[]> sats,
                         float[][] depth, float maxDepth) {
        boolean on(int i, int j) { return i >= 0 && j >= 0 && i < cols && j < rows && body[i][j]; }
        float d(int i, int j) { return on(i, j) ? depth[i][j] : 0f; }
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
        float c = cell(s.w, s.h);
        int cols = Math.max(4, Math.round(s.w / c)), rows = Math.max(4, Math.round(s.h / c));
        long key = s.seed * 1315423911L + cols * 131L + rows;
        return SHAPES.computeIfAbsent(key, k -> build(s.type, s.seed, cols, rows, s.w, s.h));
    }

    private static boolean inBody(RiftType type, long seed, float u, float v, float xb, float yb, int i, int j, int cols, int rows, float xspan, float yspan) {
        switch (type) {
            case SIFT: {
                // 0.12 (trailer refs): a central cross. Tall centre column with a stepped cap on top,
                // a squat heart block, and wide horizontal arms whose tips are jagged per row pair.
                float arm = 0.82f + 0.15f * hash(seed, j / 2, 7);
                float lean = hash(seed, 3, 3) > 0.5f ? 1f : -1f;
                boolean in = (Math.abs(u) < 0.36f && Math.abs(v) < 0.58f)                 // heart
                    || (Math.abs(u) < 0.19f && v > -0.96f && v < 0.98f)                    // centre column
                    || (u * lean > -0.3f && u * lean < 0.1f && v > 0.5f && v < 0.8f)        // step on top
                    || (Math.abs(v) < 0.26f && Math.abs(u) < arm)                          // wide arms
                    || (Math.abs(u) > 0.5f && Math.abs(u) < arm - 0.12f && v > 0.2f && v < 0.4f); // arm shoulders
                if (hash(seed, 1, 1) > 0.35f) in |= u < -0.48f && u > -0.8f && v < -0.28f && v > -0.72f;
                if (hash(seed, 2, 2) > 0.35f) in |= u > 0.5f && u < 0.82f && v > 0.28f && v < 0.58f;
                return in;
            }
            case NETHER: {
                if (Math.abs(xb) < 1.6f && Math.abs(yb) < 1.6f) return true;
                for (int k = 0; k < 6; k++) {
                    float cx = (hash(seed, k, 11) - 0.5f) * xspan * 0.75f, cy = (hash(seed, k, 12) - 0.5f) * yspan * 0.7f;
                    float hb = 0.6f + 0.9f * hash(seed, k, 13);
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
                // 0.15 (blue portal ref): a clean glowing rectangle with single square tabs poking out of
                // the top edge and the sides; the bottom edge is straight (it rests on the frame).
                int ci = Math.min(i, cols - 1 - i), cj = Math.min(j, rows - 1 - j);
                if (ci >= 1 && j >= 1 && cj >= 1) return true;                  // the rectangle
                if (j == 0) return false;                                        // straight bottom
                if (j == rows - 1) return ci >= 2 && (i + (int) (seed & 1)) % 4 == 2; // tabs along the top
                if (ci == 0) return cj >= 2 && (j + (i == 0 ? 0 : 2)) % 4 == 1; // tabs down the sides
                return false;
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
            body[i][j] = inBody(type, seed, u, v, xb, yb, i, j, cols, rows, w, h);
            // Tier: rings from the centre outward (the flipbook order), slightly shuffled.
            float d = Math.max(Math.abs(u), Math.abs(v)) * 0.85f + 0.15f * hash(seed, i, j + 97);
            tier[i][j] = Math.min(TIERS - 1, (int) (d * TIERS));
        }
        float[][] depth = new float[cols][rows];
        float maxDepth = boxes(type, seed, cols, rows, body, tier, depth);
        Shape proto = new Shape(cols, rows, cw, ch, w, h, body, tier, new ArrayList<>(), depth, maxDepth);
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
            float scatter = type == RiftType.NETHER ? 1.4f * hash(seed, k, 36) : 0.45f;
            px += (float) Math.cos(a) * scatter; py += (float) Math.sin(a) * scatter;
            float zf = 0.2f + 1.0f * hash(seed, k, 34), zb = zf - (0.6f + 0.5f * hash(seed, k, 35));
            if (Math.abs(zb + DEPTH) < 0.04f) zb = -DEPTH + 0.05f; // never coplanar with the body canvas
            float cy = BASE + h / 2 + py;
            int piece = type == RiftType.PORTAL ? 0 : k % 3; // 0 box, 1 L tetromino, 2 Z tetromino
            if (piece == 0) {
                float sw = 0.9f + 0.8f * hash(seed, k, 32), sh = 0.8f + 0.8f * hash(seed, k, 33);
                proto.sats().add(new float[]{px - sw / 2, cy - sh / 2, px + sw / 2, cy + sh / 2, zf, zb, k, 0});
            } else {
                int[][] cells = piece == 1 ? new int[][]{{0, 0}, {0, 1}, {0, 2}, {1, 0}} : new int[][]{{0, 1}, {1, 1}, {1, 0}, {2, 0}};
                float q = 0.45f + 0.15f * hash(seed, k, 32);
                int flip = hash(seed, k, 33) > 0.5f ? -1 : 1;
                float ox = px - q * 1.5f * flip, oy = cy - q * 1.5f;
                for (int[] c : cells) {
                    int mask = 0;
                    for (int[] o : cells) {
                        if (o[1] == c[1] && o[0] == c[0] - flip) mask |= 1;  // neighbour on the left
                        if (o[1] == c[1] && o[0] == c[0] + flip) mask |= 2;  // on the right
                        if (o[0] == c[0] && o[1] == c[1] - 1) mask |= 4;     // below
                        if (o[0] == c[0] && o[1] == c[1] + 1) mask |= 8;     // above
                    }
                    float x0 = ox + c[0] * q * flip, x1 = x0 + q * flip;
                    proto.sats().add(new float[]{Math.min(x0, x1), oy + c[1] * q, Math.max(x0, x1), oy + (c[1] + 1) * q, zf, zb, k, mask});
                }
            }
        }
        return proto;
    }

    /**
     * 0.19: splits the body into rectangular boxes (greedy, centre first, 2-5 cells wide, 2-4 tall) and gives
     * each box its own recess depth. The centre box is the deepest; neighbouring boxes always differ by at
     * least 0.22 blocks so every seam shows a real step. All cells of a box pop in together (one tier).
     * The ritual PORTAL stays one clean rectangle at a single depth. Returns the deepest recess.
     */
    static float boxes(RiftType type, long seed, int cols, int rows, boolean[][] body, int[][] tier, float[][] depth) {
        int[][] box = new int[cols][rows];
        for (int[] c : box) java.util.Arrays.fill(c, -1);
        if (type == RiftType.PORTAL) {
            for (int i = 0; i < cols; i++) for (int j = 0; j < rows; j++) depth[i][j] = DEPTH;
            return DEPTH;
        }
        List<int[]> order = new ArrayList<>();
        for (int i = 0; i < cols; i++) for (int j = 0; j < rows; j++) if (body[i][j]) order.add(new int[]{i, j});
        float ci = (cols - 1) / 2f, cj = (rows - 1) / 2f;
        order.sort((a, b) -> Float.compare(Math.abs(a[0] - ci) + Math.abs(a[1] - cj) * 1.1f, Math.abs(b[0] - ci) + Math.abs(b[1] - cj) * 1.1f));
        List<Float> depths = new ArrayList<>();
        float max = 0f;
        for (int[] start : order) {
            if (box[start[0]][start[1]] >= 0) continue;
            int id = depths.size();
            int maxW = 2 + (int) (hash(seed, id, 41) * 4f), maxH = 2 + (int) (hash(seed, id, 42) * 3f);
            if (id == 0) { maxW += 1; maxH += 1; }                               // the big centre box
            int x0 = start[0], x1 = start[0], y0 = start[1], y1 = start[1];
            boolean grew = true;
            while (grew) {
                grew = false;
                if (x1 - x0 + 1 < maxW && free(body, box, x1 + 1, x1 + 1, y0, y1)) { x1++; grew = true; }
                if (x1 - x0 + 1 < maxW && free(body, box, x0 - 1, x0 - 1, y0, y1)) { x0--; grew = true; }
                if (y1 - y0 + 1 < maxH && free(body, box, x0, x1, y1 + 1, y1 + 1)) { y1++; grew = true; }
                if (y1 - y0 + 1 < maxH && free(body, box, x0, x1, y0 - 1, y0 - 1)) { y0--; grew = true; }
            }
            float d = id == 0 ? 1.45f : 0.55f + 0.7f * hash(seed, id, 43);
            // Keep a visible step against every box already touching this one.
            for (int attempt = 0; attempt < 4; attempt++) {
                boolean clash = false;
                for (int i = x0 - 1; i <= x1 + 1; i++) for (int j = y0 - 1; j <= y1 + 1; j++) {
                    if (i < 0 || j < 0 || i >= cols || j >= rows || box[i][j] < 0) continue;
                    if ((i >= x0 && i <= x1) == (j >= y0 && j <= y1)) continue;     // edge neighbours only
                    if (Math.abs(depths.get(box[i][j]) - d) < 0.22f) clash = true;
                }
                if (!clash) break;
                d = d + 0.29f > 1.3f ? d - 0.53f : d + 0.29f;
                d = Math.max(0.45f, d);
            }
            d = Math.round(d * 40f) / 40f + 0.0037f;                              // never coplanar with satellites
            depths.add(d);
            max = Math.max(max, d);
            int t = tier[start[0]][start[1]];
            for (int i = x0; i <= x1; i++) for (int j = y0; j <= y1; j++) { box[i][j] = id; depth[i][j] = d; tier[i][j] = t; }
        }
        return Math.max(max, 0.5f);
    }

    private static boolean free(boolean[][] body, int[][] box, int x0, int x1, int y0, int y1) {
        if (x0 < 0 || y0 < 0 || x1 >= body.length || y1 >= body[0].length) return false;
        for (int i = x0; i <= x1; i++) for (int j = y0; j <= y1; j++) if (!body[i][j] || box[i][j] >= 0) return false;
        return true;
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
        if (SiftRenderTypes.irisShadowPass()) return; // 0.18.2: rifts are self-lit and cast no shadow-map geometry
        Shape sh = shape(s);
        // 0.15: warm rifts glow peach with white rims like the trailer, never lemon yellow.
        float[] edge = s.frame == RiftType.OVERWORLD.edge ? new float[]{1f, 0.74f, 0.6f} : rgb(s.frame);
        Vector3f cam = new Vector3f((float) (camera.pos.x - s.ex), (float) (camera.pos.y - s.ey), (float) (camera.pos.z - s.ez))
            .rotateY((float) Math.toRadians(s.yaw));
        pose.pushPose();
        try {
        pose.rotate(new Quaternionf().rotationY((float) Math.toRadians(-s.yaw)));
        float age = s.age;
        // 0.18: in GPU mode EVERY part of the rift goes through the rift GLSL program (walls, rims, glow,
        // interior and lens). 0.18.2: this now also runs under an Iris shader pack (see SiftRenderTypes);
        // only rift_shader=false falls back to the plain pipelines.
        boolean gpu = SiftBudget.riftShader;
        RenderType wallT = gpu ? SiftRenderTypes.RIFT_WALL : SiftRenderTypes.SOLID;
        RenderType glowT = gpu ? SiftRenderTypes.RIFT_GLOW : SiftRenderTypes.GLOW;
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
                    collector.submitCustomGeometry(pose, glowT, (p, vc) -> ring(p, vc, 0.82f, 1f, edge, alpha));
                    collector.submitCustomGeometry(pose, glowT, (p, vc) -> ring(p, vc, 0f, 0.82f, edge, alpha * 0.12f));
                } finally {
                    pose.popPose();
                }
            }
        }
        if (age >= SEED_START && age < appearAt(1) + 2) {
            // PHASE 2: the incubation seed and its erratic lightning.
            float grow = Math.min(1f, (age - SEED_START) / 4f), shrink = 1 - Math.max(0, Math.min(1, (age - appearAt(0)) / 8f));
            float k = grow * shrink * (1 + 0.12f * (float) Math.sin(age * 1.7f));
            collector.submitCustomGeometry(pose, wallT, (p, vc) ->
                box(p, vc, -0.2f * k, sh.cy() - 0.12f * k, -0.12f * k, 0.2f * k, sh.cy() + 0.12f * k, 0.12f * k, new float[]{1f, 0.98f, 0.95f}, 1f));
            collector.submitCustomGeometry(pose, glowT, (p, vc) -> seedBolts(p, vc, sh, s, cam, edge, age, k));
        }
        if (age >= CLUSTER_START) {
            // PHASE 3 + STABLE: the voxel cluster.
            // Look-through illusion on a flat quad: zoom with distance plus a subtle lateral parallax.
            float dist = cam.length(), z = zoom(dist);
            float facing = Math.max(1.5f, Math.abs(cam.z));
            float pu = -clamp(cam.x / facing, -2f, 2f) * 0.045f, pv = clamp((cam.y - sh.cy()) / facing, -2f, 2f) * 0.03f;
            // 0.17: the interior is drawn by our own GLSL core shader (wavy marble, per-pixel parallax,
            // fake lens), unless it is switched off or an Iris shader pack replaces pipelines.
            if (gpu) {
                float fade = Math.min(1f, (age - CLUSTER_START) / 20f);
                float[] code = {0f, 0f, 0f, (viewCode(s) + 0.5f) / 8f}; // length 4 = GPU mode for canvas()
                collector.submitCustomGeometry(pose, SiftRenderTypes.RIFT, (p, vc) -> interior(p, vc, sh, s, age, 1f, 0f, 0f, 0f, 0f, code, fade));
                // 0.18 REAL gravitational lens: the scene behind and around the rift is bent by a point mass.
                SiftLens.want();
                if (SiftLens.ready()) collector.submitCustomGeometry(pose, SiftRenderTypes.RIFT_LENS, (p, vc) -> lens(p, vc, sh, code[3], fade));
            } else {
            collector.submitCustomGeometry(pose, RenderTypes.entityCutout(s.view), (p, vc) -> interior(p, vc, sh, s, age, z, pu, pv));
            // 0.16 sinkhole: two translucent voxel veils float between the canvas and the rim. Each one
            // zooms from large to small (recedes) on a loop, half a cycle apart, fading in and out, and
            // shifts more with parallax the nearer it is, so the face reads as a tunnel, not a sheet.
            float[] veilTint = mix(edge, WHITE, 0.55f);
            for (int layer = 0; layer < 2; layer++) {
                float cycle = (float) ((s.time * 0.125 + layer * 0.5) % 1.0);
                float lz = z * (2.1f - 1.5f * cycle);
                float la = (float) Math.sin(Math.PI * cycle) * (layer == 0 ? 0.55f : 0.42f) * Math.min(1f, (age - CLUSTER_START) / 20f);
                float dz = DEPTH * (layer == 0 ? 0.3f : 0.62f), par = layer == 0 ? 1.6f : 2.4f;
                float scroll = -s.time * (layer == 0 ? 0.02f : 0.035f);
                if (la > 0.01f) collector.submitCustomGeometry(pose, RenderTypes.entityTranslucentEmissive(VEIL), (p, vc) ->
                    interior(p, vc, sh, s, age, lz, pu * par, pv * par, dz, scroll, veilTint, la));
            }
            }
            if (s.night && age >= GROWN && SiftBudget.auraGlow)
                collector.submitCustomGeometry(pose, glowT, (p, vc) -> nightAura(p, vc, sh, s, cam));
            collector.submitCustomGeometry(pose, wallT, (p, vc) -> walls(p, vc, sh, s, edge, age));
            collector.submitCustomGeometry(pose, glowT, (p, vc) -> flashes(p, vc, sh, age));
            if (SiftBudget.riftEffects) collector.submitCustomGeometry(pose, glowT, (p, vc) -> glow(p, vc, sh, s, cam, edge, age));
            if (age >= GROWN && SiftBudget.riftEffects) collector.submitCustomGeometry(pose, glowT, (p, vc) -> spill(p, vc, sh, s, edge, age));
        }
        } finally {
            pose.popPose();
        }
    }

    // ------------------------------------------------------------------ interior canvas

    /**
     * Flat destination canvas on the back faces, scrolling slowly sideways (U wraps without seams).
     * 0.12: fully grown cells are merged into horizontal runs (no seams between cells), and every canvas
     * edge that meets a wall is inset by {@link #INSET}, so frame, walls and canvas never share an edge.
     */
    private static void interior(PoseStack.Pose p, VertexConsumer vc, Shape sh, State s, float age, float zoom, float pu, float pv) {
        interior(p, vc, sh, s, age, zoom, pu, pv, 0f, s.time * 0.012f, WHITE, 1f);
    }

    private static final float[] WHITE = {1f, 1f, 1f};

    /** 0.16: the canvas cells at depth offset {@code dz}, with a tint and alpha (veil layers reuse the cell layout). */
    private static void interior(PoseStack.Pose p, VertexConsumer vc, Shape sh, State s, float age, float zoom, float pu, float pv,
                                 float dz, float scroll, float[] tint, float alpha) {
        for (int j = 0; j < sh.rows(); j++) {
            int i = 0;
            while (i < sh.cols()) {
                if (!sh.on(i, j)) { i++; continue; }
                float k = pop(age, appearAt(sh.tier()[i][j]));
                if (k <= 0) { i++; continue; }
                float d = sh.d(i, j);
                if (k < 1f) { // still popping in: its own inset quad
                    float[] r = scaled(sh.x(i), sh.y(j), sh.x(i) + sh.cw(), sh.y(j) + sh.ch(), k);
                    canvas(p, vc, sh, r[0] + INSET, r[1] + INSET, r[2] - INSET, r[3] - INSET, -d + dz, scroll, zoom, pu, pv, tint, alpha);
                    i++;
                    continue;
                }
                // 0.19: runs merge only across cells of the same depth; any other edge is inset from its wall.
                boolean below = same(sh, i, j - 1, d, age), above = same(sh, i, j + 1, d, age);
                int from = i;
                while (i < sh.cols() && same(sh, i, j, d, age) && same(sh, i, j - 1, d, age) == below && same(sh, i, j + 1, d, age) == above) i++;
                float x0 = sh.x(from) + (same(sh, from - 1, j, d, age) ? 0 : INSET);
                float x1 = sh.x(i) - (same(sh, i, j, d, age) ? 0 : INSET);
                float y0 = sh.y(j) + (below ? 0 : INSET), y1 = sh.y(j) + sh.ch() - (above ? 0 : INSET);
                canvas(p, vc, sh, x0, y0, x1, y1, -d + dz, scroll, zoom, pu, pv, tint, alpha);
            }
        }
        for (float[] b : sh.sats()) {
            float k = pop(age, appearAt(TIERS) + b[6] % 3);
            if (k <= 0) continue;
            float[] r = scaled(b[0], b[1], b[2], b[3], k);
            int m = (int) b[7];
            canvas(p, vc, sh, r[0] + ((m & 1) != 0 ? 0 : INSET), r[1] + ((m & 4) != 0 ? 0 : INSET),
                r[2] - ((m & 2) != 0 ? 0 : INSET), r[3] - ((m & 8) != 0 ? 0 : INSET), b[5] + dz, scroll + 0.07f, zoom, pu, pv, tint, alpha);
        }
    }

    /** One canvas rectangle. UVs are divided by the distance zoom and shifted by the parallax offset. */
    private static void canvas(PoseStack.Pose p, VertexConsumer vc, Shape sh, float x0, float y0, float x1, float y1, float z, float scroll,
                               float zoom, float pu, float pv, float[] tint, float alpha) {
        if (x1 <= x0 || y1 <= y0) return;
        if (tint.length == 4) { gpuQuad(p, vc, sh, x0, y0, x1, y1, z, tint[3], alpha); return; }
        float span = Math.max(sh.w(), sh.h()) * 2f;
        float ua = x0 / span / zoom + 0.5f + scroll + pu, ub = x1 / span / zoom + 0.5f + scroll + pu;
        float v0 = clamp(0.5f - (y0 - sh.cy()) / (sh.h() * 1.3f) / zoom + pv, 0, 1), v1 = clamp(0.5f - (y1 - sh.cy()) / (sh.h() * 1.3f) / zoom + pv, 0, 1);
        float base = (float) Math.floor(ua);
        ua -= base; ub -= base;
        if (ub <= 1f) { texQuad(p, vc, x0, y0, x1, y1, z, ua, v0, ub, v1, tint, alpha); return; }
        // Split exactly at the texture's wrap point, so any sampler address mode shows no seam.
        float xs = x0 + (x1 - x0) * (1f - ua) / (ub - ua);
        texQuad(p, vc, x0, y0, xs, y1, z, ua, v0, 1f, v1, tint, alpha);
        texQuad(p, vc, xs, y0, x1, y1, z, 0f, v0, ub - 1f, v1, tint, alpha);
    }

    /** 0.17 GPU canvas: colour = (face u, face v, type code, fade); aspect-true u/v across the whole rift. */
    private static void gpuQuad(PoseStack.Pose p, VertexConsumer vc, Shape sh, float x0, float y0, float x1, float y1, float z, float code, float fade) {
        float span = Math.max(sh.w(), sh.h()) * 1.15f;
        float u0 = clamp(0.5f + x0 / span, 0f, 1f), u1 = clamp(0.5f + x1 / span, 0f, 1f);
        float v0 = clamp(0.5f + (y0 - sh.cy()) / span, 0f, 1f), v1 = clamp(0.5f + (y1 - sh.cy()) / span, 0f, 1f);
        gv(p, vc, x0, y0, z, u0, v0, code, fade); gv(p, vc, x1, y0, z, u1, v0, code, fade);
        gv(p, vc, x1, y1, z, u1, v1, code, fade); gv(p, vc, x0, y1, z, u0, v1, code, fade);
    }

    private static void gv(PoseStack.Pose p, VertexConsumer vc, float x, float y, float z, float u, float v, float code, float fade) {
        if (!SiftBudget.take(vc)) return;
        { float ox = x; x = jx(x, y, z); y = jy(ox, y, z); }
        if (!Float.isFinite(x + y + z + u + v)) { x = 0f; y = 0f; z = 0f; u = 0f; v = 0f; }
        vc.addVertex(p, x, y, z).setColor(u, v, code, clamp(fade, 0f, 1f));
    }

    /**
     * 0.18 lens quad: one square behind the rift, about 1.9x its largest side. Face coordinates (u, v) run
     * 0..1 across it with the rift centre at (0.5, 0.5); the RIFT_LENS shader turns them into screen
     * positions and applies the lens equation to the scene copy.
     */
    private static void lens(PoseStack.Pose p, VertexConsumer vc, Shape sh, float code, float fade) {
        float half = Math.max(sh.w(), sh.h()) * 0.95f, z = -sh.maxDepth() - 0.05f, cy = sh.cy();
        gv(p, vc, -half, cy - half, z, 0f, 0f, code, fade);
        gv(p, vc, half, cy - half, z, 1f, 0f, code, fade);
        gv(p, vc, half, cy + half, z, 1f, 1f, code, fade);
        gv(p, vc, -half, cy + half, z, 0f, 1f, code, fade);
    }

    /** 0.17 night aura: soft coloured columns rising behind the rift (teal, purple, magenta, pink). */
    private static final float[][] AURA = {rgb(0x2F6BFF), rgb(0x3FF6FF), rgb(0xFF3FD8), rgb(0x5F8CFF), rgb(0x2FE0FF), rgb(0xE040FF)}; // electric blue, cyan, magenta

    private static void nightAura(PoseStack.Pose p, VertexConsumer vc, Shape sh, State s, Vector3f cam) {
        // 0.18.1: massive neon columns on the rift's flanks (three each side), fading in over the evening.
        int n = 6;
        for (int k = 0; k < n; k++) {
            float hx = hash(s.seed, k, 71), hz = hash(s.seed, k, 72), hh = hash(s.seed, k, 73);
            float side = k % 2 == 0 ? -1f : 1f, rank = k / 2;
            float x = side * (sh.w() * 0.5f - 0.6f + rank * 1.5f + hx * 0.8f);
            float z = -DEPTH - 0.8f - 1.8f * hz;
            float height = sh.h() * 3f + 12f + 10f * hh;
            float[] c = AURA[(k + (int) (s.seed & 3)) % AURA.length];
            float[] top = mix(c, AURA[(k + 3) % AURA.length], 0.5f);
            AuraColumns.column(p, vc, x, -0.6f, z, height, 0.8f + 0.6f * hh, c, top, 0.5f, cam.x, cam.z, s.time, hx * 7f + k);
        }
    }

    private static void texQuad(PoseStack.Pose p, VertexConsumer vc, float x0, float y0, float x1, float y1, float z, float u0, float v0, float u1, float v1,
                                float[] c, float a) {
        emit(p, vc, x0, y0, z, u0, v0, 0, 0, 1, c, a); emit(p, vc, x1, y0, z, u1, v0, 0, 0, 1, c, a);
        emit(p, vc, x1, y1, z, u1, v1, 0, 0, 1, c, a); emit(p, vc, x0, y1, z, u0, v1, 0, 0, 1, c, a);
        emit(p, vc, x0, y1, z, u0, v1, 0, 0, -1, c, a); emit(p, vc, x1, y1, z, u1, v1, 0, 0, -1, c, a);
        emit(p, vc, x1, y0, z, u1, v0, 0, 0, -1, c, a); emit(p, vc, x0, y0, z, u0, v0, 0, 0, -1, c, a);
    }

    private static void emit(PoseStack.Pose p, VertexConsumer vc, float x, float y, float z, float u, float v, float nx, float ny, float nz, float[] c, float a) {
        if (!SiftBudget.take(vc)) return; // 0.16: never exceed 16-bit quad indices in one batch
        { float ox = x; x = jx(x, y, z); y = jy(ox, y, z); }
        if (!Float.isFinite(x + y + z + u + v)) { x = 0f; y = 0f; z = 0f; u = 0f; v = 0f; } // 0.13: never emit NaN streaks
        vc.addVertex(p, x, y, z).setColor(Math.min(1f, c[0]), Math.min(1f, c[1]), Math.min(1f, c[2]), a).setUv(u, v).setOverlay(OverlayTexture.NO_OVERLAY).setLight(LIGHT).setNormal(p, nx, ny, nz);
    }

    // ------------------------------------------------------------------ walls (pale cream, tinted)

    private static void walls(PoseStack.Pose p, VertexConsumer vc, Shape sh, State s, float[] edge, float age) {
        // 0.19 (trailer): the inner walls are near-white at the lip and take the rift colour deeper in.
        float[] front = mix(new float[]{1f, 0.98f, 0.95f}, edge, 0.12f), back = mix(new float[]{0.96f, 0.88f, 0.84f}, edge, 0.55f);
        for (int i = 0; i < sh.cols(); i++) for (int j = 0; j < sh.rows(); j++) {
            if (!sh.on(i, j)) continue;
            float at = appearAt(sh.tier()[i][j]), k = pop(age, at);
            if (k <= 0) continue;
            float[] r = scaled(sh.x(i), sh.y(j), sh.x(i) + sh.cw(), sh.y(j) + sh.ch(), k);
            float d = sh.d(i, j), zb = -d - 2 * INSET; // walls reach just behind the inset canvas: no light leaks
            // 0.19: an open edge gets a full wall from the front plane; an edge against a SHALLOWER box gets
            // the step wall between the two back planes (the deeper box owns it).
            float zl = wallTop(sh, i - 1, j, d, age), zr = wallTop(sh, i + 1, j, d, age);
            float zd = wallTop(sh, i, j - 1, d, age), zu = wallTop(sh, i, j + 1, d, age);
            if (zl <= 0) wall(p, vc, r[0], r[1], r[0], r[3], zl, zb, front, back, 0.92f);
            if (zr <= 0) wall(p, vc, r[2], r[1], r[2], r[3], zr, zb, front, back, 0.8f);
            if (zd <= 0) wall(p, vc, r[0], r[1], r[2], r[1], zd, zb, front, back, 1f);
            if (zu <= 0) wall(p, vc, r[0], r[3], r[2], r[3], zu, zb, front, back, 0.72f);
        }
        for (float[] b : sh.sats()) {
            float at = appearAt(TIERS) + b[6] % 3, k = pop(age, at);
            if (k <= 0) continue;
            float[] r = scaled(b[0], b[1], b[2], b[3], k);
            int m = (int) b[7];
            float zb = b[5] - 2 * INSET;
            if ((m & 1) == 0) wall(p, vc, r[0], r[1], r[0], r[3], b[4], zb, front, back, 0.92f);
            if ((m & 2) == 0) wall(p, vc, r[2], r[1], r[2], r[3], b[4], zb, front, back, 0.8f);
            if ((m & 4) == 0) wall(p, vc, r[0], r[1], r[2], r[1], b[4], zb, front, back, 1f);
            if ((m & 8) == 0) wall(p, vc, r[0], r[3], r[2], r[3], b[4], zb, front, back, 0.72f);
        }
        // Floating small hollow cubes (stable phase): open at the front, pale cream inner walls.
        if (age >= GROWN) for (int k = 0; k < 7; k++) {
            float[] c = cube(sh, s, k);
            float q = c[3];
            hollowCube(p, vc, c[0] - q, c[1] - q, c[2] - q, c[0] + q, c[1] + q, c[2] + q, mix(new float[]{1f, 0.95f, 0.88f}, edge, 0.3f));
        }
    }

    /**
     * 0.19: front z of the wall on the edge toward neighbour (ni, nj) of a cell recessed by {@code d}:
     * 0 (the front plane) when the neighbour is open, -dn when the neighbour is a shallower box, and
     * +1 (no wall) when the neighbour is at the same depth or deeper.
     */
    private static float wallTop(Shape sh, int ni, int nj, float d, float age) {
        if (!visible(sh, ni, nj, age)) return 0f;
        float dn = sh.d(ni, nj);
        return dn < d - 1e-4f ? -dn : 1f;
    }

    /** White-hot flash on each cell as it snaps in (additive). */
    private static void flashes(PoseStack.Pose p, VertexConsumer vc, Shape sh, float age) {
        if (age > GROWN + 8) return;
        for (int i = 0; i < sh.cols(); i++) for (int j = 0; j < sh.rows(); j++) {
            if (!sh.on(i, j)) continue;
            float at = appearAt(sh.tier()[i][j]), hot = heat(age, at), k = pop(age, at);
            if (hot <= 0 || k <= 0) continue;
            float[] r = scaled(sh.x(i), sh.y(j), sh.x(i) + sh.cw(), sh.y(j) + sh.ch(), k);
            rect(p, vc, r[0], r[1], r[2], r[3], -sh.d(i, j) + 0.02f, new float[]{1f, 1f, 1f}, hot * 0.9f);
        }
    }

    /** 0.19: fully grown body cell at exactly depth {@code d} (same box or a box at the same recess). */
    private static boolean same(Shape sh, int i, int j, float d, float age) {
        return visible(sh, i, j, age) && Math.abs(sh.d(i, j) - d) < 1e-4f;
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
        float[] core = {1f, 0.99f, 0.97f}, bl = bloom(s.frame);
        // 0.18: no halo blobs or jitter shells any more (they turned the rift into a white blob with rings);
        // the white centre is drawn by the interior shader and the bending by the real lens pass.
        for (int i = 0; i < sh.cols(); i++) for (int j = 0; j < sh.rows(); j++) {
            if (!sh.on(i, j)) continue;
            float at = appearAt(sh.tier()[i][j]), k = pop(age, at);
            if (k <= 0) continue;
            float[] r = scaled(sh.x(i), sh.y(j), sh.x(i) + sh.cw(), sh.y(j) + sh.ch(), k);
            float hot = heat(age, at), d = sh.d(i, j);
            // 0.19: outer edges get the full neon rim; seams against a shallower box get a lip rim on the
            // shallower back plane, so the internal box outlines glow like the footage.
            float zl = wallTop(sh, i - 1, j, d, age), zr = wallTop(sh, i + 1, j, d, age);
            float zd = wallTop(sh, i, j - 1, d, age), zu = wallTop(sh, i, j + 1, d, age);
            if (zl <= 0) rim(p, vc, cam, r[0], r[1], r[0], r[3], zl + 0.01f, -d, core, bl, hot, zl < 0);
            if (zr <= 0) rim(p, vc, cam, r[2], r[1], r[2], r[3], zr + 0.01f, -d, core, bl, hot, zr < 0);
            if (zd <= 0) rim(p, vc, cam, r[0], r[1], r[2], r[1], zd + 0.01f, -d, core, bl, hot, zd < 0);
            if (zu <= 0) rim(p, vc, cam, r[0], r[3], r[2], r[3], zu + 0.01f, -d, core, bl, hot, zu < 0);
        }
        for (float[] b : sh.sats()) {
            float at = appearAt(TIERS) + b[6] % 3, k = pop(age, at);
            if (k <= 0) continue;
            float[] r = scaled(b[0], b[1], b[2], b[3], k);
            float hot = heat(age, at);
            int m = (int) b[7];
            if ((m & 1) == 0) rim(p, vc, cam, r[0], r[1], r[0], r[3], b[4], b[5], core, bl, hot, false);
            if ((m & 2) == 0) rim(p, vc, cam, r[2], r[1], r[2], r[3], b[4], b[5], core, bl, hot, false);
            if ((m & 4) == 0) rim(p, vc, cam, r[0], r[1], r[2], r[1], b[4], b[5], core, bl, hot, false);
            if ((m & 8) == 0) rim(p, vc, cam, r[0], r[3], r[2], r[3], b[4], b[5], core, bl, hot, false);
            // Depth edges at the outer corners make the satellite (or tetromino) read as a 3D box.
            float[][] corners = {{r[0], r[1], m & 5}, {r[2], r[1], m & 6}, {r[0], r[3], m & 9}, {r[2], r[3], m & 10}};
            for (float[] c : corners)
                if (c[2] == 0) ribbon(p, vc, cam, new float[]{c[0], c[1], b[4]}, new float[]{c[0], c[1], b[5]}, 0.06f, core, 0.8f);
        }
        if (age >= GROWN) {
            for (int k = 0; k < 7; k++) cubeOutline(p, vc, cam, cube(sh, s, k), core);
            sparkles(p, vc, cam, sh, s, edge);
            arcs(p, vc, cam, sh, s, edge);
        }
    }

    /**
     * 0.14 light spill (trailer refs): a breathing white-pink haze filling the opening, soft glow bands
     * along the inside of every opening edge, light fanning forward out of the rim, and small white
     * square motes drifting out of the rift. All additive and low alpha, so pale rifts never wash out.
     */
    private static void spill(PoseStack.Pose p, VertexConsumer vc, Shape sh, State s, float[] edge, float age) {
        float in = Math.min(1f, Math.max(0f, (age - GROWN) / 20f));
        if (in <= 0f) return;
        float t = s.ageInTicks, breathe = 0.85f + 0.15f * (float) Math.sin(t * 0.07f);
        float[] white = {1f, 0.98f, 0.97f}, pink = mix(white, bloom(s.frame), 0.55f);
        float span = Math.max(sh.w(), sh.h());
        float band = Math.min(0.6f, Math.min(sh.cw(), sh.ch()) * 1.2f), out = 1.1f, fwd = 0.7f;
        for (int i = 0; i < sh.cols(); i++) for (int j = 0; j < sh.rows(); j++) {
            if (!sh.on(i, j)) continue;
            float x0 = sh.x(i), y0 = sh.y(j), x1 = x0 + sh.cw(), y1 = y0 + sh.ch(), zc = -sh.d(i, j) + 0.04f;
            float ea = 0.24f * in * breathe, sa = 0.05f * in * breathe;
            // 0.15 outer bloom: a soft band in the rift's plane, fading outward from every open edge.
            boolean portal = s.type == RiftType.PORTAL;
            float gw = portal ? 0.85f : 0.6f, ga = (portal ? 0.34f : 0.08f) * in * breathe, zo = 0.02f;
            float[] gc = portal ? mix(white, edge, 0.6f) : pink;
            if (!sh.on(i - 1, j)) grad(p, vc, x0, y0, zo, x0, y1, zo, x0 - gw, y1, zo, x0 - gw, y0, zo, gc, ga, 0f);
            if (!sh.on(i + 1, j)) grad(p, vc, x1, y1, zo, x1, y0, zo, x1 + gw, y0, zo, x1 + gw, y1, zo, gc, ga, 0f);
            if (!sh.on(i, j - 1)) grad(p, vc, x1, y0, zo, x0, y0, zo, x0, y0 - gw, zo, x1, y0 - gw, zo, gc, ga, 0f);
            if (!sh.on(i, j + 1)) grad(p, vc, x0, y1, zo, x1, y1, zo, x1, y1 + gw, zo, x0, y1 + gw, zo, gc, ga, 0f);
            if (!sh.on(i - 1, j)) {   // left edge
                grad(p, vc, x0, y0, zc, x0, y1, zc, x0 + band, y1, zc, x0 + band, y0, zc, white, ea, 0f);
                grad(p, vc, x0, y0, 0.01f, x0, y1, 0.01f, x0 - out, y1, fwd, x0 - out, y0, fwd, pink, sa, 0f);
            }
            if (!sh.on(i + 1, j)) {   // right edge
                grad(p, vc, x1, y1, zc, x1, y0, zc, x1 - band, y0, zc, x1 - band, y1, zc, white, ea, 0f);
                grad(p, vc, x1, y1, 0.01f, x1, y0, 0.01f, x1 + out, y0, fwd, x1 + out, y1, fwd, pink, sa, 0f);
            }
            if (!sh.on(i, j - 1)) {   // bottom edge
                grad(p, vc, x1, y0, zc, x0, y0, zc, x0, y0 + band, zc, x1, y0 + band, zc, white, ea, 0f);
                grad(p, vc, x1, y0, 0.01f, x0, y0, 0.01f, x0, y0 - out, fwd, x1, y0 - out, fwd, pink, sa, 0f);
            }
            if (!sh.on(i, j + 1)) {   // top edge
                grad(p, vc, x0, y1, zc, x1, y1, zc, x1, y1 - band, zc, x0, y1 - band, zc, white, ea, 0f);
                grad(p, vc, x0, y1, 0.01f, x1, y1, 0.01f, x1, y1 + out, fwd, x0, y1 + out, fwd, pink, sa, 0f);
            }
        }
        // Drifting motes: each one loops over 90 ticks, rising out of the opening and fading.
        for (int k = 0; k < 18; k++) {
            float seed = k * 12.9898f, life = ((t + k * 37f) % 90f) / 90f;
            float bx = ((float) Math.sin(seed) * 0.5f) * sh.w() * 0.8f, by = sh.cy() + ((float) Math.cos(seed * 1.7f) * 0.5f) * sh.h() * 0.8f;
            float x = bx + (float) Math.sin(seed * 3.1f + t * 0.03f) * 0.4f, y = by + life * 1.6f, z = -DEPTH * 0.3f + life * 1.4f;
            float q = 0.05f + 0.05f * (k % 3), a = (float) Math.sin(life * Math.PI) * 0.75f * in;
            rect(p, vc, x - q, y - q, x + q, y + q, z, white, a);
        }
    }

    /** Additive quad: vertices 1-2 carry alpha a0 (the lit edge), vertices 3-4 carry a1. */
    private static void grad(PoseStack.Pose p, VertexConsumer vc, float ax, float ay, float az, float bx, float by, float bz,
                             float cx, float cy, float cz, float dx, float dy, float dz, float[] c, float a0, float a1) {
        col(p, vc, ax, ay, az, c, a0); col(p, vc, bx, by, bz, c, a0);
        col(p, vc, cx, cy, cz, c, a1); col(p, vc, dx, dy, dz, c, a1);
    }

    /**
     * 0.12 neon rim: one additive camera-facing gradient band per edge. It is a thin white core fading
     * smoothly to translucent pink (the bloom colour) and then to nothing at the margins, so the outline is
     * soft and anti-aliased instead of stacked hard ribbons. The back rim sits just in front of the canvas.
     */
    private static void rim(PoseStack.Pose p, VertexConsumer vc, Vector3f cam, float xa, float ya, float xb, float yb, float zf, float zb,
                            float[] core, float[] bloom, float hot, boolean lip) {
        float[] a = {xa, ya, zf}, b = {xb, yb, zf};
        // 0.19: crisp thin white line with a soft halo (trailer), lips slightly thinner than the outer rim.
        float k = lip ? 0.75f : 1f;
        band(p, vc, cam, a, b, (0.06f + 0.06f * hot) * k, (0.30f + 0.15f * hot) * k, core, bloom, lip ? 0.85f : 1f);
        ribbon(p, vc, cam, a, b, 0.7f * k, bloom, 0.035f);
        band(p, vc, cam, new float[]{xa, ya, zb + 0.012f}, new float[]{xb, yb, zb + 0.012f}, 0.04f, 0.18f, core, bloom, 0.6f);
    }

    /** Camera-facing gradient strip: bloom (alpha 0) -> bloom (0.4) -> white core (1) -> bloom (0.4) -> bloom (0). */
    private static void band(PoseStack.Pose p, VertexConsumer vc, Vector3f cam, float[] a, float[] b, float core, float outer,
                             float[] white, float[] bloom, float alpha) {
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
        float[][] cs = {bloom, bloom, white, white, bloom, bloom};
        float[] as = {0f, 0.4f, 1f, 1f, 0.4f, 0f};
        for (int i = 0; i < 5; i++) {
            float o0 = off[i], o1 = off[i + 1];
            col(p, vc, ax + sx * o0, ay + sy * o0, az + sz * o0, cs[i], as[i] * alpha);
            col(p, vc, bx + sx * o0, by + sy * o0, bz + sz * o0, cs[i], as[i] * alpha);
            col(p, vc, bx + sx * o1, by + sy * o1, bz + sz * o1, cs[i + 1], as[i + 1] * alpha);
            col(p, vc, ax + sx * o1, ay + sy * o1, az + sz * o1, cs[i + 1], as[i + 1] * alpha);
        }
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
        float reach = 0.8f + 0.45f * hash(s.seed, k, 2);
        float cx = (float) Math.cos(a) * sh.w() / 2 * reach * 1.25f + 0.25f * (float) Math.sin(s.time * 0.7f + k);
        float cy = sh.cy() + (float) Math.sin(a) * sh.h() / 2 * reach * 1.2f + 0.3f * (float) Math.sin(s.time * 0.9f + k * 1.7f);
        float cz = 0.3f + 1.0f * hash(s.seed, k, 3);
        float half = 0.28f + 0.3f * hash(s.seed, k, 4); // 0.18: trailer-size floating boxes (was 0.1..0.24)
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

    /**
     * 0.18.1 portal edge jitter: the rift trembles by {@code Math.sin(gameTime * 0.4f) * 0.05f}.
     * 0.19: the SAME offset is applied to every vertex (x and y on slightly different phases). The
     * 0.18.1 per-position phase bent shared edges by different amounts and tore visible cracks between
     * the interior strips (T-junctions); a uniform shift keeps every seam closed.
     */
    static float gameTime() { return (float) ((System.nanoTime() / 5.0e7) % 1.0e6); } // ticks (20 per second)

    private static float jx(float x, float y, float z) { return x + (float) Math.sin(gameTime() * 0.4f) * 0.05f; }
    private static float jy(float x, float y, float z) { return y + (float) Math.sin(gameTime() * 0.4f * 1.13f + 2.1f) * 0.05f; }

    private static void col(PoseStack.Pose p, VertexConsumer vc, float x, float y, float z, float[] c, float a) {
        if (!SiftBudget.take(vc)) return; // 0.16: never exceed 16-bit quad indices in one batch
        { float ox = x; x = jx(x, y, z); y = jy(ox, y, z); }
        if (!Float.isFinite(x + y + z)) { x = 0f; y = 0f; z = 0f; a = 0f; } // 0.13: collapse, keep the quad count intact
        vc.addVertex(p, x, y, z).setColor(c[0], c[1], c[2], a);
    }

    /** Double-sided flat rectangle (position/colour types). */
    private static void rect(PoseStack.Pose p, VertexConsumer vc, float x0, float y0, float x1, float y1, float z, float[] c, float a) {
        col(p, vc, x0, y0, z, c, a); col(p, vc, x1, y0, z, c, a); col(p, vc, x1, y1, z, c, a); col(p, vc, x0, y1, z, c, a);
    }

    /** Box without its front (+z) face: the inside walls show, shaded darker toward the back. */
    private static void hollowCube(PoseStack.Pose p, VertexConsumer vc, float x0, float y0, float z0, float x1, float y1, float z1, float[] c) {
        float[] back = {c[0] * 0.8f, c[1] * 0.78f, c[2] * 0.76f}, side = {c[0] * 0.92f, c[1] * 0.9f, c[2] * 0.88f};
        col(p, vc, x0, y0, z0, back, 1f); col(p, vc, x1, y0, z0, back, 1f); col(p, vc, x1, y1, z0, back, 1f); col(p, vc, x0, y1, z0, back, 1f);
        col(p, vc, x0, y1, z0, back, 1f); col(p, vc, x1, y1, z0, back, 1f); col(p, vc, x1, y1, z1, c, 1f); col(p, vc, x0, y1, z1, c, 1f);
        col(p, vc, x0, y0, z0, back, 1f); col(p, vc, x1, y0, z0, back, 1f); col(p, vc, x1, y0, z1, side, 1f); col(p, vc, x0, y0, z1, side, 1f);
        col(p, vc, x0, y0, z0, back, 1f); col(p, vc, x0, y1, z0, back, 1f); col(p, vc, x0, y1, z1, side, 1f); col(p, vc, x0, y0, z1, side, 1f);
        col(p, vc, x1, y0, z0, back, 1f); col(p, vc, x1, y1, z0, back, 1f); col(p, vc, x1, y1, z1, side, 1f); col(p, vc, x1, y0, z1, side, 1f);
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
