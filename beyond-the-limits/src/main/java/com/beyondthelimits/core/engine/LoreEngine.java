package com.beyondthelimits.core.engine;

import com.beyondthelimits.core.BtlState;
import com.beyondthelimits.network.BtlNetworking;
import com.beyondthelimits.registry.BtlItems;
import com.beyondthelimits.registry.BtlSounds;
import com.beyondthelimits.util.BtlSafe;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.ItemStack;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.text.ClickEvent;
import net.minecraft.text.MutableText;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import net.minecraft.util.math.BlockPos;

/**
 * Lore.
 *
 * <p>Chapter One does not open with a cutscene. It opens with a book you did not ask for, written by
 * someone who has clearly been here before you. {@link #onGuideOpened(PlayerEntity)} advances that
 * correspondence: every time the player opens the guide at a new stage of the world's collapse, the
 * author has written a little more — and the author is increasingly sure they know where the city is,
 * which is exactly what they should not be sure about.</p>
 */
public final class LoreEngine {
	private LoreEngine() {
	}

	/** Hands the starting guidebook to a player, once per world. */
	public static void giveStartingGuide(PlayerEntity player) {
		BtlSafe.guard("lore.give_guide", () -> {
			ServerPlayerEntity serverPlayer = player instanceof ServerPlayerEntity sp ? sp : null;

			if (serverPlayer == null) {
				return;
			}

			BtlState state = BtlState.get();

			if (state.guideGiven() != 0) {
				return;
			}

			state.setGuideGiven(1);
			serverPlayer.getInventory().insertStack(BtlItems.GUIDEBOOK.getDefaultStack());
			serverPlayer.sendMessage(Text.translatable("message.beyondthelimits.guide.given").formatted(Formatting.GOLD), false);
			serverPlayer.playSoundToPlayer(BtlSounds.GUIDE_OPEN, SoundCategory.PLAYERS, 1.0F, 1.0F);
		});
	}

	/** Called every time the guidebook is opened. */
	public static void onGuideOpened(PlayerEntity player) {
		BtlSafe.guard("lore.guide", () -> {
			BtlState state = BtlState.get();
			BlockPos city = null;

			if (player instanceof ServerPlayerEntity serverPlayer && player.getWorld() instanceof ServerWorld serverWorld) {
				city = BackroomsEngine.citySurface(serverWorld);
				state.setLoreStage(Math.max(state.loreStage(), 1));
			}

			player.sendMessage(Text.translatable("lore.beyondthelimits.guide.header").formatted(Formatting.YELLOW), false);

			if (city != null) {
				MutableText coordinates = Text.literal("  [" + city.getX() + ", " + city.getZ() + "]")
						.formatted(Formatting.AQUA)
						.styled(style -> style.withClickEvent(new ClickEvent(ClickEvent.Action.SUGGEST_COMMAND,
								"/beyondthelimits where")));
				player.sendMessage(Text.translatable("lore.beyondthelimits.guide.city").append(coordinates), false);
			}

			player.sendMessage(Text.translatable("lore.beyondthelimits.guide.warehouse").formatted(Formatting.GRAY), false);
			player.sendMessage(Text.translatable("lore.beyondthelimits.guide.warning").formatted(Formatting.DARK_RED), false);

			if (state.reality() < 80) {
				player.sendMessage(Text.translatable("lore.beyondthelimits.guide.reality", state.reality())
						.formatted(Formatting.RED), false);
			}

			if (state.blackSunStage() > 0) {
				player.sendMessage(Text.translatable("lore.beyondthelimits.guide.blacksun").formatted(Formatting.DARK_PURPLE), false);
			}

			if (state.hasSignal()) {
				player.sendMessage(Text.translatable("lore.beyondthelimits.guide.signal").formatted(Formatting.GREEN), false);
			}
		});
	}

	/** Reading an ancient tablet: the civilization that was not there, explaining itself. */
	public static void readTablet(PlayerEntity player) {
		BtlSafe.guard("lore.tablet", () -> {
			BtlState state = BtlState.get();
			int stage = state.lostCivStage();
			player.sendMessage(Text.translatable("lore.beyondthelimits.tablet." + Math.min(5, stage)).formatted(Formatting.LIGHT_PURPLE), false);

			if (player instanceof ServerPlayerEntity serverPlayer) {
				BtlNetworking.sendScreenEffect(serverPlayer, BtlNetworking.EFFECT_MEMORY, 0.6F, 80);
			}

			if (stage >= 4) {
				player.sendMessage(Text.translatable("lore.beyondthelimits.tablet.reward").formatted(Formatting.GOLD), false);
				player.giveItemStack(new ItemStack(BtlItems.VOID_LENS));
			}
		});
	}

	/** The guide's "where am I supposed to go" answers, used by /beyondthelimits where. */
	public static void describeObjectives(PlayerEntity player) {
		BtlSafe.guard("lore.objectives", () -> {
			BtlState state = BtlState.get();
			player.sendMessage(Text.translatable("lore.beyondthelimits.objectives.header").formatted(Formatting.GOLD), false);
			player.sendMessage(Text.translatable("lore.beyondthelimits.objectives.reality", state.reality()), false);
			player.sendMessage(Text.translatable("lore.beyondthelimits.objectives.collision", state.collision()), false);
			player.sendMessage(Text.translatable("lore.beyondthelimits.objectives.skycrack", state.skyCrack()), false);
			player.sendMessage(Text.translatable("lore.beyondthelimits.objectives.rifts", state.riftCount()), false);
			player.sendMessage(Text.translatable("lore.beyondthelimits.objectives.blacksun", state.blackSunStage()), false);
			player.sendMessage(Text.translatable("lore.beyondthelimits.objectives.civilization", state.lostCivStage()), false);
		});
	}

	/** The item the player is meant to be holding when they step through the warehouse gate. */
	public static boolean hasGuide(PlayerEntity player) {
		return player.getInventory().contains(BtlItems.GUIDEBOOK.getDefaultStack())
				|| player.getMainHandStack().isOf(BtlItems.GUIDEBOOK)
				|| player.getOffHandStack().isOf(BtlItems.GUIDEBOOK);
	}
}
