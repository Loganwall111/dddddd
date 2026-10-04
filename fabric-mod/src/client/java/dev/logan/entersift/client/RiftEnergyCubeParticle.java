package dev.logan.entersift.client;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.logan.entersift.RiftType;
import java.util.ArrayList;
import java.util.List;
import net.fabricmc.fabric.api.client.particle.v1.ParticleGroupRegistry;
import net.minecraft.client.Camera;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.particle.Particle;
import net.minecraft.client.particle.ParticleEngine;
import net.minecraft.client.particle.ParticleGroup;
import net.minecraft.client.particle.ParticleRenderType;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.culling.Frustum;
import net.minecraft.client.renderer.state.level.CameraRenderState;
import net.minecraft.client.renderer.state.level.ParticleGroupRenderState;
import net.minecraft.world.phys.Vec3;
import org.joml.Matrix4f;
import org.joml.Vector3f;

/**
 * Client-side 3D energy cube particle used for night-time rift fragments.
 *
 * <ul>
 *   <li>Drifts UPWARD along the positive Y-axis ({@code velocity.y += 0.04f}) with zero horizontal X/Z drift.</li>
 *   <li>Renders as small filled 3D voxels ({@code 0.25} to {@code 0.5} blocks in base size).</li>
 *   <li>For Sift rifts, uses soft pastel mint, cyan, and pink rather than an emissive white outline.</li>
 *   <li>Horizontal dissolve: when {@code age >= 0.75 * maxAge}, compresses Y-scale while expanding X/Z scales
 *       to flatten the block into a wide horizontal rectangle and fades alpha to {@code 0.0} before deletion.</li>
 * </ul>
 */
public final class RiftEnergyCubeParticle extends Particle {
    public static final ParticleRenderType GROUP =
        new ParticleRenderType("entersift:rift_energy_cube", "RIFT_ENERGY_CUBE");

    /** Soft Sift palette: pastel mint, cyan and pale pink. */
    public static final float[][] SIFT_PALETTE = {
        {0.42f, 0.84f, 0.63f}, // pastel mint
        {0.40f, 0.78f, 0.87f}, // pastel cyan
        {0.94f, 0.61f, 0.76f}  // pale pink
    };

    private static final float[][] OVERWORLD_PALETTE = {
        {1.00f, 0.90f, 0.45f},
        {1.00f, 0.74f, 0.24f},
        {1.00f, 0.97f, 0.78f}
    };
    private static final float[][] NETHER_PALETTE = {
        {1.00f, 0.48f, 0.22f},
        {1.00f, 0.26f, 0.16f},
        {1.00f, 0.75f, 0.32f}
    };
    private static final float[][] END_PALETTE = {
        {0.78f, 0.36f, 1.00f},
        {0.52f, 0.92f, 1.00f},
        {0.96f, 0.68f, 1.00f}
    };
    private static final float[][] PORTAL_PALETTE = {
        {0.25f, 0.96f, 1.00f},
        {0.42f, 0.78f, 1.00f},
        {0.75f, 0.98f, 1.00f}
    };

    public final Vector3f velocity = new Vector3f(0.0f, 0.0f, 0.0f);
    public final int maxAge;
    public final float baseScale;
    public final float[] color;
    public float scaleX;
    public float scaleY;
    public float scaleZ;
    public float alpha;

    public RiftEnergyCubeParticle(ClientLevel level, double x, double y, double z, RiftType type, int colorIndex) {
        super(level, x, y, z);
        this.hasPhysics = false;
        this.gravity = 0.0f;
        this.friction = 1.0f;
        // Small filled 3D voxel scale: 0.25 to 0.5 blocks before the final dissolve.
        this.baseScale = 0.25f + this.random.nextFloat() * 0.25f;
        this.scaleX = this.baseScale;
        this.scaleY = this.baseScale;
        this.scaleZ = this.baseScale;
        this.lifetime = 24 + this.random.nextInt(16);
        this.maxAge = this.lifetime;
        this.alpha = 1.0f;
        // Zero horizontal X/Z drift; rise through the opening. The border fragments are shader frames.
        this.velocity.set(0.0f, 0.04f, 0.0f);
        this.xd = 0.0;
        this.yd = 0.04;
        this.zd = 0.0;
        this.color = paletteFor(type, colorIndex);
        this.setSize(this.baseScale, this.baseScale);
    }

    public static void register() {
        ParticleGroupRegistry.register(GROUP, Group::new);
    }

    public static void spawn(double x, double y, double z, RiftType type, int colorIndex) {
        Minecraft mc = Minecraft.getInstance();
        if (mc == null || mc.level == null || mc.particleEngine == null) return;
        mc.particleEngine.add(new RiftEnergyCubeParticle(mc.level, x, y, z, type, colorIndex));
    }

    public static float[] paletteFor(RiftType type, int index) {
        int idx = Math.floorMod(index, 3);
        return switch (type) {
            case SIFT -> SIFT_PALETTE[idx];
            case OVERWORLD -> OVERWORLD_PALETTE[idx];
            case NETHER -> NETHER_PALETTE[idx];
            case END -> END_PALETTE[idx];
            case PORTAL -> PORTAL_PALETTE[idx];
        };
    }

    @Override
    public void tick() {
        this.xo = this.x;
        this.yo = this.y;
        this.zo = this.z;
        if (this.age++ >= this.maxAge) {
            this.remove();
            return;
        }
        // Strictly upward, no horizontal drift. Clamped so a short-lived mote does not leave the rift in one tick.
        velocity.x = 0.0f;
        velocity.z = 0.0f;
        velocity.y += 0.04f;
        this.xd = 0.0;
        this.zd = 0.0;
        this.yd = Math.min(0.22f, velocity.y);
        this.setPos(this.x, this.y + this.yd, this.z);
        applyDissolve(this.age, this.maxAge);
    }

    /**
     * Horizontal dissolve: when {@code age >= 0.75 * maxAge}, compresses Y-scale while expanding X/Z scales
     * to flatten the voxel block into a wide horizontal rectangle and fades alpha to 0.0 before deletion.
     */
    public void applyDissolve(float currentAge, float totalMaxAge) {
        if (currentAge >= 0.75f * totalMaxAge) {
            float dissolve = Math.min(1.0f, (currentAge - 0.75f * totalMaxAge) / Math.max(0.001f, 0.25f * totalMaxAge));
            this.scaleY = this.baseScale * Math.max(0.04f, 1.0f - 0.88f * dissolve);
            this.scaleX = this.baseScale * (1.0f + 1.75f * dissolve);
            this.scaleZ = this.baseScale * (1.0f + 1.75f * dissolve);
            this.alpha = Math.max(0.0f, 1.0f - dissolve);
        } else {
            float fadeIn = Math.min(1.0f, currentAge / Math.max(1.0f, 0.15f * totalMaxAge));
            this.scaleX = this.baseScale;
            this.scaleY = this.baseScale;
            this.scaleZ = this.baseScale;
            this.alpha = fadeIn;
        }
    }

    @Override
    public ParticleRenderType getGroup() {
        return GROUP;
    }

    /** Emits a filled six-face voxel with shaded planes (no wireframe), supporting non-uniform scales for dissolve. */
    public static void emitVoxelBlock(
        PoseStack.Pose pose,
        VertexConsumer vc,
        float cx,
        float cy,
        float cz,
        float sx,
        float sy,
        float sz,
        float[] rgb,
        float alpha
    ) {
        if (alpha <= 0.01f) return;
        float hx = sx * 0.5f;
        float hy = sy * 0.5f;
        float hz = sz * 0.5f;
        float x0 = cx - hx, x1 = cx + hx;
        float y0 = cy - hy, y1 = cy + hy;
        float z0 = cz - hz, z1 = cz + hz;
        Matrix4f m = pose.pose();
        // Front (+Z) and Back (-Z)
        quad(m, vc, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1, rgb, 1.00f, alpha);
        quad(m, vc, x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0, rgb, 0.92f, alpha);
        // Top (+Y) and Bottom (-Y) - brighter top for crisp 3D voxel readability
        quad(m, vc, x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0, rgb, 1.12f, alpha);
        quad(m, vc, x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1, rgb, 0.80f, alpha);
        // Right (+X) and Left (-X)
        quad(m, vc, x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1, rgb, 0.88f, alpha);
        quad(m, vc, x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0, rgb, 0.88f, alpha);
    }

    private static void quad(
        Matrix4f m,
        VertexConsumer vc,
        float ax, float ay, float az,
        float bx, float by, float bz,
        float cx, float cy, float cz,
        float dx, float dy, float dz,
        float[] c,
        float shade,
        float a
    ) {
        float r = Math.min(1.0f, c[0] * shade);
        float g = Math.min(1.0f, c[1] * shade);
        float b = Math.min(1.0f, c[2] * shade);
        float al = Math.max(0.0f, Math.min(1.0f, a));
        if (SiftBudget.take(vc)) vc.addVertex(m, ax, ay, az).setColor(r, g, b, al);
        if (SiftBudget.take(vc)) vc.addVertex(m, bx, by, bz).setColor(r, g, b, al);
        if (SiftBudget.take(vc)) vc.addVertex(m, cx, cy, cz).setColor(r, g, b, al);
        if (SiftBudget.take(vc)) vc.addVertex(m, dx, dy, dz).setColor(r, g, b, al);
    }

    private record Instance(float x, float y, float z, float sx, float sy, float sz, float[] color, float alpha) {}

    public static final class Group extends ParticleGroup<RiftEnergyCubeParticle> {
        public Group(ParticleEngine engine) {
            super(engine);
        }

        @Override
        public ParticleGroupRenderState extractRenderState(Frustum frustum, Camera camera, float partialTick) {
            ClientLevel level = Minecraft.getInstance().level;
            if (!SiftBudget.riftEffects || level == null || !RiftFragments.isNightTime(level.getOverworldClockTime())) {
                return new State(List.of());
            }
            Vec3 cam = camera.position();
            List<Instance> list = new ArrayList<>(this.particles.size());
            for (RiftEnergyCubeParticle p : this.particles) {
                if (!p.isAlive()) continue;
                float currentAge = p.age + partialTick;
                p.applyDissolve(currentAge, p.maxAge);
                if (p.alpha <= 0.01f) continue;
                float px = (float) (p.xo + (p.x - p.xo) * partialTick - cam.x);
                float py = (float) (p.yo + (p.y - p.yo) * partialTick - cam.y);
                float pz = (float) (p.zo + (p.z - p.zo) * partialTick - cam.z);
                list.add(new Instance(px, py, pz, p.scaleX, p.scaleY, p.scaleZ, p.color, p.alpha));
            }
            return new State(list);
        }
    }

    private record State(List<Instance> instances) implements ParticleGroupRenderState {
        @Override
        public void submit(SubmitNodeCollector collector, CameraRenderState camera) {
            if (instances.isEmpty()) return;
            PoseStack pose = new PoseStack();
            collector.submitCustomGeometry(pose, SiftRenderTypes.GLASS, (p, vc) -> {
                for (Instance inst : instances) {
                    emitVoxelBlock(p, vc, inst.x, inst.y, inst.z, inst.sx, inst.sy, inst.sz, inst.color, inst.alpha);
                }
            });
        }
    }
}
