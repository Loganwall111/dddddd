package com.beyondthelimits.registry;

import com.beyondthelimits.BeyondTheLimits;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;
import net.minecraft.sound.SoundEvent;

/**
 * Sound events. The {@code .ogg} files live in {@code assets/beyondthelimits/sounds} and are
 * registered in {@code sounds.json}.
 *
 * <p>Every sound in Chapter One was synthesised for this project: the rift is a reversed,
 * pitch-shifted choir of noise, the Backrooms hum is 60 Hz plus fluorescent buzz, the Signal is a
 * numbers-station loop, and the Black Sun arrival is a subsonic sweep you feel before you hear it.</p>
 */
public final class BtlSounds {
	private BtlSounds() {
	}

	public static final SoundEvent RIFT_OPEN = SoundEvent.of(BeyondTheLimits.id("rift_open"));
	public static final SoundEvent RIFT_AMBIENT = SoundEvent.of(BeyondTheLimits.id("rift_ambient"));
	public static final SoundEvent REALITY_TEAR = SoundEvent.of(BeyondTheLimits.id("reality_tear"));
	public static final SoundEvent STORM_START = SoundEvent.of(BeyondTheLimits.id("storm_start"));
	public static final SoundEvent STORM_THUNDER = SoundEvent.of(BeyondTheLimits.id("storm_thunder"));
	public static final SoundEvent BACKROOMS_HUM = SoundEvent.of(BeyondTheLimits.id("backrooms_hum"));
	public static final SoundEvent BACKROOMS_DRONE = SoundEvent.of(BeyondTheLimits.id("backrooms_drone"));
	public static final SoundEvent BACKROOMS_STEP = SoundEvent.of(BeyondTheLimits.id("backrooms_step"));
	public static final SoundEvent BACKROOMS_CHASE = SoundEvent.of(BeyondTheLimits.id("backrooms_chase"));
	public static final SoundEvent OBSERVER_WHISPER = SoundEvent.of(BeyondTheLimits.id("observer_whisper"));
	public static final SoundEvent CORRUPTION_WHISPER = SoundEvent.of(BeyondTheLimits.id("corruption_whisper"));
	public static final SoundEvent SIGNAL_LOOP = SoundEvent.of(BeyondTheLimits.id("signal_loop"));
	public static final SoundEvent SIGNAL_STATIC = SoundEvent.of(BeyondTheLimits.id("signal_static"));
	public static final SoundEvent BLACK_SUN_ARRIVAL = SoundEvent.of(BeyondTheLimits.id("black_sun_arrival"));
	public static final SoundEvent CODESCAPE_GLITCH = SoundEvent.of(BeyondTheLimits.id("codescape_glitch"));
	public static final SoundEvent MEMORY_CHIME = SoundEvent.of(BeyondTheLimits.id("memory_chime"));
	public static final SoundEvent GUIDE_OPEN = SoundEvent.of(BeyondTheLimits.id("guide_open"));
	public static final SoundEvent MIRROR_WHISPER = SoundEvent.of(BeyondTheLimits.id("mirror_whisper"));
	public static final SoundEvent MIRROR_CRACK = SoundEvent.of(BeyondTheLimits.id("mirror_crack"));
	public static final SoundEvent SIGNAL_FOUND = SoundEvent.of(BeyondTheLimits.id("signal_found"));
	public static final SoundEvent NOCLIP_WHOOSH = SoundEvent.of(BeyondTheLimits.id("noclip_whoosh"));
	public static final SoundEvent EVOLUTION_GROWL = SoundEvent.of(BeyondTheLimits.id("evolution_growl"));
	public static final SoundEvent EXPLOSION_FALLOUT = SoundEvent.of(BeyondTheLimits.id("explosion_fallout"));

	public static void register() {
		register("rift_open", RIFT_OPEN);
		register("rift_ambient", RIFT_AMBIENT);
		register("reality_tear", REALITY_TEAR);
		register("storm_start", STORM_START);
		register("storm_thunder", STORM_THUNDER);
		register("backrooms_hum", BACKROOMS_HUM);
		register("backrooms_drone", BACKROOMS_DRONE);
		register("observer_whisper", OBSERVER_WHISPER);
		register("corruption_whisper", CORRUPTION_WHISPER);
		register("signal_loop", SIGNAL_LOOP);
		register("signal_static", SIGNAL_STATIC);
		register("black_sun_arrival", BLACK_SUN_ARRIVAL);
		register("codescape_glitch", CODESCAPE_GLITCH);
		register("memory_chime", MEMORY_CHIME);
		register("guide_open", GUIDE_OPEN);
		register("noclip_whoosh", NOCLIP_WHOOSH);
		register("evolution_growl", EVOLUTION_GROWL);
		register("explosion_fallout", EXPLOSION_FALLOUT);
	}

	private static void register(String path, SoundEvent event) {
		Registry.register(Registries.SOUND_EVENT, BeyondTheLimits.id(path), event);
	}
}
