package dev.logan.beyond.client;

import dev.logan.beyond.server.Journey;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.sound.PositionedSoundInstance;
import net.minecraft.registry.entry.RegistryEntry;
import net.minecraft.sound.SoundEvent;
import net.minecraft.sound.SoundEvents;
import java.util.Random;

/**
 * The in-between soundscape. These spaces are meant to sound like inner space: a soft hum, a
 * vacuum that is barely there, and something that is almost a whisper. It is assembled from
 * vanilla sounds retuned far below their normal pitch and volume — no new audio assets, nothing
 * is downloaded, and O disables all of it.
 */
public final class RealityAmbience {
    private static final Random RANDOM = new Random();
    private static int cooldown;
    private RealityAmbience() {}
    public static void tick(MinecraftClient client) {
        if (!BeyondClient.CONFIG.ambience || !BeyondClient.CONFIG.enabled || client.world == null || client.player == null || client.isPaused()) return;
        if (cooldown-- > 0) return;
        var key = client.world.getRegistryKey();
        boolean between = key.getValue().getPath().equals("realm_08");
        boolean labyrinth = key.getValue().getPath().equals("realm_09");
        boolean fractal = key.getValue().getPath().equals("realm_10");
        boolean anyGenerated = Journey.inGeneratedSpace(key);
        float well = Spaghettification.nebulaProximity();
        if (anyGenerated) {
            int choice = RANDOM.nextInt(6);
            if (between) {
                // Hum first, vacuum second, whisper only sometimes and never clearly.
                if (choice < 3) play(SoundEvents.BLOCK_BEACON_AMBIENT, .28f, .20f);
                else if (choice == 3) play(SoundEvents.AMBIENT_SOUL_SAND_VALLEY_MOOD, .34f, .16f);
                else if (choice == 4) play(SoundEvents.BLOCK_PORTAL_AMBIENT, .22f, .12f);
                else play(SoundEvents.AMBIENT_CAVE, .40f, .10f);
            } else if (labyrinth) {
                if (choice < 3) play(SoundEvents.AMBIENT_CAVE, .46f, .13f);
                else if (choice == 3) play(SoundEvents.BLOCK_BEACON_AMBIENT, .33f, .12f);
                else if (choice == 4) play(SoundEvents.ENTITY_ENDERMAN_AMBIENT, .30f, .07f);
                else play(SoundEvents.BLOCK_SCULK_SENSOR_CLICKING, .35f, .08f);
            } else if (fractal) {
                if (choice < 3) play(SoundEvents.BLOCK_PORTAL_AMBIENT, .26f, .12f);
                else if (choice == 3) play(SoundEvents.BLOCK_BEACON_AMBIENT, .31f, .16f);
                else if (choice == 4) play(SoundEvents.AMBIENT_SOUL_SAND_VALLEY_MOOD, .30f, .12f);
                else play(SoundEvents.AMBIENT_CAVE, .42f, .09f);
            } else {
                play(SoundEvents.AMBIENT_CAVE, .5f, .10f);
            }
            cooldown = 44 + RANDOM.nextInt(70);
            return;
        }
        if (well > .12f) {
            // Approaching a colossal well: a low rumble that gets closer as the disk grows.
            play(SoundEvents.BLOCK_RESPAWN_ANCHOR_CHARGE, .22f, Math.min(.34f, .12f + well * .3f));
            cooldown = (int) (70 - well * 40);
        }
    }
    /**
     * Vanilla sound fields are a mix of {@code SoundEvent} and {@code RegistryEntry<SoundEvent>}.
     * Taking the value as {@code Object} keeps this layer compiling against either declaration
     * instead of quietly depending on how one field happens to be typed in this Minecraft version.
     */
    private static SoundEvent event(Object holder) {
        if (holder instanceof SoundEvent sound) return sound;
        if (holder instanceof RegistryEntry<?> entry && entry.value() instanceof SoundEvent sound) return sound;
        return null;
    }

    private static void play(Object holder, float pitch, float volume) {
        SoundEvent event = event(holder);
        if (event == null) return;
        MinecraftClient client = MinecraftClient.getInstance();
        client.getSoundManager().play(PositionedSoundInstance.master(event, pitch, volume));
    }
}
