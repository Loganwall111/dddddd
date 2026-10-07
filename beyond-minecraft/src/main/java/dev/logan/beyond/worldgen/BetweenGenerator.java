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
 * The Between: the bubble hub the Tear opens onto. A cracked two-tone puzzle floor floats in a
 * void of drifting worlds; the bubbles themselves are drawn by the continuum shader, and each one
 * has a crystal heart you can fly to. The shell material appears here
 * lit pocket biomes. The centre is a genuine abyss: no floor at all, so falling there drops you
 * into the labyrinth rather than a void death.
 */
public class BetweenGenerator extends ChunkGenerator {
    private static final int FLOOR = 40;
    private static final int FLOOR_EDGE = 520;
    private static final int ABYSS = 34;
    private static final int BUBBLE_SPACING = 132;
    public static final MapCodec<BetweenGenerator> CODEC = RecordCodecBuilder.mapCodec(instance -> instance.group(
        BiomeSource.CODEC.fieldOf("biome_source").forGetter(generator -> generator.biomeSource),
        com.mojang.serialization.Codec.STRING.fieldOf("material").forGetter(generator -> generator.material),
        com.mojang.serialization.Codec.STRING.optionalFieldOf("accent", "").forGetter(generator -> generator.accent),
        com.mojang.serialization.Codec.STRING.optionalFieldOf("shell", "").forGetter(generator -> generator.shell)
    ).apply(instance, BetweenGenerator::new));
    private final BiomeSource biomeSource;
    private final String material, accent, shell;
    public BetweenGenerator(BiomeSource biomeSource, String material, String accent, String shell) {
        super(biomeSource);
        this.biomeSource = biomeSource; this.material = material; this.accent = accent; this.shell = shell;
    }
    @Override protected MapCodec<? extends ChunkGenerator> getCodec() { return CODEC; }
    private BlockState state(String id, BlockState fallback) {
        if (id == null || id.isEmpty()) return fallback;
        var block = Registries.BLOCK.get(BeyondMinecraft.id(id.contains(":") ? id.substring(id.indexOf(':') + 1) : id));
        return block == Blocks.AIR && !id.endsWith("air") ? fallback : block.getDefaultState();
    }
    /** Bubble centres on a jittered lattice: shells of other worlds, hollow and walkable inside. */
    private double[] bubbleAt(int cx, int cz) {
        int jx = BeyondWorldgen.hash(cx, 7, cz, 4242);
        int jz = BeyondWorldgen.hash(cx, 11, cz, 8484);
        double x = cx * BUBBLE_SPACING + Math.floorMod(jx, 60) - 30;
        double z = cz * BUBBLE_SPACING + Math.floorMod(jz, 60) - 30;
        double r = 16 + Math.floorMod(BeyondWorldgen.hash(cx, 13, cz, 99), 14);
        return new double[]{x, r, z};
    }
    @Override public CompletableFuture<Chunk> populateNoise(Blender blender, NoiseConfig noiseConfig,
                                                            StructureAccessor accessor, Chunk chunk) {
        BlockState light = state(material, Blocks.WHITE_CONCRETE.getDefaultState());
        BlockState dark = state(accent, Blocks.BLACK_CONCRETE.getDefaultState());
        BlockState glass = state(shell, Blocks.GLASS.getDefaultState());
        ChunkPos pos = chunk.getPos();
        int startX = pos.getStartX(), startZ = pos.getStartZ();
        BlockPos.Mutable cursor = new BlockPos.Mutable();
        for (int lx = 0; lx < 16; lx++) {
            for (int lz = 0; lz < 16; lz++) {
                int x = startX + lx, z = startZ + lz;
                double radius = Math.sqrt((double) x * x + (double) z * z);
                boolean inAbyss = radius < ABYSS;
                boolean onPlate = radius < FLOOR_EDGE;
                if (onPlate && !inAbyss) {
                    boolean edge = Math.floorMod(x, 6) == 0 || Math.floorMod(z, 6) == 0;
                    boolean puzzle = edge || (Math.floorMod(x / 6 + z / 6, 2) == 0);
                    cursor.set(x, FLOOR, z);
                    chunk.setBlockState(cursor, puzzle ? light : dark, false);
                    // Cracked: some tiles are missing, and the holes drop into the labyrinth.
                    if (Math.floorMod(BeyondWorldgen.hash(x, 3, z, 5150), 61) == 0) chunk.setBlockState(cursor, Blocks.AIR.getDefaultState(), false);
                }
                if (!onPlate && radius < FLOOR_EDGE + 40) {
                    // A floating shelf ring beyond the plate, so the hub reads as broken, not finite.
                    if (Math.floorMod(BeyondWorldgen.hash(x, 5, z, 3131), 23) == 0 && radius > FLOOR_EDGE) {
                        cursor.set(x, FLOOR - 6, z);
                        chunk.setBlockState(cursor, dark, false);
                    }
                }
                for (int bx = -2; bx <= 2; bx++) {
                    for (int bz = -2; bz <= 2; bz++) {
                        double[] bubble = bubbleAt(Math.floorDiv(x, BUBBLE_SPACING) + bx, Math.floorDiv(z, BUBBLE_SPACING) + bz);
                        double dx = x - bubble[0], dz = z - bubble[2];
                        double radial = Math.sqrt(dx * dx + dz * dz);
                        if (radial > bubble[1] + 2) continue;
                        int centreY = FLOOR + 22 + (int) (bubble[1] * .9);
                        // The bubbles themselves are drawn by the continuum shader, not carved out of
                        // blocks: a shell of glass here would read as a dome sitting inside the real
                        // thing. What stays physical is the heart of each bubble — a small crystal
                        // seed you can fly to, and shards drifting inside it — so the void is still
                        // somewhere you can go rather than a picture.
                        for (int y = centreY - 4; y <= centreY + 4; y++) {
                            double distance = Math.sqrt(radial * radial + (double) (y - centreY) * (y - centreY));
                            if (y <= FLOOR) continue;
                            boolean seed = distance < 2.6;
                            boolean shard = !seed && distance < bubble[1] - 4
                                && Math.floorMod(BeyondWorldgen.hash(x, y, z, 6060), 41) == 0;
                            if (!seed && !shard) continue;
                            cursor.set(x, y, z);
                            chunk.setBlockState(cursor, seed ? light : glass, false);
                        }
                    }
                }
            }
        }
        // An arrival ring floats over the abyss: it is the only safe floor near the centre, and it
        // exists so stepping through a Tear does not drop you straight out of the world. It is two
        // blocks thick — a one-block slab bridging a drop into the labyrinth is a trap door, and the
        // slab is the only realm material near the hub's centre, so it has to read as real floor
        // from any angle and be found by the arrival search above it.
        int platformY = FLOOR + 9;
        for (int lx = 0; lx < 16; lx++) {
            for (int lz = 0; lz < 16; lz++) {
                int x = startX + lx, z = startZ + lz;
                double radius = Math.sqrt((double) x * x + (double) z * z);
                boolean ring = radius > 9 && radius < 27;
                boolean bridge = radius <= ABYSS + 6 && (Math.abs(x) < 3 || Math.abs(z) < 3);
                if (!ring && !bridge) continue;
                boolean puzzle = (Math.floorMod(x / 3 + z / 3, 2) == 0) || Math.abs(x) < 3 || Math.abs(z) < 3;
                cursor.set(x, platformY, z);
                chunk.setBlockState(cursor, puzzle ? light : dark, false);
                cursor.set(x, platformY + 1, z);
                chunk.setBlockState(cursor, puzzle ? light : dark, false);
                // A sparse crown of lit tiles sits on the walkway so the ring reads as built, not poured.
                if (ring && Math.floorMod(BeyondWorldgen.hash(x, 1, z, 7171), 19) == 0) {
                    cursor.set(x, platformY + 2, z);
                    chunk.setBlockState(cursor, light, false);
                }
            }
        }
        return CompletableFuture.completedFuture(chunk);
    }
    @Override public int getHeight(int x, int z, Heightmap.Type heightmap, HeightLimitView world, NoiseConfig noiseConfig) {
        double radius = Math.sqrt((double) x * x + (double) z * z);
        return radius < FLOOR_EDGE && radius >= ABYSS ? FLOOR + 1 : world.getBottomY() + 1;
    }
    @Override public VerticalBlockSample getColumnSample(int x, int z, HeightLimitView world, NoiseConfig noiseConfig) {
        BlockState[] states = new BlockState[world.getHeight()];
        BlockState light = state(material, Blocks.WHITE_CONCRETE.getDefaultState());
        double radius = Math.sqrt((double) x * x + (double) z * z);
        boolean plate = radius < FLOOR_EDGE && radius >= ABYSS;
        for (int y = 0; y < states.length; y++) {
            int gy = world.getBottomY() + y;
            states[y] = plate && gy <= FLOOR ? light : Blocks.AIR.getDefaultState();
        }
        return new VerticalBlockSample(world.getBottomY(), states);
    }
    @Override public void getDebugHudText(List<String> text, NoiseConfig noiseConfig, BlockPos pos) {
        text.add("Beyond the Between · bubble hub");
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
