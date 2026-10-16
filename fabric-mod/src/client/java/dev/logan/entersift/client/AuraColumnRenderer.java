package dev.logan.entersift.client;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.logan.entersift.AuraColumnEntity;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.client.renderer.state.level.CameraRenderState;
import net.minecraft.world.phys.AABB;

/**
 * 0.17 note-block aura glow: a soft, camera-facing rainbow light column (no beacon beam). The column
 * fades in over 8 ticks and out over the last 30 of its life. With {@code Rainbow} it keeps its note
 * colour at the base and sweeps through neighbouring hues on the way up, with slim side columns in
 * shifted hues around it.
 */
public final class AuraColumnRenderer extends EntityRenderer<AuraColumnEntity, AuraColumnRenderer.State> {
    public AuraColumnRenderer(EntityRendererProvider.Context context) { super(context); }

    public static final class State extends EntityRenderState {
        float age, life, height, time;
        int color;
        boolean rainbow;
        double ex, ey, ez;
    }

    @Override public State createRenderState() { return new State(); }

    @Override
    public void extractRenderState(AuraColumnEntity e, State s, float partial) {
        super.extractRenderState(e, s, partial);
        s.age = e.tickCount + partial;
        s.life = Math.max(10, e.life());
        s.height = Float.isFinite(e.columnHeight()) ? Math.max(1f, Math.min(48f, e.columnHeight())) : 9f;
        s.color = e.color();
        s.rainbow = e.rainbow();
        s.time = s.age / 20f;
        s.ex = e.getX(); s.ey = e.getY(); s.ez = e.getZ();
    }

    @Override
    protected AABB getBoundingBoxForCulling(AuraColumnEntity e, float partial) {
        float h = Math.max(1f, Math.min(48f, e.columnHeight()));
        return e.getBoundingBox().inflate(2.5, 0, 2.5).expandTowards(0, h, 0);
    }

    @Override
    public void submit(State s, PoseStack pose, SubmitNodeCollector collector, CameraRenderState camera) {
        if (!SiftBudget.auraGlow) return;
        float fade = Math.min(1f, s.age / 8f) * Math.min(1f, Math.max(0f, (s.life - s.age) / 30f));
        if (fade <= 0.01f) return;
        float camX = (float) (camera.pos.x - s.ex), camZ = (float) (camera.pos.z - s.ez);
        float[] base = {(s.color >> 16 & 255) / 255f, (s.color >> 8 & 255) / 255f, (s.color & 255) / 255f};
        float hue = hueOf(base);
        // 0.24 (Images 5, 6, 10, 29): each Note Block emits a pure, straight vertical stage-light column in its
        // own vivid note color (Red, Orange, Yellow, Green, Cyan, Blue, Purple, Pink) with a bright white-tinted
        // inner core so the 8 Note Blocks together form the crisp rainbow array in front of the portal.
        float[] core = {base[0] + (1f - base[0]) * 0.52f, base[1] + (1f - base[1]) * 0.52f, base[2] + (1f - base[2]) * 0.52f};
        float[] top = s.rainbow ? AuraColumns.hue(hue + 0.04f) : base;
        collector.submitCustomGeometry(pose, SiftRenderTypes.GLOW, (p, vc) -> {
            AuraColumns.column(p, vc, 0f, -0.15f, 0f, s.height, 0.36f, base, top, 0.78f * fade, camX, camZ, s.time, hue * 9f);
            AuraColumns.column(p, vc, 0f, -0.15f, 0f, s.height * 0.96f, 0.16f, core, base, 0.55f * fade, camX, camZ, s.time, hue * 9f + 0.5f);
        });
    }

    private static float hueOf(float[] c) {
        float max = Math.max(c[0], Math.max(c[1], c[2])), min = Math.min(c[0], Math.min(c[1], c[2]));
        float d = max - min;
        if (d < 1e-4f) return 0f;
        float h;
        if (max == c[0]) h = ((c[1] - c[2]) / d) % 6f;
        else if (max == c[1]) h = (c[2] - c[0]) / d + 2f;
        else h = (c[0] - c[1]) / d + 4f;
        h /= 6f;
        return h < 0 ? h + 1 : h;
    }
}
