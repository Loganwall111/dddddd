package dev.logan.riftext.client;

import com.mojang.renderpearl.api.pipeline.BlendFunction;
import com.mojang.renderpearl.api.pipeline.ColorTargetState;
import com.mojang.renderpearl.api.pipeline.CompareOp;
import com.mojang.renderpearl.api.pipeline.DepthStencilState;
import com.mojang.renderpearl.api.pipeline.PrimitiveTopology;
import com.mojang.blaze3d.vertex.DefaultVertexFormat;
import com.mojang.renderpearl.api.pipeline.RenderPipeline;
import dev.logan.riftext.RiftContent;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.client.renderer.rendertype.RenderSetup;
import net.minecraft.client.renderer.rendertype.RenderType;

/**
 * Render types for the Rift Extension mod's sky and rifts (position + colour, no fog, no texture).
 *
 * <p>Pipeline variants:</p>
 * <ul>
 *   <li>SOLID — opaque rift walls, writes depth (reverse-Z, GEQUAL = nearer or equal)</li>
 *   <li>GLOW — additive (lightning blend), depth-tested but never writes depth</li>
 *   <li>RIFT — GPU rift interior: custom core shader for destination sky sampling</li>
 *   <li>RIFT_WALL — rift shader with RIFT_WALL define (vertex colour + pulse), opaque</li>
 *   <li>RIFT_GLOW — rim glow and sparks, additive, depth-tested, no depth write</li>
 * </ul>
 */
public final class SiftRenderTypes {
    private SiftRenderTypes() {}

    public static final RenderPipeline SOLID_PIPELINE = RenderPipelines.register(
        RenderPipeline.builder(RenderPipelines.DEBUG_FILLED_SNIPPET)
            .withLocation(RiftContent.id("pipeline/riftext_solid"))
            .withColorTargetState(ColorTargetState.DEFAULT)
            .withDepthStencilState(new DepthStencilState(CompareOp.GREATER_THAN_OR_EQUAL, true))
            .withCull(false)
            .build());

    public static final RenderPipeline GLOW_PIPELINE = RenderPipelines.register(
        RenderPipeline.builder(RenderPipelines.DEBUG_FILLED_SNIPPET)
            .withLocation(RiftContent.id("pipeline/riftext_glow"))
            .withColorTargetState(new ColorTargetState(BlendFunction.LIGHTNING))
            .withDepthStencilState(new DepthStencilState(CompareOp.GREATER_THAN_OR_EQUAL, false))
            .withCull(false)
            .build());

    public static final RenderPipeline RIFT_PIPELINE = RenderPipelines.register(
        RenderPipeline.builder(RenderPipelines.MATRICES_FOG_SNIPPET)
            .withLocation(RiftContent.id("pipeline/rift"))
            .withVertexShader(RiftContent.id("core/rift"))
            .withFragmentShader(RiftContent.id("core/rift"))
            .withVertexBinding(0, DefaultVertexFormat.POSITION_COLOR)
            .withPrimitiveTopology(PrimitiveTopology.QUADS)
            .withColorTargetState(ColorTargetState.DEFAULT)
            .withDepthStencilState(new DepthStencilState(CompareOp.GREATER_THAN_OR_EQUAL, true))
            .withCull(false)
            .build());

    public static final RenderPipeline RIFT_WALL_PIPELINE = RenderPipelines.register(riftVariant("rift_wall", "RIFT_WALL")
            .withColorTargetState(ColorTargetState.DEFAULT)
            .withDepthStencilState(new DepthStencilState(CompareOp.GREATER_THAN_OR_EQUAL, true))
            .build());

    public static final RenderPipeline RIFT_GLOW_PIPELINE = RenderPipelines.register(riftVariant("rift_glow", "RIFT_GLOW")
            .withColorTargetState(new ColorTargetState(BlendFunction.LIGHTNING))
            .withDepthStencilState(new DepthStencilState(CompareOp.GREATER_THAN_OR_EQUAL, false))
            .build());

    private static RenderPipeline.Builder riftVariant(String name, String define) {
        return RenderPipeline.builder(RenderPipelines.MATRICES_FOG_SNIPPET)
            .withLocation(RiftContent.id("pipeline/" + name))
            .withVertexShader(RiftContent.id("core/rift"))
            .withFragmentShader(RiftContent.id("core/rift"))
            .withShaderDefine(define)
            .withVertexBinding(0, DefaultVertexFormat.POSITION_COLOR)
            .withPrimitiveTopology(PrimitiveTopology.QUADS)
            .withCull(false);
    }

    public static final RenderType RIFT = RenderType.create("riftextension_rift", RenderSetup.builder(RIFT_PIPELINE).createRenderSetup());
    public static final RenderType RIFT_WALL = RenderType.create("riftextension_rift_wall", RenderSetup.builder(RIFT_WALL_PIPELINE).createRenderSetup());
    public static final RenderType RIFT_GLOW = RenderType.create("riftextension_rift_glow", RenderSetup.builder(RIFT_GLOW_PIPELINE).createRenderSetup());
    public static final RenderType SOLID = RenderType.create("riftextension_solid", RenderSetup.builder(SOLID_PIPELINE).createRenderSetup());
    public static final RenderType GLOW = RenderType.create("riftextension_glow", RenderSetup.builder(GLOW_PIPELINE).createRenderSetup());

    /** Forces class loading (pipeline registration) during client init. */
    public static void initialize() {}

    private static boolean irisDone;

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
            Object[][] pairs = {{SOLID_PIPELINE, "BASIC_COLOR"}, {GLOW_PIPELINE, "BASIC_COLOR"}};
            for (Object[] pair : pairs) {
                try {
                    assign.invoke(iris, pair[0], Enum.valueOf(program, (String) pair[1]));
                    n++;
                } catch (Throwable one) {
                    org.slf4j.LoggerFactory.getLogger("riftextension").warn("[RiftExt] Iris refused pipeline {}", ((RenderPipeline) pair[0]).getLocation(), one);
                }
            }
            org.slf4j.LoggerFactory.getLogger("riftextension").info("[RiftExt] registered {} pipelines with Iris", n);
        } catch (Throwable error) {
            org.slf4j.LoggerFactory.getLogger("riftextension").warn("[RiftExt] Iris found but its pipeline API is unavailable", error);
        }
        return n;
    }

    private static java.lang.reflect.Method shadowPassMethod;
    private static Object irisApi;
    private static boolean shadowPassProbed;

    public static boolean irisShadowPass() {
        if (!shadowPassProbed) {
            shadowPassProbed = true;
            if (net.fabricmc.loader.api.FabricLoader.getInstance().isModLoaded("iris")) {
                try {
                    Class<?> api = Class.forName("net.irisshaders.iris.api.v0.IrisApi");
                    irisApi = api.getMethod("getInstance").invoke(null);
                    shadowPassMethod = api.getMethod("isRenderingShadowPass");
                } catch (Throwable error) {
                    shadowPassMethod = null;
                }
            }
        }
        if (shadowPassMethod == null) return false;
        try {
            return (Boolean) shadowPassMethod.invoke(irisApi);
        } catch (Throwable error) {
            return false;
        }
    }
}