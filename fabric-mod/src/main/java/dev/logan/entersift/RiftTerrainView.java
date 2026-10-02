package dev.logan.entersift;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.levelgen.Heightmap;

/**
 * 0.38: the real destination, sampled on the server and shipped to the client as a compact relief.
 *
 * <p>Every rift already knows where it leads: {@code RiftType} IS the destination (0 overworld, 1 nether,
 * 2 end, 3 sift), and every destination arrival happens near that dimension's origin ({@code travel/surface}
 * searches around 0,0). So the server can sample the surface heightmap and the surface material of exactly
 * the area a traveler will land in, quantise it, and hand it to the client in one short string.
 *
 * <p>The client draws it as layered skylines behind the glazed opening, under the frosted gloss. That is a
 * real view of the destination dimension - its actual shapes and materials - without the per-dimension
 * chunk streaming a full Immersive-Portals-style live render would need.
 */
public final class RiftTerrainView {
    /** Columns per side of the sampled square. */
    public static final int GRID = 24;
    /** Half-width of the sampled square, in blocks. */
    private static final int SPAN = 32;
    /** Height quantisation steps (a nibble per column). */
    public static final int LEVELS = 16;

    /** Shown for any block the table does not know. */
    public static final int UNKNOWN = 0x7a7f85;

    private static Map<Block, Integer> colours() { return Colours.MAP; }

    /** Built on first use, never in this class's initialiser, so the codec stays testable off-line. */
    private static final class Colours {
        static final Map<Block, Integer> MAP = build();

        private static Map<Block, Integer> build() {
            Map<Block, Integer> map = new LinkedHashMap<>();
            fill(map);
            return map;
        }
    }

    private static void put(Map<Block, Integer> colours, Block block, int rgb) { colours.put(block, rgb); }

    private static void fill(Map<Block, Integer> colours) {
        // Vanilla surfaces.
        put(colours, Blocks.GRASS_BLOCK, 0x6a9c46); put(colours, Blocks.DIRT, 0x866043); put(colours, Blocks.COARSE_DIRT, 0x7b573c);
        put(colours, Blocks.PODZOL, 0x6b4a2a); put(colours, Blocks.MYCELIUM, 0x6f6265); put(colours, Blocks.MOSS_BLOCK, 0x59762f);
        put(colours, Blocks.STONE, 0x7d7d7d); put(colours, Blocks.COBBLESTONE, 0x777777); put(colours, Blocks.DEEPSLATE, 0x505054);
        put(colours, Blocks.GRAVEL, 0x7f7a76); put(colours, Blocks.SAND, 0xd9cf9a); put(colours, Blocks.RED_SAND, 0xb4611f);
        put(colours, Blocks.SANDSTONE, 0xd5cfa2); put(colours, Blocks.TERRACOTTA, 0x985e43); put(colours, Blocks.CLAY, 0xa0a7b4);
        put(colours, Blocks.SNOW_BLOCK, 0xf0f6f6); put(colours, Blocks.SNOW, 0xf0f6f6); put(colours, Blocks.ICE, 0x7db4e8);
        put(colours, Blocks.PACKED_ICE, 0x8bb8e8); put(colours, Blocks.BLUE_ICE, 0x74a8ea); put(colours, Blocks.WATER, 0x3552c4);
        put(colours, Blocks.LAVA, 0xd45b12); put(colours, Blocks.NETHERRACK, 0x6c2b2b); put(colours, Blocks.SOUL_SAND, 0x544133);
        put(colours, Blocks.SOUL_SOIL, 0x4c3a2e); put(colours, Blocks.BASALT, 0x4d4b52); put(colours, Blocks.BLACKSTONE, 0x2c2730);
        put(colours, Blocks.MAGMA_BLOCK, 0x8e3f0a); put(colours, Blocks.END_STONE, 0xdbdfa0); put(colours, Blocks.OBSIDIAN, 0x140e1f);
        put(colours, Blocks.SCULK, 0x0e1a1c); put(colours, Blocks.MUD, 0x3c3139); put(colours, Blocks.PRISMARINE, 0x639c97);
        put(colours, Blocks.WARPED_NYLIUM, 0x2a7f78); put(colours, Blocks.CRIMSON_NYLIUM, 0x8c2b3f);
        // The Sift's own surfaces, so a rift into the Sift looks like the Sift.
        put(colours, SiftContent.SIFT_EARTH, 0xb08a6a); put(colours, SiftContent.SALTSTONE, 0xd9d3c6);
        put(colours, SiftContent.REEF_STONE, 0x6f7f86); put(colours, SiftContent.CRAG_ROCK, 0x6b6f78);
        put(colours, SiftContent.PALE_CRUST, 0xd7d2cf); put(colours, SiftContent.SINGER_MOSS, 0x5c8a6a);
        put(colours, SiftContent.SOULWOOD, 0x5a4636); put(colours, SiftContent.SOUL_CANOPY, 0x4e6a4a);
        put(colours, SiftContent.CORAL_PINK_BLOCK, 0xc27d92); put(colours, SiftContent.CORAL_ORANGE_BLOCK, 0xc98a5a);
        put(colours, SiftContent.TEAL_PATH, 0x3f7f74); put(colours, SiftContent.ROSE_PATH, 0xa9756d);
        put(colours, SiftContent.SPIRE_BRICKS, 0x8a8f96);
    }

    private RiftTerrainView() {}

    /** The dimension a rift leads to. {@code RiftType} IS the destination (see rift/style.mcfunction). */
    public static String destinationId(RiftType type) {
        return switch (type) {
            case OVERWORLD -> "minecraft:overworld";
            case NETHER -> "minecraft:the_nether";
            case END -> "minecraft:the_end";
            case SIFT, PORTAL -> "entersift:the_sift";
        };
    }

    /**
     * The key the server resolves the destination with. Split from {@link #destinationId} because building
     * a dimension key needs a bootstrapped registry, which a bare JUnit run does not have - the tests pin
     * the pure id mapping instead.
     */
    public static ResourceKey<Level> destination(RiftType type) {
        return switch (type) {
            case OVERWORLD -> Level.OVERWORLD;
            case NETHER -> Level.NETHER;
            case END -> Level.END;
            case SIFT, PORTAL -> ResourceKey.create(Registries.DIMENSION,
                    net.minecraft.resources.Identifier.fromNamespaceAndPath("entersift", "the_sift"));
        };
    }

    /**
     * The height a traveller would stand on. In the Nether the plain heightmap is the bedrock roof, so the
     * cavern floor below it is found instead - that is the Nether a player actually sees through a rift.
     */
    private static int surfaceY(ServerLevel level, int x, int z) {
        int y = level.getHeight(Heightmap.Types.WORLD_SURFACE, x, z);
        if (level.dimension() == Level.NETHER && y > 120) {
            for (int yy = Math.min(y - 1, 120); yy > level.getMinY() + 2; yy--) {
                BlockPos pos = new BlockPos(x, yy, z);
                if (!level.getBlockState(pos).isAir() && level.getBlockState(pos.above()).isAir()
                        && level.getBlockState(pos.above(2)).isAir()) return yy + 1;
            }
        }
        return y;
    }

    /** Samples the destination surface around (cx, cz) into the compact string the entity syncs. */
    public static String sample(ServerLevel level, int cx, int cz) {
        int n = GRID * GRID;
        int[] heights = new int[n];
        int[] rgb = new int[n];
        int min = Integer.MAX_VALUE, max = Integer.MIN_VALUE;
        for (int j = 0; j < GRID; j++) {
            int z = cz + offset(j);
            for (int i = 0; i < GRID; i++) {
                int x = cx + offset(i);
                int y = surfaceY(level, x, z);
                Block block = level.getBlockState(new BlockPos(x, y - 1, z)).getBlock();
                int k = j * GRID + i;
                heights[k] = y;
                rgb[k] = colours().getOrDefault(block, UNKNOWN);
                min = Math.min(min, y);
                max = Math.max(max, y);
            }
        }
        return encode(heights, rgb, min, max);
    }

    private static int offset(int index) {
        return (int) Math.round((index / (double) (GRID - 1) - 0.5) * 2 * SPAN);
    }

    /** Pure codec, so it can be unit-tested without a server: {@code min:span:palette:cells…}. */
    public static String encode(int[] heights, int[] rgb, int min, int max) {
        List<Integer> palette = new ArrayList<>();
        for (int colour : rgb) if (!palette.contains(colour) && palette.size() < LEVELS) palette.add(colour);
        if (palette.isEmpty()) palette.add(UNKNOWN);
        int span = Math.max(0, max - min);
        StringBuilder out = new StringBuilder(4 + palette.size() * 6 + heights.length * 2);
        out.append(min).append(':').append(span).append(':');
        for (int colour : palette) out.append(String.format("%06x", colour & 0xFFFFFF));
        out.append(':');
        for (int k = 0; k < heights.length; k++) {
            int level = span == 0 ? 0 : Math.round((heights[k] - min) * (LEVELS - 1) / (float) span);
            int index = palette.indexOf(rgb[k]);
            if (index < 0) index = 0;
            out.append(Character.forDigit(level, 16)).append(Character.forDigit(index, 16));
        }
        return out.toString();
    }

    /** Decoded relief: quantised column levels, the world-Y they span, and the surface colours. */
    public record Relief(int minY, int spanY, int[] levels, int[] palette) {
        /** Packed cell: high nibble = height level, low nibble = palette index. */
        public int packed(int i, int j) { return levels[j * GRID + i]; }
    }

    /** Returns null for an empty or malformed string, so a bad sync can never break rendering. */
    public static Relief decode(String data) {
        if (data == null || data.isEmpty()) return null;
        try {
            String[] parts = data.split(":", 4);
            if (parts.length != 4) return null;
            int min = Integer.parseInt(parts[0]);
            int span = Integer.parseInt(parts[1]);
            int paletteCount = parts[2].length() / 6;
            if (paletteCount < 1) return null;
            int[] palette = new int[paletteCount];
            for (int k = 0; k < paletteCount; k++)
                palette[k] = Integer.parseInt(parts[2].substring(k * 6, k * 6 + 6), 16);
            String cells = parts[3];
            if (cells.length() != GRID * GRID * 2) return null;
            int[] pair = new int[GRID * GRID];
            for (int k = 0; k < pair.length; k++)
                pair[k] = (Character.digit(cells.charAt(k * 2), 16) << 4) | Character.digit(cells.charAt(k * 2 + 1), 16);
            return new Relief(min, span, pair, palette);
        } catch (RuntimeException error) {
            return null;
        }
    }

    /** Client-side helper: the surface colour of one column. */
    public static int colourOf(Relief relief, int k) {
        int packed = relief.levels()[k];
        int index = packed & 0xF;
        return relief.palette()[Math.floorMod(index, relief.palette().length)];
    }
}
