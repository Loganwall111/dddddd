package dev.logan.beyond.client;

import dev.logan.beyond.content.AbilityItem;
import dev.logan.beyond.content.BeyondContent;
import dev.logan.beyond.content.BeyondEntities;
import dev.logan.beyond.client.entity.RealmCritterModel;
import dev.logan.beyond.client.entity.RealmCritterRenderer;
import dev.logan.beyond.network.RealityPayload;
import dev.logan.beyond.client.render.CosmicRenderer;
import dev.logan.beyond.client.render.TitanWorld;
import dev.logan.beyond.client.screen.FieldGuideScreen;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientEntityEvents;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientLifecycleEvents;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.client.rendering.v1.EntityModelLayerRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.util.InputUtil;
import net.minecraft.entity.EquipmentSlot;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import org.lwjgl.glfw.GLFW;

public final class BeyondClient implements ClientModInitializer {
    public static final VisualConfig CONFIG = VisualConfig.load();
    private static KeyBinding guide, cycle, panic, grow, shrink, tear;
    public static boolean wearingGlasses() {
        var p = MinecraftClient.getInstance().player;
        return p != null && p.getEquippedStack(EquipmentSlot.HEAD).isOf(BeyondContent.GLASSES);
    }
    public static void restoreDefaults() {
        var defaults = new VisualConfig();
        var live = CONFIG;
        live.enabled = defaults.enabled; live.cosmicSky = defaults.cosmicSky; live.introduction = defaults.introduction;
        live.reducedMotion = defaults.reducedMotion; live.seamlessTravel = defaults.seamlessTravel; live.ambience = defaults.ambience;
        live.spaghettification = defaults.spaghettification; live.nebula = defaults.nebula; live.intensity = defaults.intensity;
        live.quality = defaults.quality; live.lens = defaults.lens;
        live.save();
    }
    public static void openGuide() { var c = MinecraftClient.getInstance(); c.setScreen(new FieldGuideScreen(c.currentScreen)); }
    public static void cycleLens() {
        CONFIG.lens = (CONFIG.lens + 1) % VisualConfig.REALITIES.length; CONFIG.save();
        var p = MinecraftClient.getInstance().player;
        if (p != null) p.sendMessage(Text.literal("Reality / " + CONFIG.reality() + (wearingGlasses() ? "" : " · equip the glasses to see it")).formatted(Formatting.AQUA), true);
    }
    private static void command(String command) {
        var handler = MinecraftClient.getInstance().getNetworkHandler();
        if (handler != null) handler.sendChatCommand(command);
    }
    @Override public void onInitializeClient() {
        guide = key("guide", GLFW.GLFW_KEY_B); cycle = key("mandela", GLFW.GLFW_KEY_V); panic = key("panic", GLFW.GLFW_KEY_O);
        grow = key("grow", GLFW.GLFW_KEY_G); shrink = key("shrink", GLFW.GLFW_KEY_H); tear = key("tear", GLFW.GLFW_KEY_R);
        AbilityItem.openGuide = BeyondClient::openGuide;
        EntityModelLayerRegistry.registerModelLayer(RealmCritterRenderer.LAYER, RealmCritterModel::getTexturedModelData);
        EntityRendererRegistry.register(BeyondEntities.REALM_CRITTER, RealmCritterRenderer::new);
        ClientPlayNetworking.registerGlobalReceiver(RealityPayload.ID, (packet, context) -> context.client().execute(() -> ClientReality.accept(packet)));
        ClientPlayConnectionEvents.DISCONNECT.register((handler, client) -> { ClientReality.clear(); CosmicRenderer.release(); });
        ClientEntityEvents.ENTITY_UNLOAD.register((entity, world) -> { });
        ClientTickEvents.END_CLIENT_TICK.register(client -> {
            ClientReality.tick(client);
            RealityAmbience.tick(client);
            while (guide.wasPressed()) if (client.world != null) openGuide();
            while (cycle.wasPressed()) if (client.world != null) cycleLens();
            while (grow.wasPressed()) command("beyond scale grow");
            while (shrink.wasPressed()) command("beyond scale shrink");
            while (tear.wasPressed()) command("beyond tear");
            while (panic.wasPressed()) {
                CONFIG.enabled = !CONFIG.enabled; CONFIG.save(); ClientReality.skipIntroduction();
                if (client.player != null) client.player.sendMessage(Text.literal("Beyond effects " + (CONFIG.enabled ? "enabled" : "disabled · gameplay remains active")), true);
            }
            // Dimension swaps are masked by the warp; only the full-screen interruption is removed.
            SeamlessTravel.tick(client);
            TitanWorld.tick(client);
            ClientSmoke.tick(client);
        });
        CosmicRenderer.initialize();
        TitanWorld.initialize();
        ClientLifecycleEvents.CLIENT_STOPPING.register(client -> CosmicRenderer.release());
    }
    private static KeyBinding key(String name, int code) {
        return KeyBindingHelper.registerKeyBinding(new KeyBinding("key.beyond." + name, InputUtil.Type.KEYSYM, code, "key.category.beyond"));
    }
}
