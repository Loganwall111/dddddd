package com.beyondthelimits.client.render;

import com.beyondthelimits.client.ClientState;
import com.beyondthelimits.client.shader.BtlShaders;
import com.beyondthelimits.entity.RiftEntity;
import com.mojang.blaze3d.systems.RenderSystem;
import net.fabricmc.fabric.api.client.rendering.v1.WorldRenderContext;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gl.ShaderProgram;
import net.minecraft.client.render.BufferBuilder;
import net.minecraft.client.render.BufferRenderer;
import net.minecraft.client.render.Camera;
import net.minecraft.client.render.Tessellator;
import net.minecraft.client.render.VertexFormat;
import net.minecraft.client.render.VertexFormats;
import net.minecraft.entity.Entity;
import net.minecraft.util.math.Vec3d;
import org.joml.Matrix4f;
import org.joml.Quaternionf;
import org.joml.Vector3f;

/**
 * Draws every rift in the world as light rather than matter.
 *
 * <p>A rift is not a block and does not behave like one: it is a lens. This renderer feeds the rift
 * shader a set of concentric rings plus a torn rim, and the shader does the rest — a vortex that samples
 * its own coordinates twice, an event horizon that fades to nothing at the exact rim so the rift always
 * looks like a hole rather than a picture of a hole, and a colour palette chosen per rift variant, so a
 * rift to the Backrooms is not the same object as a rift to the Codescape.</p>
 *
 * <p>Rings are rebuilt from scratch every frame because they are cheap (about three hundred vertices per
 * rift) and because rebuilding lets the rim breathe: the tear pulses with the world's reality value, so
 * the more unstable the world becomes, the more violently the rifts move.</p>
 */
public final class RiftRenderer {
	private RiftRenderer() {
	}

	private static final int RING_SEGMENTS = 20;
	private static final int RINGS = 4;

	/** Rifts are only drawn inside this radius; anything further is implied by sound and by the sky. */
	private static final double MAX_DISTANCE = 128.0D;

	public static void render(WorldRenderContext context) {
		ShaderProgram program = BtlShaders.riftProgram();
		if (program == null || context.world() == null) {
			return;
		}

		Camera camera = context.camera();
		float tickDelta = context.tickCounter().getTickDelta(false);
		Matrix4f matrix = context.matrixStack().peek().getPositionMatrix();
		Quaternionf rotation = camera.getRotation();
		Vector3f right = new Vector3f(1.0F, 0.0F, 0.0F).rotate(rotation);
		Vector3f up = new Vector3f(0.0F, 1.0F, 0.0F).rotate(rotation);

		RenderSystem.disableDepthTest();
		RenderSystem.depthMask(false);
		RenderSystem.disableCull();
		RenderSystem.enableBlend();
		RenderSystem.defaultBlendFunc();
		RenderSystem.setShader(() -> program);
		RenderSystem.setShaderTexture(0, BtlShaders.RIFT_NOISE);

		BufferBuilder buffer = Tessellator.getInstance().begin(VertexFormat.DrawMode.QUADS,
				VertexFormats.POSITION_TEXTURE_COLOR);

		int drawn = 0;

		for (Entity entity : context.world().getEntities()) {
			if (!(entity instanceof RiftEntity rift) || !rift.isAlive()) {
				continue;
			}

			double distance = entity.getPos().distanceTo(camera.getPos());
			if (distance > MAX_DISTANCE) {
				continue;
			}

			drawRift(buffer, matrix, rift, camera, right, up, tickDelta, distance);
			drawn++;

			if (drawn >= 12) {
				break;
			}
		}

		if (drawn > 0) {
			BufferRenderer.drawWithGlobalProgram(buffer.end());
		}

		RenderSystem.depthMask(true);
		RenderSystem.enableDepthTest();
		RenderSystem.enableCull();
		RenderSystem.disableBlend();
	}

	private static void drawRift(BufferBuilder buffer, Matrix4f matrix, RiftEntity rift, Camera camera,
			Vector3f right, Vector3f up, float tickDelta, double distance) {
		double x = rift.prevX + (rift.getX() - rift.prevX) * tickDelta;
		double y = rift.prevY + (rift.getY() - rift.prevY) * tickDelta;
		double z = rift.prevZ + (rift.getZ() - rift.prevZ) * tickDelta;
		float baseRadius = Math.max(0.4F, rift.getRadius());
		float time = ClientState.ticks() + tickDelta;
		float reality = Math.max(0.15F, ClientState.reality() / 100.0F);
		// Nearer rifts are drawn with more energy; the tear is not a constant object.
		float intensity = Math.max(0.25F, Math.min(1.0F, 1.35F - (float) (distance / MAX_DISTANCE)));

		// The shader's Time uniform carries the phase per rift so no two rifts pulse together.
		float seed = (rift.getUuid().hashCode() & 0xFFFF) / 65535.0F;
		OverlayRenderer.set(BtlShaders.riftProgram(), "Time", time * (0.6F + seed * 0.6F));
		OverlayRenderer.set(BtlShaders.riftProgram(), "Seed", seed);
		OverlayRenderer.set(BtlShaders.riftProgram(), "Variant", rift.getVariant());
		OverlayRenderer.set(BtlShaders.riftProgram(), "Intensity", intensity * reality);
		OverlayRenderer.set(BtlShaders.riftProgram(), "Reality", reality);
		OverlayRenderer.set(BtlShaders.riftProgram(), "Seamless", rift.getMode() == RiftEntity.MODE_SEAMLESS ? 1.0F : 0.0F);
		OverlayRenderer.set(BtlShaders.riftProgram(), "Age", Math.min(1.0F, rift.getAge() / 600.0F));

		// The rim breathes: an unstable world makes the tear physically larger frame to frame.
		float breathe = 1.0F + (1.0F - reality) * 0.35F * (float) Math.sin(time * 0.11D + seed * 6.0D);

		for (int ring = 0; ring < RINGS; ring++) {
			float ringFraction = (ring + 1) / (float) RINGS;
			float radius = baseRadius * ringFraction * breathe;
			float alpha = (ring == 0 ? 1.0F : 1.0F - ringFraction * 0.7F) * intensity;
			float twist = time * 0.03F * (ring % 2 == 0 ? 1.0F : -1.0F) + seed * 6.2831855F;

			for (int segment = 0; segment < RING_SEGMENTS; segment++) {
				float angle0 = (float) (segment / (double) RING_SEGMENTS * Math.PI * 2.0D) + twist;
				float angle1 = (float) ((segment + 1) / (double) RING_SEGMENTS * Math.PI * 2.0D) + twist;
				// The rim is torn, not cut: the radius wobbles per segment by a stable hash.
				float wobble0 = 1.0F + (hash(segment, ring, seed) - 0.5F) * 0.28F * (1.0F - ringFraction * 0.5F);
				float wobble1 = 1.0F + (hash(segment + 1, ring, seed) - 0.5F) * 0.28F * (1.0F - ringFraction * 0.5F);
				float inner0 = radius * (ring == 0 ? 0.0F : 0.82F) * wobble0;
				float inner1 = radius * (ring == 0 ? 0.0F : 0.82F) * wobble1;
				float outer0 = radius * wobble0;
				float outer1 = radius * wobble1;
				int color = alphaToColor(alpha);

				float u0 = (ring + segment % 2) / (float) RINGS;
				float v0 = segment / (float) RING_SEGMENTS * 2.0F;
				vertex(buffer, matrix, x, y, z, right, up, inner0, angle0, u0, v0, color);
				vertex(buffer, matrix, x, y, z, right, up, inner1, angle1, u0, v0 + 2.0F / RING_SEGMENTS, color);
				vertex(buffer, matrix, x, y, z, right, up, outer1, angle1, u0 + 1.0F / RINGS, v0 + 2.0F / RING_SEGMENTS, color);
				vertex(buffer, matrix, x, y, z, right, up, outer0, angle0, u0 + 1.0F / RINGS, v0, color);
			}
		}

		// Torn spikes dragging outward from the rim: the thing is holding the world open and the world
		// is losing.
		int spikes = 14;
		for (int spike = 0; spike < spikes; spike++) {
			float angle = (float) (spike / (double) spikes * Math.PI * 2.0D) + time * 0.008F;
			float length = baseRadius * (1.4F + hash(spike, 77, seed) * 1.5F) * breathe;
			float width = baseRadius * (0.05F + hash(spike, 78, seed) * 0.08F);
			int color = alphaToColor(0.55F * intensity);
			float u = hash(spike, 79, seed);
			vec(buffer, matrix, x, y, z, right, up, baseRadius * 0.95F, angle - width, u, 0.9F, color);
			vec(buffer, matrix, x, y, z, right, up, baseRadius * 0.95F, angle + width, u + 0.05F, 0.9F, color);
			vec(buffer, matrix, x, y, z, right, up, length, angle, u + 0.02F, 1.0F, color);
			// Degenerate fourth vertex keeps the quad strip closed without an extra draw call.
			vec(buffer, matrix, x, y, z, right, up, length, angle, u + 0.02F, 1.0F, color);
		}

		// A last, faint wide ring: the bent light around the rift, seen from far away.
		if (distance > 24.0D) {
			int color = alphaToColor(0.18F * intensity);
			for (int segment = 0; segment < RING_SEGMENTS; segment++) {
				float angle0 = (float) (segment / (double) RING_SEGMENTS * Math.PI * 2.0D) - time * 0.01F;
				float angle1 = (float) ((segment + 1) / (double) RING_SEGMENTS * Math.PI * 2.0D) - time * 0.01F;
				float inner = baseRadius * 1.35F;
				float outer = baseRadius * (2.1F + hash(segment, 91, seed) * 0.6F);
				vec(buffer, matrix, x, y, z, right, up, inner, angle0, 0.0F, 0.0F, color);
				vec(buffer, matrix, x, y, z, right, up, inner, angle1, 0.25F, 0.0F, color);
				vec(buffer, matrix, x, y, z, right, up, outer, angle1, 0.25F, 1.0F, color);
				vec(buffer, matrix, x, y, z, right, up, outer, angle0, 0.0F, 1.0F, color);
			}
		}
	}

	private static void vertex(BufferBuilder buffer, Matrix4f matrix, double x, double y, double z, Vector3f right,
			Vector3f up, float radius, float angle, float u, float v, int color) {
		float cos = (float) Math.cos(angle);
		float sin = (float) Math.sin(angle);
		float offsetX = cos * radius;
		float offsetY = sin * radius;
		vec(buffer, matrix, x, y, z, right, up, offsetX, offsetY, u, v, color);
	}

	/** Same as {@link #vertex} but takes a pre-computed offset, used by the spikes and halo rings. */
	private static void vec(BufferBuilder buffer, Matrix4f matrix, double x, double y, double z, Vector3f right,
			Vector3f up, float offsetX, float offsetY, float u, float v, int color) {
		float px = (float) x + right.x() * offsetX + up.x() * offsetY;
		float py = (float) y + right.y() * offsetX + up.y() * offsetY;
		float pz = (float) z + right.z() * offsetX + up.z() * offsetY;
		buffer.vertex(matrix, px, py, pz).texture(u, v).color(color);
	}

	private static int alphaToColor(float alpha) {
		int a = (int) (Math.max(0.0F, Math.min(1.0F, alpha)) * 255.0F);
		return (a << 24) | 0x00FFFFFF;
	}

	/** Stable pseudo-random in [0,1) from three small integers, so the tear does not shimmer randomly. */
	private static float hash(int a, int b, float seed) {
		int h = a * 374761393 + b * 668265263 + (int) (seed * 100000.0F) * 2246822519;
		h = (h ^ (h >>> 13)) * 1274126177;
		h = h ^ (h >>> 16);
		return (h & 0xFFFF) / 65536.0F;
	}

	/** Distance-culled visibility test used by the HUD to describe what the player is looking at. */
	public static RiftEntity closestRift(Vec3d position, double maxDistance) {
		MinecraftClient client = MinecraftClient.getInstance();
		if (client.world == null) {
			return null;
		}

		RiftEntity closest = null;
		double best = maxDistance * maxDistance;

		for (Entity entity : client.world.getEntities()) {
			if (!(entity instanceof RiftEntity rift)) {
				continue;
			}

			double distance = entity.getPos().squaredDistanceTo(position);
			if (distance < best) {
				best = distance;
				closest = rift;
			}
		}

		return closest;
	}
}
