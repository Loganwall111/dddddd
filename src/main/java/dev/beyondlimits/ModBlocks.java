package dev.beyondlimits;

import dev.beyondlimits.block.RealityAnchorBlock;
import dev.beyondlimits.block.ResonantCoreBlock;
import dev.beyondlimits.block.RiftTearBlock;
import net.fabricmc.fabric.api.object.builder.v1.block.FabricBlockSettings;
import net.minecraft.block.Block;
import net.minecraft.block.Blocks;
import net.minecraft.item.BlockItem;
import net.minecraft.item.Item;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;

public final class ModBlocks {
    public static final Block FRACTURED_STONE = registerWithItem("fractured_stone",
            new Block(FabricBlockSettings.copyOf(Blocks.DEEPSLATE).strength(3.2F, 6.0F)));
    public static final Block NULLSTONE = registerWithItem("nullstone",
            new Block(FabricBlockSettings.copyOf(Blocks.OBSIDIAN).strength(5.0F, 18.0F).luminance(state -> 2)));
    public static final Block CODEGLASS = registerWithItem("codeglass",
            new Block(FabricBlockSettings.copyOf(Blocks.TINTED_GLASS).strength(1.2F).nonOpaque().luminance(state -> 5)));
    public static final Block MEMORY_CRYSTAL = registerWithItem("memory_crystal",
            new Block(FabricBlockSettings.copyOf(Blocks.AMETHYST_BLOCK).strength(2.5F).luminance(state -> 8)));
    public static final RealityAnchorBlock REALITY_ANCHOR = registerWithItem("reality_anchor",
            new RealityAnchorBlock(FabricBlockSettings.copyOf(Blocks.LODESTONE).strength(4.0F, 8.0F).luminance(state -> 7)));
    public static final ResonantCoreBlock RESONANT_CORE = registerWithItem("resonant_core",
            new ResonantCoreBlock(FabricBlockSettings.copyOf(Blocks.RESPAWN_ANCHOR).strength(5.0F, 12.0F).luminance(state -> state.get(ResonantCoreBlock.CHARGED) ? 15 : 6)));
    public static final RiftTearBlock REALITY_TEAR = Registry.register(
            Registries.BLOCK,
            BeyondLimits.id("reality_tear"),
            new RiftTearBlock(FabricBlockSettings.copyOf(Blocks.LIGHTNING_ROD)
                    .noCollision()
                    .nonOpaque()
                    .strength(-1.0F, 3_600_000.0F)
                    .luminance(state -> 12))
    );

    private ModBlocks() {
    }

    private static <T extends Block> T registerWithItem(String path, T block) {
        Registry.register(Registries.BLOCK, BeyondLimits.id(path), block);
        Registry.register(Registries.ITEM, BeyondLimits.id(path), new BlockItem(block, new Item.Settings()));
        return block;
    }

    public static void register() {
        // Referencing this method forces all registry entries above to initialize.
    }
}
