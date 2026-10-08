package dev.beyondlimits;

import net.minecraft.registry.RegistryKey;
import net.minecraft.registry.RegistryKeys;
import net.minecraft.util.Identifier;
import net.minecraft.world.World;

public final class ModDimensions {
    public static final RegistryKey<World> CODEVERSE = RegistryKey.of(
            RegistryKeys.WORLD,
            new Identifier(BeyondLimits.MOD_ID, "codeverse")
    );

    private ModDimensions() {
    }
}
