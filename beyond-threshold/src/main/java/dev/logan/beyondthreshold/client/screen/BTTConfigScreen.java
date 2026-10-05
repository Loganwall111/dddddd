package dev.logan.beyondthreshold.client.screen;

import dev.logan.beyondthreshold.config.BTTConfig;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.text.Text;

import java.util.Locale;
import java.util.function.Consumer;

/**
 * In-game config menu (B key): every knob of the threshold, saved to
 * config/beyondthreshold.json.
 */
public class BTTConfigScreen extends Screen {
	private int row = 0;

	public BTTConfigScreen() {
		super(Text.translatable("screen.beyondthreshold.config"));
	}

	@Override
	protected void init() {
		row = 0;
		BTTConfig.Data d = BTTConfig.get();
		toggle("Cosmic colossus sky", d.thresholdSky, v -> d.thresholdSky = v);
		toggle("Water shader", d.waterShader, v -> d.waterShader = v);
		toggle("Palette swap terrain", d.paletteSwap, v -> d.paletteSwap = v);
		toggle("Black hole travel", d.blackHoleTravel, v -> d.blackHoleTravel = v);
		toggle("Auto eye intro", d.autoIntro, v -> d.autoIntro = v);
		number("Lensing strength", d.lensingStrength, 0F, 2F, v -> d.lensingStrength = v);
		number("Gravity scale", d.gravityScale, 0.1F, 3F, v -> d.gravityScale = v);
		number("Ragdoll chaos", d.ragdollChaos, 0F, 3F, v -> d.ragdollChaos = v);
		number("Dissolve intensity", d.dissolveIntensity, 0F, 1F, v -> d.dissolveIntensity = v);
		number("Shake strength", d.shakeStrength, 0F, 2F, v -> d.shakeStrength = v);
		number("Collapse power", d.collapsePower, 4F, 24F, v -> d.collapsePower = v);
		addDrawableChild(ButtonWidget.builder(Text.translatable("gui.done"), b -> close())
				.dimensions(width / 2 - 100, height - 28, 200, 20).build());
	}

	private void toggle(String label, boolean value, Consumer<Boolean> set) {
		final boolean[] state = {value};
		ButtonWidget btn = ButtonWidget.builder(Text.literal(label + ": " + onOff(state[0])), b -> {
			state[0] = !state[0];
			set.accept(state[0]);
			b.setMessage(Text.literal(label + ": " + onOff(state[0])));
			BTTConfig.save();
		}).dimensions(width / 2 - 150, 28 + row * 22, 300, 20).build();
		addDrawableChild(btn);
		row++;
	}

	private void number(String label, float value, float min, float max, Consumer<Float> set) {
		final float[] state = {value};
		ButtonWidget view = ButtonWidget.builder(Text.literal(fmt(label, state[0])), b -> {
		}).dimensions(width / 2 - 150, 28 + row * 22, 220, 20).build();
		ButtonWidget minus = ButtonWidget.builder(Text.literal("-"), b -> {
			state[0] = clamp(state[0] - step(min, max), min, max);
			set.accept(state[0]);
			view.setMessage(Text.literal(fmt(label, state[0])));
			BTTConfig.save();
		}).dimensions(width / 2 + 74, 28 + row * 22, 36, 20).build();
		ButtonWidget plus = ButtonWidget.builder(Text.literal("+"), b -> {
			state[0] = clamp(state[0] + step(min, max), min, max);
			set.accept(state[0]);
			view.setMessage(Text.literal(fmt(label, state[0])));
			BTTConfig.save();
		}).dimensions(width / 2 + 114, 28 + row * 22, 36, 20).build();
		addDrawableChild(view);
		addDrawableChild(minus);
		addDrawableChild(plus);
		row++;
	}

	private static float step(float min, float max) {
		return (max - min) / 20.0F;
	}

	private static float clamp(float v, float min, float max) {
		return Math.max(min, Math.min(max, v));
	}

	private static String onOff(boolean b) {
		return b ? "ON" : "OFF";
	}

	private static String fmt(String label, float v) {
		return String.format(Locale.ROOT, "%s: %.2f", label, v);
	}

	@Override
	public void render(DrawContext context, int mouseX, int mouseY, float delta) {
		renderBackground(context);
		super.render(context, mouseX, mouseY, delta);
		drawCenteredText(context, title, width / 2, 10, 0xBFA9FF);
	}

	@Override
	public void removed() {
		BTTConfig.save();
	}
}
