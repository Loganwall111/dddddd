package dev.logan.entersift.client;

import dev.logan.entersift.SiftContent;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.fabricmc.fabric.api.client.screen.v1.ScreenEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.resources.Identifier;
import net.minecraft.world.effect.MobEffectInstance;

/**
 * 0.17 rift flash. Rifts no longer play a 4-second cutscene: the player walks through the rift
 * tunnel. Entering and leaving it gives the hidden {@code entersift:rift_transit} effect for 1 s
 * (2 s in the pre-tunnel fallback). While it runs, a brief warm gold/orange flash covers the screen:
 * fully opaque for the first ~55 % (that is when the dimension changes) and then fading out, with
 * thin red/cyan fringes as it clears.
 *
 * It is also drawn over any screen, so the level-loading screen the dimension change may open is
 * hidden. When the effect disappears for a moment (the new dimension's player object is created),
 * the flash keeps going on the wall clock for up to 1.5 s.
 */
public final class SiftTransition {
    private SiftTransition() {}

    private static final Identifier FLASH = SiftContent.id("textures/gui/rift_flash.png");
    private static final float MAX = 60f;

    private static float lastF = -1f, lengthTicks = 20f;
    private static long lastSeen;
    private static int startDuration = -1;

    public static void register() {
        HudElementRegistry.addLast(SiftContent.id("rift_transition"), (graphics, delta) -> draw(graphics));
        ScreenEvents.AFTER_INIT.register((client, screen, w, h) ->
            ScreenEvents.afterExtract(screen).register((s, graphics, mx, my, partial) -> draw(graphics)));
    }

    /** Flash progress 0..1, or -1 when no flash is running. */
    static float progress() {
        long now = System.nanoTime();
        Minecraft mc = Minecraft.getInstance();
        MobEffectInstance effect = mc.player == null ? null : mc.player.getEffect(SiftContent.RIFT_TRANSIT);
        if (effect != null && !effect.isInfiniteDuration() && effect.getDuration() <= MAX) {
            int d = effect.getDuration();
            if (startDuration < d) startDuration = d; // a new (or refreshed) flash
            lengthTicks = Math.max(1, startDuration);
            float f = (startDuration - d) / lengthTicks;
            lastF = f;
            lastSeen = now;
            return f;
        }
        startDuration = -1;
        if (lastF >= 0) {
            float f = lastF + (now - lastSeen) / 5.0e7f / lengthTicks;
            if (f < 1f && now - lastSeen < 1_500_000_000L) return f;
            lastF = -1f;
        }
        return -1f;
    }

    /** Opacity of the flash at progress f: instant on, hold, then ease out. */
    static float alpha(float f) {
        if (f < 0f || f >= 1f) return 0f;
        if (f < 0.55f) return 1f;
        float k = (f - 0.55f) / 0.45f;
        return 1f - k * k * (3f - 2f * k);
    }

    private static void draw(GuiGraphicsExtractor g) {
        if (!SiftBudget.transitionHud) return;
        float f = progress();
        float a = alpha(f);
        if (a <= 0f) return;
        int w = g.guiWidth(), h = g.guiHeight();
        double seconds = (System.nanoTime() / 1.0e9) % 10000.0;
        g.fill(0, 0, w, h, argb(a, 1f, 0.52f, 0.2f));
        float pulse = 1.04f + 0.04f * (float) Math.sin(seconds * 8.0) + f * 0.12f;
        int fw = Math.round(w * pulse), fh = Math.round(h * pulse);
        blitTinted(g, FLASH, (w - fw) / 2, (h - fh) / 2, fw, fh, argb(a, 1f, 0.92f, 0.7f));
        if (f > 0.55f) { // split-channel fringes while it clears
            int fringe = Math.max(2, Math.round(w * 0.02f));
            g.fill(0, 0, fringe, h, argb(0.5f * a, 1f, 0.2f, 0.3f));
            g.fill(w - fringe, 0, w, h, argb(0.5f * a, 0.2f, 0.9f, 1f));
        }
    }

    private static void blitTinted(GuiGraphicsExtractor g, Identifier texture, int x, int y, int w, int h, int color) {
        if (((color >>> 24) & 255) == 0) return;
        int tw = 256, th = 256;
        g.blit(RenderPipelines.GUI_TEXTURED, texture, x, y, 0f, 0f, w, h, tw, th, tw, th, color);
    }

    private static int argb(float a, float r, float gr, float b) {
        return (clamp(a) << 24) | (clamp(r) << 16) | (clamp(gr) << 8) | clamp(b);
    }

    private static int clamp(float v) { return Math.max(0, Math.min(255, Math.round(v * 255f))); }

    private static long mixBits(long z) {
        z = (z ^ (z >>> 33)) * 0xff51afd7ed558ccdL;
        z = (z ^ (z >>> 33)) * 0xc4ceb9fe1a85ec53L;
        return z ^ (z >>> 33);
    }
}
