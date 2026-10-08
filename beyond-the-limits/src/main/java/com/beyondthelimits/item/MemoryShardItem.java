package com.beyondthelimits.item;

import com.beyondthelimits.core.BtlConfig;
import com.beyondthelimits.core.BtlMemory;
import com.beyondthelimits.core.BtlState;
import com.beyondthelimits.registry.BtlSounds;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.text.Text;
import net.minecraft.util.Hand;
import net.minecraft.util.TypedActionResult;
import net.minecraft.util.math.BlockPos;
import net.minecraft.world.World;

/**
 * Memory Shard.
 *
 * <p>The Last Chunk is built out of what the world remembers of you. Automatic recording captures
 * your placements and breaks, but a Memory Shard takes an explicit snapshot of the build you are
 * standing in — up to 4096 blocks — and stores it forever. Every shard you spend is another room
 * in the monument at 12,550,820.</p>
 */
public class MemoryShardItem extends Item {
	public MemoryShardItem(Settings settings) {
		super(settings);
	}

	@Override
	public TypedActionResult<ItemStack> use(World world, PlayerEntity user, Hand hand) {
		if (world.isClient()) {
			return TypedActionResult.success(user.getStackInHand(hand));
		}

		ServerWorld serverWorld = (ServerWorld) world;
		int radius = BtlConfig.MEMORY_SNAPSHOT_RADIUS;
		int size = radius * 2 + 1;

		if (size * size * size > BtlConfig.MAX_MEMORY_VOLUME) {
			radius = 3;
			size = radius * 2 + 1;
		}

		BlockPos origin = user.getBlockPos().add(-radius, -1, -radius);
		BtlMemory memory = BtlMemory.capture(serverWorld.getRegistryKey().getValue().toString(), origin,
				size, size, size, serverWorld.getTime(), pos -> serverWorld.getBlockState(pos));

		if (memory.weight() < 4) {
			user.sendMessage(Text.translatable("item.beyondthelimits.memory_shard.empty"), true);
			return TypedActionResult.fail(user.getStackInHand(hand));
		}

		BtlState.get().addMemory(memory);
		world.playSound(null, user.getBlockPos(), BtlSounds.MEMORY_CHIME, SoundCategory.PLAYERS, 1.0F, 1.0F);
		user.sendMessage(Text.translatable("item.beyondthelimits.memory_shard.stored",
				BtlState.get().memories().size(), memory.weight()), false);

		user.getStackInHand(hand).decrement(1);
		return TypedActionResult.success(user.getStackInHand(hand));
	}
}
