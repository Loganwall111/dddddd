package dev.logan.beyondthreshold.client.render;

import dev.logan.beyondthreshold.BTTGeneratedContent;
import dev.logan.beyondthreshold.client.BTTClientState;
import dev.logan.beyondthreshold.config.BTTConfig;
import dev.logan.beyondthreshold.world.BTTDimensions;
import net.fabricmc.fabric.api.client.rendering.v1.WorldRenderContext;
import net.minecraft.client.MinecraftClient;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.World;
import org.joml.Matrix4f;
import org.joml.Quaternionf;
import org.lwjgl.opengl.GL11;

/**
 * Replaces the sky with the truth: a raymarched nebula dome holding the
 * silhouette of the cosmic colossus whose body is the overworld, a
 * lensing black hole, drifting voxel isles and per-dimension palettes.
 */
public final class CosmicSkyRenderer {

	public static boolean shouldOverride() {
		MinecraftClient c = MinecraftClient.getInstance();
		if (c.world == null || !BTTConfig.get().thresholdSky) {
			return false;
		}
		if (BTTDimensions.indexOf(c.world.getRegistryKey()) >= 0) {
			return true;
		}
		return BTTClientState.thresholdActive && c.world.getRegistryKey() == World.OVERWORLD;
	}

	public static void draw(WorldRenderContext ctx) {
		if (!shouldOverride()) {
			return;
		}
		MinecraftClient c = MinecraftClient.getInstance();
		BttGL.Prog p = BttGL.get("sky/cosmic");
		if (p == null) {
			return;
		}
		p.use();

		Quaternionf q = new Quaternionf(ctx.camera().getRotation()).conjugate();
		p.mat4("RotMat", new Matrix4f().set(q));

		float aspect = (float) c.getWindow().getFramebufferWidth() / c.getWindow().getFramebufferHeight();
		Matrix4f proj = new Matrix4f().setPerspective(
				(float) Math.toRadians(c.options.getFov().getValue()), aspect, 0.05F, 500.0F);
		p.mat4("ProjMat", proj);

		float t = (c.world.getTime() % 24000) + c.getTickDelta();
		p.f("BttTime", t * 0.01F);

		int dim = BTTDimensions.indexOf(c.world.getRegistryKey());
		float[] pal = dim >= 0 ? BTTGeneratedContent.palette(dim) : null;
		if (pal == null) {
			pal = new float[]{
					0.06F, 0.02F, 0.14F,   // nebula A (violet)
					0.00F, 0.32F, 0.38F,   // nebula B (teal)
					1.00F, 0.45F, 0.18F,   // horizon (sunset fire)
					0.55F, 0.20F, 1.00F    // glow (entity light)
			};
		}
		p.v3("PalA", pal[0], pal[1], pal[2]);
		p.v3("PalB", pal[3], pal[4], pal[5]);
		p.v3("PalHorizon", pal[6], pal[7], pal[8]);
		p.v3("PalGlow", pal[9], pal[10], pal[11]);
		p.f("BttMode", dim >= 0 ? dim + 1 : 0);
		p.f("BttSeed", ((BTTClientState.travelSeed % 4096) / 4096.0F));

		Vec3d bh = new Vec3d(0.42, 0.36, -0.83).normalize();
		p.v3("BttBHDir", (float) bh.x, (float) bh.y, (float) bh.z);
		p.f("BttBHStrength", 0.9F + 0.15F * (float) Math.sin(t * 0.02));

		GL11.glEnable(GL11.GL_DEPTH_TEST);
		GL11.glDepthMask(false);
		GL11.glDisable(GL11.GL_CULL_FACE);
		GL11.glDisable(GL11.GL_BLEND);
		BttGL.drawCube();
		GL11.glDepthMask(true);
		GL11.glEnable(GL11.GL_CULL_FACE);
		BttGL.endProgram();
	}

	private CosmicSkyRenderer() {
	}
}
