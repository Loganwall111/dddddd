package dev.logan.beyond.client;

import dev.logan.beyond.content.AbilityItem;
import dev.logan.beyond.content.BeyondContent;
import dev.logan.beyond.network.RealityPayload;
import dev.logan.beyond.client.render.CosmicRenderer;
import dev.logan.beyond.client.screen.FieldGuideScreen;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientLifecycleEvents;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.util.InputUtil;
import net.minecraft.entity.EquipmentSlot;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import org.lwjgl.glfw.GLFW;

public final class BeyondClient implements ClientModInitializer {
    public static final VisualConfig CONFIG = VisualConfig.load();
    private static KeyBinding guide, cycle, panic;
    public static boolean wearingGlasses() {
        var p = MinecraftClient.getInstance().player;
        return p != null && p.getEquippedStack(EquipmentSlot.HEAD).isOf(BeyondContent.GLASSES);
    }
    public static void openGuide() { var c = MinecraftClient.getInstance(); c.setScreen(new FieldGuideScreen(c.currentScreen)); }
    public static void cycleLens() {
        CONFIG.lens = (CONFIG.lens + 1) % VisualConfig.LENSES.length; CONFIG.save();
        var p = MinecraftClient.getInstance().player;
        if (p != null) p.sendMessage(Text.literal("Mandela / " + VisualConfig.LENSES[CONFIG.lens] + (wearingGlasses() ? "" : " · equip the glasses to see it")).formatted(Formatting.AQUA), true);
    }
    @Override public void onInitializeClient() {
        guide = key("guide", GLFW.GLFW_KEY_B); cycle = key("mandela", GLFW.GLFW_KEY_V); panic = key("panic", GLFW.GLFW_KEY_O);
        AbilityItem.openGuide = BeyondClient::openGuide;
        ClientPlayNetworking.registerGlobalReceiver(RealityPayload.ID, (packet, context) -> context.client().execute(() -> ClientReality.accept(packet)));
        ClientPlayConnectionEvents.DISCONNECT.register((handler, client) -> { ClientReality.clear(); CosmicRenderer.release(); });
        ClientTickEvents.END_CLIENT_TICK.register(client -> {
            ClientReality.tick(client);
            while (guide.wasPressed()) if (client.world != null) openGuide();
            while (cycle.wasPressed()) if (client.world != null) cycleLens();
            while (panic.wasPressed()) {
                CONFIG.enabled = !CONFIG.enabled; CONFIG.save(); ClientReality.skipIntroduction();
                if (client.player != null) client.player.sendMessage(Text.literal("Beyond effects " + (CONFIG.enabled ? "enabled" : "disabled · gameplay remains active")), true);
            }
            ClientSmoke.tick(client);
        });
        CosmicRenderer.initialize();
        ClientLifecycleEvents.CLIENT_STOPPING.register(client -> CosmicRenderer.release());
    }
    private static KeyBinding key(String name, int code) {
        return KeyBindingHelper.registerKeyBinding(new KeyBinding("key.beyond." + name, InputUtil.Type.KEYSYM, code, "key.category.beyond"));
    }
}
