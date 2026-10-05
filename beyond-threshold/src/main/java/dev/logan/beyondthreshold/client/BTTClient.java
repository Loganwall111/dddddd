package dev.logan.beyondthreshold.client;

import dev.logan.beyondthreshold.BTTEntities;
import dev.logan.beyondthreshold.BTTNet;
import dev.logan.beyondthreshold.BeyondTheThreshold;
import dev.logan.beyondthreshold.client.render.CosmicSkyRenderer;
import dev.logan.beyondthreshold.client.render.EntityFxRenderer;
import dev.logan.beyondthreshold.client.render.NoopRenderer;
import dev.logan.beyondthreshold.client.render.PostFxManager;
import dev.logan.beyondthreshold.client.screen.BTTConfigScreen;
import dev.logan.beyondthreshold.entity.WatcherEyeEntity;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.fabricmc.fabric.api.client.rendering.v1.WorldRenderEvents;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.util.InputUtil;
import net.minecraft.entity.Entity;
import net.minecraft.text.Text;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;
import org.lwjgl.glfw.GLFW;

public class BTTClient implements ClientModInitializer {
	private static KeyBinding cycleKey;
	private static KeyBinding configKey;

	@Override
	public void onInitializeClient() {
		ClientPlayNetworking.registerGlobalReceiver(BTTNet.EYE_SEQUENCE, (client, handler, buf, responder) -> {
			int stage = buf.readInt();
			client.execute(() -> {
				BTTClientState.sequenceStage = stage;
				BTTClientState.sequenceTick = 0;
			});
		});
		ClientPlayNetworking.registerGlobalReceiver(BTTNet.FLASH, (client, handler, buf, responder) -> {
			float f = buf.readFloat();
			client.execute(() -> BTTClientState.flash = Math.max(BTTClientState.flash, f));
		});
		ClientPlayNetworking.registerGlobalReceiver(BTTNet.SHAKE, (client, handler, buf, responder) -> {
			float f = buf.readFloat();
			client.execute(() -> BTTClientState.shake = Math.max(BTTClientState.shake, f));
		});
		ClientPlayNetworking.registerGlobalReceiver(BTTNet.GLASSES, (client, handler, buf, responder) -> {
			boolean worn = buf.readBoolean();
			client.execute(() -> BTTClientState.glassesWorn = worn);
		});
		ClientPlayNetworking.registerGlobalReceiver(BTTNet.THRESHOLD, (client, handler, buf, responder) -> {
			boolean on = buf.readBoolean();
			client.execute(() -> BTTClientState.thresholdActive = on);
		});
		ClientPlayNetworking.registerGlobalReceiver(BTTNet.MANDELA, (client, handler, buf, responder) -> {
			int mode = buf.readInt();
			client.execute(() -> BTTClientState.mandelaMode = mode);
		});
		ClientPlayNetworking.registerGlobalReceiver(BTTNet.TRAVEL, (client, handler, buf, responder) -> {
			int dim = buf.readInt();
			long seed = buf.readLong();
			client.execute(() -> {
				BTTClientState.travelDim = dim;
				BTTClientState.travelSeed = seed;
				BTTClientState.travelFlash = 160;
				BTTClientState.flash = Math.max(BTTClientState.flash, 0.7F);
			});
		});
		ClientPlayConnectionEvents.JOIN.register((handler, sender, client) -> BTTClientState.reset());

		cycleKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
				"key.beyondthreshold.cycle", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_V, "key.beyondthreshold.category"));
		configKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
				"key.beyondthreshold.config", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_B, "key.beyondthreshold.category"));

		ClientTickEvents.END_CLIENT_TICK.register(BTTClient::tick);

		WorldRenderEvents.BEFORE_ENTITIES.register(context -> CosmicSkyRenderer.draw(context));
		WorldRenderEvents.AFTER_ENTITIES.register(context -> EntityFxRenderer.draw(context));

		HudRenderCallback.EVENT.register((matrices, tickDelta) -> HudOverlay.draw(matrices));

		EntityRendererRegistry.register(BTTEntities.BLACK_HOLE, NoopRenderer::new);
		EntityRendererRegistry.register(BTTEntities.WATCHER_EYE, NoopRenderer::new);
		EntityRendererRegistry.register(BTTEntities.REALITY_TEAR, NoopRenderer::new);
	}

	private static void tick(MinecraftClient client) {
		if (client.player == null || client.world == null) {
			return;
		}
		BTTClientState.flash *= 0.92F;
		BTTClientState.shake *= 0.94F;
		if (BTTClientState.travelFlash > 0) {
			BTTClientState.travelFlash--;
		}
		if (BTTClientState.sequenceStage >= 0) {
			BTTClientState.sequenceTick++;
			if (BTTClientState.sequenceStage == 2 && BTTClientState.sequenceTick > 160) {
				BTTClientState.sequenceStage = -1;
			}
		}

		while (cycleKey.wasPressed()) {
			if (BTTClientState.glassesWorn) {
				BTTClientState.mandelaMode = (BTTClientState.mandelaMode + 1) % 6;
				client.player.sendMessage(Text.translatable("message.beyondthreshold.mandela",
						BTTClientState.MANDELA_NAMES[BTTClientState.mandelaMode]), true);
			} else {
				client.player.sendMessage(Text.translatable("message.beyondthreshold.no_glasses"), true);
			}
		}
		while (configKey.wasPressed()) {
			client.setScreen(new BTTConfigScreen());
		}

		// the eye owns your camera while it grabs you
		if (BTTClientState.sequenceStage == 0 || BTTClientState.sequenceStage == 1) {
			for (Entity e : client.world.getEntities()) {
				if (e instanceof WatcherEyeEntity eye) {
					Vec3d to = eye.getPos().subtract(client.player.getEyePos());
					float yaw = (float) Math.toDegrees(Math.atan2(to.x, to.z));
					float pitch = (float) (-Math.toDegrees(Math.atan2(to.y, MathHelper.sqrt((float) (to.x * to.x + to.z * to.z)))));
					client.player.setYaw(lerpAngle(client.player.getYaw(), yaw, 0.2F));
					client.player.setPitch(MathHelper.lerp(0.2F, client.player.getPitch(), pitch));
					break;
				}
			}
		}

		PostFxManager.tick(client);
	}

	private static float lerpAngle(float a, float b, float t) {
		float d = MathHelper.wrapDegrees(b - a);
		return a + d * t;
	}

	static {
		// touch the logger so class-load order is sane
		BeyondTheThreshold.LOGGER.debug("[btt] client boot");
	}
}
