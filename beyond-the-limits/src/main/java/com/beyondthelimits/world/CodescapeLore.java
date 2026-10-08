package com.beyondthelimits.world;

import net.minecraft.block.BlockState;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import net.minecraft.util.math.BlockPos;

/**
 * The monolith readout.
 *
 * <p>The Codescape is Minecraft's own source code turned into terrain, and a Code Monolith is a chunk of
 * that source that the player can still read. What it prints is not a riddle and not a hint: it is a real
 * class name from the game, described correctly, and the last line is always the same observation — the
 * path it names does not exist anywhere in the player's installation, because it is inside the running
 * game rather than on disk.</p>
 *
 * <p>The line a monolith shows is derived from its position, so a player who finds the same monolith
 * again reads the same thing, and two players on one server can compare monoliths and get different
 * answers. Nothing about it is random at read time.</p>
 */
public final class CodescapeLore {
	/** How many different bodies a monolith can print; the lang file carries one key per body. */
	private static final int BODIES = 6;

	private CodescapeLore() {
	}

	/** Prints one monolith's readout to the player who unlocked it. */
	public static void printMonolith(ServerPlayerEntity player, BlockPos pos) {
		int body = Math.floorMod(pos.hashCode(), BODIES);

		player.sendMessage(Text.translatable("message.beyondthelimits.codescape.monolith.header")
				.formatted(Formatting.DARK_AQUA), false);
		player.sendMessage(Text.translatable("message.beyondthelimits.codescape.monolith." + body)
				.formatted(Formatting.AQUA), false);
		player.sendMessage(Text.translatable("message.beyondthelimits.codescape.monolith.footer")
				.formatted(Formatting.DARK_GRAY), false);
	}

	/**
	 * The same readout, for the blocks that want to show a line before the player has a key — used by the
	 * Codescape's own monuments and by the debug readout in the HUD.
	 */
	public static Text preview(BlockPos pos) {
		return Text.translatable("message.beyondthelimits.codescape.monolith."
				+ Math.floorMod(pos.hashCode(), BODIES));
	}

	/** Convenience for blocks that need to show a monolith's state without a player. */
	public static Text stateReadout(BlockState state) {
		return preview(BlockPos.ORIGIN.add(state.getBlock().hashCode(), 0, 0));
	}
}
