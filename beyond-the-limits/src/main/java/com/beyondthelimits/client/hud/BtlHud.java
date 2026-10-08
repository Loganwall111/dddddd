package com.beyondthelimits.client.hud;

import com.beyondthelimits.client.ClientHooks;
import com.beyondthelimits.client.ClientState;
import com.beyondthelimits.client.render.RiftRenderer;
import com.beyondthelimits.entity.RiftEntity;
import com.beyondthelimits.network.BtlNetworking;
import com.beyondthelimits.registry.BtlDimensions;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.font.TextRenderer;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.network.ClientPlayerEntity;
import net.minecraft.registry.RegistryKey;
import net.minecraft.text.Text;
import net.minecraft.util.math.MathHelper;
import net.minecraft.world.World;

/**
 * The reality readout.
 *
 * <p>Chapter One's whole argument is that the world is quietly coming apart, and a player cannot feel
 * that if they have to open a menu to check. So the state of the world is on screen at all times, in the
 * corner, the way a wound is on a body: the reality band, the dementia the player is carrying, the
 * gravity debt owed to the dimension they have been standing in, how many rifts are open nearby and what
 * is on the other side of the closest one.</p>
 *
 * <p>Everything is derived from data the client already has — including the rifts, which are real
 * entities in the world — so the HUD costs nothing on the network and cannot disagree with the world it
 * is describing. The panel is only drawn when there is something to say: in an untouched world it shows
 * a single line and nothing else.</p>
 */
public final class BtlHud {
	private BtlHud() {
	}

	private static final int PANEL_WIDTH = 148;
	private static final int MARGIN = 6;
	private static final int SEGMENTS = 20;

	/** A transient line of text shown at the top of the screen: "something just changed". */
	private static Text banner;
	private static int bannerTicks;
	private static int bannerDuration = 1;
	private static int lastReality = 100;
	private static int lastRiftCount;

	public static void register() {
		HudRenderCallback.EVENT.register((context, tickCounter) -> render(context));
	}

	/** Called by the network layer when the server pushes a beat the player must notice. */
	public static void showBanner(Text text, int ticks) {
		banner = text;
		bannerDuration = Math.max(1, ticks);
		bannerTicks = bannerDuration;
	}

	public static void tick() {
		if (bannerTicks > 0) {
			bannerTicks--;
		}
	}

	private static void render(DrawContext context) {
		MinecraftClient client = MinecraftClient.getInstance();

		if (client == null || client.player == null || client.options.hudHidden || !ClientHooks.hudVisible()) {
			return;
		}

		if (!client.player.isAlive() || client.currentScreen != null) {
			return;
		}

		TextRenderer font = client.textRenderer;
		int screenWidth = context.getScaledWindowWidth();
		int screenHeight = context.getScaledWindowHeight();
		float reality = ClientState.reality() / 100.0F;

		watchForChanges(client, reality);

		// The world coming apart is visible at the edges of the screen before it is visible anywhere else.
		HudPanel.vignette(context, screenWidth, screenHeight, Math.max(0.0F, (0.62F - reality) / 0.62F) * 0.9F);

		if (bannerTicks > 0 && banner != null) {
			drawBanner(context, font, screenWidth);
		}

		// In a world nobody has touched yet, the readout is one line: nothing has happened.
		boolean pristine = ClientState.reality() >= 100 && ClientState.dementia() <= 0
				&& ClientState.gravity() <= 0 && ClientState.skyEvent() == BtlNetworking.SKY_EVENT_NONE;

		if (pristine && ClientState.collision() == 0) {
			HudPanel.label(context, font, ClientHooks.text("hud.beyondthelimits.normal"), MARGIN, screenHeight - 16,
					0x66FFFFFF, true);
			return;
		}

		drawPanel(context, client, font, screenWidth, screenHeight, reality);
	}

	private static void drawPanel(DrawContext context, MinecraftClient client, TextRenderer font, int screenWidth,
			int screenHeight, float reality) {
		int accent = HudPanel.realityColor(reality, true);
		int rows = 1;

		if (ClientState.dementia() > 0) {
			rows++;
		}

		if (ClientState.gravity() > 0) {
			rows++;
		}

		if (ClientState.collision() > 0) {
			rows++;
		}

		RiftEntity nearest = RiftRenderer.closestRift(client.player.getPos(), 256.0D);
		int rifts = countRifts(client);

		if (rifts > 0) {
			rows++;
		}

		if (ClientState.skyEvent() != BtlNetworking.SKY_EVENT_NONE) {
			rows++;
		}

		int height = 24 + rows * 11;
		int x = MARGIN;
		int y = screenHeight - height - MARGIN;

		HudPanel.panel(context, x, y, PANEL_WIDTH, height, accent, 0.75F);
		HudPanel.scanlines(context, x, y, PANEL_WIDTH, height, 0x08FFFFFF | (accent & 0xFFFFFF));

		int innerX = x + 6;
		int innerWidth = PANEL_WIDTH - 12;
		int cursor = y + 5;

		// ---- header: reality ----------------------------------------------------------------------
		String band = ClientHooks.text("hud.beyondthelimits.band." + bandIndex(reality));
		context.drawText(font, ClientHooks.text("hud.beyondthelimits.reality"), innerX, cursor, accent, false);
		String percent = ClientState.reality() + "%";
		context.drawText(font, percent, innerX + innerWidth - font.getWidth(percent) - 2, cursor, accent, false);

		if (reality < 0.6F) {
			// Below band three the number itself flickers: the readout is being damaged by what it measures.
			if ((int) ClientState.ticks() % 20 < 3) {
				context.fill(innerX + innerWidth - font.getWidth(percent) - 3, cursor - 1,
						innerX + innerWidth, cursor + 9, 0x99000000);
			}
		}

		cursor += 10;
		HudPanel.bar(context, innerX, cursor, innerWidth, 4, reality, accent, 0x40101010, SEGMENTS);
		cursor += 7;

		// ---- band label --------------------------------------------------------------------------
		HudPanel.row(context, font, band, ClientHooks.text("hud.beyondthelimits.rift_count", rifts),
				innerX, cursor, innerWidth, 0x99FFFFFF, accent);
		cursor += 11;

		// ---- dementia ----------------------------------------------------------------------------
		if (ClientState.dementia() > 0) {
			float dementia = MathHelper.clamp(ClientState.dementia() / 2400.0F, 0.0F, 1.0F);
			HudPanel.row(context, font, ClientHooks.text("hud.beyondthelimits.dementia"),
					Math.round(dementia * 100.0F) + "%", innerX, cursor, innerWidth, 0x99FFFFFF, 0xC77BFF);
			HudPanel.thinBar(context, innerX, cursor + 9, innerWidth, dementia, 0xC77BFF);
			cursor += 11;
		}

		// ---- dimensional gravity -------------------------------------------------------------------
		if (ClientState.gravity() > 0) {
			HudPanel.row(context, font, ClientHooks.text("hud.beyondthelimits.gravity"),
					ClientHooks.text("hud.beyondthelimits.debt", ClientState.gravity()), innerX, cursor, innerWidth,
					0x99FFFFFF, 0x6BD1FF);
			cursor += 11;
		}

		// ---- collision ---------------------------------------------------------------------------
		if (ClientState.collision() > 0) {
			HudPanel.row(context, font, ClientHooks.text("hud.beyondthelimits.collision"),
					ClientState.collision() + "%", innerX, cursor, innerWidth, 0x99FFFFFF, 0xFF8A5C);
			cursor += 11;
		}

		// ---- nearest rift ------------------------------------------------------------------------
		if (rifts > 0) {
			String value = nearest == null ? ClientHooks.text("hud.beyondthelimits.rift_far")
					: ClientHooks.text("hud.beyondthelimits.rift_near",
							Math.round(nearest.getPos().distanceTo(client.player.getPos())),
							ClientHooks.text("rift.beyondthelimits.variant." + nearest.getVariant()));
			HudPanel.row(context, font, ClientHooks.text("hud.beyondthelimits.rifts"), value, innerX, cursor,
					innerWidth, 0x99FFFFFF, 0xE8C3FF);
			cursor += 11;
		}

		// ---- sky ---------------------------------------------------------------------------------
		if (ClientState.skyEvent() != BtlNetworking.SKY_EVENT_NONE) {
			int skyColor = ClientState.skyEvent() == BtlNetworking.SKY_EVENT_BLACK_SUN ? 0xFF5C5C
					: ClientState.skyEvent() == BtlNetworking.SKY_EVENT_CRACK ? 0xFFD27B : accent;
			HudPanel.row(context, font, ClientHooks.text("hud.beyondthelimits.sky"),
					ClientHooks.text(skyKey(ClientState.skyEvent())), innerX, cursor, innerWidth, 0x99FFFFFF, skyColor);
		}
	}

	/** The one thing the player must know right now, in one line, at the top of the screen. */
	private static void drawBanner(DrawContext context, TextRenderer font, int screenWidth) {
		float alpha = HudPanel.fade(bannerTicks, bannerDuration);
		int width = font.getWidth(banner);
		int boxWidth = width + 24;
		int x = (screenWidth - boxWidth) / 2;
		int color = HudPanel.withAlpha(0xFFFFFF, (int) (alpha * 255.0F));
		int accent = HudPanel.withAlpha(0x9BE8FF, (int) (alpha * 200.0F));

		HudPanel.panel(context, x, 12, boxWidth, 20, accent, alpha * 0.6F);
		context.drawText(font, banner, x + (boxWidth - width) / 2, 18, color, true);
	}

	// ---- helpers ---------------------------------------------------------------------------------

	/** Watches for the world changing underneath the player, and turns that into a banner. */
	private static void watchForChanges(MinecraftClient client, float reality) {
		int rifts = countRifts(client);

		if (ClientState.reality() != lastReality) {
			int previousBand = bandIndex(lastReality / 100.0F);
			int band = bandIndex(reality);

			if (band != previousBand) {
				showBanner(Text.translatable("hud.beyondthelimits.band_shift", ClientHooks.text(
						"hud.beyondthelimits.band." + band)), 100);
			}

			lastReality = ClientState.reality();
		}

		if (rifts > lastRiftCount && lastRiftCount >= 0 && ClientState.reality() < 100) {
			showBanner(Text.translatable("hud.beyondthelimits.rift_nearby"), 80);
		}

		lastRiftCount = rifts;
	}

	/** 0 = whole, 4 = a different game. Matches RealityEngine's bands and the guidebook's chapters. */
	private static int bandIndex(float reality) {
		if (reality > 0.8F) {
			return 0;
		}

		if (reality > 0.6F) {
			return 1;
		}

		if (reality > 0.4F) {
			return 2;
		}

		if (reality > 0.2F) {
			return 3;
		}

		return 4;
	}

	private static int countRifts(MinecraftClient client) {
		if (client.world == null) {
			return 0;
		}

		int count = 0;

		for (var entity : client.world.getEntities()) {
			if (entity instanceof RiftEntity) {
				count++;
			}
		}

		return count;
	}

	private static String skyKey(int event) {
		return switch (event) {
			case BtlNetworking.SKY_EVENT_CRACK -> "hud.beyondthelimits.sky.crack";
			case BtlNetworking.SKY_EVENT_STORM -> "hud.beyondthelimits.sky.storm";
			case BtlNetworking.SKY_EVENT_BLACK_SUN -> "hud.beyondthelimits.sky.blacksun";
			case BtlNetworking.SKY_EVENT_COLLISION -> "hud.beyondthelimits.sky.collision";
			case BtlNetworking.SKY_EVENT_IMPOSSIBLE -> "hud.beyondthelimits.sky.impossible";
			default -> "hud.beyondthelimits.sky.none";
		};
	}

	/** Used by the guidebook and the debug command to describe the current dimension to the player. */
	public static String dimensionName(RegistryKey<World> key, ClientPlayerEntity player) {
		if (key == BtlDimensions.FOGLANDS) {
			return ClientHooks.text("dimension.beyondthelimits.the_foglands");
		}

		if (key == BtlDimensions.CODESCAPE) {
			return ClientHooks.text("dimension.beyondthelimits.codescape");
		}

		if (key == BtlDimensions.BACKROOMS) {
			return ClientHooks.text("dimension.beyondthelimits.backrooms");
		}

		if (key == BtlDimensions.SUBSTRATA) {
			return ClientHooks.text("dimension.beyondthelimits.substrata");
		}

		return player.getWorld().getRegistryKey().getValue().getPath();
	}
}
