package com.beyondthelimits.mixin;

import com.beyondthelimits.world.SkyEvents;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.world.chunk.WorldChunk;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Per-chunk world tick hook.
 *
 * <p>This is where the sky's damage becomes physical. Vanilla ticks a random chunk each tick to grow
 * crops and thaw ice; Chapter One uses the same budget to drop pieces of the sky: once its cracks have
 * spread far enough, the sky does not merely look broken, it sheds, and the pieces land in the world as
 * shards that can be picked up, placed and used as the only portable light source that still works at
 * 5% reality.</p>
 */
@Mixin(ServerWorld.class)
public class ServerWorldMixin {
	@Inject(method = "tickChunk(Lnet/minecraft/world/chunk/WorldChunk;I)V", at = @At("TAIL"), require = 0)
	private void btl$tickChunk(WorldChunk chunk, int randomTickSpeed, CallbackInfo ci) {
		SkyEvents.tickChunk((ServerWorld) (Object) this, chunk, randomTickSpeed);
	}
}
