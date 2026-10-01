package dev.logan.entersift.client;

import dev.logan.entersift.RiftBlockEntity;
import dev.logan.entersift.RiftPortalEntity;
import dev.logan.entersift.SiftSounds;
import java.util.IdentityHashMap;
import java.util.Map;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientBlockEntityEvents;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientEntityEvents;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.client.resources.sounds.AbstractTickableSoundInstance;
import net.minecraft.client.resources.sounds.SoundInstance;
import net.minecraft.sounds.SoundSource;

/** One positional loop per loaded rift/core. Pitch follows growth; never replays a one-shot each tick. */
public final class RiftSounds {
    private static final Map<Object, Hum> loops = new IdentityHashMap<>();
    private static int retry;
    private RiftSounds() {}

    public static void register() {
        ClientEntityEvents.ENTITY_LOAD.register((entity, level) -> {
            if (entity instanceof RiftPortalEntity rift) start(rift);
        });
        ClientEntityEvents.ENTITY_UNLOAD.register((entity, level) -> remove(entity));
        ClientBlockEntityEvents.BLOCK_ENTITY_LOAD.register((block, level) -> {
            if (block instanceof RiftBlockEntity) start(block);
        });
        ClientBlockEntityEvents.BLOCK_ENTITY_UNLOAD.register((block, level) -> remove(block));
        ClientPlayConnectionEvents.DISCONNECT.register((handler, client) -> {
            loops.values().forEach(sound -> client.getSoundManager().stop(sound));
            loops.clear();
        });
        // Resource reload / device change / muted category can stop channels without unloading entities.
        ClientTickEvents.END_CLIENT_TICK.register(client -> {
            if (++retry % 40 != 0 || client.level == null) return;
            var manager = client.getSoundManager();
            for (var entry : loops.entrySet()) {
                if (!manager.isActive(entry.getValue())) {
                    Hum replacement = new Hum(entry.getKey());
                    entry.setValue(replacement);
                    manager.play(replacement);
                }
            }
        });
    }

    private static void start(Object source) {
        if (loops.containsKey(source)) return;
        var sound = new Hum(source);
        loops.put(source, sound);
        Minecraft.getInstance().getSoundManager().play(sound);
    }

    private static void remove(Object source) {
        var sound = loops.remove(source);
        if (sound != null) Minecraft.getInstance().getSoundManager().stop(sound);
    }

    private static final class Hum extends AbstractTickableSoundInstance {
        private final Object owner;
        private int elapsed;
        Hum(Object owner) {
            super(SiftSounds.RIFT_HUM, SoundSource.AMBIENT, SoundInstance.createUnseededRandom());
            this.owner = owner;
            volume = 0f;
            looping = true;
            delay = 0;
            attenuation = SoundInstance.Attenuation.LINEAR;
            update();
        }
        @Override public boolean canStartSilent() { return true; }
        @Override public void tick() { elapsed++; update(); }
        private void update() {
            var client = Minecraft.getInstance();
            int age;
            if (owner instanceof RiftPortalEntity rift) {
                if (rift.isRemoved() || rift.level() != client.level) { stop(); return; }
                x = rift.getX(); y = rift.getY() + rift.riftHeight() * 0.5; z = rift.getZ();
                age = rift.age();
            } else if (owner instanceof RiftBlockEntity block) {
                if (block.isRemoved() || block.getLevel() != client.level) { stop(); return; }
                x = block.getBlockPos().getX() + 0.5; y = block.getBlockPos().getY() + 0.5; z = block.getBlockPos().getZ() + 0.5;
                age = block.age();
            } else { stop(); return; }
            float growth = Math.min(1f, age / 100f);
            pitch = 0.65f + 0.30f * growth + 0.02f * (float) Math.sin(elapsed * 0.07);
            float distance = client.player == null ? 64f : (float) Math.sqrt(client.player.distanceToSqr(x, y, z));
            // Vanilla supplies spatial falloff too; this extra envelope avoids abrupt range transitions.
            float nearby = Math.max(0f, 1f - distance / 24f);
            float target = (owner instanceof RiftBlockEntity ? 0.18f : 0.55f) * (0.35f + growth * 0.65f) * nearby;
            volume += (target - volume) * 0.08f;
        }
    }
}
