package com.beyondthelimits.client.model;

import net.minecraft.client.model.ModelPart;
import net.minecraft.client.render.entity.model.QuadrupedEntityModel;
import net.minecraft.entity.Entity;

/**
 * The mod's quadruped rig.
 *
 * <p>{@link QuadrupedEntityModel} keeps its constructor protected, because the game expects each animal
 * to declare its own child-scaling constants. This subclass does exactly that once, for every four-legged
 * thing in the mod, so the hounds and the fog walkers share one baked model and one animation path.</p>
 *
 * <p>The numbers are the standard quadruped child-scaling constants: a scaled head, the body pulled down
 * when the animal is young, and the body's vertical offset. Adult mobs are unaffected by all of them, and
 * nothing in the mod spawns a baby.</p>
 */
public class BtlQuadrupedModel<T extends Entity> extends QuadrupedEntityModel<T> {
	public BtlQuadrupedModel(ModelPart root) {
		super(root, true, 8.0F, 7.0F, 2.0F, 2.0F, 24);
	}
}
