package dev.logan.entersift;

import dev.logan.entersift.RiftType;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * 0.24 Trailer-Exact Voxel Rift Layout (Images 1, 7, 8, 14, 19, 24, 25, 27, 36).
 *
 * Unlike earlier versions that fractured the middle of the window into a grid of sub-boxes with
 * internal walls blocking the view, the main stepped-cross body is ONE continuous open cavity at
 * a uniform recess depth, while only the outer attached corner boxes (far-left box, lower-left box,
 * and right-hand claw boxes) step to shallower depths.
 *
 * The mesh is subdivided along every cell edge so the smooth traveling wave undulates the vertical
 * and horizontal sides without ever tearing a seam (no T-junctions).
 */
public final class RiftShape {
    public static final float BASE = 0.25f; // lower lip stays walkable
    public static final int TIERS = 4;          // 4 nested voxel tiers (one every 10 ticks over ticks 61-100)

    public final int cols, rows;
    public final float cw, ch, w, h;
    public final boolean[][] body;
    public final float[][] depth;
    public final int[][] tier;
    public final float maxDepth;
    /** Satellite cells: {x0, y0, x1, y1, zFront, zBack, group, neighbourMask(1 L, 2 R, 4 D, 8 U)}. */
    public final List<float[]> sats = new ArrayList<>();
    /** 0.39: cells that stay clear window; everything else in the body is a frosted box face. */
    private final boolean[][] window;
    private RiftShape(int cols, int rows, float w, float h, boolean[][] body, float[][] depth, int[][] tier, float maxDepth,
                      boolean[][] window) {
        this.cols = cols; this.rows = rows; this.w = w; this.h = h;
        this.window = window;
        this.cw = w / cols; this.ch = h / rows;
        this.body = body; this.depth = depth; this.tier = tier; this.maxDepth = maxDepth;
    }

    public boolean on(int i, int j) { return i >= 0 && j >= 0 && i < cols && j < rows && body[i][j]; }
    public float d(int i, int j) { return on(i, j) ? depth[i][j] : 0f; }
    public float x(int i) { return -w / 2 + i * cw; }
    public float y(int j) { return BASE + j * ch; }
    public float cy() { return BASE + h / 2; }

    /**
     * 0.39: distance in cells from the open interior, through the body. 1 = the ring of panels touching
     * the interior, larger numbers work outwards to the silhouette ends. Cells outside the body are 0.
     */
    private static int[][] frameDistance(int cols, int rows, boolean[][] body) {
        int[][] out = new int[cols][rows];
        java.util.ArrayDeque<int[]> queue = new java.util.ArrayDeque<>();
        // the interior first: every body cell at least two steps inside the outline
        int[][] toEdge = new int[cols][rows];
        for (int i = 0; i < cols; i++) for (int j = 0; j < rows; j++)
            toEdge[i][j] = body[i][j] ? Integer.MAX_VALUE : 0;
        for (int i = 0; i < cols; i++) for (int j = 0; j < rows; j++)
            if (!body[i][j]) queue.add(new int[]{i, j});
        while (!queue.isEmpty()) {
            int[] c = queue.poll();
            for (int[] step : STEPS) {
                int ni = c[0] + step[0], nj = c[1] + step[1];
                if (ni < 0 || nj < 0 || ni >= cols || nj >= rows || !body[ni][nj]) continue;
                if (toEdge[ni][nj] > toEdge[c[0]][c[1]] + 1) { toEdge[ni][nj] = toEdge[c[0]][c[1]] + 1; queue.add(new int[]{ni, nj}); }
            }
        }
        for (int i = 0; i < cols; i++) for (int j = 0; j < rows; j++) { out[i][j] = -1; if (body[i][j] && toEdge[i][j] >= 2) { out[i][j] = 0; queue.add(new int[]{i, j}); } }
        while (!queue.isEmpty()) {
            int[] c = queue.poll();
            for (int[] step : STEPS) {
                int ni = c[0] + step[0], nj = c[1] + step[1];
                if (ni < 0 || nj < 0 || ni >= cols || nj >= rows || !body[ni][nj] || out[ni][nj] >= 0) continue;
                out[ni][nj] = out[c[0]][c[1]] + 1;
                queue.add(new int[]{ni, nj});
            }
        }
        for (int i = 0; i < cols; i++) for (int j = 0; j < rows; j++) if (out[i][j] < 0) out[i][j] = 1;
        return out;
    }

    private static final int[][] STEPS = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}};

    private static float clamp01(float v) { return v < 0f ? 0f : (v > 1f ? 1f : v); }

    /**
     * 0.39: how much of a point's brightness survives - 1 in the middle of the structure, 0 at its own
     * ends, smoothstepped in between.
     *
     * <p>The first attempt measured a cell's distance THROUGH the body from the open interior, but the
     * arms of the standard rift are only two cells thick, so that distance never exceeds two and every
     * cell came out at full brightness - the user's "I don't see the fading effect anymore". Distance from
     * the structure's centre, normalised per axis, always has a real gradient and still fades to nothing
     * exactly at the extremities of the arms, the tower and the boxes.
     */
    public float fadeAt(float x, float y) {
        float nx = x / Math.max(0.001f, w * 0.5f), ny = (y - cy()) / Math.max(0.001f, h * 0.5f);
        float r = (float) Math.sqrt(nx * nx + ny * ny);
        float f = clamp01((r - 0.45f) / 0.62f);
        return 1f - f * f * (3f - 2f * f);
    }

    /** Crisp voxel grid resolution (~11x8 for standard 7x5 rift). */
    public static float cell(float w, float h) { return Math.max(0.55f, Math.min(0.95f, Math.max(w, h) / 11f)); }

    public static float hash(long seed, int a, int b) {
        long x = seed * 0x9E3779B97F4A7C15L + a * 0xBF58476D1CE4E5B9L + b * 0x94D049BB133111EBL;
        x ^= x >>> 31; x *= 0x7FB5D329728EA185L; x ^= x >>> 27;
        return (x >>> 40) / (float) (1L << 24);
    }

    public static RiftShape build(RiftType type, long seed, float w, float h) {
        int cols = type == RiftType.PORTAL ? Math.max(8, Math.round(w * 2f)) : 11;
        int rows = type == RiftType.PORTAL ? Math.max(6, Math.round(h * 2f)) : 8;
        float cw = w / cols, ch = h / rows;
        boolean[][] body = new boolean[cols][rows];
        int[][] tier = new int[cols][rows];
        for (int i = 0; i < cols; i++) for (int j = 0; j < rows; j++) {
            float u = (i + 0.5f) / cols * 2 - 1, v = (j + 0.5f) / rows * 2 - 1;
            float xb = -w / 2 + (i + 0.5f) * cw, yb = -h / 2 + (j + 0.5f) * ch;
            body[i][j] = inBody(type, seed, u, v, xb, yb, i, j, cols, rows, w, h);
            float rectDist = Math.max(Math.abs(u), Math.abs(v)) * 0.90f + 0.10f * hash(seed, i, j + 97);
            tier[i][j] = Math.min(TIERS - 1, (int) (rectDist * TIERS));
        }
        float[][] depth = new float[cols][rows];
        float max = boxes(type, seed, cols, rows, body, tier, depth);
        // 0.39: the WHOLE interior is the window. The user: "the screen in the middle is right in the
        // centre; it needs to be all around the whole interior - a giant window". The frost survives only
        // as a thin frame that hugs the silhouette: every body cell within a step of the inside of the
        // outline is open glass, and the rest of the body is panel. How much of that frame and the borders
        // survive is the fade in fadeAt().
        boolean[][] window = new boolean[cols][rows];
        if (type == RiftType.PORTAL) {
            // The cyan ritual portal is a mosaic of separate teeth and was always glazed edge to edge;
            // it keeps that look unchanged (the renderer's open-window flag is off for it too).
            for (int i = 0; i < cols; i++) for (int j = 0; j < rows; j++) window[i][j] = body[i][j];
        } else {
            int[][] out = frameDistance(cols, rows, body);
            for (int i = 0; i < cols; i++) for (int j = 0; j < rows; j++)
                window[i][j] = body[i][j] && out[i][j] <= 1;    // every cell but the outer frame is glass
        }
        RiftShape s = new RiftShape(cols, rows, w, h, body, depth, tier, max, window);
        s.satellites(type, seed);
        return s;
    }

    // ------------------------------------------------------------------ trailer-exact stepped voxel silhouettes

    /**
     * 0.31 rift variants. Four of the eight styles are the usual stepped cross everyone sees; the other
     * four are the TALL variant the references show — a very tall central wall that towers over the
     * side boxes instead of the wide stepped arms. Chosen from the same seed the client renders with.
     */
    public static boolean tallVariant(float w, float h) {
        return h >= w * 1.25f; // tall rift = taller than it is wide; derived from w/h so both sides agree
    }

    private static boolean inBody(RiftType type, long seed, float u, float v, float xb, float yb, int i, int j, int cols, int rows, float xspan, float yspan) {
        switch (type) {
            case SIFT:
            case OVERWORLD: {
                if (tallVariant(xspan, yspan)) {
                    // Tall variant (references 17345525 / The_Nether): one very tall wall, a short base and
                    // two small side boxes, so the silhouette is TALL and narrow instead of a wide cross.
                    boolean tower = (i >= 4 && i <= 6 && j >= 0 && j <= 7);
                    boolean baseSkirt = (i >= 3 && i <= 7 && j >= 0 && j <= 1);
                    boolean leftStep = (i == 3 && j >= 2 && j <= 4);
                    boolean rightStep = (i == 7 && j >= 1 && j <= 3);
                    return tower || baseSkirt || leftStep || rightStep;
                }
                // Exact trailer stepped cross silhouette (Images 1, 2, 3, 14, 19, 27, 36):
                // - Tall narrow top cap: col 5, rows 6..7
                // - Upper stepped shoulders: cols 3..7, rows 4..5
                // - Wide horizontal arms: cols 2..9, rows 2..3
                // - Lower central base: cols 3..7, rows 0..1
                // - Lower-left stepped square box: cols 1..2, rows 0..1
                // - Far-left stepped square box: cols 0..1, rows 2..3
                boolean topCap = (i == 5 && j >= 6 && j <= 7);
                boolean upperShoulders = (i >= 3 && i <= 7 && j >= 4 && j <= 5);
                boolean wideArms = (i >= 2 && i <= 9 && j >= 2 && j <= 3);
                boolean lowerBase = (i >= 3 && i <= 7 && j >= 0 && j <= 1);
                boolean lowerLeftBox = (i >= 1 && i <= 2 && j >= 0 && j <= 1);
                boolean farLeftBox = (i >= 0 && i <= 1 && j >= 2 && j <= 3);
                return topCap || upperShoulders || wideArms || lowerBase || lowerLeftBox || farLeftBox;
            }
            case NETHER: {
                // Tall burning arch slab with crenellated top boxes and side steps (Images 8, 13, 25).
                boolean mainArch = (i >= 2 && i <= 8 && j >= 0 && j <= 5);
                boolean topCastles = (j >= 6 && j <= 7 && (i == 3 || i == 4 || i == 6 || i == 7));
                boolean sideSteps = (j >= 1 && j <= 3 && (i == 1 || i == 9));
                return mainArch || topCastles || sideSteps;
            }
            case END: {
                // Tall stepped cavern/throne rift with asymmetrical top towers and side tabs (Images 7, 8, 24).
                boolean mainSheet = (i >= 2 && i <= 8 && j >= 0 && j <= 5);
                boolean topSteps = (j >= 6 && j <= 7 && (i == 2 || i == 4 || i == 5 || i == 7));
                boolean leftTab = (i == 1 && (j == 2 || j == 5));
                boolean rightTab = (i == 9 && (j == 1 || j == 3 || j == 4));
                return mainSheet || topSteps || leftTab || rightTab;
            }
            default: {
                // PORTAL: Crenellated cyan mosaic portal with square voxel teeth on top, bottom, and sides (Images 5, 6, 10).
                int ci = Math.min(i, cols - 1 - i), cj = Math.min(j, rows - 1 - j);
                if (ci >= 1 && cj >= 1) return true;
                if (j == rows - 1 || j == 0) return ci >= 1 && (i % 2 == 1);
                if (i == 0 || i == cols - 1) return cj >= 1 && (j % 2 == 1);
                return false;
            }
        }
    }

    // ------------------------------------------------------------------ unified main window + stepped corner boxes

    /**
     * Keeps the entire main stepped-cross opening at ONE continuous recess depth (0.48 blocks) so there are
     * ZERO internal walls crisscrossing the middle of the window, while the outer corner boxes (far-left box
     * and lower-left box) sit at shallower stepped depths (0.34 and 0.24 blocks) so their 3D hollow box
     * borders frame the left side exactly like Images 1, 27, and 36.
     */
    public static float boxes(RiftType type, long seed, int cols, int rows, boolean[][] body, int[][] tier, float[][] depth) {
        if (type == RiftType.PORTAL) {
            for (int i = 0; i < cols; i++) for (int j = 0; j < rows; j++) depth[i][j] = 0.28f;
            return 0.28f;
        }
        int[][] box = new int[cols][rows];
        for (int[] col : box) Arrays.fill(col, -1);
        float mainDepth = 0.60f; // 0.29: boxier depth so the sides read as real boxes
        float max = mainDepth;
        for (int i = 0; i < cols; i++) {
            for (int j = 0; j < rows; j++) {
                if (!body[i][j]) continue;
                // Outer left attached boxes get distinct shallow step depths; main cross is one seamless window.
                if ((type == RiftType.SIFT || type == RiftType.OVERWORLD) && i <= 1 && j >= 2 && j <= 3) {
                    box[i][j] = 1;
                    depth[i][j] = 0.32f;
                    tier[i][j] = 3;
                } else if ((type == RiftType.SIFT || type == RiftType.OVERWORLD) && i <= 2 && j <= 1 && (i < 3)) {
                    box[i][j] = 2;
                    depth[i][j] = 0.44f;
                    tier[i][j] = 2;
                } else {
                    box[i][j] = 0;
                    depth[i][j] = mainDepth;
                }
            }
        }
        return Math.max(max, 0.60f);
    }

    /**
     * 0.29r: the reference rift is a stepped voxel BOX whose only glazed part is a small square hole in the
     * middle — everything else is frosted panel. Cells that answer true here stay clear window; every other
     * body cell is drawn as a frosted box face (see {@code boxFaces} in the renderer). Other rift types keep
     * their old fully-glazed opening.
     */
    public boolean windowCell(int i, int j) {
        return i >= 0 && j >= 0 && i < cols && j < rows && window[i][j];
    }

    // ------------------------------------------------------------------ trailer-exact perimeter satellites

    /**
     * Places the exact detached hollow voxel boxes and L/Z tetrominoes seen around the perimeter in
     * Images 1, 14, 19, 27, and 36 (upper-left Z-tetromino, right-hand upper hollow box, right-hand
     * lower L-claw, and small floating hollow cubes in the notches).
     */
    private void satellites(RiftType type, long seed) {
        List<int[]> rimCells = new ArrayList<>();
        for (int i = 0; i < cols; i++) {
            for (int j = 0; j < rows; j++) {
                if (on(i, j) && (!on(i - 1, j) || !on(i + 1, j) || !on(i, j - 1) || !on(i, j + 1))) {
                    rimCells.add(new int[]{i, j});
                }
            }
        }
        if (type == RiftType.PORTAL) return;

        // 1. Upper-left Z/S-tetromino nestled above the left arm (Images 1, 19, 27, 36)
        float qL = cw * 0.48f;
        float oxL = x(2) - qL * 1.15f;
        float oyL = y(4) + ch * 0.05f;
        int[][] zCells = {{0, 0}, {0, 1}, {1, 1}, {1, 2}};
        addTetromino(zCells, oxL, oyL, qL, 1, 0.22f, -0.14f, 0);

        // 2. Right-hand upper hollow rectangular box (Images 1, 14, 27, 36)
        float rx0 = x(9) + cw * 0.05f, rx1 = rx0 + cw * 1.65f;
        float ry0 = y(4) - ch * 0.10f, ry1 = ry0 + ch * 0.95f;
        sats.add(new float[]{rx0, ry0, rx1, ry1, 0.24f, -0.18f, 1, 0});

        // 3. Right-hand lower L-tetromino claw below the right arm (Images 1, 14, 27, 36)
        float qR = cw * 0.50f;
        float oxR = x(9) + cw * 0.05f;
        float oyR = y(1) - ch * 0.15f;
        int[][] lCells = {{0, 0}, {1, 0}, {1, 1}, {0, 1}};
        addTetromino(lCells, oxR, oyR, qR, 1, 0.22f, -0.16f, 2);
    }

    private void addTetromino(int[][] cells, float ox, float oy, float q, int flip, float zf, float zb, int group) {
        for (int[] c : cells) {
            int mask = 0;
            for (int[] o : cells) {
                if (o[1] == c[1] && o[0] == c[0] - flip) mask |= 1;
                if (o[1] == c[1] && o[0] == c[0] + flip) mask |= 2;
                if (o[0] == c[0] && o[1] == c[1] - 1) mask |= 4;
                if (o[0] == c[0] && o[1] == c[1] + 1) mask |= 8;
            }
            float x0 = ox + c[0] * q * flip, x1 = x0 + q * flip;
            sats.add(new float[]{Math.min(x0, x1), oy + c[1] * q, Math.max(x0, x1), oy + (c[1] + 1) * q, zf, zb, group, mask});
        }
    }
}
