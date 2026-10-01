package dev.logan.entersift.client;

import dev.logan.entersift.SiftContent;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;

/** A brief first-person pixel glitch during entry, never a cutscene or orange fullscreen flare.
 * Third-person observers see the server's world-space white fragments instead of a HUD overlay.
 */
public final class SiftTransition {
    private SiftTransition() {}
    public static void register() {
        HudElementRegistry.addLast(SiftContent.id("rift_transition"), (g, delta) -> draw(g));
    }

    private static void draw(GuiGraphicsExtractor g) {
        var mc = Minecraft.getInstance();
        if (!SiftBudget.transitionHud || mc.player == null || !mc.options.getCameraType().isFirstPerson()) return;
        var effect = mc.player.getEffect(SiftContent.RIFT_TRANSIT);
        if (effect == null || effect.isInfiniteDuration() || effect.getDuration() > 20) return;
        int elapsed = 20-effect.getDuration();
        if (elapsed < 0 || elapsed >= 6) return;
        float fade = 1f-elapsed/6f;
        int w = g.guiWidth(), h = g.guiHeight();
        int size = Math.max(2, w/100);
        for (int n = 0; n < 32; n++) {
            int bits = Integer.rotateLeft(n * 0x45d9f3b + elapsed * 317, n % 17);
            int x = Math.floorMod(bits,w), y = Math.floorMod(bits >>> 9,h);
            int alpha = Math.round(170*fade);
            g.fill(x,y,Math.min(w,x+size),Math.min(h,y+size),(alpha<<24)|0xFFFFFF);
            if (n % 5 == 0) {
                g.fill(Math.max(0,x-size),y,x,Math.min(h,y+size/2),((alpha/2)<<24)|0x77EDFF);
            }
        }
    }
}
