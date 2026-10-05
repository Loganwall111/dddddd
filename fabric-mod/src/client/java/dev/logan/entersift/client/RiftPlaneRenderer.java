package dev.logan.entersift.client;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.logan.entersift.RiftPortalEntity;
import dev.logan.entersift.RiftShape;
import dev.logan.entersift.RiftType;
import java.util.LinkedHashMap;
import java.util.Map;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.client.renderer.rendertype.RenderType;
import net.minecraft.client.renderer.state.level.CameraRenderState;
import net.minecraft.world.phys.AABB;
import org.joml.Quaternionf;

/**
 * 0.41 screen-space rift renderer (official recipe, items 1-3).
 *
 * Replaces the clustered 3D block geometry of {@link RiftPortalRenderer}: instead of hundreds of
 * voxels per rift, ONE flat camera-oriented quad is submitted and the entire presentation — the
 * jagged tiered cross, the hollow drifting debris shells with glowing white edge outlines, the
 * wave-matrix lensing of the world framebuffer behind it, and the pixel-snapped pastel vortex — is
 * procedural math in {@code core/rift_plane.fsh}. Geometry here exists only to place the shape:
 * the quad's corners carry (u, v, view code, lifecycle alpha) in the vertex colour, exactly like
 * the old window vertices did.
 *
 * The side shells inside the shader drift on low-frequency sines (weightless), so the CPU does
 * zero per-fragment work and no per-tick geometry updates happen at all.
 */
public class RiftPlaneRenderer extends EntityRenderer<RiftPortalEntity, RiftPlaneRenderer.State> {

    private static final Map<Long, RiftShape> SHAPES = new LinkedHashMap<>(32, 0.75f, true) {
        @Override protected boolean removeEldestEntry(Map.Entry<Long, RiftShape> eldest) { return size() > 48; }
    };

    public RiftPlaneRenderer(EntityRendererProvider.Context context) { super(context); }

    public static final class State extends EntityRenderState {
        RiftType type = RiftType.SIFT;
        float w, h, age, yaw, pitch;
        long seed;
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
        s.age = e.age() >= RiftPortalRenderer.GROWN ? RiftPortalRenderer.GROWN : e.age() + partial;
        s.yaw = RiftPortalRenderer.getYaw(e);
        s.pitch = RiftPortalRenderer.getPitch(e);
        s.seed = e.blockPosition().asLong() * 31 + s.type.id;
        var level = net.minecraft.client.Minecraft.getInstance().level;
        s.inSift = level != null && level.dimension().identifier().equals(RiftPortalRenderer.THE_SIFT);
        long clock = SiftTides.ticks(level);
        s.night = s.inSift ? SiftTides.isEndure(clock) : clock >= 13_000L && clock < 23_000L;
        s.view = RiftPortalRenderer.viewCode(s.type, s.inSift, s.seed);
    }

    @Override
    protected AABB getBoundingBoxForCulling(RiftPortalEntity e, float partial) {
        // The plane plus its drifting shells extends well past the entity box.
        float r = Math.max(e.riftWidth(), e.riftHeight()) + 8f;
        return e.getBoundingBox().inflate(r, r * 2f, r);
    }

    @Override
    public void submit(State s, PoseStack pose, SubmitNodeCollector out, CameraRenderState camera) {
        if (SiftRenderTypes.irisShadowPass()) return;       // self-lit: nothing in the shadow map
        RiftShape sh = SHAPES.computeIfAbsent(s.seed * 1315423911L + Float.floatToIntBits(s.w) * 131L + Float.floatToIntBits(s.h),
            k -> RiftShape.build(s.type, s.seed, s.w, s.h));
        // One quad, yaw-rotated so its face turns to the player (same convention as the old window).
        RenderType type = RiftScene.request() ? RiftRenderLayers.PLANE_LENS : RiftRenderLayers.PLANE;
        float half = Math.max(sh.w, sh.h) * 0.58f;
        float cy = sh.cy();
        float code = (s.view + (s.night ? 8 : 0) + 0.5f) / 32f;
        float a = clamp(s.age / RiftPortalRenderer.GROWN, 0f, 1f) * 0.5f;
        pose.pushPose();
        try {
            pose.rotate(new Quaternionf().rotationY((float) Math.toRadians(-s.yaw + 180f)));
            out.submitCustomGeometry(pose, type, (p, vc) -> {
                if (!SiftBudget.take(vc)) return;
                vc.addVertex(p, -half, cy - half, 0f).setColor(0f, 0f, code, a);
                vc.addVertex(p,  half, cy - half, 0f).setColor(1f, 0f, code, a);
                vc.addVertex(p,  half, cy + half, 0f).setColor(1f, 1f, code, a);
                vc.addVertex(p, -half, cy + half, 0f).setColor(0f, 1f, code, a);
            });
        } finally {
            pose.popPose();
        }
    }

    private static float clamp(float v, float lo, float hi) { return v < lo ? lo : Math.min(v, hi); }
}
