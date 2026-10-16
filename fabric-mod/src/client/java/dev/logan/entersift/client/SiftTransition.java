package dev.logan.entersift.client;

import dev.logan.entersift.SiftContent;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.minecraft.client.Minecraft;

/** Short contact glitch only. Third-person spectators see world-space white pixels, never a HUD wash. */
public final class SiftTransition {
    private SiftTransition() {}
    public static void register() {
        HudElementRegistry.addLast(SiftContent.id("rift_transition"), (g, delta) -> {
            Minecraft mc = Minecraft.getInstance();
            if (!SiftBudget.transitionHud || mc.player == null || !mc.options.getCameraType().isFirstPerson()) return;
            var effect = mc.player.getEffect(SiftContent.RIFT_TRANSIT);
            if (effect == null || effect.getDuration() > 20) return;
            int elapsed = 20 - effect.getDuration();
            if (elapsed >= 8) return;
            float a = (1f - elapsed / 8f) * 0.30f;
            int w = g.guiWidth(), h = g.guiHeight();
            for (int i = 0; i < 6; i++) {
                int y = Math.floorMod(elapsed * 43 + i * 79, Math.max(1, h));
                int shift = (i % 2 == 0 ? 1 : -1) * (2 + elapsed);
                int alpha = (int)(a * 255) << 24;
                g.fill(shift, y, w + shift, y + 2, alpha | 0xFFB8D8);
                g.fill(-shift, y + 2, w - shift, y + 4, alpha | 0x99F5FF);
            }
        });
    }
}
