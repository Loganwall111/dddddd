package dev.logan.entersift.client;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Properties;

/**
 * 0.16 terrain-stretching fix + render safety switches.
 *
 * Symptom (reported since ~0.13): while turning, Overworld terrain, leaves and water smear into long
 * streaks toward one direction, fragments float near cloud height and the held hand becomes a black
 * polygon. That is what triangles look like when vertices are joined through the WRONG index buffer.
 *
 * All Sift pipelines draw QUADS, which use the game's shared sequential quad index buffer. The 0.13
 * Overworld clouds could emit ~150 000 vertices in one batch; above 65 536 vertices that shared
 * buffer is regrown with 32-bit indices, and Sodium / Iris / some drivers that bound or cached the
 * 16-bit version keep drawing terrain with it. Every Sift batch is now kept under
 * {@link #MAX_VERTICES} per render type per frame, always dropping WHOLE quads so the stream stays
 * aligned, and the clouds were made far cheaper (bigger cells, shorter range).
 *
 * The switches in {@code config/entersift-client.properties} allow bisecting any remaining issue:
 *   overworld_clouds = true   Dungeons-style voxel clouds in the Overworld (false = vanilla clouds)
 *   rift_effects     = true   bloom / spill / sparkles around rifts (false = interior and walls only)
 *   transition_hud   = true   the chromatic + orange-flash rift transition overlay
 */
public final class SiftBudget {
    private SiftBudget() {}

    /** Well below 65 536, a multiple of 4. */
    public static final int MAX_VERTICES = 48_000;

    private static final java.util.IdentityHashMap<Object, int[]> used = new java.util.IdentityHashMap<>();

    /** Called once per frame (start of submit collection). */
    public static void reset() { used.clear(); }

    /**
     * Reserves one vertex in the batch written through {@code vc} (one buffer = one draw). Every Sift
     * emitter writes quads (4 vertices) and the limit is a multiple of 4, so once the limit is reached
     * all further vertices are dropped and the stream never contains half a quad.
     */
    public static boolean take(Object vc) {
        int[] n = used.computeIfAbsent(vc, k -> new int[1]);
        if (n[0] >= MAX_VERTICES) return false;
        n[0]++;
        return true;
    }

    // ------------------------------------------------------------------ config

    public static boolean overworldClouds = true, riftEffects = true, transitionHud = true, riftShader = true, auraGlow = true;

    public static boolean riftRefraction = true, riftBloom = true, riftFlares = true, riftSpill = true, riftBackFade = true, riftBolts = true, riftShock = true, riftBoxFace = true;

    public static void load(Path configDir) {
        Path file = configDir.resolve("entersift-client.properties");
        Properties props = new Properties();
        if (Files.isRegularFile(file)) {
            try (InputStream in = Files.newInputStream(file)) { props.load(in); }
            catch (IOException error) { org.slf4j.LoggerFactory.getLogger("entersift").warn("[Sift] could not read {}", file, error); }
        }
        overworldClouds = flag(props, "overworld_clouds", true);
        riftEffects = flag(props, "rift_effects", true);
        transitionHud = flag(props, "transition_hud", true);
        riftShader = flag(props, "rift_shader", true);   // 0.17 GPU rift interior (core shader)
        riftRefraction = flag(props, "rift_refraction", true);
        riftBloom = flag(props, "rift_glow", true);
        riftFlares = flag(props, "enable_flares", true);
        riftSpill = flag(props, "rift_spill", true);
        riftBackFade = flag(props, "rift_back_fade", true);
        riftBolts = flag(props, "rift_bolts", true);
        riftShock = flag(props, "rift_shockwave", true);
        riftBoxFace = flag(props, "rift_box_face", true); // 0.29: frosted stepped box, one clear square window
        props.setProperty("rift_refraction", Boolean.toString(riftRefraction));
        props.setProperty("rift_glow", Boolean.toString(riftBloom));
        props.setProperty("enable_flares", Boolean.toString(riftFlares));
        props.setProperty("rift_spill", Boolean.toString(riftSpill));
        props.setProperty("rift_back_fade", Boolean.toString(riftBackFade));
        props.setProperty("rift_bolts", Boolean.toString(riftBolts));
        props.setProperty("rift_shockwave", Boolean.toString(riftShock));
        props.setProperty("rift_box_face", Boolean.toString(riftBoxFace));
        auraGlow = flag(props, "aura_glow", true);       // 0.17 night aura columns + note-block columns
        props.setProperty("overworld_clouds", Boolean.toString(overworldClouds));
        props.setProperty("rift_effects", Boolean.toString(riftEffects));
        props.setProperty("transition_hud", Boolean.toString(transitionHud));
        props.setProperty("rift_shader", Boolean.toString(riftShader));
        props.setProperty("aura_glow", Boolean.toString(auraGlow));
        try {
            Files.createDirectories(configDir);
            try (OutputStream out = Files.newOutputStream(file)) {
                props.store(out, "Enter the Sift client rendering switches (0.18). Set to false to disable a pass.");
            }
        } catch (IOException error) {
            org.slf4j.LoggerFactory.getLogger("entersift").warn("[Sift] could not write {}", file, error);
        }
        org.slf4j.LoggerFactory.getLogger("entersift").info("[Sift] render switches: overworld_clouds={} rift_effects={} transition_hud={} rift_shader={} aura_glow={}",
            overworldClouds, riftEffects, transitionHud, riftShader, auraGlow);
    }

    private static boolean flag(Properties props, String key, boolean fallback) {
        String v = props.getProperty(key);
        return v == null ? fallback : !v.trim().equalsIgnoreCase("false");
    }
}
