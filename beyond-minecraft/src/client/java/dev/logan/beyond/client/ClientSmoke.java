package dev.logan.beyond.client;

import dev.logan.beyond.BeyondMinecraft;
import dev.logan.beyond.client.render.CosmicRenderer;
import dev.logan.beyond.content.BeyondContent;
import dev.logan.beyond.server.Journey;
import dev.logan.beyond.server.RealityManager;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.screen.DeathScreen;
import net.minecraft.client.gui.screen.world.BackupPromptScreen;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.client.util.ScreenshotRecorder;
import net.minecraft.entity.EquipmentSlot;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.world.GameMode;
import net.minecraft.world.GameRules;
import net.minecraft.world.World;
import java.nio.file.Files;
import java.util.HashSet;
import java.util.List;
import java.util.function.Consumer;

/** Opt-in CI harness. Uses a disposable copied save named beyond-ci, never a user's normal world.
 * Exercises actual client/server objects, packets, world travel, render passes, screenshots and death.
 */
public final class ClientSmoke {
    private static final boolean ENABLED = "1".equals(System.getenv("BEYOND_CLIENT_SMOKE"));
    private static int bootTicks, stageTicks, lens;
    private static volatile int stage = -2;
    private static volatile boolean pending, complete;
    private static volatile Throwable failure;
    private static long lastHeartbeat;
    private static long loadingStarted;
    private ClientSmoke() {}
    public static void tick(MinecraftClient client) {
        if (!ENABLED || complete) return;
        try {
            if (failure != null) throw new IllegalStateException("server-side integration assertion", failure);
            if (System.currentTimeMillis() - lastHeartbeat > 15000) {
                BeyondMinecraft.LOGGER.info("BEYOND_HEARTBEAT stage={} ticks={} frames={} screen={}", stage, bootTicks, CosmicRenderer.renderedFrames(),
                    client.currentScreen == null ? "none" : client.currentScreen.getClass().getSimpleName() + " / " + client.currentScreen.getTitle().getString());
                lastHeartbeat = System.currentTimeMillis();
            }
            if (++bootTicks > 6500) throw new IllegalStateException("integration smoke timed out at stage " + stage);
            if (stage == -2) {
                if (bootTicks < 120) return;
                require(CosmicRenderer.ready(), CosmicRenderer.status());
                BeyondMinecraft.LOGGER.info("BEYOND_CLIENT_SHADER_SMOKE_PASS native_glsl=true resource_reload=true");
                // The workflow copies ONLY its freshly generated server world to this name.
                require(Files.isRegularFile(client.runDirectory.toPath().resolve("saves/beyond-ci/level.dat")), "missing isolated CI save");
                client.options.getViewDistance().setValue(2);
                client.options.getSimulationDistance().setValue(2);
                client.options.getMaxFps().setValue(30);
                client.options.pauseOnLostFocus = false;
                stage = -1; loadingStarted = System.currentTimeMillis();
                client.createIntegratedServerLoader().start("beyond-ci", () -> fail(client, new IllegalStateException("CI world load cancelled")));
                return;
            }
            if (stage == -1) {
                // Only this explicitly opt-in, disposable test save may bypass an experimental-world prompt.
                if (client.currentScreen instanceof BackupPromptScreen screen) {
                    for (var child : List.copyOf(screen.children())) {
                        if (child instanceof ButtonWidget b && b.active && !b.getMessage().getString().equals(net.minecraft.text.Text.translatable("gui.cancel").getString())) {
                            BeyondMinecraft.LOGGER.info("BEYOND_CI accepting disposable-world backup prompt: {}", b.getMessage().getString());
                            b.onPress(); break;
                        }
                    }
                }
                if (client.world == null || client.player == null || client.getServer() == null) {
                    if (System.currentTimeMillis() - loadingStarted > 150000) {
                        capture(client, "00-loading-diagnostic");
                        throw new IllegalStateException("CI world did not open: " + (client.currentScreen == null ? "no screen" : client.currentScreen.getClass().getName() + " / " + client.currentScreen.getTitle().getString()));
                    }
                    return;
                }
                client.setScreen(null); stage = 0; stageTicks = 0;
            }
            if (pending || client.player == null || client.world == null) return;
            stageTicks++;
            switch (stage) {
                case 0 -> server(client, p -> {
                    p.changeGameMode(GameMode.CREATIVE);
                    p.getAbilities().flying = true; p.sendAbilitiesUpdate();
                    p.getServerWorld().setTimeOfDay(13000);
                    p.getServerWorld().getGameRules().get(GameRules.DO_DAYLIGHT_CYCLE).set(false, p.getServer());
                    p.teleport(p.getServerWorld(), .5, 120, .5, 180, -18);
                    Journey.of(p).travelCooldown = 0;
                    RealityManager.sync(p, true);
                });
                case 1 -> { if (stageTicks > 65 && CosmicRenderer.renderedFrames() > 8) {
                    capture(client, "01-witness");
                    server(client, p -> { Journey.of(p).travelCooldown = 0; require(RealityManager.spawn(p, true), "local singularity creation"); });
                } }
                case 2 -> { if (stageTicks > 40) {
                    capture(client, "02-singularity");
                    server(client, p -> { RealityManager.clear(p); Journey.of(p).travelCooldown = 0; require(RealityManager.spawn(p, false), "membrane creation"); });
                } }
                case 3 -> { if (stageTicks > 40) {
                    capture(client, "03-membrane");
                    server(client, p -> p.equipStack(EquipmentSlot.HEAD, new ItemStack(BeyondContent.GLASSES)));
                } }
                case 4 -> { if (stageTicks > 26) {
                    require(BeyondClient.wearingGlasses(), "glasses equipment sync");
                    capture(client, "04-lens-" + lens);
                    stageTicks = 0;
                    if (++lens >= VisualConfig.LENSES.length) { stage++; BeyondClient.CONFIG.lens = 0; }
                    else BeyondClient.CONFIG.lens = lens;
                } }
                case 5 -> server(client, p -> {
                    RealityManager.clear(p);
                    p.getInventory().clear(); p.getInventory().setStack(0, new ItemStack(Items.DIAMOND, 7));
                    require(RealityManager.enter(p, 0), "enter first realm");
                    require(p.getInventory().getStack(0).isOf(Items.DIAMOND) && p.getInventory().getStack(0).getCount() == 7, "first realm clones inventory");
                    p.getInventory().setStack(0, new ItemStack(Items.EMERALD, 3));
                });
                case 6 -> { if (stageTicks > 60 && client.world.getRegistryKey().getValue().toString().equals("beyond:realm_00")) {
                    capture(client, "05-generated-realm");
                    server(client, p -> {
                        require(RealityManager.enter(p, 1), "nested travel");
                        require(p.getInventory().getStack(0).isOf(Items.EMERALD), "nested realm clones current inventory");
                        p.getInventory().setStack(0, new ItemStack(Items.GOLD_INGOT, 5));
                    });
                } }
                case 7 -> { if (stageTicks > 30 && client.world.getRegistryKey().getValue().toString().equals("beyond:realm_01")) server(client, p -> {
                    require(RealityManager.returnHome(p), "nested return");
                    require(p.getWorld().getRegistryKey().equals(World.OVERWORLD), "root dimension restored");
                    require(p.getInventory().getStack(0).isOf(Items.DIAMOND) && p.getInventory().getStack(0).getCount() == 7, "root inventory restored");
                    Journey saved = Journey.read(p.writeNbt(new NbtCompound()).getCompound("BeyondJourney"));
                    require(saved.inventory.active().equals("root"), "player mixin persists journey with inventory");
                }); }
                case 8 -> { if (stageTicks > 30 && client.world.getRegistryKey().equals(World.OVERWORLD)) server(client, p -> {
                    require(RealityManager.enter(p, 0), "revisit realm zero");
                    require(p.getInventory().getStack(0).isOf(Items.EMERALD) && p.getInventory().getStack(0).getCount() == 3, "modified realm snapshot restored");
                    p.getServerWorld().getGameRules().get(GameRules.KEEP_INVENTORY).set(false, p.getServer());
                    p.kill();
                }); }
                case 9 -> { if (client.currentScreen instanceof DeathScreen && stageTicks > 25) {
                    client.player.requestRespawn(); client.setScreen(null); stage++; stageTicks = 0;
                } }
                case 10 -> { if (stageTicks > 45 && client.player.isAlive() && client.world.getRegistryKey().equals(World.OVERWORLD)) server(client, p -> {
                    require(p.getInventory().getStack(0).isOf(Items.DIAMOND) && p.getInventory().getStack(0).getCount() == 7, "root inventory after realm death");
                    require(RealityManager.enter(p, 0), "return to deceased realm");
                    require(p.getInventory().getStack(0).isEmpty(), "dropped realm inventory must not resurrect");
                }); }
                case 11 -> { if (stageTicks > 30 && client.world.getRegistryKey().getValue().toString().equals("beyond:realm_00")) server(client, p -> {
                    require(RealityManager.returnHome(p), "final safe return");
                    require(RealityManager.scale(p, .125), "small scale");
                    require(RealityManager.scale(p, 1), "normal scale restore");
                }); }
                case 12 -> { if (stageTicks > 35 && client.world.getRegistryKey().equals(World.OVERWORLD)) {
                    BeyondClient.openGuide();
                    for (var child : List.copyOf(client.currentScreen.children())) if (child instanceof ButtonWidget b && b.getMessage().getString().contains("Settings")) { b.onPress(); break; }
                    stage++; stageTicks = 0;
                } }
                case 13 -> { if (stageTicks > 25) {
                    capture(client, "06-field-guide");
                    require(CosmicRenderer.ready() && CosmicRenderer.renderedFrames() > 30, "actual post-process frames");
                    BeyondMinecraft.LOGGER.info("BEYOND_CLIENT_INTEGRATION_PASS frames={} world_travel=true inventory_round_trip=true player_nbt=true death_restore=true scale=true screenshots=true", CosmicRenderer.renderedFrames());
                    complete = true; client.scheduleStop();
                } }
                default -> { }
            }
        } catch (Throwable error) { fail(client, error); }
    }
    private static void server(MinecraftClient client, Consumer<ServerPlayerEntity> action) {
        pending = true; stageTicks = 0;
        var server = client.getServer(); var uuid = client.player.getUuid();
        server.execute(() -> {
            try {
                var player = server.getPlayerManager().getPlayer(uuid);
                require(player != null, "integrated player missing"); action.accept(player); stage++;
                BeyondMinecraft.LOGGER.info("BEYOND_INTEGRATION stage={}", stage);
            } catch (Throwable error) { failure = error; }
            finally { pending = false; }
        });
    }
    private static void capture(MinecraftClient client, String name) throws java.io.IOException {
        var directory = client.runDirectory.toPath().resolve("screenshots"); Files.createDirectories(directory);
        try (var image = ScreenshotRecorder.takeScreenshot(client.getFramebuffer())) {
            var colors = new HashSet<Integer>();
            for (int y = 20; y < image.getHeight() - 20; y += 13) for (int x = 20; x < image.getWidth() - 20; x += 13) colors.add(image.getColor(x, y));
            require(colors.size() > 24, "uniform/blank framebuffer: " + name);
            image.writeTo(directory.resolve("beyond-" + name + ".png"));
            BeyondMinecraft.LOGGER.info("BEYOND_SCREENSHOT {} colors={}", name, colors.size());
        }
    }
    private static void require(boolean value, String message) { if (!value) throw new AssertionError(message); }
    private static void fail(MinecraftClient client, Throwable error) {
        complete = true; BeyondMinecraft.LOGGER.error("BEYOND_CLIENT_INTEGRATION_FAIL stage=" + stage, error); client.scheduleStop();
    }
}
