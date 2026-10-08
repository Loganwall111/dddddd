package com.beyondthelimits.client.render.entity;

import com.mojang.blaze3d.systems.RenderSystem;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.render.BufferBuilder;
import net.minecraft.client.render.BufferRenderer;
import net.minecraft.client.render.GameRenderer;
import net.minecraft.client.render.Tessellator;
import net.minecraft.client.render.VertexConsumerProvider;
import net.minecraft.client.render.VertexFormat;
import net.minecraft.client.render.VertexFormats;
import net.minecraft.client.render.entity.EntityRenderer;
import net.minecraft.client.render.entity.EntityRendererFactory;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.entity.LivingEntity;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.Vec3d;
import org.joml.Matrix4f;
import org.joml.Quaternionf;

/**
 * The renderer for things that are not really there: the Observer, fog shades, and whatever is standing
 * at the end of a long corridor.
 *
 * <p>It draws three crossed, camera-facing planes of flat colour — no texture, no lighting, the cheapest
 * draw the engine allows, which is exactly the point. A being made of crossed planes cannot be
 * inspected: walk around it and it keeps facing you, so it never resolves into a shape a player could
 * describe afterwards. Crossed planes also never show a hard silhouette edge, which is the difference
 * between "a dark figure is watching" and "a black rectangle is stuck in the floor".</p>
 *
 * <p>Alpha falls off when the player looks directly at the entity and when the entity is classed as
 * invisible by the server, so the same renderer covers the Observer's vanish-on-look behaviour and the
 * fog shades' half-presence without either entity needing its own renderer.</p>
 */
public class BtlShadowRenderer<T extends LivingEntity> extends EntityRenderer<T> {
	private final float width;
	private final float height;
	private final float red;
	private final float green;
	private final float blue;
	private final float baseAlpha;
	private final float fadeOnLook;

	public BtlShadowRenderer(EntityRendererFactory.Context context, float width, float height, float red, float green,
			float blue, float baseAlpha, float fadeOnLook) {
		super(context);
		this.width = width;
		this.height = height;
		this.red = red;
		this.green = green;
		this.blue = blue;
		this.baseAlpha = baseAlpha;
		this.fadeOnLook = fadeOnLook;
		this.shadowRadius = 0.0F;
	}

	@Override
	public void render(T entity, float yaw, float tickDelta, MatrixStack matrices, VertexConsumerProvider vertexConsumers,
			int light) {
		if (entity.isInvisible()) {
			return;
		}

		float alpha = this.baseAlpha;

		// Looking straight at these things makes them harder to see, never easier.
		MinecraftClient client = MinecraftClient.getInstance();

		if (this.fadeOnLook > 0.0F && client.player != null) {
			Vec3d toEntity = entity.getPos().subtract(client.player.getPos());
			double length = toEntity.length();

			if (length > 0.001D) {
				double facing = Math.max(0.0D, toEntity.multiply(1.0D / length).dotProduct(client.player.getRotationVec(tickDelta)));
				alpha *= (float) (1.0D - facing * facing * this.fadeOnLook);
			}
		}

		// Distance haze: at range these are barely a smudge, which is when they are most convincing.
		if (client.player != null) {
			double distance = entity.getPos().distanceTo(client.player.getPos());
			alpha *= (float) Math.max(0.25D, 1.0D - distance / 160.0D);
		}

		if (alpha <= 0.02F) {
			return;
		}

		Quaternionf cameraRotation = this.dispatcher.getRotation();
		int color = alphaColor(alpha);

		RenderSystem.disableCull();
		RenderSystem.enableBlend();
		RenderSystem.defaultBlendFunc();
		RenderSystem.depthMask(false);
		RenderSystem.setShader(GameRenderer::getPositionColorProgram);
		BufferBuilder buffer = Tessellator.getInstance().begin(VertexFormat.DrawMode.QUADS, VertexFormats.POSITION_COLOR);

		for (int plane = 0; plane < 3; plane++) {
			matrices.push();
			matrices.multiply(cameraRotation);
			// The other two planes are the same quad rotated around the entity's vertical axis, so the
			// figure has volume from every angle without ever being a solid object.
			if (plane > 0) {
				matrices.multiply(org.joml.RotationAxis.POSITIVE_Y.rotationDegrees(plane * 60.0F));
			}

			quad(buffer, matrices.peek().getPositionMatrix(), this.width, this.height, color);
			matrices.pop();
		}

		BufferRenderer.drawWithGlobalProgram(buffer.end());
		RenderSystem.depthMask(true);
		RenderSystem.disableBlend();
		RenderSystem.enableCull();
	}

	private static void quad(BufferBuilder buffer, Matrix4f matrix, float width, float height, int color) {
		float half = width * 0.5F;
		buffer.vertex(matrix, -half, 0.0F, 0.0F).color(color);
		buffer.vertex(matrix, -half, height, 0.0F).color(color);
		buffer.vertex(matrix, half, height, 0.0F).color(color);
		buffer.vertex(matrix, half, 0.0F, 0.0F).color(color);
	}

	private static int alphaColor(float alpha) {
		int a = (int) (Math.max(0.0F, Math.min(1.0F, alpha)) * 255.0F);
		return (a << 24);
	}

	/** These entities have no texture: they are their own silhouette. */
	@Override
	public Identifier getTexture(T entity) {
		return null;
	}
}
