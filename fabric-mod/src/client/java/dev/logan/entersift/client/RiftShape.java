package dev.logan.entersift.client;

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
final class RiftShape {
    static final float BASE = dev.logan.entersift.RiftCrossing.BASE;
    static final int TIERS = 4;          // 4 nested voxel tiers (one every 10 ticks over ticks 61-100)

    final int cols, rows;
    final float cw, ch, w, h;
    final boolean[][] body;
    final float[][] depth;
    final int[][] tier;
    final float maxDepth;
    /** Satellite cells: {x0, y0, x1, y1, zFront, zBack, group, neighbourMask(1 L, 2 R, 4 D, 8 U)}. */
    final List<float[]> sats = new ArrayList<>();

    private RiftShape(int cols, int rows, float w, float h, boolean[][] body, float[][] depth, int[][] tier, float maxDepth) {
        this.cols = cols; this.rows = rows; this.w = w; this.h = h;
        this.cw = w / cols; this.ch = h / rows;
        this.body = body; this.depth = depth; this.tier = tier; this.maxDepth = maxDepth;
    }

    boolean on(int i, int j) { return i >= 0 && j >= 0 && i < cols && j < rows && body[i][j]; }
    float d(int i, int j) { return on(i, j) ? depth[i][j] : 0f; }
    float x(int i) { return -w / 2 + i * cw; }
    float y(int j) { return BASE + j * ch; }
    float cy() { return BASE + h / 2; }

    /** Crisp voxel grid resolution (~11x8 for standard 7x5 rift). */
    static float cell(float w, float h) { return Math.max(0.55f, Math.min(0.95f, Math.max(w, h) / 11f)); }

    static float hash(long seed, int a, int b) {
        long x = seed * 0x9E3779B97F4A7C15L + a * 0xBF58476D1CE4E5B9L + b * 0x94D049BB133111EBL;
        x ^= x >>> 31; x *= 0x7FB5D329728EA185L; x ^= x >>> 27;
        return (x >>> 40) / (float) (1L << 24);
    }

    static RiftShape build(RiftType type, long seed, float w, float h) {
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
        RiftShape s = new RiftShape(cols, rows, w, h, body, depth, tier, max);
        s.satellites(type, seed);
        return s;
    }

    // ------------------------------------------------------------------ trailer-exact stepped voxel silhouettes

    private static boolean inBody(RiftType type, long seed, float u, float v, float xb, float yb, int i, int j, int cols, int rows, float xspan, float yspan) {
        if (type != RiftType.PORTAL) return dev.logan.entersift.RiftCrossing.cell(type, i, j);
        switch (type) {
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
    static float boxes(RiftType type, long seed, int cols, int rows, boolean[][] body, int[][] tier, float[][] depth) {
        if (type == RiftType.PORTAL) {
            for (int i = 0; i < cols; i++) for (int j = 0; j < rows; j++) depth[i][j] = 0.28f;
            return 0.28f;
        }
        int[][] box = new int[cols][rows];
        for (int[] col : box) Arrays.fill(col, -1);
        float mainDepth = 0.4837f;
        float max = mainDepth;
        for (int i = 0; i < cols; i++) {
            for (int j = 0; j < rows; j++) {
                if (!body[i][j]) continue;
                // Outer left attached boxes get distinct shallow step depths; main cross is one seamless window.
                if ((type == RiftType.SIFT || type == RiftType.OVERWORLD) && i <= 1 && j >= 2 && j <= 3) {
                    box[i][j] = 1;
                    depth[i][j] = dev.logan.entersift.RiftCrossing.depth(type,i,j);
                    tier[i][j] = 3;
                } else if ((type == RiftType.SIFT || type == RiftType.OVERWORLD) && i <= 2 && j <= 1 && (i < 3)) {
                    box[i][j] = 2;
                    depth[i][j] = dev.logan.entersift.RiftCrossing.depth(type,i,j);
                    tier[i][j] = 2;
                } else {
                    box[i][j] = 0;
                    depth[i][j] = dev.logan.entersift.RiftCrossing.depth(type,i,j);
                }
            }
        }
        return max;
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
