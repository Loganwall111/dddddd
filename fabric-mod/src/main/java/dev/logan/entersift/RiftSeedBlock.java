package dev.logan.entersift;

import java.util.Locale;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;

/**
 * Creative "rift" blocks are seeds, not decoration: placing one removes the block and tears a real
 * rift (a RiftPortalEntity + transport marker) facing the player. The rift's colour/shape (RiftType)
 * follows its target = travel destination (0 overworld, 1 nether, 2 end, 3 sift).
 */
public class RiftSeedBlock extends Block {
    private final int style, target;

    public RiftSeedBlock(Properties properties, int style, int target) {
        super(properties);
        this.style = style;
        this.target = target;
    }

    @Override
    public void setPlacedBy(Level level, BlockPos pos, BlockState state, LivingEntity placer, ItemStack stack) {
        super.setPlacedBy(level, pos, state, placer, stack);
        if (!(level instanceof ServerLevel server)) return;
        server.removeBlock(pos, false);
        // 0.26: rift front-face fix — the renderer now adds 180 deg so the cavity faces the camera;
        // the seed must store the placer's raw yaw, not yaw+180, otherwise the rift faces away (Image 2, 7).
        float yaw = placer == null ? 0f : placer.getYRot();
        String command = String.format(Locale.ROOT,
            "execute in %s positioned %d.5 %d.0 %d.5 run function entersift:rift/seed {style:%d,target:%d,yaw:%.1f}",
            server.dimension().identifier(), pos.getX(), pos.getY(), pos.getZ(), style, target, yaw);
        server.getServer().getCommands().performPrefixedCommand(server.getServer().createCommandSourceStack().withSuppressedOutput(), command);
    }
}
