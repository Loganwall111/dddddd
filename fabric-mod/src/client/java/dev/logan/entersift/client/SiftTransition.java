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
 * 0.16 rift transition overlay. No loading screen, no transit room: stepping into a rift gives the
 * player the hidden {@code entersift:rift_transit} effect (80 ticks). Its remaining time drives an
 * un-skippable fullscreen HUD sequence:
 *
 *   ticks  0-40  chromatic RGB channel separation: red and cyan glitch strips pulled apart by
 *                sin(time) * 0.15 of the screen width, a pastel wash and edge fringes, growing stronger
 *   ticks 41-60  a solid orange-red lens-flare burst covers the screen (it pulses and zooms slightly)
 *   tick  60     the server teleports silently under the flare
 *   ticks 61-80  the orange fades out over the new world
 *
 * The overlay is also drawn over any screen (the level-loading screen that the dimension change opens),
 * and keeps running on its own clock for up to 1.5 s when the effect briefly disappears while the new
 * dimension's player is created, so the loading screen is never seen.
 */
public final class SiftTransition {
    private SiftTransition() {}

    private static final Identifier FLASH = SiftContent.id("textures/gui/rift_flash.png");
    private static final Identifier GLITCH = SiftContent.id("textures/gui/rift_glitch.png");
    private static final float LENGTH = 80f;

    private static float lastT = -1f;
    private static long lastSeen;

    public static void register() {
        HudElementRegistry.addLast(SiftContent.id("rift_transition"), (graphics, delta) -> draw(graphics));
        ScreenEvents.AFTER_INIT.register((client, screen, w, h) ->
            ScreenEvents.afterExtract(screen).register((s, graphics, mx, my, partial) -> draw(graphics)));
    }

    private static int lastTick = -1;
    private static long tickAt;

    /** Current transition tick 0..80, or -1 when no transition is running. */
    private static float phase() {
        long now = System.nanoTime();
        Minecraft mc = Minecraft.getInstance();
        MobEffectInstance effect = mc.player == null ? null : mc.player.getEffect(SiftContent.RIFT_TRANSIT);
        if (effect != null && !effect.isInfiniteDuration() && effect.getDuration() <= LENGTH) {
            int tick = Math.round(LENGTH) - effect.getDuration();
            if (tick != lastTick) { lastTick = tick; tickAt = now; }
            float t = tick + Math.min(1f, (now - tickAt) / 5.0e7f); // 50 ms per tick between updates
            lastT = t;
            lastSeen = now;
            return t;
        }
        // Effect missing (new player object while the dimension loads): keep going on the wall clock.
        if (lastT >= 0) {
            float t = lastT + (now - lastSeen) / 5.0e7f;
            if (lastT >= 50f && t < LENGTH && now - lastSeen < 1_500_000_000L) return t;
            lastT = -1f;
            lastTick = -1;
        }
        return -1f;
    }

    private static void draw(GuiGraphicsExtractor g) {
        if (!SiftBudget.transitionHud) return;
        float t = phase();
        if (t < 0 || t >= LENGTH) return;
        int w = g.guiWidth(), h = g.guiHeight();
        double seconds = (System.nanoTime() / 1.0e9) % 10000.0;

        if (t < 46f) {
            // 0-40 chromatic separation (continues under the flare's fade-in).
            float k = Math.min(1f, t / 40f);
            float strength = k * (t > 40f ? 1f - (t - 40f) / 6f : 1f);
            int shift = Math.round((float) Math.sin(seconds * 9.0) * 0.15f * w * (0.25f + 0.75f * k) * 0.35f);
            int wash = argb(0.10f + 0.22f * strength, 0.86f, 0.95f, 0.93f);
            g.fill(0, 0, w, h, wash);
            int scroll = (int) ((seconds * 140.0) % h);
            blitTinted(g, GLITCH, shift, -scroll, w, h, argb(0.75f * strength, 1f, 0.35f, 0.4f));
            blitTinted(g, GLITCH, shift, h - scroll, w, h, argb(0.75f * strength, 1f, 0.35f, 0.4f));
            blitTinted(g, GLITCH, -shift, scroll - h, w, h, argb(0.75f * strength, 0.35f, 0.95f, 1f));
            blitTinted(g, GLITCH, -shift, scroll, w, h, argb(0.75f * strength, 0.35f, 0.95f, 1f));
            // Red / cyan fringes on the screen edges, offset like split colour channels.
            int fringe = Math.max(2, Math.round(w * 0.018f * (1f + Math.abs(shift) / (float) Math.max(1, w) * 20f)));
            g.fill(0, 0, fringe, h, argb(0.45f * strength, 1f, 0.2f, 0.3f));
            g.fill(w - fringe, 0, w, h, argb(0.45f * strength, 0.2f, 0.9f, 1f));
            // Random horizontal tear lines.
            long seed = (long) (seconds * 24.0);
            for (int i = 0; i < 6; i++) {
                long r = mixBits(seed * 31 + i);
                int y = (int) Math.floorMod(r, (long) Math.max(1, h));
                int th = 1 + (int) Math.floorMod(r >> 17, 3L);
                g.fill(0, y, w, y + th, argb(0.25f * strength, (i & 1) == 0 ? 1f : 0.4f, 0.95f, (i & 1) == 0 ? 0.95f : 1f));
            }
        }
        if (t >= 40f) {
            // 41-60 solid orange-red lens flare; 61-80 it fades out.
            float a = t < 46f ? (t - 40f) / 6f : t <= 60f ? 1f : 1f - (t - 60f) / 20f;
            a = Math.max(0f, Math.min(1f, a));
            g.fill(0, 0, w, h, argb(a, 1f, 0.36f, 0.16f));
            float pulse = 1.06f + 0.05f * (float) Math.sin(seconds * 6.0) + (t > 60f ? (t - 60f) * 0.01f : 0f);
            int fw = Math.round(w * pulse), fh = Math.round(h * pulse);
            blitTinted(g, FLASH, (w - fw) / 2, (h - fh) / 2, fw, fh, argb(a, 1f, 1f, 1f));
        }
    }

    private static void blitTinted(GuiGraphicsExtractor g, Identifier texture, int x, int y, int w, int h, int color) {
        if (((color >>> 24) & 255) == 0) return;
        int tw = texture == FLASH ? 256 : 256, th = texture == FLASH ? 256 : 128;
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
