package com.beyondthelimits.client.render;

import com.mojang.blaze3d.systems.RenderSystem;
import net.minecraft.client.gl.ShaderProgram;
import net.minecraft.client.gl.Uniform;
import net.minecraft.client.render.BufferBuilder;
import net.minecraft.client.render.BufferRenderer;
import net.minecraft.client.render.Camera;
import net.minecraft.client.render.Tessellator;
import net.minecraft.client.render.VertexFormat;
import net.minecraft.client.render.VertexFormats;
import net.minecraft.util.math.Vec3d;
import org.joml.Matrix4f;
import org.joml.Quaternionf;
import org.joml.Vector3f;

/**
 * Shared plumbing for every full-screen effect the mod draws: a camera-facing quad, pinned to the camera
 * basis so it always covers the frame, drawn with a custom program and depth writes off.
 *
 * <p>It exists because the alternative — rendering into the framebuffer and running a post pass over the
 * result — needs access to the world framebuffer, which is both fragile across versions and forbidden
 * while another mod (or a shader pack) owns the pipeline. A quad the size of the screen, oriented by the
 * camera's own rotation, gets the same result with none of the ownership problems.</p>
 */
public final class OverlayRenderer {
	private OverlayRenderer() {
	}

	/** Applies the GL state every overlay wants: blended, unlit, no depth writes, no culling. */
	public static void beginOverlayState() {
		RenderSystem.disableDepthTest();
		RenderSystem.depthMask(false);
		RenderSystem.disableCull();
		RenderSystem.enableBlend();
		RenderSystem.defaultBlendFunc();
	}

	public static void endOverlayState() {
		RenderSystem.depthMask(true);
		RenderSystem.enableDepthTest();
		RenderSystem.enableCull();
		RenderSystem.disableBlend();
	}

	/**
	 * Draws a quad the size of the frame, {@code distance} blocks in front of the camera, with the
	 * fragment shader receiving normalised screen coordinates in the texture attributes.
	 *
	 * @param positionMatrix the world-to-camera matrix currently in use
	 * @param camera         the camera the quad faces
	 * @param distance       how far in front of the camera to place the quad
	 * @param scale          how many times bigger than the frame the quad is, for shake and zoom effects
	 */
	public static void drawFullscreenQuad(Matrix4f positionMatrix, Camera camera, float distance, float scale) {
		Vec3d cameraPos = camera.getPos();
		Quaternionf rotation = camera.getRotation();
		Vector3f right = new Vector3f(1.0F, 0.0F, 0.0F).rotate(rotation);
		Vector3f up = new Vector3f(0.0F, 1.0F, 0.0F).rotate(rotation);
		Vector3f forward = new Vector3f(0.0F, 0.0F, -1.0F).rotate(rotation);

		// The quad only has to cover the frustum, so its half-size grows with the distance it sits at.
		float extent = Math.max(1.0F, distance * 2.0F) * scale;
		float cx = (float) cameraPos.x + forward.x() * distance;
		float cy = (float) cameraPos.y + forward.y() * distance;
		float cz = (float) cameraPos.z + forward.z() * distance;

		BufferBuilder buffer = Tessellator.getInstance().begin(VertexFormat.DrawMode.QUADS,
				VertexFormats.POSITION_TEXTURE_COLOR);
		int white = 0xFFFFFFFF;
		vertex(buffer, positionMatrix, cx, cy, cz, right, up, -extent, -extent, 0.0F, 0.0F, white);
		vertex(buffer, positionMatrix, cx, cy, cz, right, up, -extent, extent, 0.0F, 1.0F, white);
		vertex(buffer, positionMatrix, cx, cy, cz, right, up, extent, extent, 1.0F, 1.0F, white);
		vertex(buffer, positionMatrix, cx, cy, cz, right, up, extent, -extent, 1.0F, 0.0F, white);
		BufferRenderer.drawWithGlobalProgram(buffer.end());
	}

	private static void vertex(BufferBuilder buffer, Matrix4f matrix, float cx, float cy, float cz,
			Vector3f right, Vector3f up, float offsetX, float offsetY, float u, float v, int color) {
		float x = cx + right.x() * offsetX + up.x() * offsetY;
		float y = cy + right.y() * offsetX + up.y() * offsetY;
		float z = cz + right.z() * offsetX + up.z() * offsetY;
		buffer.vertex(matrix, x, y, z).texture(u, v).color(color);
	}

	/** Binds a program and pushes one float uniform, doing nothing if the uniform is not declared. */
	public static void set(ShaderProgram program, String name, float value) {
		Uniform uniform = program.getUniformOrDefault(name);
		uniform.set(value);
	}

	public static void set4(ShaderProgram program, String name, float x, float y, float z, float w) {
		Uniform uniform = program.getUniformOrDefault(name);
		uniform.set(new org.joml.Vector4f(x, y, z, w));
	}

	public static void set3(ShaderProgram program, String name, float x, float y, float z) {
		Uniform uniform = program.getUniformOrDefault(name);
		uniform.set(new Vector3f(x, y, z));
	}

	/** Helper for the sky: the field-of-view-dependent half-size of the frame at a given distance. */
	public static float frameHalfSize(float distance, double fovDegrees) {
		double halfFov = Math.toRadians(Math.max(1.0F, fovDegrees) * 0.5F);
		return (float) (distance * Math.tan(halfFov));
	}
}
