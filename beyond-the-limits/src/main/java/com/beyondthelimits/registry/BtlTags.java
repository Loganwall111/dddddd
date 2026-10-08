package com.beyondthelimits.registry;

import com.beyondthelimits.BeyondTheLimits;
import net.minecraft.block.Block;
import net.minecraft.item.Item;
import net.minecraft.registry.RegistryKeys;
import net.minecraft.registry.tag.TagKey;

/**
 * Tags used by the simulation.
 *
 * <p>{@link #CORRUPTION_IMMUNE} and {@link #BLEEDABLE} are the two "physics" tags of the mod: they
 * decide what the Corrupted Land can eat and what becomes a bleeding vein. Both are filled by
 * datapack JSON, so a modpack can protect its own structures without touching code.</p>
 */
public final class BtlTags {
	private BtlTags() {
	}

	public static final TagKey<Block> CORRUPTION_IMMUNE = TagKey.of(RegistryKeys.BLOCK,
			BeyondTheLimits.id("corruption_immune"));
	public static final TagKey<Block> BLEEDABLE = TagKey.of(RegistryKeys.BLOCK, BeyondTheLimits.id("bleedable"));
	public static final TagKey<Block> RIFT_TRANSPARENT = TagKey.of(RegistryKeys.BLOCK,
			BeyondTheLimits.id("rift_transparent"));
	public static final TagKey<Block> BACKROOMS_STRUCTURE = TagKey.of(RegistryKeys.BLOCK,
			BeyondTheLimits.id("backrooms_structure"));
	public static final TagKey<Item> RIFT_TOOLS = TagKey.of(RegistryKeys.ITEM, BeyondTheLimits.id("rift_tools"));
}
