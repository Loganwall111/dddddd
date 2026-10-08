package com.beyondthelimits.client.hud;

import net.minecraft.client.font.TextRenderer;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.text.Text;
import net.minecraft.util.math.MathHelper;

/**
 * Drawing primitives for the mod's interface.
 *
 * <p>The HUD is deliberately made of a handful of primitives — a notched panel, a segmented bar, a
 * scanline wash and a colour ramp — rather than a texture. Two reasons: it stays legible at any GUI
 * scale without mipmaps arguing about it, and it can be tinted by the world's reality value, so the
 * interface itself degrades as the world does. At 100% it is a clean white readout; by 20% it is
 * red-shifted, tearing and occasionally showing the wrong number.</p>
 */
public final class HudPanel {
	private HudPanel() {
	}

	// ---- colour ramps ----------------------------------------------------------------------------

	/** 0xRRGGBB for the reality band: white → amber → red → violet as the world comes apart. */
	public static int realityColor(float reality, boolean bright) {
		if (reality > 0.8F) {
			return bright ? 0x9BE8FF : 0x4E8FA6;
		}

		if (reality > 0.6F) {
			return bright ? 0xFFE08A : 0xA6884E;
		}

		if (reality > 0.4F) {
			return bright ? 0xFFA45C : 0xA66B3C;
		}

		if (reality > 0.2F) {
			return bright ? 0xFF6B5C : 0xA6463C;
		}

		return bright ? 0xC77BFF : 0x7A4EA6;
	}

	// ---- panel -----------------------------------------------------------------------------------

	/**
	 * The standard panel: a dark backing at the given alpha, a hairline accent border, and a notch cut
	 * out of the top-right corner so it reads as machinery rather than as a tooltip.
	 */
	public static void panel(DrawContext context, int x, int y, int width, int height, int accent, float opacity) {
		int backing = ((int) (MathHelper.clamp(opacity, 0.0F, 1.0F) * 190.0F) << 24);
		context.fill(x, y, x + width, y + height, backing);
		context.fill(x, y, x + width, y + 1, accent | 0xB0000000);
		context.fill(x, y + height - 1, x + width, y + height, accent | 0x30000000);
		context.fill(x, y, x + 1, y + height, accent | 0x70000000);
		context.fill(x + width - 1, y, x + width, y + height - 4, accent | 0x70000000);
		// The notch: the top-right corner is left empty and re-drawn as a diagonal gutter.
		context.fill(x + width - 6, y, x + width, y + 1, 0x00000000);
		context.fill(x + width - 5, y + 1, x + width - 4, y + 2, accent | 0x90000000);
		context.fill(x + width - 4, y + 2, x + width - 3, y + 3, accent | 0x90000000);
		context.fill(x + width - 3, y + 3, x + width - 2, y + 4, accent | 0x90000000);
		context.fill(x + width - 2, y + 4, x + width - 1, y + 5, accent | 0x90000000);
	}

	/** A panel with the mod's scanline texture inside it. Slightly more expensive, used sparingly. */
	public static void scanlines(DrawContext context, int x, int y, int width, int height, int color) {
		int alpha = (color >>> 24) & 0xFF;

		if (alpha <= 0) {
			return;
		}

		int rgb = color & 0xFFFFFF;

		for (int row = y + 1; row < y + height - 1; row += 3) {
			context.fill(x + 1, row, x + width - 1, row + 1, (alpha << 24) | rgb);
		}
	}

	// ---- bars ------------------------------------------------------------------------------------

	/** A segmented bar. The segments are what make a value feel measured rather than estimated. */
	public static void bar(DrawContext context, int x, int y, int width, int height, float fraction,
			int filledColor, int emptyColor, int segments) {
		float clamped = MathHelper.clamp(fraction, 0.0F, 1.0F);
		int lit = (int) Math.ceil(clamped * segments);
		int half = y + Math.max(1, height / 2);

		for (int segment = 0; segment < segments; segment++) {
			int left = x + segment * width / segments;
			int right = x + (segment + 1) * width / segments - 1;
			boolean on = segment < lit;
			int top = on ? withAlpha(filledColor, ((filledColor >>> 24) & 0xFF) + 30) : emptyColor;
			context.fill(left, y, right, half, top);
			context.fill(left, half, right, y + height, on ? filledColor : emptyColor);
		}
	}

	/** A two-pixel-tall hairline bar, for values that sit inside a label row. */
	public static void thinBar(DrawContext context, int x, int y, int width, float fraction, int filledColor) {
		context.fill(x, y, x + width, y + 1, 0x40000000);
		context.fill(x, y, x + (int) (MathHelper.clamp(fraction, 0.0F, 1.0F) * width), y + 1, filledColor);
	}

	// ---- text ------------------------------------------------------------------------------------

	public static void label(DrawContext context, TextRenderer font, String text, int x, int y, int color, boolean shadow) {
		if (!shadow) {
			context.drawText(font, text, x, y, color, false);
			return;
		}

		context.drawTextWithShadow(font, text, x, y, color);
	}

	/** Draws a label and its value, right-aligning the value to the panel's inner edge. */
	public static void row(DrawContext context, TextRenderer font, String label, String value, int x, int y,
			int innerWidth, int labelColor, int valueColor) {
		context.drawText(font, label, x, y, labelColor, false);
		int valueWidth = font.getWidth(value);
		context.drawText(font, value, x + innerWidth - valueWidth - 2, y, valueColor, false);
	}

	public static void text(DrawContext context, TextRenderer font, Text text, int x, int y, int color, boolean centered,
			int innerWidth) {
		int width = font.getWidth(text);
		context.drawText(font, text, x + (centered ? (innerWidth - width) / 2 : 0), y, color, false);
	}

	/** Alpha fade used by every fading HUD element: fast in, slow out. */
	public static float fade(int ticksLeft, int totalTicks) {
		if (ticksLeft <= 0) {
			return 0.0F;
		}

		float progress = ticksLeft / (float) Math.max(1, totalTicks);
		return MathHelper.clamp(progress < 0.25F ? progress / 0.25F : 1.0F, 0.0F, 1.0F);
	}

	public static int withAlpha(int color, int alpha) {
		return (MathHelper.clamp(alpha, 0, 255) << 24) | (color & 0xFFFFFF);
	}

	/** The screen-edge darkening used when reality is low. Cheaper than a texture and scales exactly. */
	public static void vignette(DrawContext context, int screenWidth, int screenHeight, float strength) {
		float clamped = MathHelper.clamp(strength, 0.0F, 1.0F);

		if (clamped <= 0.01F) {
			return;
		}

		int bands = 14;
		int stepX = Math.max(1, screenWidth / 8);
		int stepY = Math.max(1, screenHeight / 8);

		for (int band = 0; band < bands; band++) {
			float edge = 1.0F - (float) band / bands;
			int alpha = (int) (clamped * edge * edge * 150.0F);
			int inset = band * Math.min(stepX, stepY) / 3;
			context.fill(inset, inset, screenWidth - inset, inset + 2, withAlpha(0x000000, alpha));
			context.fill(inset, screenHeight - inset - 2, screenWidth - inset, screenHeight - inset,
					withAlpha(0x000000, alpha));
			context.fill(inset, inset, inset + 2, screenHeight - inset, withAlpha(0x000000, alpha));
			context.fill(screenWidth - inset - 2, inset, screenWidth - inset, screenHeight - inset,
					withAlpha(0x000000, alpha));
		}
	}
}
