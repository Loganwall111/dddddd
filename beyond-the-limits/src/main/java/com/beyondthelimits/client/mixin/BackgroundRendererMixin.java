package com.beyondthelimits.client.mixin;

import com.beyondthelimits.client.ClientState;
import com.beyondthelimits.client.render.FogDirector;
import com.mojang.blaze3d.systems.RenderSystem;
import net.minecraft.client.render.BackgroundRenderer;
import net.minecraft.client.render.Camera;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Fog is the cheapest and most convincing lie in the game, so the mod leans on it hard: the Foglands'
 * ten-block visibility, the Codescape's grid haze, the bleeding world's black mist and the dementia
 * vignette are all this one injection.
 *
 * <p>It runs at the tail of vanilla's own fog calculation, so blindness, water and lava still work
 * exactly as they always did — the mod only ever gets closer, never clearer.</p>
 */
@Mixin(BackgroundRenderer.class)
public abstract class BackgroundRendererMixin {
	@Inject(method = "applyFog", at = @At("TAIL"))
	private static void btl$applyFog(Camera camera, BackgroundRenderer.FogType fogType, float viewDistance,
			boolean thickFog, float tickDelta, CallbackInfo info) {
		FogDirector.Modifier modifier = FogDirector.modifier(ClientState.reality());
		if (modifier == null) {
			return;
		}

		float start = modifier.start(viewDistance);
		float end = modifier.end(viewDistance);
		RenderSystem.setShaderFogStart(start);
		RenderSystem.setShaderFogEnd(Math.max(start + 0.25F, end));
		RenderSystem.setShaderFogColor(modifier.red(), modifier.green(), modifier.blue());
	}
}
