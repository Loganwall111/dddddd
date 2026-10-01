package dev.logan.entersift;

import java.util.Locale;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;

/** Persistent growth/sound driver for the optional solid rift core. Staff/natural rifts stay entities. */
public final class RiftBlockEntity extends BlockEntity {
    private int age;
    private boolean opened;
    private float yaw;
    public RiftBlockEntity(BlockPos pos, BlockState state) { super(RiftBlockEntities.RIFT, pos, state); }
    public int age() { return age; }
    public void setYaw(float yaw) { this.yaw = yaw; setChanged(); }

    public static void tick(Level world, BlockPos pos, BlockState state, RiftBlockEntity self) {
        if (self.age < 100) { self.age++; if (self.age == 100) self.setChanged(); }
        if (!(world instanceof ServerLevel server)) return;
        if (!self.opened) {
            self.opened = true;
            self.setChanged(); // persist BEFORE summon: a reload must not create another rift
            String command = String.format(Locale.ROOT,
                "execute in %s positioned %d.5 %d.0 %d.5 run function entersift:rift/seed {style:3,target:3,yaw:%.1f}",
                server.dimension().identifier(), pos.getX(), pos.getY() + 1, pos.getZ(), self.yaw);
            server.getServer().getCommands().performPrefixedCommand(server.getServer().createCommandSourceStack().withSuppressedOutput(), command);
        }
        if (self.age == 8 || self.age == 33 || self.age == 58 || self.age == 83) {
            server.playSound(null, pos, SiftSounds.RIFT_GROWTH, SoundSource.BLOCKS, 0.45f, 0.65f + self.age * 0.006f);
            self.setChanged();
        }
        // Update only every 10 ticks, and only on change; never replace neighbouring terrain with light blocks.
        if (server.getGameTime() % 10 != 0) return;
        double closest = 8;
        for (var player : server.players()) {
            if (!player.isSpectator()) closest = Math.min(closest, Math.sqrt(player.distanceToSqr(pos.getX() + 0.5, pos.getY() + 0.5, pos.getZ() + 0.5)));
        }
        int light = Math.min(15, 5 + Math.round((float) ((8 - closest) * 1.25)));
        if (state.getValue(RiftCoreBlock.POWER) != light) server.setBlock(pos, state.setValue(RiftCoreBlock.POWER, light), 3);
    }
    @Override public net.minecraft.nbt.CompoundTag getUpdateTag(net.minecraft.core.HolderLookup.Provider registries) {
        return saveWithoutMetadata(registries);
    }
    @Override public net.minecraft.network.protocol.game.ClientboundBlockEntityDataPacket getUpdatePacket() {
        return net.minecraft.network.protocol.game.ClientboundBlockEntityDataPacket.create(this);
    }
    @Override protected void loadAdditional(ValueInput input) {
        super.loadAdditional(input);
        age = Math.max(0, Math.min(100, input.getIntOr("GrowthAge", 0)));
        opened = input.getBooleanOr("Opened", false);
        yaw = input.getFloatOr("Yaw", 0);
    }
    @Override protected void saveAdditional(ValueOutput output) {
        super.saveAdditional(output);
        output.putInt("GrowthAge", age);
        output.putBoolean("Opened", opened);
        output.putFloat("Yaw", yaw);
    }
}
