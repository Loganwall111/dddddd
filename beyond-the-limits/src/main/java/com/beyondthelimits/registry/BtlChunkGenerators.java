package com.beyondthelimits.registry;

import com.beyondthelimits.BeyondTheLimits;
import com.beyondthelimits.world.gen.BackroomsChunkGenerator;
import com.beyondthelimits.world.gen.CodescapeChunkGenerator;
import com.mojang.serialization.MapCodec;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;
import net.minecraft.world.gen.chunk.ChunkGenerator;

/**
 * The two generators that cannot be expressed as data: the Backrooms (a procedural architecture
 * engine) and the Codescape shell (a world made of floating source monoliths over nothing).
 *
 * <p>Everything else in the mod uses vanilla generators configured by datapack JSON, which is why
 * the Fog Dimension, the Mirror World, the Wrong Minecraft and the Impossible cost the codebase
 * almost nothing.</p>
 */
public final class BtlChunkGenerators {
	private BtlChunkGenerators() {
	}

	public static final MapCodec<BackroomsChunkGenerator> BACKROOMS = BackroomsChunkGenerator.CODEC;
	public static final MapCodec<CodescapeChunkGenerator> CODESCAPE_SHELL = CodescapeChunkGenerator.CODEC;

	public static void register() {
		Registry.register(Registries.CHUNK_GENERATOR, BeyondTheLimits.id("backrooms"), BACKROOMS);
		Registry.register(Registries.CHUNK_GENERATOR, BeyondTheLimits.id("codescape_shell"), CODESCAPE_SHELL);
	}
}
