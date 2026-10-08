package com.beyondthelimits.client;

import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.util.InputUtil;
import org.lwjgl.glfw.GLFW;

/**
 * Three keys, and no more.
 *
 * <p>The mod does not want an interface full of buttons: it wants the world to be the interface. What is
 * left over is genuinely impossible to do with an item — opening the guidebook from anywhere, scanning
 * without swapping to the scanner, and hiding the reality readout for players who would rather not know
 * how bad things are yet.</p>
 */
public final class BtlKeybinds {
	private BtlKeybinds() {
	}

	public static final String CATEGORY = "category.beyondthelimits";

	private static KeyBinding guide;
	private static KeyBinding scan;
	private static KeyBinding toggleHud;

	private static boolean hudVisible = true;

	public static void register() {
		guide = KeyBindingHelper.registerKeyBinding(new KeyBinding("key.beyondthelimits.guide",
				InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_G, CATEGORY));
		scan = KeyBindingHelper.registerKeyBinding(new KeyBinding("key.beyondthelimits.scan",
				InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_B, CATEGORY));
		toggleHud = KeyBindingHelper.registerKeyBinding(new KeyBinding("key.beyondthelimits.toggle_hud",
				InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_H, CATEGORY));
	}

	public static void tick() {
		if (guide == null) {
			return;
		}

		while (guide.wasPressed()) {
			ClientHooks.openGuidebook();
		}

		while (scan.wasPressed()) {
			ClientHooks.onScannerPulse();
		}

		while (toggleHud.wasPressed()) {
			hudVisible = !hudVisible;
		}
	}

	public static boolean hudVisible() {
		return hudVisible;
	}
}
