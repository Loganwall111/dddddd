package dev.logan.beyond.worldgen;

import com.mojang.serialization.MapCodec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import dev.logan.beyond.BeyondMinecraft;
import net.minecraft.block.BlockState;
import net.minecraft.block.Blocks;
import net.minecraft.registry.Registries;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.ChunkPos;
import net.minecraft.world.HeightLimitView;
import net.minecraft.world.Heightmap;
import net.minecraft.world.StructureWorldAccess;
import net.minecraft.world.biome.source.BiomeSource;
import net.minecraft.world.chunk.Chunk;
import net.minecraft.world.gen.StructureAccessor;
import net.minecraft.world.gen.chunk.Blender;
import net.minecraft.world.gen.chunk.ChunkGenerator;
import net.minecraft.world.gen.chunk.VerticalBlockSample;
import net.minecraft.world.gen.noise.NoiseConfig;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;

/**
 * The endless white labyrinth. Layer after layer of walls and broken floor descend through the
 * world; falling through a gap drops you into the next maze rather than out of the world. Every
 * wall, gap and stair is a deterministic function of the coordinates, so it is the same maze for
 * everyone and continues as far as the world height allows.
 */
public class LabyrinthGenerator extends ChunkGenerator {
    private static final int LAYER = 6;
    public static final MapCodec<LabyrinthGenerator> CODEC = RecordCodecBuilder.mapCodec(instance -> instance.group(
        BiomeSource.CODEC.fieldOf("biome_source").forGetter(generator -> generator.biomeSource),
        com.mojang.serialization.Codec.STRING.fieldOf("material").forGetter(generator -> generator.material),
        com.mojang.serialization.Codec.STRING.optionalFieldOf("accent", "").forGetter(generator -> generator.accent),
        com.mojang.serialization.Codec.INT.optionalFieldOf("cell", 7).forGetter(generator -> generator.cell)
    ).apply(instance, LabyrinthGenerator::new));
    private final BiomeSource biomeSource;
    private final String material, accent;
    private final int cell;
    public LabyrinthGenerator(BiomeSource biomeSource, String material, String accent, int cell) {
        super(biomeSource);
        this.biomeSource = biomeSource; this.material = material; this.accent = accent;
        this.cell = Math.clamp(cell, 4, 16);
    }
    @Override protected MapCodec<? extends ChunkGenerator> getCodec() { return CODEC; }
    private BlockState state(String id, BlockState fallback) {
        var block = Registries.BLOCK.get(BeyondMinecraft.id(id.contains(":") ? id.substring(id.indexOf(':') + 1) : id));
        return block == Blocks.AIR && !id.endsWith("air") ? fallback : block.getDefaultState();
    }
    /** True where a wall stands: on cell borders, minus deterministic doorways. */
    private boolean wall(int x, int z, int y, long seed) {
        int cx = Math.floorDiv(x, cell), cz = Math.floorDiv(z, cell);
        int lx = Math.floorMod(x, cell), lz = Math.floorMod(z, cell);
        boolean border = lx == 0 || lz == 0;
        if (!border) return false;
        int level = Math.floorDiv(y, LAYER);
        int doorSeed = BeyondWorldgen.hash(cx, level, cz, seed);
        // Doors: one opening per cell edge, so every layer is a real, connected maze.
        if (lx == 0 && lz != 0) return Math.floorMod(doorSeed, 3) != 0;
        if (lz == 0 && lx != 0) return Math.floorMod(doorSeed >> 4, 3) != 0;
        return true;
    }
    /** Floors are broken: one gap per cell per layer, which is how you descend. */
    private boolean floorGap(int x, int z, int level, long seed) {
        int cx = Math.floorDiv(x, cell), cz = Math.floorDiv(z, cell);
        return Math.floorMod(BeyondWorldgen.hash(cx, level * 31, cz, seed), 5) == 0
            && Math.floorMod(x + z, 3) == 0;
    }
    @Override public CompletableFuture<Chunk> populateNoise(Executor executor, Blender blender, NoiseConfig noiseConfig,
                                                            StructureAccessor accessor, Chunk chunk) {
        BlockState body = state(material, Blocks.WHITE_CONCRETE);
        BlockState line = state(accent, Blocks.BLACK_CONCRETE);
        ChunkPos pos = chunk.getPos();
        int startX = pos.getStartX(), startZ = pos.getStartZ();
        int bottom = chunk.getBottomY(), top = chunk.getTopY();
        long seed = 0xBE7E9BL;
        BlockPos.Mutable cursor = new BlockPos.Mutable();
        for (int lx = 0; lx < 16; lx++) {
            for (int lz = 0; lz < 16; lz++) {
                int x = startX + lx, z = startZ + lz;
                for (int y = bottom; y < top; y++) {
                    int inLayer = Math.floorMod(y, LAYER);
                    int level = Math.floorDiv(y, LAYER);
                    boolean place;
                    if (inLayer == 0) place = !floorGap(x, z, level, seed);                  // the floor of this maze
                    else if (inLayer <= 3) place = wall(x, z, y, seed);                       // its walls
                    else if (inLayer == 4) place = (Math.floorMod(x + z, 9) == 0) && BeyondWorldgen.unit(x, y, z, 77) < .3; // ceiling ribs
                    else place = false;
                    // The spawn chamber: a clean shaft at the origin so a player arrives somewhere sane.
                    if (Math.abs(x) < 8 && Math.abs(z) < 8 && y > 52 && y < 66) place = y == 52 || (Math.abs(x) == 7 || Math.abs(z) == 7);
                    if (!place) continue;
                    boolean lineWork = inLayer == 0 && (Math.floorMod(x, cell) == 0 || Math.floorMod(z, cell) == 0);
                    cursor.set(x, y, z);
                    chunk.setBlockState(cursor, lineWork ? line : body, false);
                }
            }
        }
        return CompletableFuture.completedFuture(chunk);
    }
    @Override public int getHeight(int x, int z, Heightmap.Type heightmap, HeightLimitView world, NoiseConfig noiseConfig) {
        // Report the top of the highest maze layer so spawn searches land on a floor, not in a wall.
        for (int y = world.getTopY() - 1; y > world.getBottomY(); y--)
            if (Math.floorMod(y, LAYER) == 0 && !floorGap(x, z, Math.floorDiv(y, LAYER), 0xBE7E9BL)) return y + 1;
        return world.getBottomY() + 1;
    }
    @Override public VerticalBlockSample getColumnSample(int x, int z, HeightLimitView world, NoiseConfig noiseConfig) {
        BlockState[] states = new BlockState[world.getHeight()];
        BlockState body = state(material, Blocks.WHITE_CONCRETE);
        for (int y = 0; y < states.length; y++) {
            int gy = world.getBottomY() + y;
            int inLayer = Math.floorMod(gy, LAYER);
            boolean solid = inLayer == 0 ? !floorGap(x, z, Math.floorDiv(gy, LAYER), 0xBE7E9BL) : inLayer <= 3 && wall(x, z, gy, 0xBE7E9BL);
            states[y] = solid ? body : Blocks.AIR.getDefaultState();
        }
        return new VerticalBlockSample(world.getBottomY(), states);
    }
    @Override public void getDebugHudText(List<String> text, NoiseConfig noiseConfig, BlockPos pos) {
        text.add("Beyond labyrinth · layer " + Math.floorDiv(pos.getY(), LAYER));
    }
    @Override public int getMinimumY() { return -64; }
    @Override public int getWorldHeight() { return 384; }
    @Override public int getSeaLevel() { return 0; }
    @Override public void generateFeatures(StructureWorldAccess world, Chunk chunk, StructureAccessor accessor) { }
}
