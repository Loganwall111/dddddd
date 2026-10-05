package dev.logan.beyondthreshold.world;

import dev.logan.beyondthreshold.BTTGeneratedContent;
import dev.logan.beyondthreshold.BTTItems;
import dev.logan.beyondthreshold.BTTNet;
import dev.logan.beyondthreshold.BeyondTheThreshold;
import net.minecraft.item.BlockItem;
import net.minecraft.item.ItemStack;
import net.minecraft.nbt.NbtList;
import net.minecraft.registry.RegistryKey;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvents;
import net.minecraft.util.math.BlockPos;
import net.minecraft.world.Heightmap;
import net.minecraft.world.World;

import java.util.HashMap;
import java.util.Map;

/**
 * Seamless multiverse travel with PROCEDURAL INVENTORIES:
 * each dimension keeps its own inventory. Crossing a tear stashes the
 * current one and restores whatever you last had in the destination —
 * a brand new dimension hands you a procedurally seeded starter kit.
 */
public final class BTTTravel {
	private static final Map<String, NbtList> INVENTORIES = new HashMap<>();

	public static void travel(ServerPlayerEntity player, RegistryKey<World> target) {
		ServerWorld from = player.getServerWorld();
		if (from.getRegistryKey().equals(target)) {
			return;
		}
		ServerWorld to = player.getServer().getWorld(target);
		if (to == null) {
			return;
		}
		String key = player.getUuidAsString();

		from.playSound(null, player.getBlockPos(), SoundEvents.ENTITY_ENDERMAN_TELEPORT, SoundCategory.PLAYERS, 1.0F, 0.7F);

		// stash this dimension's inventory, procedurally
		INVENTORIES.put(key + from.getRegistryKey().getValue().toString(),
				player.getInventory().writeNBT(new NbtList()));

		BlockPos top = to.getTopPosition(Heightmap.Type.MOTION_BLOCKING, player.getBlockX(), player.getBlockZ());
		player.teleport(to, top.getX() + 0.5, top.getY() + 1.0, top.getZ() + 0.5, player.getYaw(), player.getPitch());
		player.fallDistance = 0.0F;

		player.getInventory().clear();
		NbtList stored = INVENTORIES.remove(key + target.getValue().toString());
		if (stored != null && !stored.isEmpty()) {
			player.getInventory().readNBT(stored);
		} else {
			starterKit(to, player);
		}

		to.playSound(null, player.getBlockPos(), SoundEvents.ENTITY_ENDERMAN_TELEPORT, SoundCategory.PLAYERS, 1.0F, 1.4F);
		BTTNet.sendTravel(player, BTTDimensions.indexOf(target), to.getSeed());
	}

	/** Procedural starter kit seeded by the destination world seed. */
	private static void starterKit(ServerWorld to, ServerPlayerEntity player) {
		long seed = to.getSeed() ^ 0xBEEF;
		player.getInventory().insertStack(new ItemStack(BTTItems.SHATTERED_RELIC));
		player.getInventory().insertStack(new ItemStack(BTTItems.THRESHOLD_BLADE));
		player.getInventory().insertStack(new ItemStack(BTTItems.RADIATE_GLASSES));
		for (int i = 0; i < 4; i++) {
			BlockItem b = BTTGeneratedContent.pickBlock((int) (seed >> (i * 7)) & 3, (int) (seed >> (i * 3)) & 255);
			if (b != null) {
				player.getInventory().insertStack(new ItemStack(b, 32));
			}
		}
	}

	/** The singularity takes you somewhere. No choice. */
	public static void singularity(ServerPlayerEntity player) {
		RegistryKey<World> dest = BTTDimensions.randomOther(player.getRandom(), player.getServerWorld().getRegistryKey());
		BeyondTheThreshold.LOGGER.info("[btt] singularity flung {} to {}", player.getName().getString(), dest.getValue());
		travel(player, dest);
	}

	private BTTTravel() {
	}
}
