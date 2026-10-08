package com.beyondthelimits.world.gen;

import com.beyondthelimits.BeyondTheLimits;
import com.beyondthelimits.registry.BtlBlocks;
import com.mojang.serialization.MapCodec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import net.minecraft.block.BlockState;
import net.minecraft.block.Blocks;
import net.minecraft.registry.RegistryEntryLookup;
import net.minecraft.registry.RegistryKey;
import net.minecraft.registry.RegistryKeys;
import net.minecraft.registry.RegistryOps;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.ChunkPos;
import net.minecraft.util.math.random.Random;
import net.minecraft.world.ChunkRegion;
import net.minecraft.world.HeightLimitView;
import net.minecraft.world.Heightmap;
import net.minecraft.world.biome.Biome;
import net.minecraft.world.biome.source.BiomeAccess;
import net.minecraft.world.biome.source.FixedBiomeSource;
import net.minecraft.world.chunk.Chunk;
import net.minecraft.world.gen.GenerationStep;
import net.minecraft.world.gen.StructureAccessor;
import net.minecraft.world.gen.chunk.Blender;
import net.minecraft.world.gen.chunk.ChunkGenerator;
import net.minecraft.world.gen.chunk.VerticalBlockSample;
import net.minecraft.world.gen.noise.NoiseConfig;

/**
 * The Code Verse.
 *
 * <p>There is no ground here and there is no sky either: there is source. The world is a field of
 * enormities — monoliths of Minecraft's own code, floating in nothing, with loops, class declarations
 * and stack traces legible across their faces — placed by a hash of their chunk coordinate, so the
 * layout is stable within a world and never the same between two of them.</p>
 *
 * <p>One rule is enforced: every island gets a ledge, because this dimension is meant to be walked.</p>
 */
public class CodescapeChunkGenerator extends ChunkGenerator {
	public static final MapCodec<CodescapeChunkGenerator> CODEC = RecordCodecBuilder.mapCodec(instance ->
			instance.group(RegistryOps.getEntryLookupCodec(RegistryKeys.BIOME))
					.apply(instance, instance.stable(CodescapeChunkGenerator::new)));

	public CodescapeChunkGenerator(RegistryEntryLookup<Biome> biomeRegistry) {
		super(new FixedBiomeSource(biomeRegistry.getOrThrow(
				RegistryKey.of(RegistryKeys.BIOME, BeyondTheLimits.id("codescape")))));
	}

	@Override
	protected MapCodec<? extends ChunkGenerator> getCodec() {
		return CODEC;
	}

	@Override
	public void carve(ChunkRegion region, long seed, NoiseConfig noiseConfig, BiomeAccess biomeAccess,
			StructureAccessor structureAccessor, Chunk chunk, GenerationStep.Carver carver) {
	}

	@Override
	public void buildSurface(ChunkRegion region, StructureAccessor structureAccessor, NoiseConfig noiseConfig, Chunk chunk) {
	}

	@Override
	public void populateEntities(ChunkRegion region) {
	}

	@Override
	public int getWorldHeight() {
		return 0;
	}

	@Override
	public CompletableFuture<Chunk> populateNoise(Blender blender, NoiseConfig noiseConfig,
			StructureAccessor structureAccessor, Chunk chunk) {
		ChunkPos pos = chunk.getPos();
		Random random = Random.create(pos.x * 341873128712L + pos.z * 132897987541L);

		// Two thirds of chunks hold a monolith; the rest are empty, so the void reads as void.
		if (random.nextInt(3) != 0) {
			island(chunk, random, pos);
		}

		return CompletableFuture.completedFuture(chunk);
	}

	private void island(Chunk chunk, Random random, ChunkPos pos) {
		int baseX = pos.getStartX();
		int baseZ = pos.getStartZ();
		int centreY = 48 + random.nextInt(90);
		int width = Math.min(14, 6 + random.nextInt(9));
		int height = 10 + random.nextInt(40);
		int depth = Math.min(14, 6 + random.nextInt(9));
		int ox = random.nextInt(Math.max(1, 16 - width));
		int oz = random.nextInt(Math.max(1, 16 - depth));

		for (int x = 0; x < width; x++) {
			for (int z = 0; z < depth; z++) {
				for (int y = 0; y < height; y++) {
					boolean edge = x == 0 || z == 0 || x == width - 1 || z == depth - 1;
					boolean band = y % 9 == 0;
					BlockState state = edge ? BtlBlocks.CODE_PANEL.getDefaultState()
							: band ? BtlBlocks.CODE_BRICK.getDefaultState() : Blocks.AIR.getDefaultState();

					if (state.isAir()) {
						continue;
					}

					chunk.setBlockState(new BlockPos(baseX + ox + x, centreY + y, baseZ + oz + z), state, false);
				}
			}
		}

		// The readable face: a monolith standing on the island.
		BlockPos crown = new BlockPos(baseX + ox + width - 1, centreY, baseZ + oz);
		int crownHeight = 4 + random.nextInt(10);

		for (int y = 0; y < crownHeight; y++) {
			chunk.setBlockState(crown.add(0, y, 0), BtlBlocks.CODE_MONOLITH.getDefaultState(), false);
			chunk.setBlockState(crown.add(0, y, 1), BtlBlocks.CODE_MONOLITH.getDefaultState(), false);
		}

		// The ledge: this dimension is meant to be walked.
		for (int x = 0; x < width; x++) {
			chunk.setBlockState(new BlockPos(baseX + ox + x, centreY + height, baseZ + oz),
					BtlBlocks.CODE_BRICK.getDefaultState(), false);
			chunk.setBlockState(new BlockPos(baseX + ox + x, centreY + height, baseZ + oz + depth - 1),
					BtlBlocks.CODE_BRICK.getDefaultState(), false);
		}
	}

	@Override
	public int getSeaLevel() {
		return 0;
	}

	@Override
	public int getMinimumY() {
		return 0;
	}

	@Override
	public int getHeight(int x, int z, Heightmap.Type heightmapType, HeightLimitView heightLimitView, NoiseConfig noiseConfig) {
		return 0;
	}

	@Override
	public VerticalBlockSample getColumnSample(int x, int z, HeightLimitView heightLimitView, NoiseConfig noiseConfig) {
		return new VerticalBlockSample(0, new BlockState[0]);
	}

	@Override
	public void getDebugHudText(List<String> list, NoiseConfig noiseConfig, BlockPos blockPos) {
		list.add("Code Verse: monolith field");
	}
}
