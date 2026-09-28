package dev.logan.entersift.client;

import java.util.HashMap;
import java.util.Map;
import net.minecraft.client.model.EntityModel;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.renderer.entity.state.LivingEntityRenderState;

/** One animated model class for all Sift creatures; animation keys off part-name conventions. */
public final class SiftCreatureModel extends EntityModel<LivingEntityRenderState> {
    private static final float DEG = (float) (Math.PI / 180.0);
    private final Map<String, ModelPart> parts = new HashMap<>();
    private final String kind;

    public SiftCreatureModel(ModelPart root, String kind, String[][] paths) {
        super(root);
        this.kind = kind;
        for (String[] path : paths) {
            ModelPart p = root;
            for (String name : path) p = p.getChild(name);
            parts.put(path[path.length - 1], p);
        }
    }

    private ModelPart part(String name) { return parts.get(name); }

    @Override public void setupAnim(LivingEntityRenderState s) {
        super.setupAnim(s);
        float age = s.ageInTicks, pos = s.walkAnimationPos, speed = Math.min(1.0f, s.walkAnimationSpeed);
        for (Map.Entry<String, ModelPart> e : parts.entrySet()) {
            String n = e.getKey();
            ModelPart p = e.getValue();
            if (n.startsWith("leg_")) {
                int i = n.charAt(n.length() - 1) - '0';
                float phase = (i % 2 == 0) == (i < 2) ? 0f : (float) Math.PI;
                p.xRot += (float) Math.cos(pos * 0.6662f + phase) * 1.2f * speed;
            } else if (n.startsWith("tentacle_")) {
                int i = n.charAt(n.length() - 1) - '0';
                p.xRot += (float) Math.sin(age * 0.09f + i * 0.9f) * 0.22f;
                p.zRot += (float) Math.cos(age * 0.07f + i * 1.3f) * 0.16f;
            } else if (n.startsWith("ear_")) { // floppy: flop outward on every hop, lazy sway at rest
                float side = n.endsWith("l") ? -1 : 1;
                float hop = Math.abs((float) Math.sin(pos * 0.6f)) * speed;
                p.zRot += side * (0.08f + hop * 0.45f + (float) Math.sin(age * 0.12f + side) * 0.07f);
                p.xRot += 0.25f * speed + (float) Math.sin(pos * 0.6f + 1.2f) * 0.35f * speed + (float) Math.sin(age * 0.09f) * 0.05f;
            } else if (n.startsWith("antenna_") || n.startsWith("whisker_")) {
                p.zRot += (float) Math.sin(age * 0.2f + n.length()) * 0.08f;
            }
        }
        ModelPart head = part("head");
        if (head != null && !kind.equals("drift_jelly") && !kind.equals("licker")) {
            head.yRot += s.yRot * DEG * 0.8f;
            head.xRot += s.xRot * DEG * 0.6f;
        }
        switch (kind) {
            case "blub" -> { // hop: squash-and-stretch body bounce while moving
                ModelPart body = part("body");
                body.y -= Math.abs((float) Math.sin(pos * 0.6f)) * 3.0f * speed;
                body.yScale = 1.0f + (float) Math.sin(age * 0.15f) * 0.03f;
            }
            case "sculker" -> part("jaw").xRot += 0.15f + (0.5f + 0.5f * (float) Math.sin(age * 0.12f)) * 0.55f;
            case "drift_jelly" -> {
                head.y += (float) Math.sin(age * 0.1f) * 1.2f;
                head.yRot += age * 0.01f;
                float pulse = 1.0f + (float) Math.sin(age * 0.2f) * 0.05f;
                final float MASSIVE = 3.2f; // the drift jelly is a floating giant
                head.xScale = pulse * MASSIVE; head.zScale = pulse * MASSIVE; head.yScale = (2.0f - pulse) * MASSIVE;
            }
            case "licker" -> {
                ModelPart tongue = part("tongue");
                tongue.xRot += (float) Math.sin(age * 0.25f) * 0.25f;
                tongue.zScale = 1.0f + 0.3f * (0.5f + 0.5f * (float) Math.sin(age * 0.1f));
                head.y += Math.abs((float) Math.sin(pos * 0.6f)) * -1.5f * speed;
            }
            case "overseer" -> {
                head.y += (float) Math.sin(age * 0.06f) * 1.5f;
                part("arm_l").zRot += (float) Math.sin(age * 0.05f) * 0.25f;
                part("arm_r").zRot -= (float) Math.sin(age * 0.05f) * 0.25f;
                part("horn_l").zRot += (float) Math.sin(age * 0.04f) * 0.06f;
                part("horn_r").zRot -= (float) Math.sin(age * 0.04f) * 0.06f;
            }
            case "twisted_warden" -> { // the chest maw splits open in a slow cycle, wide when hurt
                float cycle = (age % 140f) / 140f;
                float open = cycle > 0.8f ? (float) Math.sin((cycle - 0.8f) / 0.2f * Math.PI) : 0f;
                if (s.hasRedOverlay) open = Math.max(open, 0.8f);
                part("chest_upper").xRot -= open * 1.1f;
                part("chest_lower").xRot += open * 1.1f;
                part("arm_l").xRot += (float) Math.cos(pos * 0.6662f + Math.PI) * speed + open * -0.4f;
                part("arm_r").xRot += (float) Math.cos(pos * 0.6662f) * speed + open * -0.4f;
                part("horn_l").zRot += (float) Math.sin(age * 0.1f) * 0.04f;
                part("horn_r").zRot -= (float) Math.sin(age * 0.1f) * 0.04f;
            }
            case "singer" -> {
                ModelPart body = part("body");
                body.y += (float) Math.sin(age * 0.05f) * 1.0f;
                part("arm_r").zRot += (float) Math.sin(age * 0.08f) * 0.15f;
                part("arm_l").zRot -= 0.2f + (float) Math.sin(age * 0.06f) * 0.2f;
            }
            case "note_bird" -> {
                float flap = (float) Math.sin(age * 0.9f) * 0.9f;
                part("wing_l").zRot += flap;
                part("wing_r").zRot -= flap;
                part("body").y += (float) Math.sin(age * 0.9f + 1.5f) * 0.6f;
                part("leg_0").xRot = 0.9f; part("leg_1").xRot = 0.9f; // tucked in flight
            }
            case "antlerling" -> {
                part("antler_l").zRot += (float) Math.sin(age * 0.05f) * 0.03f;
                part("antler_r").zRot -= (float) Math.sin(age * 0.05f) * 0.03f;
            }
            default -> {}
        }
    }
}
