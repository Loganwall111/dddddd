package dev.beyondlimits.client;

import com.mojang.blaze3d.systems.RenderSystem;
import net.fabricmc.fabric.api.client.rendering.v1.WorldRenderContext;
import net.minecraft.client.render.BufferBuilder;
import net.minecraft.client.render.BufferRenderer;
import net.minecraft.client.render.GameRenderer;
import net.minecraft.client.render.Tessellator;
import net.minecraft.client.render.VertexFormat;
import net.minecraft.client.render.VertexFormats;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.util.math.RotationAxis;
import net.minecraft.util.math.random.Random;
import org.joml.Matrix4f;

/** Animated, geometry-first skybox for the Codeverse. No Iris or shader loader is required. */
public final class CodeverseSkyRenderer {
    private static final float SKY_RADIUS = 150.0F;

    private CodeverseSkyRenderer() {
    }

    public static void render(WorldRenderContext context) {
        MatrixStack matrices = context.matrixStack();
        float time = context.world().getTime() + context.tickDelta();
        matrices.push();
        matrices.multiply(RotationAxis.POSITIVE_Y.rotation(time * 0.00012F));
        matrices.multiply(RotationAxis.POSITIVE_Z.rotation((float) Math.sin(time * 0.000035F) * 0.035F));

        RenderSystem.disableDepthTest();
        RenderSystem.depthMask(false);
        RenderSystem.disableCull();
        RenderSystem.setShader(GameRenderer::getPositionColorProgram);
        RenderSystem.disableBlend();
        drawSkyCube(matrices.peek().getPositionMatrix());

        RenderSystem.enableBlend();
        RenderSystem.defaultBlendFunc();
        drawStars(matrices.peek().getPositionMatrix(), time);
        drawLenses(matrices.peek().getPositionMatrix(), time);

        RenderSystem.disableBlend();
        RenderSystem.enableCull();
        RenderSystem.depthMask(true);
        RenderSystem.enableDepthTest();
        matrices.pop();
    }

    private static void drawSkyCube(Matrix4f matrix) {
        BufferBuilder buffer = Tessellator.getInstance().getBuffer();
        buffer.begin(VertexFormat.DrawMode.QUADS, VertexFormats.POSITION_COLOR);
        float r = SKY_RADIUS;
        // Six inward-facing quads. Culling and depth writes are disabled during the sky pass.
        quad(buffer, matrix, -r, -r, -r, r, -r, -r, r, r, -r, -r, r, -r);
        quad(buffer, matrix, r, -r, r, -r, -r, r, -r, r, r, r, r, r);
        quad(buffer, matrix, -r, -r, r, -r, -r, -r, -r, r, -r, -r, r, r);
        quad(buffer, matrix, r, -r, -r, r, -r, r, r, r, r, r, r, -r);
        quad(buffer, matrix, -r, r, -r, r, r, -r, r, r, r, -r, r, r);
        quad(buffer, matrix, -r, -r, r, r, -r, r, r, -r, -r, -r, -r, -r);
        BufferRenderer.drawWithGlobalProgram(buffer.end());
    }

    private static void drawStars(Matrix4f matrix, float time) {
        BufferBuilder buffer = Tessellator.getInstance().getBuffer();
        buffer.begin(VertexFormat.DrawMode.QUADS, VertexFormats.POSITION_COLOR);
        Random random = Random.create(0xC0DE_71A5L);
        for (int i = 0; i < 420; i++) {
            float x = (random.nextFloat() - 0.5F) * SKY_RADIUS * 1.65F;
            float y = (random.nextFloat() - 0.5F) * SKY_RADIUS * 1.65F;
            float z = -SKY_RADIUS * (0.84F + random.nextFloat() * 0.12F);
            float size = 0.10F + random.nextFloat() * 0.28F;
            float twinkle = 0.48F + 0.52F * (float) Math.sin(time * (0.001F + random.nextFloat() * 0.002F) + i * 2.1F);
            float tint = random.nextFloat();
            float red = 0.46F + 0.34F * tint;
            float green = 0.60F + 0.28F * random.nextFloat();
            float blue = 0.86F + 0.14F * random.nextFloat();
            colorQuad(buffer, matrix, x - size, y - size, z, x + size, y + size, z,
                    red, green, blue, Math.max(0.18F, twinkle));
        }
        BufferRenderer.drawWithGlobalProgram(buffer.end());
    }

    private static void drawLenses(Matrix4f matrix, float time) {
        BufferBuilder buffer = Tessellator.getInstance().getBuffer();
        buffer.begin(VertexFormat.DrawMode.QUADS, VertexFormats.POSITION_COLOR);
        float z = -SKY_RADIUS * 0.72F;
        float rotation = time * 0.00024F;

        // A nested, animated lens sits at the vanishing point. Broken arcs suggest a world that is
        // being refracted rather than a conventional planet or a flat painted backdrop.
        ring(buffer, matrix, 16.0F, 0.34F, z, rotation, 0.83F, 0.31F, 1.0F, 0.78F);
        ring(buffer, matrix, 24.0F, 0.22F, z - 0.4F, -rotation * 0.72F, 0.23F, 0.72F, 1.0F, 0.56F);
        ring(buffer, matrix, 33.0F, 0.17F, z - 0.8F, rotation * 0.41F, 1.0F, 0.40F, 0.76F, 0.34F);
        ring(buffer, matrix, 47.0F, 0.12F, z - 1.1F, -rotation * 0.27F, 0.36F, 0.47F, 1.0F, 0.26F);

        // Small orbiting fracture marks add motion without filling the whole sky with noise.
        for (int i = 0; i < 11; i++) {
            float angle = rotation * (0.8F + i * 0.055F) + i * 0.571F;
            float radius = 38.0F + (i % 4) * 8.0F;
            float x = (float) Math.cos(angle) * radius;
            float y = (float) Math.sin(angle) * radius * 0.66F;
            float size = 0.35F + (i % 3) * 0.12F;
            colorQuad(buffer, matrix, x - size, y - size * 2.2F, z - 2.0F,
                    x + size, y + size * 2.2F, z - 2.0F, 0.82F, 0.62F, 1.0F, 0.60F);
        }
        BufferRenderer.drawWithGlobalProgram(buffer.end());
    }

    private static void ring(BufferBuilder buffer, Matrix4f matrix, float radius, float thickness,
                            float z, float rotation, float red, float green, float blue, float alpha) {
        int segments = 112;
        for (int i = 0; i < segments; i++) {
            float a0 = rotation + (float) (Math.PI * 2.0 * i / segments);
            float a1 = rotation + (float) (Math.PI * 2.0 * (i + 1) / segments);
            if ((i % 17) >= 13) continue; // deliberate discontinuities in the lens.
            float wobble0 = 1.0F + 0.012F * (float) Math.sin(a0 * 7.0F + rotation * 4.0F);
            float wobble1 = 1.0F + 0.012F * (float) Math.sin(a1 * 7.0F + rotation * 4.0F);
            float r0 = radius * wobble0;
            float r1 = radius * wobble1;
            vertex(buffer, matrix, (float) Math.cos(a0) * (r0 - thickness), (float) Math.sin(a0) * (r0 - thickness), z, red, green, blue, alpha * 0.55F);
            vertex(buffer, matrix, (float) Math.cos(a0) * (r0 + thickness), (float) Math.sin(a0) * (r0 + thickness), z, red, green, blue, alpha);
            vertex(buffer, matrix, (float) Math.cos(a1) * (r1 + thickness), (float) Math.sin(a1) * (r1 + thickness), z, red, green, blue, alpha);
            vertex(buffer, matrix, (float) Math.cos(a1) * (r1 - thickness), (float) Math.sin(a1) * (r1 - thickness), z, red, green, blue, alpha * 0.55F);
        }
    }

    private static void quad(BufferBuilder buffer, Matrix4f matrix,
                             float x1, float y1, float z1, float x2, float y2, float z2,
                             float x3, float y3, float z3, float x4, float y4, float z4) {
        skyVertex(buffer, matrix, x1, y1, z1);
        skyVertex(buffer, matrix, x2, y2, z2);
        skyVertex(buffer, matrix, x3, y3, z3);
        skyVertex(buffer, matrix, x4, y4, z4);
    }

    private static void skyVertex(BufferBuilder buffer, Matrix4f matrix, float x, float y, float z) {
        float height = Math.max(0.0F, Math.min(1.0F, (y / SKY_RADIUS + 1.0F) * 0.5F));
        float red = 0.035F + 0.16F * height;
        float green = 0.035F + 0.10F * height;
        float blue = 0.11F + 0.24F * height;
        vertex(buffer, matrix, x, y, z, red, green, blue, 1.0F);
    }

    private static void colorQuad(BufferBuilder buffer, Matrix4f matrix,
                                  float x0, float y0, float z, float x1, float y1, float z1,
                                  float red, float green, float blue, float alpha) {
        vertex(buffer, matrix, x0, y0, z, red, green, blue, alpha);
        vertex(buffer, matrix, x1, y0, z, red, green, blue, alpha);
        vertex(buffer, matrix, x1, y1, z1, red, green, blue, alpha);
        vertex(buffer, matrix, x0, y1, z1, red, green, blue, alpha);
    }

    private static void vertex(BufferBuilder buffer, Matrix4f matrix, float x, float y, float z,
                               float red, float green, float blue, float alpha) {
        buffer.vertex(matrix, x, y, z).color(red, green, blue, alpha).next();
    }
}
