package com.beyondthelimits.entity;

import net.minecraft.entity.EntityType;
import net.minecraft.entity.ai.goal.ActiveTargetGoal;
import net.minecraft.entity.mob.SkeletonEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.world.World;

/**
 * A skeleton that has learned which weapon works.
 *
 * <p>Stage 2 of skeleton evolution: it spawns holding a crossbow instead of a bow, keeps its
 * distance, and leads its shots. The original bow is left on the floor as a hint.</p>
 */
public class HunterSkeletonEntity extends SkeletonEntity {
	public HunterSkeletonEntity(EntityType<? extends HunterSkeletonEntity> type, World world) {
		super(type, world);
	}

	public static net.minecraft.entity.attribute.DefaultAttributeContainer.Builder createHunterAttributes() {
		return SkeletonEntity.createAbstractSkeletonAttributes()
				.add(net.minecraft.entity.attribute.EntityAttributes.GENERIC_MAX_HEALTH, 22.0D)
				.add(net.minecraft.entity.attribute.EntityAttributes.GENERIC_MOVEMENT_SPEED, 0.28D);
	}

	@Override
	protected void initEquipment(net.minecraft.util.math.random.Random random, net.minecraft.world.LocalDifficulty difficulty) {
		super.initEquipment(random, difficulty);
		this.equipStack(net.minecraft.entity.EquipmentSlot.MAINHAND, new ItemStack(Items.CROSSBOW));
	}

	@Override
	protected void initGoals() {
		super.initGoals();
		this.targetSelector.add(2, new ActiveTargetGoal<>(this, PlayerEntity.class, true, true));
	}
}
