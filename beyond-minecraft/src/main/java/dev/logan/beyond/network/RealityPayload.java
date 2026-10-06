package dev.logan.beyond.network;

import dev.logan.beyond.BeyondMinecraft;
import net.minecraft.network.RegistryByteBuf;
import net.minecraft.network.codec.PacketCodec;
import net.minecraft.network.packet.CustomPayload;
import net.minecraft.util.Identifier;
import java.util.ArrayList;
import java.util.List;

/** Server -> client only. No client can spawn an anomaly by submitting coordinates. */
public record RealityPayload(Identifier world, boolean intro, List<Node> nodes) implements CustomPayload {
    public static final Id<RealityPayload> ID = new Id<>(BeyondMinecraft.id("reality"));
    public static final PacketCodec<RegistryByteBuf, RealityPayload> CODEC = PacketCodec.of(RealityPayload::write, RealityPayload::read);
    public static final int MAX_NODES = 4;
    public record Node(int id, int kind, double x, double y, double z, float radius, float yaw,
                       int realm, int age, int lifetime) {
        public Node {
            if (kind < 0 || kind > 1 || !Double.isFinite(x) || !Double.isFinite(y) || !Double.isFinite(z) ||
                Math.abs(x) > 3e7 || Math.abs(y) > 4096 || Math.abs(z) > 3e7 ||
                !Float.isFinite(radius) || radius < .25 || radius > 8 || !Float.isFinite(yaw) ||
                realm < 0 || realm > 31 || age < 0 || lifetime < 1 || lifetime > 2400 || age > lifetime)
                throw new IllegalArgumentException("Invalid Beyond anomaly snapshot");
        }
    }
    public RealityPayload {
        nodes = List.copyOf(nodes);
        if (nodes.size() > MAX_NODES) throw new IllegalArgumentException("Too many Beyond nodes");
    }
    private void write(RegistryByteBuf buf) {
        buf.writeIdentifier(world); buf.writeBoolean(intro); buf.writeVarInt(nodes.size());
        for (Node n : nodes) {
            buf.writeVarInt(n.id); buf.writeByte(n.kind); buf.writeDouble(n.x); buf.writeDouble(n.y); buf.writeDouble(n.z);
            buf.writeFloat(n.radius); buf.writeFloat(n.yaw); buf.writeVarInt(n.realm); buf.writeVarInt(n.age); buf.writeVarInt(n.lifetime);
        }
    }
    private static RealityPayload read(RegistryByteBuf buf) {
        Identifier world = buf.readIdentifier(); boolean intro = buf.readBoolean(); int count = buf.readVarInt();
        if (count < 0 || count > MAX_NODES) throw new IllegalArgumentException("Beyond snapshot exceeds budget");
        List<Node> nodes = new ArrayList<>(count);
        for (int i = 0; i < count; i++) nodes.add(new Node(buf.readVarInt(), buf.readUnsignedByte(), buf.readDouble(), buf.readDouble(),
            buf.readDouble(), buf.readFloat(), buf.readFloat(), buf.readVarInt(), buf.readVarInt(), buf.readVarInt()));
        return new RealityPayload(world, intro, nodes);
    }
    @Override public Id<? extends CustomPayload> getId() { return ID; }
}
