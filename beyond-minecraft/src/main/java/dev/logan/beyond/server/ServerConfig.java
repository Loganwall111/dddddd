package dev.logan.beyond.server;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import dev.logan.beyond.BeyondMinecraft;
import net.fabricmc.loader.api.FabricLoader;
import java.nio.file.Files;

/** Server-authoritative safety budgets. Client settings can never increase these. */
public final class ServerConfig {
    public boolean firstJoinEncounter = true;
    public boolean realmInventories = true;
    public boolean pullMobs = true;
    public int maxAnomaliesPerWorld = 12;
    public int maxAnomaliesPerPlayer = 3;
    public int lifetimeSeconds = 50;
    public double gravityStrength = 4.0;
    public double gravityRadius = 24.0;
    public double maximumSpeed = .85;
    /** Persistent colossal wells above each root-reality spawn, reachable by flying. */
    public boolean skyWells = true;
    public boolean skyWellsInRealms = false;
    public boolean primePullsPlayers = true;
    public double maxNodeRadius = 460;
    /** The tornado: real blocks and trees are torn loose inside a singularity's reach. */
    public boolean tornadoBlocks = true;
    public int tornadoBlocksPerTick = 6;
    public int tornadoBlockBudget = 900;
    public int tornadoRadiusBlocks = 26;
    /** Entities stretch into noodles before they are lost. */
    public boolean spaghettification = true;
    /** Wormholes displace you through a bounded barrier corridor before the branch breaks. */
    public boolean wormholeTunnels = true;
    public int tunnelTicks = 130;
    /** Returning from another branch of reality rewrites the ground you left behind. */
    public boolean umbrellaEffect = true;
    public int umbrellaRadius = 22;
    public int umbrellaBudget = 9000;
    public static ServerConfig load() {
        var file = FabricLoader.getInstance().getConfigDir().resolve("beyond-server.json");
        Gson gson = new GsonBuilder().setPrettyPrinting().create();
        ServerConfig result = new ServerConfig();
        try {
            if (Files.exists(file)) {
                ServerConfig loaded = gson.fromJson(Files.readString(file), ServerConfig.class);
                if (loaded != null) result = loaded;
            } else {
                Files.createDirectories(file.getParent());
                Files.writeString(file, gson.toJson(result));
            }
        } catch (Exception error) { BeyondMinecraft.LOGGER.warn("Cannot read Beyond server config; using safe defaults", error); }
        result.maxAnomaliesPerWorld = Math.clamp(result.maxAnomaliesPerWorld, 1, 24);
        result.maxAnomaliesPerPlayer = Math.clamp(result.maxAnomaliesPerPlayer, 1, 4);
        result.lifetimeSeconds = Math.clamp(result.lifetimeSeconds, 10, 120);
        result.gravityStrength = bounded(result.gravityStrength, .5, 8, 4);
        result.gravityRadius = bounded(result.gravityRadius, 8, 32, 24);
        result.maximumSpeed = bounded(result.maximumSpeed, .15, 1.1, .85);
        result.maxNodeRadius = bounded(result.maxNodeRadius, 8, 512, 460);
        result.tornadoBlocksPerTick = Math.clamp(result.tornadoBlocksPerTick, 0, 24);
        result.tornadoBlockBudget = Math.clamp(result.tornadoBlockBudget, 0, 4000);
        result.tornadoRadiusBlocks = Math.clamp(result.tornadoRadiusBlocks, 4, 48);
        result.tunnelTicks = Math.clamp(result.tunnelTicks, 20, 400);
        result.umbrellaRadius = Math.clamp(result.umbrellaRadius, 8, 40);
        result.umbrellaBudget = Math.clamp(result.umbrellaBudget, 500, 24000);
        return result;
    }
    private static double bounded(double v, double low, double high, double fallback) {
        return Double.isFinite(v) ? Math.clamp(v, low, high) : fallback;
    }
}
