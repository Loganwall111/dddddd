package com.beyondthelimits.registry;

import com.beyondthelimits.BeyondTheLimits;
import net.fabricmc.fabric.api.itemgroup.v1.FabricItemGroup;
import net.minecraft.item.ItemGroup;
import net.minecraft.item.ItemStack;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;
import net.minecraft.text.Text;

/** The mod's own creative tab, so that everything Chapter One adds is findable in one place. */
public final class BtlItemGroups {
	private BtlItemGroups() {
	}

	public static final ItemGroup BEYOND_THE_LIMITS = Registry.register(Registries.ITEM_GROUP,
			BeyondTheLimits.id("beyond_the_limits"),
			FabricItemGroup.builder()
					.displayName(Text.translatable("itemGroup.beyondthelimits.beyond_the_limits"))
					.icon(() -> new ItemStack(BtlItems.REALITY_SCANNER))
					.entries((context, entries) -> {
						entries.add(BtlItems.GUIDEBOOK);
						entries.add(BtlItems.REALITY_SCANNER);
						entries.add(BtlItems.DIMENSIONAL_GAUGE);
						entries.add(BtlItems.NOCLIP_DEVICE);

						entries.add(BtlBlocks.CORRUPTED_GRASS);
						entries.add(BtlBlocks.CORRUPTED_SOIL);
						entries.add(BtlBlocks.CORRUPTED_STONE);
						entries.add(BtlBlocks.BLEEDING_VEIN);
						entries.add(BtlBlocks.BLEED_POOL);

						entries.add(BtlBlocks.RIFT_ANCHOR);
						entries.add(BtlBlocks.RIFT_FRAME);
						entries.add(BtlBlocks.VOID_GLASS);
						entries.add(BtlBlocks.SKY_SHARD);
						entries.add(BtlBlocks.GRAVITY_CORE);

						entries.add(BtlBlocks.MEMORY_STONE);
						entries.add(BtlBlocks.MEMORY_LAMP);
						entries.add(BtlBlocks.MIRROR_BLOCK);

						entries.add(BtlBlocks.CODE_MONOLITH);
						entries.add(BtlBlocks.CODE_BRICK);
						entries.add(BtlBlocks.CODE_PANEL);

						entries.add(BtlBlocks.BACKROOMS_CARPET);
						entries.add(BtlBlocks.BACKROOMS_WALL);
						entries.add(BtlBlocks.BACKROOMS_CEILING);
						entries.add(BtlBlocks.BACKROOMS_LIGHT);
						entries.add(BtlBlocks.POOL_TILE);
						entries.add(BtlBlocks.POOL_TILE_DARK);
						entries.add(BtlBlocks.STORE_SHELF);
						entries.add(BtlBlocks.WAREHOUSE_CONCRETE);
						entries.add(BtlBlocks.WAREHOUSE_FLOOR);

						entries.add(BtlBlocks.WRONG_GRASS);
						entries.add(BtlBlocks.IMPOSSIBLE_GRASS);
						entries.add(BtlBlocks.IMPOSSIBLE_LEAVES);
						entries.add(BtlBlocks.IMPOSSIBLE_LOG);

						entries.add(BtlBlocks.ANCIENT_BRICK);
						entries.add(BtlBlocks.ANCIENT_PILLAR);
						entries.add(BtlBlocks.ANCIENT_STATUE);

						entries.add(BtlBlocks.SIGNAL_CASING);
						entries.add(BtlBlocks.SIGNAL_MACHINE);

						entries.add(BtlBlocks.FOG_MOSS);
						entries.add(BtlBlocks.FOG_STONE);

						entries.add(BtlItems.MEMORY_SHARD);
						entries.add(BtlItems.SIGNAL_RECEIVER);
						entries.add(BtlItems.RIFT_STABILIZER);
						entries.add(BtlItems.REALITY_FRAGMENT);
						entries.add(BtlItems.BLACK_SUN_FRAGMENT);
						entries.add(BtlItems.ANCIENT_TABLET);
						entries.add(BtlItems.STORM_BEACON);
						entries.add(BtlItems.VOID_LENS);
						entries.add(BtlItems.CODE_KEY);
						entries.add(BtlItems.REALITY_WARHEAD);
					})
					.build());

	public static void register() {
		BeyondTheLimits.LOGGER.debug("[Beyond the Limits] Creative tab registered");
	}
}
