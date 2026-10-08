package com.beyondthelimits;

import com.beyondthelimits.core.BtlEngine;
import com.beyondthelimits.registry.BtlBlockEntities;
import com.beyondthelimits.registry.BtlBlocks;
import com.beyondthelimits.registry.BtlChunkGenerators;
import com.beyondthelimits.registry.BtlDimensions;
import com.beyondthelimits.registry.BtlEntities;
import com.beyondthelimits.registry.BtlItemGroups;
import com.beyondthelimits.registry.BtlItems;
import com.beyondthelimits.registry.BtlParticles;
import com.beyondthelimits.registry.BtlSounds;
import com.beyondthelimits.registry.BtlStatusEffects;
import com.beyondthelimits.world.BtlWorldEvents;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.minecraft.util.Identifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Beyond the Limits: Chapter One — The Neverending World.
 *
 * <p>The mod is built around one idea: the world is a simulation that is coming apart, and every
 * system in the mod is a different symptom of that collapse. All of those symptoms are driven by a
 * single global value, {@code reality}, which decays as the player interacts with rifts, sleeps,
 * travels between dimensions and survives dimensional storms.</p>
 *
 * <p>System map (see docs/ARCHITECTURE.md for the full design document):</p>
 * <ul>
 *     <li>{@code com.beyondthelimits.registry} — every block, item, entity, particle, sound,
 *     status effect, chunk generator and dimension key.</li>
 *     <li>{@code com.beyondthelimits.core} — the engines: reality decay, rifts, observers,
 *     evolution, temporal infection, storms, the black sun, collision, lost civilizations,
 *     the moving chunk, signals and the memory of the world.</li>
 *     <li>{@code com.beyondthelimits.world} — data driven worldgen helpers plus the runtime
 *     structure placer used to embed structures from other dimensions into yours.</li>
 *     <li>{@code com.beyondthelimits.client} — GLSL core shaders, animated skyboxes, the rift
 *     renderer, the HUD and the post-effect overlays.</li>
 * </ul>
 */
public class BeyondTheLimits implements ModInitializer {
	public static final String MOD_ID = "beyondthelimits";
	public static final Logger LOGGER = LoggerFactory.getLogger("BeyondTheLimits");

	private static boolean initialized;

	public static Identifier id(String path) {
		return Identifier.of(MOD_ID, path);
	}

	@Override
	public void onInitialize() {
		if (initialized) {
			return;
		}

		initialized = true;
		LOGGER.info("[Beyond the Limits] Booting Chapter One: The Neverending World");

		// Order matters: blocks before items (items reference blocks), entities last so that we can
		// use client-safe default attributes, chunk generators before dimensions.
		BtlParticles.register();
		BtlSounds.register();
		BtlStatusEffects.register();
		BtlBlocks.register();
		BtlBlockEntities.register();
		BtlItems.register();
		BtlItemGroups.register();
		BtlEntities.register();
		BtlChunkGenerators.register();
		BtlDimensions.register();

		BtlWorldEvents.register();

		ServerLifecycleEvents.SERVER_STARTED.register(BtlEngine::onServerStarted);
		ServerLifecycleEvents.SERVER_STOPPING.register(BtlEngine::onServerStopping);
		ServerTickEvents.END_SERVER_TICK.register(BtlEngine::tick);

		LOGGER.info("[Beyond the Limits] Chapter One online — reality is now a resource");
	}
}
