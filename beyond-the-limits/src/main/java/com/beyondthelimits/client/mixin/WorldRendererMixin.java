package com.beyondthelimits.client.mixin;

import com.beyondthelimits.client.ClientState;
import com.beyondthelimits.client.render.SkyRenderer;
import net.minecraft.client.render.Camera;
import net.minecraft.client.render.WorldRenderer;
import org.joml.Matrix4f;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Takes over the sky whenever the mod has something to say about it.
 *
 * <p>Vanilla's sky is not deleted — it is only skipped while a mod sky event is running, and the mod's
 * sky pass renders it itself when it wants the real sky to show through. That is what makes events like
 * "the sky is fake" possible: the cracks are drawn over the genuine sky, and when the crack closes there
 * was never a moment where the world had no sky at all.</p>
 */
@Mixin(WorldRenderer.class)
public abstract class WorldRendererMixin implements SkyRenderingMixinAccess {
	@Inject(method = "renderSky", at = @At("HEAD"), cancellable = true)
	private void btl$renderSky(Matrix4f positionMatrix, Matrix4f projectionMatrix, float tickDelta, Camera camera,
			boolean thickFog, Runnable fogCallback, CallbackInfo info) {
		if (SkyRenderer.shouldReplaceSky(camera, thickFog)) {
			SkyRenderer.render(positionMatrix, projectionMatrix, tickDelta, camera, thickFog, fogCallback,
					(BtlSkyRenderer) this);
			info.cancel();
		}
	}

	/** Sky events end by fading the mod's sky out; while it fades, vanilla draws on top of it. */
	@Inject(method = "renderSky", at = @At("TAIL"))
	private void btl$drawSkyOverlay(Matrix4f positionMatrix, Matrix4f projectionMatrix, float tickDelta,
			Camera camera, boolean thickFog, Runnable fogCallback, CallbackInfo info) {
		if (!SkyRenderer.shouldReplaceSky(camera, thickFog)) {
			SkyRenderer.renderOverlay(positionMatrix, projectionMatrix, tickDelta, camera);
		}
	}
}
