package com.beyondthelimits.core;

import com.beyondthelimits.core.engine.BackroomsEngine;
import com.beyondthelimits.core.engine.BlackSunEngine;
import com.beyondthelimits.core.engine.CollisionEngine;
import com.beyondthelimits.core.engine.DementiaEngine;
import com.beyondthelimits.core.engine.EvolutionEngine;
import com.beyondthelimits.core.engine.GravityEngine;
import com.beyondthelimits.core.engine.ImpossibleEngine;
import com.beyondthelimits.core.engine.LastChunkEngine;
import com.beyondthelimits.core.engine.LostCivilizationEngine;
import com.beyondthelimits.core.engine.MemoryRecorder;
import com.beyondthelimits.core.engine.MirrorEngine;
import com.beyondthelimits.core.engine.MovingChunkEngine;
import com.beyondthelimits.core.engine.ObserverEngine;
import com.beyondthelimits.core.engine.RealityEngine;
import com.beyondthelimits.core.engine.RiftEngine;
import com.beyondthelimits.core.engine.SignalEngine;
import com.beyondthelimits.core.engine.StormEngine;
import com.beyondthelimits.core.engine.TemporalEngine;
import com.beyondthelimits.util.BtlSafe;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.world.ServerWorld;

/**
 * The heartbeat.
 *
 * <p>One server tick hook drives every system in the mod, in a fixed order, at a fixed budget.
 * Fast systems run every tick, "slow" systems (world scans, structure placement, mutation) run on a
 * configurable cadence, and the whole chain is wrapped in {@link BtlSafe} so that a failure in, for
 * example, the moving chunk cannot take down the reality engine.</p>
 */
public final class BtlEngine {
	private BtlEngine() {
	}

	private static int tickCounter;

	public static void onServerStarted(MinecraftServer server) {
		BtlSafe.guard("engine.start", () -> {
			BtlState.get().bind(server);
			RealityEngine.onServerStarted(server);
			StormEngine.onServerStarted(server);
			BlackSunEngine.onServerStarted(server);
			SignalEngine.onServerStarted(server);
			MovingChunkEngine.onServerStarted(server);
			EvolutionEngine.onServerStarted(server);
		});
	}

	public static void onServerStopping(MinecraftServer server) {
		BtlSafe.guard("engine.stop", () -> {
			BtlState.get().save();
			RealityEngine.onServerStopping(server);
		});
	}

	public static void tick(MinecraftServer server) {
		tickCounter++;

		// ---- every tick -------------------------------------------------------------------------
		BtlSafe.guard("state.tick", () -> BtlState.get().tick(server));
		BtlSafe.guard("reality.tick", () -> RealityEngine.tick(server, tickCounter));
		BtlSafe.guard("rift.tick", () -> RiftEngine.tick(server, tickCounter));
		BtlSafe.guard("storm.tick", () -> StormEngine.tick(server, tickCounter));
		BtlSafe.guard("black_sun.tick", () -> BlackSunEngine.tick(server, tickCounter));
		BtlSafe.guard("backrooms.tick", () -> BackroomsEngine.tick(server, tickCounter));
		BtlSafe.guard("memory.tick", () -> MemoryRecorder.tick(server, tickCounter));
		BtlSafe.guard("explosion.tick", () -> ExplosionEngine.tick(server, tickCounter));

		// ---- once per second --------------------------------------------------------------------
		if (tickCounter % BtlConfig.SLOW_TICK_INTERVAL == 0) {
			BtlSafe.guard("dementia.tick", () -> DementiaEngine.tick(server, tickCounter));
			BtlSafe.guard("gravity.tick", () -> GravityEngine.tick(server, tickCounter));
			BtlSafe.guard("observer.tick", () -> ObserverEngine.tick(server, tickCounter));
			BtlSafe.guard("evolution.tick", () -> EvolutionEngine.tick(server, tickCounter));
			BtlSafe.guard("temporal.tick", () -> TemporalEngine.tick(server, tickCounter));
			BtlSafe.guard("impossible.tick", () -> ImpossibleEngine.tick(server, tickCounter));
			BtlSafe.guard("mirror.tick", () -> MirrorEngine.tick(server, tickCounter));
			BtlSafe.guard("signal.tick", () -> SignalEngine.tick(server, tickCounter));
			BtlSafe.guard("last_chunk.tick", () -> LastChunkEngine.tick(server, tickCounter));
		}

		// ---- once every five seconds -------------------------------------------------------------
		if (tickCounter % BtlConfig.WORLD_TICK_INTERVAL == 0) {
			BtlSafe.guard("collision.tick", () -> CollisionEngine.tick(server, tickCounter));
			BtlSafe.guard("lost_civ.tick", () -> LostCivilizationEngine.tick(server, tickCounter));
			BtlSafe.guard("moving_chunk.tick", () -> MovingChunkEngine.tick(server, tickCounter));
			BtlSafe.guard("mutation.tick", () -> {
				for (ServerWorld world : server.getWorlds()) {
					com.beyondthelimits.core.engine.MutationEngine.tick(world);
				}
			});
			BtlSafe.guard("perf.save", () -> {
				if (tickCounter % 1200 == 0) {
					BtlState.get().save();
				}
			});
		}
	}

	/** Diagnostics helper used by {@code /beyondthelimits status}. */
	public static String diagnostics(MinecraftServer server) {
		ServerWorld overworld = server.getOverworld();

		if (overworld == null) {
			return "no overworld";
		}

		int worldCount = 0;

		for (ServerWorld ignored : server.getWorlds()) {
			worldCount++;
		}

		return "tick=" + tickCounter + " worlds=" + worldCount + " failures=" + BtlSafe.failureCounts();
	}
}
