package dev.logan.beyond.worldgen;

import com.mojang.serialization.MapCodec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import dev.logan.beyond.BeyondMinecraft;
import net.minecraft.block.BlockState;
import net.minecraft.block.Blocks;
import net.minecraft.registry.Registries;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.ChunkPos;
import net.minecraft.world.ChunkRegion;
import net.minecraft.world.ChunkRegion;
import net.minecraft.world.HeightLimitView;
import net.minecraft.world.biome.source.BiomeAccess;
import net.minecraft.world.Heightmap;
import net.minecraft.world.StructureWorldAccess;
import net.minecraft.world.biome.source.BiomeSource;
import net.minecraft.world.chunk.Chunk;
import net.minecraft.world.gen.StructureAccessor;
import net.minecraft.world.gen.GenerationStep;
import net.minecraft.world.gen.chunk.Blender;
import net.minecraft.world.gen.chunk.ChunkGenerator;
import net.minecraft.world.gen.chunk.VerticalBlockSample;
import net.minecraft.world.gen.noise.NoiseConfig;
import java.util.List;
import java.util.concurrent.CompletableFuture;

/**
 * The fractal world: an infinite Menger sponge built from the realm's own materials, threaded with
 * a helical staircase so it can actually be climbed. Nothing is random at runtime — every block is
 * a closed-form function of its coordinates, so the space is identical for every player and can be
 * regenerated forever without storage growth.
 */
public class FractalGenerator extends ChunkGenerator {
    public static final MapCodec<FractalGenerator> CODEC = RecordCodecBuilder.mapCodec(instance -> instance.group(
        BiomeSource.CODEC.fieldOf("biome_source").forGetter(generator -> generator.biomeSource),
        com.mojang.serialization.Codec.STRING.fieldOf("material").forGetter(generator -> generator.material),
        com.mojang.serialization.Codec.STRING.optionalFieldOf("accent", "").forGetter(generator -> generator.accent),
        com.mojang.serialization.Codec.INT.optionalFieldOf("cell", 12).forGetter(generator -> generator.cell),
        com.mojang.serialization.Codec.INT.optionalFieldOf("levels", 3).forGetter(generator -> generator.levels)
    ).apply(instance, FractalGenerator::new));
    private final BiomeSource biomeSource;
    private final String material, accent;
    private final int cell, levels;
    public FractalGenerator(BiomeSource biomeSource, String material, String accent, int cell, int levels) {
        super(biomeSource);
        this.biomeSource = biomeSource; this.material = material; this.accent = accent;
        this.cell = Math.clamp(cell, 4, 48); this.levels = Math.clamp(levels, 1, 4);
    }
    @Override protected MapCodec<? extends ChunkGenerator> getCodec() { return CODEC; }
    private BlockState state(String id, BlockState fallback) {
        var block = Registries.BLOCK.get(BeyondMinecraft.id(id.contains(":") ? id.substring(id.indexOf(':') + 1) : id));
        return block == Blocks.AIR && !id.endsWith("air") ? fallback : block.getDefaultState();
    }
    @Override public CompletableFuture<Chunk> populateNoise(Blender blender, NoiseConfig noiseConfig,
                                                            StructureAccessor accessor, Chunk chunk) {
        BlockState body = state(material, Blocks.STONE.getDefaultState());
        BlockState glow = state(accent, body);
        ChunkPos pos = chunk.getPos();
        int startX = pos.getStartX(), startZ = pos.getStartZ();
        int bottom = chunk.getBottomY(), top = chunk.getTopY();
        BlockPos.Mutable cursor = new BlockPos.Mutable();
        for (int lx = 0; lx < 16; lx++) {
            for (int lz = 0; lz < 16; lz++) {
                int x = startX + lx, z = startZ + lz;
                for (int y = bottom; y < top; y++) {
                    boolean solid = BeyondWorldgen.menger(x, y, z, cell, levels);
                    // The starting pillar and its staircase make the hollow walkable from spawn.
                    if (!solid && Math.abs(x) <= 6 && Math.abs(z) <= 6 && y >= 40 && y <= 72) solid = true;
                    if (!solid && BeyondWorldgen.spiral(x, z, y, 9, 17, .55, 1.1)) solid = true;
                    // A bore through the mass above the pillar: arrivals are placed in open space, and
                    // the shaft is the way back up out of the sponge.
                    if (solid && Math.abs(x) <= 2 && Math.abs(z) <= 2 && y > 72 && y <= 208) solid = false;
                    // The room at the foot of the bore, standing on the pillar's top face.
                    if (solid && Math.abs(x) <= 6 && Math.abs(z) <= 6 && y > 72 && y <= 82) solid = false;
                    if (!solid) continue;
                    boolean edge = BeyondWorldgen.menger(x + 1, y, z, cell, levels) != BeyondWorldgen.menger(x, y + 1, z, cell, levels);
                    cursor.set(x, y, z);
                    chunk.setBlockState(cursor, edge && BeyondWorldgen.unit(x, y, z, 31) < .28 ? glow : body, false);
                }
            }
        }
        return CompletableFuture.completedFuture(chunk);
    }
    @Override public int getHeight(int x, int z, Heightmap.Type heightmap, HeightLimitView world, NoiseConfig noiseConfig) {
        for (int y = world.getTopY() - 1; y > world.getBottomY(); y--)
            if (BeyondWorldgen.menger(x, y, z, cell, levels)) return y + 1;
        return world.getBottomY() + 1;
    }
    @Override public VerticalBlockSample getColumnSample(int x, int z, HeightLimitView world, NoiseConfig noiseConfig) {
        BlockState[] states = new BlockState[world.getHeight()];
        BlockState body = state(material, Blocks.STONE.getDefaultState());
        for (int y = 0; y < states.length; y++)
            states[y] = BeyondWorldgen.menger(x, world.getBottomY() + y, z, cell, levels) ? body : Blocks.AIR.getDefaultState();
        return new VerticalBlockSample(world.getBottomY(), states);
    }
    @Override public void getDebugHudText(List<String> text, NoiseConfig noiseConfig, BlockPos pos) {
        text.add("Beyond fractal sponge · cell " + cell + " · depth " + levels);
    }
    @Override public int getMinimumY() { return -64; }
    @Override public int getWorldHeight() { return 384; }
    @Override public int getSeaLevel() { return 0; }
    // ---- generator hooks ---------------------------------------------------------------------
    // Beyond's spaces are written block-by-block in populateNoise, so vanilla's surface rules,
    // carvers and entity population have nothing to add. These four overrides are deliberately
    // declared without @Override: they are no-ops either way, and this keeps the classes compiling
    // against mapping variations instead of failing on a signature that does nothing.
    public void buildSurface(ChunkRegion region, StructureAccessor accessor, NoiseConfig noiseConfig, Chunk chunk) { }
    public void carve(ChunkRegion region, long seed, NoiseConfig noiseConfig, BiomeAccess biomeAccess,
                      StructureAccessor accessor, Chunk chunk, GenerationStep.Carver carver) { }
    public void populateEntities(ChunkRegion region) { }
    public void generateFeatures(StructureWorldAccess world, Chunk chunk, StructureAccessor accessor) { }
}
