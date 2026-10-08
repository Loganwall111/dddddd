package dev.beyondlimits;

import dev.beyondlimits.item.FractureKeyItem;
import dev.beyondlimits.item.RiftCompassItem;
import net.minecraft.item.Item;
import net.minecraft.util.Rarity;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;

public final class ModItems {
    public static final Item RIFT_SHARD = register("rift_shard",
            new Item(new Item.Settings().maxCount(16).rarity(Rarity.UNCOMMON)));
    public static final FractureKeyItem FRACTURE_KEY = (FractureKeyItem) register("fracture_key",
            new FractureKeyItem(new Item.Settings().maxCount(1).maxDamage(64).rarity(Rarity.RARE)));
    public static final RiftCompassItem RIFT_COMPASS = (RiftCompassItem) register("rift_compass",
            new RiftCompassItem(new Item.Settings().maxCount(1).rarity(Rarity.UNCOMMON)));

    private ModItems() {
    }

    private static Item register(String path, Item item) {
        return Registry.register(Registries.ITEM, BeyondLimits.id(path), item);
    }

    public static void register() {
        // Referencing this method forces all registry entries above to initialize.
    }
}
