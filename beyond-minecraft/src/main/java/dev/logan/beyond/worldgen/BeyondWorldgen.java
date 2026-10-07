package dev.logan.beyond.worldgen;

import dev.logan.beyond.BeyondMinecraft;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;
import net.minecraft.world.gen.chunk.ChunkGenerator;

/** Registers the three audited generators that draw Beyond's generated spaces. */
public final class BeyondWorldgen {
    private BeyondWorldgen() {}
    public static void initialize() {
        register("between_generator", BetweenGenerator.CODEC);
        register("labyrinth_generator", LabyrinthGenerator.CODEC);
        register("fractal_generator", FractalGenerator.CODEC);
    }
    private static void register(String id, com.mojang.serialization.MapCodec<? extends ChunkGenerator> codec) {
        Registry.register(Registries.CHUNK_GENERATOR, BeyondMinecraft.id(id), codec);
    }
    // ---- shared deterministic math ---------------------------------------------------------
    /** Menger sponge membership at a given cell size and recursion depth. */
    public static boolean menger(int x, int y, int z, int cell, int levels) {
        int cx = Math.floorDiv(x, cell), cy = Math.floorDiv(y, cell), cz = Math.floorDiv(z, cell);
        for (int level = 0; level < levels; level++) {
            int dx = Math.floorMod(cx, 3), dy = Math.floorMod(cy, 3), dz = Math.floorMod(cz, 3);
            int zeros = (dx == 1 ? 1 : 0) + (dy == 1 ? 1 : 0) + (dz == 1 ? 1 : 0);
            if (zeros >= 2) return false;
            cx = Math.floorDiv(cx, 3); cy = Math.floorDiv(cy, 3); cz = Math.floorDiv(cz, 3);
        }
        return true;
    }
    public static int hash(int x, int y, int z, long seed) {
        long value = x * 3129871L ^ z * 116129781L ^ y * 42317861L ^ seed * 2654435761L;
        value ^= value >>> 33; value *= 0xFF51AFD7ED558CCDL; value ^= value >>> 33;
        return (int) value;
    }
    public static float unit(int x, int y, int z, long seed) { return (Math.floorMod(hash(x, y, z, seed), 1 << 20)) / (float) (1 << 20); }
    /** A helical walkway, used to make the fractal and maze spaces climbable rather than hostile. */
    public static boolean spiral(int x, int z, int y, int inner, int outer, double twist, double thickness) {
        double radius = Math.sqrt((double) x * x + (double) z * z);
        if (radius < inner || radius > outer) return false;
        double angle = Math.atan2(z, x);
        double phase = (y * twist + angle * 3.0 / Math.PI) % 8.0;
        return phase < thickness;
    }
}
