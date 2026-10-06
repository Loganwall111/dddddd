package dev.logan.beyond.client.render;

import com.mojang.blaze3d.systems.RenderSystem;
import dev.logan.beyond.BeyondMinecraft;
import dev.logan.beyond.client.BeyondClient;
import dev.logan.beyond.client.ClientReality;
import dev.logan.beyond.server.Journey;
import net.fabricmc.fabric.api.client.rendering.v1.CoreShaderRegistrationCallback;
import net.fabricmc.fabric.api.client.rendering.v1.WorldRenderEvents;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gl.Framebuffer;
import net.minecraft.client.gl.ShaderProgram;
import net.minecraft.client.gl.SimpleFramebuffer;
import net.minecraft.client.render.*;
import net.minecraft.text.Text;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.World;
import org.joml.Matrix4f;
import org.lwjgl.opengl.GL11;
import java.util.function.BooleanSupplier;

/** Owns one scratch color target. Never samples an attachment while rendering into it.
 * Runs AFTER the world/hand, BEFORE all HUD/screens, and preserves vanilla's depth buffer.
 */
public final class CosmicRenderer {
    private static ShaderProgram cosmos, blit;
    private static Framebuffer scratch;
    private static final Matrix4f projection = new Matrix4f(), inverseProjection = new Matrix4f(), cameraToWorld = new Matrix4f(), worldToCamera = new Matrix4f();
    private static Vec3d camera = Vec3d.ZERO;
    private static boolean captured, failed;
    private static String failure = "";
    private static BooleanSupplier irisActive = () -> false;
    private CosmicRenderer() {}
    public static String status() {
        if (failed) return "Disabled safely: " + failure;
        if (irisActive.getAsBoolean()) return "Iris pack active: Beyond visuals suspended";
        return cosmos == null || blit == null ? "Waiting for shader resources" : "GLSL ready · " + BeyondClient.CONFIG.raySteps() + " ray steps";
    }
    public static boolean ready() { return cosmos != null && blit != null && !failed; }
    public static void initialize() {
        // A shader pack may own a different G-buffer/depth convention. Do not guess or silently corrupt it.
        if (FabricLoader.getInstance().isModLoaded("iris")) {
            try {
                Class<?> api = Class.forName("net.irisshaders.iris.api.v0.IrisApi");
                Object instance = api.getMethod("getInstance").invoke(null);
                var method = api.getMethod("isShaderPackInUse");
                irisActive = () -> { try { return (boolean) method.invoke(instance); } catch (Exception e) { return true; } };
            } catch (ReflectiveOperationException e) { irisActive = () -> true; }
        }
        CoreShaderRegistrationCallback.EVENT.register(context -> {
            cosmos = null; blit = null; failed = false; failure = "";
            try {
                context.register(BeyondMinecraft.id("cosmos"), VertexFormats.POSITION_TEXTURE, shader -> cosmos = shader);
                context.register(BeyondMinecraft.id("blit"), VertexFormats.POSITION_TEXTURE, shader -> blit = shader);
            } catch (Exception error) { fail("shader compilation", error); }
        });
        WorldRenderEvents.START.register(context -> captured = false);
        WorldRenderEvents.LAST.register(context -> {
            projection.set(context.projectionMatrix()); inverseProjection.set(projection).invert();
            worldToCamera.set(context.positionMatrix()); cameraToWorld.set(worldToCamera).invert();
            camera = context.camera().getPos(); captured = true;
        });
    }
    public static void render(float delta) {
        MinecraftClient client = MinecraftClient.getInstance();
        if (client.world == null || client.player == null || !captured || !ready() || !BeyondClient.CONFIG.enabled || irisActive.getAsBoolean()) return;
        captured = false;
        Framebuffer main = client.getFramebuffer();
        int width = main.textureWidth, height = main.textureHeight;
        if (width < 1 || height < 1 || main.getDepthAttachment() < 0) return;
        ShaderProgram previous = RenderSystem.getShader();
        boolean depth = GL11.glIsEnabled(GL11.GL_DEPTH_TEST), blend = GL11.glIsEnabled(GL11.GL_BLEND), cull = GL11.glIsEnabled(GL11.GL_CULL_FACE);
        boolean depthMask = GL11.glGetBoolean(GL11.GL_DEPTH_WRITEMASK);
        try {
            if (scratch == null) scratch = new SimpleFramebuffer(width, height, false, MinecraftClient.IS_SYSTEM_MAC);
            else if (scratch.textureWidth != width || scratch.textureHeight != height) scratch.resize(width, height, MinecraftClient.IS_SYSTEM_MAC);
            scratch.beginWrite(true);
            RenderSystem.disableDepthTest(); RenderSystem.depthMask(false); RenderSystem.disableBlend(); RenderSystem.disableCull();
            cosmos.addSampler("SceneSampler", main.getColorAttachment());
            cosmos.addSampler("DepthSampler", main.getDepthAttachment());
            cosmos.getUniformOrDefault("InverseProjection").set(inverseProjection);
            cosmos.getUniformOrDefault("Projection").set(projection);
            cosmos.getUniformOrDefault("CameraToWorld").set(cameraToWorld);
            cosmos.getUniformOrDefault("WorldToCamera").set(worldToCamera);
            cosmos.getUniformOrDefault("Resolution").set((float) width, (float) height);
            cosmos.getUniformOrDefault("CameraPosition").set((float) (camera.x % 8192), (float) (camera.y % 8192), (float) (camera.z % 8192));
            float time = ((ClientReality.ticks % 144000) + delta) / 20f;
            cosmos.getUniformOrDefault("Time").set(BeyondClient.CONFIG.reducedMotion ? 0 : time);
            cosmos.getUniformOrDefault("IntroPhase").set(ClientReality.intro(delta));
            cosmos.getUniformOrDefault("Motion").set(BeyondClient.CONFIG.reducedMotion ? 0f : 1f);
            cosmos.getUniformOrDefault("EffectStrength").set(BeyondClient.CONFIG.intensity);
            cosmos.getUniformOrDefault("RaySteps").set((float) BeyondClient.CONFIG.raySteps());
            cosmos.getUniformOrDefault("LensMode").set(BeyondClient.wearingGlasses() ? (float) BeyondClient.CONFIG.lens : -1f);
            cosmos.getUniformOrDefault("Transition").set(ClientReality.transition());
            boolean beyond = Journey.inRealm(client.world.getRegistryKey());
            float realmTheme = -1;
            if (beyond) for (var realm : BeyondMinecraft.CATALOG.realms()) if (realm.id().equals(client.world.getRegistryKey().getValue().getPath())) realmTheme = realm.theme();
            cosmos.getUniformOrDefault("RealmTheme").set(realmTheme);
            cosmos.getUniformOrDefault("CosmicPresence").set(BeyondClient.CONFIG.cosmicSky && (beyond || client.world.getRegistryKey().equals(World.OVERWORLD)) ? 1f : 0f);
            int count = ClientReality.world != null && ClientReality.world.equals(client.world.getRegistryKey().getValue()) ? ClientReality.nodes.size() : 0;
            for (int i = 0; i < 4; i++) {
                if (i >= count) {
                    cosmos.getUniformOrDefault("Node" + i).set(0f, 0f, 0f, 0f);
                    cosmos.getUniformOrDefault("Style" + i).set(0f, 0f, 0f, 0f);
                    continue;
                }
                var node = ClientReality.nodes.get(i);
                float age = node.age() + ClientReality.ticks - ClientReality.receivedAt + delta;
                float envelope = Math.clamp(age / 24f, 0, 1) * Math.clamp((node.lifetime() - age) / 20f, 0, 1);
                var realm = BeyondMinecraft.CATALOG.realms().get(Math.floorMod(node.realm(), BeyondMinecraft.CATALOG.realms().size()));
                cosmos.getUniformOrDefault("Node" + i).set((float) (node.x() - camera.x), (float) (node.y() - camera.y), (float) (node.z() - camera.z), node.radius() * envelope);
                cosmos.getUniformOrDefault("Style" + i).set(node.kind() + 1f, node.yaw(), (float) realm.seed(), (float) realm.theme());
            }
            draw(cosmos);
            main.beginWrite(true);
            blit.addSampler("SceneSampler", scratch.getColorAttachment());
            draw(blit);
        } catch (Exception error) {
            fail("post-process runtime", error);
            client.player.sendMessage(Text.literal("Beyond visuals disabled safely. Gameplay is intact. Check latest.log; [B] opens the guide."), false);
        } finally {
            main.beginWrite(true);
            if (depth) RenderSystem.enableDepthTest(); else RenderSystem.disableDepthTest();
            RenderSystem.depthMask(depthMask);
            if (blend) RenderSystem.enableBlend(); else RenderSystem.disableBlend();
            if (cull) RenderSystem.enableCull(); else RenderSystem.disableCull();
            RenderSystem.setShader(() -> previous);
        }
    }
    private static void draw(ShaderProgram shader) {
        RenderSystem.setShader(() -> shader);
        var buffer = Tessellator.getInstance().begin(VertexFormat.DrawMode.QUADS, VertexFormats.POSITION_TEXTURE);
        buffer.vertex(-1, -1, 0).texture(0, 0);
        buffer.vertex(1, -1, 0).texture(1, 0);
        buffer.vertex(1, 1, 0).texture(1, 1);
        buffer.vertex(-1, 1, 0).texture(0, 1);
        BufferRenderer.drawWithGlobalProgram(buffer.end());
    }
    private static void fail(String stage, Exception error) {
        failed = true; failure = stage;
        BeyondMinecraft.LOGGER.error("Beyond {} failed; retaining vanilla rendering", stage, error);
    }
    public static void release() {
        if (scratch != null) { scratch.delete(); scratch = null; }
        captured = false;
        // ShaderProgram lifecycle is owned by GameRenderer's resource reload, not by this framebuffer owner.
    }
}
