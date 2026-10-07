package dev.logan.beyond.math;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class SimulationTest {
    @Test void gravityIsBoundedOverTenThousandTicks() {
        Vec p = new Vec(10, 4, 0), velocity = Vec.ZERO;
        for (int tick = 0; tick < 10000; tick++) {
            velocity = Gravity.integrate(p, velocity, Vec.ZERO, 1.15, 24, 4, .85);
            assertTrue(velocity.finite()); assertTrue(velocity.length() <= .850000001);
            p = p.add(velocity);
        }
    }
    @Test void gravityPointsTowardTheCenter() {
        Vec v = Gravity.integrate(new Vec(10, 0, 0), Vec.ZERO, Vec.ZERO, 1, 24, 4, .85);
        assertTrue(v.x() < 0); assertEquals(0, v.y()); assertEquals(0, v.z());
    }
    @Test void noSingularityAtExactCenter() {
        assertEquals(Vec.ZERO, Gravity.integrate(Vec.ZERO, Vec.ZERO, Vec.ZERO, 1, 24, 4, .85));
    }
    @Test void noForceOutsideInfluence() {
        Vec v = new Vec(.1, .1, .2);
        assertEquals(v, Gravity.integrate(new Vec(25, 0, 0), v, Vec.ZERO, 1, 24, 4, .85));
    }
    @ParameterizedTest @ValueSource(doubles = {Double.NaN, Double.POSITIVE_INFINITY, -1, 0})
    void invalidMassCannotPoisonVelocity(double mass) {
        assertEquals(Vec.ZERO, Gravity.integrate(new Vec(5, 0, 0), Vec.ZERO, Vec.ZERO, 1, 24, mass, .85));
    }
    @Test void nonFiniteStateRecovers() {
        assertEquals(Vec.ZERO, Gravity.integrate(Vec.ZERO, new Vec(Double.NaN, 1, 1), Vec.ZERO, 1, 24, 4, .85));
    }
    @Test void fastPlayerCrossesMembraneBetweenTicks() {
        assertTrue(Membrane.crossed(new Vec(0, 0, -4), new Vec(0, 0, 4), Vec.ZERO, 0, 1.6, 2.16));
    }
    @Test void membraneWorksFromBothSides() {
        assertTrue(Membrane.crossed(new Vec(0, 0, 4), new Vec(0, 0, -4), Vec.ZERO, 0, 1.6, 2.16));
    }
    @Test void noCrossWhenWalkingBesideIt() {
        assertFalse(Membrane.crossed(new Vec(2, 0, -1), new Vec(2, 0, 1), Vec.ZERO, 0, 1.6, 2.16));
    }
    @Test void roundedCornersMatchTheShader() {
        assertFalse(Membrane.crossed(new Vec(1.55, 2.10, -1), new Vec(1.55, 2.10, 1), Vec.ZERO, 0, 1.6, 2.16));
    }
    @Test void stationaryPlayerDoesNotTriggerRepeatedTeleports() {
        assertFalse(Membrane.crossed(Vec.ZERO, Vec.ZERO, Vec.ZERO, 0, 1.6, 2.16));
    }
    @Test void yawAndTranslationAreApplied() {
        Vec center = new Vec(4, 8, 3);
        assertTrue(Membrane.crossed(new Vec(1, 8, 3), new Vec(7, 8, 3), center, Math.PI / 2, 1.6, 2.16));
    }
    @ParameterizedTest @ValueSource(ints = {1, 2, 8, 17, 32})
    void realmCycleVisitsEverySlotExactlyOnce(int count) {
        Set<Integer> visited = new HashSet<>();
        for (int i = 0; i < count; i++) visited.add(RealmSeed.slot(-92817, 43452, i, count));
        assertEquals(count, visited.size()); assertTrue(visited.stream().allMatch(i -> i >= 0 && i < count));
    }
    @Test void seedAddressIsStable() {
        assertEquals(RealmSeed.slot(815, 2301, 27, 8), RealmSeed.slot(815, 2301, 27, 8));
    }
    @Test void catalogGrowthIsBounded() {
        assertThrows(IllegalArgumentException.class, () -> RealmSeed.slot(1, 2, 1, 33));
    }
}
