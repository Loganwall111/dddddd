package dev.beyondlimits.client;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import net.minecraft.util.math.MathHelper;

public final class RealityHud {
    private static volatile int stability = 100;
    private static volatile int riftsOpened;
    private static volatile String phase = "QUIET FRACTURE";

    private RealityHud() {
    }

    public static void update(int newStability, String newPhase, int newRiftsOpened) {
        stability = MathHelper.clamp(newStability, 0, 100);
        phase = newPhase;
        riftsOpened = Math.max(0, newRiftsOpened);
    }

    public static void render(DrawContext context, float tickDelta) {
        MinecraftClient client = MinecraftClient.getInstance();
        if (client.player == null || client.world == null || client.options.hudHidden) return;

        int x = 12;
        int y = context.getScaledWindowHeight() - 48;
        int accent = stability > 60 ? 0xFF74E8FF : stability > 25 ? 0xFFFFB166 : 0xFFFF456E;
        context.fill(x, y, x + 174, y + 37, 0xB50A0D1B);
        context.fill(x, y, x + 2, y + 37, accent);
        context.drawText(client.textRenderer, Text.literal("REALITY INTEGRITY").formatted(Formatting.BOLD), x + 9, y + 5, 0xFFEDEAFF, false);
        context.drawText(client.textRenderer, Text.literal(phase), x + 9, y + 19, 0xFFB8B1CF, false);
        context.drawText(client.textRenderer, Text.literal(stability + "%"), x + 139, y + 5, accent, true);

        context.fill(x + 9, y + 31, x + 165, y + 34, 0xFF28243A);
        int width = MathHelper.floor(156.0F * stability / 100.0F);
        if (width > 0) context.fill(x + 9, y + 31, x + 9 + width, y + 34, accent);

        if (client.world.getRegistryKey() == net.minecraft.world.World.OVERWORLD && riftsOpened > 0) {
            context.drawText(client.textRenderer, Text.literal("SEAMS " + riftsOpened), x + 134, y + 19, 0xFF8FC8FF, false);
        }
    }
}
