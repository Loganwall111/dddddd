package com.beyondthelimits.util;

import com.beyondthelimits.BeyondTheLimits;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Failure containment.
 *
 * <p>A reality-collapse mod touches almost every part of the game, and a single broken tick
 * handler must never take a server down. Every engine, hook and manager call is wrapped in
 * {@link #guard(String, Runnable)}, which logs a given failure at most once and then keeps the
 * rest of the simulation running.</p>
 */
public final class BtlSafe {
	private static final Map<String, Boolean> REPORTED = new ConcurrentHashMap<>();
	private static final Map<String, Integer> COUNTERS = new ConcurrentHashMap<>();

	private BtlSafe() {
	}

	public static void guard(String label, Runnable action) {
		try {
			action.run();
		} catch (Throwable throwable) {
			report(label, throwable);
		}
	}

	public static <T> T supply(String label, java.util.function.Supplier<T> action, T fallback) {
		try {
			return action.get();
		} catch (Throwable throwable) {
			report(label, throwable);
			return fallback;
		}
	}

	public static void report(String label, Throwable throwable) {
		int count = COUNTERS.merge(label, 1, Integer::sum);

		if (REPORTED.putIfAbsent(label, Boolean.TRUE) == null) {
			BeyondTheLimits.LOGGER.error("[Beyond the Limits] '{}' failed — the rest of the simulation continues", label, throwable);
		} else if (count % 500 == 0) {
			BeyondTheLimits.LOGGER.warn("[Beyond the Limits] '{}' has failed {} times", label, count);
		}
	}

	/** Diagnostics used by {@code /beyondthelimits status}. */
	public static Map<String, Integer> failureCounts() {
		return new LinkedHashMap<>(COUNTERS);
	}
}
