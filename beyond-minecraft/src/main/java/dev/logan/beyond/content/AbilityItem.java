package dev.logan.beyond.content;

import dev.logan.beyond.server.Anomaly;
import dev.logan.beyond.server.RealityManager;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.item.tooltip.TooltipType;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import net.minecraft.util.Hand;
import net.minecraft.util.TypedActionResult;
import net.minecraft.world.World;
import java.util.List;

public final class AbilityItem extends Item {
    public enum Ability { KNIFE, RELIC, TEAR, GUIDE, SCALE }
    private final Ability ability;
    /** Installed by the client entrypoint. No net.minecraft.client reference on the dedicated server. */
    public static Runnable openGuide = () -> {};
    public AbilityItem(Ability ability) { super(new Settings().maxCount(1).rarity(net.minecraft.util.Rarity.RARE)); this.ability = ability; }
    @Override public TypedActionResult<ItemStack> use(World world, PlayerEntity user, Hand hand) {
        ItemStack stack = user.getStackInHand(hand);
        if (ability == Ability.GUIDE) {
            if (world.isClient) openGuide.run();
            return TypedActionResult.success(stack, world.isClient);
        }
        if (user instanceof ServerPlayerEntity player) {
            boolean success = switch (ability) {
                case KNIFE -> player.isSneaking() ? RealityManager.returnHome(player) : RealityManager.spawn(player, Anomaly.Kind.MEMBRANE);
                case RELIC -> RealityManager.spawn(player, Anomaly.Kind.SINGULARITY);
                case TEAR -> player.isSneaking() ? RealityManager.spawn(player, Anomaly.Kind.WORMHOLE)
                    : RealityManager.spawn(player, Anomaly.Kind.TEAR);
                case SCALE -> player.isSneaking() ? RealityManager.shrink(player) : RealityManager.grow(player);
                default -> false;
            };
            if (!success) return TypedActionResult.fail(stack);
            player.getItemCooldownManager().set(this, ability == Ability.SCALE ? 8 : 60);
        }
        return TypedActionResult.success(stack, world.isClient);
    }
    @Override public void appendTooltip(ItemStack stack, TooltipContext context, List<Text> tooltip, TooltipType type) {
        String line = switch (ability) {
            case KNIFE -> "Use: cut a membrane. Sneak-use: return home.";
            case RELIC -> "Use: open a singularity. Its horizon is a doorway.";
            case TEAR -> "Use: tear the fabric. Sneak-use: open a wormhole.";
            case GUIDE -> "A field guide to the things between worlds.";
            case SCALE -> "Use: grow a step. Sneak-use: shrink a step.";
        };
        tooltip.add(Text.literal(line).formatted(Formatting.GRAY));
        switch (ability) {
            case SCALE -> tooltip.add(Text.literal("Rungs 1/1024× to 4096×. Gigantic bodies need open sky.")
                .formatted(Formatting.DARK_AQUA));
            case TEAR -> tooltip.add(Text.literal("Tears open onto the Between; the horizon bubbles into other worlds.")
                .formatted(Formatting.DARK_AQUA));
            case KNIFE, RELIC -> tooltip.add(Text.literal("Experimental: use a backed-up test world.").formatted(Formatting.DARK_AQUA));
            default -> { }
        }
    }
}
