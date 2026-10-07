package dev.logan.beyond.client;

import dev.logan.beyond.network.RealityPayload;
import net.minecraft.client.MinecraftClient;
import net.minecraft.util.Identifier;
import java.util.Comparator;
import java.util.List;
import org.joml.Matrix4f;
import org.joml.Vector3f;

public final class ClientReality {
    public static Identifier world;
    public static List<RealityPayload.Node> nodes = List.of();
    public static long ticks, receivedAt;
    /** Umbrella Effect era reported by the server, used for the sky and fog treatment. */
    public static int era;
    /** Remaining ticks of a wormhole corridor walk, and the length of that walk. */
    public static int tunnelRemaining, tunnelTotal;
    private static int introAge = -1;
    private static int transition;
    private static boolean aimWitness;
    public static final Vector3f witnessDirection = new Vector3f(0, .48f, -1).normalize();
    private ClientReality() {}
    public static void accept(RealityPayload packet) {
        if (world != null && !world.equals(packet.world())) transition = 14;
        world = packet.world(); nodes = packet.nodes().stream()
            .sorted(Comparator.comparingInt(node -> node.persistent() ? -1 : node.id())).toList();
        receivedAt = ticks; era = packet.era();
        if (packet.tunnel() > 0) {
            if (tunnelRemaining == 0) tunnelTotal = packet.tunnel();
            tunnelRemaining = packet.tunnel();
        } else if (tunnelRemaining > 0) {
            tunnelRemaining = 0; transition = 14;
        }
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
    /** 0..1 through the corridor walk, or 0 when not in a tunnel. */
    public static float tunnelPhase() {
        if (tunnelRemaining <= 0 || tunnelTotal <= 0) return 0;
        return Math.clamp(1f - tunnelRemaining / (float) tunnelTotal, 0f, 1f);
    }
    public static boolean travelling() { return transition > 0 || tunnelRemaining > 0; }
    public static void skipIntroduction() { introAge = -1; }
    /** Ask the server for the encounter again; also restarts the local animation immediately. */
    public static void replayIntroduction() {
        introAge = 0; aimWitness = true;
        var handler = net.minecraft.client.MinecraftClient.getInstance().getNetworkHandler();
        if (handler != null) handler.sendChatCommand("beyond witness");
    }
    public static void clear() {
        world = null; nodes = List.of(); ticks = receivedAt = 0; introAge = -1; transition = 0; aimWitness = false;
        era = 0; tunnelRemaining = tunnelTotal = 0;
        witnessDirection.set(0, .48f, -1).normalize();
    }
}
