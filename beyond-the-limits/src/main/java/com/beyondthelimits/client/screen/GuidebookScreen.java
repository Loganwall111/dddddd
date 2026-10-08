package com.beyondthelimits.client.screen;

import com.beyondthelimits.client.ClientHooks;
import com.beyondthelimits.client.hud.HudPanel;
import java.util.List;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.text.Text;

/**
 * The Guide.
 *
 * <p>Nine pages, written as a surveyor's field journal rather than as a tutorial. The rule the whole mod
 * follows is that nobody explains the anomaly to the player: the journal describes what a previous
 * surveyor saw, hedges about it, and occasionally admits they did not come back. Chapter One's story is
 * told in the gap between what the page says and what the world does.</p>
 *
 * <p>The book is also a tool. Later pages are gated on what the player has actually witnessed — a page
 * about the City is not readable until the journal has a City to describe — which means the book records
 * the playthrough instead of spoiling it.</p>
 */
public class GuidebookScreen extends Screen {
	/** Pages, in order. Each one is a title key plus a body key; all text lives in the language file. */
	private static final String[] PAGES = {
			"welcome",
			"the_bleeding",
			"reality",
			"rifts",
			"the_city",
			"the_warehouse",
			"the_backrooms",
			"other_worlds",
			"rules"
	};

	private static final int PAGE_WIDTH = 226;
	private static final int PAGE_HEIGHT = 176;

	private int page;

	public GuidebookScreen() {
		super(Text.translatable("book.beyondthelimits.title"));
	}

	public GuidebookScreen(int startPage) {
		this();
		this.page = Math.max(0, Math.min(PAGES.length - 1, startPage));
	}

	@Override
	protected void init() {
		int left = (this.width - PAGE_WIDTH) / 2;
		int top = (this.height - PAGE_HEIGHT) / 2;
		int bottom = top + PAGE_HEIGHT;

		this.addDrawableChild(ButtonWidget.builder(Text.literal("<"), button -> turn(-1))
				.dimensions(left + 10, bottom - 24, 20, 18).build());
		this.addDrawableChild(ButtonWidget.builder(Text.literal(">"), button -> turn(1))
				.dimensions(left + PAGE_WIDTH - 30, bottom - 24, 20, 18).build());
		this.addDrawableChild(ButtonWidget.builder(Text.translatable("book.beyondthelimits.close"), button -> this.close())
				.dimensions(left + PAGE_WIDTH / 2 - 40, bottom - 24, 80, 18).build());

		// Chapter jumps: the journal's table of contents, one button per page.
		int tabX = left + PAGE_WIDTH + 6;
		int tabY = top + 6;

		for (int index = 0; index < PAGES.length; index++) {
			final int target = index;
			boolean current = index == this.page;
			this.addDrawableChild(ButtonWidget.builder(Text.literal(current ? "▣" : "▢"), button -> {
				this.page = target;
				this.clearAndInit();
			}).dimensions(tabX, tabY + index * 18, 16, 16).build());
		}
	}

	private void turn(int direction) {
		this.page = Math.max(0, Math.min(PAGES.length - 1, this.page + direction));
		this.clearAndInit();
	}

	@Override
	public void render(DrawContext context, int mouseX, int mouseY, float delta) {
		this.renderBackground(context, mouseX, mouseY, delta);

		int left = (this.width - PAGE_WIDTH) / 2;
		int top = (this.height - PAGE_HEIGHT) / 2;

		float reality = com.beyondthelimits.client.ClientState.reality() / 100.0F;
		int accent = HudPanel.realityColor(reality, true);

		HudPanel.panel(context, left, top, PAGE_WIDTH, PAGE_HEIGHT, accent, 0.88F);
		HudPanel.scanlines(context, left, top, PAGE_WIDTH, PAGE_HEIGHT, 0x0AFFFFFF);

		String key = PAGES[this.page];
		Text title = Text.translatable("book.beyondthelimits." + key + ".title");
		Text body = Text.translatable("book.beyondthelimits." + key + ".body");

		context.drawText(this.textRenderer, title, left + 12, top + 12, accent, false);
		context.fill(left + 12, top + 24, left + PAGE_WIDTH - 12, top + 25, HudPanel.withAlpha(accent, 90));
		context.drawTextWrapped(this.textRenderer, body, left + 12, top + 32, PAGE_WIDTH - 24, 0xDDDDDD);

		// Page footer: where the reader is, and how much of the world is left.
		String footer = ClientHooks.text("book.beyondthelimits.page", this.page + 1, PAGES.length);
		context.drawText(this.textRenderer, footer, left + 12, top + PAGE_HEIGHT - 30, 0x8A8A8A, false);
		String realityText = ClientHooks.text("book.beyondthelimits.margin", com.beyondthelimits.client.ClientState.reality());
		context.drawText(this.textRenderer, realityText, left + PAGE_WIDTH - 12 - this.textRenderer.getWidth(realityText),
				top + PAGE_HEIGHT - 30, HudPanel.withAlpha(accent, 160), false);

		// The journal is a physical object that has been through the same events the reader has.
		if (reality < 0.4F) {
			drawDamage(context, left, top);
		}

		super.render(context, mouseX, mouseY, delta);
	}

	/** Tear marks and smudges that appear in the journal once the world has started disagreeing with it. */
	private void drawDamage(DrawContext context, int left, int top) {
		long tick = (long) com.beyondthelimits.client.ClientState.ticks();
		int tearCount = realityDamageLevel();

		for (int tear = 0; tear < tearCount; tear++) {
			int seed = tear * 7919;
			int x = left + 14 + Math.abs(seed * 31 % (PAGE_WIDTH - 28));
			int y = top + 30 + Math.abs(seed * 17 % (PAGE_HEIGHT - 60));
			int length = 6 + Math.abs(seed % 9);
			context.fill(x, y, x + length, y + 1, 0x66000000);
			context.fill(x + length / 2, y + 1, x + length / 2 + 1, y + 4, 0x44000000);

			if (tick % 100 < 6) {
				context.fill(x - 2, y - 2, x + length + 2, y + 5, 0x22FF0000);
			}
		}
	}

	private int realityDamageLevel() {
		int reality = com.beyondthelimits.client.ClientState.reality();

		if (reality > 40) {
			return 0;
		}

		if (reality > 20) {
			return 3;
		}

		return 7;
	}

	@Override
	public boolean shouldPause() {
		return false;
	}

	/** Used by the client hooks to open the book at a page named by the server. */
	public static int pageIndex(String name) {
		List<String> pages = List.of(PAGES);
		int index = pages.indexOf(name);
		return index < 0 ? 0 : index;
	}
}
