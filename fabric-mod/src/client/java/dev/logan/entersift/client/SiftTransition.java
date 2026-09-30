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
 * 0.22 Master Architecture Override: Fullscreen HUD Cam Overlay (The Transition Gate).
 *
 * When a player collides with the rift bounds, initiates an un-skippable 60-tick fullscreen HUD
 * render overlay (followed by a 20-tick smooth fade-out inside the walkable warp corridor):
 * <ul>
 *   <li><b>Ticks 0 - 40</b>: Gradually separates the screen's Red, Green, and Blue rendering passes
 *       using an oscillating vertex pixel offset ({@code Math.sin(gameTime) * 0.15}) to replicate
 *       the trailer's chromatic jitter distortion directly over the world blocks.</li>
 *   <li><b>Ticks 41 - 60</b>: Explodes the screen into a blinding, solid orange-and-red lens flare
 *       burst overlay that completely covers the client player's view (100% full-screen opacity at Tick 60).</li>
 *   <li><b>Tick 60+</b>: At 100% opacity, seamlessly teleports the player into the 3D walkthrough warp
 *       corridor ({@code entersift:rift_tunnel}) and smoothly fades the orange HUD opacity back down
 *       to {@code 0.0} inside the tunnel without throwing a loading screen.</li>
 * </ul>
 */
public final class SiftTransition {
    private SiftTransition() {}

    private static final Identifier FLASH = SiftContent.id("textures/gui/rift_flash.png");
    private static final Identifier GLITCH = SiftContent.id("textures/gui/rift_glitch.png");
    private static final float MAX = 100f;
    /** 0.22: effects this long (80 ticks from travel/warp) play the full 60-tick warp gate + 20-tick tunnel fade. */
    private static final float WARP = 70f;

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

    /** Opacity of the short exit flash at progress f: instant on, hold, then ease out. */
    static float alpha(float f) {
        if (f < 0f || f >= 1f) return 0f;
        if (f < 0.55f) return 1f;
        float k = (f - 0.55f) / 0.45f;
        return 1f - k * k * (3f - 2f * k);
    }

    private static void draw(GuiGraphicsExtractor g) {
        if (!SiftBudget.transitionHud) return;
        float f = progress();
        if (f >= 0f && f < 1f && lengthTicks >= WARP) { warp(g, f * lengthTicks); return; }
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

    /**
     * 0.22 rift warp overlay, t = ticks since stepping in (80 total, un-skippable):
     *   Ticks 0 - 40:  Gradually separate Red, Green, and Blue rendering passes using an oscillating
     *                  vertex pixel offset (Math.sin(gameTime) * 0.15) over the world blocks;
     *   Ticks 41 - 60: Explode the screen into a blinding, solid orange-and-red lens flare burst overlay
     *                  that reaches 100% full-screen opacity at Tick 60 (when tunnel teleport occurs);
     *   Ticks 60 - 80: Smoothly fade the orange HUD opacity back down to 0.0 inside the walkable tunnel.
     */
    private static void warp(GuiGraphicsExtractor g, float t) {
        int w = g.guiWidth(), h = g.guiHeight();
        double seconds = (System.nanoTime() / 1.0e9) % 10000.0;
        double gameTime = seconds * 9.0;
        if (t <= 40f) {
            float ramp = Math.max(0f, Math.min(1f, t / 40f));
            // Oscillating vertex pixel offset: Math.sin(gameTime) * 0.15
            float osc = (float) (Math.sin(gameTime) * 0.15);
            float o = (float) Math.sin(seconds * 9.0) * 0.15f * w * 0.14f * (0.3f + 0.7f * ramp);
            int offR = Math.round(o);
            int offG = Math.round(-o * 0.65f + osc * h * 0.08f * ramp);
            int offB = -offR;
            int fringe = Math.max(2, Math.round(w * (0.012f + 0.035f * ramp))) + Math.abs(offR);

            // Base warm chromatic veil
            g.fill(0, 0, w, h, argb(0.06f + 0.20f * ramp, 1f, 0.42f, 0.22f));
            // Separated Red, Green, and Blue full-screen chromatic passes
            g.fill(Math.max(0, offR), 0, Math.min(w, w + offR), h, argb(0.18f * ramp, 1.0f, 0.12f, 0.18f));
            g.fill(0, Math.max(0, offG), w, Math.min(h, h + offG), argb(0.14f * ramp, 0.15f, 1.0f, 0.45f));
            g.fill(Math.max(0, offB), 0, Math.min(w, w + offB), h, argb(0.18f * ramp, 0.15f, 0.82f, 1.0f));

            // Left & right separated RGB edge fringes
            g.fill(0, 0, fringe, h, argb(0.48f * ramp + 0.1f, offR >= 0 ? 1f : 0.15f, 0.20f, offR >= 0 ? 0.22f : 1f));
            g.fill(w - fringe, 0, w, h, argb(0.48f * ramp + 0.1f, offR >= 0 ? 0.15f : 1f, 0.88f, offR >= 0 ? 1f : 0.22f));

            // Horizontal world-block R/G/B separation slices
            long frame = (long) (seconds * 12.0);
            for (int k = 0; k < 9; k++) {
                long r = mixBits(frame * 31 + k);
                if ((r & 3) == 0 && ramp < 0.45f) continue;
                int y = (int) ((r >>> 8 & 0xFFFF) / 65535f * h);
                int sh = Math.max(2, (int) (h * (0.012f + 0.055f * ((r >>> 24 & 255) / 255f))));
                g.fill(offR, y, w + offR, y + sh, argb(0.26f * (0.35f + ramp), 1.0f, 0.16f, 0.24f));
                g.fill(offG, y + sh / 4, w + offG, y + sh / 4 + sh, argb(0.20f * (0.35f + ramp), 0.20f, 0.96f, 0.48f));
                g.fill(offB, y + sh / 2, w + offB, y + sh / 2 + sh, argb(0.26f * (0.35f + ramp), 0.18f, 0.86f, 1.0f));
            }
            blitTinted(g, GLITCH, offR, 0, w, h, 256, 128, argb(0.34f * ramp, 1.0f, 0.24f, 0.30f));
            blitTinted(g, GLITCH, offG, offG / 2, w, h, 256, 128, argb(0.24f * ramp, 0.25f, 1.0f, 0.55f));
            blitTinted(g, GLITCH, offB, 0, w, h, 256, 128, argb(0.34f * ramp, 0.24f, 0.90f, 1.0f));
            return;
        }

        // Ticks 41 - 60: Blinding solid orange-and-red lens flare burst overlay (100% opacity at Tick 60).
        // Ticks 60 - 80: Smoothly fade orange HUD opacity back down to 0.0 inside the walkable tunnel.
        float a = t < 60f ? Math.min(1f, 0.72f + (t - 40f) / 12f * 0.28f) : 1f - smoothK((t - 60f) / 20f);
        if (a <= 0f) return;

        // Solid blinding orange-and-red base covering the entire viewport
        g.fill(0, 0, w, h, argb(a, 1.0f, 0.42f, 0.08f));
        // Deep crimson-red outer lens-flare bands (top, bottom, left, right)
        int bandY = Math.max(4, h / 4);
        int bandX = Math.max(4, w / 6);
        g.fill(0, 0, w, bandY, argb(a * 0.55f, 0.92f, 0.14f, 0.05f));
        g.fill(0, h - bandY, w, h, argb(a * 0.55f, 0.92f, 0.14f, 0.05f));
        g.fill(0, 0, bandX, h, argb(a * 0.40f, 0.94f, 0.18f, 0.06f));
        g.fill(w - bandX, 0, w, h, argb(a * 0.40f, 0.94f, 0.18f, 0.06f));

        // Expanding radial lens-flare texture + white-gold core burst
        float pulse = 1.06f + 0.06f * (float) Math.sin(seconds * 10.0) + Math.max(0f, t - 40f) / 40f * 0.32f;
        int fw = Math.round(w * pulse), fh = Math.round(h * pulse);
        blitTinted(g, FLASH, (w - fw) / 2, (h - fh) / 2, fw, fh, argb(a, 1.0f, 0.86f, 0.42f));

        // Horizontal golden-white lens-flare streak across the center
        int streakH = Math.max(4, h / 14);
        g.fill(0, (h - streakH) / 2, w, (h + streakH) / 2, argb(a * 0.65f, 1.0f, 0.94f, 0.72f));
        int coreW = Math.max(12, w / 3), coreH = Math.max(12, h / 3);
        g.fill((w - coreW) / 2, (h - coreH) / 2, (w + coreW) / 2, (h + coreH) / 2, argb(a * 0.55f, 1.0f, 0.96f, 0.82f));
    }

    private static float smoothK(float k) { k = Math.max(0f, Math.min(1f, k)); return k * k * (3f - 2f * k); }

    private static void blitTinted(GuiGraphicsExtractor g, Identifier texture, int x, int y, int w, int h, int tw, int th, int color) {
        if (((color >>> 24) & 255) == 0) return;
        g.blit(RenderPipelines.GUI_TEXTURED, texture, x, y, 0f, 0f, w, h, tw, th, tw, th, color);
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
