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
 *   SKY:   the opaque lava-lamp dome (0.12: its own pipeline so Iris can treat it as sky).
 *   SOLID: opaque rift walls, writes depth (reverse-Z, so GEQUAL means "nearer or equal").
 *   GLOW:  additive (lightning blend), depth-tested but never writes depth.
 *
 * 0.12 Iris compatibility: with a shader pack active Iris swaps every pipeline for a pack program
 * it knows about. Pipelines it does not know are drawn with the vanilla shader into the pack's
 * G-buffers ("Missing program ... could lead to weird rendering"), which is what broke the Sift sky
 * under the Dungeons II pack. {@link #registerWithIris()} assigns our pipelines through the public
 * Iris API (reflection, so Iris stays optional): SKY -> gbuffers_skybasic, SOLID/GLOW ->
 * gbuffers_basic. Iris also flips the reverse-Z compare ops for us, so the depth states stay valid.
 */
public final class SiftRenderTypes {
    private SiftRenderTypes() {}

    public static final RenderPipeline SKY_PIPELINE = RenderPipelines.register(
        RenderPipeline.builder(RenderPipelines.DEBUG_FILLED_SNIPPET)
            .withLocation(SiftContent.id("pipeline/sift_sky"))
            .withColorTargetState(ColorTargetState.DEFAULT)
            .withDepthStencilState(new DepthStencilState(CompareOp.GREATER_THAN_OR_EQUAL, true))
            .withCull(false)
            .build());

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

    public static final RenderType SKY = RenderType.create("entersift_sky", RenderSetup.builder(SKY_PIPELINE).createRenderSetup());
    public static final RenderType SOLID = RenderType.create("entersift_solid", RenderSetup.builder(SOLID_PIPELINE).createRenderSetup());
    public static final RenderType GLOW = RenderType.create("entersift_glow", RenderSetup.builder(GLOW_PIPELINE).createRenderSetup());

    /** Forces class loading (pipeline registration) during client init. */
    public static void initialize() {}

    private static boolean irisDone;

    /**
     * Assigns the Sift pipelines to Iris programs when Iris is installed. Safe without Iris (no-op) and
     * safe to call twice. Returns the number of pipelines assigned.
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    public static int registerWithIris() {
        if (irisDone) return 0;
        irisDone = true;
        if (!net.fabricmc.loader.api.FabricLoader.getInstance().isModLoaded("iris")) return 0;
        int n = 0;
        try {
            Class<?> api = Class.forName("net.irisshaders.iris.api.v0.IrisApi");
            Class<? extends Enum> program = (Class<? extends Enum>) Class.forName("net.irisshaders.iris.api.v0.IrisProgram");
            Object iris = api.getMethod("getInstance").invoke(null);
            java.lang.reflect.Method assign = api.getMethod("assignPipeline", RenderPipeline.class, program);
            Object[][] pairs = {{SKY_PIPELINE, "SKY_BASIC"}, {SOLID_PIPELINE, "BASIC"}, {GLOW_PIPELINE, "BASIC"}};
            for (Object[] pair : pairs) {
                try {
                    assign.invoke(iris, pair[0], Enum.valueOf(program, (String) pair[1]));
                    n++;
                } catch (Throwable one) {
                    org.slf4j.LoggerFactory.getLogger("entersift").warn("[Sift] Iris refused pipeline {}", ((RenderPipeline) pair[0]).getLocation(), one);
                }
            }
            org.slf4j.LoggerFactory.getLogger("entersift").info("[Sift] registered {} sky/rift pipelines with Iris", n);
        } catch (Throwable error) {
            org.slf4j.LoggerFactory.getLogger("entersift").warn("[Sift] Iris found but its pipeline API is unavailable; shader packs may draw the Sift sky oddly", error);
        }
        return n;
    }

    /** True while an Iris shader pack is active (false without Iris). */
    public static boolean shaderPackInUse() {
        if (!net.fabricmc.loader.api.FabricLoader.getInstance().isModLoaded("iris")) return false;
        try {
            Class<?> api = Class.forName("net.irisshaders.iris.api.v0.IrisApi");
            Object iris = api.getMethod("getInstance").invoke(null);
            return (Boolean) api.getMethod("isShaderPackInUse").invoke(iris);
        } catch (Throwable error) {
            return false;
        }
    }
}
