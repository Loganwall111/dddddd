package dev.logan.beyondthreshold;

import io.netty.buffer.Unpooled;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.network.PacketByteBuf;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.util.Identifier;

/** Server -> client channel ids for the threshold effects. */
public final class BTTNet {
	public static final Identifier EYE_SEQUENCE = new Identifier(BeyondTheThreshold.MOD_ID, "eye_seq");
	public static final Identifier FLASH = new Identifier(BeyondTheThreshold.MOD_ID, "flash");
	public static final Identifier SHAKE = new Identifier(BeyondTheThreshold.MOD_ID, "shake");
	public static final Identifier GLASSES = new Identifier(BeyondTheThreshold.MOD_ID, "glasses");
	public static final Identifier THRESHOLD = new Identifier(BeyondTheThreshold.MOD_ID, "threshold");
	public static final Identifier TRAVEL = new Identifier(BeyondTheThreshold.MOD_ID, "travel");
	public static final Identifier MANDELA = new Identifier(BeyondTheThreshold.MOD_ID, "mandela");

	public static void sendEyeSequence(ServerPlayerEntity player, int stage) {
		PacketByteBuf buf = new PacketByteBuf(Unpooled.buffer());
		buf.writeInt(stage);
		ServerPlayNetworking.send(player, EYE_SEQUENCE, buf);
	}

	public static void sendFlash(ServerPlayerEntity player, float intensity) {
		PacketByteBuf buf = new PacketByteBuf(Unpooled.buffer());
		buf.writeFloat(intensity);
		ServerPlayNetworking.send(player, FLASH, buf);
	}

	public static void sendShake(ServerPlayerEntity player, float intensity) {
		PacketByteBuf buf = new PacketByteBuf(Unpooled.buffer());
		buf.writeFloat(intensity);
		ServerPlayNetworking.send(player, SHAKE, buf);
	}

	public static void sendGlasses(ServerPlayerEntity player, boolean worn) {
		PacketByteBuf buf = new PacketByteBuf(Unpooled.buffer());
		buf.writeBoolean(worn);
		ServerPlayNetworking.send(player, GLASSES, buf);
	}

	public static void sendThreshold(ServerPlayerEntity player, boolean active) {
		PacketByteBuf buf = new PacketByteBuf(Unpooled.buffer());
		buf.writeBoolean(active);
		ServerPlayNetworking.send(player, THRESHOLD, buf);
	}

	public static void sendMandela(ServerPlayerEntity player, int mode) {
		PacketByteBuf buf = new PacketByteBuf(Unpooled.buffer());
		buf.writeInt(mode);
		ServerPlayNetworking.send(player, MANDELA, buf);
	}

	public static void sendTravel(ServerPlayerEntity player, int dimensionIndex, long seed) {
		PacketByteBuf buf = new PacketByteBuf(Unpooled.buffer());
		buf.writeInt(dimensionIndex);
		buf.writeLong(seed);
		ServerPlayNetworking.send(player, TRAVEL, buf);
	}

	private BTTNet() {
	}
}
