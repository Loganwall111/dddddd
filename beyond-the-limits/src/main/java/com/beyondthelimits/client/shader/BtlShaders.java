package com.beyondthelimits.client.shader;

import com.beyondthelimits.BeyondTheLimits;
import java.io.IOException;
import java.util.function.Consumer;
import net.fabricmc.fabric.api.client.rendering.v1.CoreShaderRegistrationCallback;
import net.minecraft.client.gl.ShaderProgram;
import net.minecraft.client.render.RenderLayer;
import net.minecraft.client.render.RenderPhase;
import net.minecraft.client.render.VertexFormat;
import net.minecraft.client.render.VertexFormats;
import net.minecraft.util.Identifier;

/**
 * The mod's own GLSL programs, and the render layers built out of them.
 *
 * <p>Four programs do the heavy lifting:</p>
 *
 * <ul>
 *     <li>{@code rift} — the tear itself. It reads a noise field from the shader's own uniforms, warps
 *     the texture coordinates by it, and fades to transparent at the rim, which is what makes a rift
 *     look like a hole in the world rather than a very clean billboard;</li>
 *     <li>{@code sky_warp} — gravitational lensing. Samples a radial displacement from the centre of
 *     screen and pulls the sky toward it;</li>
 *     <li>{@code screen_glitch} — the dementia/glitch overlay: block displacement, channel shift and
 *     scanline noise, all driven by the world's reality value;</li>
 *     <li>{@code scan} — the scanner/lens tint. Cheap on purpose: it is always running.</li>
 * </ul>
 *
 * <p>Every program here is registered through Fabric's core shader API, so it works in any modpack
 * without a resource pack, and the shader source ships inside the jar.</p>
 */
public final class BtlShaders {
	private BtlShaders() {
	}

	public static final Identifier RIFT_ID = BeyondTheLimits.id("core/rift");
	public static final Identifier SKY_WARP_ID = BeyondTheLimits.id("core/sky_warp");
	public static final Identifier GLITCH_ID = BeyondTheLimits.id("core/screen_glitch");
	public static final Identifier SCAN_ID = BeyondTheLimits.id("core/scan");

	/** Procedural noise fields the shaders sample, shipped as textures so they cost nothing to build. */
	public static final Identifier RIFT_NOISE = BeyondTheLimits.id("textures/effect/rift_noise.png");
	public static final Identifier SKY_NOISE = BeyondTheLimits.id("textures/effect/sky_noise.png");
	public static final Identifier GLITCH_NOISE = BeyondTheLimits.id("textures/effect/glitch_noise.png");

	private static ShaderProgram rift;
	private static ShaderProgram skyWarp;
	private static ShaderProgram glitch;
	private static ShaderProgram scan;

	private static RenderLayer riftLayer;
	private static RenderLayer additiveLayer;

	/** Registered from the client initialiser; the callback fires once the GL context exists. */
	public static void register() {
		CoreShaderRegistrationCallback.EVENT.register(context -> {
			context.register(RIFT_ID, VertexFormats.POSITION_TEXTURE_COLOR, assign(program -> rift = program));
			context.register(SKY_WARP_ID, VertexFormats.POSITION_TEXTURE_COLOR, assign(program -> skyWarp = program));
			context.register(GLITCH_ID, VertexFormats.POSITION_TEXTURE_COLOR, assign(program -> glitch = program));
			context.register(SCAN_ID, VertexFormats.POSITION_TEXTURE_COLOR, assign(program -> scan = program));

			riftLayer = null;
			additiveLayer = null;
		});
	}

	private static Consumer<ShaderProgram> assign(java.util.function.Consumer<ShaderProgram> consumer) {
		return consumer;
	}

	/** Transparent, culling off, full colour: the rift quad. */
	public static RenderLayer riftLayer() {
		if (riftLayer == null) {
			riftLayer = RenderLayer.of("beyondthelimits_rift", VertexFormats.POSITION_TEXTURE_COLOR,
					VertexFormat.DrawMode.QUADS, 1536, false, true,
					RenderLayer.MultiPhaseParameters.builder()
							.program(new RenderPhase.ShaderProgram(BtlShaders::riftProgram))
							.transparency(RenderPhase.TRANSLUCENT_TRANSPARENCY)
							.depthTest(RenderPhase.LEQUAL_DEPTH_TEST)
							.cull(RenderPhase.DISABLE_CULLING)
							.lightmap(RenderPhase.DISABLE_LIGHTMAP)
							.overlay(RenderPhase.DISABLE_OVERLAY_COLOR)
							.writeMaskState(RenderPhase.COLOR_MASK)
							.build(false));
		}

		return riftLayer;
	}

	/** Additive, no depth write: the parts of a rift that should look like light rather than matter. */
	public static RenderLayer additiveLayer() {
		if (additiveLayer == null) {
			additiveLayer = RenderLayer.of("beyondthelimits_additive", VertexFormats.POSITION_TEXTURE_COLOR,
					VertexFormat.DrawMode.QUADS, 1536, false, true,
					RenderLayer.MultiPhaseParameters.builder()
							.program(new RenderPhase.ShaderProgram(BtlShaders::riftProgram))
							.transparency(RenderPhase.ADDITIVE_TRANSPARENCY)
							.depthTest(RenderPhase.LEQUAL_DEPTH_TEST)
							.cull(RenderPhase.DISABLE_CULLING)
							.lightmap(RenderPhase.DISABLE_LIGHTMAP)
							.overlay(RenderPhase.DISABLE_OVERLAY_COLOR)
							.writeMaskState(RenderPhase.COLOR_MASK)
							.build(false));
		}

		return additiveLayer;
	}

	public static ShaderProgram riftProgram() {
		return rift;
	}

	public static ShaderProgram skyWarpProgram() {
		return skyWarp;
	}

	public static ShaderProgram glitchProgram() {
		return glitch;
	}

	public static ShaderProgram scanProgram() {
		return scan;
	}

	/** True once the GL programs exist; the renderers fall back to vanilla layers until then. */
	public static boolean ready() {
		return rift != null;
	}

	/** Throws rather than rendering a broken layer, so failures are obvious in a crash report. */
	public static void requireReady() throws IOException {
		if (!ready()) {
			throw new IOException("beyondthelimits: core shaders not loaded yet");
		}
	}
}
