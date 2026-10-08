package com.beyondthelimits.client;

import com.beyondthelimits.network.BtlNetworking;

/**
 * The client's mirror of the server's reality state.
 *
 * <p>Everything the player <em>sees</em> rather than everything that happens: the reality percentage,
 * the dementia they are carrying, the sky event currently running, and the short-lived screen effects
 * the server asks for. Keeping it separate from the world means the renderer and the HUD can be written
 * as pure functions of a few numbers, which is what makes the effects cheap enough to run every frame.</p>
 */
public final class ClientState {
	private ClientState() {
	}

	// ---- reality --------------------------------------------------------------------------------

	private static int reality = 100;
	private static int dementia;
	private static int gravity;
	private static int collision;

	// ---- sky ------------------------------------------------------------------------------------

	private static int skyEvent = BtlNetworking.SKY_EVENT_NONE;
	private static float skyIntensity;
	private static int skyDuration;

	// ---- screen effects -------------------------------------------------------------------------

	private static int effect = Integer.MIN_VALUE;
	private static float effectIntensity;
	private static int effectTicks;
	private static int effectDuration = 1;

	// ---- animation ------------------------------------------------------------------------------

	private static float ticks;

	public static void tick() {
		ticks += 1.0F;

		if (skyDuration > 0) {
			skyDuration--;
		}

		if (effectTicks > 0) {
			effectTicks--;

			if (effectTicks == 0) {
				effect = Integer.MIN_VALUE;
			}
		}
	}

	public static void setReality(int value, int newDementia, int newGravity, int newCollision) {
		reality = Math.max(0, Math.min(100, value));
		dementia = Math.max(0, newDementia);
		gravity = Math.max(0, newGravity);
		collision = Math.max(0, newCollision);
	}

	public static void setSky(int event, float intensity, int durationTicks) {
		skyEvent = event;
		skyIntensity = Math.max(0.0F, Math.min(1.0F, intensity));
		skyDuration = durationTicks;
	}

	public static void setEffect(int newEffect, float intensity, int durationTicks) {
		effect = newEffect;
		effectIntensity = Math.max(0.0F, Math.min(1.0F, intensity));
		effectTicks = durationTicks;
		effectDuration = Math.max(1, durationTicks);
	}

	// ---- accessors ------------------------------------------------------------------------------

	public static int reality() {
		return reality;
	}

	public static int dementia() {
		return dementia;
	}

	public static int gravity() {
		return gravity;
	}

	public static int collision() {
		return collision;
	}

	public static int skyEvent() {
		return skyEvent;
	}

	public static float skyIntensity() {
		return skyIntensity;
	}

	public static int skyDuration() {
		return skyDuration;
	}

	public static boolean hasEffect() {
		return effectTicks > 0;
	}

	public static int effect() {
		return effect;
	}

	/** Effect strength, already faded out over its lifetime. */
	public static float effectStrength() {
		if (effectTicks <= 0) {
			return 0.0F;
		}

		float remaining = (float) effectTicks / effectDuration;
		return effectIntensity * Math.min(1.0F, remaining * 1.6F);
	}

	public static float effectProgress() {
		return effectTicks <= 0 ? 0.0F : 1.0F - (float) effectTicks / effectDuration;
	}

	/** Free-running client tick counter used to animate UVs, jitter and shader parameters. */
	public static float ticks() {
		return ticks;
	}

	public static boolean skyIsActive() {
		return skyDuration > 0 && skyEvent != BtlNetworking.SKY_EVENT_NONE;
	}

	/** How much of the vanilla sky should be suppressed: 0 = fully vanilla, 1 = fully replaced. */
	public static float skyWeight() {
		if (!skyIsActive()) {
			return 0.0F;
		}

		return Math.min(1.0F, skyIntensity * Math.min(1.0F, skyDuration / 20.0F));
	}

	public static void reset() {
		reality = 100;
		dementia = 0;
		gravity = 0;
		collision = 0;
		skyEvent = BtlNetworking.SKY_EVENT_NONE;
		skyIntensity = 0.0F;
		skyDuration = 0;
		effect = Integer.MIN_VALUE;
		effectTicks = 0;
	}
}
