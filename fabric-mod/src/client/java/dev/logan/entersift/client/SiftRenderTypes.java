package dev.logan.entersift.client;

import com.mojang.renderpearl.api.pipeline.BlendFunction;
import com.mojang.renderpearl.api.pipeline.ColorTargetState;
import com.mojang.renderpearl.api.pipeline.CompareOp;
import com.mojang.renderpearl.api.pipeline.DepthStencilState;
import com.mojang.renderpearl.api.pipeline.PrimitiveTopology;
import com.mojang.blaze3d.vertex.DefaultVertexFormat;
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
 *   SKY:       opaque Sift gradient dome (Iris can treat it as sky).
 *   SKY_BLEND: translucent sky ribbons and accents; no depth write.
 *   SOLID:     opaque rift side walls, writes depth (reverse-Z, so GEQUAL means "nearer or equal").
 *   GLASS/RIFT: translucent filled membrane and fragment geometry, depth-tested without a depth write.
 *   GLOW:      additive rim/sparks, depth-tested but never writes depth.
 *
 * 0.12 Iris compatibility: with a shader pack active Iris swaps every pipeline for a pack program
 * it knows about. Pipelines it does not know are drawn with the vanilla shader into the pack's
 * G-buffers ("Missing program ... could lead to weird rendering"), which is what broke the Sift sky
 * under the Dungeons II pack. {@link #registerWithIris()} assigns our pipelines through the public
 * Iris API (reflection, so Iris stays optional): SKY/SKY_BLEND -> sky programs and SOLID/GLOW/GLASS ->
 * gbuffers_basic. Iris also flips the reverse-Z compare ops for us, so the depth states stay valid.
 *
 * 0.18.2: the GLSL rift pipelines (RIFT, RIFT_WALL, RIFT_GLOW, TUNNEL) are deliberately NOT
 * assigned. An unassigned pipeline keeps its own compiled shader under a shader pack. The filled,
 * translucent membrane, faceted shell and restrained rim therefore stay consistent across packs; the
 * rift shaders also write colortex1/colortex2 masks so the pack composite does not re-shade them.
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

    /** 0.13 Overworld voxel clouds: normal alpha blend (the far edge fades out), writes depth, no fog term. */
    public static final RenderPipeline CLOUD_PIPELINE = RenderPipelines.register(
        RenderPipeline.builder(RenderPipelines.DEBUG_FILLED_SNIPPET)
            .withLocation(SiftContent.id("pipeline/sift_clouds"))
            .withColorTargetState(new ColorTargetState(BlendFunction.TRANSLUCENT))
            .withDepthStencilState(new DepthStencilState(CompareOp.GREATER_THAN_OR_EQUAL, true))
            .withCull(false)
            .build());

    /**
     * GPU rift interior: our own core shader (assets/entersift/shaders/core/rift.vsh/.fsh).
     * Vertex colour carries face UVs and style; the filled pastel material alpha-blends without writing
     * depth, so terrain stays subtly visible through the animated membrane.
     */
    public static final RenderPipeline RIFT_PIPELINE = RenderPipelines.register(
        RenderPipeline.builder(RenderPipelines.MATRICES_FOG_SNIPPET)
            .withLocation(SiftContent.id("pipeline/rift"))
            .withVertexShader(SiftContent.id("core/rift"))
            .withFragmentShader(SiftContent.id("core/rift"))
            .withVertexBinding(0, DefaultVertexFormat.POSITION_COLOR)
            .withPrimitiveTopology(PrimitiveTopology.QUADS)
            .withColorTargetState(new ColorTargetState(BlendFunction.TRANSLUCENT))
            .withDepthStencilState(new DepthStencilState(CompareOp.GREATER_THAN_OR_EQUAL, false))
            .withCull(false)
            .build());

    /** 0.18 rift walls: opaque, depth-writing sides use the same shader's RIFT_WALL variant. */
    public static final RenderPipeline RIFT_WALL_PIPELINE = RenderPipelines.register(riftVariant("rift_wall", "RIFT_WALL")
            .withColorTargetState(ColorTargetState.DEFAULT)
            .withDepthStencilState(new DepthStencilState(CompareOp.GREATER_THAN_OR_EQUAL, true))
            .build());

    /** 0.18 rim glow and sparks: RIFT_GLOW, additive, depth-tested, no depth write. */
    public static final RenderPipeline RIFT_GLOW_PIPELINE = RenderPipelines.register(riftVariant("rift_glow", "RIFT_GLOW")
            .withColorTargetState(new ColorTargetState(BlendFunction.LIGHTNING))
            .withDepthStencilState(new DepthStencilState(CompareOp.GREATER_THAN_OR_EQUAL, false))
            .build());

    /** 0.18 warp tunnel sphere around the camera inside the rift tunnel (core/tunnel). Always behind everything. */
    public static final RenderPipeline TUNNEL_PIPELINE = RenderPipelines.register(
        RenderPipeline.builder(RenderPipelines.MATRICES_FOG_SNIPPET)
            .withLocation(SiftContent.id("pipeline/tunnel"))
            .withVertexShader(SiftContent.id("core/tunnel"))
            .withFragmentShader(SiftContent.id("core/tunnel"))
            .withVertexBinding(0, DefaultVertexFormat.POSITION_COLOR)
            .withPrimitiveTopology(PrimitiveTopology.QUADS)
            .withColorTargetState(ColorTargetState.DEFAULT)
            .withDepthStencilState(new DepthStencilState(CompareOp.GREATER_THAN_OR_EQUAL, false))
            .withCull(false)
            .build());

    private static RenderPipeline.Builder riftVariant(String name, String define) {
        return RenderPipeline.builder(RenderPipelines.MATRICES_FOG_SNIPPET)
            .withLocation(SiftContent.id("pipeline/" + name))
            .withVertexShader(SiftContent.id("core/rift"))
            .withFragmentShader(SiftContent.id("core/rift"))
            .withShaderDefine(define)
            .withVertexBinding(0, DefaultVertexFormat.POSITION_COLOR)
            .withPrimitiveTopology(PrimitiveTopology.QUADS)
            .withCull(false);
    }

    public static final RenderType RIFT = RenderType.create("entersift_rift", RenderSetup.builder(RIFT_PIPELINE).createRenderSetup());
    public static final RenderType RIFT_WALL = RenderType.create("entersift_rift_wall", RenderSetup.builder(RIFT_WALL_PIPELINE).createRenderSetup());
    public static final RenderType RIFT_GLOW = RenderType.create("entersift_rift_glow", RenderSetup.builder(RIFT_GLOW_PIPELINE).createRenderSetup());
    public static final RenderType TUNNEL = RenderType.create("entersift_tunnel", RenderSetup.builder(TUNNEL_PIPELINE).createRenderSetup());

    /** Translucent Sift sky ribbons and accents; normal alpha blend, no depth write. */
    public static final RenderPipeline SKY_BLEND_PIPELINE = RenderPipelines.register(
        RenderPipeline.builder(RenderPipelines.DEBUG_FILLED_SNIPPET)
            .withLocation(SiftContent.id("pipeline/sift_sky_blend"))
            .withColorTargetState(new ColorTargetState(BlendFunction.TRANSLUCENT))
            .withDepthStencilState(new DepthStencilState(CompareOp.GREATER_THAN_OR_EQUAL, false))
            .withCull(false)
            .build());
    public static final RenderType SKY_BLEND = RenderType.create("entersift_sky_blend", RenderSetup.builder(SKY_BLEND_PIPELINE).createRenderSetup());

    /** CPU-coloured translucent geometry: rift interior fallback and filled fragments, depth-tested without a write. */
    public static final RenderPipeline GLASS_PIPELINE = RenderPipelines.register(
        RenderPipeline.builder(RenderPipelines.DEBUG_FILLED_SNIPPET)
            .withLocation(SiftContent.id("pipeline/rift_glass"))
            .withColorTargetState(new ColorTargetState(BlendFunction.TRANSLUCENT))
            .withDepthStencilState(new DepthStencilState(CompareOp.GREATER_THAN_OR_EQUAL, false))
            .withCull(false)
            .build());
    public static final RenderType GLASS = RenderType.create("entersift_glass", RenderSetup.builder(GLASS_PIPELINE).createRenderSetup());

    public static final RenderType SKY = RenderType.create("entersift_sky", RenderSetup.builder(SKY_PIPELINE).createRenderSetup());
    public static final RenderType SOLID = RenderType.create("entersift_solid", RenderSetup.builder(SOLID_PIPELINE).createRenderSetup());
    public static final RenderType GLOW = RenderType.create("entersift_glow", RenderSetup.builder(GLOW_PIPELINE).createRenderSetup());
    public static final RenderType CLOUDS = RenderType.create("entersift_clouds", RenderSetup.builder(CLOUD_PIPELINE).createRenderSetup());

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
            Object[][] pairs = {{SKY_PIPELINE, "SKY_BASIC"}, {SOLID_PIPELINE, "BASIC"}, {GLOW_PIPELINE, "BASIC"}, {CLOUD_PIPELINE, "BASIC"}, {SKY_BLEND_PIPELINE, "SKY_BASIC"}, {GLASS_PIPELINE, "BASIC"}};
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

    private static java.lang.reflect.Method shadowPassMethod;
    private static Object irisApi;
    private static boolean shadowPassProbed;

    /**
     * 0.18.2: true while Iris renders its shadow map. The GPU rift pipelines are intentionally left
     * unassigned (Iris then draws them with our own rift shader instead of a pack program), so during
     * the shadow pass they would paint rift colours into the shadow map; the renderers skip that pass.
     */
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

    private static long packCheckedAt;
    private static boolean packCached;

    /** 0.17: {@link #shaderPackInUse()} re-checked at most every 500 ms (it uses reflection; rifts ask every frame). */
    public static boolean shaderPackInUseCached() {
        long now = System.currentTimeMillis();
        if (now - packCheckedAt > 500) { packCached = shaderPackInUse(); packCheckedAt = now; }
        return packCached;
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
