package com.beyondthelimits.client.render;

import com.beyondthelimits.client.ClientState;
import com.beyondthelimits.client.shader.BtlShaders;
import com.beyondthelimits.network.BtlNetworking;
import com.beyondthelimits.registry.BtlDimensions;
import com.mojang.blaze3d.systems.RenderSystem;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gl.ShaderProgram;
import net.minecraft.client.gl.Uniform;
import net.minecraft.client.render.BufferBuilder;
import net.minecraft.client.render.BufferRenderer;
import net.minecraft.client.render.Camera;
import net.minecraft.client.render.Tessellator;
import net.minecraft.client.render.VertexFormat;
import net.minecraft.client.render.VertexFormats;
import net.minecraft.registry.RegistryKey;
import net.minecraft.world.World;
import org.joml.Matrix4f;

/**
 * The mod's sky.
 *
 * <p>Vanilla draws a sky with a handful of flat colour quads. This draws a single full-screen quad whose
 * fragment shader <em>is</em> the sky: a procedural star field, layered volumetric clouds, a sun and moon,
 * a horizon gradient and — the part that matters — a lensing field. Because the sky is generated rather
 * than textured, the shader can bend its own sampling coordinates around any point, which is how the mod
 * gets gravitational lensing that actually distorts the stars around a rift instead of pasting a ring on
 * top of them.</p>
 *
 * <p>Nothing here runs while the world is normal: {@link #shouldReplaceSky} returns false, vanilla draws,
 * and the mod costs nothing. When an event starts, the sky is rendered by this class and vanilla's sky is
 * available on demand through {@link BtlSkyRenderer} — so cracks can reveal the real sky without it ever
 * having to be re-rendered from scratch.</p>
 */
public final class SkyRenderer {
	private SkyRenderer() {
	}

	/**
	 * Sky mode fed to the shader. These numbers are a contract with {@code sky_warp.fsh}: events
	 * occupy 1-5 and dimensions occupy 6-11, so no dimension can ever be mistaken for an event.
	 */
	private static final int MODE_CRACK = 1;
	private static final int MODE_STORM = 2;
	private static final int MODE_BLACK_SUN = 3;
	private static final int MODE_COLLISION = 4;
	private static final int MODE_IMPOSSIBLE = 5;
	private static final int MODE_FOGLANDS = 6;
	private static final int MODE_CODESCAPE = 7;
	private static final int MODE_BACKROOMS = 8;
	private static final int MODE_MIRROR = 9;
	private static final int MODE_SUBSTRATA = 10;
	private static final int MODE_WRONGWORLD = 11;

	// ---- animation state -------------------------------------------------------------------------

	private static float lightningFlash;
	private static float lastFlashTime;
	private static float crackSpawnTime;

	/** Called every client tick; keeps the sky's internal timers in sync with real time. */
	public static void tick() {
		MinecraftClient client = MinecraftClient.getInstance();

		if (lightningFlash > 0.0F) {
			lightningFlash = Math.max(0.0F, lightningFlash - 0.12F);
		}

		// Storms flash on their own schedule so the sky keeps moving even when nothing else happens.
		if (client != null && client.world != null && ClientState.skyEvent() == BtlNetworking.SKY_EVENT_STORM) {
			float time = client.world.getTime();

			if (time - lastFlashTime > 40.0F && client.world.random.nextFloat() < 0.05F) {
				lastFlashTime = time;
				lightningFlash = 0.9F;
			}
		}

		if (ClientState.skyEvent() == BtlNetworking.SKY_EVENT_CRACK && crackSpawnTime == 0.0F) {
			crackSpawnTime = ClientState.ticks();
		}
	}

	/** A manual flash, used by storms and by the black sun's arrival. */
	public static void flash(float strength) {
		lightningFlash = Math.max(lightningFlash, strength);
	}

	// ---- decision --------------------------------------------------------------------------------

	/** True when the mod's sky should be drawn instead of vanilla's. */
	public static boolean shouldReplaceSky(Camera camera, boolean thickFog) {
		MinecraftClient client = MinecraftClient.getInstance();
		if (client == null || client.world == null || camera == null) {
			return false;
		}

		// If a resource reload or another shader pack prevents our core program from loading, leave
		// vanilla in charge instead of cancelling its sky pass and showing a blank frame.
		if (BtlShaders.skyWarpProgram() == null) {
			return false;
		}

		if (ClientState.skyIsActive()) {
			return true;
		}

		// The sky-only dimensions are always the mod's sky: there is no terrain to look at, so the sky
		// is the entire world.
		return skyOnly(client.world.getRegistryKey());
	}

	/** Dimensions whose sky is the whole dimension: void under a painted sky. */
	public static boolean skyOnly(RegistryKey<World> key) {
		return key == BtlDimensions.THE_IMPOSSIBLE;
	}

	// ---- rendering -------------------------------------------------------------------------------

	public static void render(Matrix4f positionMatrix, Matrix4f projectionMatrix, float tickDelta, Camera camera,
			boolean thickFog, Runnable fogCallback, BtlSkyRenderer vanilla) {
		MinecraftClient client = MinecraftClient.getInstance();
		if (client == null || client.world == null) {
			return;
		}

		boolean skyOnly = skyOnly(client.world.getRegistryKey());

		// Cracks and the collision event show the *real* sky through the gaps; everything else puts the
		// real sky underneath only when it is fading in or out, so there is never a black frame.
		int mode = mode(client);
		float intensity = ClientState.skyIsActive() ? ClientState.skyIntensity() : 1.0F;
		boolean vanillaUnderneath = !skyOnly
				&& (mode == MODE_CRACK || ClientState.skyWeight() < 0.85F);

		if (vanillaUnderneath) {
			vanilla.btl$renderVanillaSky(positionMatrix, projectionMatrix, tickDelta, camera, thickFog, fogCallback);
		}

		drawSky(client, mode, skyOnly ? 1.0F : intensity, tickDelta);
	}

	/** Drawn when vanilla's sky is in charge but the mod still has something to add: haze, glare, a rim. */
	public static void renderOverlay(Matrix4f positionMatrix, Matrix4f projectionMatrix, float tickDelta,
			Camera camera) {
		MinecraftClient client = MinecraftClient.getInstance();
		if (client == null || client.world == null || !ClientState.skyIsActive()) {
			return;
		}

		float weight = ClientState.skyWeight();
		if (weight <= 0.0F) {
			return;
		}

		drawSky(client, mode(client), weight, tickDelta);
	}

	private static int mode(MinecraftClient client) {
		if (skyOnly(client.world.getRegistryKey())) {
			return MODE_IMPOSSIBLE;
		}

		return switch (ClientState.skyEvent()) {
			case BtlNetworking.SKY_EVENT_CRACK -> MODE_CRACK;
			case BtlNetworking.SKY_EVENT_STORM -> MODE_STORM;
			case BtlNetworking.SKY_EVENT_BLACK_SUN -> MODE_BLACK_SUN;
			case BtlNetworking.SKY_EVENT_COLLISION -> MODE_COLLISION;
			case BtlNetworking.SKY_EVENT_IMPOSSIBLE -> MODE_IMPOSSIBLE;
			default -> dimensionMode(client.world.getRegistryKey());
		};
	}

	private static int dimensionMode(RegistryKey<World> key) {
		if (key == BtlDimensions.FOGLANDS) {
			return MODE_FOGLANDS;
		}

		if (key == BtlDimensions.CODESCAPE) {
			return MODE_CODESCAPE;
		}

		if (key == BtlDimensions.BACKROOMS) {
			return MODE_BACKROOMS;
		}

		if (key == BtlDimensions.MIRRORWORLD) {
			return MODE_MIRROR;
		}

		if (key == BtlDimensions.SUBSTRATA) {
			return MODE_SUBSTRATA;
		}

		if (key == BtlDimensions.WRONGWORLD) {
			return MODE_WRONGWORLD;
		}

		return 0;
	}

	/**
	 * The one draw call. Everything the shader needs — camera orientation, field of view, the world's
	 * reality, the event mode and a set of event-specific parameters — goes in as uniforms, so the quad
	 * itself never changes and never has to be rebuilt.
	 */
	private static void drawSky(MinecraftClient client, int mode, float intensity, float tickDelta) {
		ShaderProgram program = BtlShaders.skyWarpProgram();
		if (program == null) {
			return;
		}

		Camera camera = client.gameRenderer.getCamera();
		double fov = client.options.getFov().getValue();
		float aspect = (float) client.getWindow().getFramebufferWidth()
				/ Math.max(1.0F, (float) client.getWindow().getFramebufferHeight());

		RenderSystem.disableDepthTest();
		RenderSystem.depthMask(false);
		RenderSystem.disableCull();
		RenderSystem.enableBlend();
		RenderSystem.defaultBlendFunc();
		RenderSystem.setShader(() -> program);
		// The shader samples its own noise field; binding it here keeps the render layer free of a
		// texture phase, so the same layer works whatever a resource pack does.
		RenderSystem.setShaderTexture(0, BtlShaders.SKY_NOISE);

		set(program, "Time", ClientState.ticks() + tickDelta);
		set(program, "Mode", (float) mode);
		set(program, "Intensity", intensity);
		set(program, "Reality", ClientState.reality() / 100.0F);
		set(program, "Aspect", aspect);
		set(program, "Fov", (float) fov);
		set(program, "CamYaw", camera.getYaw());
		set(program, "CamPitch", camera.getPitch());
		set(program, "Flash", lightningFlash);
		set(program, "SkyOnly", skyOnly(client.world.getRegistryKey()) ? 1.0F : 0.0F);

		BufferBuilder buffer = Tessellator.getInstance().begin(VertexFormat.DrawMode.QUADS,
				VertexFormats.POSITION_TEXTURE_COLOR);
		// A huge quad far behind everything. Depth testing is off, so its size only has to be big enough
		// to cover the frustum at any field of view the game allows (up to 110°) — 2048 blocks does that
		// with several times the margin.
		float extent = 2048.0F;
		int white = 0xFFFFFFFF;
		buffer.vertex(-extent, -extent, -extent).texture(0.0F, 0.0F).color(white);
		buffer.vertex(-extent, extent, -extent).texture(0.0F, 1.0F).color(white);
		buffer.vertex(extent, extent, -extent).texture(1.0F, 1.0F).color(white);
		buffer.vertex(extent, -extent, -extent).texture(1.0F, 0.0F).color(white);
		BufferRenderer.drawWithGlobalProgram(buffer.end());

		RenderSystem.depthMask(true);
		RenderSystem.enableDepthTest();
		RenderSystem.enableCull();
		RenderSystem.disableBlend();
	}

	private static void set(ShaderProgram program, String name, float value) {
		Uniform uniform = program.getUniformOrDefault(name);
		uniform.set(value);
	}
}
