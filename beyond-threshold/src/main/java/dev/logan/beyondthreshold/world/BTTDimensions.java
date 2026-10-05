package dev.logan.beyondthreshold.world;

import dev.logan.beyondthreshold.BTTGeneratedContent;
import dev.logan.beyondthreshold.BeyondTheThreshold;
import net.minecraft.registry.Registry;
import net.minecraft.registry.RegistryKey;
import net.minecraft.registry.RegistryKeys;
import net.minecraft.registry.entry.RegistryEntry;
import net.minecraft.server.MinecraftServer;
import net.minecraft.util.Identifier;
import net.minecraft.world.World;
import net.minecraft.world.biome.Biome;
import net.minecraft.world.biome.BiomeKeys;
import net.minecraft.world.biome.source.FixedBiomeSource;
import net.minecraft.world.dimension.DimensionOptions;
import net.minecraft.world.dimension.DimensionType;
import net.minecraft.world.dimension.DimensionTypes;
import net.minecraft.world.gen.chunk.ChunkGenerator;
import net.minecraft.world.gen.chunk.ChunkGeneratorSettings;
import net.minecraft.world.gen.chunk.NoiseChunkGenerator;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/**
 * Procedural multiverse. Every dimension in {@link BTTGeneratedContent}
 * (produced by onepac.py) becomes a real registered dimension when a
 * server starts: vanilla noise terrain + a fixed biome, then
 * PaletteSwapper rebuilds the surface from generated variant blocks and
 * the client paints an alien sky.
 */
public final class BTTDimensions {
	public static final List<RegistryKey<World>> ALL = new ArrayList<>();

	static {
		for (BTTGeneratedContent.GenDim d : BTTGeneratedContent.DIMENSIONS) {
			ALL.add(RegistryKey.of(RegistryKeys.WORLD,
					new Identifier(BeyondTheThreshold.MOD_ID, d.id())));
		}
	}

	public static void register(MinecraftServer server) {
		var manager = server.getRegistryManager();
		Registry<DimensionOptions> dims = manager.get(RegistryKeys.DIMENSION);
		Registry<ChunkGeneratorSettings> settings = manager.get(RegistryKeys.CHUNK_GENERATOR_SETTINGS);
		Registry<DimensionType> types = manager.get(RegistryKeys.DIMENSION_TYPE);
		Registry<Biome> biomes = manager.get(RegistryKeys.BIOME);

		RegistryEntry<ChunkGeneratorSettings> noise =
				settings.getEntry(ChunkGeneratorSettings.OVERWORLD).orElseThrow();
		RegistryEntry<DimensionType> type =
				types.getEntry(DimensionTypes.OVERWORLD).orElseThrow();

		int added = 0;
		for (int i = 0; i < ALL.size(); i++) {
			BTTGeneratedContent.GenDim d = BTTGeneratedContent.DIMENSIONS.get(i);
			if (dims.containsId(ALL.get(i).getValue())) {
				continue;
			}
			RegistryEntry<Biome> biome = biomes
					.getEntry(RegistryKey.of(RegistryKeys.BIOME, new Identifier(d.biome())))
					.orElseGet(() -> biomes.getEntry(BiomeKeys.PLAINS).orElseThrow());
			ChunkGenerator gen = new NoiseChunkGenerator(new FixedBiomeSource(biome), noise);
			Registry.register(dims, ALL.get(i).getValue(), new DimensionOptions(type, gen));
			added++;
		}
		BeyondTheThreshold.LOGGER.info("[btt] {} threshold dimensions woven into reality", added);
	}

	public static int indexOf(RegistryKey<World> key) {
		for (int i = 0; i < ALL.size(); i++) {
			if (ALL.get(i).equals(key)) {
				return i;
			}
		}
		return -1;
	}

	public static RegistryKey<World> byIndex(int i) {
		if (ALL.isEmpty()) {
			return World.OVERWORLD;
		}
		return ALL.get(Math.floorMod(i, ALL.size()));
	}

	public static RegistryKey<World> randomOther(Random random, RegistryKey<World> current) {
		if (ALL.isEmpty()) {
			return World.OVERWORLD;
		}
		RegistryKey<World> pick = byIndex(random.nextInt(ALL.size()));
		if (pick.equals(current)) {
			pick = byIndex(random.nextInt(ALL.size()) + 1);
		}
		return pick;
	}

	private BTTDimensions() {
	}
}
