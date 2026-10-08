package com.beyondthelimits;

import com.beyondthelimits.command.BtlCommands;
import com.beyondthelimits.network.BtlNetworking;
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

		// These callbacks are common-side: payload types must exist before the first login, and the
		// command tree must be registered before a server builds its dispatcher.
		BtlNetworking.registerPayloadTypes();
		BtlCommands.register();
		// Owns the single server lifecycle/tick subscription as well as join, sleep, and world events.
		BtlWorldEvents.register();

		LOGGER.info("[Beyond the Limits] Chapter One online — reality is now a resource");
	}
}
