package dev.beyondlimits.network;

import dev.beyondlimits.BeyondLimits;
import dev.beyondlimits.world.RealityState;
import net.fabricmc.fabric.api.networking.v1.PacketByteBufs;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.network.PacketByteBuf;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.util.Identifier;

public final class RealitySync {
    public static final Identifier CHANNEL = BeyondLimits.id("reality_sync");

    private RealitySync() {
    }

    public static void send(ServerPlayerEntity player, RealityState state) {
        PacketByteBuf packet = PacketByteBufs.create();
        packet.writeVarInt(state.getStability());
        packet.writeString(state.getPhaseName(), 64);
        packet.writeVarInt(state.getRiftsOpened());
        ServerPlayNetworking.send(player, CHANNEL, packet);
    }
}
