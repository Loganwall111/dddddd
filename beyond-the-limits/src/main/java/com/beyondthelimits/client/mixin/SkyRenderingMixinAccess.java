package com.beyondthelimits.client.mixin;

import com.beyondthelimits.client.render.BtlSkyRenderer;
import net.minecraft.client.render.Camera;
import net.minecraft.client.render.WorldRenderer;
import org.joml.Matrix4f;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Invoker;

/**
 * Exposes {@code WorldRenderer.renderSky} so the mod can fall back to vanilla's sky from inside its own
 * sky pass — used by the "sky is fake" event, where the real sky has to keep rendering underneath the
 * cracks, and by the debug tooling that compares the two skies side by side.
 */
@Mixin(WorldRenderer.class)
public interface SkyRenderingMixinAccess extends BtlSkyRenderer {
	@Override
	@Invoker("renderSky")
	void btl$renderVanillaSky(Matrix4f positionMatrix, Matrix4f projectionMatrix, float tickDelta, Camera camera,
			boolean thickFog, Runnable fogCallback);
}
