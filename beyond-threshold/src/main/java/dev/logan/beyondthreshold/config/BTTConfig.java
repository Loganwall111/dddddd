package dev.logan.beyondthreshold.config;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.fabricmc.loader.api.FabricLoader;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * config/beyondthreshold.json — every knob of the threshold.
 * The in-game config screen (F9) edits and saves this file.
 */
public final class BTTConfig {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	private static Data data = new Data();

	public static class Data {
		/** Master switch for the cosmic colossus skybox in the overworld. */
		public boolean thresholdSky = true;
		/** Gravitational lensing post effect strength (0..2). */
		public float lensingStrength = 1.0F;
		/** Black hole pull radius multiplier. */
		public float gravityScale = 1.0F;
		/** Ragdoll chaos amount while gripped by a black hole. */
		public float ragdollChaos = 1.0F;
		/** Black holes fling victims into random threshold dimensions. */
		public boolean blackHoleTravel = true;
		/** Nuke-style collapse explosion power. */
		public float collapsePower = 12.0F;
		/** Seconds a black hole lives before collapsing. */
		public int blackHoleLifetimeSec = 90;
		/** Auto-run the eye intro for new players. */
		public boolean autoIntro = true;
		/** Matrix pixelation intensity during the intro (0..1). */
		public float dissolveIntensity = 1.0F;
		/** Palette-swap terrain in threshold dimensions. */
		public boolean paletteSwap = true;
		/** Seed shared with onepac.py for the block/dimension palettes. */
		public long paletteSeed = 1337L;
		/** Realistic flowing water shader override. */
		public boolean waterShader = true;
		/** Screen shake strength (0..2). */
		public float shakeStrength = 1.0F;
	}

	public static Path path() {
		return FabricLoader.getInstance().getConfigDir().resolve("beyondthreshold.json");
	}

	public static void load() {
		try {
			Path p = path();
			if (Files.exists(p)) {
				data = GSON.fromJson(Files.readString(p), Data.class);
				if (data == null) {
					data = new Data();
				}
			} else {
				save();
			}
		} catch (IOException e) {
			data = new Data();
		}
	}

	public static void save() {
		try {
			Files.writeString(path(), GSON.toJson(data));
		} catch (IOException ignored) {
		}
	}

	public static Data get() {
		return data;
	}

	private BTTConfig() {
	}
}
