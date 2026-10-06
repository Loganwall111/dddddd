package dev.logan.beyond.client.mixin;

import dev.logan.beyond.client.render.CosmicRenderer;
import net.minecraft.client.render.GameRenderer;
import net.minecraft.client.render.RenderTickCounter;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(GameRenderer.class)
public abstract class GameRendererMixin {
    @Inject(method = "renderWorld", at = @At("TAIL"))
    private void beyond$afterWorld(RenderTickCounter counter, CallbackInfo ci) {
        CosmicRenderer.render(counter.getTickDelta(false));
    }
}
