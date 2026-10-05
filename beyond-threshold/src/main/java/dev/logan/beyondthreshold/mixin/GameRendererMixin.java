package dev.logan.beyondthreshold.mixin;

import dev.logan.beyondthreshold.client.render.PostFxManager;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.render.GameRenderer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(GameRenderer.class)
public class GameRendererMixin {
	@Inject(method = "render(FJZ)V", at = @At("HEAD"))
	private void btt$managePostFx(float tickDelta, long startTime, boolean tick, CallbackInfo ci) {
		PostFxManager.onFrameStart(MinecraftClient.getInstance(), tickDelta);
	}
}
