package dev.logan.beyond.client;

import com.google.gson.GsonBuilder;
import dev.logan.beyond.BeyondMinecraft;
import net.fabricmc.loader.api.FabricLoader;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;

public final class VisualConfig {
    public boolean enabled = true;
    public boolean cosmicSky = true;
    public boolean introduction = true;
    public boolean reducedMotion = false;
    public float intensity = .88f;
    public int quality = 1;
    public int lens = 0;
    public static final String[] LENSES = {"Lucid", "Aurora", "Prismatic", "Negative Space", "Living Membrane", "Echo Memory"};
    public int raySteps() { return new int[]{32, 48, 72}[Math.clamp(quality, 0, 2)]; }
    public void normalize() {
        quality = Math.clamp(quality, 0, 2); lens = Math.floorMod(lens, LENSES.length);
        intensity = Float.isFinite(intensity) ? Math.clamp(intensity, 0, 1) : .88f;
    }
    public static VisualConfig load() {
        var path = FabricLoader.getInstance().getConfigDir().resolve("beyond-visuals.json");
        try {
            if (Files.exists(path)) {
                VisualConfig c = new GsonBuilder().create().fromJson(Files.readString(path), VisualConfig.class);
                if (c != null) { c.normalize(); return c; }
            }
        } catch (Exception e) { BeyondMinecraft.LOGGER.warn("Beyond visual config unreadable; safe defaults selected", e); }
        return new VisualConfig();
    }
    public void save() {
        normalize();
        var path = FabricLoader.getInstance().getConfigDir().resolve("beyond-visuals.json");
        var temporary = path.resolveSibling(path.getFileName() + ".tmp");
        try {
            Files.createDirectories(path.getParent());
            Files.writeString(temporary, new GsonBuilder().setPrettyPrinting().create().toJson(this));
            try { Files.move(temporary, path, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE); }
            catch (java.nio.file.AtomicMoveNotSupportedException e) { Files.move(temporary, path, StandardCopyOption.REPLACE_EXISTING); }
        } catch (Exception e) { BeyondMinecraft.LOGGER.warn("Unable to save Beyond visual settings", e); }
    }
}
