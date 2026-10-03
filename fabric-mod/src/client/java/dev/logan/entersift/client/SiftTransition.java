package dev.logan.entersift.client;

import dev.logan.entersift.SiftContent;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.minecraft.client.Minecraft;

/** Short pixel glitch concurrent with travel. No camera lock, cutscene or opaque flare. */
public final class SiftTransition {
    private SiftTransition() {}
    public static void register() {
        HudElementRegistry.addLast(SiftContent.id("rift_transition"), (g, delta) -> {
            var mc = Minecraft.getInstance();
            if (!SiftBudget.transitionHud || mc.player == null || !mc.options.getCameraType().isFirstPerson()) return;
            var effect = mc.player.getEffect(SiftContent.RIFT_TRANSIT);
            if (effect == null || effect.getDuration() > 20) return;
            float strength = effect.getDuration() / 20f;
            int w = g.guiWidth(), h = g.guiHeight();
            long frame = mc.player.tickCount / 2;
            for (int k = 0; k < 24; k++) {
                long bits = (frame * 341873128712L + k * 132897987541L) ^ (k * 73428767L);
                int x = (int)Math.floorMod(bits, w), y = (int)Math.floorMod(bits >>> 16, h);
                int q = 2 + (k % 4);
                g.fill(x, y, Math.min(w, x + q), Math.min(h, y + q), ((int)(strength * 120) << 24) | 0xFFFFFF);
            }
        });
    }
}
