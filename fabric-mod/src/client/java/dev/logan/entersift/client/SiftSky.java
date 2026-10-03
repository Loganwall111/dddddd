package dev.logan.entersift.client;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.logan.entersift.SiftContent;
import dev.logan.entersift.SiftTimeState;
import java.awt.image.BufferedImage;
import java.io.InputStream;
import java.util.Set;
import javax.imageio.ImageIO;
import net.fabricmc.fabric.api.client.rendering.v1.level.LevelRenderContext;
import net.fabricmc.fabric.api.client.rendering.v1.level.LevelRenderEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.Identifier;
import net.minecraft.world.phys.Vec3;
import org.joml.Matrix4f;

/**
 * Native Java Sift Sky Dome renderer.
 *
 * <p>Implements the complete Sift Sky Dome &amp; Giant Sky Rift atmospheric stack:
 * <ul>
 *   <li>Layer 0: Background sky dome with supplied panoramic PNGs ({@code sift_flow_sky.png}
 *       for {@code FLOW}, {@code sift_thrive_sky.png} for {@code THRIVE}) and procedural
 *       lava-lamp / lymph-field atmosphere ({@code LYMPH}).</li>
 *   <li>Layer 1: Distant atmospheric fade &amp; upper-dome subtle rainbow dispersion.</li>
 *   <li>Layer 2: Soft luminous shapes, wavy dark charcoal "soul face" bands, and
 *       Rift back-distortion depth field.</li>
 *   <li>Layer 3–6: Giant vertically-dominant organic Sky Rift aperture, wavy dark outer
 *       bands, colored interior energy (cyan, turquoise, pastel green, pink/magenta,
 *       soft yellow, violet), and inner core luminance.</li>
 *   <li>Layer 7: 18 deterministic, soft-edged, semi-translucent floating light squares
 *       drifting in depth around and through the Rift.</li>
 *   <li>Layer 8–9: Accumulated soft volumetric god-ray light shafts (extremely strong
 *       in {@code THRIVE}) and soft bloom composite.</li>
 * </ul>
 */
public final class SiftSky {
    private SiftSky() {}

    private static final float RADIUS = 96f;
    private static final int AZ_STEPS = 48;
    private static final int EL_STEPS = 20;
    private static final float CURTAIN_ALPHA = 0.18f;

    // Stage ticks must match timeline/sift_cycle.json keyframes (contract checked by test_data.py).
    static final int[] STAGE_TICKS = {0, 3500, 5000, 8500, 11000, 14500, 16500, 22500};

    private static final float[][] HORIZON = {
        rgb(0x7FD3CF), // DAY: soft aqua-teal
        rgb(0xC86A92), // NOON: warm rose-magenta
        rgb(0xDB7840), // EVENING: amber-gold
        rgb(0x8FC2C4)  // NIGHT: cool mist-teal
    };
    private static final float[][] MID_DOME = {
        rgb(0x2E9AA6),
        rgb(0x3DB8B0),
        rgb(0x6E3B7B),
        rgb(0x1E1545)
    };
    private static final float[][] ZENITH = {
        rgb(0x9AEBE3),
        rgb(0xBCE3C8),
        rgb(0x3B2358),
        rgb(0x0D0822)
    };

    // Biome-specific palette overrides (0.21 contract)
    private static final float[] ELECTRIC_CYAN = rgb(0x3EF3F3);
    private static final float[] BASIN_MAGENTA = rgb(0xE056B5);
    private static final float[] MEADOW_TEAL = rgb(0x8FC2C4);

    private static final Set<String> SWIRL_BIOMES = Set.of(
        "coral_expanse", "tidepool_reef", "singer_meadow", "soul_valley"
    );
    private static final Set<String> CANYON_BIOMES = Set.of(
        "rose_spires", "titan_crags"
    );

    // Multi-colored volumetric god rays (contract hues checked by test_data.py)
    private static final int[] RAY_HEX = {
        0xFF6B7A, 0xFFA54F, 0x8CFF9E, 0x6FF2E6, 0xFF7AD9,
        0x5CE6FF, 0x7FFFD4, 0xFF8AE2, 0x9AE8FF, 0xFFE28A
    };
    private static final float[][] RAYS = new float[RAY_HEX.length][];
    static {
        for (int i = 0; i < RAY_HEX.length; i++) RAYS[i] = rgb(RAY_HEX[i]);
    }

    // Equirectangular panoramic sky textures (loaded from assets/entersift/textures/sky/)
    private static final int PANO_W = 256;
    private static final int PANO_H = 128;
    private static final int[] FLOW_PANO = loadPanorama("/assets/entersift/textures/sky/sift_flow_sky.png", false);
    private static final int[] THRIVE_PANO = loadPanorama("/assets/entersift/textures/sky/sift_thrive_sky.png", true);

    private static float biomeSwirlMix = 0f;
    private static float biomeCanyonMix = 0f;

    public static void register() {
        LevelRenderEvents.COLLECT_SUBMITS.register(SiftSky::render);
    }

    private static void render(LevelRenderContext ctx) {
        Minecraft mc = Minecraft.getInstance();
        if (mc.level == null || mc.player == null) return;
        Identifier dim = mc.level.dimension().identifier();
        if (!dim.toString().startsWith("entersift:")) return;
        if (!dim.equals(SiftContent.id("the_sift"))) return;

        float pt = mc.getDeltaTracker().getGameTimeDeltaPartialTick(false);
        // Sift time state is completely independent from Overworld day/night cycle.
        float clock = SiftTimeState.getIndependentClockFloat(pt);
        float timeSec = SiftTimeState.animationSeconds(pt);
        SiftTimeState.Parameters params = SiftTimeState.currentParameters();
        if (!Float.isFinite(clock) || !Float.isFinite(timeSec)) return;

        updateMode(mc);
        float[] weights = stageWeights(clock);

        PoseStack pose = ctx.poseStack();
        pose.pushPose();
        try {
            // Layer 0 & 1: Opaque background sky dome with panoramic PNG overlay + atmospheric fade
            ctx.submitNodeCollector().submitCustomGeometry(pose, SiftRenderTypes.SKY, (p, vc) -> {
                for (int ei = 0; ei < EL_STEPS; ei++) {
                    float v0 = (float) ei / EL_STEPS;
                    float v1 = (float) (ei + 1) / EL_STEPS;
                    float el0 = (float) ((v0 * 0.62f - 0.12f) * Math.PI);
                    float el1 = (float) ((v1 * 0.62f - 0.12f) * Math.PI);
                    float y0 = (float) Math.sin(el0), r0 = (float) Math.cos(el0);
                    float y1 = (float) Math.sin(el1), r1 = (float) Math.cos(el1);
                    for (int ai = 0; ai < AZ_STEPS; ai++) {
                        if (!SiftBudget.take(vc)) return;
                        float a0 = (float) (ai * 2.0 * Math.PI / AZ_STEPS);
                        float a1 = (float) ((ai + 1) * 2.0 * Math.PI / AZ_STEPS);
                        float x00 = (float) Math.cos(a0) * r0, z00 = (float) Math.sin(a0) * r0;
                        float x10 = (float) Math.cos(a1) * r0, z10 = (float) Math.sin(a1) * r0;
                        float x11 = (float) Math.cos(a1) * r1, z11 = (float) Math.sin(a1) * r1;
                        float x01 = (float) Math.cos(a0) * r1, z01 = (float) Math.sin(a0) * r1;
                        domeVertex(p, vc, x00, y0, z00, timeSec, weights, params);
                        domeVertex(p, vc, x10, y0, z10, timeSec, weights, params);
                        domeVertex(p, vc, x11, y1, z11, timeSec, weights, params);
                        domeVertex(p, vc, x01, y1, z01, timeSec, weights, params);
                    }
                }
            });

            // Layer 2–4: Alpha-blended atmospheric dome overlays, wavy dark "soul face" bands,
            // Rift back distortion depth field, and Giant Sky Rift outer bands / aperture
            ctx.submitNodeCollector().submitCustomGeometry(pose, SiftRenderTypes.SKY_BLEND, (p, vc) -> {
                softPanels(p, vc, timeSec, weights, params);
                if (biomeSwirlMix > 0.01f || params.lavaLampWeight() > 0.05f) {
                    swirlBlobs(p, vc, timeSec, weights, Math.max(biomeSwirlMix, params.lavaLampWeight() * 0.75f));
                }
                wavySoulBands(p, vc, timeSec, params);
                skyRiftBackDistortion(p, vc, timeSec, params);
                skyRiftOuterBands(p, vc, timeSec, params);
            });

            // Layer 5–9: Additive Giant Sky Rift interior energy, inner glow, floating light squares,
            // aurora curtains, volumetric god-ray light shafts (intense in THRIVE), and bloom
            Vec3 cam = ctx.gameRenderer().getMainCamera().position();
            ctx.submitNodeCollector().submitCustomGeometry(pose, SiftRenderTypes.GLOW, (p, vc) -> {
                auroraCurtains(p, vc, timeSec, weights, params);
                skyRiftApertureAndEnergy(p, vc, timeSec, params);
                skyRays(p, vc, timeSec, weights, params);
                skyRiftFloatingSquares(p, vc, timeSec, params);
                worldBeams(p, vc, cam, timeSec, weights);
            });
        } finally {
            pose.popPose();
        }
    }

    private static void updateMode(Minecraft mc) {
        if (mc.level == null || mc.player == null) return;
        BlockPos pos = mc.player.blockPosition();
        String path = mc.level.getBiome(pos).unwrapKey()
            .map(k -> k.identifier().getPath())
            .orElse("");
        float targetSwirl = SWIRL_BIOMES.contains(path) ? 1f : 0f;
        float targetCanyon = CANYON_BIOMES.contains(path) ? 1f : 0f;
        biomeSwirlMix += (targetSwirl - biomeSwirlMix) * 0.05f;
        biomeCanyonMix += (targetCanyon - biomeCanyonMix) * 0.05f;
    }

    static float[] stageWeights(float clock) {
        float[] w = new float[4];
        float c = ((clock % 24000f) + 24000f) % 24000f;
        int n = STAGE_TICKS.length;
        for (int i = 0; i < n; i++) {
            int next = (i + 1) % n;
            float t0 = STAGE_TICKS[i];
            float t1 = STAGE_TICKS[next];
            float span = (t1 - t0 + 24000f) % 24000f;
            float rel = (c - t0 + 24000f) % 24000f;
            if (rel <= span && span > 0f) {
                float u = smooth(0f, 1f, rel / span);
                int s0 = (i / 2) % 4;
                int s1 = (next / 2) % 4;
                w[s0] += 1f - u;
                w[s1] += u;
                return w;
            }
        }
        w[0] = 1f;
        return w;
    }

    /**
     * Layer 0 & 1: Background sky dome vertex with continuous equirectangular Sift Sky PNG
     * mapping, upper-dome rainbow dispersion, lava-lamp metaballs, and horizon fade.
     */
    private static void domeVertex(
        PoseStack.Pose pose,
        VertexConsumer vc,
        float dx,
        float dy,
        float dz,
        float timeSec,
        float[] stageW,
        SiftTimeState.Parameters params
    ) {
        if (!Float.isFinite(dx) || !Float.isFinite(dy) || !Float.isFinite(dz)) return;
        float yClamped = Math.max(0f, Math.min(1f, dy));
        float horizonFade = smooth(0f, 0.22f, yClamped);
        float zenithFade = smooth(0.18f, 0.92f, yClamped);

        // Base stage colors (preserved for LYMPH / lava-lamp state and horizon agreement)
        float hr = 0f, hg = 0f, hb = 0f;
        float mr = 0f, mg = 0f, mb = 0f;
        float zr = 0f, zg = 0f, zb = 0f;
        for (int i = 0; i < 4; i++) {
            float w = stageW[i];
            hr += HORIZON[i][0] * w; hg += HORIZON[i][1] * w; hb += HORIZON[i][2] * w;
            mr += MID_DOME[i][0] * w; mg += MID_DOME[i][1] * w; mb += MID_DOME[i][2] * w;
            zr += ZENITH[i][0] * w;  zg += ZENITH[i][1] * w;  zb += ZENITH[i][2] * w;
        }

        // Biome tinting (0.21 contract)
        if (biomeSwirlMix > 0.001f) {
            mr = mix(mr, MEADOW_TEAL[0], biomeSwirlMix * 0.32f);
            mg = mix(mg, MEADOW_TEAL[1], biomeSwirlMix * 0.32f);
            mb = mix(mb, MEADOW_TEAL[2], biomeSwirlMix * 0.32f);
            zr = mix(zr, ELECTRIC_CYAN[0], biomeSwirlMix * 0.25f);
            zg = mix(zg, ELECTRIC_CYAN[1], biomeSwirlMix * 0.25f);
            zb = mix(zb, ELECTRIC_CYAN[2], biomeSwirlMix * 0.25f);
        }
        if (biomeCanyonMix > 0.001f) {
            mr = mix(mr, BASIN_MAGENTA[0], biomeCanyonMix * 0.38f);
            mg = mix(mg, BASIN_MAGENTA[1], biomeCanyonMix * 0.38f);
            mb = mix(mb, BASIN_MAGENTA[2], biomeCanyonMix * 0.38f);
        }

        float baseR = mix(hr, mix(mr, zr, zenithFade), horizonFade);
        float baseG = mix(hg, mix(mg, zg, zenithFade), horizonFade);
        float baseB = mix(hb, mix(mb, zb, zenithFade), horizonFade);

        // Organic lava-lamp metaball modulation (strongest in LYMPH state)
        float az = (float) Math.atan2(dz, dx);
        float meta = (float) (
            0.5 + 0.28 * Math.sin(az * 3.0 + timeSec * 0.14) * Math.cos(yClamped * 3.2 - timeSec * 0.11)
            + 0.22 * Math.cos(az * 2.0 - timeSec * 0.09 + yClamped * 2.4)
        );
        float lavaBoost = smooth(0.32f, 0.78f, meta) * smooth(0.06f, 0.35f, yClamped) * (0.25f + 0.45f * params.lavaLampWeight());
        baseR = clamp01(baseR + lavaBoost * 0.12f * params.magentaWeight());
        baseG = clamp01(baseG + lavaBoost * 0.18f * params.pastelGreenWeight());
        baseB = clamp01(baseB + lavaBoost * 0.16f * params.cyanWeight());

        // Equirectangular panoramic sampling from supplied Sift Sky PNGs (FLOW & THRIVE)
        float u = (float) ((az / (2.0 * Math.PI)) + 0.5 + timeSec * 0.0016);
        float v = 1.0f - (float) (Math.asin(yClamped) / (0.5 * Math.PI));
        // Gentle low-frequency organic breathing warp on panoramic UVs
        float uWarp = u + 0.012f * (float) Math.sin(v * 4.2f + timeSec * 0.12f) * (float) Math.cos(az * 2.0f);
        float vWarp = clamp01(v + 0.010f * (float) Math.cos(az * 3.0f - timeSec * 0.10f) * smooth(0.08f, 0.85f, yClamped));

        float panoMix = clamp01(params.panoramaFlowWeight() + params.panoramaThriveWeight()) * smooth(0.04f, 0.24f, yClamped);
        if (panoMix > 0.001f) {
            float[] pano = samplePanorama(uWarp, vWarp, params.panoramaFlowWeight(), params.panoramaThriveWeight());
            baseR = mix(baseR, pano[0], panoMix * 0.86f);
            baseG = mix(baseG, pano[1], panoMix * 0.86f);
            baseB = mix(baseB, pano[2], panoMix * 0.86f);
        }

        // FLOW state: cyan/turquoise/pastel-green harmonic & subtle upper-dome rainbow dispersion
        float upperDome = smooth(0.28f, 0.88f, yClamped);
        if (params.rainbowWeight() > 0.01f && upperDome > 0.01f) {
            float rbPhase = (float) (az * 2.0 + yClamped * 4.5 + timeSec * 0.08);
            float rbR = 0.5f + 0.5f * (float) Math.sin(rbPhase);
            float rbG = 0.5f + 0.5f * (float) Math.sin(rbPhase + 2.094f);
            float rbB = 0.5f + 0.5f * (float) Math.sin(rbPhase + 4.188f);
            float rbAmt = 0.11f * params.rainbowWeight() * upperDome;
            baseR = mix(baseR, rbR * 0.95f + 0.15f, rbAmt);
            baseG = mix(baseG, rbG * 0.98f + 0.18f, rbAmt);
            baseB = mix(baseB, rbB * 0.98f + 0.20f, rbAmt);
        }

        // THRIVE state: deepen near-night cyan/blue base and boost magenta/pink highlights
        float thriveW = params.panoramaThriveWeight();
        if (thriveW > 0.01f && horizonFade > 0.01f) {
            float magentaWave = smooth(0.2f, 0.85f, (float) (0.5 + 0.5 * Math.sin(az * 2.0 - timeSec * 0.09 + yClamped * 3.0)));
            float targetR = mix(0.06f, 0.62f, magentaWave * 0.65f);
            float targetG = mix(0.16f, 0.48f, (1f - magentaWave) * 0.70f);
            float targetB = mix(0.30f, 0.72f, 0.65f);
            baseR = mix(baseR, targetR, thriveW * 0.32f * horizonFade);
            baseG = mix(baseG, targetG, thriveW * 0.28f * horizonFade);
            baseB = mix(baseB, targetB, thriveW * 0.28f * horizonFade);
        }

        // Apply state brightness & contrast while preserving exact horizon match at dy <= 0
        float contrast = mix(1.0f, params.skyContrast(), horizonFade);
        float brightness = mix(1.0f, params.skyBrightness(), horizonFade);
        baseR = clamp01(((baseR - 0.5f) * contrast + 0.5f) * brightness);
        baseG = clamp01(((baseG - 0.5f) * contrast + 0.5f) * brightness);
        baseB = clamp01(((baseB - 0.5f) * contrast + 0.5f) * brightness);

        Matrix4f m = pose.pose();
        vc.addVertex(m, dx * RADIUS, dy * RADIUS, dz * RADIUS).setColor(baseR, baseG, baseB, 1f);
    }

    /**
     * Soft luminous atmospheric shapes across the upper sky dome (0.16/0.17/0.18 contract: softPanels).
     */
    private static void softPanels(
        PoseStack.Pose pose,
        VertexConsumer vc,
        float timeSec,
        float[] stageW,
        SiftTimeState.Parameters params
    ) {
        float hw = 0.30f; // 0.18 contract: bigger sky panels
        float[][] cols = {
            rgb(0x4AF0E8), // luminous cyan
            rgb(0x88F7C4), // pastel green
            rgb(0xF27CD4), // soft magenta-pink
            rgb(0xFFF099), // soft yellow highlight
            rgb(0x5CC8FF), // pale sky blue
            rgb(0xC86A92)  // rose-violet accent
        };
        Matrix4f m = pose.pose();
        float r = RADIUS * 0.94f;
        for (int i = 0; i < 12; i++) {
            float baseAz = (float) (i * (2.0 * Math.PI / 12.0) + Math.sin(timeSec * 0.05 + i) * 0.18);
            float baseEl = 0.26f + 0.36f * ((i * 37 % 11) / 11f) + 0.04f * (float) Math.cos(timeSec * 0.08f + i * 1.3f);
            float[] c = cols[i % cols.length];
            float peakA = 0.16f * (0.75f + 0.25f * params.skyBrightness());
            int segs = 6;
            for (int s = 0; s < segs; s++) {
                if (!SiftBudget.take(vc)) return;
                float u0 = (float) s / segs - 0.5f;
                float u1 = (float) (s + 1) / segs - 0.5f;
                float a0 = baseAz + u0 * hw * 2.2f;
                float a1 = baseAz + u1 * hw * 2.2f;
                float w0 = (float) Math.sin((u0 + 0.5f) * Math.PI);
                float w1 = (float) Math.sin((u1 + 0.5f) * Math.PI);
                float wave0 = 0.04f * (float) Math.sin(a0 * 3f + timeSec * 0.14f);
                float wave1 = 0.04f * (float) Math.sin(a1 * 3f + timeSec * 0.14f);
                float elBot0 = Math.max(0.06f, baseEl - hw * 0.55f * w0 + wave0);
                float elTop0 = Math.min(1.38f, baseEl + hw * 0.55f * w0 + wave0);
                float elBot1 = Math.max(0.06f, baseEl - hw * 0.55f * w1 + wave1);
                float elTop1 = Math.min(1.38f, baseEl + hw * 0.55f * w1 + wave1);

                emitSphereQuad(
                    m, vc, r,
                    a0, elBot0, a1, elBot1, a1, elTop1, a0, elTop0,
                    c[0], c[1], c[2], peakA * w0 * 0.35f,
                    c[0], c[1], c[2], peakA * w1 * 0.35f,
                    c[0], c[1], c[2], peakA * w1,
                    c[0], c[1], c[2], peakA * w0
                );
            }
        }
    }

    /**
     * Organic metaball swirl blobs (preserved for LYMPH / lava-lamp state and SWIRL_BIOMES).
     */
    private static void swirlBlobs(
        PoseStack.Pose pose,
        VertexConsumer vc,
        float timeSec,
        float[] stageW,
        float strength
    ) {
        Matrix4f m = pose.pose();
        float r = RADIUS * 0.92f;
        float[][] palette = {
            ELECTRIC_CYAN,
            BASIN_MAGENTA,
            rgb(0x8FE6C8),
            rgb(0x7FD3CF)
        };
        for (int b = 0; b < 10; b++) {
            float az = (float) ((b * 0.6283f) + 0.22 * Math.sin(timeSec * 0.09 + b * 1.7));
            float el = 0.28f + 0.42f * ((b * 19 % 10) / 10f) + 0.05f * (float) Math.sin(timeSec * 0.11f + b);
            float radAz = 0.24f + 0.06f * (b % 3);
            float radEl = 0.14f + 0.04f * (b % 2);
            float[] col = palette[b % palette.length];
            float alpha = 0.20f * strength;
            int steps = 8;
            for (int i = 0; i < steps; i++) {
                if (!SiftBudget.take(vc)) return;
                float t0 = (float) (i * 2.0 * Math.PI / steps);
                float t1 = (float) ((i + 1) * 2.0 * Math.PI / steps);
                float a0 = az + (float) Math.cos(t0) * radAz;
                float e0 = Math.max(0.06f, el + (float) Math.sin(t0) * radEl);
                float a1 = az + (float) Math.cos(t1) * radAz;
                float e1 = Math.max(0.06f, el + (float) Math.sin(t1) * radEl);
                emitSphereQuad(
                    m, vc, r,
                    az, el, a0, e0, a1, e1, az, el,
                    col[0], col[1], col[2], alpha,
                    col[0], col[1], col[2], 0f,
                    col[0], col[1], col[2], 0f,
                    col[0], col[1], col[2], alpha
                );
            }
        }
    }

    /**
     * Black Wavy Bands ("Soul Face" Silhouettes) across the Sift sky dome.
     *
     * <p>Slow-moving, soft-edged, translucent charcoal/near-black wavy bands
     * driven by layered low-frequency sine/cosine deformation that pinch and
     * bow apart around luminous hollows to create the signature Sift "soul face"
     * negative-space silhouettes.
     */
    private static void wavySoulBands(
        PoseStack.Pose pose,
        VertexConsumer vc,
        float timeSec,
        SiftTimeState.Parameters params
    ) {
        Matrix4f m = pose.pose();
        float r = RADIUS * 0.90f;
        float opacity = params.darkBandOpacity();
        if (opacity <= 0.01f) return;

        // Translucent charcoal / deep abyssal slate (never harsh cutout black)
        float cr = 0.045f, cg = 0.055f, cb = 0.095f;
        float edgeR = 0.09f, edgeG = 0.13f, edgeB = 0.20f;

        // 3 primary panoramic wavy bands with paired upper/lower "soul-hollow" arches
        float[] bandBaseEl = {0.34f, 0.62f, 0.92f};
        float[] bandHalfThick = {0.13f, 0.16f, 0.12f};
        float[] bandSpeed = {0.11f, -0.08f, 0.06f};

        int azSegs = 64;
        for (int b = 0; b < bandBaseEl.length; b++) {
            float baseEl = bandBaseEl[b];
            float thick = bandHalfThick[b] * (0.9f + 0.15f * params.darkBandContrast());
            float spd = bandSpeed[b];

            for (int i = 0; i < azSegs; i++) {
                float a0 = (float) (i * 2.0 * Math.PI / azSegs);
                float a1 = (float) ((i + 1) * 2.0 * Math.PI / azSegs);

                // Layered low-frequency sine/cosine deformation
                float wave0 = (float) (
                    0.11 * Math.sin(a0 * 2.0 + timeSec * spd + b * 1.4)
                    + 0.06 * Math.cos(a0 * 3.0 - timeSec * spd * 0.7 + b * 2.1)
                    + 0.03 * Math.sin(a0 * 5.0 + timeSec * 0.05)
                );
                float wave1 = (float) (
                    0.11 * Math.sin(a1 * 2.0 + timeSec * spd + b * 1.4)
                    + 0.06 * Math.cos(a1 * 3.0 - timeSec * spd * 0.7 + b * 2.1)
                    + 0.03 * Math.sin(a1 * 5.0 + timeSec * 0.05)
                );

                // Organic thickness modulation ("soul face" pinches & broad hollows)
                float pinch0 = 0.55f + 0.45f * (float) Math.sin(a0 * 2.0f - 0.8f + b * 1.9f + Math.sin(timeSec * 0.07f) * 0.3f);
                float pinch1 = 0.55f + 0.45f * (float) Math.sin(a1 * 2.0f - 0.8f + b * 1.9f + Math.sin(timeSec * 0.07f) * 0.3f);
                float h0 = thick * (0.45f + 0.75f * pinch0);
                float h1 = thick * (0.45f + 0.75f * pinch1);

                float cEl0 = Math.max(0.12f, Math.min(1.42f, baseEl + wave0));
                float cEl1 = Math.max(0.12f, Math.min(1.42f, baseEl + wave1));

                float coreA0 = clamp01(0.68f * opacity * (0.65f + 0.35f * pinch0) * smooth(0.10f, 0.26f, cEl0));
                float coreA1 = clamp01(0.68f * opacity * (0.65f + 0.35f * pinch1) * smooth(0.10f, 0.26f, cEl1));

                // Lower soft feather -> core
                if (!SiftBudget.take(vc)) return;
                emitSphereQuad(
                    m, vc, r,
                    a0, Math.max(0.04f, cEl0 - h0), a1, Math.max(0.04f, cEl1 - h1), a1, cEl1, a0, cEl0,
                    edgeR, edgeG, edgeB, 0f,
                    edgeR, edgeG, edgeB, 0f,
                    cr, cg, cb, coreA1,
                    cr, cg, cb, coreA0
                );
                // Core -> upper soft feather
                if (!SiftBudget.take(vc)) return;
                emitSphereQuad(
                    m, vc, r,
                    a0, cEl0, a1, cEl1, a1, Math.min(1.52f, cEl1 + h1), a0, Math.min(1.52f, cEl0 + h0),
                    cr, cg, cb, coreA0,
                    cr, cg, cb, coreA1,
                    edgeR, edgeG, edgeB, 0f,
                    edgeR, edgeG, edgeB, 0f
                );
            }
        }
    }

    /**
     * Layer 2 of the Giant Sky Rift: Back Distortion / Opening Depth field behind the sky Rift.
     * Creates a soft atmospheric depth field with radial chromatic rings and smooth edge fade.
     */
    private static void skyRiftBackDistortion(
        PoseStack.Pose pose,
        VertexConsumer vc,
        float timeSec,
        SiftTimeState.Parameters params
    ) {
        Matrix4f m = pose.pose();
        float r = RADIUS * 0.88f;
        float centerAz = 0.35f + 0.03f * (float) Math.sin(timeSec * 0.05f);
        float centerEl = 0.68f;
        float radAz = 0.34f * params.backDistortionStrength();
        float radEl = 0.52f * params.backDistortionDepth();

        int rings = 4;
        int segs = 24;
        for (int ri = 0; ri < rings; ri++) {
            float f0 = (float) ri / rings;
            float f1 = (float) (ri + 1) / rings;
            // Deep indigo/cyan/magenta atmospheric depth (never a flat black rectangle)
            float rCol0 = mix(0.05f, 0.14f, f0) * params.magentaWeight();
            float gCol0 = mix(0.10f, 0.26f, f0) * params.cyanWeight();
            float bCol0 = mix(0.22f, 0.38f, f0);
            float a0 = (1f - f0) * 0.52f * params.backDistortionDepth();
            float a1 = (1f - f1) * 0.52f * params.backDistortionDepth();
            if (ri == rings - 1) a1 = 0f;

            for (int si = 0; si < segs; si++) {
                if (!SiftBudget.take(vc)) return;
                float t0 = (float) (si * 2.0 * Math.PI / segs);
                float t1 = (float) ((si + 1) * 2.0 * Math.PI / segs);
                float wobble0 = 1f + 0.08f * (float) Math.sin(t0 * 3f + timeSec * 0.22f) + 0.05f * (float) Math.cos(t0 * 5f - timeSec * 0.16f);
                float wobble1 = 1f + 0.08f * (float) Math.sin(t1 * 3f + timeSec * 0.22f) + 0.05f * (float) Math.cos(t1 * 5f - timeSec * 0.16f);

                float az00 = centerAz + (float) Math.cos(t0) * radAz * f0 * wobble0;
                float el00 = clampEl(centerEl + (float) Math.sin(t0) * radEl * f0 * wobble0);
                float az10 = centerAz + (float) Math.cos(t1) * radAz * f0 * wobble1;
                float el10 = clampEl(centerEl + (float) Math.sin(t1) * radEl * f0 * wobble1);
                float az11 = centerAz + (float) Math.cos(t1) * radAz * f1 * wobble1;
                float el11 = clampEl(centerEl + (float) Math.sin(t1) * radEl * f1 * wobble1);
                float az01 = centerAz + (float) Math.cos(t0) * radAz * f1 * wobble0;
                float el01 = clampEl(centerEl + (float) Math.sin(t0) * radEl * f1 * wobble0);

                emitSphereQuad(
                    m, vc, r,
                    az00, el00, az10, el10, az11, el11, az01, el01,
                    rCol0, gCol0, bCol0, a0,
                    rCol0, gCol0, bCol0, a0,
                    rCol0 * 0.8f, gCol0 * 1.1f, bCol0 * 1.1f, a1,
                    rCol0 * 0.8f, gCol0 * 1.1f, bCol0 * 1.1f, a1
                );
            }
        }
    }

    /**
     * Layer 4 of the Giant Sky Rift: Wavy Dark Outer Bands framing the vertical sky rupture.
     */
    private static void skyRiftOuterBands(
        PoseStack.Pose pose,
        VertexConsumer vc,
        float timeSec,
        SiftTimeState.Parameters params
    ) {
        Matrix4f m = pose.pose();
        float r = RADIUS * 0.87f;
        float centerAz = 0.35f + 0.03f * (float) Math.sin(timeSec * 0.05f);
        float botEl = 0.18f;
        float topEl = 1.24f;
        int vSteps = 24;

        float cr = 0.04f, cg = 0.05f, cb = 0.09f;
        float peakA = clamp01(0.78f * params.darkBandOpacity());

        for (int side = -1; side <= 1; side += 2) {
            for (int vi = 0; vi < vSteps; vi++) {
                float v0 = (float) vi / vSteps;
                float v1 = (float) (vi + 1) / vSteps;
                float el0 = mix(botEl, topEl, v0);
                float el1 = mix(botEl, topEl, v1);

                float env0 = (float) Math.sin(v0 * Math.PI);
                float env1 = (float) Math.sin(v1 * Math.PI);

                float halfW0 = skyRiftHalfWidth(v0, side, timeSec);
                float halfW1 = skyRiftHalfWidth(v1, side, timeSec);
                float bandW0 = (0.045f + 0.075f * env0) * (0.85f + 0.25f * (float) Math.sin(v0 * 6.0f + timeSec * 0.18f * side));
                float bandW1 = (0.045f + 0.075f * env1) * (0.85f + 0.25f * (float) Math.sin(v1 * 6.0f + timeSec * 0.18f * side));

                float innerAz0 = centerAz + side * halfW0;
                float innerAz1 = centerAz + side * halfW1;
                float midAz0 = innerAz0 + side * bandW0 * 0.45f;
                float midAz1 = innerAz1 + side * bandW1 * 0.45f;
                float outerAz0 = innerAz0 + side * bandW0;
                float outerAz1 = innerAz1 + side * bandW1;

                float a0 = peakA * smooth(0f, 0.15f, env0);
                float a1 = peakA * smooth(0f, 0.15f, env1);

                if (!SiftBudget.take(vc)) return;
                emitSphereQuad(
                    m, vc, r,
                    innerAz0, el0, midAz0, el0, midAz1, el1, innerAz1, el1,
                    cr, cg, cb, a0 * 0.35f,
                    cr, cg, cb, a0,
                    cr, cg, cb, a1,
                    cr, cg, cb, a1 * 0.35f
                );
                if (!SiftBudget.take(vc)) return;
                emitSphereQuad(
                    m, vc, r,
                    midAz0, el0, outerAz0, el0, outerAz1, el1, midAz1, el1,
                    cr, cg, cb, a0,
                    cr, cg, cb, 0f,
                    cr, cg, cb, 0f,
                    cr, cg, cb, a1
                );
            }
        }
    }

    /**
     * Layers 3, 5, 6, 9 of the Giant Sky Rift:
     * Vertically-dominant organic Rift aperture, colored interior energy,
     * inner white-cyan luminance, and soft bloom halo.
     */
    private static void skyRiftApertureAndEnergy(
        PoseStack.Pose pose,
        VertexConsumer vc,
        float timeSec,
        SiftTimeState.Parameters params
    ) {
        Matrix4f m = pose.pose();
        float r = RADIUS * 0.86f;
        float centerAz = 0.35f + 0.03f * (float) Math.sin(timeSec * 0.05f);
        float botEl = 0.20f;
        float topEl = 1.22f;
        int vSteps = 28;
        float glowMul = params.riftGlowIntensity();
        float bloomMul = params.riftBloomStrength();

        for (int vi = 0; vi < vSteps; vi++) {
            float v0 = (float) vi / vSteps;
            float v1 = (float) (vi + 1) / vSteps;
            float el0 = mix(botEl, topEl, v0);
            float el1 = mix(botEl, topEl, v1);

            float env0 = smooth(0f, 0.14f, v0) * smooth(0f, 0.14f, 1f - v0);
            float env1 = smooth(0f, 0.14f, v1) * smooth(0f, 0.14f, 1f - v1);

            float leftAz0 = centerAz - skyRiftHalfWidth(v0, -1, timeSec);
            float rightAz0 = centerAz + skyRiftHalfWidth(v0, 1, timeSec);
            float leftAz1 = centerAz - skyRiftHalfWidth(v1, -1, timeSec);
            float rightAz1 = centerAz + skyRiftHalfWidth(v1, 1, timeSec);
            float midAz0 = 0.5f * (leftAz0 + rightAz0);
            float midAz1 = 0.5f * (leftAz1 + rightAz1);

            // Layer 5: Colored interior energy (cyan, turquoise, pastel green, pink/magenta, soft yellow)
            float[] colL0 = skyRiftInteriorColor(v0, -0.6f, timeSec, params);
            float[] colR0 = skyRiftInteriorColor(v0, 0.6f, timeSec, params);
            float[] colL1 = skyRiftInteriorColor(v1, -0.6f, timeSec, params);
            float[] colR1 = skyRiftInteriorColor(v1, 0.6f, timeSec, params);

            float energyA0 = clamp01(0.46f * glowMul * env0);
            float energyA1 = clamp01(0.46f * glowMul * env1);

            // Left half of aperture
            if (!SiftBudget.take(vc)) return;
            emitSphereQuad(
                m, vc, r,
                leftAz0, el0, midAz0, el0, midAz1, el1, leftAz1, el1,
                colL0[0], colL0[1], colL0[2], energyA0 * 0.25f,
                0.88f, 0.99f, 1.00f, energyA0,
                0.88f, 0.99f, 1.00f, energyA1,
                colL1[0], colL1[1], colL1[2], energyA1 * 0.25f
            );
            // Right half of aperture
            if (!SiftBudget.take(vc)) return;
            emitSphereQuad(
                m, vc, r,
                midAz0, el0, rightAz0, el0, rightAz1, el1, midAz1, el1,
                0.88f, 0.99f, 1.00f, energyA0,
                colR0[0], colR0[1], colR0[2], energyA0 * 0.25f,
                colR1[0], colR1[1], colR1[2], energyA1 * 0.25f,
                0.88f, 0.99f, 1.00f, energyA1
            );

            // Layer 6: Inner high-luminance white-cyan spine
            float coreW0 = (rightAz0 - leftAz0) * 0.22f;
            float coreW1 = (rightAz1 - leftAz1) * 0.22f;
            float coreA0 = clamp01(0.54f * glowMul * env0);
            float coreA1 = clamp01(0.54f * glowMul * env1);
            if (!SiftBudget.take(vc)) return;
            emitSphereQuad(
                m, vc, r * 0.995f,
                midAz0 - coreW0, el0, midAz0 + coreW0, el0, midAz1 + coreW1, el1, midAz1 - coreW1, el1,
                0.65f, 0.98f, 1.0f, coreA0 * 0.3f,
                0.96f, 1.00f, 1.0f, coreA0,
                0.96f, 1.00f, 1.0f, coreA1,
                0.65f, 0.98f, 1.0f, coreA1 * 0.3f
            );

            // Layer 9: Soft wide bloom halo around the Sky Rift
            float bloomW0 = (rightAz0 - leftAz0) * 1.35f;
            float bloomW1 = (rightAz1 - leftAz1) * 1.35f;
            float bloomA0 = clamp01(0.18f * bloomMul * env0);
            float bloomA1 = clamp01(0.18f * bloomMul * env1);
            if (!SiftBudget.take(vc)) return;
            emitSphereQuad(
                m, vc, r * 1.005f,
                midAz0 - bloomW0, el0, midAz0 + bloomW0, el0, midAz1 + bloomW1, el1, midAz1 - bloomW1, el1,
                colL0[0], colL0[1], colL0[2], 0f,
                colR0[0], colR0[1], colR0[2], bloomA0,
                colR1[0], colR1[1], colR1[2], bloomA1,
                colL1[0], colL1[1], colL1[2], 0f
            );
        }
    }

    private static float skyRiftHalfWidth(float v, int side, float timeSec) {
        float taper = (float) Math.sin(v * Math.PI);
        // Controlled organic stepped/wavy silhouette (asymmetric in local detail, globally balanced)
        float primary = 0.085f * taper;
        float stepWave = 0.024f * (float) Math.sin(v * 9.0f + side * 0.9f + timeSec * 0.16f) * taper;
        float secondary = 0.015f * (float) Math.cos(v * 15.0f - side * 1.4f - timeSec * 0.11f) * taper;
        float pinch = 1.0f - 0.25f * (float) Math.exp(-18.0f * (v - 0.52f) * (v - 0.52f));
        return Math.max(0.008f, (primary + stepWave + secondary) * pinch);
    }

    private static float[] skyRiftInteriorColor(float v, float sideBias, float timeSec, SiftTimeState.Parameters params) {
        float phase = v * 4.2f + sideBias * 0.8f - timeSec * 0.18f;
        float wCyan = 0.5f + 0.5f * (float) Math.sin(phase);
        float wPink = 0.5f + 0.5f * (float) Math.cos(phase * 1.3f + 1.1f);
        float wMint = 0.5f + 0.5f * (float) Math.sin(phase * 0.8f + 2.4f);
        float r = clamp01(0.18f * wCyan + 0.92f * wPink * params.magentaWeight() + 0.45f * wMint);
        float g = clamp01(0.92f * wCyan * params.cyanWeight() + 0.34f * wPink + 0.96f * wMint * params.pastelGreenWeight());
        float b = clamp01(0.98f * wCyan + 0.86f * wPink + 0.72f * wMint);
        return new float[]{r, g, b};
    }

    /**
     * Layer 7 of the Giant Sky Rift: 18 deterministic, soft-edged, semi-translucent
     * luminous floating light squares drifting in depth around and through the sky Rift.
     */
    private static void skyRiftFloatingSquares(
        PoseStack.Pose pose,
        VertexConsumer vc,
        float timeSec,
        SiftTimeState.Parameters params
    ) {
        Matrix4f m = pose.pose();
        float centerAz = 0.35f + 0.03f * (float) Math.sin(timeSec * 0.05f);
        float brightness = params.floatingSquareBrightness();
        int count = 18; // Between 8 and 24 controlled fragments

        float[][] sqPalette = {
            {0.82f, 0.99f, 1.00f}, // white-cyan
            {0.35f, 0.96f, 0.94f}, // electric turquoise
            {0.62f, 0.98f, 0.82f}, // pastel mint-green
            {0.98f, 0.56f, 0.88f}, // luminous pink-magenta
            {1.00f, 0.95f, 0.68f}  // soft warm yellow-white
        };

        for (int i = 0; i < count; i++) {
            float h1 = detHash(i, 1);
            float h2 = detHash(i, 2);
            float h3 = detHash(i, 3);
            float h4 = detHash(i, 4);

            // Deterministic angular offset & slow upward/vertical drift
            float azOffset = (h1 - 0.5f) * 0.36f + 0.025f * (float) Math.sin(timeSec * (0.22f + 0.12f * h2) + i);
            float baseV = (h2 + timeSec * (0.012f + 0.008f * h3)) % 1.0f;
            float el = mix(0.24f, 1.16f, baseV);
            float az = centerAz + azOffset;

            // Varied small, medium, and larger sizes
            float sizeTier = (i < 4) ? 0.026f : (i < 11 ? 0.016f : 0.009f);
            float halfAz = sizeTier * (0.85f + 0.35f * h3);
            float halfEl = sizeTier * (0.90f + 0.30f * h4);

            // Depth layering & soft pulse
            float rDepth = RADIUS * (0.83f + 0.05f * h4);
            float pulse = 0.72f + 0.28f * (float) Math.sin(timeSec * (0.9f + 0.5f * h1) + i * 2.1f);
            float coreAlpha = clamp01(0.48f * brightness * pulse * smooth(0f, 0.12f, baseV) * smooth(0f, 0.12f, 1f - baseV));

            float[] col = sqPalette[i % sqPalette.length];

            // Outer soft glow feather of the floating square
            float feather = 1.65f;
            if (!SiftBudget.take(vc)) return;
            emitSphereQuad(
                m, vc, rDepth,
                az - halfAz * feather, el - halfEl * feather,
                az + halfAz * feather, el - halfEl * feather,
                az + halfAz * feather, el + halfEl * feather,
                az - halfAz * feather, el + halfEl * feather,
                col[0], col[1], col[2], coreAlpha * 0.22f,
                col[0], col[1], col[2], coreAlpha * 0.22f,
                col[0], col[1], col[2], coreAlpha * 0.22f,
                col[0], col[1], col[2], coreAlpha * 0.22f
            );

            // Inner semi-translucent luminous square core
            if (!SiftBudget.take(vc)) return;
            emitSphereQuad(
                m, vc, rDepth * 0.998f,
                az - halfAz, el - halfEl,
                az + halfAz, el - halfEl,
                az + halfAz, el + halfEl,
                az - halfAz, el + halfEl,
                mix(col[0], 1f, 0.45f), mix(col[1], 1f, 0.45f), mix(col[2], 1f, 0.45f), coreAlpha,
                mix(col[0], 1f, 0.45f), mix(col[1], 1f, 0.45f), mix(col[2], 1f, 0.45f), coreAlpha,
                mix(col[0], 1f, 0.45f), mix(col[1], 1f, 0.45f), mix(col[2], 1f, 0.45f), coreAlpha,
                mix(col[0], 1f, 0.45f), mix(col[1], 1f, 0.45f), mix(col[2], 1f, 0.45f), coreAlpha
            );
        }
    }

    /**
     * Soft aurora curtains across the Sift sky (0.12 contract: auroraCurtains).
     */
    private static void auroraCurtains(
        PoseStack.Pose pose,
        VertexConsumer vc,
        float timeSec,
        float[] stageW,
        SiftTimeState.Parameters params
    ) {
        Matrix4f m = pose.pose();
        float r = RADIUS * 0.91f;
        int curtains = 6;
        int segs = 28;
        int vSteps = 6;

        for (int c = 0; c < curtains; c++) {
            float baseAz = (float) (c * Math.PI / 3.0 + timeSec * 0.015 * (c % 2 == 0 ? 1 : -1));
            float[] col = (c % 2 == 0) ? rgb(0x7FD3CF) : rgb(0x2E9AA6);
            if (c % 3 == 2) col = BASIN_MAGENTA;

            for (int s = 0; s < segs; s++) {
                float u0 = (float) s / segs;
                float u1 = (float) (s + 1) / segs;
                float hFade0 = (float) Math.sin(u0 * Math.PI);
                float hFade1 = (float) Math.sin(u1 * Math.PI);
                float a0 = baseAz + (u0 - 0.5f) * 1.15f;
                float a1 = baseAz + (u1 - 0.5f) * 1.15f;

                float wave0 = 0.08f * (float) Math.sin(u0 * 7f + timeSec * 0.25f + c);
                float wave1 = 0.08f * (float) Math.sin(u1 * 7f + timeSec * 0.25f + c);

                for (int vi = 0; vi < vSteps; vi++) {
                    if (!SiftBudget.take(vc)) return;
                    float v = (float) vi / vSteps;
                    float vNext = (float) (vi + 1) / vSteps;
                    float vFade0 = smooth(0f, 0.18f, v) * smooth(0f, 0.28f, 1f - v);
                    float vFade1 = smooth(0f, 0.18f, vNext) * smooth(0f, 0.28f, 1f - vNext);

                    float el00 = 0.20f + v * 0.55f + wave0;
                    float el10 = 0.20f + v * 0.55f + wave1;
                    float el11 = 0.20f + vNext * 0.55f + wave1;
                    float el01 = 0.20f + vNext * 0.55f + wave0;

                    float alpha00 = CURTAIN_ALPHA * hFade0 * vFade0 * params.riftGlowIntensity();
                    float alpha10 = CURTAIN_ALPHA * hFade1 * vFade0 * params.riftGlowIntensity();
                    float alpha11 = CURTAIN_ALPHA * hFade1 * vFade1 * params.riftGlowIntensity();
                    float alpha01 = CURTAIN_ALPHA * hFade0 * vFade1 * params.riftGlowIntensity();

                    emitSphereQuad(
                        m, vc, r,
                        a0, el00, a1, el10, a1, el11, a0, el01,
                        col[0], col[1], col[2], alpha00,
                        col[0], col[1], col[2], alpha10,
                        col[0], col[1], col[2], alpha11,
                        col[0], col[1], col[2], alpha01
                    );
                }
            }
        }
    }

    /**
     * Layer 8: Soft accumulated volumetric god-ray light shafts streaming from the upper sky dome
     * and the Giant Sky Rift. Balanced in FLOW, extremely strong and dramatic in THRIVE.
     */
    private static void skyRays(
        PoseStack.Pose pose,
        VertexConsumer vc,
        float timeSec,
        float[] stageW,
        SiftTimeState.Parameters params
    ) {
        Matrix4f m = pose.pose();
        float rayBoost = params.godRayIntensity();
        if (rayBoost <= 0.01f) return;

        // 1. Accumulated volumetric god rays across the sky dome (32 overlapping soft shafts)
        int domeRayCount = params.isThriveDominant() ? 36 : 24;
        float r = RADIUS * 0.89f;
        for (int i = 0; i < domeRayCount; i++) {
            float[] c = RAYS[i % RAYS.length];
            float h1 = detHash(i, 11);
            float h2 = detHash(i, 17);
            float az = (float) (i * (2.0 * Math.PI / domeRayCount) + 0.08 * Math.sin(timeSec * 0.09 + i));
            float halfW = (0.045f + 0.055f * h1) * (params.isThriveDominant() ? 1.28f : 1.0f);
            float topEl = 0.88f + 0.38f * h2;
            float botEl = 0.05f + 0.10f * h1;
            float shimmer = 0.72f + 0.28f * (float) Math.sin(timeSec * (0.28f + 0.14f * h2) + i * 1.7f);
            float coreAlpha = clamp01(0.085f * rayBoost * shimmer);

            // Left soft feather -> center -> right soft feather (no hard-edged triangles)
            float midEl = 0.5f * (topEl + botEl);
            if (!SiftBudget.take(vc)) return;
            emitSphereQuad(
                m, vc, r,
                az - halfW, botEl, az, botEl, az, midEl, az - halfW * 0.75f, midEl,
                c[0], c[1], c[2], 0f,
                c[0], c[1], c[2], coreAlpha * 0.35f,
                c[0], c[1], c[2], coreAlpha,
                c[0], c[1], c[2], 0f
            );
            if (!SiftBudget.take(vc)) return;
            emitSphereQuad(
                m, vc, r,
                az, botEl, az + halfW, botEl, az + halfW * 0.75f, midEl, az, midEl,
                c[0], c[1], c[2], coreAlpha * 0.35f,
                c[0], c[1], c[2], 0f,
                c[0], c[1], c[2], 0f,
                c[0], c[1], c[2], coreAlpha
            );
            if (!SiftBudget.take(vc)) return;
            emitSphereQuad(
                m, vc, r,
                az - halfW * 0.75f, midEl, az, midEl, az, topEl, az - halfW * 0.35f, topEl,
                c[0], c[1], c[2], 0f,
                c[0], c[1], c[2], coreAlpha,
                c[0], c[1], c[2], coreAlpha * 0.25f,
                c[0], c[1], c[2], 0f
            );
            if (!SiftBudget.take(vc)) return;
            emitSphereQuad(
                m, vc, r,
                az, midEl, az + halfW * 0.75f, midEl, az + halfW * 0.35f, topEl, az, topEl,
                c[0], c[1], c[2], coreAlpha,
                c[0], c[1], c[2], 0f,
                c[0], c[1], c[2], 0f,
                c[0], c[1], c[2], coreAlpha * 0.25f
            );
        }

        // 2. Concentrated volumetric light-shaft fan radiating from the Giant Sky Rift
        float riftAz = 0.35f + 0.03f * (float) Math.sin(timeSec * 0.05f);
        float riftEl = 0.72f;
        int riftRays = params.isThriveDominant() ? 24 : 16;
        for (int i = 0; i < riftRays; i++) {
            float frac = (float) i / riftRays - 0.5f;
            float rayAz = riftAz + frac * 0.95f + 0.03f * (float) Math.sin(timeSec * 0.19f + i);
            float halfSpread = 0.038f + 0.032f * detHash(i, 23);
            float reachEl = Math.max(0.03f, riftEl - (0.42f + 0.28f * detHash(i, 29)));
            float[] c = RAYS[(i + 2) % RAYS.length];
            float pulse = 0.76f + 0.24f * (float) Math.cos(timeSec * 0.33f + i * 1.3f);
            float peakA = clamp01(0.11f * rayBoost * pulse * (1f - Math.abs(frac) * 1.1f));

            if (!SiftBudget.take(vc)) return;
            emitSphereQuad(
                m, vc, r * 0.98f,
                riftAz - halfSpread * 0.35f, riftEl,
                riftAz + halfSpread * 0.35f, riftEl,
                rayAz + halfSpread, reachEl,
                rayAz - halfSpread, reachEl,
                mix(c[0], 1f, 0.35f), mix(c[1], 1f, 0.35f), mix(c[2], 1f, 0.35f), peakA,
                mix(c[0], 1f, 0.35f), mix(c[1], 1f, 0.35f), mix(c[2], 1f, 0.35f), peakA,
                c[0], c[1], c[2], 0f,
                c[0], c[1], c[2], 0f
            );
        }
    }

    /**
     * World-space atmospheric light beams (0.12 contract: worldBeams).
     */
    private static void worldBeams(
        PoseStack.Pose pose,
        VertexConsumer vc,
        Vec3 cam,
        float timeSec,
        float[] stageW
    ) {
        if (!Float.isFinite((float) cam.x) || !Float.isFinite((float) cam.y) || !Float.isFinite((float) cam.z)) return;
        Matrix4f m = pose.pose();
        SiftTimeState.Parameters params = SiftTimeState.currentParameters();
        float rayMul = params.godRayIntensity();
        for (int i = 0; i < 8; i++) {
            if (!SiftBudget.take(vc)) return;
            float angle = (float) (i * Math.PI / 4.0 + timeSec * 0.01);
            float dist = 42f + (i % 3) * 14f;
            float bx = (float) Math.cos(angle) * dist;
            float bz = (float) Math.sin(angle) * dist;
            float hw = 3.2f + (i % 2) * 1.4f;
            float[] c = RAYS[i % RAYS.length];
            float alpha = clamp01(0.055f * rayMul);
            vc.addVertex(m, bx - hw, -12f, bz - hw).setColor(c[0], c[1], c[2], 0f);
            vc.addVertex(m, bx + hw, -12f, bz + hw).setColor(c[0], c[1], c[2], 0f);
            vc.addVertex(m, bx + hw * 0.6f, 64f, bz + hw * 0.6f).setColor(c[0], c[1], c[2], alpha);
            vc.addVertex(m, bx - hw * 0.6f, 64f, bz - hw * 0.6f).setColor(c[0], c[1], c[2], alpha);
        }
    }

    // Kept for 0.13 test_data.py contract (must never be called before declaration).
    static float[] sunDirection(float tick) {
        float a = (float) (tick / 24000.0 * 2.0 * Math.PI);
        return new float[]{(float) Math.cos(a), (float) Math.sin(a), 0f};
    }

    private static void emitSphereQuad(
        Matrix4f m,
        VertexConsumer vc,
        float radius,
        float az0, float el0,
        float az1, float el1,
        float az2, float el2,
        float az3, float el3,
        float r0, float g0, float b0, float a0,
        float r1, float g1, float b1, float a1,
        float r2, float g2, float b2, float a2,
        float r3, float g3, float b3, float a3
    ) {
        float x0 = (float) (Math.cos(az0) * Math.cos(el0)) * radius;
        float y0 = (float) Math.sin(el0) * radius;
        float z0 = (float) (Math.sin(az0) * Math.cos(el0)) * radius;

        float x1 = (float) (Math.cos(az1) * Math.cos(el1)) * radius;
        float y1 = (float) Math.sin(el1) * radius;
        float z1 = (float) (Math.sin(az1) * Math.cos(el1)) * radius;

        float x2 = (float) (Math.cos(az2) * Math.cos(el2)) * radius;
        float y2 = (float) Math.sin(el2) * radius;
        float z2 = (float) (Math.sin(az2) * Math.cos(el2)) * radius;

        float x3 = (float) (Math.cos(az3) * Math.cos(el3)) * radius;
        float y3 = (float) Math.sin(el3) * radius;
        float z3 = (float) (Math.sin(az3) * Math.cos(el3)) * radius;

        if (!Float.isFinite(x0) || !Float.isFinite(y0) || !Float.isFinite(z0)) return;
        vc.addVertex(m, x0, y0, z0).setColor(r0, g0, b0, a0);
        vc.addVertex(m, x1, y1, z1).setColor(r1, g1, b1, a1);
        vc.addVertex(m, x2, y2, z2).setColor(r2, g2, b2, a2);
        vc.addVertex(m, x3, y3, z3).setColor(r3, g3, b3, a3);
    }

    private static float[] samplePanorama(float u, float v, float flowW, float thriveW) {
        float uw = u - (float) Math.floor(u);
        float vc = clamp01(v);
        float fx = uw * (PANO_W - 1);
        float fy = vc * (PANO_H - 1);
        int x0 = (int) fx;
        int y0 = (int) fy;
        int x1 = (x0 + 1) % PANO_W;
        int y1 = Math.min(PANO_H - 1, y0 + 1);
        float tx = fx - x0;
        float ty = fy - y0;

        float total = Math.max(1e-4f, flowW + thriveW);
        float fw = flowW / total;
        float tw = thriveW / total;

        float[] c00 = unpackBlend(x0, y0, fw, tw);
        float[] c10 = unpackBlend(x1, y0, fw, tw);
        float[] c01 = unpackBlend(x0, y1, fw, tw);
        float[] c11 = unpackBlend(x1, y1, fw, tw);

        float r = mix(mix(c00[0], c10[0], tx), mix(c01[0], c11[0], tx), ty);
        float g = mix(mix(c00[1], c10[1], tx), mix(c01[1], c11[1], tx), ty);
        float b = mix(mix(c00[2], c10[2], tx), mix(c01[2], c11[2], tx), ty);
        return new float[]{r, g, b};
    }

    private static float[] unpackBlend(int x, int y, float fw, float tw) {
        int idx = y * PANO_W + x;
        int fRgb = FLOW_PANO[idx];
        int tRgb = THRIVE_PANO[idx];
        float fr = ((fRgb >> 16) & 0xFF) / 255f;
        float fg = ((fRgb >> 8) & 0xFF) / 255f;
        float fb = (fRgb & 0xFF) / 255f;
        float tr = ((tRgb >> 16) & 0xFF) / 255f;
        float tg = ((tRgb >> 8) & 0xFF) / 255f;
        float tb = (tRgb & 0xFF) / 255f;
        return new float[]{
            fr * fw + tr * tw,
            fg * fw + tg * tw,
            fb * fw + tb * tw
        };
    }

    private static int[] loadPanorama(String resourcePath, boolean nightFallback) {
        int[] pixels = new int[PANO_W * PANO_H];
        try (InputStream in = SiftSky.class.getResourceAsStream(resourcePath)) {
            if (in != null) {
                BufferedImage img = ImageIO.read(in);
                if (img != null) {
                    int w = img.getWidth();
                    int h = img.getHeight();
                    for (int y = 0; y < PANO_H; y++) {
                        int sy = Math.min(h - 1, (y * h) / PANO_H);
                        for (int x = 0; x < PANO_W; x++) {
                            int sx = Math.min(w - 1, (x * w) / PANO_W);
                            pixels[y * PANO_W + x] = img.getRGB(sx, sy) & 0xFFFFFF;
                        }
                    }
                    return pixels;
                }
            }
        } catch (Throwable ignored) {
            // Fallback to procedural equirectangular synthesis below
        }
        for (int y = 0; y < PANO_H; y++) {
            float v = (float) y / (PANO_H - 1);
            for (int x = 0; x < PANO_W; x++) {
                float u = (float) x / PANO_W;
                float az = (float) (u * 2.0 * Math.PI);
                float wave = 0.5f + 0.5f * (float) Math.sin(az * 2.0f + v * 4.0f);
                int r = nightFallback ? (int) (35 + 110 * wave) : (int) (75 + 115 * wave);
                int g = nightFallback ? (int) (55 + 135 * (1f - v * 0.4f)) : (int) (195 + 50 * (1f - v * 0.3f));
                int b = nightFallback ? (int) (120 + 115 * wave) : (int) (205 + 45 * wave);
                pixels[y * PANO_W + x] = ((r & 0xFF) << 16) | ((g & 0xFF) << 8) | (b & 0xFF);
            }
        }
        return pixels;
    }

    private static float detHash(int i, int salt) {
        int n = i * 374761393 + salt * 668265263;
        n = (n ^ (n >> 13)) * 1274126177;
        return ((n ^ (n >> 16)) & 0x7FFFFFFF) / (float) 0x7FFFFFFF;
    }

    private static float clampEl(float el) {
        return Math.max(0.05f, Math.min(1.48f, el));
    }

    private static float clamp01(float x) {
        return Math.max(0f, Math.min(1f, x));
    }

    private static float mix(float a, float b, float t) {
        return a + (b - a) * t;
    }

    private static float smooth(float e0, float e1, float x) {
        float t = clamp01((x - e0) / (e1 - e0));
        return t * t * (3f - 2f * t);
    }

    private static float[] rgb(int hex) {
        return new float[]{
            ((hex >> 16) & 0xFF) / 255f,
            ((hex >> 8) & 0xFF) / 255f,
            (hex & 0xFF) / 255f
        };
    }
}
