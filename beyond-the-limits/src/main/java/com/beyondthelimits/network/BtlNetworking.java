package com.beyondthelimits.network;

import com.beyondthelimits.BeyondTheLimits;
import com.beyondthelimits.core.BtlState;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.network.RegistryByteBuf;
import net.minecraft.network.codec.PacketCodec;
import net.minecraft.network.codec.PacketCodecs;
import net.minecraft.network.packet.CustomPayload;
import net.minecraft.server.network.ServerPlayerEntity;

/**
 * Server to client state synchronisation.
 *
 * <p>Everything the client needs for its visuals — reality integrity, dementia, gravity debt, sky
 * damage, active storms, the black sun stage and the screen effects — travels in four small
 * payloads. The client never guesses world state and the server never tells clients more than the
 * shaders and the HUD need.</p>
 */
public final class BtlNetworking {
	private BtlNetworking() {
	}

	// Screen effect ids shared between server and client.
	public static final int EFFECT_NOCLIP = 0;
	public static final int EFFECT_RIFT_WASH = 1;
	public static final int EFFECT_STORM = 2;
	public static final int EFFECT_OBSERVER = 3;
	public static final int EFFECT_BLACK_SUN = 4;
	public static final int EFFECT_DEMENTIA_SPIKE = 5;
	public static final int EFFECT_MIRROR = 6;
	public static final int EFFECT_MEMORY = 8;
	public static final int EFFECT_EVOLUTION = 9;
	public static final int EFFECT_FLASH = 7;

	// Sky event ids.
	public static final int SKY_EVENT_NONE = 0;
	public static final int SKY_EVENT_CRACK = 1;
	public static final int SKY_EVENT_STORM = 2;
	public static final int SKY_EVENT_BLACK_SUN = 3;
	public static final int SKY_EVENT_COLLISION = 4;
	public static final int SKY_EVENT_IMPOSSIBLE = 5;

	public static void registerPayloadTypes() {
		PayloadTypeRegistry.playS2C().register(RealitySyncPayload.ID, RealitySyncPayload.CODEC);
		PayloadTypeRegistry.playS2C().register(ScreenEffectPayload.ID, ScreenEffectPayload.CODEC);
		PayloadTypeRegistry.playS2C().register(SkyStatePayload.ID, SkyStatePayload.CODEC);
	}

	/** Pushes the player's full state down to their client. */
	public static void sendRealitySync(ServerPlayerEntity player) {
		BtlState state = BtlState.get();
		ServerPlayNetworking.send(player, new RealitySyncPayload(
				state.reality(),
				state.dementia(player.getUuid()),
				state.gravity(player.getUuid()),
				state.collision()));
	}

	/** Pushes sky damage, storm state and the black sun stage. */
	public static void sendSkyState(ServerPlayerEntity player) {
		BtlState state = BtlState.get();
		if (state.stormTicks() > 0) {
			ServerPlayNetworking.send(player, new SkyStatePayload(SKY_EVENT_STORM, state.stormIntensity(), state.stormTicks()));
		} else if (state.blackSunStage() > 0) {
			ServerPlayNetworking.send(player, new SkyStatePayload(SKY_EVENT_BLACK_SUN, state.blackSunStage(), 0));
		} else if (state.skyCrack() > 0) {
			ServerPlayNetworking.send(player, new SkyStatePayload(SKY_EVENT_CRACK, state.skyCrack(), 0));
		} else if (state.collision() > 0) {
			ServerPlayNetworking.send(player, new SkyStatePayload(SKY_EVENT_COLLISION, state.collision(), 0));
		} else {
			ServerPlayNetworking.send(player, new SkyStatePayload(SKY_EVENT_NONE, 0, 0));
		}
	}

	public static void sendScreenEffect(ServerPlayerEntity player, int effect, float intensity, int durationTicks) {
		ServerPlayNetworking.send(player, new ScreenEffectPayload(effect, intensity, durationTicks));
	}

	public static void broadcastScreenEffect(net.minecraft.server.MinecraftServer server, int effect,
			float intensity, int durationTicks) {
		ScreenEffectPayload payload = new ScreenEffectPayload(effect, intensity, durationTicks);

		for (ServerPlayerEntity player : server.getPlayerManager().getPlayerList()) {
			ServerPlayNetworking.send(player, payload);
		}
	}

	// ---------------------------------------------------------------------------------------------
	// Payloads
	// ---------------------------------------------------------------------------------------------

	/** reality, dementia, gravity debt, world collision. */
	public record RealitySyncPayload(int reality, int dementia, int gravity, int collision) implements CustomPayload {
		public static final CustomPayload.Id<RealitySyncPayload> ID =
				new CustomPayload.Id<>(BeyondTheLimits.id("reality_sync"));
		public static final PacketCodec<RegistryByteBuf, RealitySyncPayload> CODEC = PacketCodec.tuple(
				PacketCodecs.VAR_INT, RealitySyncPayload::reality,
				PacketCodecs.VAR_INT, RealitySyncPayload::dementia,
				PacketCodecs.VAR_INT, RealitySyncPayload::gravity,
				PacketCodecs.VAR_INT, RealitySyncPayload::collision,
				RealitySyncPayload::new);

		@Override
		public CustomPayload.Id<? extends CustomPayload> getId() {
			return ID;
		}
	}

	/** One-shot client effects: noclip, rift wash, flashes, mirror transitions. */
	public record ScreenEffectPayload(int effect, float intensity, int durationTicks) implements CustomPayload {
		public static final CustomPayload.Id<ScreenEffectPayload> ID =
				new CustomPayload.Id<>(BeyondTheLimits.id("screen_effect"));
		public static final PacketCodec<RegistryByteBuf, ScreenEffectPayload> CODEC = PacketCodec.tuple(
				PacketCodecs.VAR_INT, ScreenEffectPayload::effect,
				PacketCodecs.FLOAT, ScreenEffectPayload::intensity,
				PacketCodecs.VAR_INT, ScreenEffectPayload::durationTicks,
				ScreenEffectPayload::new);

		@Override
		public CustomPayload.Id<? extends CustomPayload> getId() {
			return ID;
		}
	}

	/** Sky state: what is wrong with the sky right now. */
	public record SkyStatePayload(int event, int intensity, int durationTicks) implements CustomPayload {
		public static final CustomPayload.Id<SkyStatePayload> ID =
				new CustomPayload.Id<>(BeyondTheLimits.id("sky_state"));
		public static final PacketCodec<RegistryByteBuf, SkyStatePayload> CODEC = PacketCodec.tuple(
				PacketCodecs.VAR_INT, SkyStatePayload::event,
				PacketCodecs.VAR_INT, SkyStatePayload::intensity,
				PacketCodecs.VAR_INT, SkyStatePayload::durationTicks,
				SkyStatePayload::new);

		@Override
		public CustomPayload.Id<? extends CustomPayload> getId() {
			return ID;
		}
	}
}
