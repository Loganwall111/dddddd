package com.beyondthelimits.registry;

import com.beyondthelimits.BeyondTheLimits;
import com.beyondthelimits.block.AncientStatueBlock;
import com.beyondthelimits.block.BleedPoolBlock;
import com.beyondthelimits.block.BleedingVeinBlock;
import com.beyondthelimits.block.CodeMonolithBlock;
import com.beyondthelimits.block.CorruptedGrassBlock;
import com.beyondthelimits.block.GravityCoreBlock;
import com.beyondthelimits.block.MirrorBlock;
import com.beyondthelimits.block.RiftAnchorBlock;
import com.beyondthelimits.block.SignalMachineBlock;
import com.beyondthelimits.block.WrongGrassBlock;
import net.minecraft.block.AbstractBlock;
import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.block.MapColor;
import net.minecraft.block.PillarBlock;
import net.minecraft.block.piston.PistonBehavior;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;
import net.minecraft.sound.BlockSoundGroup;

/**
 * Every block in Chapter One.
 *
 * <p>Design rule for this file: anything that is only scenery is a plain {@link Block}. Only the
 * blocks that <em>do</em> something get a class — corruption, bleeding, rifts, mirrors, gravity,
 * signals, the Code Verse and the statues of the civilization that was not there.</p>
 */
public final class BtlBlocks {
	private BtlBlocks() {
	}

	// --- Corrupted land -------------------------------------------------------------------------

	public static final Block CORRUPTED_GRASS = register("corrupted_grass",
			new CorruptedGrassBlock(settings(MapColor.GREEN).strength(0.6F).sounds(BlockSoundGroup.GRASS).ticksRandomly()));
	public static final Block CORRUPTED_SOIL = register("corrupted_soil",
			new Block(settings(MapColor.TERRACOTTA_GREEN).strength(0.5F).sounds(BlockSoundGroup.GRAVEL)));
	public static final Block CORRUPTED_STONE = register("corrupted_stone",
			new Block(settings(MapColor.DEEPSLATE_GRAY).strength(1.6F, 6.0F).sounds(BlockSoundGroup.DEEPSLATE)));
	public static final Block BLEEDING_VEIN = register("bleeding_vein",
			new BleedingVeinBlock(settings(MapColor.DARK_RED).strength(1.0F).sounds(BlockSoundGroup.SCULK).ticksRandomly()));
	public static final Block BLEED_POOL = register("bleed_pool",
			new BleedPoolBlock(settings(MapColor.DARK_CRIMSON).strength(0.4F).noCollision()
					.luminance(state -> 4).sounds(BlockSoundGroup.SLIME).ticksRandomly()));

	// --- Rifts / reality ------------------------------------------------------------------------

	public static final Block RIFT_ANCHOR = register("rift_anchor",
			new RiftAnchorBlock(settings(MapColor.PURPLE).strength(2.5F, 30.0F).luminance(state -> 9)
					.sounds(BlockSoundGroup.AMETHYST_BLOCK).ticksRandomly()));
	public static final Block RIFT_FRAME = register("rift_frame",
			new Block(settings(MapColor.PURPLE).strength(3.5F, 1200.0F).luminance(state -> 6)
					.sounds(BlockSoundGroup.DEEPSLATE_BRICKS)));
	public static final Block VOID_GLASS = register("void_glass",
			new Block(settings(MapColor.BLACK).strength(0.6F).nonOpaque().sounds(BlockSoundGroup.GLASS)));
	public static final Block SKY_SHARD = register("sky_shard",
			new Block(settings(MapColor.WHITE).strength(0.5F).nonOpaque().luminance(state -> 12)
					.sounds(BlockSoundGroup.GLASS)));
	public static final Block GRAVITY_CORE = register("gravity_core",
			new GravityCoreBlock(settings(MapColor.BLUE).strength(3.0F, 30.0F).luminance(state -> 10)
					.sounds(BlockSoundGroup.AMETHYST_CLUSTER).ticksRandomly()));

	// --- Memory / mirrors -----------------------------------------------------------------------

	public static final Block MEMORY_STONE = register("memory_stone",
			new Block(settings(MapColor.LIGHT_BLUE).strength(2.0F, 12.0F).sounds(BlockSoundGroup.DEEPSLATE_TILES)));
	public static final Block MEMORY_LAMP = register("memory_lamp",
			new Block(settings(MapColor.LIGHT_BLUE).strength(0.8F).luminance(state -> 15)
					.sounds(BlockSoundGroup.COPPER)));
	public static final Block MIRROR_BLOCK = register("mirror_block",
			new MirrorBlock(settings(MapColor.LIGHT_GRAY).strength(1.4F).nonOpaque().sounds(BlockSoundGroup.GLASS)));

	// --- The Code Verse -------------------------------------------------------------------------

	public static final Block CODE_MONOLITH = register("code_monolith",
			new CodeMonolithBlock(settings(MapColor.GREEN).strength(2.0F, 40.0F).luminance(state -> 7)
					.sounds(BlockSoundGroup.DEEPSLATE)));
	public static final Block CODE_BRICK = register("code_brick",
			new Block(settings(MapColor.GREEN).strength(1.8F, 20.0F).sounds(BlockSoundGroup.DEEPSLATE_BRICKS)));
	public static final Block CODE_PANEL = register("code_panel",
			new Block(settings(MapColor.EMERALD_GREEN).strength(0.9F).luminance(state -> 13).sounds(BlockSoundGroup.COPPER)));

	// --- The Backrooms --------------------------------------------------------------------------

	public static final Block BACKROOMS_CARPET = register("backrooms_carpet",
			new Block(settings(MapColor.YELLOW).strength(0.5F).sounds(BlockSoundGroup.WOOL)));
	public static final Block BACKROOMS_WALL = register("backrooms_wall",
			new Block(settings(MapColor.YELLOW).strength(1.2F).sounds(BlockSoundGroup.WOOL)));
	public static final Block BACKROOMS_CEILING = register("backrooms_ceiling",
			new Block(settings(MapColor.TERRACOTTA_YELLOW).strength(1.2F).sounds(BlockSoundGroup.WOOL)));
	public static final Block BACKROOMS_LIGHT = register("backrooms_light",
			new Block(settings(MapColor.WHITE).strength(0.8F).luminance(state -> 15).sounds(BlockSoundGroup.GLASS)));
	public static final Block POOL_TILE = register("pool_tile",
			new Block(settings(MapColor.LIGHT_BLUE).strength(1.0F).sounds(BlockSoundGroup.STONE)));
	public static final Block POOL_TILE_DARK = register("pool_tile_dark",
			new Block(settings(MapColor.BLUE).strength(1.0F).sounds(BlockSoundGroup.STONE)));
	public static final Block STORE_SHELF = register("store_shelf",
			new Block(settings(MapColor.GRAY).strength(0.9F).sounds(BlockSoundGroup.METAL)));
	public static final Block WAREHOUSE_CONCRETE = register("warehouse_concrete",
			new Block(settings(MapColor.GRAY).strength(2.4F, 15.0F).sounds(BlockSoundGroup.STONE)));
	public static final Block WAREHOUSE_FLOOR = register("warehouse_floor",
			new Block(settings(MapColor.GRAY).strength(2.4F, 15.0F).sounds(BlockSoundGroup.STONE)));

	// --- The Wrong Minecraft / The Impossible ---------------------------------------------------

	public static final Block WRONG_GRASS = register("wrong_grass",
			new WrongGrassBlock(settings(MapColor.GREEN).strength(0.6F).sounds(BlockSoundGroup.GRASS)));
	public static final Block IMPOSSIBLE_GRASS = register("impossible_grass",
			new Block(settings(MapColor.BLACK).strength(0.6F).sounds(BlockSoundGroup.GRASS)));
	public static final Block IMPOSSIBLE_LEAVES = register("impossible_leaves",
			new Block(settings(MapColor.WHITE).strength(0.3F).nonOpaque().sounds(BlockSoundGroup.AZALEA_LEAVES)));
	public static final Block IMPOSSIBLE_LOG = register("impossible_log",
			new PillarBlock(settings(MapColor.TERRACOTTA_WHITE).strength(2.0F).sounds(BlockSoundGroup.WOOD)));

	// --- The civilization that was not there ----------------------------------------------------

	public static final Block ANCIENT_BRICK = register("ancient_brick",
			new Block(settings(MapColor.TERRACOTTA_LIGHT_GRAY).strength(2.2F, 20.0F)
					.sounds(BlockSoundGroup.DEEPSLATE_BRICKS)));
	public static final Block ANCIENT_PILLAR = register("ancient_pillar",
			new PillarBlock(settings(MapColor.TERRACOTTA_LIGHT_GRAY).strength(2.2F, 20.0F)
					.sounds(BlockSoundGroup.DEEPSLATE_BRICKS)));
	public static final Block ANCIENT_STATUE = register("ancient_statue",
			new AncientStatueBlock(settings(MapColor.OFF_WHITE).strength(2.0F, 20.0F).sounds(BlockSoundGroup.STONE)));

	// --- The Signal -----------------------------------------------------------------------------

	public static final Block SIGNAL_CASING = register("signal_casing",
			new Block(settings(MapColor.IRON_GRAY).strength(3.0F, 20.0F).sounds(BlockSoundGroup.COPPER)));
	public static final Block SIGNAL_MACHINE = register("signal_machine",
			new SignalMachineBlock(settings(MapColor.RED).strength(3.5F, 25.0F).luminance(state -> 8)
					.sounds(BlockSoundGroup.COPPER)));

	// --- Dimensions -----------------------------------------------------------------------------

	public static final Block FOG_MOSS = register("fog_moss",
			new Block(settings(MapColor.GRAY).strength(0.6F).sounds(BlockSoundGroup.MOSS_BLOCK)));
	public static final Block FOG_STONE = register("fog_stone",
			new Block(settings(MapColor.GRAY).strength(1.8F).sounds(BlockSoundGroup.STONE)));

	/** Shortcut for {@code AbstractBlock.Settings.create().mapColor(...)}. */
	public static AbstractBlock.Settings settings(MapColor color) {
		return AbstractBlock.Settings.create().mapColor(color).pistonBehavior(PistonBehavior.NORMAL);
	}

	private static Block register(String path, Block block) {
		return Registry.register(Registries.BLOCK, BeyondTheLimits.id(path), block);
	}

	/** Blocks Corrupted Land is allowed to eat. */
	public static boolean isCorruptible(BlockState state) {
		if (state == null) {
			return false;
		}

		if (state.isIn(BtlTags.CORRUPTION_IMMUNE)) {
			return false;
		}

		return state.isOf(net.minecraft.block.Blocks.GRASS_BLOCK)
				|| state.isOf(net.minecraft.block.Blocks.DIRT)
				|| state.isOf(net.minecraft.block.Blocks.COARSE_DIRT)
				|| state.isOf(net.minecraft.block.Blocks.PODZOL)
				|| state.isOf(net.minecraft.block.Blocks.MYCELIUM)
				|| state.isOf(net.minecraft.block.Blocks.MOSS_BLOCK)
				|| state.isOf(net.minecraft.block.Blocks.STONE)
				|| state.isOf(net.minecraft.block.Blocks.DEEPSLATE)
				|| state.isOf(net.minecraft.block.Blocks.SAND)
				|| state.isOf(net.minecraft.block.Blocks.RED_SAND)
				|| state.isOf(net.minecraft.block.Blocks.GRAVEL)
				|| state.isOf(net.minecraft.block.Blocks.SHORT_GRASS)
				|| state.isOf(net.minecraft.block.Blocks.TALL_GRASS)
				|| state.isOf(net.minecraft.block.Blocks.FERN)
				|| state.isOf(net.minecraft.block.Blocks.LARGE_FERN)
				|| state.isOf(net.minecraft.block.Blocks.OAK_LEAVES)
				|| state.isOf(net.minecraft.block.Blocks.SPRUCE_LEAVES)
				|| state.isOf(net.minecraft.block.Blocks.BIRCH_LEAVES)
				|| state.isOf(net.minecraft.block.Blocks.JUNGLE_LEAVES)
				|| state.isOf(net.minecraft.block.Blocks.ACACIA_LEAVES)
				|| state.isOf(net.minecraft.block.Blocks.DARK_OAK_LEAVES)
				|| state.isOf(WRONG_GRASS);
	}

	/** Blocks bleeding veins are allowed to consume. */
	public static boolean isBleedable(BlockState state) {
		if (state == null || state.isAir()) {
			return false;
		}

		if (!state.isIn(BtlTags.BLEEDABLE)) {
			return false;
		}

		return true;
	}

	/** Blocks that a rift can "see" through, used by the rift renderer for sanity pruning. */
	public static boolean isRiftTransparent(BlockState state) {
		return state.isAir() || state.isIn(BtlTags.RIFT_TRANSPARENT);
	}

	public static void register() {
		BeyondTheLimits.LOGGER.debug("[Beyond the Limits] Registered blocks: corrupted land, rifts, the Code Verse, "
				+ "the Backrooms, the Wrong Minecraft, the Impossible and the Signal");
	}
}
