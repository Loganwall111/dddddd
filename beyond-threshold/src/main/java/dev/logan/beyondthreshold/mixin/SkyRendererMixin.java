package dev.logan.beyondthreshold.mixin;

import dev.logan.beyondthreshold.client.render.CosmicSkyRenderer;
import net.minecraft.client.render.SkyRenderer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(SkyRenderer.class)
public class SkyRendererMixin {
	@Inject(method = "render", at = @At("HEAD"), cancellable = true)
	private void btt$replaceSky(CallbackInfo ci) {
		if (CosmicSkyRenderer.shouldOverride()) {
			ci.cancel();
		}
	}
}
