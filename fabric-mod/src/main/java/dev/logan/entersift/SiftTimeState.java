package dev.logan.entersift;

import java.util.Locale;

/**
 * Centralized Sift atmospheric & Rift time-state controller.
 *
 * <p>Completely independent from the Overworld day/night clock. Controls the
 * three canonical Sift atmospheric states ({@link State#FLOW}, {@link State#THRIVE},
 * and {@link State#LYMPH} / lava-lamp) and smoothly interpolates every sky-dome
 * and Rift layer parameter during state transitions.
 */
public final class SiftTimeState {
    private SiftTimeState() {}

    /** Duration (in seconds) for smooth cross-fade between Sift time states. */
    public static final float TRANSITION_SECONDS = 2.4f;

    /** Independent Sift cycle period in ticks (when auto-cycle is enabled). */
    public static final long CYCLE_PERIOD_TICKS = 24000L;

    public enum State {
        /**
         * State 1 — FLOW:
         * Bright Sift atmospheric state dominated by cyan, turquoise, pale blue,
         * pastel green, subtle pink/magenta, subtle upper-dome rainbow quality,
         * large wavy dark "soul face" boundaries, and soft luminous shapes.
         */
        FLOW(
            "flow",
            "FLOW (Bright Cyan/Turquoise Atmospheric Dome)",
            1200L,
            new Parameters(
                1.05f, // skyBrightness
                1.04f, // skyContrast
                1.00f, // cyanWeight
                0.94f, // pastelGreenWeight
                0.52f, // magentaWeight
                0.68f, // rainbowWeight
                0.76f, // darkBandOpacity
                1.02f, // darkBandContrast
                0.64f, // godRayIntensity
                1.00f, // riftGlowIntensity
                0.95f, // riftBloomStrength
                0.90f, // backDistortionStrength
                0.92f, // backDistortionDepth
                0.96f, // floatingSquareBrightness
                1.00f, // panoramaFlowWeight
                0.00f, // panoramaThriveWeight
                0.00f  // lavaLampWeight
            )
        ),

        /**
         * State 2 — THRIVE:
         * Near-night Sift state with darker blue/cyan base, stronger magenta/pink,
         * increased contrast, extremely strong accumulated volumetric god rays,
         * stronger Rift luminance/bloom, and deeper back distortion.
         */
        THRIVE(
            "thrive",
            "THRIVE (Near-Night Magenta/Cyan Volumetric God-Ray State)",
            14500L,
            new Parameters(
                0.72f, // skyBrightness
                1.34f, // skyContrast
                0.86f, // cyanWeight
                0.42f, // pastelGreenWeight
                1.18f, // magentaWeight
                0.22f, // rainbowWeight
                0.90f, // darkBandOpacity
                1.38f, // darkBandContrast
                1.52f, // godRayIntensity (extremely strong in Thrive)
                1.42f, // riftGlowIntensity
                1.38f, // riftBloomStrength
                1.28f, // backDistortionStrength
                1.32f, // backDistortionDepth
                1.28f, // floatingSquareBrightness
                0.00f, // panoramaFlowWeight
                1.00f, // panoramaThriveWeight
                0.00f  // lavaLampWeight
            )
        ),

        /**
         * State 3 — LYMPH (also known as LAVA_LAMP):
         * Preserves and integrates the organic lava-lamp / lymph-field Sift
         * atmosphere with metaball blobs, soft panels, and its own Rift parameter set.
         */
        LYMPH(
            "lymph",
            "LYMPH / LAVA_LAMP (Organic Lymph-Field & Lava-Lamp Atmosphere)",
            7500L,
            new Parameters(
                0.94f, // skyBrightness
                1.12f, // skyContrast
                0.90f, // cyanWeight
                0.88f, // pastelGreenWeight
                0.86f, // magentaWeight
                0.38f, // rainbowWeight
                0.56f, // darkBandOpacity
                0.96f, // darkBandContrast
                0.85f, // godRayIntensity
                1.14f, // riftGlowIntensity
                1.10f, // riftBloomStrength
                1.04f, // backDistortionStrength
                1.06f, // backDistortionDepth
                1.06f, // floatingSquareBrightness
                0.20f, // panoramaFlowWeight
                0.20f, // panoramaThriveWeight
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
                case "thrive", "night", "rays", "godrays", "dusk" -> THRIVE;
                case "lymph", "lava_lamp", "lavalamp", "lava", "legacy", "pulse", "metaball" -> LYMPH;
                default -> null;
            };
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
        float riftBloomStrength,
        float backDistortionStrength,
        float backDistortionDepth,
        float floatingSquareBrightness,
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
                mix(a.riftBloomStrength, b.riftBloomStrength, s),
                mix(a.backDistortionStrength, b.backDistortionStrength, s),
                mix(a.backDistortionDepth, b.backDistortionDepth, s),
                mix(a.floatingSquareBrightness, b.floatingSquareBrightness, s),
                mix(a.panoramaFlowWeight, b.panoramaFlowWeight, s),
                mix(a.panoramaThriveWeight, b.panoramaThriveWeight, s),
                mix(a.lavaLampWeight, b.lavaLampWeight, s)
            );
        }

        public boolean isThriveDominant() {
            return panoramaThriveWeight >= 0.45f || godRayIntensity >= 1.15f;
        }
    }

    private static volatile State currentState = State.FLOW;
    private static volatile State previousState = State.FLOW;
    private static volatile long transitionStartNanos = System.nanoTime();
    private static volatile boolean locked = true;
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
     * Enables or disables automatic cycling along the independent Sift clock
     * (never using the Overworld clock).
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
            long clock = getIndependentClockTicks(0f);
            if (clock < 6000L || clock >= 21000L) return State.FLOW;
            if (clock < 12000L) return State.LYMPH;
            return State.THRIVE;
        }
        return currentState;
    }

    public static State getPreviousState() {
        return previousState;
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
        if (!locked) {
            float clock = getIndependentClockFloat(0f);
            // Smoothly blend across FLOW (0..8000), LYMPH (8000..16000), THRIVE (16000..24000)
            if (clock < 8000f) {
                float t = smooth01((clock - 5500f) / 2500f);
                return Parameters.lerp(State.FLOW.params, State.LYMPH.params, t);
            } else if (clock < 16000f) {
                float t = smooth01((clock - 13500f) / 2500f);
                return Parameters.lerp(State.LYMPH.params, State.THRIVE.params, t);
            } else {
                float t = smooth01((clock - 21500f) / 2500f);
                return Parameters.lerp(State.THRIVE.params, State.FLOW.params, t);
            }
        }
        float t = getTransitionProgress();
        if (t >= 0.999f || previousState == currentState) {
            return currentState.params;
        }
        return Parameters.lerp(previousState.params, currentState.params, t);
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
