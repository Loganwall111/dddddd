package dev.logan.entersift.client;

import dev.logan.entersift.RiftType;
import java.util.ArrayList;
import java.util.List;

/**
 * 0.22 rift BLUEPRINT (pure data, no rendering).
 *
 * Exact construction is documented in {@code docs/RIFT_SPEC.md}. A rift is NOT a random cluster any more:
 * every rift of one destination type has the same Dungeons II voxel cross, the same concentric recessed
 * plates and the same depth table, so it reads as an authored prop instead of a mess.
 *
 *  - SILHOUETTE: the plus/cross mask below (9 x 11 cells), fixed per destination. No per-entity noise.
 *  - DEPTH: ring 0 (silhouette border) is the front lip at 0.30; every step inward is 0.34 deeper, so the
 *    throat sits at 1.34. Plates are flat, share cell boundaries and are therefore gapless (see RiftShape
 *    consumers: one face per plate cell, one return wall per step).
 *  - Everything is a pure function of (type, cell), so the mesh never depends on render order or time.
 */
final class RiftShape {
    /** Bottom of the cluster above the anchor. */
    static final float BASE = 0.28f;
    /** How many recessed rings (0 = front lip). */
    static final int RINGS = 4;
    /** Front lip depth and the step to the next plate, in blocks. */
    static final float RING0 = 0.30f, RING_STEP = 0.34f;

    // ------------------------------------------------------------------ fixed silhouettes

    /** 9 columns x 11 rows, row 0 at the bottom, '#' = body. */
    private static final String[] CROSS_FULL = {
        "...###...",
        "...###...",
        "...###...",
        "...###...",
        "#########",
        "#########",
        "#########",
        "..#####..",
        "..#####..",
        "..#####..",
        "...###...",
    };

    /** Sift: the two outer arm cells are gone and the cap has a notch, like the trailer's eroded cross. */
    private static final String[] CROSS_SIFT = {
        "...###...",
        "...###...",
        "...###...",
        "...###...",
        "#.#######",
        "#########",
        "#######.#",
        "..#####..",
        "..#####..",
        "..#####..",
        "...###...",
    };

    /** Nether: notched cap corners, arms intact, two extra chips on the lower body. */
    private static final String[] CROSS_NETHER = {
        "..#####..",
        "...###...",
        "...###...",
        "...###...",
        "#########",
        "#########",
        "#########",
        "#########",
        ".##.###..",
        "..#####..",
        "..#####..",
    };

    /** End: a taller, slimmer sheet with a stepped right shoulder. */
    private static final String[] CROSS_END = {
        "...###...",
        "...###...",
        "...###...",
        "...####..",
        "#########",
        "#########",
        "#########",
        "..######.",
        "..#####..",
        "..#####..",
        "..#####..",
    };

    /** Overworld: a wide, squat cross. */
    private static final String[] CROSS_OVERWORLD = {
        "...###...",
        "...###...",
        "...###...",
        "#########",
        "#########",
        "#########",
        "..#####..",
        "..#####..",
        "..#####..",
        "..#####..",
        "...###...",
    };

    /** The ritual portal: a clean rectangle with square tabs (no cross, single depth). */
    private static final String[] RECT_PORTAL = {
        "..#####..",
        ".#######.",
        ".#######.",
        ".#######.",
        ".#######.",
        ".#######.",
        ".#######.",
        ".#######.",
        ".#######.",
        ".#######.",
        "..#####..",
    };

    private static String[] silhouette(RiftType type) {
        return switch (type) {
            case SIFT -> CROSS_SIFT;
            case NETHER -> CROSS_NETHER;
            case END -> CROSS_END;
            case OVERWORLD -> CROSS_OVERWORLD;
            default -> RECT_PORTAL;
        };
    }

    // ------------------------------------------------------------------ data

    final int cols, rows;                 // grid size (a cell is about one block)
    final float cw, ch, w, h;             // block size of one cell and of the whole rift
    final boolean[][] body;               // silhouette
    final int[][] ring;                   // 0..RINGS-1, the recessed plate index (255 = not in the body)
    final float maxDepth;                 // depth of the deepest plate

    private RiftShape(int cols, int rows, float w, float h, boolean[][] body, int[][] ring, float maxDepth) {
        this.cols = cols; this.rows = rows; this.w = w; this.h = h;
        this.cw = w / cols; this.ch = h / rows;
        this.body = body; this.ring = ring; this.maxDepth = maxDepth;
    }

    /** About one block per cell, scaled with the rift (spec section 1). */
    static float cell(float w, float h) { return Math.max(0.7f, Math.min(1.2f, Math.max(w, h) / 9f)); }

    boolean on(int i, int j) { return i >= 0 && j >= 0 && i < cols && j < rows && body[i][j]; }
    int ringOf(int i, int j) { return on(i, j) ? ring[i][j] : -1; }
    /** Plate depth of a cell (positive = behind the anchor plane). */
    float depthOf(int i, int j) { return on(i, j) ? RING0 + ring[i][j] * RING_STEP : 0f; }
    float x(int i) { return -w / 2 + i * cw; }
    float y(int j) { return BASE + j * ch; }
    float cy() { return BASE + h / 2; }
    /** Centre column/row, in cell units. */
    float ic() { return (cols - 1) / 2f; }
    float jc() { return (rows - 1) / 2f; }

    /** Distance of a cell from the rift centre, normalised so 1 = the furthest body cell. */
    float radial(int i, int j) {
        float dx = (i - ic()) / Math.max(1f, cols / 2f), dy = (j - jc()) / Math.max(1f, rows / 2f);
        return Math.min(1f, (float) Math.sqrt(dx * dx + dy * dy));
    }

    /** Deterministic hash in [0,1). Kept for the drifting squares and cubes. */
    static float hash(long seed, int a, int b) {
        long x = seed * 0x9E3779B97F4A7C15L + a * 0xBF58476D1CE4E5B9L + b * 0x94D049BB133111EBL;
        x ^= x >>> 31; x *= 0x7FB5D329728EA185L; x ^= x >>> 27;
        return (x >>> 40) / (float) (1L << 24);
    }

    static RiftShape build(RiftType type, long seed, float w, float h) {
        float c = cell(w, h);
        int cols = Math.max(5, Math.round(w / c)), rows = Math.max(5, Math.round(h / c));
        boolean[][] body = new boolean[cols][rows];
        String[] art = silhouette(type);
        for (int i = 0; i < cols; i++) for (int j = 0; j < rows; j++) {
            // Sample the fixed art with nearest-neighbour scaling so any width/height keeps the cross.
            int ai = Math.min(art[0].length() - 1, (int) ((i + 0.5f) / cols * art[0].length()));
            int aj = Math.min(art.length - 1, (int) ((j + 0.5f) / rows * art.length));
            body[i][j] = art[art.length - 1 - aj].charAt(ai) == '#';
        }
        int[][] ring = rings(body, cols, rows, type);
        float maxDepth = RING0 + (RINGS - 1) * RING_STEP;
        if (type == RiftType.PORTAL) maxDepth = RING0;      // the portal stays one flat mosaic
        return new RiftShape(cols, rows, w, h, body, ring, maxDepth);
    }

    /**
     * Concentric plates: ring 0 on every cell that touches the empty silhouette or the grid edge, each
     * further ring one step deeper, clamped to the innermost plate. The portal gets a single ring.
     */
    private static int[][] rings(boolean[][] body, int cols, int rows, RiftType type) {
        int[][] ring = new int[cols][rows];
        for (int i = 0; i < cols; i++) for (int j = 0; j < rows; j++) {
            if (!body[i][j]) { ring[i][j] = 255; continue; }
            int d = 0;
            while (d < RINGS - 1 && !touchesEmpty(body, cols, rows, i, j, d + 1)) d++;
            ring[i][j] = type == RiftType.PORTAL ? 0 : d;
        }
        return ring;
    }

    /** True when any cell at Chebyshev distance `dist` from (i,j) is empty or outside the grid. */
    private static boolean touchesEmpty(boolean[][] body, int cols, int rows, int i, int j, int dist) {
        for (int a = i - dist; a <= i + dist; a++) for (int b = j - dist; b <= j + dist; b++) {
            if (Math.max(Math.abs(a - i), Math.abs(b - j)) != dist) continue;
            if (a < 0 || b < 0 || a >= cols || b >= rows || !body[a][b]) return true;
        }
        return false;
    }

    // ------------------------------------------------------------------ derived meshes

    /** A front (rim) edge of one plate cell: {x0,y0,x1,y1,z}; drawn white. */
    final List<float[]> rimEdges = new ArrayList<>();
    /** A step return wall: {x0,y0,x1,y1,zFront,zBack}; zFront > zBack (zFront is shallower/nearer). */
    final List<float[]> steps = new ArrayList<>();

    /** Builds the rim and step lists once; the renderer only reads them. */
    RiftShape meshed() {
        for (int i = 0; i < cols; i++) for (int j = 0; j < rows; j++) {
            if (!on(i, j)) continue;
            float d = -depthOf(i, j), x0 = x(i), x1 = x(i + 1), y0 = y(j), y1 = y(j + 1);
            // Silhouette border: rim on the plate face, and a return wall forward to the anchor plane.
            if (!on(i - 1, j)) { rimEdges.add(new float[]{x0, y0, x0, y1, d}); steps.add(new float[]{x0, y0, x0, y1, d, 0f}); }
            if (!on(i + 1, j)) { rimEdges.add(new float[]{x1, y0, x1, y1, d}); steps.add(new float[]{x1, y0, x1, y1, d, 0f}); }
            if (!on(i, j - 1)) { rimEdges.add(new float[]{x0, y0, x1, y0, d}); steps.add(new float[]{x0, y0, x1, y0, d, 0f}); }
            if (!on(i, j + 1)) { rimEdges.add(new float[]{x0, y1, x1, y1, d}); steps.add(new float[]{x0, y1, x1, y1, d, 0f}); }
            // Inner steps: where a deeper plate meets a shallower one the rim sits on the shallower face.
            stepEdge(i - 1, j, i, j);
            stepEdge(i + 1, j, i, j);
            stepEdge(i, j - 1, i, j);
            stepEdge(i, j + 1, i, j);
        }
        return this;
    }

    private void stepEdge(int ni, int nj, int i, int j) {
        int rn = ringOf(ni, nj);
        if (rn < 0 || rn >= ring[i][j]) return;                 // neighbour is deeper or absent: no step here
        float d = -depthOf(i, j), dn = -depthOf(ni, nj), x0 = x(i), x1 = x(i + 1), y0 = y(j), y1 = y(j + 1);
        if (ni < i) { rimEdges.add(new float[]{x0, y0, x0, y1, dn}); steps.add(new float[]{x0, y0, x0, y1, dn, d}); }
        else if (ni > i) { rimEdges.add(new float[]{x1, y0, x1, y1, dn}); steps.add(new float[]{x1, y0, x1, y1, dn, d}); }
        else if (nj < j) { rimEdges.add(new float[]{x0, y0, x1, y0, dn}); steps.add(new float[]{x0, y0, x1, y0, dn, d}); }
        else { rimEdges.add(new float[]{x0, y1, x1, y1, dn}); steps.add(new float[]{x0, y1, x1, y1, dn, d}); }
    }
}
