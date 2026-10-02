package dev.logan.riftext;

import java.util.Locale;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;

/**
 * Inventory-placeable rift seed: placing the block removes it and tears open a real
 * {@link RiftPortalEntity} facing the placer, with trailer-accurate geometry.
 *
 * <p>This is the Phase 1 mechanism — in Phase 2 (merge into main SIFT mod), rifts will instead
 * be opened by the gauntlet/staff system already in the main mod.</p>
 */
public class RiftSeedBlock extends Block {
    private final RiftType type;

    public RiftSeedBlock(Properties properties, RiftType type) {
        super(properties);
        this.type = type;
    }

    @Override
    public void setPlacedBy(Level level, BlockPos pos, BlockState state, LivingEntity placer, ItemStack stack) {
        super.setPlacedBy(level, pos, state, placer, stack);
        if (!(level instanceof ServerLevel server)) return;
        // Remove the seed block immediately — it is only a placement trigger.
        server.removeBlock(pos, false);
        float yaw = placer == null ? 0f : placer.getYRot() + 180f;
        String command = String.format(Locale.ROOT,
            "execute in %s positioned %d.5 %d.0 %d.5 run function riftextension:rift/seed {%s}",
            server.dimension().identifier(), pos.getX(), pos.getY(), pos.getZ(),
            String.format(Locale.ROOT, "type:%d,yaw:%.1f", type.id, yaw));
        server.getServer().getCommands().performPrefixedCommand(
            server.getServer().createCommandSourceStack().withSuppressedOutput(), command);
    }
}