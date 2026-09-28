package dev.logan.entersift.client;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.logan.entersift.SiftContent;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import net.fabricmc.fabric.api.client.rendering.v1.level.LevelRenderEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.Display;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.phys.Vec3;
import org.joml.Quaternionf;
import org.joml.Vector3f;

/**
 * Shader-like rifts and portals, drawn around invisible anchor displays (block entersift:rift_anchor).
 * Matches the reference footage: a blocky "pixel cross" opening with glowing white outlines on
 * the front and back rim, a recessed window into another world (parallax scene + drifting pixel
 * clouds), small hollow outline cubes floating around it, lightning arcs and sparkles. A new
 * rift tears open from the centre as white-hot cells; the ritual portal pixelates inward.
 * Anchor data: glow_color_override = style, width/height = size, yaw = facing.
 */
public final class RiftRenderer {
    private static final int LIGHT = 0x00F000F0;
    private static final int STYLES = 6;
    private static final Identifier[] SCENES = new Identifier[STYLES];
    private static final Identifier CLOUDS = SiftContent.id("textures/rift/clouds.png");
    /** Outline halo tint per style: 0 overworld, 1 sift day, 2 end, 3 sift night, 4 nether, 5 portal. */
    private static final float[][] GLOW = {
        {1.0f, 1.0f, 0.62f}, {1.0f, 0.86f, 0.74f}, {0.82f, 0.66f, 1.0f},
        {1.0f, 0.62f, 0.9f}, {1.0f, 0.55f, 0.35f}, {0.55f, 1.0f, 1.0f}};
    private static final Map<Integer, Long> FIRST_SEEN = new HashMap<>();
    private static final float CELL = 0.5f;
    private static int lastLogged = -1;

    static { for (int i = 0; i < STYLES; i++) SCENES[i] = SiftContent.id("textures/rift/scene_" + i + ".png"); }

    private RiftRenderer() {}

    /** One visible opening, in rift-local space (x across, y up, z = facing normal). */
    private record Rift(int style, float w, float h, float base, float depth, int cols, int rows,
                        boolean[][] mask, float[][] heat, float progress, float age, long seed, Vector3f cam) {
        boolean on(int i, int j) { return i >= 0 && j >= 0 && i < cols && j < rows && mask[i][j] && heat[i][j] >= 0; }
        float x(int i) { return -w / 2 + i * (w / cols); }
        float y(int j) { return base + j * (h / rows); }
        float cw() { return w / cols; }
        float ch() { return h / rows; }
    }

    public static void register() {
        LevelRenderEvents.COLLECT_SUBMITS.register(context -> {
            Minecraft mc = Minecraft.getInstance();
            if (mc.level == null || context.levelState().cameraRenderState == null) return;
            Vec3 cam = context.levelState().cameraRenderState.pos;
            long now = System.nanoTime();
            float t = (float) ((now / 1.0e9) % 3600.0);
            Set<Integer> alive = new HashSet<>();
            PoseStack pose = context.poseStack();
            var submit = context.submitNodeCollector();
            for (Entity e : mc.level.entitiesForRendering()) {
                if (!(e instanceof Display.BlockDisplay display) || !display.getBlockState().is(SiftContent.RIFT_ANCHOR)) continue;
                if (e.position().distanceToSqr(cam) > 192 * 192) continue;
                alive.add(e.getId());
                float age = (now - FIRST_SEEN.computeIfAbsent(e.getId(), k -> now)) / 1.0e9f;
                Rift rift = build(display, cam, age);
                pose.pushPose();
                pose.translate(e.getX() - cam.x, e.getY() - cam.y, e.getZ() - cam.z);
                pose.rotate(new Quaternionf().rotationY((float) Math.toRadians(-e.getYRot())));
                submit.submitCustomGeometry(pose, RenderTypes.entityCutout(SCENES[rift.style]), (p, vc) -> window(p, vc, rift, t));
                submit.submitCustomGeometry(pose, RenderTypes.entityTranslucentEmissive(CLOUDS), (p, vc) -> clouds(p, vc, rift, t));
                submit.submitCustomGeometry(pose, RenderTypes.entityTranslucentEmissive(SCENES[rift.style]), (p, vc) -> cubeFaces(p, vc, rift, t));
                submit.submitCustomGeometry(pose, RenderTypes.lightning(), (p, vc) -> glow(p, vc, rift, t));
                pose.popPose();
            }
            FIRST_SEEN.keySet().retainAll(alive);
            if (alive.size() != lastLogged) {
                lastLogged = alive.size();
                org.slf4j.LoggerFactory.getLogger("entersift").info("[Sift] RiftRenderer: drawing {} rift/portal opening(s)", lastLogged);
            }
        });
    }

    private static float hash(long seed, int a, int b) {
        long h = seed * 0x9E3779B97F4A7C15L + a * 0xBF58476D1CE4E5B9L + b * 0x94D049BB133111EBL;
        h ^= h >>> 31; h *= 0x7FB5D329728EA185L; h ^= h >>> 27;
        return (h >>> 40) / (float) (1L << 24);
    }

    private static Rift build(Display.BlockDisplay d, Vec3 cam, float age) {
        int style = Math.floorMod(d.getGlowColorOverride(), STYLES);
        if (d.getGlowColorOverride() < 0) style = 1;
        boolean portal = style == 5;
        float w = Math.max(1.5f, d.getWidth()), h = Math.max(1.5f, d.getHeight());
        int cols = Math.max(3, Math.round(w / CELL)), rows = Math.max(3, Math.round(h / CELL));
        long seed = d.blockPosition().asLong() * 31 + style;
        boolean[][] mask = new boolean[cols][rows];
        float[][] heat = new float[cols][rows];
        float duration = portal ? 5.0f : 1.4f;
        float progress = Math.min(1f, age / duration);
        for (int i = 0; i < cols; i++) for (int j = 0; j < rows; j++) {
            float u = (i + 0.5f) / cols * 2 - 1, v = (j + 0.5f) / rows * 2 - 1;
            boolean border = i == 0 || j == 0 || i == cols - 1 || j == rows - 1;
            boolean in;
            if (portal) {
                in = !(border && hash(seed, i, j) < 0.3f); // full frame with a jagged pixel rim
            } else {
                float a = 0.26f + 0.12f * hash(seed, 7, j / 2), b = 0.24f + 0.14f * hash(seed, i / 2, 9);
                in = (Math.abs(u) < a && Math.abs(v) < 0.98f) || (Math.abs(v) < b && Math.abs(u) < 0.98f)
                    || (Math.abs(u) < 0.62f && Math.abs(v) < 0.58f && hash(seed, i / 2, j / 2) > 0.42f);
                if (in && border && hash(seed, i + 11, j) < 0.2f) in = false;
            }
            mask[i][j] = in;
            // Reveal order: rifts tear open from the centre, the portal pixelates inward from the rim.
            float dist = Math.max(Math.abs(u), Math.abs(v));
            float order = portal ? (1 - dist) * 0.8f + hash(seed, i, j + 5) * 0.2f : dist * 0.75f + hash(seed, i, j + 5) * 0.25f;
            float since = age - order * duration;
            heat[i][j] = since < 0 ? -1 : Math.max(0f, 1f - since / (portal ? 1.2f : 0.7f));
        }
        Vector3f local = new Vector3f((float) (cam.x - d.getX()), (float) (cam.y - d.getY()), (float) (cam.z - d.getZ()))
            .rotateY((float) Math.toRadians(d.getYRot()));
        return new Rift(style, w, h, portal ? 0f : 0.35f, portal ? 0.3f : 0.55f, cols, rows, mask, heat, progress, age, seed, local);
    }

    // ---------------------------------------------------------------- the window into another world

    private static void window(PoseStack.Pose p, VertexConsumer vc, Rift r, float t) {
        float px = clamp(-r.cam.x / Math.max(4f, r.cam.length()) * 0.1f, -0.1f, 0.1f);
        float py = clamp(-(r.cam.y - r.base - r.h / 2) / Math.max(4f, r.cam.length()) * 0.1f, -0.1f, 0.1f);
        float drift = 0.03f * (float) Math.sin(t * 0.21f + r.seed % 7);
        float z = -r.depth;
        for (int i = 0; i < r.cols; i++) for (int j = 0; j < r.rows; j++) {
            if (!r.on(i, j)) continue;
            float x0 = r.x(i), x1 = x0 + r.cw(), y0 = r.y(j), y1 = y0 + r.ch();
            float u0 = uv(i, r.cols, px + drift), u1 = uv(i + 1, r.cols, px + drift);
            float v0 = uv(r.rows - j, r.rows, -py), v1 = uv(r.rows - j - 1, r.rows, -py);
            // Back panel (the far world), both windings.
            quad(p, vc, x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z, u0, v0, u1, v1, 1f, 0, 0, 1);
            // Inner walls where the opening meets the outside: give it real depth.
            float s = 0.78f;
            if (!r.on(i - 1, j)) quad(p, vc, x0, y0, 0, x0, y0, z, x0, y1, z, x0, y1, 0, u0, v0, u0 + 0.02f, v1, s, 1, 0, 0);
            if (!r.on(i + 1, j)) quad(p, vc, x1, y0, z, x1, y0, 0, x1, y1, 0, x1, y1, z, u1 - 0.02f, v0, u1, v1, s, -1, 0, 0);
            if (!r.on(i, j - 1)) quad(p, vc, x0, y0, 0, x1, y0, 0, x1, y0, z, x0, y0, z, u0, v0, u1, v0 - 0.02f, s * 1.1f, 0, 1, 0);
            if (!r.on(i, j + 1)) quad(p, vc, x0, y1, z, x1, y1, z, x1, y1, 0, x0, y1, 0, u0, v1 + 0.02f, u1, v1, s * 0.9f, 0, -1, 0);
        }
    }

    private static void clouds(PoseStack.Pose p, VertexConsumer vc, Rift r, float t) {
        if (r.style == 5) return; // the portal mosaic has its own pixel shimmer
        float ou = 0.25f + 0.25f * (float) Math.sin(t * 0.06f + r.seed % 5), ov = 0.25f + 0.25f * (float) Math.cos(t * 0.045f);
        float z = -r.depth + 0.03f;
        for (int i = 0; i < r.cols; i++) for (int j = 0; j < r.rows; j++) {
            if (!r.on(i, j)) continue;
            float x0 = r.x(i), x1 = x0 + r.cw(), y0 = r.y(j), y1 = y0 + r.ch();
            float u0 = ou + 0.5f * i / r.cols, u1 = ou + 0.5f * (i + 1) / r.cols;
            float v0 = ov + 0.5f * (r.rows - j) / r.rows, v1 = ov + 0.5f * (r.rows - j - 1) / r.rows;
            emit(p, vc, x0, y0, z, u0, v0, 1, 1, 1, 0.75f, 0, 0, 1);
            emit(p, vc, x1, y0, z, u1, v0, 1, 1, 1, 0.75f, 0, 0, 1);
            emit(p, vc, x1, y1, z, u1, v1, 1, 1, 1, 0.75f, 0, 0, 1);
            emit(p, vc, x0, y1, z, u0, v1, 1, 1, 1, 0.75f, 0, 0, 1);
        }
    }

    // ---------------------------------------------------------------- floating hollow cubes

    /** Cube i: centre + half size, drifting around the rim. Null when hidden. */
    private static float[] cube(Rift r, int k, float t) {
        if (r.style == 5 || r.progress < 0.6f) return null;
        float angle = hash(r.seed, k, 1) * 6.2831855f;
        float reach = 0.6f + 0.35f * hash(r.seed, k, 2);
        float cx = (float) Math.cos(angle) * r.w / 2 * reach * 1.25f;
        float cy = r.base + r.h / 2 + (float) Math.sin(angle) * r.h / 2 * reach * 1.2f;
        cx += 0.15f * (float) Math.sin(t * 0.7f + k);
        cy += 0.2f * (float) Math.sin(t * 0.9f + k * 1.7f);
        float cz = (hash(r.seed, k, 3) - 0.5f) * 0.6f;
        float half = 0.1f + 0.14f * hash(r.seed, k, 4);
        float show = Math.min(1f, (r.progress - 0.6f) * 4f);
        return new float[]{cx, cy, cz, half * show};
    }

    private static void cubeFaces(PoseStack.Pose p, VertexConsumer vc, Rift r, float t) {
        for (int k = 0; k < 9; k++) {
            float[] c = cube(r, k, t);
            if (c == null) continue;
            float x0 = c[0] - c[3], x1 = c[0] + c[3], y0 = c[1] - c[3], y1 = c[1] + c[3], z0 = c[2] - c[3], z1 = c[2] + c[3];
            float u = hash(r.seed, k, 5) * 0.8f, v = hash(r.seed, k, 6) * 0.8f;
            // Only the back and inner faces: reads as a hollow glowing box with a coloured inside.
            quad(p, vc, x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, u, v, u + 0.2f, v + 0.2f, 1f, 0, 0, 1);
            quad(p, vc, x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0, u, v, u + 0.2f, v + 0.2f, 0.8f, 1, 0, 0);
            quad(p, vc, x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1, u, v, u + 0.2f, v + 0.2f, 0.9f, 0, 1, 0);
        }
    }

    // ---------------------------------------------------------------- additive glow

    private static void glow(PoseStack.Pose p, VertexConsumer vc, Rift r, float t) {
        float[] g = GLOW[r.style];
        float z = -r.depth;
        float cw = r.cw(), ch = r.ch();
        for (int i = 0; i < r.cols; i++) for (int j = 0; j < r.rows; j++) {
            if (!r.on(i, j)) continue;
            float x0 = r.x(i), x1 = x0 + cw, y0 = r.y(j), y1 = y0 + ch;
            // White-hot cells while tearing open / forming.
            float heat = r.heat[i][j];
            if (heat > 0.01f) {
                float a = heat * heat;
                facing(p, vc, r, x0, y0, x1, y1, 0.012f, 1f, 0.98f, 0.95f, a);
                facing(p, vc, r, x0 - 0.12f, y0 - 0.12f, x1 + 0.12f, y1 + 0.12f, 0.01f, g[0], g[1], g[2], a * 0.35f);
            }
            // Silhouette edges: bright core + soft halo on the front rim, a thinner line on the back rim.
            if (!r.on(i - 1, j)) edge(p, vc, r, g, x0, y0, x0, y1, z);
            if (!r.on(i + 1, j)) edge(p, vc, r, g, x1, y0, x1, y1, z);
            if (!r.on(i, j - 1)) edge(p, vc, r, g, x0, y0, x1, y0, z);
            if (!r.on(i, j + 1)) edge(p, vc, r, g, x0, y1, x1, y1, z);
        }
        // Floating hollow cube outlines.
        for (int k = 0; k < 9; k++) {
            float[] c = cube(r, k, t);
            if (c == null || c[3] < 0.01f) continue;
            float s = c[3];
            float[][] v = new float[8][];
            for (int n = 0; n < 8; n++)
                v[n] = new float[]{c[0] + ((n & 1) == 0 ? -s : s), c[1] + ((n & 2) == 0 ? -s : s), c[2] + ((n & 4) == 0 ? -s : s)};
            int[][] edges = {{0, 1}, {2, 3}, {4, 5}, {6, 7}, {0, 2}, {1, 3}, {4, 6}, {5, 7}, {0, 4}, {1, 5}, {2, 6}, {3, 7}};
            for (int[] e : edges) ribbon(p, vc, r.cam, v[e[0]], v[e[1]], 0.035f, 1f, 0.98f, 0.94f, 0.9f);
        }
        arcs(p, vc, r, t, g);
        sparkles(p, vc, r, t, g);
    }

    private static void edge(PoseStack.Pose p, VertexConsumer vc, Rift r, float[] g, float xa, float ya, float xb, float yb, float zBack) {
        float[] a = {xa, ya, 0.01f}, b = {xb, yb, 0.01f};
        ribbon(p, vc, r.cam, a, b, 0.07f, 1f, 0.98f, 0.95f, 0.95f);
        ribbon(p, vc, r.cam, a, b, 0.32f, g[0], g[1], g[2], 0.22f);
        ribbon(p, vc, r.cam, new float[]{xa, ya, zBack}, new float[]{xb, yb, zBack}, 0.045f, 1f, 0.97f, 0.94f, 0.55f);
    }

    /** Jagged lightning arcs leaping off the rim: constant while tearing open, then in bursts. */
    private static void arcs(PoseStack.Pose p, VertexConsumer vc, Rift r, float t, float[] g) {
        long bucket = (long) (t * 16);
        for (int k = 0; k < 3; k++) {
            boolean opening = r.age < (r.style == 5 ? 6f : 2.2f);
            float phase = (t * 0.3f + k * 0.37f + hash(r.seed, k, 40)) % 1f;
            if (!opening && phase > 0.08f) continue;
            long cycle = (long) (t * 0.3f + k * 0.37f + hash(r.seed, k, 40));
            float ang = hash(r.seed + cycle, k, 41) * 6.2831855f;
            float[] a = {(float) Math.cos(ang) * r.w * 0.45f, r.base + r.h / 2 + (float) Math.sin(ang) * r.h * 0.45f, 0};
            float len = 2f + 2.5f * hash(r.seed + cycle, k, 42);
            float[] dir = {(float) Math.cos(ang), (float) Math.sin(ang) * 0.6f + 0.25f, (hash(r.seed + cycle, k, 43) - 0.5f) * 0.8f};
            float[] prev = a;
            for (int s = 1; s <= 9; s++) {
                float f = s / 9f;
                float jit = 0.35f * (1 - f * 0.4f);
                float[] q = {a[0] + dir[0] * len * f + (hash(bucket, k * 31 + s, 44) - 0.5f) * jit,
                    a[1] + dir[1] * len * f + (hash(bucket, k * 31 + s, 45) - 0.5f) * jit,
                    a[2] + dir[2] * len * f + (hash(bucket, k * 31 + s, 46) - 0.5f) * jit};
                ribbon(p, vc, r.cam, prev, q, 0.045f, 1f, 1f, 1f, 0.95f);
                ribbon(p, vc, r.cam, prev, q, 0.2f, g[0], g[1], g[2], 0.25f);
                prev = q;
            }
        }
    }

    private static void sparkles(PoseStack.Pose p, VertexConsumer vc, Rift r, float t, float[] g) {
        int n = r.style == 5 ? 30 : 22;
        for (int k = 0; k < n; k++) {
            float rise = (hash(r.seed, k, 60) + t * (0.05f + 0.05f * hash(r.seed, k, 61))) % 1f;
            float x = (hash(r.seed, k, 62) - 0.5f) * r.w * 1.3f;
            float y = r.base - 0.3f + rise * (r.h + 1.2f);
            float z = (hash(r.seed, k, 63) - 0.5f) * 1.2f;
            float a = (float) Math.sin(rise * Math.PI) * (0.5f + 0.5f * (float) Math.sin(t * 6 + k)) * r.progress;
            if (a <= 0.02f) continue;
            ribbon(p, vc, r.cam, new float[]{x, y - 0.04f, z}, new float[]{x, y + 0.04f, z}, 0.08f, 1f, 1f, 1f, a);
            ribbon(p, vc, r.cam, new float[]{x, y - 0.1f, z}, new float[]{x, y + 0.1f, z}, 0.2f, g[0], g[1], g[2], a * 0.25f);
        }
    }

    // ---------------------------------------------------------------- geometry helpers

    private static float uv(int k, int n, float offset) { return clamp(0.12f + 0.76f * k / n + offset, 0f, 1f); }

    private static float clamp(float v, float lo, float hi) { return Math.max(lo, Math.min(hi, v)); }

    private static void emit(PoseStack.Pose p, VertexConsumer vc, float x, float y, float z, float u, float v,
                             float r, float g, float b, float a, float nx, float ny, float nz) {
        vc.addVertex(p, x, y, z).setColor(r, g, b, a).setUv(u, v).setOverlay(OverlayTexture.NO_OVERLAY).setLight(LIGHT).setNormal(p, nx, ny, nz);
    }

    /** Textured double-sided quad (a,b,c,d in order), uv rectangle (u0,v0)-(u1,v1), shade = brightness. */
    private static void quad(PoseStack.Pose p, VertexConsumer vc, float ax, float ay, float az, float bx, float by, float bz,
                             float cx, float cy, float cz, float dx, float dy, float dz,
                             float u0, float v0, float u1, float v1, float shade, float nx, float ny, float nz) {
        emit(p, vc, ax, ay, az, u0, v0, shade, shade, shade, 1f, nx, ny, nz);
        emit(p, vc, bx, by, bz, u1, v0, shade, shade, shade, 1f, nx, ny, nz);
        emit(p, vc, cx, cy, cz, u1, v1, shade, shade, shade, 1f, nx, ny, nz);
        emit(p, vc, dx, dy, dz, u0, v1, shade, shade, shade, 1f, nx, ny, nz);
        emit(p, vc, dx, dy, dz, u0, v1, shade, shade, shade, 1f, -nx, -ny, -nz);
        emit(p, vc, cx, cy, cz, u1, v1, shade, shade, shade, 1f, -nx, -ny, -nz);
        emit(p, vc, bx, by, bz, u1, v0, shade, shade, shade, 1f, -nx, -ny, -nz);
        emit(p, vc, ax, ay, az, u0, v0, shade, shade, shade, 1f, -nx, -ny, -nz);
    }

    private static void col(PoseStack.Pose p, VertexConsumer vc, float x, float y, float z, float r, float g, float b, float a) {
        vc.addVertex(p, x, y, z).setColor(r, g, b, a);
    }

    /** Additive rectangle in the rift plane at depth z, wound towards the camera. */
    private static void facing(PoseStack.Pose p, VertexConsumer vc, Rift rift, float x0, float y0, float x1, float y1, float z,
                               float r, float g, float b, float a) {
        if (rift.cam.z >= z) {
            col(p, vc, x0, y0, z, r, g, b, a); col(p, vc, x1, y0, z, r, g, b, a); col(p, vc, x1, y1, z, r, g, b, a); col(p, vc, x0, y1, z, r, g, b, a);
        } else {
            col(p, vc, x0, y1, z, r, g, b, a); col(p, vc, x1, y1, z, r, g, b, a); col(p, vc, x1, y0, z, r, g, b, a); col(p, vc, x0, y0, z, r, g, b, a);
        }
    }

    /** Camera-facing strip from a to b (rift-local), counter-clockwise towards the camera. */
    private static void ribbon(PoseStack.Pose p, VertexConsumer vc, Vector3f cam, float[] a, float[] b, float width,
                               float r, float g, float bl, float alpha) {
        float dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
        float vx = (a[0] + b[0]) / 2 - cam.x, vy = (a[1] + b[1]) / 2 - cam.y, vz = (a[2] + b[2]) / 2 - cam.z;
        float sx = dy * vz - dz * vy, sy = dz * vx - dx * vz, sz = dx * vy - dy * vx;
        float len = (float) Math.sqrt(sx * sx + sy * sy + sz * sz);
        if (len < 1e-6f) return;
        float k = width / 2 / len;
        sx *= k; sy *= k; sz *= k;
        // Extend the ends by half a width so outline corners join cleanly.
        float dl = (float) Math.sqrt(dx * dx + dy * dy + dz * dz);
        float ex = dl > 1e-6f ? dx / dl * width / 2 : 0, ey = dl > 1e-6f ? dy / dl * width / 2 : 0, ez = dl > 1e-6f ? dz / dl * width / 2 : 0;
        float ax = a[0] - ex, ay = a[1] - ey, az = a[2] - ez, bx = b[0] + ex, by = b[1] + ey, bz = b[2] + ez;
        col(p, vc, ax - sx, ay - sy, az - sz, r, g, bl, alpha);
        col(p, vc, bx - sx, by - sy, bz - sz, r, g, bl, alpha);
        col(p, vc, bx + sx, by + sy, bz + sz, r, g, bl, alpha);
        col(p, vc, ax + sx, ay + sy, az + sz, r, g, bl, alpha);
    }
}
