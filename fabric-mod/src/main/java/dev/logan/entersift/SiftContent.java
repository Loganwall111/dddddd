package dev.logan.entersift;

import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.BucketItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.LiquidBlock;
import net.minecraft.world.level.block.state.BlockBehaviour;

public final class SiftContent {
    public static Identifier id(String path) { return Identifier.fromNamespaceAndPath("entersift", path); }
    private static ResourceKey<Block> blockKey(String path) { return ResourceKey.create(Registries.BLOCK, id(path)); }
    private static Item.Properties itemProperties(String path) {
        return new Item.Properties().setId(ResourceKey.create(Registries.ITEM, id(path)));
    }
    private static Block block(String name, Block base, int light) {
        var key = blockKey(name);
        Block block = Registry.register(BuiltInRegistries.BLOCK, key,
            new Block(BlockBehaviour.Properties.ofFullCopy(base).setId(key).lightLevel(state -> light)));
        Registry.register(BuiltInRegistries.ITEM, id(name), new BlockItem(block, itemProperties(name).useBlockDescriptionPrefix()));
        return block;
    }
    public static final Block SONOROUS_DEEPSLATE = block("sonorous_deepslate", Blocks.DEEPSLATE, 5);
    public static final Block SOULWOOD = block("soulwood", Blocks.DEEPSLATE, 0);
    public static final Block SOUL_CANOPY = block("soul_canopy", Blocks.MOSS_BLOCK, 7);
    public static final Block SOUL_LANTERN_STONE = block("soul_lantern_stone", Blocks.AMETHYST_BLOCK, 15);
    public static final Block RESONANCE_ORANGE = block("resonance_orange", Blocks.AMETHYST_BLOCK, 15);
    public static final Block RESONANCE_YELLOW = block("resonance_yellow", Blocks.AMETHYST_BLOCK, 15);
    public static final Block RESONANCE_GREEN = block("resonance_green", Blocks.AMETHYST_BLOCK, 15);
    public static final Block SALTSTONE = block("saltstone", Blocks.CALCITE, 0);
    public static final Block SALT = block("salt", Blocks.CALCITE, 0);
    public static final Block SOUL_SALT = block("soul_salt", Blocks.CALCITE, 9);
    public static final Block CARAPACE = block("carapace", Blocks.BONE_BLOCK, 0);
    public static final Block SINGER_MOSS = block("singer_moss", Blocks.MOSS_BLOCK, 3);
    public static final Block THRESHOLD = block("threshold", Blocks.AMETHYST_BLOCK, 15);
    public static final Block RIFT_OVERWORLD = block("rift_overworld", Blocks.AMETHYST_BLOCK, 15);
    public static final Block RIFT_END = block("rift_end", Blocks.AMETHYST_BLOCK, 15);
    public static final Block RIFT_SIFT = block("rift_sift", Blocks.AMETHYST_BLOCK, 15);
    public static final Block RIFT_MEMBRANE = block("rift_membrane", Blocks.AMETHYST_BLOCK, 15);
    public static final Block RIFT_EDGE = block("rift_edge", Blocks.AMETHYST_BLOCK, 15);
    public static final Block RESONANCE_RED = block("resonance_red", Blocks.AMETHYST_BLOCK, 15);
    public static final Block RESONANCE_MAGENTA = block("resonance_magenta", Blocks.AMETHYST_BLOCK, 15);
    public static final Block RESONANCE_PINK = block("resonance_pink", Blocks.AMETHYST_BLOCK, 15);
    public static final Block RESONANCE_CYAN = block("resonance_cyan", Blocks.AMETHYST_BLOCK, 15);
    public static final Block RESONANCE_BLUE = block("resonance_blue", Blocks.AMETHYST_BLOCK, 15);
    public static final Block RESONANCE_PURPLE = block("resonance_purple", Blocks.AMETHYST_BLOCK, 15);
    public static final Block BLUB_JELLY = block("blub_jelly", Blocks.SLIME_BLOCK, 4);
    public static final IchorFluid ICHOR = Registry.register(BuiltInRegistries.FLUID, id("ichor"), new IchorFluid.Still());
    public static final IchorFluid FLOWING_ICHOR = Registry.register(BuiltInRegistries.FLUID, id("flowing_ichor"), new IchorFluid.Flowing());
    public static final LiquidBlock ICHOR_BLOCK = Registry.register(BuiltInRegistries.BLOCK, blockKey("ichor"),
        new LiquidBlock(ICHOR, BlockBehaviour.Properties.ofFullCopy(Blocks.WATER).setId(blockKey("ichor")).lightLevel(s -> 11)) {});
    public static final Item ICHOR_BUCKET = Registry.register(BuiltInRegistries.ITEM, id("ichor_bucket"),
        new BucketItem(ICHOR, itemProperties("ichor_bucket").craftRemainder(Items.BUCKET).stacksTo(1)));
    public static final Item GAUNTLET = Registry.register(BuiltInRegistries.ITEM, id("rift_gauntlet"),
        new Item(itemProperties("rift_gauntlet").stacksTo(1)));
    public static final Item RED_GAUNTLET = Registry.register(BuiltInRegistries.ITEM, id("red_rift_gauntlet"),
        new Item(itemProperties("red_rift_gauntlet").stacksTo(1)));
    private static Item egg(String creature) {
        String name = creature + "_spawn_egg";
        return Registry.register(BuiltInRegistries.ITEM, id(name), new CreatureEggItem(itemProperties(name), creature));
    }
    public static final Item BLUB_EGG = egg("blub");
    public static final Item SINGER_EGG = egg("singer");
    public static final Item WARDEN_EGG = egg("twisted_warden");
    public static final Item JELLYFISH_EGG = egg("drift_jelly");
    public static final Item ANTLERLING_EGG = egg("antlerling");
    public static final Item CHESTMAW_EGG = egg("chestmaw");
    public static final Item SOUL_POTION = Registry.register(BuiltInRegistries.ITEM, id("soul_potion"),
        new SoulPotionItem(itemProperties("soul_potion").stacksTo(16)));
    public static void initialize() {
        net.fabricmc.fabric.api.creativetab.v1.CreativeModeTabEvents.modifyOutputEvent(net.minecraft.world.item.CreativeModeTabs.SPAWN_EGGS).register(output -> {
            for (Item item : new Item[]{BLUB_EGG,SINGER_EGG,WARDEN_EGG,JELLYFISH_EGG,ANTLERLING_EGG,CHESTMAW_EGG}) output.accept(item);
        });
        net.fabricmc.fabric.api.creativetab.v1.CreativeModeTabEvents.modifyOutputEvent(net.minecraft.world.item.CreativeModeTabs.TOOLS_AND_UTILITIES).register(output -> {
            output.accept(GAUNTLET); output.accept(RED_GAUNTLET); output.accept(SOUL_POTION); output.accept(ICHOR_BUCKET);
        });
        net.fabricmc.fabric.api.creativetab.v1.CreativeModeTabEvents.modifyOutputEvent(net.minecraft.world.item.CreativeModeTabs.BUILDING_BLOCKS).register(output -> {
            output.accept(SONOROUS_DEEPSLATE); output.accept(SALT); output.accept(SOUL_SALT); output.accept(SOULWOOD); output.accept(SOUL_CANOPY);
        });
    }
    private SiftContent() {}
}
