package com.beyondthelimits.client.render;

import com.beyondthelimits.client.ClientHooks;
import com.beyondthelimits.client.ClientState;
import com.beyondthelimits.client.shader.BtlShaders;
import com.beyondthelimits.network.BtlNetworking;
import com.mojang.blaze3d.systems.RenderSystem;
import net.fabricmc.fabric.api.client.rendering.v1.WorldRenderContext;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gl.ShaderProgram;
import org.joml.Matrix4f;

/**
 * The screen-space layer: glitches, washes, glares and the scanner's grid.
 *
 * <p>Two programs cover all of it. {@code screen_glitch} is a parametric distortion pass — the caller
 * picks a mode, the shader picks the pattern — and {@code scan} draws the Reality Scanner's grid and
 * sweep line. Both are drawn as camera-facing quads at the very end of the world pass, after translucency
 * and after the hand, so nothing in the world can draw over them.</p>
 *
 * <p>Effects are driven by what the server sent and are strictly additive to the game: if no packet has
 * arrived, this class draws nothing and the frame is byte-for-byte vanilla.</p>
 */
public final class PostEffects {
	private PostEffects() {
	}

	/** Local screen shake decay, driven by glitch and explosion modes. */
	private static float shake;
	private static float flash;
	private static float glitchBand;

	public static void tick() {
		if (shake > 0.0F) {
			shake = Math.max(0.0F, shake - 0.06F);
		}

		if (flash > 0.0F) {
			flash = Math.max(0.0F, flash - 0.08F);
		}

		// Bands are the horizontal tearing strips; they build up while an effect holds and snap when it ends.
		glitchBand = ClientState.hasEffect() ? Math.min(1.0F, glitchBand + 0.05F) : Math.max(0.0F, glitchBand - 0.15F);
	}

	public static void onFlash(float strength) {
		flash = Math.max(flash, Math.min(1.0F, strength));
	}

	public static void onShake(float strength) {
		shake = Math.max(shake, Math.min(1.0F, strength));
	}

	public static void render(WorldRenderContext context) {
		MinecraftClient client = MinecraftClient.getInstance();
		if (client == null || client.world == null) {
			return;
		}

		boolean glitch = ClientState.hasEffect() || flash > 0.0F || shake > 0.0F;
		boolean scanning = ClientHooks.scannerActive() || ClientHooks.lensActive();

		if (!glitch && !scanning) {
			return;
		}

		Matrix4f matrix = context.matrixStack().peek().getPositionMatrix();
		float tickDelta = context.tickCounter().getTickDelta(false);

		if (glitch) {
			ShaderProgram program = BtlShaders.glitchProgram();

			if (program != null) {
				OverlayRenderer.beginOverlayState();
				RenderSystem.setShader(() -> program);
				RenderSystem.setShaderTexture(0, BtlShaders.GLITCH_NOISE);
				OverlayRenderer.set(program, "Time", ClientState.ticks() + tickDelta);
				OverlayRenderer.set(program, "Mode", mode());
				OverlayRenderer.set(program, "Strength", Math.max(ClientState.effectStrength(), Math.max(flash, shake)));
				OverlayRenderer.set(program, "Reality", ClientState.reality() / 100.0F);
				OverlayRenderer.set(program, "Dementia", Math.min(1.0F, ClientState.dementia() / 2400.0F));
				OverlayRenderer.set(program, "Progress", ClientState.effectProgress());
				OverlayRenderer.set(program, "Band", glitchBand);
				OverlayRenderer.set(program, "Shake", shake);
				// Pulled slightly closer than the frame's own quad so it always wins the depth test.
				OverlayRenderer.drawFullscreenQuad(matrix, context.camera(), 1.2F, 1.0F + shake * 0.15F);
				OverlayRenderer.endOverlayState();
			}
		}

		if (scanning) {
			ShaderProgram program = BtlShaders.scanProgram();

			if (program != null) {
				float strength = Math.max(ClientHooks.scannerStrength(), ClientHooks.lensStrength());
				OverlayRenderer.beginOverlayState();
				RenderSystem.setShader(() -> program);
				OverlayRenderer.set(program, "Time", ClientState.ticks() + tickDelta);
				OverlayRenderer.set(program, "Strength", strength);
				OverlayRenderer.set(program, "Reality", ClientState.reality() / 100.0F);
				OverlayRenderer.set(program, "Mode", ClientHooks.lensActive() ? 1.0F : 0.0F);
				OverlayRenderer.drawFullscreenQuad(matrix, context.camera(), 1.0F, 1.0F);
				OverlayRenderer.endOverlayState();
			}
		}
	}

	private static float mode() {
		int effect = ClientState.effect();

		if (flash > 0.5F && !ClientState.hasEffect()) {
			return 9.0F;
		}

		return switch (effect) {
			case BtlNetworking.EFFECT_NOCLIP -> 1.0F;
			case BtlNetworking.EFFECT_RIFT_WASH -> 2.0F;
			case BtlNetworking.EFFECT_STORM -> 3.0F;
			case BtlNetworking.EFFECT_OBSERVER -> 4.0F;
			case BtlNetworking.EFFECT_BLACK_SUN -> 5.0F;
			case BtlNetworking.EFFECT_DEMENTIA_SPIKE -> 6.0F;
			case BtlNetworking.EFFECT_MIRROR -> 7.0F;
			case BtlNetworking.EFFECT_MEMORY -> 8.0F;
			case BtlNetworking.EFFECT_EVOLUTION -> 10.0F;
			default -> 0.0F;
		};
	}
}
