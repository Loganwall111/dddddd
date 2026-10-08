package dev.beyondlimits.entity;

import net.minecraft.client.model.ModelData;
import net.minecraft.client.model.ModelPart;
import net.minecraft.client.model.ModelPartBuilder;
import net.minecraft.client.model.ModelPartData;
import net.minecraft.client.model.ModelTransform;
import net.minecraft.client.model.TexturedModelData;
import net.minecraft.client.render.VertexConsumer;
import net.minecraft.client.render.entity.model.EntityModel;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.util.math.MathHelper;

public final class ObserverModel extends EntityModel<ObserverEntity> {
    private final ModelPart root;
    private final ModelPart eye;
    private final ModelPart veil;

    public ObserverModel(ModelPart root) {
        this.root = root;
        this.eye = root.getChild("eye");
        this.veil = root.getChild("veil");
    }

    public static TexturedModelData getTexturedModelData() {
        ModelData data = new ModelData();
        ModelPartData root = data.getRoot();
        root.addChild("veil", ModelPartBuilder.create()
                        .uv(0, 0).cuboid(-6.0F, -5.0F, -1.0F, 12.0F, 10.0F, 2.0F)
                        .uv(0, 13).cuboid(-4.0F, -7.0F, -0.5F, 8.0F, 2.0F, 1.0F),
                ModelTransform.NONE);
        root.addChild("eye", ModelPartBuilder.create()
                        .uv(30, 0).cuboid(-3.0F, -2.5F, -2.5F, 6.0F, 5.0F, 3.0F)
                        .uv(30, 10).cuboid(-1.5F, -1.5F, -3.1F, 3.0F, 3.0F, 1.0F),
                ModelTransform.NONE);
        return TexturedModelData.of(data, 64, 32);
    }

    @Override
    public void setAngles(ObserverEntity entity, float limbAngle, float limbDistance, float animationProgress, float headYaw, float headPitch) {
        root.yaw = headYaw * MathHelper.RADIANS_PER_DEGREE * 0.22F;
        root.pitch = headPitch * MathHelper.RADIANS_PER_DEGREE * 0.18F;
        float drift = MathHelper.sin(animationProgress * 0.045F) * 0.14F;
        veil.roll = drift;
        eye.originY = MathHelper.sin(animationProgress * 0.08F) * 0.18F;
    }

    @Override
    public void render(MatrixStack matrices, VertexConsumer vertices, int light, int overlay,
                       float red, float green, float blue, float alpha) {
        root.render(matrices, vertices, light, overlay, red, green, blue, alpha);
    }
}
