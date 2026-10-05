package dev.logan.beyondthreshold.world;

import dev.logan.beyondthreshold.BTTGeneratedContent;
import dev.logan.beyondthreshold.BeyondTheThreshold;
import net.minecraft.registry.BuiltinRegistries;
import net.minecraft.registry.Registry;
import net.minecraft.registry.RegistryKey;
import net.minecraft.registry.RegistryKeys;
import net.minecraft.registry.entry.RegistryEntry;
import net.minecraft.util.Identifier;
import net.minecraft.world.World;
import net.minecraft.world.biome.Biome;
import net.minecraft.world.biome.source.FixedBiomeSource;
import net.minecraft.world.dimension.DimensionOptions;
import net.minecraft.world.dimension.DimensionTypes;
import net.minecraft.world.gen.chunk.ChunkGenerator;
import net.minecraft.world.gen.chunk.NoiseChunkGenerator;
import net.minecraft.world.gen.chunk.NoiseGeneratorSettings;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Random;

/**
 * Procedural multiverse. Every dimension in {@link BTTGeneratedContent}
 * (produced by onepac.py) becomes a real registered dimension: vanilla
 * noise terrain + a fixed biome, then PaletteSwapper rebuilds the surface
 * from generated variant blocks and the client paints an alien sky/fog.
 */
public final class BTTDimensions {
	public static final List<RegistryKey<World>> ALL = new ArrayList<>();

	public static void register() {
		for (BTTGeneratedContent.GenDim d : BTTGeneratedContent.DIMENSIONS) {
			Optional<RegistryEntry.Reference<Biome>> biome =
					BuiltinRegistries.BIOME.getEntry(RegistryKey.of(RegistryKeys.BIOME, new Identifier(d.biome())));
			Optional<RegistryEntry.Reference<NoiseGeneratorSettings>> noise =
					BuiltinRegistries.NOISE_GENERATOR_SETTINGS.getEntry(NoiseGeneratorSettings.OVERWORLD);
			Optional<RegistryEntry.Reference<net.minecraft.world.dimension.DimensionType>> type =
					BuiltinRegistries.DIMENSION_TYPE.getEntry(DimensionTypes.OVERWORLD);
			if (biome.isEmpty() || noise.isEmpty() || type.isEmpty()) {
				BeyondTheThreshold.LOGGER.warn("[btt] skipping dimension {}: registry entry missing", d.id());
				continue;
			}
			ChunkGenerator gen = new NoiseChunkGenerator(new FixedBiomeSource(biome.get()), noise.get());
			DimensionOptions options = new DimensionOptions(type.get(), gen);
			Identifier id = new Identifier(BeyondTheThreshold.MOD_ID, d.id());
			Registry.register(BuiltinRegistries.DIMENSION, id, options);
			ALL.add(RegistryKey.of(RegistryKeys.WORLD, id));
		}
		BeyondTheThreshold.LOGGER.info("[btt] {} threshold dimensions woven into reality", ALL.size());
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
