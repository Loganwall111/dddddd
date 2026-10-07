package dev.logan.beyond.mixin;

import dev.logan.beyond.server.Journey;
import dev.logan.beyond.server.Traveler;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.server.network.ServerPlayerEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(ServerPlayerEntity.class)
public abstract class ServerPlayerJourneyMixin implements Traveler {
    @Unique private Journey beyond$journey = new Journey();
    @Override public Journey beyond$getJourney() { return beyond$journey; }
    @Override public void beyond$setJourney(Journey journey) { beyond$journey = journey; }
    @Inject(method = "writeCustomDataToNbt", at = @At("TAIL"))
    private void beyond$write(NbtCompound nbt, CallbackInfo ci) { nbt.put("BeyondJourney", beyond$journey.write()); }
    @Inject(method = "readCustomDataFromNbt", at = @At("TAIL"))
    private void beyond$read(NbtCompound nbt, CallbackInfo ci) { beyond$journey = Journey.read(nbt.getCompound("BeyondJourney")); }
    @Inject(method = "copyFrom", at = @At("TAIL"))
    private void beyond$copy(ServerPlayerEntity oldPlayer, boolean alive, CallbackInfo ci) {
        beyond$journey = Journey.read(((Traveler) oldPlayer).beyond$getJourney().write());
    }
}
