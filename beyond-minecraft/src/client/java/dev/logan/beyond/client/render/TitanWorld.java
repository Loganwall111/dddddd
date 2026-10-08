package dev.logan.beyond.client.render;

import com.mojang.blaze3d.systems.RenderSystem;
import dev.logan.beyond.BeyondMinecraft;
import dev.logan.beyond.client.BeyondClient;
import net.fabricmc.fabric.api.client.rendering.v1.CoreShaderRegistrationCallback;
import net.fabricmc.fabric.api.client.rendering.v1.WorldRenderContext;
import net.fabricmc.fabric.api.client.rendering.v1.WorldRenderEvents;
import net.minecraft.block.BlockState;
import net.minecraft.block.Blocks;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gl.ShaderProgram;
import net.minecraft.client.gl.VertexBuffer;
import net.minecraft.client.render.BufferBuilder;
import net.minecraft.client.render.BuiltBuffer;
import net.minecraft.client.render.Tessellator;
import net.minecraft.client.render.VertexFormat;
import net.minecraft.client.render.VertexFormats;
import net.minecraft.client.render.model.BakedModel;
import net.minecraft.client.render.model.BakedQuad;
import net.minecraft.client.texture.Sprite;
import net.minecraft.client.texture.SpriteAtlasTexture;
import net.minecraft.client.world.ClientWorld;
import net.minecraft.registry.RegistryKey;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Direction;
import net.minecraft.util.math.Vec3d;
import net.minecraft.util.math.random.Random;
import net.minecraft.world.Heightmap;
import net.minecraft.world.World;
import org.joml.Matrix4f;
import org.joml.Vector3f;
import org.joml.Vector4f;
import org.lwjgl.opengl.GL11;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The Living World Titan: a colossus actually built out of the world it stands in.
 *
 * <p>This is not a second entity and not a picture painted into the sky. The client reads the blocks
 * around the colossus's footprint, keeps the handful of materials the terrain is mostly made of, and
 * cuts a real voxel body out of them: every face is textured with the block it came from, sampled
 * straight out of the block atlas. The body is uploaded once and then posed entirely on the GPU —
 * each vertex carries its bone and its pull, so the head turns, the arms swing and the legs shift
 * weight without a single byte of the mesh changing.
 *
 * <p>Everything is bounded and reversible: one vertex buffer for the whole session (re-uploaded, never
 * leaked), one palette pass per world, and a hard cap on how much geometry can be produced.
 */
public final class TitanWorld {
    private static final int BONES = 6;
    /** Blocks per voxel. The colossus is meant to read as a walking piece of countryside. */
    private static final float PITCH = 2.8f;
    private static final float BODY_HEIGHT = 112f;
    private static final float BODY_SPAN = 40f;
    private static final int MAX_VERTICES = 240_000;
    private static final double SEARCH_START = 64, SEARCH_STEP = 16;
    private static final int SEARCH_STEPS = 96;

    private static final Vector4f[] bones = new Vector4f[BONES];
    private static final Vector3f[] axes = new Vector3f[BONES];
    private static final Matrix4f model = new Matrix4f();
    private static ShaderProgram program;
    private static VertexBuffer mesh;
    private static boolean failed, drawn;
    private static RegistryKey<World> builtWorld, lastWorld;
    private static Vec3d anchor;
    private static int voxelCount, faceCount, attempts;
    private static long nextAttempt;
    private static Vec3d lastAttempt;

    static {
        for (int i = 0; i < BONES; i++) { bones[i] = new Vector4f(); axes[i] = new Vector3f(1, 0, 0); }
        // 0 torso, 1 head, 2 right arm, 3 left arm, 4 right leg, 5 left leg
        bone(0, 0, 40, 0, 1, 0, 0, .035f);
        bone(1, 0, 88, 0, 0, 1, 0, .10f);
        bone(2, 15, 78, 0, 0, 0, 1, .16f);
        bone(3, -15, 78, 0, 0, 0, 1, -.16f);
        bone(4, 9, 44, 0, 1, 0, 0, .13f);
        bone(5, -9, 44, 0, 1, 0, 0, -.13f);
    }

    private TitanWorld() {}

    private static void bone(int index, float px, float py, float pz, float ax, float ay, float az, float swing) {
        bones[index].set(px, py, pz, swing);
        axes[index].set(ax, ay, az);
    }

    /** True when the voxel colossus owns this frame, so the post pass drops its painted stand-in. */
    public static boolean drawn() { return drawn; }

    /** Where the colossus stands, or null while it is still looking for solid ground. */
    public static Vec3d standingPlace() { return anchor; }

    public static String status() {
        if (failed) return "Titan unavailable (shader)";
        if (anchor == null) return "Titan awaiting solid ground after " + attempts + " searches";
        return "Titan standing at " + (int) anchor.x + ", " + (int) anchor.y + ", " + (int) anchor.z;
    }

    /** Look for standing ground again now: a new reality deserves a fresh search, not a spent budget. */
    public static void retry() {
        attempts = 0; nextAttempt = 0; lastAttempt = null;
    }

    public static void initialize() {
        CoreShaderRegistrationCallback.EVENT.register(context -> {
            try {
                context.register(BeyondMinecraft.id("titan"), VertexFormats.POSITION_TEXTURE_COLOR, shader -> program = shader);
            } catch (Exception error) {
                failed = true;
                BeyondMinecraft.LOGGER.error("Beyond titan shader failed to compile; the colossus stays a sky figure", error);
            }
        });
        WorldRenderEvents.AFTER_TRANSLUCENT.register(TitanWorld::draw);
    }

    /** One palette pass and one mesh build per world; cheap enough for an ordinary client tick. */
    public static void tick(MinecraftClient client) {
        if (failed || program == null || client.world == null || client.player == null) return;
        drawn = false;
        if (!BeyondClient.CONFIG.enabled || !BeyondClient.CONFIG.titanSky) return;
        ClientWorld world = client.world;
        // Arriving somewhere new — stepping out of a realm, coming back through a corridor, waking up —
        // earns the search a fresh budget, so a spent one is never the reason the horizon stays empty.
        if (!world.getRegistryKey().equals(lastWorld)) { lastWorld = world.getRegistryKey(); retry(); }
        // The colossus belongs to the Overworld: it is built out of the root reality's own blocks.
        if (!world.getRegistryKey().equals(World.OVERWORLD)) return;
        if (anchor != null && builtWorld != null && builtWorld.equals(world.getRegistryKey())) return;
        // Chunks stream in around the player: keep looking for standing ground, but only now and then —
        // and start over once the player has wandered somewhere new, so an ocean world is not doomed.
        Vec3d here = client.player.getPos();
        if (lastAttempt == null || here.squaredDistanceTo(lastAttempt) > 512 * 512) attempts = 0;
        if (attempts >= 8 || System.currentTimeMillis() < nextAttempt) return;
        attempts++;
        lastAttempt = here;
        nextAttempt = System.currentTimeMillis() + 4000;
        try {
            build(client, world);
        } catch (Exception error) {
            failed = true;
            BeyondMinecraft.LOGGER.error("Beyond titan construction failed; the sky figure remains", error);
        }
    }

    private static void build(MinecraftClient client, ClientWorld world) {
        if (builtWorld != null && !builtWorld.equals(world.getRegistryKey())) attempts = 0;
        builtWorld = world.getRegistryKey();
        Vec3d ground = chooseAnchor(world, client.player.getPos());
        if (ground == null) {
            BeyondMinecraft.LOGGER.warn("Beyond titan found no solid ground nearby; the sky figure keeps the horizon");
            return;
        }
        List<Material> palette = palette(client, world, ground);
        if (palette.isEmpty()) {
            BeyondMinecraft.LOGGER.warn("Beyond titan found no usable world materials at {}", ground);
            return;
        }
        BuiltBuffer buffer = body(palette);
        if (buffer == null) return;
        if (mesh == null) mesh = new VertexBuffer(VertexBuffer.Usage.STATIC);
        mesh.bind();
        mesh.upload(buffer);
        VertexBuffer.unbind();
        anchor = ground;
        BeyondMinecraft.LOGGER.info("Beyond titan stands at {} cut from {} world materials: {} voxels, {} faces",
            ground, palette.size(), voxelCount, faceCount);
    }

    /** A standing place that is real ground: loaded, dry, and above the waterline. */
    private static Vec3d chooseAnchor(ClientWorld world, Vec3d origin) {
        // The colossus rises out of the ground the walker is actually standing on, so the search starts
        // where they are rather than at the world spawn. Where a player stands is ground they can see:
        // the rings stay inside the streamed chunks instead of asking for terrain nobody has loaded,
        // and the figure stands in the world the walker is in rather than an ocean away from it.
        BlockPos centre = BlockPos.ofFloored(origin);
        Vec3d dry = search(world, centre, true);
        return dry != null ? dry : search(world, centre, false);
    }

    /**
     * Golden-angle rings outward from the centre. {@code dry} asks for open land above the waterline,
     * which makes the richest body; the second pass settles for any solid, unfrozen footing, so a
     * shoreline or a sandbar world still gets its colossus.
     */
    private static Vec3d search(ClientWorld world, BlockPos centre, boolean dry) {
        for (int step = 0; step < SEARCH_STEPS; step++) {
            double angle = step * 2.399963229728653;
            double radius = SEARCH_START + (step % 6) * SEARCH_STEP;
            int x = centre.getX() + (int) Math.round(Math.cos(angle) * radius);
            int z = centre.getZ() + (int) Math.round(Math.sin(angle) * radius);
            if (!world.isChunkLoaded(new BlockPos(x, centre.getY(), z))) continue;
            int top = world.getTopY(Heightmap.Type.MOTION_BLOCKING_NO_LEAVES, x, z);
            if (top <= world.getBottomY() + 2) continue;
            if (dry && top <= world.getSeaLevel() + 2) continue;
            BlockPos ground = new BlockPos(x, top - 1, z);
            BlockState state = world.getBlockState(ground);
            if (state.isAir() || !state.getFluidState().isEmpty() || state.isOf(Blocks.ICE)) continue;
            return new Vec3d(x + .5, top, z + .5);
        }
        return null;
    }

    /** The dozen materials the terrain around the feet is mostly made of, with atlas coordinates. */
    private static List<Material> palette(MinecraftClient client, ClientWorld world, Vec3d ground) {
        Map<BlockState, Integer> counts = new HashMap<>();
        Random random = Random.create(9182L);
        BlockPos base = BlockPos.ofFloored(ground);
        for (int sample = 0; sample < 320; sample++) {
            int x = base.getX() + random.nextInt(97) - 48;
            int z = base.getZ() + random.nextInt(97) - 48;
            int top = world.getTopY(Heightmap.Type.MOTION_BLOCKING_NO_LEAVES, x, z);
            for (int depth = 1; depth <= 4; depth++) {
                BlockPos pos = new BlockPos(x, top - depth, z);
                BlockState state = world.getBlockState(pos);
                if (state.isAir() || !state.getFluidState().isEmpty()) continue;
                counts.merge(state, 1, Integer::sum);
            }
        }
        List<Map.Entry<BlockState, Integer>> ranked = new ArrayList<>(counts.entrySet());
        ranked.sort(Comparator.comparingInt((Map.Entry<BlockState, Integer> entry) -> entry.getValue()).reversed());
        List<Material> palette = new ArrayList<>();
        for (Map.Entry<BlockState, Integer> entry : ranked) {
            if (palette.size() >= 12) break;
            try {
                BakedModel baked = client.getBlockRenderManager().getModel(entry.getKey());
                List<BakedQuad> quads = baked.getQuads(entry.getKey(), Direction.UP, Random.create(1L));
                if (quads.isEmpty()) continue;
                Sprite sprite = quads.get(0).getSprite();
                palette.add(new Material(sprite.getMinU(), sprite.getMinV(), sprite.getMaxU(), sprite.getMaxV(),
                    entry.getKey().getBlock().getTranslationKey()));
            } catch (Exception ignored) {
                // A material whose model cannot be resolved simply does not become part of the body.
            }
        }
        return palette;
    }

    private record Material(float u0, float v0, float u1, float v1, String name) {}

    /** Cuts the colossus out of the palette and writes one triangle buffer in titan-local space. */
    private static BuiltBuffer body(List<Material> palette) {
        int layers = (int) Math.ceil(BODY_HEIGHT / PITCH);
        int span = (int) Math.ceil((BODY_SPAN * .5f) / PITCH);
        BufferBuilder buffer = Tessellator.getInstance().begin(VertexFormat.DrawMode.TRIANGLES, VertexFormats.POSITION_TEXTURE_COLOR);
        float half = PITCH * .5f;
        int voxels = 0, faces = 0;
        for (int ix = -span; ix <= span; ix++) {
            for (int iz = -span; iz <= span; iz++) {
                for (int iy = 0; iy <= layers; iy++) {
                    float x = ix * PITCH, y = iy * PITCH, z = iz * PITCH;
                    if (!inside(x, y, z)) continue;
                    if (inside(x + PITCH, y, z) && inside(x - PITCH, y, z) && inside(x, y + PITCH, z)
                        && inside(x, y - PITCH, z) && inside(x, y, z + PITCH) && inside(x, y, z - PITCH)) continue;
                    if (faces * 6 > MAX_VERTICES) {
                        BeyondMinecraft.LOGGER.warn("Beyond titan exceeded its geometry budget; no body is uploaded");
                        return null;
                    }
                    voxels++;
                    Material material = palette.get(Math.floorMod(mix(ix, iy, iz), palette.size()));
                    float bone = boneOf(x, y, z);
                    float pull = pullOf(bone, x, y);
                    float emissive = eyes(x, y, z) ? 1f : 0f;
                    float x0 = x - half, x1 = x + half, y0 = y - half, y1 = y + half, z0 = z - half, z1 = z + half;
                    // Every face is wound counter-clockwise seen from outside, so culling stays honest.
                    if (!inside(x, y + PITCH, z)) { face(buffer, material, bone, pull, emissive, .98f, x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0); faces++; }
                    if (!inside(x, y - PITCH, z)) { face(buffer, material, bone, pull, emissive, .52f, x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1); faces++; }
                    if (!inside(x, y, z + PITCH)) { face(buffer, material, bone, pull, emissive, .80f, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1); faces++; }
                    if (!inside(x, y, z - PITCH)) { face(buffer, material, bone, pull, emissive, .80f, x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0); faces++; }
                    if (!inside(x + PITCH, y, z)) { face(buffer, material, bone, pull, emissive, .70f, x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1); faces++; }
                    if (!inside(x - PITCH, y, z)) { face(buffer, material, bone, pull, emissive, .70f, x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0); faces++; }
                }
            }
        }
        voxelCount = voxels;
        faceCount = faces;
        return buffer.end();
    }

    /** One quad as two triangles, textured with the whole block face it was cut from. */
    private static void face(BufferBuilder buffer, Material material, float bone, float pull, float emissive, float shade,
                             float ax, float ay, float az, float bx, float by, float bz,
                             float cx, float cy, float cz, float dx, float dy, float dz) {
        corner(buffer, material, bone, pull, emissive, shade, ax, ay, az, material.u0(), material.v0());
        corner(buffer, material, bone, pull, emissive, shade, bx, by, bz, material.u1(), material.v0());
        corner(buffer, material, bone, pull, emissive, shade, cx, cy, cz, material.u1(), material.v1());
        corner(buffer, material, bone, pull, emissive, shade, ax, ay, az, material.u0(), material.v0());
        corner(buffer, material, bone, pull, emissive, shade, cx, cy, cz, material.u1(), material.v1());
        corner(buffer, material, bone, pull, emissive, shade, dx, dy, dz, material.u0(), material.v1());
    }

    private static void corner(BufferBuilder buffer, Material material, float bone, float pull, float emissive, float shade,
                               float x, float y, float z, float u, float v) {
        buffer.vertex(x, y, z).color(pull, bone / 8f, emissive, shade).texture(u, v);
    }

    /** The colossus silhouette, in titan-local blocks: feet at y = 0, facing +Z. */
    private static boolean inside(float x, float y, float z) {
        if (y < 0) return false;
        if (capsule(x, y, z, 9, 0, 0, 9, 44, 0, 7.2f)) return true;
        if (capsule(x, y, z, -9, 0, 0, -9, 44, 0, 7.2f)) return true;
        if (capsule(x, y, z, 0, 42, 0, 0, 86, 0, 15.5f)) return true;
        if (capsule(x, y, z, 14, 80, 0, 26, 32, 6, 5.6f)) return true;
        if (capsule(x, y, z, -14, 80, 0, -26, 32, 6, 5.6f)) return true;
        return ellipsoid(x, y, z, 0, 97, 0, 11.5f, 10.5f, 9.5f);
    }

    private static boolean eyes(float x, float y, float z) {
        return box(x, y, z, 5.4f, 97.5f, 8.4f, 2.2f, 1.6f, 2.2f)
            || box(x, y, z, -5.4f, 97.5f, 8.4f, 2.2f, 1.6f, 2.2f);
    }

    private static boolean box(float x, float y, float z, float cx, float cy, float cz, float rx, float ry, float rz) {
        return Math.abs(x - cx) <= rx && Math.abs(y - cy) <= ry && Math.abs(z - cz) <= rz;
    }

    private static boolean capsule(float x, float y, float z, float ax, float ay, float az, float bx, float by, float bz, float radius) {
        float dx = bx - ax, dy = by - ay, dz = bz - az;
        float px = x - ax, py = y - ay, pz = z - az;
        float length = dx * dx + dy * dy + dz * dz;
        float t = length <= 0 ? 0 : Math.clamp((px * dx + py * dy + pz * dz) / length, 0, 1);
        float ox = px - dx * t, oy = py - dy * t, oz = pz - dz * t;
        return ox * ox + oy * oy + oz * oz <= radius * radius;
    }

    private static boolean ellipsoid(float x, float y, float z, float cx, float cy, float cz, float rx, float ry, float rz) {
        float px = (x - cx) / rx, py = (y - cy) / ry, pz = (z - cz) / rz;
        return px * px + py * py + pz * pz <= 1f;
    }

    private static float boneOf(float x, float y, float z) {
        if (y > 88) return 1;
        if (Math.abs(x) > 15 && y > 30) return x > 0 ? 2 : 3;
        if (y < 44 && Math.abs(x) > 3) return x > 0 ? 4 : 5;
        return 0;
    }

    private static float pullOf(float bone, float x, float y) {
        if (bone == 1) return Math.clamp((y - 88) / 6f, 0, 1);
        if (bone == 2 || bone == 3) return Math.clamp((Math.abs(x) - 15) / 8f, 0, 1);
        if (bone == 4 || bone == 5) return Math.clamp((44 - y) / 12f, 0, 1);
        return 1f;
    }

    private static int mix(int x, int y, int z) {
        int hash = x * 73856093 ^ y * 19349663 ^ z * 83492791;
        hash ^= hash >>> 13;
        return hash;
    }

    private static void draw(WorldRenderContext context) {
        if (failed || mesh == null || program == null || anchor == null) return;
        MinecraftClient client = MinecraftClient.getInstance();
        if (client.world == null || !BeyondClient.CONFIG.enabled || !BeyondClient.CONFIG.titanSky) return;
        if (!client.world.getRegistryKey().equals(World.OVERWORLD)) return;
        Vec3d camera = context.camera().getPos();
        // The giant is not a statue: it scans the horizon while the vertex shader walks it.
        double seconds = client.world.getTime() + context.tickCounter().getTickDelta(false);
        float scan = (float) Math.toRadians(148) + (float) Math.sin(seconds * .013) * .5f;
        model.identity()
            .translate((float) (anchor.x - camera.x), (float) (anchor.y - camera.y), (float) (anchor.z - camera.z))
            .rotateY(scan);
        boolean depth = GL11.glIsEnabled(GL11.GL_DEPTH_TEST);
        boolean cull = GL11.glIsEnabled(GL11.GL_CULL_FACE);
        RenderSystem.enableDepthTest();
        RenderSystem.depthMask(true);
        RenderSystem.disableBlend();
        RenderSystem.enableCull();
        RenderSystem.setShaderTexture(0, SpriteAtlasTexture.BLOCK_ATLAS_TEXTURE);
        program.getUniformOrDefault("TitanModel").set(model);
        for (int i = 0; i < BONES; i++) {
            program.getUniformOrDefault("Bone" + i).set(bones[i].x, bones[i].y, bones[i].z, bones[i].w);
            program.getUniformOrDefault("Axis" + i).set(axes[i].x, axes[i].y, axes[i].z);
        }
        program.getUniformOrDefault("Time").set((float) (seconds % 1440.0));
        RenderSystem.setShader(() -> program);
        mesh.bind();
        mesh.draw(context.positionMatrix(), context.projectionMatrix(), program);
        VertexBuffer.unbind();
        if (!cull) RenderSystem.disableCull();
        if (!depth) RenderSystem.disableDepthTest();
        drawn = true;
    }
}
