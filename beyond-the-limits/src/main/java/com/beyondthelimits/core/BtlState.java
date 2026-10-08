package com.beyondthelimits.core;

import com.beyondthelimits.BeyondTheLimits;
import com.beyondthelimits.util.BtlSafe;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.nbt.NbtIo;
import net.minecraft.nbt.NbtList;
import net.minecraft.server.MinecraftServer;
import net.minecraft.util.WorldSavePath;
import net.minecraft.util.math.BlockPos;

/**
 * The persistent brain of the mod, stored next to {@code level.dat} in the world folder.
 *
 * <p>It was written as a plain NBT file instead of a {@code PersistentState} on purpose: the mod
 * ships a documented, versioned save format so that a world can be moved between mod versions
 * without depending on vanilla's internal state manager signatures.</p>
 *
 * <p>Everything the simulation knows lives here: reality integrity, per player dementia and
 * dimensional gravity debt, rift and storm history, the evolution stage of every mob family, the
 * severity of the world collision, how far the sky has cracked, the lost civilization stage, the
 * position of the moving chunk, and every memory the world has of the player.</p>
 */
public final class BtlState {
	public static final int FORMAT = 3;
	public static final String FILE_NAME = "beyondthelimits.dat";

	private static final BtlState INSTANCE = new BtlState();

	// ---------------------------------------------------------------------------------------------
	// Global world state
	// ---------------------------------------------------------------------------------------------

	/** 100 = pristine Minecraft, 0 = reality is gone. */
	private int reality = 100;
	/** Total ticks this world has been simulated with the mod installed. */
	private long age;
	/** 0..100 — how badly the Overworld is bleeding into other dimensions. */
	private int collision;
	/** 0..100 — how far the sky has cracked open. */
	private int skyCrack;
	private int blackSunStage;
	private long blackSunStart;
	private int stormCooldown = 24000;
	private int stormTicks;
	private int stormIntensity;
	private int lostCivStage;
	private int bleeding;
	private int riftCount;
	private int loreStage;
	private int cityBuilt;
	private int guideGiven;
	private long riftSeed = 0L;
	/** Cached spiral-search cursor for "the observer has been following you" persistence. */
	private long observerCursor;
	/** Where the moving chunk currently is (chunk coordinates). */
	private int movingChunkX = Integer.MIN_VALUE;
	private int movingChunkZ;
	private int movingChunkTimer;
	private int movingChunkPanic;
	/** The signal's origin, chosen once per world. */
	private int signalX = Integer.MIN_VALUE;
	private int signalZ;
	private int signalY = -40;
	private int signalsHeard;
	private int signalRevealed;
	private int lastChunkGenerated;

	// ---------------------------------------------------------------------------------------------
	// Per player state
	// ---------------------------------------------------------------------------------------------

	private final Map<UUID, Integer> dementia = new HashMap<>();
	private final Map<UUID, Integer> gravity = new HashMap<>();
	private final Map<UUID, Integer> riftTouches = new HashMap<>();
	private final Map<UUID, Integer> sleeps = new HashMap<>();
	private final Map<UUID, Long> lastVision = new HashMap<>();
	private final Map<UUID, Integer> observerLevel = new HashMap<>();
	private final Map<String, Integer> evolution = new LinkedHashMap<>();
	private final Map<Long, Integer> anomalies = new HashMap<>();
	private final List<BtlMemory> memories = new ArrayList<>();

	private boolean dirty;
	private int saveTimer;
	private transient boolean loaded;
	private transient MinecraftServer boundServer;

	private BtlState() {
	}

	public static BtlState get() {
		return INSTANCE;
	}

	// ---------------------------------------------------------------------------------------------
	// Lifecycle
	// ---------------------------------------------------------------------------------------------

	public void bind(MinecraftServer server) {
		this.boundServer = server;

		if (!loaded) {
			load(server);
			loaded = true;
		}
	}

	private Path file(MinecraftServer server) {
		return server.getSavePath(WorldSavePath.ROOT).resolve(FILE_NAME);
	}

	public void load(MinecraftServer server) {
		Path path = file(server);
		reset();

		if (!Files.exists(path)) {
			riftSeed = server.getOverworld() != null ? server.getOverworld().getSeed() : 0L;
			return;
		}

		try {
			NbtCompound nbt = NbtIo.read(path);

			if (nbt == null) {
				return;
			}

			int format = nbt.getInt("format");

			if (format > FORMAT) {
				BeyondTheLimits.LOGGER.warn("[Beyond the Limits] Save data was written by a newer version "
						+ "(format {} > {}). It will be loaded read-only.", format, FORMAT);
			}

			this.reality = clamp(nbt.contains("reality") ? nbt.getInt("reality") : 100, 0, 100);
			this.age = nbt.getLong("age");
			this.collision = nbt.getInt("collision");
			this.skyCrack = nbt.getInt("skyCrack");
			this.blackSunStage = nbt.getInt("blackSunStage");
			this.blackSunStart = nbt.getLong("blackSunStart");
			this.stormCooldown = nbt.contains("stormCooldown") ? nbt.getInt("stormCooldown") : 24000;
			this.stormTicks = nbt.getInt("stormTicks");
			this.stormIntensity = nbt.getInt("stormIntensity");
			this.lostCivStage = nbt.getInt("lostCivStage");
			this.bleeding = nbt.getInt("bleeding");
			this.riftCount = nbt.getInt("riftCount");
			this.loreStage = nbt.getInt("loreStage");
			this.cityBuilt = nbt.getInt("cityBuilt");
			this.guideGiven = nbt.getInt("guideGiven");
			this.riftSeed = nbt.getLong("riftSeed");
			this.observerCursor = nbt.getLong("observerCursor");
			this.movingChunkX = nbt.contains("movingChunkX") ? nbt.getInt("movingChunkX") : Integer.MIN_VALUE;
			this.movingChunkZ = nbt.getInt("movingChunkZ");
			this.movingChunkTimer = nbt.getInt("movingChunkTimer");
			this.movingChunkPanic = nbt.getInt("movingChunkPanic");
			this.signalX = nbt.contains("signalX") ? nbt.getInt("signalX") : Integer.MIN_VALUE;
			this.signalZ = nbt.getInt("signalZ");
			this.signalY = nbt.contains("signalY") ? nbt.getInt("signalY") : -40;
			this.signalsHeard = nbt.getInt("signalsHeard");
			this.signalRevealed = nbt.getInt("signalRevealed");
			this.lastChunkGenerated = nbt.getInt("lastChunkGenerated");

			readUuidMap(nbt.getCompound("dementia"), dementia);
			readUuidMap(nbt.getCompound("gravity"), gravity);
			readUuidMap(nbt.getCompound("riftTouches"), riftTouches);
			readUuidMap(nbt.getCompound("sleeps"), sleeps);
			readLongUuidMap(nbt.getCompound("lastVision"), lastVision);
			readUuidMap(nbt.getCompound("observerLevel"), observerLevel);

			NbtCompound evolutionNbt = nbt.getCompound("evolution");

			for (String key : evolutionNbt.getKeys()) {
				evolution.put(key, evolutionNbt.getInt(key));
			}

			NbtCompound anomalyNbt = nbt.getCompound("anomalies");

			for (String key : anomalyNbt.getKeys()) {
				try {
					anomalies.put(Long.parseLong(key), anomalyNbt.getInt(key));
				} catch (NumberFormatException ignored) {
					// skip malformed keys instead of refusing to load the world
				}
			}

			NbtList memoriesNbt = nbt.getList("memories", 10);
			int limit = Math.min(memoriesNbt.size(), BtlConfig.MAX_MEMORIES);

			for (int i = 0; i < limit; i++) {
				memories.add(BtlMemory.fromNbt(memoriesNbt.getCompound(i)));
			}

			BeyondTheLimits.LOGGER.info("[Beyond the Limits] Loaded world state: reality {}%, {} memories, "
					+ "black sun stage {}, collision {}%", reality, memories.size(), blackSunStage, collision);
		} catch (Throwable throwable) {
			BtlSafe.report("state.load", throwable);
		}
	}

	public void reset() {
		reality = 100;
		age = 0L;
		collision = 0;
		skyCrack = 0;
		blackSunStage = 0;
		blackSunStart = 0L;
		stormCooldown = 24000;
		stormTicks = 0;
		stormIntensity = 0;
		lostCivStage = 0;
		bleeding = 0;
		riftCount = 0;
		loreStage = 0;
		cityBuilt = 0;
		guideGiven = 0;
		observerCursor = 0L;
		movingChunkX = Integer.MIN_VALUE;
		movingChunkZ = 0;
		movingChunkTimer = 0;
		movingChunkPanic = 0;
		signalX = Integer.MIN_VALUE;
		signalZ = 0;
		signalY = -40;
		signalsHeard = 0;
		signalRevealed = 0;
		lastChunkGenerated = 0;
		dementia.clear();
		gravity.clear();
		riftTouches.clear();
		sleeps.clear();
		lastVision.clear();
		observerLevel.clear();
		evolution.clear();
		anomalies.clear();
		memories.clear();
	}

	public void save() {
		if (boundServer == null) {
			return;
		}

		try {
			NbtCompound nbt = new NbtCompound();
			nbt.putInt("format", FORMAT);
			nbt.putInt("reality", reality);
			nbt.putLong("age", age);
			nbt.putInt("collision", collision);
			nbt.putInt("skyCrack", skyCrack);
			nbt.putInt("blackSunStage", blackSunStage);
			nbt.putLong("blackSunStart", blackSunStart);
			nbt.putInt("stormCooldown", stormCooldown);
			nbt.putInt("stormTicks", stormTicks);
			nbt.putInt("stormIntensity", stormIntensity);
			nbt.putInt("lostCivStage", lostCivStage);
			nbt.putInt("bleeding", bleeding);
			nbt.putInt("riftCount", riftCount);
			nbt.putInt("loreStage", loreStage);
			nbt.putInt("cityBuilt", cityBuilt);
			nbt.putInt("guideGiven", guideGiven);
			nbt.putLong("riftSeed", riftSeed);
			nbt.putLong("observerCursor", observerCursor);
			nbt.putInt("movingChunkX", movingChunkX);
			nbt.putInt("movingChunkZ", movingChunkZ);
			nbt.putInt("movingChunkTimer", movingChunkTimer);
			nbt.putInt("movingChunkPanic", movingChunkPanic);
			nbt.putInt("signalX", signalX);
			nbt.putInt("signalZ", signalZ);
			nbt.putInt("signalY", signalY);
			nbt.putInt("signalsHeard", signalsHeard);
			nbt.putInt("signalRevealed", signalRevealed);
			nbt.putInt("lastChunkGenerated", lastChunkGenerated);

			nbt.put("dementia", writeUuidMap(dementia));
			nbt.put("gravity", writeUuidMap(gravity));
			nbt.put("riftTouches", writeUuidMap(riftTouches));
			nbt.put("sleeps", writeUuidMap(sleeps));
			nbt.put("lastVision", writeLongUuidMap(lastVision));
			nbt.put("observerLevel", writeUuidMap(observerLevel));

			NbtCompound evolutionNbt = new NbtCompound();

			for (Map.Entry<String, Integer> entry : evolution.entrySet()) {
				evolutionNbt.putInt(entry.getKey(), entry.getValue());
			}

			nbt.put("evolution", evolutionNbt);

			NbtCompound anomalyNbt = new NbtCompound();

			for (Map.Entry<Long, Integer> entry : anomalies.entrySet()) {
				anomalyNbt.putInt(Long.toString(entry.getKey()), entry.getValue());
			}

			nbt.put("anomalies", anomalyNbt);

			NbtList memoriesNbt = new NbtList();

			for (BtlMemory memory : memories) {
				memoriesNbt.add(memory.toNbt());
			}

			nbt.put("memories", memoriesNbt);

			NbtIo.write(nbt, file(boundServer));
			dirty = false;
		} catch (IOException exception) {
			BeyondTheLimits.LOGGER.error("[Beyond the Limits] Could not write world state", exception);
		} catch (Throwable throwable) {
			BtlSafe.report("state.save", throwable);
		}
	}

	public void tick(MinecraftServer server) {
		bind(server);
		age++;
		saveTimer++;

		if (dirty && saveTimer >= 600) {
			saveTimer = 0;
			save();
		}
	}

	public void markDirty() {
		dirty = true;
	}

	// ---------------------------------------------------------------------------------------------
	// Accessors
	// ---------------------------------------------------------------------------------------------

	public int reality() {
		return reality;
	}

	public void setReality(int value) {
		int clamped = clamp(value, 0, 100);

		if (clamped != reality) {
			reality = clamped;
			markDirty();
		}
	}

	public void addReality(int delta) {
		setReality(reality + delta);
	}

	public long age() {
		return age;
	}

	public int collision() {
		return collision;
	}

	public void setCollision(int value) {
		collision = clamp(value, 0, 100);
		markDirty();
	}

	public int skyCrack() {
		return skyCrack;
	}

	public void setSkyCrack(int value) {
		skyCrack = clamp(value, 0, 100);
		markDirty();
	}

	public int blackSunStage() {
		return blackSunStage;
	}

	public void setBlackSunStage(int stage) {
		blackSunStage = Math.max(0, stage);
		markDirty();
	}

	public long blackSunStart() {
		return blackSunStart;
	}

	public void setBlackSunStart(long tick) {
		blackSunStart = tick;
		markDirty();
	}

	public int stormCooldown() {
		return stormCooldown;
	}

	public void setStormCooldown(int ticks) {
		stormCooldown = ticks;
		markDirty();
	}

	public int stormTicks() {
		return stormTicks;
	}

	public void setStormTicks(int ticks) {
		stormTicks = ticks;
		markDirty();
	}

	public int stormIntensity() {
		return stormIntensity;
	}

	public void setStormIntensity(int intensity) {
		stormIntensity = clamp(intensity, 0, 100);
		markDirty();
	}

	public int lostCivStage() {
		return lostCivStage;
	}

	public void setLostCivStage(int stage) {
		lostCivStage = stage;
		markDirty();
	}

	public int bleeding() {
		return bleeding;
	}

	public void setBleeding(int value) {
		bleeding = clamp(value, 0, 100);
		markDirty();
	}

	/** How far the player has been led through the mod's story. 0 = has not opened the guide yet. */
	public int loreStage() {
		return loreStage;
	}

	public void setLoreStage(int stage) {
		loreStage = stage;
		markDirty();
	}

	/** 1 once the Old City has been built into this world, so it is only ever built once. */
	public int cityBuilt() {
		return cityBuilt;
	}

	public void setCityBuilt(int built) {
		cityBuilt = built;
		markDirty();
	}

	/** 1 once the starting guidebook has been handed out, so it is never given twice. */
	public int guideGiven() {
		return guideGiven;
	}

	public void setGuideGiven(int given) {
		guideGiven = given;
		markDirty();
	}

	public int riftCount() {
		return riftCount;
	}

	public void addRift() {
		riftCount++;
		markDirty();
	}

	public long riftSeed() {
		return riftSeed;
	}

	public void setRiftSeed(long seed) {
		riftSeed = seed;
		markDirty();
	}

	public long observerCursor() {
		return observerCursor;
	}

	public void setObserverCursor(long cursor) {
		observerCursor = cursor;
		dirty = true;
	}

	public int movingChunkX() {
		return movingChunkX;
	}

	public void setMovingChunk(int x, int z) {
		movingChunkX = x;
		movingChunkZ = z;
		dirty = true;
	}

	public int movingChunkZ() {
		return movingChunkZ;
	}

	public int movingChunkPanic() {
		return movingChunkPanic;
	}

	public void setMovingChunkPanic(int panic) {
		movingChunkPanic = clamp(panic, 0, 100);
		dirty = true;
	}

	public int movingChunkTimer() {
		return movingChunkTimer;
	}

	public void setMovingChunkTimer(int ticks) {
		movingChunkTimer = ticks;
		dirty = true;
	}

	public int signalX() {
		return signalX;
	}

	public int signalZ() {
		return signalZ;
	}

	public int signalY() {
		return signalY;
	}

	public boolean hasSignal() {
		return signalX != Integer.MIN_VALUE;
	}

	public void setSignal(int x, int y, int z) {
		signalX = x;
		signalY = y;
		signalZ = z;
		markDirty();
	}

	public int signalsHeard() {
		return signalsHeard;
	}

	/** Records one reading of the signal; returns {@code true} the first time each reading lands. */
	public boolean hearSignal() {
		signalsHeard++;
		markDirty();
		return true;
	}

	/** Whether the machine has already transmitted its final instruction to this world. */
	public boolean signalRevealed() {
		return signalRevealed != 0;
	}

	public void setSignalRevealed() {
		signalRevealed = 1;
		markDirty();
	}

	public int lastChunkGenerated() {
		return lastChunkGenerated;
	}

	public void setLastChunkGenerated(int value) {
		lastChunkGenerated = value;
		markDirty();
	}

	public Map<UUID, Integer> dementiaMap() {
		return dementia;
	}

	public Map<UUID, Integer> gravityMap() {
		return gravity;
	}

	public Map<String, Integer> evolution() {
		return evolution;
	}

	public Map<Long, Integer> anomalies() {
		return anomalies;
	}

	public List<BtlMemory> memories() {
		return memories;
	}

	public Map<UUID, Integer> sleeps() {
		return sleeps;
	}

	public Map<UUID, Integer> observerLevels() {
		return observerLevel;
	}

	public Map<UUID, Long> lastVision() {
		return lastVision;
	}

	public int dementia(UUID uuid) {
		return dementia.getOrDefault(uuid, 0);
	}

	public void setDementia(UUID uuid, int value) {
		int clamped = clamp(value, 0, BtlConfig.DEMENTIA_MAX);
		dementia.put(uuid, clamped);
		dirty = true;
	}

	public int gravity(UUID uuid) {
		return gravity.getOrDefault(uuid, 0);
	}

	public void setGravity(UUID uuid, int value) {
		int clamped = clamp(value, 0, BtlConfig.GRAVITY_MAX);
		gravity.put(uuid, clamped);
		dirty = true;
	}

	public int riftTouches(UUID uuid) {
		return riftTouches.getOrDefault(uuid, 0);
	}

	public void addRiftTouch(UUID uuid) {
		riftTouches.merge(uuid, 1, Integer::sum);
		dirty = true;
	}

	public void addMemory(BtlMemory memory) {
		memories.add(memory);

		while (memories.size() > BtlConfig.MAX_MEMORIES) {
			memories.remove(0);
		}

		dirty = true;
	}

	private static int clamp(int value, int min, int max) {
		return value < min ? min : Math.min(value, max);
	}

	private static void readUuidMap(NbtCompound nbt, Map<UUID, Integer> target) {
		for (String key : nbt.getKeys()) {
			try {
				target.put(UUID.fromString(key), nbt.getInt(key));
			} catch (IllegalArgumentException ignored) {
			}
		}
	}

	private static void readLongUuidMap(NbtCompound nbt, Map<UUID, Long> target) {
		for (String key : nbt.getKeys()) {
			try {
				target.put(UUID.fromString(key), nbt.getLong(key));
			} catch (IllegalArgumentException ignored) {
			}
		}
	}

	private static NbtCompound writeUuidMap(Map<UUID, Integer> source) {
		NbtCompound nbt = new NbtCompound();

		for (Map.Entry<UUID, Integer> entry : source.entrySet()) {
			nbt.putInt(entry.getKey().toString(), entry.getValue());
		}

		return nbt;
	}

	private static NbtCompound writeLongUuidMap(Map<UUID, Long> source) {
		NbtCompound nbt = new NbtCompound();

		for (Map.Entry<UUID, Long> entry : source.entrySet()) {
			nbt.putLong(entry.getKey().toString(), entry.getValue());
		}

		return nbt;
	}

	/** Convenience for engines that need a stable position for the moving chunk. */
	public BlockPos movingChunkPos() {
		if (movingChunkX == Integer.MIN_VALUE) {
			return null;
		}

		return new BlockPos(movingChunkX << 4, 64, movingChunkZ << 4);
	}
}
