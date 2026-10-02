package dev.logan.entersift;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

/**
 * 0.39: the two complaints from the screenshots, measured instead of eyeballed - the opening must cover
 * the interior, and the border must actually fade to nothing at its own ends.
 */
class RiftShapeWindowTest {

    private static float centre(RiftShape sh, int i, int j) {
        return sh.fadeAt((sh.x(i) + sh.x(i + 1)) * 0.5f, (sh.y(j) + sh.y(j + 1)) * 0.5f);
    }

    @Test void theInteriorIsTheWindowNotASquareInTheMiddle() {
        for (RiftType type : RiftType.values()) {
            RiftShape sh = RiftShape.build(type, 7L, 5f, 4f);
            int body = 0, open = 0;
            for (int i = 0; i < sh.cols; i++) for (int j = 0; j < sh.rows; j++)
                if (sh.on(i, j)) { body++; if (sh.windowCell(i, j)) open++; }
            assertTrue(body > 20, type + " has a body");
            if (type == RiftType.PORTAL) {
                assertEquals(body, open, "the cyan portal stays a fully glazed mosaic");
            } else {
                assertTrue(open >= body * 0.45f,
                    type + ": the opening must be most of the interior, not a square in the middle ("
                        + open + "/" + body + ")");
            }
        }
    }

    @Test void theBorderFadesToNothingAtItsOwnEnds() {
        for (RiftType type : RiftType.values()) {
            RiftShape sh = RiftShape.build(type, 7L, 5f, 4f);
            assertEquals(1f, sh.fadeAt(0f, sh.cy()), 1e-6f, type + ": the middle of the structure is full brightness");
            float min = 1f, max = 0f;
            for (int i = 0; i < sh.cols; i++) for (int j = 0; j < sh.rows; j++) {
                if (!sh.on(i, j)) continue;
                float f = centre(sh, i, j);
                assertTrue(f >= 0f && f <= 1f, type + ": fade in range");
                min = Math.min(min, f);
                max = Math.max(max, f);
            }
            assertTrue(max > 0.9f, type + ": the core of the structure stays bright");
            assertTrue(min < 0.25f, type + ": the outermost cells must be nearly gone, not left at " + min);
            // the fade never rises as you move away from the middle (it is a radial gradient, so this
            // is also what makes it read as beams dissolving along their length)
            for (int i = 0; i < sh.cols; i++) for (int j = 0; j < sh.rows; j++) {
                if (!sh.on(i, j)) continue;
                float x = (sh.x(i) + sh.x(i + 1)) * 0.5f, y = (sh.y(j) + sh.y(j + 1)) * 0.5f;
                float r = (float) Math.sqrt((x / (sh.w * 0.5f)) * (x / (sh.w * 0.5f))
                    + ((y - sh.cy()) / (sh.h * 0.5f)) * ((y - sh.cy()) / (sh.h * 0.5f)));
                if (r > 1.05f) assertEquals(0f, centre(sh, i, j), 1e-6f, type + ": past the ends it is nothing");
            }
        }
    }

    @Test void theTallVariantFadesToo() {
        RiftShape sh = RiftShape.build(RiftType.SIFT, 3L, 5f, 8f);
        assertTrue(RiftShape.tallVariant(5f, 8f));
        assertEquals(1f, sh.fadeAt(0f, sh.cy()), 1e-6f);
        float min = 1f;
        for (int i = 0; i < sh.cols; i++) for (int j = 0; j < sh.rows; j++)
            if (sh.on(i, j)) min = Math.min(min, centre(sh, i, j));
        assertTrue(min < 0.25f, "the tall tower's top must dissolve as well (min " + min + ")");
    }
}
