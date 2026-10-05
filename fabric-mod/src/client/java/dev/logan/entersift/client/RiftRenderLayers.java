package dev.logan.entersift.client;

import com.mojang.blaze3d.vertex.DefaultVertexFormat;
import com.mojang.renderpearl.api.pipeline.BlendFunction;
import com.mojang.renderpearl.api.pipeline.ColorTargetState;
import com.mojang.renderpearl.api.pipeline.CompareOp;
import com.mojang.renderpearl.api.pipeline.DepthStencilState;
import com.mojang.renderpearl.api.pipeline.PrimitiveTopology;
import com.mojang.renderpearl.api.pipeline.RenderPipeline;
import dev.logan.entersift.SiftContent;
import net.minecraft.client.renderer.BindGroupLayouts;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.client.renderer.rendertype.RenderSetup;
import net.minecraft.client.renderer.rendertype.RenderType;

/**
 * 0.41 screen-space rift render layers (official recipe, item 1).
 *
 * The recipe asks for {@code rendertype_translucent} with a base-map sampler plus an active
 * framebuffer sampler ("MinecraftRecolorTexture"). Overriding the VANILLA translucent type would
 * hijack every water/glass/ice draw in the game, so the identical configuration is registered as
 * private entersift pipelines instead:
 *
 *   PLANE      - the flat quad without the scene copy (first frame / fallback): the fragment
 *                shader paints the vortex over its own tint instead of the warped world.
 *   PLANE_LENS - same shader with RIFT_PLANE_LENS: Sampler0 = copied scene DEPTH (nearest,
 *                reverse-Z guard), Sampler1 = copied scene COLOUR, i.e. the world behind the
 *                plane, liquid-warped in screen space for the gravitational lensing look.
 *
 * Both are translucent, depth-tested (reverse-Z GEQUAL) but never write depth, no culling, so the
 * plane composites over terrain without ever punching through it.
 */
public final class RiftRenderLayers {
    private RiftRenderLayers() {}

    public static final RenderPipeline PLANE_PIPELINE = RenderPipelines.register(
        RenderPipeline.builder(RenderPipelines.MATRICES_FOG_SNIPPET)
            .withLocation(SiftContent.id("pipeline/rift_plane"))
            .withVertexShader(SiftContent.id("core/rift_plane"))
            .withFragmentShader(SiftContent.id("core/rift_plane"))
            .withVertexBinding(0, DefaultVertexFormat.POSITION_COLOR)
            .withPrimitiveTopology(PrimitiveTopology.QUADS)
            .withColorTargetState(new ColorTargetState(BlendFunction.TRANSLUCENT))
            .withDepthStencilState(new DepthStencilState(CompareOp.GREATER_THAN_OR_EQUAL, false))
            .withCull(false)
            .build());

    public static final RenderPipeline PLANE_LENS_PIPELINE = RenderPipelines.register(
        RenderPipeline.builder(RenderPipelines.MATRICES_FOG_SNIPPET)
            .withLocation(SiftContent.id("pipeline/rift_plane_lens"))
            .withVertexShader(SiftContent.id("core/rift_plane"))
            .withFragmentShader(SiftContent.id("core/rift_plane"))
            .withShaderDefine("RIFT_PLANE_LENS")
            .withBindGroupLayout(BindGroupLayouts.SAMPLER0_SAMPLER1)
            .withVertexBinding(0, DefaultVertexFormat.POSITION_COLOR)
            .withPrimitiveTopology(PrimitiveTopology.QUADS)
            .withColorTargetState(new ColorTargetState(BlendFunction.TRANSLUCENT))
            .withDepthStencilState(new DepthStencilState(CompareOp.GREATER_THAN_OR_EQUAL, false))
            .withCull(false)
            .build());

    /** Flat quad, no framebuffer sampling (fallback until the first scene copy lands). */
    public static final RenderType PLANE = RenderType.create("entersift_rift_plane",
        RenderSetup.builder(PLANE_PIPELINE).createRenderSetup());

    /** Flat quad + active framebuffer samplers: the gravitational-lensing pass. */
    public static final RenderType PLANE_LENS = RenderType.create("entersift_rift_plane_lens",
        RenderSetup.builder(PLANE_LENS_PIPELINE)
            .withTexture("Sampler0", RiftScene.DEPTH)
            .withTexture("Sampler1", RiftScene.COLOR)
            .createRenderSetup());

    /** Forces pipeline registration during client init. */
    public static void initialize() {}
}
