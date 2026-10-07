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
    public int maxAnomaliesPerPlayer = 2;
    public int lifetimeSeconds = 50;
    public double gravityStrength = 4.0;
    public double gravityRadius = 24.0;
    public double maximumSpeed = .85;
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
        result.maxAnomaliesPerPlayer = Math.clamp(result.maxAnomaliesPerPlayer, 1, 3);
        result.lifetimeSeconds = Math.clamp(result.lifetimeSeconds, 10, 120);
        result.gravityStrength = bounded(result.gravityStrength, .5, 8, 4);
        result.gravityRadius = bounded(result.gravityRadius, 8, 32, 24);
        result.maximumSpeed = bounded(result.maximumSpeed, .15, 1.1, .85);
        return result;
    }
    private static double bounded(double v, double low, double high, double fallback) {
        return Double.isFinite(v) ? Math.clamp(v, low, high) : fallback;
    }
}
