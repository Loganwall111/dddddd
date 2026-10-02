package dev.logan.riftext.client;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import com.mojang.blaze3d.vertex.VertexConsumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Per-frame vertex budget and render switches. Prevents the rift from overloading the GPU when
 * terrain is far or the view is wide. Copied from the main SIFT mod for standalone operation.
 */
public final class SiftBudget {
    private static final Logger LOGGER = LoggerFactory.getLogger("riftextension");
    private static int frameVertices;
    private static final int MAX_VERTICES = 500_000;

    /** Whether the GPU rift shader (RIFT/RIFT_WALL/RIFT_GLOW pipelines) is available. */
    public static boolean riftShader = true;
    /** Whether to draw energy cubes, floating cubes, lightning, sparkles. */
    public static boolean riftEffects = true;
    /** Whether night-time aura glow (neon curtains) is drawn. */
    public static boolean auraGlow = true;

    public static void load(Path configDir) {
        // Load switches from config if a file exists; otherwise use defaults.
        try {
            Path file = configDir.resolve("riftextension.properties");
            if (Files.exists(file)) {
                for (String line : Files.readAllLines(file)) {
                    line = line.trim();
                    if (line.startsWith("#") || line.isEmpty()) continue;
                    String[] kv = line.split("=", 2);
                    if (kv.length != 2) continue;
                    String key = kv[0].trim(), val = kv[1].trim();
                    switch (key) {
                        case "rift_shader" -> riftShader = Boolean.parseBoolean(val);
                        case "rift_effects" -> riftEffects = Boolean.parseBoolean(val);
                        case "aura_glow" -> auraGlow = Boolean.parseBoolean(val);
                    }
                }
                LOGGER.info("[RiftExt] config loaded: shader={}, effects={}, aura={}", riftShader, riftEffects, auraGlow);
            }
        } catch (IOException e) {
            LOGGER.warn("[RiftExt] could not read config", e);
        }
    }

    /** Called once per frame to reset the vertex counter. */
    public static void reset() { frameVertices = 0; }

    /** Returns true and increments the counter if the budget is not exceeded. */
    public static boolean take(VertexConsumer vc) {
        if (frameVertices >= MAX_VERTICES) return false;
        frameVertices++;
        return true;
    }
}