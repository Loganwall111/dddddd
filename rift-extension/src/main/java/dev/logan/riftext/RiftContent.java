package dev.logan.riftext;

import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockBehaviour;

/**
 * All blocks and items registered by the Rift Extension mod.
 *
 * <p>Rift seed blocks are inventory-placeable: right-clicking places the block, which immediately
 * removes itself and spawns a RiftPortalEntity with trailer-accurate geometry. Each variant targets
 * a different destination dimension, matching the colour/shape of the main mod's rift types.</p>
 */
public final class RiftContent {

    public static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath(RiftExtension.MOD_ID, path);
    }

    private static ResourceKey<Block> blockKey(String path) {
        return ResourceKey.create(Registries.BLOCK, id(path));
    }

    private static Item.Properties itemProperties(String path) {
        return new Item.Properties().setId(ResourceKey.create(Registries.ITEM, id(path)));
    }

    // ------------------------------------------------------------------ rift seed blocks (inventory-placeable)

    /**
     * Placeable rift seed that tears open a Sift-destination rift (pink/white, trailer cross shape).
     * This is the primary rift for testing trailer accuracy.
     */
    public static final Block RIFT_SEED_SIFT = riftSeed("rift_seed_sift", RiftType.SIFT);

    /**
     * Placeable rift seed that tears open an Overworld-destination rift (golden/peach).
     */
    public static final Block RIFT_SEED_OVERWORLD = riftSeed("rift_seed_overworld", RiftType.OVERWORLD);

    /**
     * Placeable rift seed that tears open a Nether-destination rift (crimson/red).
     */
    public static final Block RIFT_SEED_NETHER = riftSeed("rift_seed_nether", RiftType.NETHER);

    /**
     * Placeable rift seed that tears open an End-destination rift (violet/blue).
     */
    public static final Block RIFT_SEED_END = riftSeed("rift_seed_end", RiftType.END);

    /**
     * Placeable rift seed that tears open a ritual Portal rift (cyan mosaic).
     */
    public static final Block RIFT_SEED_PORTAL = riftSeed("rift_seed_portal", RiftType.PORTAL);

    // ------------------------------------------------------------------ registration helpers

    private static Block riftSeed(String name, RiftType type) {
        var key = blockKey(name);
        Block block = Registry.register(BuiltInRegistries.BLOCK, key,
            new RiftSeedBlock(BlockBehaviour.Properties.ofFullCopy(Blocks.AMETHYST_BLOCK)
                .setId(key).lightLevel(state -> 15), type));
        Registry.register(BuiltInRegistries.ITEM, id(name),
            new BlockItem(block, itemProperties(name).useBlockDescriptionPrefix()));
        return block;
    }

    public static void initialize() {
        // Register creative tab entries.
        net.fabricmc.fabric.api.creativetab.v1.CreativeModeTabEvents.modifyOutputEvent(
            net.minecraft.world.item.CreativeModeTabs.TOOLS_AND_UTILITIES
        ).register(output -> {
            output.accept(RIFT_SEED_SIFT);
            output.accept(RIFT_SEED_OVERWORLD);
            output.accept(RIFT_SEED_NETHER);
            output.accept(RIFT_SEED_END);
            output.accept(RIFT_SEED_PORTAL);
        });
    }

    private RiftContent() {}
}