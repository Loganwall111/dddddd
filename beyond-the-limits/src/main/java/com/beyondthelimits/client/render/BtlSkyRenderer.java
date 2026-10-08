package com.beyondthelimits.client.render;

import net.minecraft.client.render.Camera;
import net.minecraft.client.render.WorldRenderer;
import org.joml.Matrix4f;

/**
 * The hook the mod's renderer needs in order to replace vanilla's sky.
 *
 * <p>The interface is implemented onto {@link WorldRenderer} by a mixin, which means anything that holds
 * a world renderer — the mod's sky code, other mods that ask for it, or a debug command — can render the
 * vanilla sky on demand without reflection.</p>
 */
public interface BtlSkyRenderer {
	/** Renders vanilla's own sky, exactly as it would have been rendered without this mod installed. */
	void btl$renderVanillaSky(Matrix4f positionMatrix, Matrix4f projectionMatrix, float tickDelta, Camera camera,
			boolean thickFog, Runnable fogCallback);

	/** Convenience cast that throws a useful message if the mixin ever fails to apply. */
	static BtlSkyRenderer of(WorldRenderer renderer) {
		if (renderer instanceof BtlSkyRenderer hook) {
			return hook;
		}

		throw new IllegalStateException("beyondthelimits: WorldRenderer was not patched for sky rendering");
	}
}
