package com.beyondthelimits.registry;

import com.beyondthelimits.BeyondTheLimits;
import com.beyondthelimits.block.entity.SignalMachineBlockEntity;
import net.fabricmc.fabric.api.object.builder.v1.block.entity.FabricBlockEntityTypeBuilder;
import net.minecraft.block.entity.BlockEntityType;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;

/** Block entities. Chapter One only needs one: the machine that transmits the Signal. */
public final class BtlBlockEntities {
	private BtlBlockEntities() {
	}

	public static final BlockEntityType<SignalMachineBlockEntity> SIGNAL_MACHINE =
			FabricBlockEntityTypeBuilder.create(SignalMachineBlockEntity::new, BtlBlocks.SIGNAL_MACHINE).build();

	public static void register() {
		Registry.register(Registries.BLOCK_ENTITY_TYPE, BeyondTheLimits.id("signal_machine"), SIGNAL_MACHINE);
	}
}
