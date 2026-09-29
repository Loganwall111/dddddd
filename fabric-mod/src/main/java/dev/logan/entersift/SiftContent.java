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
    private static Block riftSeed(String name, int style, int target) {
        var key = blockKey(name);
        Block block = Registry.register(BuiltInRegistries.BLOCK, key,
            new RiftSeedBlock(BlockBehaviour.Properties.ofFullCopy(Blocks.AMETHYST_BLOCK).setId(key).lightLevel(state -> 15), style, target));
        Registry.register(BuiltInRegistries.ITEM, id(name), new BlockItem(block, itemProperties(name).useBlockDescriptionPrefix()));
        return block;
    }
    private static Block see(String name, Block base, int light) {
        var key = blockKey(name);
        Block block = Registry.register(BuiltInRegistries.BLOCK, key,
            new Block(BlockBehaviour.Properties.ofFullCopy(base).setId(key).lightLevel(state -> light).noOcclusion()));
        Registry.register(BuiltInRegistries.ITEM, id(name), new BlockItem(block, itemProperties(name).useBlockDescriptionPrefix()));
        return block;
    }
    private static Block plant(String name, int light) {
        var key = blockKey(name);
        Block block = Registry.register(BuiltInRegistries.BLOCK, key,
            new Block(BlockBehaviour.Properties.ofFullCopy(Blocks.SHORT_GRASS).setId(key).lightLevel(state -> light).noOcclusion()));
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
    public static final Block RIFT_OVERWORLD = riftSeed("rift_overworld", 0, 0);
    public static final Block RIFT_END = riftSeed("rift_end", 2, 2);
    public static final Block RIFT_SIFT = riftSeed("rift_sift", 1, 1);
    public static final Block RIFT_MEMBRANE = riftSeed("rift_membrane", 3, 1);
    public static final Block RIFT_EDGE = riftSeed("rift_edge", 5, 1);
    public static final Block RESONANCE_RED = block("resonance_red", Blocks.AMETHYST_BLOCK, 15);
    public static final Block RESONANCE_MAGENTA = block("resonance_magenta", Blocks.AMETHYST_BLOCK, 15);
    public static final Block RESONANCE_PINK = block("resonance_pink", Blocks.AMETHYST_BLOCK, 15);
    public static final Block RESONANCE_CYAN = block("resonance_cyan", Blocks.AMETHYST_BLOCK, 15);
    public static final Block RESONANCE_BLUE = block("resonance_blue", Blocks.AMETHYST_BLOCK, 15);
    public static final Block RESONANCE_PURPLE = block("resonance_purple", Blocks.AMETHYST_BLOCK, 15);
    public static final Block BLUB_JELLY = block("blub_jelly", Blocks.SLIME_BLOCK, 4);
    // Phase 4 terrain + portal/rift blocks (textures from tools/extract_textures.py).
    public static final Block ROSE_SPIRE = block("rose_spire", Blocks.TERRACOTTA, 0);
    public static final Block SPIRE_BRICKS = block("spire_bricks", Blocks.STONE_BRICKS, 0);
    public static final Block ROSE_PATH = block("rose_path", Blocks.TERRACOTTA, 0);
    public static final Block TEAL_PATH = block("teal_path", Blocks.MOSS_BLOCK, 0);
    public static final Block REEF_STONE = block("reef_stone", Blocks.TUFF, 0);
    public static final Block PALE_CANOPY = see("pale_canopy", Blocks.OAK_LEAVES, 6);
    public static final Block SIFT_MOSAIC = block("sift_mosaic", Blocks.AMETHYST_BLOCK, 12);
    public static final Block SIFT_GRASS = plant("sift_grass", 0);
    public static final Block GLOW_BULB = plant("glow_bulb", 12);
    public static final Block SIFT_CORAL_RED = plant("sift_coral_red", 4);
    public static final Block SIFT_CORAL_YELLOW = plant("sift_coral_yellow", 4);
    // 0.11: custom Sift rock, coral and turf (no vanilla blocks in Sift worldgen) and more foliage.
    public static final Block CRAG_ROCK = block("crag_rock", Blocks.STONE, 0);
    public static final Block CRAG_ROCK_DARK = block("crag_rock_dark", Blocks.STONE, 0);
    public static final Block CRAG_BAND = block("crag_band", Blocks.TERRACOTTA, 0);
    public static final Block PALE_CRUST = block("pale_crust", Blocks.CALCITE, 0);
    public static final Block CRAG_MOSS = block("crag_moss", Blocks.MOSSY_COBBLESTONE, 0);
    public static final Block CORAL_PINK_BLOCK = block("coral_pink_block", Blocks.TERRACOTTA, 2);
    public static final Block CORAL_ORANGE_BLOCK = block("coral_orange_block", Blocks.TERRACOTTA, 2);
    public static final Block SIFT_EARTH = block("sift_earth", Blocks.DIRT, 0);
    public static final Block BLUE_TURF = block("blue_turf", Blocks.MOSS_BLOCK, 0);
    public static final Block PINK_TURF = block("pink_turf", Blocks.MOSS_BLOCK, 0);
    public static final Block BLUE_GRASS = plant("blue_grass", 3);
    public static final Block PINK_GRASS = plant("pink_grass", 0);
    public static final Block GLOW_TUFT = plant("glow_tuft", 9);
    public static final Block SIFT_BLOOM = plant("sift_bloom", 2);
    public static final Block RIFT_PINK = riftSeed("rift_pink", 3, 1);
    public static final Block RIFT_ORANGE = riftSeed("rift_orange", 4, 3);
    public static final Block RIFT_YELLOW = riftSeed("rift_yellow", 0, 0);
    public static final Block RIFT_RED = riftSeed("rift_red", 4, 3);
    public static final Block RIFT_OLIVE = riftSeed("rift_olive", 1, 1);
    // 0.14 Soul Valley (green + purple giant trees, ruins) and Campaign Peaks (volcanic) blocks.
    public static final Block VERDANT_WOOD = block("verdant_wood", Blocks.OAK_PLANKS, 0);
    public static final Block VIOLET_WOOD = block("violet_wood", Blocks.OAK_PLANKS, 0);
    public static final Block VERDANT_CANOPY = see("verdant_canopy", Blocks.OAK_LEAVES, 4);
    public static final Block VIOLET_CANOPY = see("violet_canopy", Blocks.OAK_LEAVES, 6);
    public static final Block VALLEY_TURF = block("valley_turf", Blocks.MOSS_BLOCK, 0);
    public static final Block RUIN_BRICKS = block("ruin_bricks", Blocks.STONE_BRICKS, 0);
    public static final Block MOSSY_RUIN_BRICKS = block("mossy_ruin_bricks", Blocks.MOSSY_STONE_BRICKS, 0);
    public static final Block RUIN_TILES = block("ruin_tiles", Blocks.STONE_BRICKS, 0);
    public static final Block CINDER_ROCK = block("cinder_rock", Blocks.BLACKSTONE, 0);
    public static final Block ASH_CRUST = block("ash_crust", Blocks.TUFF, 0);
    public static final Block CINDER_GLOW = block("cinder_glow", Blocks.MAGMA_BLOCK, 10);
    public static final Block EMBER_ORE = block("ember_ore", Blocks.IRON_ORE, 5);
    public static final Block SINTER = block("sinter", Blocks.CALCITE, 0);
    public static final Block VALLEY_FERN = plant("valley_fern", 0);
    public static final Block VIOLET_BLOOM = plant("violet_bloom", 4);
    public static final Block[] THRESHOLD_STAGES = new Block[8];
    static { for (int i = 0; i < 8; i++) THRESHOLD_STAGES[i] = see("threshold_stage_" + i, Blocks.AMETHYST_BLOCK, 15); }
    /** Invisible display anchor for client-rendered rifts and portals (no item, never placed). */
    public static final Block RIFT_ANCHOR = Registry.register(BuiltInRegistries.BLOCK, blockKey("rift_anchor"),
        new RiftAnchorBlock(BlockBehaviour.Properties.ofFullCopy(Blocks.STRUCTURE_VOID).setId(blockKey("rift_anchor")).noOcclusion()));
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
    public static final Item SCULKER_EGG = egg("sculker");
    public static final Item SCULKLING_EGG = egg("sculkling");
    public static final Item LICKER_EGG = egg("licker");
    public static final Item OVERSEER_EGG = egg("overseer");
    public static final Item NOTE_BIRD_EGG = egg("note_bird");
    public static final Item SOUL_BEE_EGG = egg("soul_bee");
    public static final Item WATCHLING_EGG = egg("watchling");
    public static final Item SOUL_POTION = Registry.register(BuiltInRegistries.ITEM, id("soul_potion"),
        new SoulPotionItem(itemProperties("soul_potion").stacksTo(16)));
    public static void initialize() {
        net.fabricmc.fabric.api.creativetab.v1.CreativeModeTabEvents.modifyOutputEvent(net.minecraft.world.item.CreativeModeTabs.SPAWN_EGGS).register(output -> {
            for (Item item : new Item[]{BLUB_EGG,SCULKER_EGG,SCULKLING_EGG,ANTLERLING_EGG,JELLYFISH_EGG,LICKER_EGG,OVERSEER_EGG,NOTE_BIRD_EGG,SOUL_BEE_EGG,WATCHLING_EGG,WARDEN_EGG,SINGER_EGG}) output.accept(item);
        });
        net.fabricmc.fabric.api.creativetab.v1.CreativeModeTabEvents.modifyOutputEvent(net.minecraft.world.item.CreativeModeTabs.TOOLS_AND_UTILITIES).register(output -> {
            output.accept(GAUNTLET); output.accept(RED_GAUNTLET); output.accept(SOUL_POTION); output.accept(ICHOR_BUCKET);
        });
        net.fabricmc.fabric.api.creativetab.v1.CreativeModeTabEvents.modifyOutputEvent(net.minecraft.world.item.CreativeModeTabs.BUILDING_BLOCKS).register(output -> {
            output.accept(SONOROUS_DEEPSLATE); output.accept(SALT); output.accept(SOUL_SALT); output.accept(SOULWOOD); output.accept(SOUL_CANOPY);
            for (Block b : new Block[]{ROSE_SPIRE,SPIRE_BRICKS,ROSE_PATH,TEAL_PATH,REEF_STONE,PALE_CANOPY,SIFT_MOSAIC,SIFT_GRASS,GLOW_BULB,
                SIFT_CORAL_RED,SIFT_CORAL_YELLOW,CRAG_ROCK,CRAG_ROCK_DARK,CRAG_BAND,PALE_CRUST,CRAG_MOSS,CORAL_PINK_BLOCK,
                CORAL_ORANGE_BLOCK,SIFT_EARTH,BLUE_TURF,PINK_TURF,BLUE_GRASS,PINK_GRASS,GLOW_TUFT,SIFT_BLOOM,RIFT_PINK,RIFT_ORANGE,RIFT_YELLOW,RIFT_RED,RIFT_OLIVE,
                VERDANT_WOOD,VIOLET_WOOD,VERDANT_CANOPY,VIOLET_CANOPY,VALLEY_TURF,RUIN_BRICKS,MOSSY_RUIN_BRICKS,RUIN_TILES,
                CINDER_ROCK,ASH_CRUST,CINDER_GLOW,EMBER_ORE,SINTER,VALLEY_FERN,VIOLET_BLOOM}) output.accept(b);
        });
    }
    private SiftContent() {}
}
