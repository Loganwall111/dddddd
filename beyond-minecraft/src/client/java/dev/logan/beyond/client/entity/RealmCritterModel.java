package dev.logan.beyond.client.entity;

import dev.logan.beyond.entity.RealmCritter;
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

/**
 * A code-built quadruped. Its 64x64 skin is procedurally generated with a deliberately mottled
 * body, so every face reads as hide; two small eye cubes sample a painted glow patch at (56,56).
 */
public class RealmCritterModel extends EntityModel<RealmCritter> {
    private static final float DEGREES = (float) (Math.PI / 180.0);
    private final ModelPart body, head, tail;
    private final ModelPart[] legs;
    public RealmCritterModel(ModelPart root) {
        this.body = root.getChild("body");
        this.head = body.getChild("head");
        this.tail = body.getChild("tail");
        this.legs = new ModelPart[]{body.getChild("leg_fl"), body.getChild("leg_fr"), body.getChild("leg_bl"), body.getChild("leg_br")};
    }
    public static TexturedModelData getTexturedModelData() {
        ModelData data = new ModelData();
        ModelPartData root = data.getRoot();
        ModelPartData body = root.addChild("body", ModelPartBuilder.create().uv(0, 0).cuboid(-5f, -4f, -7f, 10f, 8f, 14f),
            ModelTransform.pivot(0f, 14f, 0f));
        ModelPartData head = body.addChild("head", ModelPartBuilder.create().uv(0, 22).cuboid(-4f, -4f, -4f, 8f, 8f, 8f),
            ModelTransform.pivot(0f, -2f, -9f));
        head.addChild("eye_left", ModelPartBuilder.create().uv(56, 56).cuboid(1.6f, -1.2f, -4.7f, 2f, 2f, 1f), ModelTransform.pivot(0f, 0f, 0f));
        head.addChild("eye_right", ModelPartBuilder.create().uv(56, 56).cuboid(-3.6f, -1.2f, -4.7f, 2f, 2f, 1f), ModelTransform.pivot(0f, 0f, 0f));
        head.addChild("snout", ModelPartBuilder.create().uv(0, 38).cuboid(-2f, 0f, -6f, 4f, 3f, 2f), ModelTransform.pivot(0f, 0f, 0f));
        body.addChild("tail", ModelPartBuilder.create().uv(40, 0).cuboid(-1.5f, -3f, 0f, 3f, 3f, 9f), ModelTransform.pivot(0f, -2f, 7f));
        body.addChild("leg_fl", ModelPartBuilder.create().uv(48, 22).cuboid(-1.5f, 0f, -1.5f, 3f, 7f, 3f), ModelTransform.pivot(3.7f, 3f, -4.5f));
        body.addChild("leg_fr", ModelPartBuilder.create().uv(48, 22).cuboid(-1.5f, 0f, -1.5f, 3f, 7f, 3f), ModelTransform.pivot(-3.7f, 3f, -4.5f));
        body.addChild("leg_bl", ModelPartBuilder.create().uv(48, 22).cuboid(-1.5f, 0f, -1.5f, 3f, 7f, 3f), ModelTransform.pivot(3.7f, 3f, 5.5f));
        body.addChild("leg_br", ModelPartBuilder.create().uv(48, 22).cuboid(-1.5f, 0f, -1.5f, 3f, 7f, 3f), ModelTransform.pivot(-3.7f, 3f, 5.5f));
        return TexturedModelData.of(data, 64, 64);
    }
    @Override public void setAngles(RealmCritter entity, float limbAngle, float limbDistance, float animationProgress, float headYaw, float headPitch) {
        head.yaw = headYaw * DEGREES;
        head.pitch = headPitch * DEGREES;
        float swing = MathHelper.cos(limbAngle * 0.6662f) * 1.4f * limbDistance;
        float counter = MathHelper.cos(limbAngle * 0.6662f + (float) Math.PI) * 1.4f * limbDistance;
        legs[0].pitch = swing; legs[3].pitch = swing;
        legs[1].pitch = counter; legs[2].pitch = counter;
        tail.yaw = MathHelper.cos(animationProgress * 0.09f) * 0.16f;
        tail.pitch = 0.12f + MathHelper.sin(animationProgress * 0.11f) * 0.09f;
    }
    @Override public void render(MatrixStack matrices, VertexConsumer vertices, int light, int overlay, int color) {
        body.render(matrices, vertices, light, overlay, color);
    }
}
