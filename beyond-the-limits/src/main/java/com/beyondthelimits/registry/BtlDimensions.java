package com.beyondthelimits.registry;

import com.beyondthelimits.BeyondTheLimits;
import net.minecraft.registry.RegistryKey;
import net.minecraft.registry.RegistryKeys;
import net.minecraft.world.World;

/**
 * Every dimension Chapter One can tear you into.
 *
 * <p>All seven are data driven ({@code data/beyondthelimits/dimension_type} and
 * {@code .../dimension}), which is what lets the mod ship that many worlds without a single line of
 * worldgen plumbing per world: the launcher can reload them, datapacks can extend them, and the
 * only thing written in Java is the procedural Backrooms / Codescape shell generator.</p>
 */
public final class BtlDimensions {
	private BtlDimensions() {
	}

	/** The Fog Dimension: 12 blocks of visibility, shapes moving just past it. */
	public static final RegistryKey<World> FOGLANDS = key("the_foglands");
	/** The Code Verse: no terrain, no overworld sky — everything is an animated skybox. */
	public static final RegistryKey<World> CODESCAPE = key("codescape");
	/** A procedurally generated void of rooms, halls, levels and the things that live in them. */
	public static final RegistryKey<World> BACKROOMS = key("backrooms");
	/** Underneath bedrock: six layers of places that should not be under anything. */
	public static final RegistryKey<World> SUBSTRATA = key("substrata");
	/** Your world, reflected, with its own civilization. */
	public static final RegistryKey<World> MIRRORWORLD = key("mirrorworld");
	/** Almost normal Minecraft. Always slightly wrong, and wronger the further you go. */
	public static final RegistryKey<World> WRONGWORLD = key("wrongworld");
	/** Black grass, white leaves, floating rivers and gravity that does not agree with you. */
	public static final RegistryKey<World> THE_IMPOSSIBLE = key("the_impossible");

	public static RegistryKey<World> key(String path) {
		return RegistryKey.of(RegistryKeys.WORLD, BeyondTheLimits.id(path));
	}

	public static void register() {
		// Dimension keys are plain registry keys; the worlds themselves are datapack entries.
		// Referencing them here pins class-initialisation order for worlds that load very early.
		BeyondTheLimits.LOGGER.debug("[Beyond the Limits] Dimensions: {}, {}, {}, {}, {}, {}, {}",
				FOGLANDS.getValue(), CODESCAPE.getValue(), BACKROOMS.getValue(), SUBSTRATA.getValue(),
				MIRRORWORLD.getValue(), WRONGWORLD.getValue(), THE_IMPOSSIBLE.getValue());
	}
}
