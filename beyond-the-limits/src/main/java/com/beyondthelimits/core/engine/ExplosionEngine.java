package com.beyondthelimits.core.engine;

import com.beyondthelimits.core.BtlState;
import com.beyondthelimits.network.BtlNetworking;
import com.beyondthelimits.registry.BtlBlocks;
import com.beyondthelimits.registry.BtlParticles;
import com.beyondthelimits.registry.BtlSounds;
import com.beyondthelimits.util.BtlSafe;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.block.Block;
import net.minecraft.block.Blocks;
import net.minecraft.entity.Entity;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.effect.StatusEffectInstance;
import net.minecraft.entity.effect.StatusEffects;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Box;
import net.minecraft.util.math.Vec3d;
import net.minecraft.util.math.random.Random;
import net.minecraft.world.Heightmap;

/**
 * Nuclear physics, at Minecraft's scale.
 *
 * <p>Detonation is modelled as four separate events rather than one big boom, because that is what a
 * real detonation is and because it is what makes the difference legible to a player standing 80
 * blocks away:</p>
 *
 * <ol>
 *     <li><b>Flash</b> — a screen effect and a light pulse before any sound arrives, exactly like the
 *     real thing;</li>
 *     <li><b>Shockwave</b> — an expanding shell that damages and throws entities by distance, stopping
 *     at terrain it cannot move;</li>
 *     <li><b>Crater and ejecta</b> — a sphere carved out of the world, its walls fused to glass and
 *     obsidian by heat, with a ring of scorched, glazed ground where the blast wave passed;</li>
 *     <li><b>Fallout</b> — a mushroom column that forms over the next twenty seconds, drifting and
 *     raining corrupted stone and radioactive ash onto everything downwind, and leaving the ground
 *     contaminated for good.</li>
 * </ol>
 */
public final class ExplosionEngine {
	private ExplosionEngine() {
	}

	private static final List<Cloud> CLOUDS = new ArrayList<>();

	private static final class Cloud {
		private final ServerWorld world;
		private final Vec3d centre;
		private final float power;
		private final Vec3d drift;
		private int ticks;

		private Cloud(ServerWorld world, Vec3d centre, float power, Vec3d drift, int ticks) {
			this.world = world;
			this.centre = centre;
			this.power = power;
			this.drift = drift;
			this.ticks = ticks;
		}
	}

	/** Detonates a reality warhead. Power is the radius in blocks; 42 is the standard charge. */
	public static void detonateWarhead(ServerWorld world, Vec3d centre, float power) {
		BtlSafe.guard("explosion.warhead", () -> {
			Random random = world.getRandom();
			BlockPos blast = BlockPos.ofFloored(centre);
			BtlState state = BtlState.get();

			// 1. Flash. This reaches the player before the sound does, on purpose.
			for (ServerPlayerEntity player : world.getServer().getPlayerManager().getPlayerList()) {
				double distance = player.getPos().distanceTo(centre);

				if (distance < power * 4.0D) {
					BtlNetworking.sendScreenEffect(player, BtlNetworking.EFFECT_FLASH, 1.0F, 30);
					player.playSoundToPlayer(BtlSounds.EXPLOSION_FALLOUT, SoundCategory.WEATHER,
							(float) Math.max(0.2D, 1.0D - distance / (power * 6.0D)), 0.6F);
				}
			}

			world.spawnParticles(ParticleTypes.EXPLOSION_EMITTER, centre.x, centre.y + 1.0D, centre.z, 1, 0.0D, 0.0D, 0.0D, 0.0D);

			// 2. Shockwave: everyone gets thrown, the closest get hurt.
			for (Entity entity : world.getOtherEntities(null, new Box(blast).expand(power * 2.0D), e -> true)) {
				Vec3d away = entity.getPos().subtract(centre);
				double distance = away.length();

				if (distance < 0.4D) {
					distance = 0.4D;
				}

				double falloff = Math.max(0.0D, 1.0D - distance / (power * 2.0D));
				Vec3d push = away.normalize().multiply(2.6D * falloff * (power / 42.0D));
				entity.addVelocity(push.x, 1.4D * falloff + 0.2D, push.z);
				entity.velocityModified = true;

				if (entity instanceof LivingEntity living && distance < power * 1.5D) {
					float damage = (float) (power * 1.6D * falloff);
					living.damage(world.getDamageSources().explosion(null, null), damage);
					living.addStatusEffect(new StatusEffectInstance(StatusEffects.NAUSEA, 400, 2, true, false), null);
					living.addStatusEffect(new StatusEffectInstance(StatusEffects.WEAKNESS, 600, 1, true, false), null);
				}
			}

			// 3. Crater, fused lining, ejecta ring.
			crater(world, blast, power);

			// 4. Fallout, over the next twenty seconds.
			Vec3d drift = new Vec3d((random.nextDouble() - 0.5D) * 0.35D, 0.0D, (random.nextDouble() - 0.5D) * 0.35D);
			CLOUDS.add(new Cloud(world, centre, power, drift, 20 * 20));
			falloutRing(world, blast, power, random);

			// The world notices: nuclear detonations are an event, not a crafting recipe.
			state.addReality(-3);
			state.setBleeding(Math.min(100, state.bleeding() + 6));
			state.setSkyCrack(Math.min(100, state.skyCrack() + 4));

			for (ServerPlayerEntity player : world.getServer().getPlayerManager().getPlayerList()) {
				BtlNetworking.sendSkyState(player);
			}
		});
	}

	private static void crater(ServerWorld world, BlockPos centre, float power) {
		int radius = (int) power;

		for (int x = -radius; x <= radius; x++) {
			for (int y = -radius; y <= radius; y++) {
				for (int z = -radius; z <= radius; z++) {
					double distance = Math.sqrt(x * x + y * y + z * z);

					if (distance > radius) {
						continue;
					}

					BlockPos pos = centre.add(x, y, z);

					if (distance > radius - 2.5D) {
						// The fused wall: glass where the heat was, obsidian where it was hotter.
						world.setBlockState(pos, distance > radius - 1.2D ? Blocks.OBSIDIAN.getDefaultState()
								: Blocks.GLASS.getDefaultState(), Block.NOTIFY_LISTENERS);
					} else {
						world.breakBlock(pos, false);
					}
				}
			}
		}

		// The ground around the crater is glazed and dead.
		BlockPos surface = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING, centre);

		for (int x = -radius * 2; x <= radius * 2; x++) {
			for (int z = -radius * 2; z <= radius * 2; z++) {
				double distance = Math.sqrt(x * x + z * z);

				if (distance <= radius || distance > radius * 2.0D) {
					continue;
				}

				BlockPos top = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING, surface.add(x, 0, z));

				if (world.getRandom().nextInt(3) == 0) {
					world.setBlockState(top, BtlBlocks.CORRUPTED_SOIL.getDefaultState(), Block.NOTIFY_LISTENERS);
				}
			}
		}
	}

	/** Radioactive ash, carried downwind. */
	private static void falloutRing(ServerWorld world, BlockPos centre, float power, Random random) {
		int radius = (int) (power * 3.0D);

		for (int i = 0; i < radius * 8; i++) {
			double angle = random.nextDouble() * Math.PI * 2.0D;
			double distance = random.nextDouble() * radius;
			BlockPos pos = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING,
					centre.add((int) (Math.cos(angle) * distance), 0, (int) (Math.sin(angle) * distance)));

			if (world.getBlockState(pos).isAir()) {
				continue;
			}

			if (random.nextInt(8) == 0) {
				world.setBlockState(pos.up(), BtlBlocks.CORRUPTED_STONE.getDefaultState(), Block.NOTIFY_LISTENERS);
			}

			world.spawnParticles(ParticleTypes.WHITE_ASH, pos.getX() + 0.5D, pos.getY() + 1.5D, pos.getZ() + 0.5D,
					2, 0.4D, 0.6D, 0.4D, 0.01D);
		}
	}

	/** Called every tick from the engine: mushroom columns, and what falls out of them. */
	public static void tick(MinecraftServer server, int ticks) {
		if (CLOUDS.isEmpty()) {
			return;
		}

		CLOUDS.removeIf(cloud -> {
			BtlSafe.guard("explosion.cloud", () -> tickCloud(cloud));
			cloud.ticks--;
			return cloud.ticks <= 0;
		});
	}

	private static void tickCloud(Cloud cloud) {
		ServerWorld world = cloud.world;

		if (world.getServer() == null) {
			return;
		}

		int age = 20 * 20 - cloud.ticks;
		double stem = Math.min(1.0D, age / 100.0D);
		Vec3d base = cloud.centre;

		// Stem: rising smoke, thicker at the bottom.
		for (int i = 0; i < 6; i++) {
			double y = base.y + stem * 40.0D * (i / 6.0D);
			double spread = 1.5D + i * 0.6D;
			world.spawnParticles(ParticleTypes.LARGE_SMOKE,
					base.x + cloud.drift.x * age, y, base.z + cloud.drift.z * age,
					4, spread, 1.5D, spread, 0.02D);
			world.spawnParticles(ParticleTypes.SMOKE,
					base.x + cloud.drift.x * age, y, base.z + cloud.drift.z * age,
					6, spread * 1.4D, 1.8D, spread * 1.4D, 0.04D);
		}

		// Cap: mushrooms out at the top, then gives up its ash.
		double capY = base.y + 42.0D;

		if (age > 60) {
			world.spawnParticles(ParticleTypes.LARGE_SMOKE, base.x, capY, base.z, 30, 14.0D, 3.0D, 14.0D, 0.02D);
			world.spawnParticles(ParticleTypes.ASH, base.x, capY, base.z, 12, 12.0D, 3.0D, 12.0D, 0.05D);
			world.spawnParticles(BtlParticles.REALITY_SCAR, base.x, capY, base.z, 6, 10.0D, 3.0D, 10.0D, 0.03D);

			if (age % 20 == 0) {
				BlockPos raining = BlockPos.ofFloored(base.x + cloud.drift.x * age + (world.getRandom().nextDouble() - 0.5D) * 30.0D,
						capY, base.z + cloud.drift.z * age + (world.getRandom().nextDouble() - 0.5D) * 30.0D);
				BlockPos ground = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING, raining);

				world.setBlockState(ground.up(), BtlBlocks.CORRUPTED_SOIL.getDefaultState(), Block.NOTIFY_LISTENERS);
				world.playSound(null, ground, BtlSounds.EXPLOSION_FALLOUT, SoundCategory.WEATHER, 0.6F, 1.4F);
			}
		}
	}

	/**
	 * A conventional-looking blast for the mod's smaller effects. Kept separate so that the warhead
	 * can stay nuclear.
	 */
	public static void blast(ServerWorld world, Vec3d centre, float power) {
		BtlSafe.guard("explosion.blast", () -> {
			world.spawnParticles(ParticleTypes.EXPLOSION_EMITTER, centre.x, centre.y, centre.z, 1, 0.0D, 0.0D, 0.0D, 0.0D);
			world.playSound(null, BlockPos.ofFloored(centre), BtlSounds.EXPLOSION_FALLOUT, SoundCategory.BLOCKS, 1.4F, 1.0F);

			for (Entity entity : world.getOtherEntities(null, new Box(BlockPos.ofFloored(centre)).expand(power), e -> true)) {
				double distance = entity.getPos().distanceTo(centre);
				double falloff = Math.max(0.0D, 1.0D - distance / power);
				Vec3d push = entity.getPos().subtract(centre).normalize().multiply(falloff * 1.6D);
				entity.addVelocity(push.x, falloff, push.z);
				entity.velocityModified = true;

				if (entity instanceof LivingEntity living) {
					living.damage(world.getDamageSources().explosion(null, null), (float) (power * falloff));
				}
			}
		});
	}
}
