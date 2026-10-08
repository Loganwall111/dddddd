package com.beyondthelimits.client.render;

import com.beyondthelimits.registry.BtlDimensions;
import net.minecraft.client.MinecraftClient;
import net.minecraft.registry.RegistryKey;
import net.minecraft.world.World;

/**
 * Decides how close the fog is allowed to get.
 *
 * <p>Fog is a lie the game tells to hide the edge of the loaded world, and this mod tells a lot of the
 * same lie on purpose. Each dimension gets its own signature: the Foglands close the world down to ten
 * blocks so shapes only resolve when it is already too late, the Codescape leaves a grid haze, the
 * Backrooms get the warm haze of a room with no windows, and the Substrata put the player inside
 * something with no horizon at all. On top of that, low reality in any dimension pulls the fog in
 * slightly — the world literally cannot be seen as clearly as it used to be.</p>
 */
public final class FogDirector {
	private FogDirector() {
	}

	/** A fog setting expressed in fractions of the view distance, so it scales with the player's settings. */
	public record Modifier(float startFactor, float endFactor, float near, float red, float green, float blue) {
		public float start(float viewDistance) {
			return Math.max(near, viewDistance * startFactor);
		}

		public float end(float viewDistance) {
			return Math.max(start(viewDistance) + 1.0F, viewDistance * endFactor);
		}
	}

	private static final Modifier REALITY_TINT = new Modifier(0.05F, 0.55F, 18.0F, 0.03F, 0.02F, 0.05F);

	public static Modifier modifier(int reality) {
		MinecraftClient client = MinecraftClient.getInstance();
		if (client == null || client.world == null) {
			return null;
		}

		Modifier dimension = dimensionModifier(client.world.getRegistryKey());

		if (dimension != null) {
			return dimension;
		}

		if (reality <= 60) {
			// Band 3 and below: the world is visibly thinner than it should be.
			float severity = (60 - reality) / 40.0F;
			return new Modifier(REALITY_TINT.startFactor() * (1.0F - severity * 0.6F),
					REALITY_TINT.endFactor() * (1.0F - severity * 0.45F), REALITY_TINT.near(),
					REALITY_TINT.red(), REALITY_TINT.green(), REALITY_TINT.blue());
		}

		return null;
	}

	private static Modifier dimensionModifier(RegistryKey<World> key) {
		if (key == BtlDimensions.FOGLANDS) {
			return new Modifier(0.02F, 0.09F, 4.0F, 0.72F, 0.76F, 0.78F);
		}

		if (key == BtlDimensions.CODESCAPE) {
			return new Modifier(0.08F, 0.5F, 12.0F, 0.01F, 0.06F, 0.03F);
		}

		if (key == BtlDimensions.BACKROOMS) {
			return new Modifier(0.12F, 0.62F, 16.0F, 0.36F, 0.32F, 0.14F);
		}

		if (key == BtlDimensions.SUBSTRATA) {
			return new Modifier(0.03F, 0.24F, 6.0F, 0.0F, 0.0F, 0.0F);
		}

		if (key == BtlDimensions.MIRRORWORLD) {
			return new Modifier(0.1F, 0.7F, 20.0F, 0.42F, 0.46F, 0.52F);
		}

		if (key == BtlDimensions.WRONGWORLD) {
			return new Modifier(0.06F, 0.4F, 10.0F, 0.05F, 0.16F, 0.06F);
		}

		if (key == BtlDimensions.THE_IMPOSSIBLE) {
			return new Modifier(0.15F, 0.85F, 24.0F, 0.14F, 0.05F, 0.22F);
		}

		return null;
	}
}
