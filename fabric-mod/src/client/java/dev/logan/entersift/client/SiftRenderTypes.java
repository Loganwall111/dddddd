package dev.logan.entersift.client;

import com.mojang.renderpearl.api.pipeline.BlendFunction;
import com.mojang.renderpearl.api.pipeline.ColorTargetState;
import com.mojang.renderpearl.api.pipeline.CompareOp;
import com.mojang.renderpearl.api.pipeline.DepthStencilState;
import com.mojang.renderpearl.api.pipeline.RenderPipeline;
import dev.logan.entersift.SiftContent;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.client.renderer.rendertype.RenderSetup;
import net.minecraft.client.renderer.rendertype.RenderType;

/**
 * 0.11: private render types for the Sift sky and rifts (position + colour, no fog, no texture).
 *
 * Until 0.10 the sky and rifts were drawn with {@code RenderTypes.debugQuads()}, a translucent type
 * that goes through the order-independent-transparency pass and shares a batch with vanilla's
 * debug renderers. The huge sky dome in that pass is what made leaves and ichor flicker when the
 * camera moved. These types have no OIT pipelines and no sorting:
 *
 *   SOLID: opaque, writes depth (reverse-Z, so GEQUAL means "nearer or equal").
 *   GLOW:  additive (lightning blend), depth-tested but never writes depth.
 */
public final class SiftRenderTypes {
    private SiftRenderTypes() {}

    public static final RenderPipeline SOLID_PIPELINE = RenderPipelines.register(
        RenderPipeline.builder(RenderPipelines.DEBUG_FILLED_SNIPPET)
            .withLocation(SiftContent.id("pipeline/sift_solid"))
            .withColorTargetState(ColorTargetState.DEFAULT)
            .withDepthStencilState(new DepthStencilState(CompareOp.GREATER_THAN_OR_EQUAL, true))
            .withCull(false)
            .build());

    public static final RenderPipeline GLOW_PIPELINE = RenderPipelines.register(
        RenderPipeline.builder(RenderPipelines.DEBUG_FILLED_SNIPPET)
            .withLocation(SiftContent.id("pipeline/sift_glow"))
            .withColorTargetState(new ColorTargetState(BlendFunction.LIGHTNING))
            .withDepthStencilState(new DepthStencilState(CompareOp.GREATER_THAN_OR_EQUAL, false))
            .withCull(false)
            .build());

    public static final RenderType SOLID = RenderType.create("entersift_solid", RenderSetup.builder(SOLID_PIPELINE).createRenderSetup());
    public static final RenderType GLOW = RenderType.create("entersift_glow", RenderSetup.builder(GLOW_PIPELINE).createRenderSetup());

    /** Forces class loading (pipeline registration) during client init. */
    public static void initialize() {}
}
