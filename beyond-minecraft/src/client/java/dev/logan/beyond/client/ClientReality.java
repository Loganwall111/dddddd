package dev.logan.beyond.client;

import dev.logan.beyond.network.RealityPayload;
import net.minecraft.client.MinecraftClient;
import net.minecraft.util.Identifier;
import java.util.List;

public final class ClientReality {
    public static Identifier world;
    public static List<RealityPayload.Node> nodes = List.of();
    public static long ticks, receivedAt;
    private static int introAge = -1;
    private static int transition;
    private ClientReality() {}
    public static void accept(RealityPayload packet) {
        if (world != null && !world.equals(packet.world())) transition = 14;
        world = packet.world(); nodes = packet.nodes(); receivedAt = ticks;
        if (packet.intro() && BeyondClient.CONFIG.introduction) introAge = 0;
    }
    public static void tick(MinecraftClient client) {
        if (client.world == null || client.isPaused()) return;
        ticks++;
        if (introAge >= 0 && ++introAge > 280) introAge = -1;
        if (transition > 0) transition--;
    }
    public static float intro(float delta) { return introAge < 0 ? -1 : (introAge + delta) / 20f; }
    public static float transition() { return transition / 14f; }
    public static void skipIntroduction() { introAge = -1; }
    public static void clear() { world = null; nodes = List.of(); ticks = receivedAt = 0; introAge = -1; transition = 0; }
}
