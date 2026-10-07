package dev.logan.beyond.server;

import dev.logan.beyond.BeyondMinecraft;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.nbt.NbtElement;
import net.minecraft.nbt.NbtList;
import net.minecraft.registry.RegistryKey;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.world.World;

public final class InventoryVault {
    private InventoryVault() {}
    public static NbtCompound capture(ServerPlayerEntity player) {
        NbtCompound state = new NbtCompound();
        state.put("Items", player.getInventory().writeNbt(new NbtList()));
        state.putInt("Selected", player.getInventory().selectedSlot);
        return state;
    }
    public static void switchFor(ServerPlayerEntity player, RegistryKey<World> destination, NbtCompound live) {
        Journey journey = Journey.of(player);
        // Disabling isolation never silently abandons an existing vault: return to root first.
        if (!BeyondMinecraft.CONFIG.realmInventories && journey.inventory.active().equals("root")) return;
        String scope = Journey.scope(destination);
        if (scope.equals(journey.inventory.active())) return;
        // Close any carried crafting/cursor stack BEFORE the snapshot in normal world-change handling.
        // The server's dimension switch already closes non-player handlers; callers close the player handler too.
        NbtCompound restored = journey.inventory.switchTo(scope, live);
        player.getInventory().readNbt(restored.getList("Items", NbtElement.COMPOUND_TYPE));
        player.getInventory().selectedSlot = Math.clamp(restored.getInt("Selected"), 0, 8);
        player.getInventory().markDirty();
        player.playerScreenHandler.sendContentUpdates();
        player.currentScreenHandler.syncState();
    }
}
