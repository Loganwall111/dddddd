package com.beyondthelimits.client.particle;

import net.minecraft.client.particle.Particle;
import net.minecraft.client.particle.ParticleTextureSheet;
import net.minecraft.client.render.Camera;
import net.minecraft.client.render.VertexConsumer;
import net.minecraft.client.world.ClientWorld;
import net.minecraft.client.texture.Sprite;
import net.minecraft.client.particle.SpriteProvider;
import org.joml.Quaternionf;
import org.joml.Vector3f;

/**
 * One particle, used by every custom particle type in the mod.
 *
 * <p>Rather than a class per effect, the mod uses a single camera-facing billboard particle whose
 * behaviour is described by a {@link Behaviour}: how long it lives, how it moves (drift, fall, rise,
 * orbit), how it fades, how it spins, and which texture sheet it belongs to. All ten particle types are
 * then just ten behaviours, which keeps the particle code in one place and makes the effects tunable
 * without touching geometry.</p>
 *
 * <p>The one thing it does that vanilla particles do not is scroll its own UVs over its lifetime, which
 * is what lets a single 16×16 sprite read as flowing energy rather than a dot.</p>
 */
public class BtlParticle extends Particle {
	/** Every particle the mod adds, described by numbers rather than subclasses. */
	public record Behaviour(float gravity, float drag, float rise, float spread, float sizeStart, float sizeEnd,
			int lifeMin, int lifeMax, float spin, boolean scroll, boolean lit, boolean additivelyLit) {
		public static Behaviour of(float gravity, float rise, float spread, float sizeStart, float sizeEnd, int life,
				boolean lit) {
			return new Behaviour(gravity, 0.92F, rise, spread, sizeStart, sizeEnd, life, life, 0.0F, true, lit, false);
		}
	}

	private final SpriteProvider spriteProvider;
	private final Behaviour behaviour;
	private Sprite sprite;
	private final ParticleTextureSheet sheet;
	private final float spinSpeed;
	private float size;
	private float brightness = 1.0F;

	public BtlParticle(ClientWorld world, double x, double y, double z, double velocityX, double velocityY,
			double velocityZ, SpriteProvider spriteProvider, Behaviour behaviour, ParticleTextureSheet sheet) {
		super(world, x, y, z);
		this.spriteProvider = spriteProvider;
		this.behaviour = behaviour;
		this.sheet = sheet;
		this.velocityX = velocityX * behaviour.spread();
		this.velocityY = velocityY * behaviour.spread() + behaviour.rise();
		this.velocityZ = velocityZ * behaviour.spread();
		this.gravityStrength = behaviour.gravity();
		this.maxAge = behaviour.lifeMin() + this.random.nextInt(Math.max(1, behaviour.lifeMax() - behaviour.lifeMin() + 1));
		this.size = behaviour.sizeStart();
		this.spinSpeed = behaviour.spin() * (this.random.nextFloat() - 0.5F);
		this.angle = this.random.nextFloat() * 6.2831855F;
		this.collidesWithWorld = behaviour.gravity() > 0.0F;
		this.sprite = spriteProvider.getSprite(this.random);
	}

	public BtlParticle tint(float red, float green, float blue, float alpha) {
		this.red = red;
		this.green = green;
		this.blue = blue;
		this.alpha = alpha;
		return this;
	}

	public BtlParticle bright(float brightness) {
		this.brightness = brightness;
		return this;
	}

	@Override
	public void tick() {
		this.prevPosX = this.x;
		this.prevPosY = this.y;
		this.prevPosZ = this.z;

		if (this.age++ >= this.maxAge) {
			this.markDead();
			return;
		}

		this.velocityX *= this.behaviour.drag();
		this.velocityY = this.velocityY * this.behaviour.drag() - (double) this.behaviour.gravity();
		this.velocityZ *= this.behaviour.drag();
		this.move(this.velocityX, this.velocityY, this.velocityZ);

		if (this.behaviour.spin() != 0.0F) {
			this.prevAngle = this.angle;
			this.angle += this.spinSpeed;
		}

		// Life curve: fade in over the first fifth, hold, then fade out over the last half.
		float progress = (float) this.age / this.maxAge;
		float fade = progress < 0.2F ? progress / 0.2F : progress > 0.5F ? 1.0F - (progress - 0.5F) / 0.5F : 1.0F;
		this.setAlpha(Math.max(0.0F, Math.min(1.0F, fade * this.brightness)));
		this.sprite = this.spriteProvider.getSprite(this.age, this.maxAge);
	}

	@Override
	public void buildGeometry(VertexConsumer vertexConsumer, Camera camera, float tickDelta) {
		Quaternionf rotation = camera.getRotation();
		float progress = (float) this.age / this.maxAge;
		float scale = this.size * (this.behaviour.sizeStart() + (this.behaviour.sizeEnd() - this.behaviour.sizeStart()) * progress);
		float half = scale * 0.5F;
		Sprite sprite = this.sprite != null ? this.sprite : this.spriteProvider.getSprite(this.age, this.maxAge);
		float minU = sprite.getMinU();
		float maxU = sprite.getMaxU();
		float minV = sprite.getMinV();
		float maxV = sprite.getMaxV();

		// UV scroll: the sprite slides inside its atlas cell, which is what makes a rift particle look
		// like it is being dragged through itself rather than merely existing.
		if (this.behaviour.scroll()) {
			float offset = (float) this.age / this.maxAge * 0.5F;
			minV += offset;
			maxV += offset;
		}

		float x = (float) (this.prevPosX + (this.x - this.prevPosX) * tickDelta - camera.getPos().x);
		float y = (float) (this.prevPosY + (this.y - this.prevPosY) * tickDelta - camera.getPos().y);
		float z = (float) (this.prevPosZ + (this.z - this.prevPosZ) * tickDelta - camera.getPos().z);
		int light = this.behaviour.lit() ? this.getBrightness(tickDelta) : 15728880;

		for (int corner = 0; corner < 4; corner++) {
			float offsetX = ((corner & 1) == 0 ? -1 : 1) * half;
			float offsetY = ((corner & 2) == 0 ? -1 : 1) * half;
			Vector3f position = new Vector3f(offsetX, offsetY, 0.0F).rotate(rotation);
			float u = (corner & 1) == 0 ? minU : maxU;
			float v = (corner & 2) == 0 ? maxV : minV;
			vertexConsumer.vertex(position.x() + x, position.y() + y, position.z() + z)
					.texture(u, v)
					.color(this.red, this.green, this.blue, this.alpha)
					.light(light);
		}
	}

	@Override
	public ParticleTextureSheet getType() {
		return this.sheet;
	}

	public Behaviour behaviour() {
		return this.behaviour;
	}
}
