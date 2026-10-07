package dev.logan.beyond.network;

import dev.logan.beyond.BeyondMinecraft;
import net.minecraft.network.RegistryByteBuf;
import net.minecraft.network.codec.PacketCodec;
import net.minecraft.network.packet.CustomPayload;
import net.minecraft.util.Identifier;
import java.util.ArrayList;
import java.util.List;

/** Server -> client only. No client can spawn an anomaly by submitting coordinates. */
public record RealityPayload(Identifier world, boolean intro, int era, int tunnel, List<Node> nodes) implements CustomPayload {
    public static final Id<RealityPayload> ID = new Id<>(BeyondMinecraft.id("reality"));
    public static final PacketCodec<RegistryByteBuf, RealityPayload> CODEC = PacketCodec.of(RealityPayload::write, RealityPayload::read);
    /** One colossal well plus five local distortions. Persistent wells are never distance-culled. */
    public static final int MAX_NODES = 6;
    public static final int NO_TUNNEL = 0;
    public record Node(int id, int kind, double x, double y, double z, float radius, float yaw,
                       int realm, int age, int lifetime) {
        public Node {
            if (kind < 0 || kind > 5 || !Double.isFinite(x) || !Double.isFinite(y) || !Double.isFinite(z) ||
                Math.abs(x) > 3e7 || Math.abs(y) > 4096 || Math.abs(z) > 3e7 ||
                !Float.isFinite(radius) || radius < .25 || radius > 512 || !Float.isFinite(yaw) ||
                realm < 0 || realm > 31 || age < 0 || lifetime < 1 || lifetime > 1_000_000 || age > lifetime)
                throw new IllegalArgumentException("Invalid Beyond anomaly snapshot");
        }
        /** A colossal sky well reports a very long lifetime; treat it as permanent. */
        public boolean persistent() { return kind == 5; }
    }
    public RealityPayload {
        nodes = List.copyOf(nodes);
        if (nodes.size() > MAX_NODES) throw new IllegalArgumentException("Too many Beyond nodes");
        era = Math.clamp(era, 0, 64);
        tunnel = Math.clamp(tunnel, 0, 100_000);
    }
    private void write(RegistryByteBuf buf) {
        buf.writeIdentifier(world); buf.writeBoolean(intro); buf.writeVarInt(era); buf.writeVarInt(tunnel); buf.writeVarInt(nodes.size());
        for (Node n : nodes) {
            buf.writeVarInt(n.id); buf.writeByte(n.kind); buf.writeDouble(n.x); buf.writeDouble(n.y); buf.writeDouble(n.z);
            buf.writeFloat(n.radius); buf.writeFloat(n.yaw); buf.writeVarInt(n.realm); buf.writeVarInt(n.age); buf.writeVarInt(n.lifetime);
        }
    }
    private static RealityPayload read(RegistryByteBuf buf) {
        Identifier world = buf.readIdentifier(); boolean intro = buf.readBoolean();
        int era = buf.readVarInt(), tunnel = buf.readVarInt();
        int count = buf.readVarInt();
        if (count < 0 || count > MAX_NODES) throw new IllegalArgumentException("Beyond snapshot exceeds budget");
        List<Node> nodes = new ArrayList<>(count);
        for (int i = 0; i < count; i++) nodes.add(new Node(buf.readVarInt(), buf.readUnsignedByte(), buf.readDouble(), buf.readDouble(),
            buf.readDouble(), buf.readFloat(), buf.readFloat(), buf.readVarInt(), buf.readVarInt(), buf.readVarInt()));
        return new RealityPayload(world, intro, era, tunnel, nodes);
    }
    @Override public Id<? extends CustomPayload> getId() { return ID; }
}
