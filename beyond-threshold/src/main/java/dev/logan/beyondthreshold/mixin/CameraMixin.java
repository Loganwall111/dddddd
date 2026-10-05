package dev.logan.beyondthreshold.mixin;

import dev.logan.beyondthreshold.client.BTTClientState;
import net.minecraft.client.render.Camera;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(Camera.class)
public class CameraMixin {
	@Shadow
	private float yaw;
	@Shadow
	private float pitch;

	@Inject(method = "update", at = @At("RETURN"))
	private void btt$shake(CallbackInfo ci) {
		float s = BTTClientState.shake;
		if (s > 0.001F) {
			double t = System.nanoTime() * 1e-9;
			yaw += (float) (Math.sin(t * 61.7) * 0.9 + Math.sin(t * 23.3) * 0.5) * s;
			pitch += (float) (Math.cos(t * 47.1) * 0.8 + Math.sin(t * 31.7) * 0.4) * s;
		}
	}
}
