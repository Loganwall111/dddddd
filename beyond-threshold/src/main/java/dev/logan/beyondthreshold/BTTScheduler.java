package dev.logan.beyondthreshold;

import net.minecraft.server.MinecraftServer;

import java.util.ArrayList;
import java.util.List;

/** Tiny server-tick delayed task queue (no threading, no risk). */
public final class BTTScheduler {
	private static final List<int[]> COUNTS = new ArrayList<>();
	private static final List<Runnable> RUNS = new ArrayList<>();

	public static synchronized void in(int ticks, Runnable run) {
		COUNTS.add(new int[]{ticks});
		RUNS.add(run);
	}

	public static synchronized void tick(MinecraftServer server) {
		if (RUNS.isEmpty()) {
			return;
		}
		List<Runnable> due = null;
		for (int i = COUNTS.size() - 1; i >= 0; i--) {
			if (--COUNTS.get(i)[0] <= 0) {
				if (due == null) {
					due = new ArrayList<>();
				}
				due.add(RUNS.get(i));
				COUNTS.remove(i);
				RUNS.remove(i);
			}
		}
		if (due != null) {
			for (Runnable r : due) {
				r.run();
			}
		}
	}
}
