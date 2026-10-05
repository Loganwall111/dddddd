package dev.logan.entersift.client;

import dev.logan.entersift.EnterTheSift;
import net.fabricmc.fabric.api.client.command.v2.ClientCommands;
import net.fabricmc.fabric.api.client.command.v2.ClientCommandRegistrationCallback;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;

/** Saves the final, live camera view so shader changes can be reviewed in-game. */
public final class SiftViewCapture {
    private SiftViewCapture() {}

    public static void register() {
        ClientCommandRegistrationCallback.EVENT.register((dispatcher, registryAccess) ->
            dispatcher.register(ClientCommands.literal("siftshot").executes(context -> {
                Minecraft client = Minecraft.getInstance();
                if (client.player == null || client.level == null) {
                    EnterTheSift.LOGGER.warn("[Sift] /siftshot requires a loaded world");
                    return 0;
                }

                String name = "entersift-" + System.currentTimeMillis();
                Screenshot.grab(
                    FabricLoader.getInstance().getGameDir().toFile(),
                    name,
                    client.gameRenderer.mainRenderTarget(),
                    1,
                    message -> {
                        EnterTheSift.LOGGER.info("[Sift] {} (game directory / screenshots)", message.getString());
                        if (client.player != null) client.player.sendSystemMessage(message);
                    }
                );
                return 1;
            })));
    }
}
