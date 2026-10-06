package dev.logan.beyondthreshold.client.render;

import dev.logan.beyondthreshold.entity.BlackHoleEntity;
import dev.logan.beyondthreshold.entity.RealityTearEntity;
import dev.logan.beyondthreshold.entity.WatcherEyeEntity;
import net.fabricmc.fabric.api.client.rendering.v1.WorldRenderContext;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.render.Camera;
import net.minecraft.entity.Entity;
import net.minecraft.util.math.Vec3d;
import org.joml.Matrix4f;
import org.joml.Quaternionf;
import org.joml.Vector3f;
import org.lwjgl.opengl.GL11;

/**
 * Shader-geometry billboards for the threshold entities:
 * the lensing singularity disc, the human eye of the watcher and the
 * shimmering membrane tear. Pure GLSL, no textures, AAA juice.
 */
public final class EntityFxRenderer {

	public static void draw(WorldRenderContext ctx) {
		MinecraftClient c = MinecraftClient.getInstance();
		if (c.world == null) {
			return;
		}
		Camera cam = ctx.camera();
		Quaternionf q = new Quaternionf(cam.getRotation()).conjugate();
		Matrix4f rot = new Matrix4f().set(q);
		float aspect = (float) c.getWindow().getFramebufferWidth() / c.getWindow().getFramebufferHeight();
		Matrix4f proj = new Matrix4f().setPerspective(
				(float) Math.toRadians(c.options.getFov().getValue()), aspect, 0.05F, 500.0F);
		float t = (c.world.getTime() % 24000) + c.getTickDelta();

		boolean any = false;
		for (Entity e : c.world.getEntities()) {
			if (!(e instanceof BlackHoleEntity) && !(e instanceof WatcherEyeEntity)
					&& !(e instanceof RealityTearEntity)) {
				continue;
			}
			if (e.squaredDistanceTo(cam.getPos()) > 220 * 220) {
				continue;
			}
			if (!any) {
				GL11.glEnable(GL11.GL_BLEND);
				GL11.glBlendFunc(GL11.GL_SRC_ALPHA, GL11.GL_ONE_MINUS_SRC_ALPHA);
				GL11.glDepthMask(false);
				GL11.glDisable(GL11.GL_CULL_FACE);
				GL11.glEnable(GL11.GL_DEPTH_TEST);
				any = true;
			}
			Vec3d rel = e.getPos().subtract(cam.getPos());
			if (e instanceof BlackHoleEntity bh) {
				BttGL.Prog p = BttGL.get("fx/blackhole");
				if (p == null) {
					continue;
				}
				begin(p, proj, rot, rel, bh.getRadius() * 3.2F);
				p.f("BttTime", t * 0.02F);
				p.f("BttCollapse", bh.isCollapsing() ? 1.0F : 0.0F);
				BttGL.drawQuad();
			} else if (e instanceof WatcherEyeEntity eye) {
				BttGL.Prog p = BttGL.get("fx/eye");
				if (p == null) {
					continue;
				}
				begin(p, proj, rot, rel, 14.0F);
				p.f("BttTime", t * 0.02F);
				p.f("BttStage", eye.getStage());
				Vector3f look = new Vector3f((float) rel.x, (float) rel.y, (float) rel.z);
				look.normalize();
				rot.transformPosition(look);
				p.v3("BttLook", look.x, look.y, look.z);
				BttGL.drawQuad();
			} else {
				RealityTearEntity tear = (RealityTearEntity) e;
				BttGL.Prog p = BttGL.get("fx/tear");
				if (p == null) {
					continue;
				}
				begin(p, proj, rot, rel, 2.6F);
				p.f("BttTime", t * 0.03F);
				p.f("BttSeed", tear.getDimIndex() * 0.137F);
				p.f("BttOpen", tear.getOpen());
				BttGL.drawQuad();
			}
		}
		if (any) {
			GL11.glDepthMask(true);
			GL11.glEnable(GL11.GL_CULL_FACE);
			GL11.glDisable(GL11.GL_BLEND);
			BttGL.endProgram();
		}
	}

	private static void begin(BttGL.Prog p, Matrix4f proj, Matrix4f rot, Vec3d rel, float scale) {
		p.use();
		p.mat4("ProjMat", proj);
		p.mat4("RotMat", rot);
		p.v3("Rel", (float) rel.x, (float) rel.y, (float) rel.z);
		p.f("Scale", scale);
	}

	private EntityFxRenderer() {
	}
}
