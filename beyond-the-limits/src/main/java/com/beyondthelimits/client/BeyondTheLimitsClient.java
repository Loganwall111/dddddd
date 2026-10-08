package com.beyondthelimits.client;

import com.beyondthelimits.client.hud.BtlHud;
import com.beyondthelimits.client.particle.BtlParticleTypes;
import com.beyondthelimits.client.render.PostEffects;
import com.beyondthelimits.client.render.RiftRenderer;
import com.beyondthelimits.client.render.SkyRenderer;
import com.beyondthelimits.client.render.entity.BtlEntityRenderers;
import com.beyondthelimits.client.shader.BtlShaders;
import com.beyondthelimits.network.BtlNetworking;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientLifecycleEvents;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.client.rendering.v1.WorldRenderEvents;

/**
 * The client half of Beyond the Limits.
 *
 * <p>Almost nothing here decides anything. The server owns the world's state; the client owns only how
 * that state is seen. So this initialiser is a wiring list: shaders, particles, renderers, keys, HUD, and
 * three packet receivers, after which the client is a pure function of the numbers the server sends.</p>
 *
 * <p>That split is why the mod can put a procedural sky, gravitational lensing and a screen-space glitch
 * pass over the game without any of it leaking into the simulation: if the client is not there, the world
 * still behaves exactly the same.</p>
 */
public class BeyondTheLimitsClient implements ClientModInitializer {
	@Override
	public void onInitializeClient() {
		// ---- content -------------------------------------------------------------------------
		BtlShaders.register();
		BtlParticleTypes.register();
		BtlEntityRenderers.register();
		BtlKeybinds.register();
		BtlHud.register();

		// ---- the world pass -------------------------------------------------------------------
		WorldRenderEvents.AFTER_ENTITIES.register(RiftRenderer::render);
		WorldRenderEvents.LAST.register(PostEffects::render);

		// ---- the tick -------------------------------------------------------------------------
		ClientTickEvents.END_CLIENT_TICK.register(client -> {
			ClientState.tick();
			SkyRenderer.tick();
			PostEffects.tick();
			ClientHooks.tick();
			BtlHud.tick();
			BtlKeybinds.tick();
		});

		ClientLifecycleEvents.CLIENT_STOPPING.register(client -> ClientState.reset());

		// ---- state from the server -------------------------------------------------------------
		ClientPlayNetworking.registerGlobalReceiver(BtlNetworking.RealitySyncPayload.ID, (payload, context) ->
				ClientState.setReality(payload.reality(), payload.dementia(), payload.gravity(), payload.collision()));

		ClientPlayNetworking.registerGlobalReceiver(BtlNetworking.SkyStatePayload.ID, (payload, context) -> {
			ClientState.setSky(payload.event(), payload.intensity() / 100.0F, payload.durationTicks());

			if (payload.event() == BtlNetworking.SKY_EVENT_STORM) {
				SkyRenderer.flash(0.35F);
			}
		});

		ClientPlayNetworking.registerGlobalReceiver(BtlNetworking.ScreenEffectPayload.ID, (payload, context) -> {
			ClientState.setEffect(payload.effect(), payload.intensity(), payload.durationTicks());

			switch (payload.effect()) {
				case BtlNetworking.EFFECT_FLASH -> PostEffects.onFlash(payload.intensity());
				case BtlNetworking.EFFECT_STORM, BtlNetworking.EFFECT_BLACK_SUN -> SkyRenderer.flash(payload.intensity());
				case BtlNetworking.EFFECT_NOCLIP, BtlNetworking.EFFECT_RIFT_WASH -> PostEffects.onShake(0.35F);
				default -> {
				}
			}
		});
	}
}
