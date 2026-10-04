package dev.logan.entersift.client;

import java.nio.file.Files;
import java.nio.file.Path;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.CameraType;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.resources.Identifier;
import net.minecraft.world.phys.Vec3;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Environment-gated visual CI harness. It aims the real client camera at the live RiftPortalRenderer,
 * asks Minecraft's screenshot code to read the rendered framebuffer, and writes phase signals so the
 * test server can capture a night particle view and then move the player into the Sift. It is inert in normal play.
 */
public final class SiftVisualCapture {
    private static final Logger LOGGER = LoggerFactory.getLogger("entersift");
    private static final String DAY_SIGNAL_ENV = "SIFT_VISUAL_PHASE1_SIGNAL";
    private static final String NIGHT_SIGNAL_ENV = "SIFT_VISUAL_PHASE2_SIGNAL";
    private static final Identifier OVERWORLD = Identifier.fromNamespaceAndPath("minecraft", "overworld");
    private static final Identifier SIFT = Identifier.fromNamespaceAndPath("entersift", "the_sift");
    private static final Pose[] RIFT_VIEWS = {
        new Pose(0.5, 140.0, 10.5, 180f, -14f),  // first-person front view
        new Pose(0.5, 140.0, 5.5, 180f, -25f),   // close-up of the filled, faceted tear
        new Pose(7.5, 140.0, 3.5, 113f, -16f)    // oblique side view of its depth
    };
    private static final Pose NIGHT_VIEW = RIFT_VIEWS[0];
    private static final Pose SIFT_VIEW = new Pose(0.5, 140.0, 10.5, 180f, -14f);

    // Stages: three daytime Rift angles, night particles, Sift sky + Rift, then shutdown.
    private static int stage;
    private static int poseStage = -1;
    private static int settleTicks;
    private static int daySignalDelay = -1;
    private static int waitingTicks;
    private static boolean daySignalWritten;
    private static boolean nightSignalWritten;
    private static long startedAt;

    private record Pose(double x, double y, double z, float yaw, float pitch) {}

    public static void register() {
        if (!"1".equals(System.getenv("SIFT_VISUAL_CAPTURE"))) return;
        startedAt = System.currentTimeMillis();
        LOGGER.info("[SIFT-VISUAL] client framebuffer capture enabled");
        ClientTickEvents.END_CLIENT_TICK.register(SiftVisualCapture::tick);
    }

    private static void tick(Minecraft client) {
        if (System.currentTimeMillis() - startedAt > 180_000L) {
            fail(client, "timed out before all five Minecraft screenshots were captured");
            return;
        }
        if (client.player == null || client.level == null) {
            if (++waitingTicks % 200 == 0) LOGGER.info("[SIFT-VISUAL] waiting for quick-play to connect to the test server");
            return;
        }
        waitingTicks = 0;
        client.options.setCameraType(CameraType.FIRST_PERSON);
        Identifier dimension = client.level.dimension().identifier();

        if (stage < RIFT_VIEWS.length) {
            if (!OVERWORLD.equals(dimension)) return;
            captureRiftView(client, stage);
            return;
        }

        if (stage == RIFT_VIEWS.length) {
            if (!OVERWORLD.equals(dimension)) return;
            captureNightView(client);
            return;
        }

        if (stage == RIFT_VIEWS.length + 1) {
            if (!SIFT.equals(dimension)) {
                keepPose(client, NIGHT_VIEW);
                if (!nightSignalWritten) {
                    if (settleTicks-- > 0) return;
                    writeSignal(client, NIGHT_SIGNAL_ENV, "night Rift particles captured");
                    nightSignalWritten = true;
                }
                return;
            }
            captureSiftSky(client);
            return;
        }

        if (settleTicks-- <= 0) {
            LOGGER.info("[SIFT-VISUAL] all five framebuffer captures complete; closing client");
            client.stop();
        }
    }

    private static void captureRiftView(Minecraft client, int view) {
        if (poseStage != view) {
            poseStage = view;
            settleTicks = view == 0 ? 100 : 55;
        }
        keepPose(client, RIFT_VIEWS[view]);
        if (settleTicks-- > 0) return;

        String[] labels = {"rift-front", "rift-close-up", "rift-side"};
        capture(client, labels[view]);
        stage++;
        poseStage = -1;
        if (stage == RIFT_VIEWS.length) daySignalDelay = 50;
    }

    private static void captureNightView(Minecraft client) {
        if (poseStage != stage) {
            poseStage = stage;
            settleTicks = 100;
        }
        keepPose(client, NIGHT_VIEW);
        if (!daySignalWritten) {
            if (daySignalDelay > 0) {
                daySignalDelay--;
            } else {
                writeSignal(client, DAY_SIGNAL_ENV, "daytime Rift views captured");
                daySignalWritten = true;
            }
            return;
        }

        long dayTime = Math.floorMod(client.level.getOverworldClockTime(), 24_000L);
        if (dayTime < 11_500L || dayTime > 23_300L) {
            settleTicks = 100;
            return;
        }
        if (settleTicks-- > 0) return; // allow the client particle group to emit and animate real cubes

        capture(client, "rift-night-cubes");
        stage++;
        poseStage = -1;
        settleTicks = 50; // let the vanilla async screenshot write finish before telling the server to teleport
    }

    private static void captureSiftSky(Minecraft client) {
        int siftStage = RIFT_VIEWS.length + 1;
        if (poseStage != siftStage) {
            poseStage = siftStage;
            settleTicks = 100; // let the Sift chunks, custom sky and its animation render before the shot
        }
        keepPose(client, SIFT_VIEW);
        if (settleTicks-- > 0) return;

        capture(client, "sift-sky-and-rift");
        stage++;
        settleTicks = 40;
    }

    private static void keepPose(Minecraft client, Pose pose) {
        client.player.setPos(pose.x, pose.y, pose.z);
        client.player.setDeltaMovement(Vec3.ZERO);
        client.player.setYRot(pose.yaw);
        client.player.setXRot(pose.pitch);
        client.player.setYHeadRot(pose.yaw);
    }

    private static void capture(Minecraft client, String label) {
        LOGGER.info("[SIFT-VISUAL] capturing {} from the live {} framebuffer", label,
            client.level.dimension().identifier());
        try {
            // Vanilla's screenshot path reads the actual Minecraft main render target (not the Xvfb window).
            Screenshot.grab(client, false);
        } catch (Throwable error) {
            LOGGER.error("[SIFT-VISUAL] FAIL screenshot request for " + label, error);
            client.stop();
        }
    }

    private static void writeSignal(Minecraft client, String variable, String message) {
        String value = System.getenv(variable);
        if (value == null || value.isBlank()) {
            fail(client, variable + " is not configured");
            return;
        }
        try {
            Path signal = Path.of(value).toAbsolutePath();
            Path parent = signal.getParent();
            if (parent != null) Files.createDirectories(parent);
            Files.writeString(signal, message + "\n");
            LOGGER.info("[SIFT-VISUAL] {}; phase signal written to {}", message, signal);
        } catch (Exception error) {
            LOGGER.error("[SIFT-VISUAL] FAIL could not write phase signal " + variable, error);
            client.stop();
        }
    }

    private static void fail(Minecraft client, String reason) {
        LOGGER.error("[SIFT-VISUAL] FAIL {}", reason);
        client.stop();
    }

    private SiftVisualCapture() {}
}
