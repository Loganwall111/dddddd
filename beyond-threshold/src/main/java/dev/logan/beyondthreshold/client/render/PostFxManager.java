package dev.logan.beyondthreshold.client.render;

import dev.logan.beyondthreshold.BeyondTheThreshold;
import dev.logan.beyondthreshold.client.BTTClientState;
import dev.logan.beyondthreshold.config.BTTConfig;
import dev.logan.beyondthreshold.entity.BlackHoleEntity;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gl.GlUniform;
import net.minecraft.client.gl.PostEffectPass;
import net.minecraft.client.gl.JsonEffectShaderProgram;
import net.minecraft.client.render.Camera;
import net.minecraft.client.render.GameRenderer;
import net.minecraft.entity.Entity;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.Vec3d;

import java.util.List;

/**
 * Drives the vanilla post-processing pipeline with mod GLSL programs:
 * matrix dissolve (the eye intro), the six Mandela Effect realities and
 * real gravitational lensing around every black hole in view.
 */
public final class PostFxManager {
	private static String current = "";

	public static void tick(MinecraftClient client) {
	}

	public static void onFrameStart(MinecraftClient client, float tickDelta) {
		if (client.world == null || client.player == null) {
			return;
		}
		GameRenderer gr = client.gameRenderer;
		String want = desired(client);
		if (!want.equals(current)) {
			current = want;
			try {
				if (want.isEmpty()) {
					gr.disablePostProcessor();
				} else {
					gr.loadPostProcessor(new Identifier(BeyondTheThreshold.MOD_ID, want));
				}
			} catch (Exception e) {
				BeyondTheThreshold.LOGGER.error("[btt] failed to load post fx {}", want, e);
			}
		}
		if (gr.getPostProcessor() != null && !want.isEmpty()) {
			applyUniforms(client, gr, tickDelta);
		}
	}

	private static String desired(MinecraftClient client) {
		int st = BTTClientState.sequenceStage;
		if (st == 0 || st == 1) {
			return "matrix_dissolve";
		}
		if (st == 2 && BTTClientState.sequenceTick < 120) {
			return "matrix_dissolve";
		}
		if (BTTClientState.glassesWorn && BTTClientState.mandelaMode >= 0) {
			return "mandela_" + BTTClientState.MANDELA_NAMES[BTTClientState.mandelaMode];
		}
		if (BTTConfig.get().lensingStrength > 0.01F && holeCount(client) > 0) {
			return "lensing";
		}
		return "";
	}

	private static int holeCount(MinecraftClient client) {
		int n = 0;
		for (Entity e : client.world.getEntities()) {
			if (e instanceof BlackHoleEntity && e.squaredDistanceTo(client.player.getPos()) < 160 * 160) {
				n++;
			}
		}
		return n;
	}

	@SuppressWarnings("unchecked")
	private static void applyUniforms(MinecraftClient client, GameRenderer gr, float tickDelta) {
		float time = (client.world.getTime() % 24000) + tickDelta;
		float intensity;
		if (current.startsWith("matrix_dissolve")) {
			float ramp = BTTClientState.sequenceStage <= 1
					? Math.min(1.0F, BTTClientState.sequenceTick / 50.0F)
					: Math.max(0.0F, 1.0F - BTTClientState.sequenceTick / 120.0F);
			intensity = ramp * BTTConfig.get().dissolveIntensity;
		} else if (current.startsWith("mandela_")) {
			intensity = 1.0F;
		} else {
			intensity = BTTConfig.get().lensingStrength;
		}

		float[] holes = new float[16];
		int count = 0;
		for (Entity e : client.world.getEntities()) {
			if (!(e instanceof BlackHoleEntity bh) || count >= 4) {
				continue;
			}
			if (e.squaredDistanceTo(client.player.getPos()) > 160 * 160) {
				continue;
			}
			float[] s = project(client, e.getPos());
			if (s == null) {
				continue;
			}
			double depth = e.getPos().distanceTo(client.gameRenderer.getCamera().getPos());
			float tanF = (float) Math.tan(Math.toRadians(client.options.getFov().getValue()) / 2.0);
			float sr = (float) (bh.getRadius() * 0.9 / (depth * tanF));
			holes[count * 4] = s[0];
			holes[count * 4 + 1] = s[1];
			holes[count * 4 + 2] = Math.min(2.0F, bh.getRadius() / 5.0F * (bh.isCollapsing() ? 1.7F : 1.0F));
			holes[count * 4 + 3] = Math.min(0.45F, sr);
			count++;
		}

		List<PostEffectPass> passes = gr.getPostProcessor().passes;
		for (PostEffectPass pass : passes) {
			JsonEffectShaderProgram prog = pass.getProgram();
			set(prog, "BttTime", u -> u.set(time * 0.05F));
			set(prog, "BttIntensity", u -> u.set(intensity));
			set(prog, "BttRes", u -> u.set(client.getWindow().getFramebufferWidth(),
					client.getWindow().getFramebufferHeight()));
			set(prog, "BttHoleCount", u -> u.set(count));
			for (int i = 0; i < 4; i++) {
				final int o = i * 4;
				set(prog, "BttHole" + i, u -> u.set(holes[o], holes[o + 1], holes[o + 2], holes[o + 3]));
			}
			set(prog, "BttMode", u -> u.set(BTTClientState.mandelaMode));
			set(prog, "BttSeed", u -> u.set((BTTClientState.travelSeed % 1024) / 1024.0F));
		}
	}

	private interface UniformSetter {
		void apply(GlUniform u);
	}

	private static void set(JsonEffectShaderProgram prog, String name, UniformSetter setter) {
		GlUniform u = prog.getUniformByName(name);
		if (u != null) {
			setter.apply(u);
		}
	}

	/** World position -> post-shader UV (0..1, GL origin bottom-left). */
	public static float[] project(MinecraftClient client, Vec3d pos) {
		Camera cam = client.gameRenderer.getCamera();
		Vec3d rel = pos.subtract(cam.getPos());
		double yaw = Math.toRadians(cam.getYaw());
		double pitch = Math.toRadians(cam.getPitch());
		double cy = Math.cos(yaw), sy = Math.sin(yaw);
		double cp = Math.cos(pitch), sp = Math.sin(pitch);
		Vec3d fwd = new Vec3d(-sy * cp, -sp, cy * cp);
		Vec3d right = new Vec3d(-cy, 0, -sy);
		Vec3d up = right.crossProduct(fwd);
		double depth = rel.dotProduct(fwd);
		if (depth < 0.5) {
			return null;
		}
		double tanF = Math.tan(Math.toRadians(client.options.getFov().getValue()) / 2.0);
		double aspect = (double) client.getWindow().getFramebufferWidth() / client.getWindow().getFramebufferHeight();
		double nx = rel.dotProduct(right) / (depth * tanF * aspect);
		double ny = rel.dotProduct(up) / (depth * tanF);
		if (nx < -1.4 || nx > 1.4 || ny < -1.4 || ny > 1.4) {
			return null;
		}
		return new float[]{(float) (0.5 + nx * 0.5), (float) (0.5 + ny * 0.5)};
	}

	private PostFxManager() {
	}
}
