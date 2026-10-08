package com.beyondthelimits.registry;

import com.beyondthelimits.BeyondTheLimits;
import com.beyondthelimits.item.AncientTabletItem;
import com.beyondthelimits.item.DimensionalGaugeItem;
import com.beyondthelimits.item.GuidebookItem;
import com.beyondthelimits.item.MemoryShardItem;
import com.beyondthelimits.item.NoclipDeviceItem;
import com.beyondthelimits.item.RealityScannerItem;
import com.beyondthelimits.item.RealityWarheadItem;
import com.beyondthelimits.item.RiftStabilizerItem;
import com.beyondthelimits.item.SignalReceiverItem;
import com.beyondthelimits.item.StormBeaconItem;
import com.beyondthelimits.item.VoidLensItem;
import net.minecraft.item.Item;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;
import net.minecraft.util.Rarity;

/**
 * Items: the player's only tools for dealing with a world that is coming apart.
 *
 * <p>Design note — none of them are weapons. Chapter One has plenty of things that want to hurt
 * you and exactly one item that hurts them (the warhead, which is not a weapon, it is a decision).
 * Everything else is instrumentation: scanners, gauges, lenses, receivers, keys, recorders.</p>
 */
public final class BtlItems {
	private BtlItems() {
	}

	public static final Item GUIDEBOOK = register("guidebook",
			new GuidebookItem(new Item.Settings().maxCount(1).rarity(Rarity.RARE)));
	public static final Item REALITY_SCANNER = register("reality_scanner",
			new RealityScannerItem(new Item.Settings().maxCount(1).rarity(Rarity.UNCOMMON)));
	public static final Item DIMENSIONAL_GAUGE = register("dimensional_gauge",
			new DimensionalGaugeItem(new Item.Settings().maxCount(1).rarity(Rarity.UNCOMMON)));
	public static final Item NOCLIP_DEVICE = register("noclip_device",
			new NoclipDeviceItem(new Item.Settings().maxCount(16).rarity(Rarity.RARE)));
	public static final Item MEMORY_SHARD = register("memory_shard",
			new MemoryShardItem(new Item.Settings().maxCount(64).rarity(Rarity.UNCOMMON)));
	public static final Item SIGNAL_RECEIVER = register("signal_receiver",
			new SignalReceiverItem(new Item.Settings().maxCount(1).rarity(Rarity.RARE)));
	public static final Item RIFT_STABILIZER = register("rift_stabilizer",
			new RiftStabilizerItem(new Item.Settings().maxCount(16).rarity(Rarity.RARE)));
	public static final Item VOID_LENS = register("void_lens",
			new VoidLensItem(new Item.Settings().maxCount(1).rarity(Rarity.UNCOMMON)));
	public static final Item STORM_BEACON = register("storm_beacon",
			new StormBeaconItem(new Item.Settings().maxCount(16).rarity(Rarity.EPIC)));
	public static final Item ANCIENT_TABLET = register("ancient_tablet",
			new AncientTabletItem(new Item.Settings().maxCount(1).rarity(Rarity.RARE)));
	public static final Item REALITY_WARHEAD = register("reality_warhead",
			new RealityWarheadItem(new Item.Settings().maxCount(16).rarity(Rarity.EPIC)));
	public static final Item REALITY_FRAGMENT = register("reality_fragment",
			new Item(new Item.Settings().rarity(Rarity.UNCOMMON)));
	public static final Item BLACK_SUN_FRAGMENT = register("black_sun_fragment",
			new Item(new Item.Settings().rarity(Rarity.RARE)));
	public static final Item CODE_KEY = register("code_key",
			new Item(new Item.Settings().maxCount(1).rarity(Rarity.RARE)));

	private static Item register(String path, Item item) {
		return Registry.register(Registries.ITEM, BeyondTheLimits.id(path), item);
	}

	public static void register() {
		BeyondTheLimits.LOGGER.debug("[Beyond the Limits] Items registered: guide, scanners, noclip device, "
				+ "memory shard, signal receiver, stabilizer, lens, beacon, tablet, warhead, fragments, code key");
	}
}
