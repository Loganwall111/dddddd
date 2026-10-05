package dev.logan.beyondthreshold.mixin;

import dev.logan.beyondthreshold.client.BTTClientState;
import dev.logan.beyondthreshold.client.render.PostFxManager;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.render.GameRenderer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Mixin(GameRenderer.class)
public class GameRendererMixin {
	@Inject(method = "render(FJZ)V", at = @At("HEAD"))
	private void btt$managePostFx(float tickDelta, long startTime, boolean tick, CallbackInfo ci) {
		PostFxManager.onFrameStart(MinecraftClient.getInstance(), tickDelta);
	}

	/** Ant-size perception: shrink widens the FOV so the world looms huge. */
	@Inject(method = "getFov", at = @At("RETURN"))
	private void btt$shrinkFov(CallbackInfoReturnable<Double> cir) {
		if (BTTClientState.shrunk) {
			cir.setReturnValue(cir.getReturnValue() * 1.55);
		}
	}
}
