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
    public boolean seamlessTravel = true;
    public boolean ambience = true;
    public boolean spaghettification = true;
    public boolean nebula = true;
    /** The Overworld colossus: the sky figure is filled with the live world instead of a colour. */
    public boolean titanSky = true;
    public float intensity = .88f;
    public int quality = 1;
    /** Index into {@link #REALITIES}: the whole screen is re-authored by the post-processor. */
    public int lens = 0;
    /**
     * The realities the glasses cycle through. Each one is a complete screen treatment, not a tint:
     * a stylized city, the Backrooms, the Poolrooms, a cel-shaded animation look, an eighties CRT,
     * a psychedelic fold, wet neon hyperreality and so on. Names are what the HUD reports.
     */
    public static final String[] REALITIES = {
        "Lucid", "Aurora", "Prismatic", "Negative Space", "Living Membrane", "Echo Memory",
        "Neon City", "Backrooms", "Poolrooms", "Cel Animation", "Eighties CRT", "Chromatic Fold",
        "Monolith City", "Deep Void", "Solar Bloom", "Interference",
        "Photoreal", "Shaded Grid", "Ultra-Vivid", "Between Space",
    };
    /** @deprecated kept for the field guide and older configs; use REALITIES. */
    public static final String[] LENSES = REALITIES;
    public int raySteps() { return new int[]{32, 48, 72}[Math.clamp(quality, 0, 2)]; }
    public void normalize() {
        quality = Math.clamp(quality, 0, 2); lens = Math.floorMod(lens, REALITIES.length);
        intensity = Float.isFinite(intensity) ? Math.clamp(intensity, 0, 1) : .88f;
    }
    public String reality() { return REALITIES[Math.floorMod(lens, REALITIES.length)]; }
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
