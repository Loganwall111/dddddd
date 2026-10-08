package dev.beyondlimits.entity;

import dev.beyondlimits.BeyondLimits;
import net.minecraft.client.render.entity.EntityRendererFactory;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.client.render.entity.MobEntityRenderer;
import net.minecraft.client.render.entity.model.EntityModelLayer;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.BlockPos;

public final class ObserverRenderer extends MobEntityRenderer<ObserverEntity, ObserverModel> {
    public static final EntityModelLayer MODEL_LAYER = new EntityModelLayer(BeyondLimits.id("observer"), "main");
    private static final Identifier OBSERVER_TEXTURE = BeyondLimits.id("textures/entity/observer.png");
    private static final Identifier MIRROR_TEXTURE = BeyondLimits.id("textures/entity/mirror_echo.png");
    private static final Identifier FRAYLING_TEXTURE = BeyondLimits.id("textures/entity/frayling.png");

    public ObserverRenderer(EntityRendererFactory.Context context) {
        super(context, new ObserverModel(context.getPart(MODEL_LAYER)), 0.35F);
    }

    @Override
    public Identifier getTexture(ObserverEntity entity) {
        if (entity.getType() == ModEntities.MIRROR_ECHO) return MIRROR_TEXTURE;
        if (entity.getType() == ModEntities.FRAYLING) return FRAYLING_TEXTURE;
        return OBSERVER_TEXTURE;
    }

    @Override
    protected void scale(ObserverEntity entity, MatrixStack matrices, float amount) {
        if (entity.getType() == ModEntities.FRAYLING) {
            matrices.scale(0.48F, 0.48F, 0.48F);
        }
    }

    @Override
    protected int getBlockLight(ObserverEntity entity, BlockPos pos) {
        return 15;
    }
}
