package dev.logan.beyond.client;

import dev.logan.beyond.BeyondMinecraft;
import dev.logan.beyond.client.render.CosmicRenderer;
import dev.logan.beyond.client.render.TitanWorld;
import dev.logan.beyond.content.BeyondContent;
import dev.logan.beyond.content.BeyondEntities;
import dev.logan.beyond.entity.RealmCritter;
import dev.logan.beyond.math.ScaleLadder;
import dev.logan.beyond.server.Anomaly;
import dev.logan.beyond.server.Journey;
import dev.logan.beyond.server.RealityManager;
import dev.logan.beyond.server.SkyWells;
import dev.logan.beyond.server.Tunnels;
import dev.logan.beyond.server.Umbrella;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.screen.DeathScreen;
import net.minecraft.client.gui.screen.world.BackupPromptScreen;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.client.util.ScreenshotRecorder;
import net.minecraft.block.Blocks;
import net.minecraft.entity.EquipmentSlot;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Vec3d;
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
    private static int observedStage = -99;
    private static long stageStarted;
    private static int[] occlusionReference;
    private static int[] lensingReference;
    private static int[] heightsBefore;
    private static Vec3d tunnelStart;
    private static int wormholePhase, wormholeEra, wormholeSettle, wormholeStep, titanPhase;
    private static double tunnelPeak, wormholeBaseX, wormholeBaseZ, wormholeAltitude;
    /** Columns to try for a wormhole mouth, relative to where the walker arrived. */
    private static final int[][] WORMHOLE_CANDIDATES = {{0, 0}, {16, 0}, {0, 16}, {-16, 0}, {0, -16}, {24, 24}, {-24, -24}};
    // Software-GL CI is slow: building one of Beyond's Java-generated realms can take a minute or more on
    // the runner, so the budgets are wall-clock and generous rather than tick-counted. The stall detector
    // still fails fast when a stage genuinely never completes.
    private static final int TICK_BUDGET = 30000;
    private static final long STAGE_BUDGET_MS = 240000;
    private static final long RUN_BUDGET_MS = 1500000;
    private static long runStarted;
    private ClientSmoke() {}
    public static void tick(MinecraftClient client) {
        if (!ENABLED || complete) return;
        try {
            if (observedStage != stage) {
                observedStage = stage; stageStarted = System.currentTimeMillis();
                // The run clock starts when the first real stage begins; negative stages are boot and loading.
                if (stage >= 0 && runStarted == 0) runStarted = stageStarted;
                BeyondMinecraft.LOGGER.info("BEYOND_INTEGRATION stage={} started", stage);
            }
            if (stage >= 0 && System.currentTimeMillis() - stageStarted > STAGE_BUDGET_MS)
                throw new IllegalStateException("Stage stalled: " + stage);
            if (stage >= 0 && runStarted != 0 && System.currentTimeMillis() - runStarted > RUN_BUDGET_MS)
                throw new IllegalStateException("Integration run exceeded its wall budget at stage " + stage);
            if (failure != null) throw new IllegalStateException("server-side integration assertion", failure);
            if (System.currentTimeMillis() - lastHeartbeat > 15000) {
                BeyondMinecraft.LOGGER.info("BEYOND_HEARTBEAT stage={} ticks={} frames={} screen={}", stage, bootTicks, CosmicRenderer.renderedFrames(),
                    client.currentScreen == null ? "none" : client.currentScreen.getClass().getSimpleName() + " / " + client.currentScreen.getTitle().getString());
                lastHeartbeat = System.currentTimeMillis();
            }
            if (++bootTicks > TICK_BUDGET) throw new IllegalStateException("integration smoke timed out at stage " + stage);
            if (stage == -2) {
                if (bootTicks < 120) return;
                require(CosmicRenderer.ready(), CosmicRenderer.status());
                BeyondMinecraft.LOGGER.info("BEYOND_CLIENT_SHADER_SMOKE_PASS native_glsl=true resource_reload=true");
                require(Files.isRegularFile(client.runDirectory.toPath().resolve("saves/beyond-ci/level.dat")), "missing isolated CI save");
                client.options.getViewDistance().setValue(2);
                client.options.getSimulationDistance().setValue(5);
                client.options.getMaxFps().setValue(30);
                client.options.pauseOnLostFocus = false;
                // Software-GL CI: the cheapest ray budget still exercises the whole pipeline.
                BeyondClient.CONFIG.quality = 0;
                BeyondClient.CONFIG.intensity = Math.min(BeyondClient.CONFIG.intensity, .8f);
                client.options.tutorialStep = net.minecraft.client.tutorial.TutorialStep.NONE;
                stage = -1; loadingStarted = System.currentTimeMillis();
                client.createIntegratedServerLoader().start("beyond-ci", () -> fail(client, new IllegalStateException("CI world load cancelled")));
                return;
            }
            if (stage == -1) {
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
                    server(client, p -> { Journey.of(p).travelCooldown = 0; require(RealityManager.spawn(p, Anomaly.Kind.SINGULARITY), "local singularity creation"); });
                } }
                case 2 -> { if (stageTicks > 40) {
                    capture(client, "02-singularity");
                    server(client, p -> { RealityManager.clear(p); Journey.of(p).travelCooldown = 0; require(RealityManager.spawn(p, Anomaly.Kind.MEMBRANE), "membrane creation"); });
                } }
                case 3 -> { if (stageTicks > 40) {
                    capture(client, "03-membrane");
                    server(client, p -> p.equipStack(EquipmentSlot.HEAD, new ItemStack(BeyondContent.GLASSES)));
                } }
                case 4 -> { if (stageTicks > 22) {
                    require(BeyondClient.wearingGlasses(), "glasses equipment sync");
                    capture(client, "04-reality-" + lens);
                    stageTicks = 0;
                    if (++lens >= VisualConfig.REALITIES.length) { stage++; BeyondClient.CONFIG.lens = 0; }
                    else BeyondClient.CONFIG.lens = lens;
                } }
                case 5 -> server(client, p -> {
                    RealityManager.clear(p);
                    p.getInventory().clear(); p.getInventory().setStack(0, new ItemStack(Items.DIAMOND, 7));
                    require(RealityManager.enter(p, 0), "enter first realm");
                    require(p.getInventory().getStack(0).isOf(Items.DIAMOND) && p.getInventory().getStack(0).getCount() == 7, "first realm clones inventory");
                    p.getInventory().setStack(0, new ItemStack(Items.EMERALD, 3));
                    p.teleport(p.getServerWorld(), p.getX(), p.getY() + 8, p.getZ() + 9, 180, 18);
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
                }); }
                case 9 -> { if (stageTicks > 100) server(client, p -> {
                    // Damage during a dimension teleport is intentionally ignored by vanilla until
                    // the client ACK arrives. Kill only after travel protection has expired.
                    p.changeGameMode(GameMode.SURVIVAL);
                    boolean damaged = p.damage(p.getDamageSources().genericKill(), Float.MAX_VALUE);
                    require(damaged && !p.isAlive(), "post-teleport death must actually occur");
                }); }
                case 10 -> { if (client.currentScreen instanceof DeathScreen && stageTicks > 25) {
                    client.player.requestRespawn(); client.setScreen(null); stage++; stageTicks = 0;
                } }
                case 11 -> { if (stageTicks > 45 && client.player.isAlive() && client.world.getRegistryKey().equals(World.OVERWORLD)) server(client, p -> {
                    require(p.getInventory().getStack(0).isOf(Items.DIAMOND) && p.getInventory().getStack(0).getCount() == 7, "root inventory after realm death");
                    require(RealityManager.enter(p, 0), "return to deceased realm");
                    require(p.getInventory().getStack(0).isEmpty(), "dropped realm inventory must not resurrect");
                }); }
                case 12 -> { if (stageTicks > 30 && client.world.getRegistryKey().getValue().toString().equals("beyond:realm_00")) server(client, p -> {
                    require(RealityManager.returnHome(p), "final safe return");
                    // Unlimited scale, both directions: a thousandth of a player, then 4096 players
                    // tall. Clear sky is required for a body that wide, exactly as in play — and the
                    // subject has to survive it, so the ascent is made in creative flight.
                    p.changeGameMode(GameMode.CREATIVE);
                    p.getAbilities().flying = true; p.sendAbilitiesUpdate();
                    p.setHealth(p.getMaxHealth());
                    p.teleport(p.getServerWorld(), .5, 250, .5, 180, 0);
                    p.setVelocity(Vec3d.ZERO);
                    require(RealityManager.scale(p, ScaleLadder.MIN), "micro scale 1/1024");
                    require(Math.abs(RealityManager.currentScale(p) - ScaleLadder.MIN) < 1e-9, "micro scale applied: " + RealityManager.currentScale(p));
                    require(RealityManager.scale(p, ScaleLadder.MAX), "colossal scale 4096x");
                    require(Math.abs(RealityManager.currentScale(p) - ScaleLadder.MAX) < 1e-6, "colossal scale applied: " + RealityManager.currentScale(p));
                    require(!RealityManager.scale(p, 0) && !RealityManager.scale(p, Double.NaN) && !RealityManager.scale(p, ScaleLadder.MAX * 2),
                        "scale rejects zero, NaN and out-of-range");
                    require(RealityManager.scale(p, 1), "normal scale restore");
                    BeyondMinecraft.LOGGER.info("BEYOND_SCALE_EXTREMES micro={} colossal={} restored={}", ScaleLadder.MIN, ScaleLadder.MAX, RealityManager.currentScale(p));
                }); }
                case 13 -> { if (stageTicks > 35 && client.world.getRegistryKey().equals(World.OVERWORLD)) {
                    BeyondClient.openGuide();
                    for (var child : List.copyOf(client.currentScreen.children())) if (child instanceof ButtonWidget b && b.getMessage().getString().contains("Settings")) { b.onPress(); break; }
                    stage++; stageTicks = 0;
                } }
                case 14 -> { if (stageTicks > 25) {
                    capture(client, "06-field-guide");
                    require(CosmicRenderer.ready() && CosmicRenderer.renderedFrames() > 30, "actual post-process frames");
                    client.setScreen(null);
                    ClientReality.skipIntroduction();
                    server(client, p -> {
                        var well = SkyWells.of(p.getServerWorld().getRegistryKey());
                        require(well != null, "the root reality has a persistent sky well");
                        require(well.radius >= 100, "the sky well is colossal");
                        require(well.center.y <= p.getServerWorld().getTopY() - 16, "the well is inside the build limit, so it is reachable");
                        // Stand off the horizon and look straight at it: the disk fills most of the view,
                        // so the lens has real terrain to bend.
                        require(p.isAlive(), "the sky well fixture needs a living observer");
                        p.changeGameMode(GameMode.CREATIVE);
                        p.getAbilities().flying = true; p.sendAbilitiesUpdate();
                        p.setHealth(p.getMaxHealth());
                        p.fallDistance = 0;
                        Vec3d view = well.center.add(0, 40, 236);
                        p.teleport(p.getServerWorld(), view.x, view.y, view.z, 180, 10);
                        p.setVelocity(Vec3d.ZERO);
                        Journey.of(p).travelCooldown = 0;
                    });
                } }
                case 15 -> { if (stageTicks > 40 && client.world.getRegistryKey().equals(World.OVERWORLD)) {
                    // The snapshot is sent on the server's own cadence and the packet has to survive a
                    // software-GL frame; give it a few seconds before treating a missing well as a failure.
                    if (ClientReality.nodes.stream().noneMatch(n -> n.persistent()) && stageTicks < 400) return;
                    require(ClientReality.nodes.stream().anyMatch(n -> n.persistent()), "sky well reached the client as a persistent node");
                    BeyondClient.CONFIG.enabled = false; stageTicks = 0; stage++;
                } }
                case 16 -> { if (stageTicks > 18) {
                    lensingReference = sampleWorldPixels(client);
                    BeyondClient.CONFIG.enabled = true; stage++; stageTicks = 0;
                } }
                case 17 -> { if (stageTicks > 22) {
                    int difference = difference(lensingReference, sampleWorldPixels(client));
                    require(difference > 8, "the lens must visibly change the scene: " + difference);
                    BeyondMinecraft.LOGGER.info("BEYOND_LENSING max_channel_difference={} terrain_and_sky_bent=true", difference);
                    capture(client, "08-sky-well");
                    server(client, p -> {
                        RealityManager.clear(p);
                        Journey.of(p).travelCooldown = 0;
                        // A real mob, placed in front of the camera inside the colossal well's tidal
                        // reach, so the render-side stretch has something to act on.
                        Vec3d look = p.getRotationVec(1);
                        RealmCritter critter = new RealmCritter(BeyondEntities.REALM_CRITTER, p.getServerWorld());
                        critter.setVariant(1);
                        critter.refreshPositionAndAngles(p.getX() + look.x * 5, p.getY() + look.y * 5, p.getZ() + look.z * 5, 180, 0);
                        critter.setVelocity(Vec3d.ZERO);
                        require(p.getServerWorld().spawnEntity(critter), "tidal critter fixture");
                        require(Spaghettification.forEntity(critter) != null, "the well's tidal reach covers the fixture");
                    });
                } }
                case 18 -> { if (stageTicks > 240 || (stageTicks > 30 && Spaghettification.applied > 0)) {
                    // The fixture is a real mob a few blocks in front of the camera, so the render hook
                    // fires on the first frames that draw it; wait for that rather than assuming a delay.
                    require(Spaghettification.applied > 0, "the tidal stretch must actually be applied to rendered entities");
                    require(Spaghettification.lastStretch > 1.05f, "stretch factor must be above neutral");
                    BeyondMinecraft.LOGGER.info("BEYOND_SPAGHETTIFICATION applied={} last_stretch={} noodle=true", Spaghettification.applied, Spaghettification.lastStretch);
                    capture(client, "09-spaghettification");
                    server(client, p -> {
                        RealityManager.clear(p);
                        Journey.of(p).travelCooldown = 0;
                        require(RealityManager.spawn(p, Anomaly.Kind.TEAR), "tear creation");
                    });
                } }
                case 19 -> { if (stageTicks > 40) {
                    capture(client, "10-tear");
                    server(client, p -> {
                        int hub = BeyondMinecraft.CATALOG.indexOf("realm_08");
                        require(hub >= 0, "catalog exposes the Between");
                        Journey.of(p).travelCooldown = 0;
                        require(RealityManager.enter(p, hub), "travel into the Between");
                    });
                } }
                case 20 -> { if (stageTicks > 50 && client.world.getRegistryKey().getValue().toString().equals("beyond:realm_08")) {
                    capture(client, "11-between");
                    server(client, p -> {
                        int fractal = BeyondMinecraft.CATALOG.indexOf("realm_10");
                        require(fractal >= 0, "catalog exposes the fractal hollow");
                        Journey.of(p).travelCooldown = 0;   // the previous arrival set it
                        require(RealityManager.enter(p, fractal), "travel into the fractal hollow");
                    });
                } }
                case 21 -> { if (stageTicks > 50 && client.world.getRegistryKey().getValue().toString().equals("beyond:realm_10")) {
                    capture(client, "12-fractal");
                    server(client, p -> {
                        int labyrinth = BeyondMinecraft.CATALOG.indexOf("realm_09");
                        require(labyrinth >= 0, "catalog exposes the labyrinth");
                        Journey.of(p).travelCooldown = 0;   // the previous arrival set it
                        require(RealityManager.enter(p, labyrinth), "travel into the labyrinth");
                    });
                } }
                case 22 -> { if (stageTicks > 50 && client.world.getRegistryKey().getValue().toString().equals("beyond:realm_09")) {
                    capture(client, "13-labyrinth");
                    server(client, p -> {
                        RealityManager.clear(p);
                        Journey.of(p).travelCooldown = 0;
                        // The corridor is opened from the canopy, not from inside the maze: a wormhole
                        // needs open air for its mouth, and the labyrinth is walls and ceilings to the
                        // world limit. The labyrinth is still what stage 22 photographs.
                        require(RealityManager.enter(p, 0), "leave the labyrinth for the wormhole test");
                        wormholeEra = Journey.of(p).era;
                    });
                } }
                case 23 -> {
                    // The mouth opens where the player actually stands. The arrival teleport lands a
                    // tick or two after it is issued, so the fixture waits for the canopy to be the
                    // client's world, opens, retries once aiming higher, and only then gates.
                    if (wormholePhase == 0 && stageTicks > 40 && client.world.getRegistryKey().getValue().toString().equals("beyond:realm_00")) onServer(client, p -> {
                        RealityManager.clear(p);            // clear the field where the hole opens
                        Journey.of(p).travelCooldown = 0;   // the arrival teleport set it
                        if (RealityManager.spawn(p, Anomaly.Kind.WORMHOLE)) { armWormhole(p); wormholePhase = 2; }
                        else {
                            p.teleport(p.getServerWorld(), p.getX(), p.getY(), p.getZ(), p.getYaw(), -58f);
                            p.setVelocity(Vec3d.ZERO);
                            wormholePhase = 1;
                        }
                    });
                    // A mouth needs three blocks of clear air in front of the eye, and an arrival pad, a
                    // canopy or a wall can legitimately refuse one. So the retry climbs into open sky and
                    // then walks a few candidate columns, one step at a time: a teleport only lands on a
                    // later tick, so the reposition and the attempt never share a step.
                    if (wormholePhase == 1 && stageTicks > 55 + wormholeStep * 12) onServer(client, p -> {
                        var world = p.getServerWorld();
                        if (wormholeStep == 0) {
                            wormholeBaseX = p.getX(); wormholeBaseZ = p.getZ();
                            wormholeAltitude = Math.min(world.getTopY() - 24, p.getY() + 96);
                            wormholeStep = 1;
                            return;
                        }
                        int candidate = Math.min((wormholeStep - 1) / 2, WORMHOLE_CANDIDATES.length - 1);
                        if (wormholeStep % 2 == 1) {
                            p.teleport(world, wormholeBaseX + WORMHOLE_CANDIDATES[candidate][0], wormholeAltitude,
                                wormholeBaseZ + WORMHOLE_CANDIDATES[candidate][1], p.getYaw(), 0f);
                            p.setVelocity(Vec3d.ZERO);
                            Journey.of(p).travelCooldown = 0;
                        } else {
                            Journey.of(p).travelCooldown = 0;
                            if (RealityManager.spawn(p, Anomaly.Kind.WORMHOLE)) {
                                armWormhole(p);
                                wormholePhase = 2;
                            } else if (candidate >= WORMHOLE_CANDIDATES.length - 1) {
                                require(false, "wormhole creation at " + p.getPos());
                            }
                        }
                        wormholeStep++;
                    });
                    if (wormholePhase == 2) {
                        // Sample the ride while it runs: the corridor is a flight, so the proof that it
                        // carries the walker is the farthest point it reaches, not where it happens to
                        // set them down afterwards.
                        if (stageTicks % 5 == 0) onServer(client, p -> tunnelPeak = Math.max(tunnelPeak,
                            tunnelStart == null ? 0 : p.getPos().distanceTo(tunnelStart)));
                        if (++wormholeSettle > 10) {
                            require(ClientReality.tunnelRemaining > 0, "the corridor walk reaches the client");
                            capture(client, "14-time-tunnel");
                            stage++; stageTicks = 0;
                        }
                    }
                }
                case 24 -> { if (stageTicks > 20 && ClientReality.tunnelRemaining == 0) server(client, p -> {
                        require(!Tunnels.active(p), "corridor torn down after the walk");
                        require(Journey.of(p).era >= 1, "the branch shifted");
                        require(Tunnels.placedBlocks() == 0, "the corridor must build nothing at all");
                        double travelled = tunnelStart == null ? 0 : p.getPos().distanceTo(tunnelStart);
                        BeyondMinecraft.LOGGER.info("BEYOND_TUNNEL_RIDE peak={} end_of_ride={}", tunnelPeak, travelled);
                        require(tunnelPeak > 12, "the corridor must actually carry the walker: peak=" + tunnelPeak + " end=" + travelled);
                        int barriers = 0;
                        for (int x = -3; x <= 3; x++) for (int y = -2; y <= 5; y++) for (int z = -3; z <= 3; z++)
                            if (p.getServerWorld().getBlockState(p.getBlockPos().add(x, y, z)).isOf(Blocks.BARRIER)) barriers++;
                        require(barriers == 0, "no barrier blocks may be left behind");
                    });
                }
                case 25 -> { if (stageTicks > 45) server(client, p -> {
                    // The Umbrella Effect: coming back through rewrites the branch around you. A corridor
                    // ride ends in the reality it departed from, so this stage follows the walker there
                    // instead of assuming the Overworld, and drops them to a clean altitude to measure.
                    BeyondMinecraft.LOGGER.info("BEYOND_UMBRELLA world={} era={}",
                        p.getServerWorld().getRegistryKey().getValue(), Journey.of(p).era);
                    p.teleport(p.getServerWorld(), .5, 120, .5, 180, 0);
                    p.setVelocity(Vec3d.ZERO);
                    heightsBefore = columnHeights(p, 6);
                    require(Journey.of(p).era >= 1, "the branch already shifted in the tunnel");
                    Umbrella.queue(p.getServerWorld(), p.getBlockPos(), 6, Umbrella.Era.GIANT_WOOD, Journey.of(p).eraSeed);
                    BeyondMinecraft.LOGGER.info("BEYOND_UMBRELLA queued era={} columns={}", Umbrella.Era.GIANT_WOOD, heightsBefore.length);
                }); }
                case 26 -> server(client, p -> {
                    int[] after = columnHeights(p, 6);
                    int changed = 0;
                    for (int i = 0; i < after.length; i++) if (after[i] != heightsBefore[i]) changed++;
                    require(changed > 0, "the Umbrella Effect must actually rewrite the world");
                    require(Umbrella.Era.of(Journey.of(p).era) != Umbrella.Era.PRISTINE, "the era table advanced");
                    BeyondMinecraft.LOGGER.info("BEYOND_UMBRELLA_PASS era={} era_name={} columns_changed={} of={}", Journey.of(p).era,
                        Umbrella.Era.of(Journey.of(p).era).description, changed, after.length);
                    // CI fixture only: a real opaque wall between player and singularity.
                    p.teleport(p.getServerWorld(), .5, 120, .5, 180, 0);
                    p.setVelocity(Vec3d.ZERO);
                    Journey.of(p).travelCooldown = 0;
                    for (int x = -6; x <= 6; x++) for (int y = 116; y <= 129; y++)
                        p.getServerWorld().setBlockState(new BlockPos(x, y, -3), Blocks.WHITE_CONCRETE.getDefaultState());
                    require(RealityManager.spawn(p, Anomaly.Kind.SINGULARITY), "occluded singularity fixture");
                });
                case 27 -> { if (stageTicks > 50) { BeyondClient.CONFIG.enabled = false; stage++; stageTicks = 0; } }
                case 28 -> { if (stageTicks > 15) {
                    occlusionReference = sampleWorldPixels(client); BeyondClient.CONFIG.enabled = true; stage++; stageTicks = 0;
                } }
                case 29 -> { if (stageTicks > 15) {
                    int difference = difference(occlusionReference, sampleWorldPixels(client));
                    require(CosmicRenderer.ready(), CosmicRenderer.status());
                    require(difference <= 3, "native foreground occlusion drift: " + difference);
                    BeyondMinecraft.LOGGER.info("BEYOND_NATIVE_OCCLUSION max_channel_difference={}", difference);
                    capture(client, "15-native-depth-occlusion");
                    BeyondMinecraft.LOGGER.info("BEYOND_NATIVE_OCCLUSION_PASS max_channel_difference={}", difference);
                    stage++; stageTicks = 0;
                } }
                case 30 -> {
                    // The colossus is cut from the root reality's own terrain, so the walker first has
                    // to be home — and enough of home has to be streamed in for the search for standing
                    // ground to see anything. CI runs at render distance two, which reaches 32 blocks of
                    // a search that starts at 64, so the fixture widens the window before it looks.
                    if (titanPhase == 0 && stageTicks > 20) {
                        int window = 12;
                        client.options.getViewDistance().setValue(window);
                        client.options.getSimulationDistance().setValue(window);
                        BeyondMinecraft.LOGGER.info("BEYOND_TITAN_SEARCH view_distance={} home_first=true", window);
                        onServer(client, p -> {
                            client.getServer().getPlayerManager().setViewDistance(window);
                            client.getServer().getPlayerManager().setSimulationDistance(window);
                            if (Journey.inRealm(p.getWorld().getRegistryKey()))
                                require(RealityManager.returnHome(p), "return to the root reality for the colossus");
                            titanPhase = 1;
                        });
                    }
                    if (titanPhase == 1 && client.world.getRegistryKey().equals(World.OVERWORLD)) {
                        Vec3d place = TitanWorld.standingPlace();
                        if (place == null) {
                            // The colossus looks for ground on its own schedule; give it a few attempts,
                            // then say exactly what it saw rather than timing out facelessly.
                            require(stageTicks < 400, "the colossus found no standing ground in the root reality: " + TitanWorld.status());
                        } else {
                            // The colossus portrait: stand off from it and look up. This is the shot that
                            // proves the Titan is the world's own blocks standing in the world.
                            double angle = .74, distance = 150;
                            double x = place.x + Math.cos(angle) * distance, z = place.z + Math.sin(angle) * distance;
                            float yaw = (float) Math.toDegrees(Math.atan2(Math.cos(angle), -Math.sin(angle)));
                            onServer(client, p -> {
                                p.teleport(p.getServerWorld(), x, place.y + 26, z, yaw, -8f);
                                p.setVelocity(Vec3d.ZERO);
                                BeyondMinecraft.LOGGER.info("BEYOND_TITAN_VIEW anchor={} viewer={}", place, p.getPos());
                            });
                            titanPhase = 2; stage++; stageTicks = 0;
                        }
                    }
                }
                case 31 -> { if (TitanWorld.drawn() || stageTicks > 420) {
                    require(TitanWorld.drawn(), "the colossus is drawn as world geometry, not a painted shape: " + TitanWorld.status());
                    capture(client, "16-titan");
                    BeyondMinecraft.LOGGER.info("BEYOND_CLIENT_INTEGRATION_PASS frames={} world_travel=true inventory_round_trip=true player_nbt=true death_restore=true "
                        + "scale_extremes=true sky_well=true lensing=true spaghettification=true tear=true fractal=true labyrinth=true wormhole_corridor=true umbrella=true "
                        + "titan=true realities={} screenshots=true",
                        CosmicRenderer.renderedFrames(), VisualConfig.REALITIES.length);
                    complete = true; client.scheduleStop();
                } }
                default -> { }
            }
        } catch (Throwable error) { fail(client, error); }
    }
    /** Topmost non-air height of a coarse grid of columns; used to prove the world really changed. */
    private static int[] columnHeights(ServerPlayerEntity player, int radius) {
        var world = player.getServerWorld();
        var origin = player.getBlockPos();
        int step = Math.max(1, radius / 3);
        int side = (radius / step) * 2 + 1;
        int[] heights = new int[side * side];
        int index = 0;
        for (int dx = -radius; dx <= radius; dx += step) {
            for (int dz = -radius; dz <= radius; dz += step) {
                int height = world.getBottomY();
                for (int y = world.getTopY() - 2; y > world.getBottomY(); y--) {
                    var pos = new BlockPos(origin.getX() + dx, y, origin.getZ() + dz);
                    if (!world.getBlockState(pos).isAir()) { height = y; break; }
                }
                heights[index++] = height;
            }
        }
        return heights;
    }

    private static int difference(int[] first, int[] second) {
        int difference = 0;
        for (int i = 0; i < Math.min(first.length, second.length); i++)
            for (int bit = 0; bit < 24; bit += 8)
                difference = Math.max(difference, Math.abs(((first[i] >> bit) & 255) - ((second[i] >> bit) & 255)));
        return difference;
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
    /**
     * Runs one task on the integrated server *without* moving the stage. {@link #server} is a
     * one-shot: it advances to the next stage when the action returns. A fixture that needs several
     * server steps inside one stage — open, retry, sample — has to use this one instead, or the
     * stage slips out from under it before the second step ever runs.
     */
    private static void onServer(MinecraftClient client, Consumer<ServerPlayerEntity> action) {
        pending = true;
        var server = client.getServer(); var uuid = client.player.getUuid();
        server.execute(() -> {
            try {
                var player = server.getPlayerManager().getPlayer(uuid);
                require(player != null, "integrated player missing");
                action.accept(player);
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
    private static int[] sampleWorldPixels(MinecraftClient client) {
        int[] samples = new int[20]; int i = 0;
        try (var image = ScreenshotRecorder.takeScreenshot(client.getFramebuffer())) {
            // No HUD, crosshair, held item, tutorial or actionbar pixels are included.
            for (int row = 0; row < 4; row++) for (int col = 0; col < 5; col++)
                samples[i++] = image.getColor((int) (image.getWidth() * (.18 + col * .055)), (int) (image.getHeight() * (.22 + row * .075)));
        }
        return samples;
    }
    private static void require(boolean value, String message) { if (!value) throw new AssertionError(message); }

    /** Walk into the opening the fixture just made: same era, real flight, nothing built. */
    private static void armWormhole(net.minecraft.server.network.ServerPlayerEntity p) {
        require(Journey.of(p).era == wormholeEra, "plain travel does not shift the branch");
        tunnelStart = p.getPos();
        tunnelPeak = 0;
        require(Tunnels.begin(p, p.getServerWorld()), "wormhole corridor opens");
        require(Tunnels.active(p), "corridor is armed");
        BeyondMinecraft.LOGGER.info("BEYOND_WORMHOLE_PASS world={} mouth_from={}", p.getServerWorld().getRegistryKey().getValue(), p.getPos());
    }
    private static void fail(MinecraftClient client, Throwable error) {
        complete = true; BeyondMinecraft.LOGGER.error("BEYOND_CLIENT_INTEGRATION_FAIL stage=" + stage, error); client.scheduleStop();
    }
}
