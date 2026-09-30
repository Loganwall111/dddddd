package dev.logan.entersift.client;

import dev.logan.entersift.RiftType;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * 0.22 Master Architecture Override: Pure Voxel Rift Layout (zero spherical/radial equations).
 *
 * A rift is constructed strictly from sharp, nested, hollow rectangular voxel borders on a discrete
 * grid of ~1-block cells, split into tiered rectangular hollow BOXES recessed to stepped depths,
 * plus floating hollow satellite voxel cubes and L/Z tetrominoes anchored to the outer rectangular
 * perimeter edges.
 *
 * The mesh built from this layout is T-junction free (one canvas per cell, one wall per cell edge),
 * so the slow wave applied per vertex can never tear seams between neighbouring pieces.
 */
final class RiftShape {
    static final float BASE = 0.25f;     // bottom of the cluster above the anchor
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

    /** About one block per cell, scaled with the rift. */
    static float cell(float w, float h) { return Math.max(0.7f, Math.min(1.2f, Math.max(w, h) / 9f)); }

    static float hash(long seed, int a, int b) {
        long x = seed * 0x9E3779B97F4A7C15L + a * 0xBF58476D1CE4E5B9L + b * 0x94D049BB133111EBL;
        x ^= x >>> 31; x *= 0x7FB5D329728EA185L; x ^= x >>> 27;
        return (x >>> 40) / (float) (1L << 24);
    }

    static RiftShape build(RiftType type, long seed, float w, float h) {
        float c = cell(w, h);
        int cols = Math.max(4, Math.round(w / c)), rows = Math.max(4, Math.round(h / c));
        float cw = w / cols, ch = h / rows;
        boolean[][] body = new boolean[cols][rows];
        int[][] tier = new int[cols][rows];
        for (int i = 0; i < cols; i++) for (int j = 0; j < rows; j++) {
            float u = (i + 0.5f) / cols * 2 - 1, v = (j + 0.5f) / rows * 2 - 1;
            float xb = -w / 2 + (i + 0.5f) * cw, yb = -h / 2 + (j + 0.5f) * ch;
            body[i][j] = inBody(type, seed, u, v, xb, yb, i, j, cols, rows, w, h);
            // Pure rectangular Chebyshev voxel ring distance (nested hollow rectangular borders, zero radial equations)
            float rectDist = Math.max(Math.abs(u), Math.abs(v)) * 0.88f + 0.12f * hash(seed, i, j + 97);
            tier[i][j] = Math.min(TIERS - 1, (int) (rectDist * TIERS));
        }
        float[][] depth = new float[cols][rows];
        float max = boxes(type, seed, cols, rows, body, tier, depth);
        RiftShape s = new RiftShape(cols, rows, w, h, body, depth, tier, max);
        s.satellites(type, seed);
        return s;
    }

    // ------------------------------------------------------------------ stepped rectangular voxel silhouettes

    private static boolean inBody(RiftType type, long seed, float u, float v, float xb, float yb, int i, int j, int cols, int rows, float xspan, float yspan) {
        switch (type) {
            case SIFT: {
                // Trailer stepped voxel cross: nested hollow rectangular core, tall vertical spine, wide stepped arms,
                // lower-left rectangular step, and upper-right stepped bracket.
                float arm = 0.84f + 0.14f * hash(seed, j / 2, 7);
                float lean = hash(seed, 3, 3) > 0.5f ? 1f : -1f;
                boolean in = (Math.abs(u) < 0.38f && Math.abs(v) < 0.60f)
                    || (Math.abs(u) < 0.20f && v > -0.96f && v < 0.98f)
                    || (u * lean > -0.32f && u * lean < 0.12f && v > 0.50f && v < 0.82f)
                    || (Math.abs(v) < 0.28f && Math.abs(u) < arm)
                    || (Math.abs(u) > 0.50f && Math.abs(u) < arm - 0.10f && v > 0.20f && v < 0.44f);
                if (hash(seed, 1, 1) > 0.30f) in |= u < -0.46f && u > -0.82f && v < -0.26f && v > -0.74f;
                if (hash(seed, 2, 2) > 0.30f) in |= u > 0.48f && u < 0.84f && v > 0.26f && v < 0.60f;
                return in;
            }
            case NETHER: {
                // Tall burning rectangular slab with stepped box notches along top and sides.
                boolean slab = Math.abs(u) < 0.62f && v < 0.55f;
                boolean notch = v >= 0.55f && Math.abs(u) < 0.7f && hash(seed, i, 51) > 0.35f;
                boolean side = Math.abs(u) >= 0.62f && Math.abs(u) < 0.85f && v > -0.3f && v < 0.35f && hash(seed, j, 52) > 0.3f;
                return slab || notch || side;
            }
            case OVERWORLD:
                return (Math.abs(u) < 0.45f && Math.abs(v) < 0.5f) || (u < -0.2f && u > -0.92f && v > -0.25f && v < 0.35f)
                    || (u > 0.15f && u < 0.86f && v > 0.05f && v < 0.75f) || (u > -0.35f && u < 0.1f && v > 0.4f && v < 0.96f)
                    || (u > 0.3f && u < 0.95f && v < -0.2f && v > -0.62f);
            case END: {
                // Tall stepped rectangular sheet with hollow voxel boxes stepping out along its edges.
                int band = Math.min(4, (int) ((v + 1) / 2 * 5));
                float off = (hash(seed, band, 21) - 0.5f) * 0.3f, half = 0.5f + 0.3f * hash(seed, band, 22);
                return Math.abs(u - off) < half;
            }
            default: { // PORTAL: clean rectangle with square voxel tabs on the top and sides
                int ci = Math.min(i, cols - 1 - i), cj = Math.min(j, rows - 1 - j);
                if (ci >= 1 && j >= 1 && cj >= 1) return true;
                if (j == 0) return false;
                if (j == rows - 1) return ci >= 2 && (i + (int) (seed & 1)) % 4 == 2;
                if (ci == 0) return cj >= 2 && (j + (i == 0 ? 0 : 2)) % 4 == 1;
                return false;
            }
        }
    }

    // ------------------------------------------------------------------ nested hollow rectangular boxes

    /**
     * Splits the body into sharp, nested, hollow rectangular voxel boxes (centre first, 2-5 cells wide,
     * 2-4 tall) with stepped recess depths. The centre seed box is the deepest; touching boxes differ by
     * at least 0.22 blocks so every seam shows a crisp 3D rectangular voxel step.
     */
    static float boxes(RiftType type, long seed, int cols, int rows, boolean[][] body, int[][] tier, float[][] depth) {
        if (type == RiftType.PORTAL) {
            for (int i = 0; i < cols; i++) for (int j = 0; j < rows; j++) depth[i][j] = 1.0f;
            return 1.0f;
        }
        int[][] box = new int[cols][rows];
        for (int[] col : box) Arrays.fill(col, -1);
        List<int[]> order = new ArrayList<>();
        for (int i = 0; i < cols; i++) for (int j = 0; j < rows; j++) if (body[i][j]) order.add(new int[]{i, j});
        float ci = (cols - 1) / 2f, cj = (rows - 1) / 2f;
        // Order by rectangular Chebyshev box distance from center (sharp nested hollow rectangles)
        order.sort((a, b) -> Float.compare(
            Math.max(Math.abs(a[0] - ci), Math.abs(a[1] - cj) * 1.05f),
            Math.max(Math.abs(b[0] - ci), Math.abs(b[1] - cj) * 1.05f)));
        List<Float> depths = new ArrayList<>();
        float max = 0f;
        for (int[] start : order) {
            if (box[start[0]][start[1]] >= 0) continue;
            int id = depths.size();
            int maxW = 2 + (int) (hash(seed, id, 41) * 4f), maxH = 2 + (int) (hash(seed, id, 42) * 3f);
            if (id == 0) { maxW += 1; maxH += 1; }
            int x0 = start[0], x1 = start[0], y0 = start[1], y1 = start[1];
            boolean grew = true;
            while (grew) {
                grew = false;
                if (x1 - x0 + 1 < maxW && free(body, box, x1 + 1, x1 + 1, y0, y1)) { x1++; grew = true; }
                if (x1 - x0 + 1 < maxW && free(body, box, x0 - 1, x0 - 1, y0, y1)) { x0--; grew = true; }
                if (y1 - y0 + 1 < maxH && free(body, box, x0, x1, y1 + 1, y1 + 1)) { y1++; grew = true; }
                if (y1 - y0 + 1 < maxH && free(body, box, x0, x1, y0 - 1, y0 - 1)) { y0--; grew = true; }
            }
            float d = id == 0 ? 1.45f : 0.55f + 0.7f * hash(seed, id, 43);
            for (int attempt = 0; attempt < 4; attempt++) {
                boolean clash = false;
                for (int i = x0 - 1; i <= x1 + 1; i++) for (int j = y0 - 1; j <= y1 + 1; j++) {
                    if (i < 0 || j < 0 || i >= cols || j >= rows || box[i][j] < 0) continue;
                    if ((i >= x0 && i <= x1) == (j >= y0 && j <= y1)) continue;   // edge neighbours only
                    if (Math.abs(depths.get(box[i][j]) - d) < 0.22f) clash = true;
                }
                if (!clash) break;
                d = d + 0.29f > 1.3f ? d - 0.53f : d + 0.29f;
                d = Math.max(0.45f, d);
            }
            d = Math.round(d * 40f) / 40f + 0.0037f;                               // never coplanar with satellites
            depths.add(d);
            max = Math.max(max, d);
            int t = tier[start[0]][start[1]];
            for (int i = x0; i <= x1; i++) for (int j = y0; j <= y1; j++) { box[i][j] = id; depth[i][j] = d; tier[i][j] = t; }
        }
        return Math.max(max, 0.5f);
    }

    private static boolean free(boolean[][] body, int[][] box, int x0, int x1, int y0, int y1) {
        if (x0 < 0 || y0 < 0 || x1 >= body.length || y1 >= body[0].length) return false;
        for (int i = x0; i <= x1; i++) for (int j = y0; j <= y1; j++) if (!body[i][j] || box[i][j] >= 0) return false;
        return true;
    }

    // ------------------------------------------------------------------ rectangular perimeter satellites

    /**
     * Anchors satellite hollow voxel boxes and L/Z tetrominoes strictly to the outer rectangular border
     * edges of the voxel silhouette (zero spherical/radial equations).
     */
    private void satellites(RiftType type, long seed) {
        List<int[]> rimCells = new ArrayList<>();
        for (int i = 0; i < cols; i++) {
            for (int j = 0; j < rows; j++) {
                if (!on(i, j)) continue;
                if (!on(i - 1, j) || !on(i + 1, j) || !on(i, j - 1) || !on(i, j + 1)) {
                    rimCells.add(new int[]{i, j});
                }
            }
        }
        int count = switch (type) { case SIFT -> 8; case NETHER -> 9; case OVERWORLD -> 7; case END -> 9; default -> 4; };
        if (rimCells.isEmpty()) return;
        for (int k = 0; k < count; k++) {
            int idx = Math.floorMod((int) (hash(seed, k, 31) * rimCells.size()) + k * (rimCells.size() / Math.max(1, count)), rimCells.size());
            int[] rc = rimCells.get(idx);
            int ri = rc[0], rj = rc[1];
            float oxDir = !on(ri - 1, rj) ? -1f : (!on(ri + 1, rj) ? 1f : 0f);
            float oyDir = !on(ri, rj - 1) ? -1f : (!on(ri, rj + 1) ? 1f : 0f);
            float px = x(ri) + cw * 0.5f + oxDir * cw * 0.55f;
            float cyy = y(rj) + ch * 0.5f + oyDir * ch * 0.55f;
            float zf = 0.2f + 0.9f * hash(seed, k, 34), zb = zf - (0.6f + 0.5f * hash(seed, k, 35));
            int piece = type == RiftType.PORTAL ? 0 : k % 3;                     // 0 hollow box, 1 L, 2 Z tetromino
            if (piece == 0) {
                float sw = 0.9f + 0.8f * hash(seed, k, 32), sh = 0.8f + 0.8f * hash(seed, k, 33);
                sats.add(new float[]{px - sw / 2, cyy - sh / 2, px + sw / 2, cyy + sh / 2, zf, zb, k, 0});
            } else {
                int[][] cells = piece == 1 ? new int[][]{{0, 0}, {0, 1}, {0, 2}, {1, 0}} : new int[][]{{0, 1}, {1, 1}, {1, 0}, {2, 0}};
                float q = 0.45f + 0.15f * hash(seed, k, 32);
                int flip = hash(seed, k, 33) > 0.5f ? -1 : 1;
                float ox = px - q * 1.5f * flip, oy = cyy - q * 1.5f;
                for (int[] c : cells) {
                    int mask = 0;
                    for (int[] o : cells) {
                        if (o[1] == c[1] && o[0] == c[0] - flip) mask |= 1;
                        if (o[1] == c[1] && o[0] == c[0] + flip) mask |= 2;
                        if (o[0] == c[0] && o[1] == c[1] - 1) mask |= 4;
                        if (o[0] == c[0] && o[1] == c[1] + 1) mask |= 8;
                    }
                    float x0 = ox + c[0] * q * flip, x1 = x0 + q * flip;
                    sats.add(new float[]{Math.min(x0, x1), oy + c[1] * q, Math.max(x0, x1), oy + (c[1] + 1) * q, zf, zb, k, mask});
                }
            }
        }
    }
}
