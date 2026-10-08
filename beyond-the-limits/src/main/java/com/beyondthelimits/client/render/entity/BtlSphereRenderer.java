package com.beyondthelimits.client.render.entity;

import com.mojang.blaze3d.systems.RenderSystem;
import net.minecraft.client.render.BufferBuilder;
import net.minecraft.client.render.BufferRenderer;
import net.minecraft.client.render.Camera;
import net.minecraft.client.render.GameRenderer;
import net.minecraft.client.render.Tessellator;
import net.minecraft.client.render.VertexConsumerProvider;
import net.minecraft.client.render.VertexFormat;
import net.minecraft.client.render.VertexFormats;
import net.minecraft.client.render.entity.EntityRenderer;
import net.minecraft.client.render.entity.EntityRendererFactory;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.entity.Entity;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;
import org.joml.Matrix4f;

/**
 * Spheres, for the objects in this mod that are not creatures and not machines.
 *
 * <p>The Black Sun uses it at a scale of a hundred blocks, and the reality warhead uses it at half a
 * block. What makes it read as a physical object rather than a ball of paint is the rim: each vertex's
 * colour is computed from the angle between the vertex's surface direction and the line from the eye to
 * the centre, so the sphere is darkest where it faces the player and brightest where the surface turns
 * away — the same falloff a light-absorbing object has in reality, and the reason the Black Sun looks
 * like it is not a hole in the sky but a hole that arrived.</p>
 */
public class BtlSphereRenderer<T extends Entity> extends EntityRenderer<T> {
	private static final int LATITUDE_STEPS = 14;
	private static final int LONGITUDE_STEPS = 24;

	private final float radius;
	private final float coreRed;
	private final float coreGreen;
	private final float coreBlue;
	private final float rimRed;
	private final float rimGreen;
	private final float rimBlue;
	private final float rimStrength;
	private final float alpha;

	public BtlSphereRenderer(EntityRendererFactory.Context context, float radius, int coreColor, int rimColor,
			float rimStrength, float alpha) {
		super(context);
		this.radius = radius;
		this.coreRed = ((coreColor >> 16) & 0xFF) / 255.0F;
		this.coreGreen = ((coreColor >> 8) & 0xFF) / 255.0F;
		this.coreBlue = (coreColor & 0xFF) / 255.0F;
		this.rimRed = ((rimColor >> 16) & 0xFF) / 255.0F;
		this.rimGreen = ((rimColor >> 8) & 0xFF) / 255.0F;
		this.rimBlue = (rimColor & 0xFF) / 255.0F;
		this.rimStrength = rimStrength;
		this.alpha = alpha;
		this.shadowRadius = radius * 0.5F;
	}

	@Override
	public void render(T entity, float yaw, float tickDelta, MatrixStack matrices, VertexConsumerProvider vertexConsumers,
			int light) {
		Camera camera = this.dispatcher.camera;
		Vec3d eye = camera.getPos();
		Vec3d centre = entity.getPos();
		Vec3d toEye = eye.subtract(centre);
		double distance = Math.max(0.001D, toEye.length());
		Vec3d view = toEye.multiply(1.0D / distance);

		RenderSystem.disableCull();
		RenderSystem.enableBlend();
		RenderSystem.defaultBlendFunc();
		RenderSystem.depthMask(false);
		RenderSystem.setShader(GameRenderer::getPositionColorProgram);
		BufferBuilder buffer = Tessellator.getInstance().begin(VertexFormat.DrawMode.QUADS, VertexFormats.POSITION_COLOR);
		Matrix4f matrix = matrices.peek().getPositionMatrix();

		for (int latitude = 0; latitude < LATITUDE_STEPS; latitude++) {
			float phi0 = (float) Math.PI * latitude / LATITUDE_STEPS;
			float phi1 = (float) Math.PI * (latitude + 1) / LATITUDE_STEPS;
			float y0 = MathHelper.cos(phi0) * this.radius;
			float y1 = MathHelper.cos(phi1) * this.radius;
			float ring0 = MathHelper.sin(phi0) * this.radius;
			float ring1 = MathHelper.sin(phi1) * this.radius;

			for (int longitude = 0; longitude < LONGITUDE_STEPS; longitude++) {
				float theta0 = (float) (Math.PI * 2.0D * longitude / LONGITUDE_STEPS);
				float theta1 = (float) (Math.PI * 2.0D * (longitude + 1) / LONGITUDE_STEPS);
				vertex(buffer, matrix, view, ring0, theta0, y0);
				vertex(buffer, matrix, view, ring1, theta0, y1);
				vertex(buffer, matrix, view, ring1, theta1, y1);
				vertex(buffer, matrix, view, ring0, theta1, y0);
			}
		}

		BufferRenderer.drawWithGlobalProgram(buffer.end());
		RenderSystem.depthMask(true);
		RenderSystem.disableBlend();
		RenderSystem.enableCull();
	}

	private void vertex(BufferBuilder buffer, Matrix4f matrix, Vec3d view, float ring, float theta, float y) {
		float x = MathHelper.cos(theta) * ring;
		float z = MathHelper.sin(theta) * ring;
		float length = Math.max(0.0001F, MathHelper.sqrt(x * x + y * y + z * z));
		// How much the surface turns away from the eye: 0 head-on, 1 at the rim.
		float turn = 1.0F - Math.abs((x / length) * (float) view.x + (y / length) * (float) view.y
				+ (z / length) * (float) view.z);
		float glow = (float) Math.pow(turn, 2.2D) * this.rimStrength;
		float red = this.coreRed + (this.rimRed - this.coreRed) * glow;
		float green = this.coreGreen + (this.rimGreen - this.coreGreen) * glow;
		float blue = this.coreBlue + (this.rimBlue - this.coreBlue) * glow;
		int a = (int) (MathHelper.clamp(this.alpha * (0.55F + glow), 0.0F, 1.0F) * 255.0F);
		int packed = (a << 24) | (channel(red) << 16) | (channel(green) << 8) | channel(blue);
		buffer.vertex(matrix, x, y, z).color(packed);
	}

	private static int channel(float value) {
		return (int) (MathHelper.clamp(value, 0.0F, 1.0F) * 255.0F);
	}

	@Override
	public Identifier getTexture(T entity) {
		return null;
	}
}
