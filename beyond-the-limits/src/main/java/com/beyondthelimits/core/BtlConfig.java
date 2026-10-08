package com.beyondthelimits.core;

/**
 * Every tunable of Chapter One in one place.
 *
 * <p>These are plain constants on purpose: the simulation has to be able to read them from both
 * the server tick loop and the client renderer, and a datapack/JSON config would add a failure
 * mode that a survival-critical mod should not have. Power users can edit this file and rebuild,
 * or use the {@code /beyondthelimits} command tree at runtime.</p>
 */
public final class BtlConfig {
	private BtlConfig() {
	}

	// ---------------------------------------------------------------------------------------------
	// Reality
	// ---------------------------------------------------------------------------------------------

	/** Reality points lost per in-game day once the world has "noticed" the player. */
	public static final int REALITY_DECAY_PER_DAY = 2;
	/** Reality restored by a rift stabiliser. */
	public static final int REALITY_PER_STABILIZER = 6;
	/** Reality lost every time a dimensional storm resolves. */
	public static final int REALITY_PER_STORM = 4;
	/** Reality lost when the black sun advances a stage. */
	public static final int REALITY_PER_BLACK_SUN_STAGE = 5;
	/** Reality lost per world collision milestone. */
	public static final int REALITY_PER_COLLISION_MILESTONE = 3;
	/** Below this value the flicker/geometry glitches start. */
	public static final int REALITY_FLICKER = 80;
	public static final int REALITY_DISTORT = 60;
	public static final int REALITY_GRAVITY = 40;
	public static final int REALITY_CHUNK_SEAMS = 20;
	public static final int REALITY_IMPOSSIBLE = 5;

	// ---------------------------------------------------------------------------------------------
	// Dementia / corrupted land
	// ---------------------------------------------------------------------------------------------

	public static final int DEMENTIA_MAX = 1000;
	/** Dementia gained per second standing on Corrupted Land. */
	public static final int DEMENTIA_PER_SECOND_ON_CORRUPTION = 6;
	/** Dementia gained per second spent inside a non-Overworld dimension. */
	public static final int DEMENTIA_PER_SECOND_IN_DIMENSION = 2;
	/** Dementia lost per second in the Overworld away from corruption. */
	public static final int DEMENTIA_RECOVERY_PER_SECOND = 3;
	/** At this level the player starts hearing things and the world starts changing. */
	public static final int DEMENTIA_HALLUCINATION = 300;
	/** At this level corrupted grass stops supporting the player and they fall through. */
	public static final int DEMENTIA_FALL_THROUGH = 700;
	/** At this level the player is pulled into the Backrooms the moment they touch corruption. */
	public static final int DEMENTIA_NOCLIP = 950;

	// ---------------------------------------------------------------------------------------------
	// Dimensional gravity (the butterfly effect)
	// ---------------------------------------------------------------------------------------------

	public static final int GRAVITY_MAX = 1000;
	/** Gravity debt gained per block broken inside a non-Overworld dimension. */
	public static final int GRAVITY_PER_BLOCK_BROKEN_OFFWORLD = 2;
	/** Gravity debt gained per entity killed inside a non-Overworld dimension. */
	public static final int GRAVITY_PER_KILL_OFFWORLD = 8;
	/** Gravity debt gained per minute simply existing in another dimension. */
	public static final int GRAVITY_PER_MINUTE_OFFWORLD = 4;
	/** Debt is spent in chunks of this size to trigger Overworld mutations on return. */
	public static final int GRAVITY_PER_MUTATION = 60;
	/** Hard cap on mutations triggered by one single return. */
	public static final int GRAVITY_MUTATIONS_PER_RETURN = 12;

	// ---------------------------------------------------------------------------------------------
	// Rifts
	// ---------------------------------------------------------------------------------------------

	public static final int RIFT_MAX_PER_WORLD = 220;
	public static final int RIFT_SPAWN_INTERVAL_TICKS = 600;
	public static final int RIFT_GROWTH_TICKS = 24000;
	public static final double RIFT_BASE_RADIUS = 1.35D;
	public static final double RIFT_MAX_RADIUS = 6.5D;
	public static final int RIFT_MIN_DISTANCE = 48;
	public static final int RIFT_MAX_DISTANCE = 160;
	/** How long an entity coming through a rift keeps spawning invaders. */
	public static final int RIFT_INVASION_LENGTH = 6000;
	/** Cooldown per player before they can be pulled through another rift. */
	public static final int RIFT_TELEPORT_COOLDOWN = 60;

	// ---------------------------------------------------------------------------------------------
	// Storms
	// ---------------------------------------------------------------------------------------------

	public static final int STORM_MIN_COOLDOWN = 18000;
	public static final int STORM_MAX_COOLDOWN = 60000;
	public static final int STORM_MIN_DURATION = 1200;
	public static final int STORM_MAX_DURATION = 3600;
	public static final int STORM_RIFT_CHANCE = 4;
	public static final int STORM_LIGHTNING_CHANCE = 6;

	// ---------------------------------------------------------------------------------------------
	// Black sun
	// ---------------------------------------------------------------------------------------------

	public static final int BLACK_SUN_STAGE_TICKS = 24000;
	public static final int BLACK_SUN_MAX_STAGE = 9;
	public static final double BLACK_SUN_APPROACH_PER_STAGE = 0.05D;

	// ---------------------------------------------------------------------------------------------
	// The Observer
	// ---------------------------------------------------------------------------------------------

	public static final int OBSERVER_MIN_DISTANCE = 24;
	public static final int OBSERVER_MAX_DISTANCE = 72;
	public static final int OBSERVER_STARE_TICKS = 40;
	public static final int OBSERVER_SPAWN_CHANCE = 400;

	// ---------------------------------------------------------------------------------------------
	// Evolution & time
	// ---------------------------------------------------------------------------------------------

	public static final int EVOLUTION_PER_ENCOUNTER = 1;
	public static final int EVOLUTION_STAGE_2 = 40;
	public static final int EVOLUTION_STAGE_3 = 120;
	public static final int EVOLUTION_STAGE_4 = 260;
	public static final int TEMPORAL_ZONE_RADIUS = 48;
	public static final int TEMPORAL_CONVERSION_INTERVAL = 200;

	// ---------------------------------------------------------------------------------------------
	// Collision, bleeding, sky
	// ---------------------------------------------------------------------------------------------

	public static final int COLLISION_PER_DAY = 1;
	public static final int BLEEDING_PER_DAY = 2;
	public static final int SKY_CRACK_PER_DAY = 1;
	public static final int COLLISION_STRUCTURE_INTERVAL = 3000;
	public static final int LOST_CIV_PER_SLEEP = 1;
	public static final int LOST_CIV_MAX_STAGE = 12;

	// ---------------------------------------------------------------------------------------------
	// The moving chunk & the last chunk
	// ---------------------------------------------------------------------------------------------

	public static final int MOVING_CHUNK_STEP_TICKS = 900;
	public static final int MOVING_CHUNK_ARRIVAL_RANGE = 200;
	/** 12,550,820 blocks: the coordinate where the classic Far Lands begin. */
	public static final int LAST_CHUNK_BLOCK_X = 12_550_820;
	public static final int LAST_CHUNK_BLOCK_Z = 12_550_820;
	public static final int LAST_CHUNK_TRIGGER_DISTANCE = 120;

	// ---------------------------------------------------------------------------------------------
	// Memory
	// ---------------------------------------------------------------------------------------------

	public static final int MAX_MEMORIES = 512;
	public static final int MAX_MEMORY_VOLUME = 4096;
	public static final int MEMORY_SNAPSHOT_RADIUS = 2;
	public static final int SIGNAL_MIN_DISTANCE = 4000;

	// ---------------------------------------------------------------------------------------------
	// Performance guard rails
	// ---------------------------------------------------------------------------------------------

	/** Engines that scan the world run at most this often (in ticks). */
	public static final int SLOW_TICK_INTERVAL = 20;
	/** Universe-level systems (collision, bleeding, sky) run this often. */
	public static final int WORLD_TICK_INTERVAL = 100;
	/** Hard cap on the amount of work one engine may do per tick, wherever relevant. */
	public static final int WORK_BUDGET = 64;
}
