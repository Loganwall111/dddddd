package dev.logan.beyondthreshold.client.render;

import dev.logan.beyondthreshold.client.BTTClientState;
import dev.logan.beyondthreshold.world.BTTDimensions;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.text.Text;

/** Titles, flashes and the Mandela readout. */
public final class HudOverlay {

	public static void draw(DrawContext context) {
		MinecraftClient c = MinecraftClient.getInstance();
		if (c.world == null || c.player == null) {
			return;
		}
		int w = c.getWindow().getScaledWidth();
		int h = c.getWindow().getScaledHeight();

		if (BTTClientState.flash > 0.02F) {
			int a = (int) (Math.min(1.0F, BTTClientState.flash) * 235);
			context.fill(0, 0, w, h, (a << 24) | 0xFFFFFF);
		}

		long now = c.world.getTime();
		if (BTTClientState.sequenceStage == 0) {
			int alpha = 120 + (int) (80 * Math.sin(now * 0.2));
			drawCentered(c, context, "something is looking at you", h / 3, (alpha << 24) | 0x9F7FFF);
		} else if (BTTClientState.sequenceStage == 1) {
			drawCentered(c, context, "IT HAS YOU", h / 3, 0xFF3A2AEE);
			int a = (int) (60 + 40 * Math.sin(now * 0.6));
			context.fill(0, 0, w, h, (a << 24) | 0x100010);
		} else if (BTTClientState.sequenceStage == 2 && BTTClientState.sequenceTick < 160) {
			int a = Math.min(255, 255 - BTTClientState.sequenceTick * 2);
			drawCentered(c, context, "BEYOND THE THRESHOLD", h / 3, (a << 24) | 0xFFC24D);
			drawCentered(c, context, "the overworld is the body of the nameless one",
					h / 3 + 14, (a << 24) | 0xBFA9FF);
		}

		if (BTTClientState.travelFlash > 0) {
			int a = Math.min(255, BTTClientState.travelFlash * 4);
			String name = BTTDimensions.byIndex(Math.max(0, BTTClientState.travelDim)).getValue().getPath();
			drawCentered(c, context, name.toUpperCase().replace('_', ' '), h / 4, (a << 24) | 0x7FF7E7);
			drawCentered(c, context, "reality reassembles around you", h / 4 + 12, (a << 24) | 0x9FB7C9);
		}

		if (BTTClientState.glassesWorn && BTTClientState.mandelaMode >= 0) {
			int[] cols = {0xE8E8E8, 0xFF4DDB, 0x66FF9F, 0xD8C24D, 0x66E7FF, 0xB76BFF};
			String label = "MANDALA // " + BTTClientState.MANDELA_NAMES[BTTClientState.mandelaMode];
			context.drawTextWithShadow(c.textRenderer, Text.literal(label), 6, 6,
					0xCC000000 | cols[BTTClientState.mandelaMode % cols.length]);
		}
	}

	private static void drawCentered(MinecraftClient c, DrawContext context, String s, int y, int color) {
		context.drawTextWithShadow(c.textRenderer, Text.literal(s),
				(c.getWindow().getScaledWidth() - c.textRenderer.getWidth(s)) / 2, y, color);
	}

	private HudOverlay() {
	}
}
