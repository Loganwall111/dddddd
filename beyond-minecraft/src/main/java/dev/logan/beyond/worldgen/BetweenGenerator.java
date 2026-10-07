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

/**
 * The Between: the bubble hub the Tear opens onto. A cracked two-tone puzzle floor floats in a
 * white void, ringed by shells of other worlds' materials — you can see through their glass into
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
                        for (int y = centreY - (int) bubble[1] - 2; y <= centreY + (int) bubble[1] + 2; y++) {
                            double distance = Math.sqrt(radial * radial + (double) (y - centreY) * (y - centreY));
                            if (distance > bubble[1] + 1.6 || y <= FLOOR) continue;
                            boolean inShell = distance > bubble[1] - 1.6;
                            boolean balcony = Math.abs(y - centreY) < 2 && radial < bubble[1] - 6
                                && Math.floorMod(BeyondWorldgen.hash(x, y, z, 6060), 17) == 0;
                            if (!inShell && !balcony) continue;
                            cursor.set(x, y, z);
                            chunk.setBlockState(cursor, inShell ? glass : light, false);
                        }
                    }
                }
            }
        }
        // An arrival ring floats over the abyss: it is the only safe floor near the centre, and it
        // exists so stepping through a Tear does not drop you straight out of the world.
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
                if (ring && Math.floorMod(BeyondWorldgen.hash(x, 1, z, 7171), 19) == 0) {
                    cursor.set(x, platformY + 1, z);
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
    @Override public void generateFeatures(StructureWorldAccess world, Chunk chunk, StructureAccessor accessor) { }
    /** The hub is a void plate; nothing spawns naturally here by design. */
    @Override public void populateEntities(ChunkRegion region) { }
}
