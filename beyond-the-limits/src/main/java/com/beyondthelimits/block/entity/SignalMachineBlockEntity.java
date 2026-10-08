package com.beyondthelimits.block.entity;

import com.beyondthelimits.core.BtlState;
import com.beyondthelimits.core.engine.SignalEngine;
import com.beyondthelimits.registry.BtlBlockEntities;
import com.beyondthelimits.registry.BtlItems;
import com.beyondthelimits.registry.BtlParticles;
import com.beyondthelimits.registry.BtlSounds;
import net.minecraft.block.BlockState;
import net.minecraft.block.entity.BlockEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.ItemStack;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.registry.RegistryWrapper;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.text.Text;
import net.minecraft.util.ActionResult;
import net.minecraft.util.Formatting;
import net.minecraft.util.math.BlockPos;

/**
 * The Signal Machine.
 *
 * <p>A block entity because the machine has state: it counts how many times it has been read, and it
 * remembers the exact moment the player worked out that the coordinates were theirs. Everything else
 * it does is transmission.</p>
 *
 * <p>Its behaviour is intentionally boring to look at and impossible to switch off. Right-clicking it
 * reads the current transmission; the transmission is always the player's own position; after enough
 * readings it transmits its final instruction and hands over a code key.</p>
 */
public class SignalMachineBlockEntity extends BlockEntity {
	private int readings;
	private int ticks;

	public SignalMachineBlockEntity(BlockPos pos, BlockState state) {
		super(BtlBlockEntities.SIGNAL_MACHINE, pos, state);
	}

	/** Called every tick by the block's ticker, server side only. */
	public void serverTick() {
		ticks++;

		if (!(getWorld() instanceof ServerWorld world)) {
			return;
		}

		if (ticks % 20 == 0) {
			world.spawnParticles(BtlParticles.STATIC_NOISE, pos.getX() + 0.5D, pos.getY() + 1.1D, pos.getZ() + 0.5D,
					3, 0.3D, 0.2D, 0.3D, 0.0D);
		}

		if (ticks % 200 == 0) {
			world.playSound(null, pos, BtlSounds.SIGNAL_LOOP, SoundCategory.BLOCKS, 0.7F, 1.0F);
		}

		// Anything standing on the machine gets the transmission whether they asked for it or not.
		if (ticks % 40 == 0) {
			for (PlayerEntity player : world.getPlayers(pl -> pl.getBlockPos().isWithinDistance(pos, 6.0D))) {
				if (player instanceof ServerPlayerEntity serverPlayer) {
					String message = readingMessage(serverPlayer);
					serverPlayer.sendMessage(Text.literal(message).formatted(Formatting.DARK_GREEN), true);
				}
			}
		}
	}

	/** Right-click: a deliberate reading. */
	public ActionResult onUse(PlayerEntity player) {
		if (!(getWorld() instanceof ServerWorld world) || !(player instanceof ServerPlayerEntity serverPlayer)) {
			return ActionResult.SUCCESS;
		}

		readings++;
		markDirty();

		serverPlayer.sendMessage(Text.translatable("message.beyondthelimits.signal.reading", readings)
				.formatted(Formatting.DARK_GREEN), false);
		serverPlayer.sendMessage(Text.literal(readingMessage(serverPlayer)).formatted(Formatting.GREEN), false);

		world.playSound(null, pos, BtlSounds.SIGNAL_STATIC, SoundCategory.BLOCKS, 1.0F, 1.0F);
		world.spawnParticles(BtlParticles.CODE_GLYPH, pos.getX() + 0.5D, pos.getY() + 1.2D, pos.getZ() + 0.5D,
				20, 0.6D, 0.6D, 0.6D, 0.02D);

		if (readings >= 3 && !BtlState.get().signalRevealed()) {
			SignalEngine.reveal(world.getServer(), serverPlayer);
			serverPlayer.giveItemStack(BtlItems.ANCIENT_TABLET.getDefaultStack());
		}

		return ActionResult.CONSUME;
	}

	private String readingMessage(ServerPlayerEntity player) {
		// The joke, and the horror: the machine is transmitting the coordinates of the reader.
		return "[UNKNOWN TRANSMISSION] target: " + player.getBlockX() + " " + player.getBlockY() + " " + player.getBlockZ()
				+ "  (you are standing on the transmitter)";
	}

	public int readings() {
		return readings;
	}

	@Override
	protected void writeNbt(NbtCompound nbt, RegistryWrapper.WrapperLookup registries) {
		super.writeNbt(nbt, registries);
		nbt.putInt("readings", readings);
		nbt.putInt("ticks", ticks);
	}

	@Override
	protected void readNbt(NbtCompound nbt, RegistryWrapper.WrapperLookup registries) {
		super.readNbt(nbt, registries);
		readings = nbt.getInt("readings");
		ticks = nbt.getInt("ticks");
	}

	/** Shown by the HUD when the player is standing inside a machine's field. */
	public static String fieldStatus(BtlState state) {
		return state.hasSignal() ? "signal: locked" : "signal: searching";
	}

	/** Kept for the guidebook's text about the machine. */
	public static ItemStack icon() {
		return BtlItems.SIGNAL_RECEIVER.getDefaultStack();
	}
}
