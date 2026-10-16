package dev.logan.entersift;

import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.Arrays;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 0.41 mesh probe: reads the {@code SFM1} blobs that {@code tools/export_mesh_bin.py} writes from the
 * Minecraft Dungeons room heightfields (shipped in {@code assets/sift/meshes/}).
 *
 * <p>They exist because the cooked Unreal static meshes on the share cannot be decoded: their geometry is
 * not in a float32 position buffer anywhere in the file, so a real {@code SM_*} mesh cannot be extracted
 * yet. These blobs are built from the game's own level data instead — the same height planes the level
 * sheets are built on — so what appears in game is the Dungeons room layout, honestly labelled as terrain
 * rather than a claimed rip of an Unreal mesh.
 *
 * <p>Layout (little endian): magic {@code SFM1}, version, footprint w/d, quad count, column count, then
 * 13 floats per quad (4 vertices of xyz followed by a shade) and 3 shorts per column (x, z, surface
 * height). Loading is lazy and cached; a missing or malformed blob returns {@code null} and the caller
 * reports it instead of drawing something wrong.
 */
public final class MeshProbeData {
    /** Ship order: the Deep Dark anchor rooms, smallest first so the first summon is cheap. */
    public static final String[] IDS = {
        "DD_ANC_010", "DD_ANC_008", "DD_ANC_007", "DD_ANC_005", "DD_ANC_006",
        "DD_ANC_009", "DD_ANC_012", "DD_ANC_011", "DD_ANC_004", "DD_ANC_003",
        "DD_ANC_001", "DD_ANC_002",
        "PortalTile",
        "PortalTile",
    };
    public static final String DEFAULT = IDS[0];

    private static final int MAGIC = 0x314D4653;    // 'S','F','M','1' little endian
    private static final int VERSION = 1;
    private static final int QUAD_FLOATS = 13;
    private static final int COLUMN_SHORTS = 3;

    private static final Map<String, Mesh> CACHE = new ConcurrentHashMap<>();

    public static final class Mesh {
        public final int width, depth, quadCount, columnCount;
        public final float[] quads;
        public final short[] columns;

        Mesh(int width, int depth, int quadCount, int columnCount, float[] quads, short[] columns) {
            this.width = width;
            this.depth = depth;
            this.quadCount = quadCount;
            this.columnCount = columnCount;
            this.quads = quads;
            this.columns = columns;
        }

        public float heightAt(int column) { return columns[column * COLUMN_SHORTS + 2]; }
        public int columnX(int column) { return columns[column * COLUMN_SHORTS]; }
        public int columnZ(int column) { return columns[column * COLUMN_SHORTS + 1]; }

        /** Rough memory footprint, for the log line. */
        public int bytes() { return quads.length * 4 + columns.length * 2; }
    }

    private MeshProbeData() {}

    public static boolean isKnown(String id) { return Arrays.asList(IDS).contains(id); }

    /** Cached load. Returns null (never throws) when the blob is absent or does not parse. */
    public static Mesh get(String id) {
        if (id == null || !isKnown(id)) return null;
        Mesh cached = CACHE.get(id);
        if (cached != null) return cached;
        Mesh mesh = read(id);
        if (mesh != null) CACHE.put(id, mesh);
        return mesh;
    }

    static Mesh read(String id) {
        String path = "/assets/sift/meshes/" + id + ".bin";
        try (InputStream in = MeshProbeData.class.getResourceAsStream(path)) {
            if (in == null) return null;
            byte[] raw = in.readAllBytes();
            if (raw.length < 24) return null;
            ByteBuffer buf = ByteBuffer.wrap(raw).order(ByteOrder.LITTLE_ENDIAN);
            if (buf.getInt() != MAGIC) return null;
            int version = buf.getInt();
            if (version != VERSION) return null;
            int w = buf.getInt(), d = buf.getInt();
            int quadCount = buf.getInt(), columnCount = buf.getInt();
            if (w <= 0 || d <= 0 || quadCount < 0 || columnCount < 0) return null;
            int need = 24 + quadCount * QUAD_FLOATS * 4 + columnCount * COLUMN_SHORTS * 2;
            if (raw.length != need) return null;                 // exact length or nothing
            float[] quads = new float[quadCount * QUAD_FLOATS];
            for (int i = 0; i < quads.length; i++) quads[i] = buf.getFloat();
            short[] columns = new short[columnCount * COLUMN_SHORTS];
            for (int i = 0; i < columns.length; i++) columns[i] = buf.getShort();
            return new Mesh(w, d, quadCount, columnCount, quads, columns);
        } catch (IOException | RuntimeException error) {
            return null;
        }
    }
}
