package dev.logan.entersift;

import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.context.UseOnContext;

/** Summoning egg for the alpha's vanilla-AI/display-rig creatures. No fake entity-type IDs. */
public final class CreatureEggItem extends Item {
    private final String creature;
    public CreatureEggItem(Properties properties, String creature) { super(properties); this.creature = creature; }
    @Override public InteractionResult useOn(UseOnContext context) {
        if (context.getPlayer() instanceof ServerPlayer player) {
            var pos = context.getClickedPos().relative(context.getClickedFace());
            if (!context.getLevel().getBlockState(pos).isAir()) return InteractionResult.FAIL;
            EnterTheSift.runAs(player, "execute positioned " + (pos.getX()+.5) + " " + pos.getY() + " " + (pos.getZ()+.5)
                + " run function entersift:creature/" + creature + "/spawn");
            if (!player.getAbilities().instabuild) context.getItemInHand().shrink(1);
        }
        return InteractionResult.SUCCESS;
    }
}
