package com.beyondthelimits.client;

import com.beyondthelimits.client.screen.GuidebookScreen;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.resource.language.I18n;

/**
 * The one door between the mod's gameplay code and its client-only code.
 *
 * <p>Items and engines call these static methods; each one checks whether a client is actually running
 * before doing anything, so the same item code is safe on a dedicated server where none of the client
 * classes can be loaded. The alternative — {@code instanceof} checks against client classes from common
 * code — is the classic way to crash a server.</p>
 */
public final class ClientHooks {
	private ClientHooks() {
	}

	// ---- transient client effect state ------------------------------------------------------------

	private static int scannerTicks;
	private static int scannerDuration = 1;
	private static int lensTicks;
	private static int lensDuration = 1;
	private static int guideOpenCooldown;

	public static void tick() {
		if (scannerTicks > 0) {
			scannerTicks--;
		}

		if (lensTicks > 0) {
			lensTicks--;
		}

		if (guideOpenCooldown > 0) {
			guideOpenCooldown--;
		}
	}

	// ---- called from common code -----------------------------------------------------------------

	public static void openGuidebook() {
		MinecraftClient client = MinecraftClient.getInstance();

		if (client == null || client.player == null || guideOpenCooldown > 0) {
			return;
		}

		guideOpenCooldown = 10;
		client.execute(() -> {
			if (client.currentScreen == null) {
				client.setScreen(new GuidebookScreen());
			}
		});
	}

	public static void onScannerPulse() {
		scannerDuration = 70;
		scannerTicks = scannerDuration;
	}

	public static void onLensActivated() {
		lensDuration = 100;
		lensTicks = lensDuration;
	}

	public static void onVoidLensWarning(String key) {
		MinecraftClient client = MinecraftClient.getInstance();

		if (client == null || client.player == null) {
			return;
		}

		client.player.sendMessage(net.minecraft.text.Text.translatable(key), true);
	}

	// ---- read by the render layer, the HUD and the 4th-wall code ---------------------------------

	public static boolean scannerActive() {
		return scannerTicks > 0;
	}

	public static float scannerStrength() {
		return scannerTicks <= 0 ? 0.0F : Math.min(1.0F, scannerTicks / (float) scannerDuration * 1.8F);
	}

	public static boolean lensActive() {
		return lensTicks > 0;
	}

	public static float lensStrength() {
		return lensTicks <= 0 ? 0.0F : Math.min(1.0F, lensTicks / (float) lensDuration * 1.6F);
	}

	/** Mirrors the HUD keybind's state so the HUD does not have to know about keybindings. */
	public static boolean hudVisible() {
		return BtlKeybinds.hudVisible();
	}

	/** Opens the Code Verse terminal, which is the mod's way of letting the player read the game itself. */
	public static void openCodeVerse() {
		MinecraftClient client = MinecraftClient.getInstance();

		if (client == null || client.player == null) {
			return;
		}

		client.execute(() -> {
			if (client.currentScreen == null) {
				client.setScreen(new com.beyondthelimits.client.screen.CodeVerseScreen());
			}
		});
	}

	/** Localised string lookup that never throws on a missing key — missing keys show the key itself. */
	public static String text(String key, Object... args) {
		return I18n.translate(key, args);
	}
}
