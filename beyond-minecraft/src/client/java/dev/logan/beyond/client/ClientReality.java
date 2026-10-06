package dev.logan.beyond.client;

import dev.logan.beyond.network.RealityPayload;
import net.minecraft.client.MinecraftClient;
import net.minecraft.util.Identifier;
import java.util.List;
import org.joml.Matrix4f;
import org.joml.Vector3f;

public final class ClientReality {
    public static Identifier world;
    public static List<RealityPayload.Node> nodes = List.of();
    public static long ticks, receivedAt;
    private static int introAge = -1;
    private static int transition;
    private static boolean aimWitness;
    public static final Vector3f witnessDirection = new Vector3f(0, .48f, -1).normalize();
    private ClientReality() {}
    public static void accept(RealityPayload packet) {
        if (world != null && !world.equals(packet.world())) transition = 14;
        world = packet.world(); nodes = packet.nodes(); receivedAt = ticks;
        if (packet.intro() && BeyondClient.CONFIG.introduction) { introAge = 0; aimWitness = true; }
    }
    public static void observeCamera(Matrix4f cameraToWorld) {
        if (aimWitness) { cameraToWorld.transformDirection(witnessDirection.set(0, .35f, -1)).normalize(); aimWitness = false; }
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
    public static void clear() { world = null; nodes = List.of(); ticks = receivedAt = 0; introAge = -1; transition = 0; aimWitness = false; witnessDirection.set(0, .48f, -1).normalize(); }
}
