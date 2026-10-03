package dev.logan.entersift;

import java.util.EnumMap;
import java.util.Map;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.sounds.SoundEvent;

/** 0.11 sound events. Audio is synthesised by tools/audio11.py and encoded to OGG in CI. */
public final class SiftSounds {
    private SiftSounds() {}

    public record Voice(SoundEvent ambient, SoundEvent hurt, SoundEvent death) {}

    private static final Map<SiftKind, Voice> VOICES = new EnumMap<>(SiftKind.class);

    public static final SoundEvent RIFT_HUM = register("rift.hum");
    public static final SoundEvent RIFT_GROWTH = register("rift.growth");
    public static final SoundEvent MUSIC = register("music.sift");
    public static final SoundEvent AMBIENT_LOOP = register("ambient.sift.loop");
    public static final SoundEvent AMBIENT_MOOD = register("ambient.sift.mood");
    public static final SoundEvent AMBIENT_ADDITIONS = register("ambient.sift.additions");
    public static final SoundEvent RITUAL_SONG = register("ritual.song");

    static {
        for (SiftKind k : SiftKind.values()) {
            String b = "entity." + k.id + ".";
            VOICES.put(k, new Voice(register(b + "ambient"), register(b + "hurt"), register(b + "death")));
        }
    }

    private static SoundEvent register(String path) {
        Identifier id = SiftContent.id(path);
        return Registry.register(BuiltInRegistries.SOUND_EVENT, id, SoundEvent.createVariableRangeEvent(id));
    }

    public static Voice voice(SiftKind kind) { return VOICES.get(kind); }

    public static void initialize() { /* class-load triggers registration */ }
}
