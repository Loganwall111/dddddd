package dev.logan.beyondthreshold;

import dev.logan.beyondthreshold.item.RadiateGlassesItem;
import dev.logan.beyondthreshold.item.ShatteredRelicItem;
import dev.logan.beyondthreshold.item.ThresholdBladeItem;
import net.fabricmc.fabric.api.itemgroup.v1.FabricItemGroup;
import net.minecraft.item.BlockItem;
import net.minecraft.item.Item;
import net.minecraft.item.ItemGroup;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;
import net.minecraft.text.Text;
import net.minecraft.util.Identifier;

public final class BTTItems {
	public static final Item SHATTERED_RELIC = new ShatteredRelicItem(settings());
	public static final Item THRESHOLD_BLADE = new ThresholdBladeItem(settings());
	public static final Item RADIATE_GLASSES = new RadiateGlassesItem(settings());

	private static Item.Settings settings() {
		return new Item.Settings().maxCount(1);
	}

	public static void register() {
		Registry.register(Registries.ITEM, new Identifier(BeyondTheThreshold.MOD_ID, "shattered_relic"), SHATTERED_RELIC);
		Registry.register(Registries.ITEM, new Identifier(BeyondTheThreshold.MOD_ID, "threshold_blade"), THRESHOLD_BLADE);
		Registry.register(Registries.ITEM, new Identifier(BeyondTheThreshold.MOD_ID, "radiate_reality_glasses"), RADIATE_GLASSES);

		// Creative tab: the relic, the blade, the glasses and every
		// OnePac-generated threshold block, so nothing is command-locked.
		ItemGroup group = FabricItemGroup.builder()
				.displayName(Text.translatable("itemGroup.beyondthreshold.main"))
				.icon(() -> SHATTERED_RELIC.getDefaultStack())
				.entries((ctx) -> {
					ctx.add(SHATTERED_RELIC);
					ctx.add(THRESHOLD_BLADE);
					ctx.add(RADIATE_GLASSES);
					for (int k = 0; k < 4; k++) {
						for (int i = 0; i < BTTGeneratedContent.variantCount(); i++) {
							BlockItem bi = BTTGeneratedContent.pickBlock(k, i);
							if (bi != null) {
								ctx.add(bi);
							}
						}
					}
				})
				.build();
		Registry.register(Registries.ITEM_GROUP, new Identifier(BeyondTheThreshold.MOD_ID, "main"), group);
	}

	private BTTItems() {
	}
}
