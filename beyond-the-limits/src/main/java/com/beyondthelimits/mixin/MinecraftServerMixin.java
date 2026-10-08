package com.beyondthelimits.mixin;

import com.beyondthelimits.core.BtlState;
import com.beyondthelimits.util.BtlSafe;
import net.minecraft.server.MinecraftServer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Saves the world's reality state on shutdown.
 *
 * <p>The state is also written periodically, but a clean shutdown is the one moment where it is cheap
 * to be certain: the player who quits at 3% reality should find exactly 3% reality when they come
 * back, down to the number of rifts they left open.</p>
 *
 * <p>The injector is declared with {@code require = 0}: if a future Minecraft version renames this
 * method the mod loses the save-on-shutdown optimisation rather than refusing to start.</p>
 */
@Mixin(MinecraftServer.class)
public class MinecraftServerMixin {
	@Inject(method = "shutdown()V", at = @At("HEAD"), require = 0)
	private void btl$saveStateOnShutdown(CallbackInfo ci) {
		BtlSafe.guard("mixin.shutdown_save", () -> BtlState.get().save());
	}
}
