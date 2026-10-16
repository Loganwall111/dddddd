package dev.logan.entersift.client;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.logan.entersift.MeshProbeData;
import dev.logan.entersift.MeshProbeEntity;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.client.renderer.state.level.CameraRenderState;
import net.minecraft.world.phys.AABB;

/**
 * 0.41 mesh probe: draws one converted Dungeons room as surface geometry, using the mod's own SOLID
 * pipeline (untextured position+colour, no lighting), which is the closest thing to a viewer for a raw
 * mesh — what you see is the geometry, not a texture hiding it.
 *
 * <p>Shading is baked per quad by the exporter: tall ground reads brighter than low ground, vertical
 * skirts read darker, so the room's shape is legible before anything is textured.
 *
 * <p>Draws through {@link SiftBudget#take}, the same 48 000-vertex guard the rifts and clouds use, so a
 * summoned room can never blow the shared vertex buffer — if the budget runs out the remaining quads are
 * dropped whole rather than corrupting the batch.
 */
public final class MeshProbeRenderer extends EntityRenderer<MeshProbeEntity, MeshProbeRenderer.State> {
    private static final float[] LOW = {0.30f, 0.29f, 0.27f};
    private static final float[] HIGH = {0.76f, 0.74f, 0.68f};

    public MeshProbeRenderer(EntityRendererProvider.Context context) { super(context); }

    public static final class State extends EntityRenderState {
        MeshProbeData.Mesh mesh;
    }

    @Override public State createRenderState() { return new State(); }

    @Override
    public void extractRenderState(MeshProbeEntity e, State s, float partial) {
        super.extractRenderState(e, s, partial);
        s.mesh = e.mesh();
    }

    /**
     * Culling box covers the whole room: the entity's own 1x1 box would pop the mesh out of view as soon
     * as the player stepped away from its centre.
     */
    @Override
    protected AABB getBoundingBoxForCulling(MeshProbeEntity e, float partial) {
        MeshProbeData.Mesh mesh = e.mesh();
        if (mesh == null) return e.getBoundingBox();
        double halfW = mesh.width * 0.5 + 1, halfD = mesh.depth * 0.5 + 1;
        return new AABB(e.getX() - halfW, e.getY() - 1, e.getZ() - halfD,
                        e.getX() + halfW, e.getY() + 256, e.getZ() + halfD);
    }

    @Override
    public void submit(State s, PoseStack pose, SubmitNodeCollector collector, CameraRenderState camera) {
        if (!SiftBudget.meshProbe) return;
        MeshProbeData.Mesh mesh = s.mesh;
        if (mesh == null || mesh.quadCount == 0) return;
        collector.submitCustomGeometry(pose, SiftRenderTypes.SOLID, (p, vc) -> {
            float[] f = mesh.quads;
            for (int q = 0; q < mesh.quadCount; q++) {
                int o = q * 13;
                float shade = f[o + 12];
                float r = LOW[0] + (HIGH[0] - LOW[0]) * shade;
                float g = LOW[1] + (HIGH[1] - LOW[1]) * shade;
                float b = LOW[2] + (HIGH[2] - LOW[2]) * shade;
                if (!SiftBudget.take(vc)) return;                        // budget exhausted: stop cleanly
                vc.addVertex(p, f[o], f[o + 1], f[o + 2]).setColor(r, g, b, 1f);
                vc.addVertex(p, f[o + 3], f[o + 4], f[o + 5]).setColor(r, g, b, 1f);
                vc.addVertex(p, f[o + 6], f[o + 7], f[o + 8]).setColor(r, g, b, 1f);
                vc.addVertex(p, f[o + 9], f[o + 10], f[o + 11]).setColor(r, g, b, 1f);
            }
        });
    }
}
