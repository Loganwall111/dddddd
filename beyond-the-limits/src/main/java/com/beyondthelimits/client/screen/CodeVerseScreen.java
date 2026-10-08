package com.beyondthelimits.client.screen;

import com.beyondthelimits.client.hud.HudPanel;
import java.util.List;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.text.Text;

/**
 * The Code Verse terminal.
 *
 * <p>This is the 4th-wall payoff, and it is played straight. The Codescape dimension is Minecraft's own
 * source code made into terrain, and this screen is what the player sees if they hold the Code Key up to
 * it: a readout of the classes the world is actually built from — real names, in real packages, with the
 * real inheritance. Nothing here is a joke about the game being a game; it is the game's own bones, laid
 * out, and the implication is left where it lands.</p>
 *
 * <p>Lines type themselves in, scroll, and occasionally <em>fail</em> — the readout errors, corrects
 * itself and carries on, as if something were reading the same file at the same time.</p>
 */
public class CodeVerseScreen extends Screen {
	private final net.minecraft.util.math.random.Random random = net.minecraft.util.math.random.Random.create();

	/** Real 1.21.1 yarn class names. The readout is the truth about the game, which is the point. */
	private static final List<String> SOURCE = List.of(
			"package net.minecraft.world;",
			"",
			"public abstract class World implements WorldAccess, AutoCloseable {",
			"    protected final List<Entity> entities = Lists.newArrayList();",
			"    public boolean isClient;",
			"    public boolean isDebugWorld;",
			"",
			"    public void tickBlockEntities() { ... }",
			"    public boolean setBlockState(BlockPos pos, BlockState state) { ... }",
			"}",
			"",
			"public class ServerWorld extends World {",
			"    public void tickChunk(WorldChunk chunk, int randomTickSpeed) { ... }",
			"    public boolean spawnEntity(Entity entity) { ... }",
			"}",
			"",
			"public class Entity implements Nameable, EntityLike {",
			"    private int id;",
			"    protected boolean firstUpdate;",
			"    public void tick() { ... }",
			"    public void remove(Entity.RemovalReason reason) { ... }",
			"}",
			"",
			"public abstract class LivingEntity extends Entity {",
			"    public boolean damage(DamageSource source, float amount) { ... }",
			"    protected void dropLoot(DamageSource source, boolean causedByPlayer) { ... }",
			"}",
			"",
			"public class MinecraftServer implements Runnable {",
			"    public void tick(BooleanSupplier shouldKeepTicking) { ... }",
			"    public void shutdown() { ... }",
			"}",
			"",
			"public class MinecraftClient extends ReentrantThreadExecutor<Runnable> {",
			"    public boolean isInSingleplayer();",
			"    public void stop() { ... }",
			"}",
			"",
			"// BEYONDTHELIMITS: injected",
			"package com.beyondthelimits.core;",
			"",
			"public final class BtlState {",
			"    private static int reality = 100;",
			"    public static int reality() { return reality; }",
			"}",
			"",
			"// you are reading the file that describes you.",
			"// the surveyor wrote that line too."
	);

	private static final int PANEL_WIDTH = 300;
	private static final int PANEL_HEIGHT = 190;

	private int scroll;
	private float typed;
	private int glitchTicks;

	public CodeVerseScreen() {
		super(Text.translatable("screen.beyondthelimits.codescape"));
	}

	@Override
	public void tick() {
		// The readout streams; scrolling past the end wraps back to the top like a log with no beginning.
		this.typed += 0.6F;
		this.scroll = (int) (this.typed / 2.0F);

		if (this.glitchTicks > 0) {
			this.glitchTicks--;
		} else if (this.random.nextInt(90) == 0) {
			this.glitchTicks = 6 + this.random.nextInt(10);
		}
	}

	@Override
	public void render(DrawContext context, int mouseX, int mouseY, float delta) {
		this.renderBackground(context, mouseX, mouseY, delta);

		int left = (this.width - PANEL_WIDTH) / 2;
		int top = (this.height - PANEL_HEIGHT) / 2;
		int green = this.glitchTicks > 0 ? 0xFF6B5C : 0x39FF6A;

		HudPanel.panel(context, left, top, PANEL_WIDTH, PANEL_HEIGHT, green, 0.9F);
		HudPanel.scanlines(context, left, top, PANEL_WIDTH, PANEL_HEIGHT, 0x12FFFFFF);

		String header = "net.minecraft — read-only";
		context.drawText(this.textRenderer, header, left + 8, top + 8, green, false);
		context.fill(left + 8, top + 18, left + PANEL_WIDTH - 8, top + 19, 0x5539FF6A);

		int lines = (PANEL_HEIGHT - 44) / 9;
		int start = Math.max(0, this.scroll % Math.max(1, SOURCE.size()));

		for (int row = 0; row < lines; row++) {
			int index = (start + row) % SOURCE.size();
			String line = SOURCE.get(index);
			int y = top + 24 + row * 9;
			// The oldest visible lines fade out at the top of the panel.
			int alpha = row == 0 ? 0x66 : 0xDD;
			int color = line.startsWith("//") ? HudPanel.withAlpha(0x77FF77, alpha)
					: HudPanel.withAlpha(0x39FF6A, alpha);
			context.drawText(this.textRenderer, line, left + 8, y, color, false);
		}

		// Corruption: while glitching, a few lines are replaced by something that is not source code.
		if (this.glitchTicks > 0) {
			for (int glitch = 0; glitch < 3; glitch++) {
				int y = top + 24 + this.random.nextInt(Math.max(1, lines)) * 9;
				int width = 40 + this.random.nextInt(PANEL_WIDTH - 60);
				context.fill(left + 8, y, left + 8 + width, y + 8, 0x55000000);
				if (this.random.nextBoolean()) {
					context.drawText(this.textRenderer, "it is still watching", left + 10, y + 1, 0xFFFF3333, false);
				}
			}
		}

		String footer = "1.21.1 · " + SOURCE.size() + " lines shown · surveyor copy";
		context.drawText(this.textRenderer, footer, left + 8, top + PANEL_HEIGHT - 12, 0x667766, false);
	}

	@Override
	public boolean shouldPause() {
		return false;
	}
}
