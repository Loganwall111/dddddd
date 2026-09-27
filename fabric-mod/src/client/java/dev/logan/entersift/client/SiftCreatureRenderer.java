package dev.logan.entersift.client;

import dev.logan.entersift.SiftContent;
import dev.logan.entersift.SiftKind;
import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.MobRenderer;
import net.minecraft.client.renderer.entity.layers.EyesLayer;
import net.minecraft.client.renderer.entity.state.LivingEntityRenderState;
import net.minecraft.client.renderer.rendertype.RenderType;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.Mob;

/** Textured, animated renderer with a full-bright emissive layer (eyes, fissures, glow tips). */
public final class SiftCreatureRenderer extends MobRenderer<Mob, LivingEntityRenderState, SiftCreatureModel> {
    private final Identifier texture;

    public SiftCreatureRenderer(EntityRendererProvider.Context context, SiftKind kind, ModelLayerLocation layer, String[][] paths) {
        super(context, new SiftCreatureModel(context.bakeLayer(layer), kind.id, paths), kind.shadow);
        this.texture = SiftContent.id("textures/entity/" + kind.id + ".png");
        Identifier glow = SiftContent.id("textures/entity/" + kind.id + "_glow.png");
        RenderType glowType = RenderTypes.eyes(glow);
        this.addLayer(new EyesLayer<LivingEntityRenderState, SiftCreatureModel>(this) {
            @Override public RenderType renderType() { return glowType; }
        });
    }

    @Override public LivingEntityRenderState createRenderState() { return new LivingEntityRenderState(); }

    @Override public Identifier getTextureLocation(LivingEntityRenderState state) { return texture; }
}
