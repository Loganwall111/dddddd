package dev.beyondlimits;

import dev.beyondlimits.command.ModCommands;
import dev.beyondlimits.entity.ModEntities;
import dev.beyondlimits.world.RealityDirector;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.itemgroup.v1.ItemGroupEvents;
import net.minecraft.item.ItemGroups;
import net.minecraft.util.Identifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class BeyondLimits implements ModInitializer {
    public static final String MOD_ID = "beyondlimits";
    public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

    public static Identifier id(String path) {
        return new Identifier(MOD_ID, path);
    }

    @Override
    public void onInitialize() {
        ModBlocks.register();
        ModItems.register();
        ModEntities.register();
        RealityDirector.register();
        ModCommands.register();

        ItemGroupEvents.modifyEntriesEvent(ItemGroups.BUILDING_BLOCKS).register(entries -> {
            entries.add(ModBlocks.FRACTURED_STONE);
            entries.add(ModBlocks.NULLSTONE);
            entries.add(ModBlocks.CODEGLASS);
            entries.add(ModBlocks.MEMORY_CRYSTAL);
            entries.add(ModBlocks.REALITY_ANCHOR);
            entries.add(ModBlocks.RESONANT_CORE);
        });
        ItemGroupEvents.modifyEntriesEvent(ItemGroups.INGREDIENTS).register(entries -> {
            entries.add(ModItems.RIFT_SHARD);
        });
        ItemGroupEvents.modifyEntriesEvent(ItemGroups.TOOLS).register(entries -> {
            entries.add(ModItems.RIFT_COMPASS);
            entries.add(ModItems.FRACTURE_KEY);
        });

        LOGGER.info("Beyond the Limits: Chapter One is listening for the first fracture.");
    }
}
