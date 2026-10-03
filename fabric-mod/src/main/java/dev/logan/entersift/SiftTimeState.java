package dev.logan.entersift;

import java.util.Locale;

/**
 * Centralized Sift atmospheric & Rift time-state controller.
 *
 * <p>Completely independent from the Overworld day/night clock ({@code minecraft:overworld}).
 * Controls the three canonical Sift atmospheric states ({@link State#FLOW}, {@link State#THRIVE},
 * and {@link State#ENDURE} / {@link State#LYMPH} / lava-lamp) on the {@code entersift:sift}
 * clock and smoothly interpolates every sky-dome and Rift layer parameter during transitions.
 */
public final class SiftTimeState {
    private SiftTimeState() {}

    /** Duration (in seconds) for smooth cross-fade between Sift time states. */
    public static final float TRANSITION_SECONDS = 2.4f;

    /** Independent Sift cycle period in ticks (matches {@code timeline/sift_cycle.json}). */
    public static final long CYCLE_PERIOD_TICKS = 24000L;

    /** Alias constant preserving LYMPH / LAVA_LAMP references alongside ENDURE. */
    public static final State LYMPH = State.ENDURE;
    public static final State LAVA_LAMP = State.ENDURE;

    public enum State {
        /**
         * State 1 — FLOW (0..5000 ticks on {@code entersift:sift}):
         * Bright Sift atmospheric state dominated by cyan, turquoise, pale blue,
         * pastel green, subtle pink/magenta, subtle upper-dome rainbow quality,
         * large wavy dark "soul face" boundaries, and soft luminous shapes.
         */
        FLOW(
            "flow",
            "FLOW (Bright Cyan/Turquoise Atmospheric Dome)",
            1000L,
            new Parameters(
                1.05f, // skyBrightness
                1.04f, // skyContrast
                1.00f, // cyanWeight
                0.94f, // pastelGreenWeight
                0.54f, // magentaWeight
                0.70f, // rainbowWeight
                0.78f, // darkBandOpacity
                1.04f, // darkBandContrast
                0.68f, // godRayIntensity
                1.02f, // riftGlowIntensity
                1.00f, // riftCoreWhiteIntensity
                0.96f, // riftBloomStrength
                0.92f, // backDistortionStrength
                0.94f, // backDistortionDepth
                0.98f, // floatingSquareBrightness
                1.00f, // floatingSquareDensity
                1.00f, // panoramaFlowWeight
                0.00f, // panoramaThriveWeight
                0.15f  // lavaLampWeight
            )
        ),

        /**
         * State 2 — THRIVE (6000..11000 ticks on {@code entersift:sift}):
         * Near-night / twilight high-contrast Sift state with darker blue/cyan base,
         * stronger magenta/pink upper bands, increased contrast, accumulated soft
         * volumetric god rays, stronger Rift luminance/bloom, and deeper back distortion.
         */
        THRIVE(
            "thrive",
            "THRIVE (Near-Night Magenta/Cyan Volumetric God-Ray State)",
            7500L,
            new Parameters(
                0.74f, // skyBrightness
                1.36f, // skyContrast
                0.88f, // cyanWeight
                0.44f, // pastelGreenWeight
                1.22f, // magentaWeight
                0.26f, // rainbowWeight
                0.92f, // darkBandOpacity
                1.38f, // darkBandContrast
                1.56f, // godRayIntensity (accumulated volumetric light shafts)
                1.44f, // riftGlowIntensity
                1.28f, // riftCoreWhiteIntensity
                1.40f, // riftBloomStrength
                1.30f, // backDistortionStrength
                1.34f, // backDistortionDepth
                1.30f, // floatingSquareBrightness
                1.22f, // floatingSquareDensity
                0.00f, // panoramaFlowWeight
                1.00f, // panoramaThriveWeight
                0.15f  // lavaLampWeight
            )
        ),

        /**
         * State 3 — ENDURE / LYMPH / LAVA_LAMP (13000..22500 ticks on {@code entersift:sift}):
         * Preserves and integrates the third Sift atmospheric state (warm amber/magenta
         * lava-lamp / lymph-field Sift atmosphere with metaball blobs and soft panels).
         */
        ENDURE(
            "endure",
            "ENDURE / LYMPH (Warm Lava-Lamp & Lymph-Field Atmosphere)",
            15000L,
            new Parameters(
                0.90f, // skyBrightness
                1.16f, // skyContrast
                0.78f, // cyanWeight
                0.72f, // pastelGreenWeight
                0.92f, // magentaWeight
                0.36f, // rainbowWeight
                0.64f, // darkBandOpacity
                1.02f, // darkBandContrast
                0.88f, // godRayIntensity
                1.18f, // riftGlowIntensity
                1.10f, // riftCoreWhiteIntensity
                1.14f, // riftBloomStrength
                1.08f, // backDistortionStrength
                1.10f, // backDistortionDepth
                1.10f, // floatingSquareBrightness
                1.05f, // floatingSquareDensity
                0.18f, // panoramaFlowWeight
                0.24f, // panoramaThriveWeight
                1.00f  // lavaLampWeight
            )
        );

        public final String id;
        public final String description;
        public final long canonicalClockTicks;
        public final Parameters params;

        State(String id, String description, long canonicalClockTicks, Parameters params) {
            this.id = id;
            this.description = description;
            this.canonicalClockTicks = canonicalClockTicks;
            this.params = params;
        }

        public static State byName(String raw) {
            if (raw == null) return null;
            String s = raw.trim().toLowerCase(Locale.ROOT);
            return switch (s) {
                case "flow", "day", "bright", "cyan" -> FLOW;
                case "thrive", "rays", "godrays", "dusk", "twilight", "night" -> THRIVE;
                case "endure", "lymph", "lava_lamp", "lavalamp", "lava", "legacy", "pulse", "metaball" -> ENDURE;
                default -> null;
            };
        }

        public static State fromClockTicks(long clockTicks) {
            long t = Math.floorMod(clockTicks, CYCLE_PERIOD_TICKS);
            if (t >= 13000L) return ENDURE;
            if (t >= 6000L) return THRIVE;
            return FLOW;
        }
    }

    /**
     * Immutable interpolated parameter set driving both SiftSky and RiftPortalRenderer.
     */
    public record Parameters(
        float skyBrightness,
        float skyContrast,
        float cyanWeight,
        float pastelGreenWeight,
        float magentaWeight,
        float rainbowWeight,
        float darkBandOpacity,
        float darkBandContrast,
        float godRayIntensity,
        float riftGlowIntensity,
        float riftCoreWhiteIntensity,
        float riftBloomStrength,
        float backDistortionStrength,
        float backDistortionDepth,
        float floatingSquareBrightness,
        float floatingSquareDensity,
        float panoramaFlowWeight,
        float panoramaThriveWeight,
        float lavaLampWeight
    ) {
        public static Parameters lerp(Parameters a, Parameters b, float t) {
            float s = smooth01(t);
            return new Parameters(
                mix(a.skyBrightness, b.skyBrightness, s),
                mix(a.skyContrast, b.skyContrast, s),
                mix(a.cyanWeight, b.cyanWeight, s),
                mix(a.pastelGreenWeight, b.pastelGreenWeight, s),
                mix(a.magentaWeight, b.magentaWeight, s),
                mix(a.rainbowWeight, b.rainbowWeight, s),
                mix(a.darkBandOpacity, b.darkBandOpacity, s),
                mix(a.darkBandContrast, b.darkBandContrast, s),
                mix(a.godRayIntensity, b.godRayIntensity, s),
                mix(a.riftGlowIntensity, b.riftGlowIntensity, s),
                mix(a.riftCoreWhiteIntensity, b.riftCoreWhiteIntensity, s),
                mix(a.riftBloomStrength, b.riftBloomStrength, s),
                mix(a.backDistortionStrength, b.backDistortionStrength, s),
                mix(a.backDistortionDepth, b.backDistortionDepth, s),
                mix(a.floatingSquareBrightness, b.floatingSquareBrightness, s),
                mix(a.floatingSquareDensity, b.floatingSquareDensity, s),
                mix(a.panoramaFlowWeight, b.panoramaFlowWeight, s),
                mix(a.panoramaThriveWeight, b.panoramaThriveWeight, s),
                mix(a.lavaLampWeight, b.lavaLampWeight, s)
            );
        }

        public boolean isThriveDominant() {
            return panoramaThriveWeight >= 0.45f || godRayIntensity >= 1.20f;
        }
    }

    private static volatile State currentState = State.FLOW;
    private static volatile State previousState = State.FLOW;
    private static volatile long transitionStartNanos = System.nanoTime();
    private static volatile boolean locked = false;
    private static volatile long independentEpochNanos = System.nanoTime();
    private static volatile long baseSiftTicks = State.FLOW.canonicalClockTicks;

    /**
     * Sets the active Sift time state and starts a smooth parameter transition.
     * Independent from Overworld day/night time.
     */
    public static synchronized void setState(State target) {
        setState(target, false);
    }

    public static synchronized void setState(State target, boolean instant) {
        if (target == null) return;
        previousState = instant ? target : currentState;
        currentState = target;
        locked = true;
        transitionStartNanos = instant
            ? System.nanoTime() - (long) ((TRANSITION_SECONDS + 1f) * 1_000_000_000L)
            : System.nanoTime();
        baseSiftTicks = target.canonicalClockTicks;
        independentEpochNanos = System.nanoTime();
    }

    /**
     * Enables or disables automatic cycling along the independent Sift clock.
     */
    public static synchronized void setAutoCycle(boolean enable) {
        if (enable && locked) {
            baseSiftTicks = currentState.canonicalClockTicks;
            independentEpochNanos = System.nanoTime();
        } else if (!enable && !locked) {
            baseSiftTicks = getIndependentClockTicks(0f);
            independentEpochNanos = System.nanoTime();
        }
        locked = !enable;
    }

    public static boolean isLocked() {
        return locked;
    }

    public static State getState() {
        if (!locked) {
            return State.fromClockTicks(getIndependentClockTicks(0f));
        }
        return currentState;
    }

    public static State getPreviousState() {
        return previousState;
    }

    /**
     * Synchronizes the client-side state tracker with the authoritative {@code entersift:sift}
     * world clock when not explicitly locked, triggering smooth transitions whenever the
     * clock crosses between Flow, Thrive, and Endure.
     */
    public static synchronized void observeClockTicks(long siftClockTicks) {
        if (locked) return;
        baseSiftTicks = Math.floorMod(siftClockTicks, CYCLE_PERIOD_TICKS);
        independentEpochNanos = System.nanoTime();
        State observed = State.fromClockTicks(baseSiftTicks);
        if (observed != currentState) {
            previousState = currentState;
            currentState = observed;
            transitionStartNanos = System.nanoTime();
        }
    }

    /**
     * Returns the current transition progress in [0, 1].
     */
    public static float getTransitionProgress() {
        long elapsedNanos = Math.max(0L, System.nanoTime() - transitionStartNanos);
        float elapsedSec = elapsedNanos * 1e-9f;
        return Math.min(1f, Math.max(0f, elapsedSec / TRANSITION_SECONDS));
    }

    /**
     * Returns the smoothly interpolated Sift parameters for the current frame.
     */
    public static Parameters currentParameters() {
        float t = getTransitionProgress();
        if (t < 0.999f && previousState != currentState) {
            return Parameters.lerp(previousState.params, currentState.params, t);
        }
        if (!locked) {
            return parametersForClock(getIndependentClockFloat(0f));
        }
        return currentState.params;
    }

    /**
     * Smoothly interpolates parameters along the 24,000-tick {@code entersift:sift} timeline
     * matching {@code STAGE_TICKS = {0, 5000, 6000, 11000, 13000, 22500}}.
     */
    public static Parameters parametersForClock(float clockTicks) {
        float c = ((clockTicks % 24000f) + 24000f) % 24000f;
        if (c < 5000f) {
            return State.FLOW.params;
        } else if (c < 6000f) {
            return Parameters.lerp(State.FLOW.params, State.THRIVE.params, (c - 5000f) / 1000f);
        } else if (c < 11000f) {
            return State.THRIVE.params;
        } else if (c < 13000f) {
            return Parameters.lerp(State.THRIVE.params, State.ENDURE.params, (c - 11000f) / 2000f);
        } else if (c < 22500f) {
            return State.ENDURE.params;
        } else {
            return Parameters.lerp(State.ENDURE.params, State.FLOW.params, (c - 22500f) / 1500f);
        }
    }

    /**
     * Returns the independent Sift clock in ticks [0, 24000), completely
     * decoupled from the Overworld day/night cycle.
     */
    public static long getIndependentClockTicks(float partialTick) {
        return (long) getIndependentClockFloat(partialTick) % CYCLE_PERIOD_TICKS;
    }

    public static float getIndependentClockFloat(float partialTick) {
        if (locked) {
            float t = smooth01(getTransitionProgress());
            float from = previousState.canonicalClockTicks;
            float to = currentState.canonicalClockTicks;
            float diff = to - from;
            if (diff > 12000f) diff -= 24000f;
            if (diff < -12000f) diff += 24000f;
            float val = (from + diff * t) % 24000f;
            return val < 0f ? val + 24000f : val;
        }
        long elapsedNanos = Math.max(0L, System.nanoTime() - independentEpochNanos);
        double elapsedTicks = (elapsedNanos * 1e-9) * 20.0 + partialTick;
        double total = (baseSiftTicks + elapsedTicks) % CYCLE_PERIOD_TICKS;
        return (float) (total < 0 ? total + CYCLE_PERIOD_TICKS : total);
    }

    /**
     * Continuous animation time in seconds, driven by monotonic system clock so
     * Sift sky and Rift waves animate smoothly regardless of Overworld time rules.
     */
    public static float animationSeconds(float partialTick) {
        long elapsedNanos = System.nanoTime() - independentEpochNanos;
        float sec = (float) (elapsedNanos * 1e-9);
        if (!Float.isFinite(sec)) return 0f;
        return sec;
    }

    private static float smooth01(float x) {
        float c = Math.max(0f, Math.min(1f, x));
        return c * c * (3f - 2f * c);
    }

    private static float mix(float a, float b, float t) {
        return a + (b - a) * t;
    }
}
