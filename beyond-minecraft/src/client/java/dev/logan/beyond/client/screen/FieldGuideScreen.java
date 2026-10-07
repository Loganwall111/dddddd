package dev.logan.beyond.client.screen;

import dev.logan.beyond.BeyondMinecraft;
import dev.logan.beyond.client.BeyondClient;
import dev.logan.beyond.client.ClientReality;
import dev.logan.beyond.client.VisualConfig;
import dev.logan.beyond.client.render.CosmicRenderer;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.client.gui.widget.SliderWidget;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;

/** A real in-game book/config screen. Every setting here controls the actual renderer. */
public final class FieldGuideScreen extends Screen {
    private static final int INK = 0xFFC7D6D9, MUTED = 0xFF80989F, GOLD = 0xFFD6B87C, TEAL = 0xFF7BE1D4;
    private static final String[] TABS = {"Witness", "The Well", "Atlas", "Realities", "Between", "Settings"};
    private final Screen parent;
    private int page, x, y, w, h, column, scroll, maxScroll;
    public FieldGuideScreen(Screen parent) { super(Text.literal("The Beyond Field Guide")); this.parent = parent; }
    @Override protected void init() {
        w = Math.min(610, width - 20); h = Math.min(330, height - 20);
        x = (width - w) / 2; y = (height - h) / 2; column = (w - 48) / 2;
        int tabW = (w - 32) / TABS.length;
        for (int i = 0; i < TABS.length; i++) {
            final int target = i;
            button((page == i ? "• " : "") + TABS[i], x + 16 + i * tabW, y + 39, tabW - 2, 18, () -> changePage(target));
        }
        button("×", x + w - 29, y + 10, 18, 18, this::close);
        button("‹", x + 16, y + h - 27, 24, 18, () -> changePage(Math.floorMod(page - 1, TABS.length)));
        button("›", x + w - 40, y + h - 27, 24, 18, () -> changePage((page + 1) % TABS.length));
        int left = x + 16, right = x + w / 2 + 16, row = y + h - 121;
        if (page == 0) {
            button("Skip the encounter", left, row, column - 4, 18, ClientReality::skipIntroduction);
            button("Restart the encounter", right, row, column - 4, 18, () -> { ClientReality.replayIntroduction(); refresh(); });
        }
        if (page == 3) {
            button("Reality: " + BeyondClient.CONFIG.reality(), left, row, column - 4, 20, () -> { BeyondClient.cycleLens(); clearAndInit(); });
            button("Equip check: " + (BeyondClient.wearingGlasses() ? "glasses on" : "no glasses"), right, row, column - 4, 20, this::refresh);
            button("Show all " + VisualConfig.REALITIES.length + " in the log", left, row + 22, column * 2 + 4, 18, this::listRealities);
        }
        if (page == 5) {
            var cfg = BeyondClient.CONFIG;
            int step = 19, top = y + 91;
            button("Effects: " + on(cfg.enabled), left, top, column - 4, 18, () -> { cfg.enabled = !cfg.enabled; refresh(); });
            button("Cosmic sky: " + on(cfg.cosmicSky), left, top + step, column - 4, 18, () -> { cfg.cosmicSky = !cfg.cosmicSky; refresh(); });
            button("Nebula: " + on(cfg.nebula), left, top + step * 2, column - 4, 18, () -> { cfg.nebula = !cfg.nebula; refresh(); });
            button("Ambience: " + on(cfg.ambience), left, top + step * 3, column - 4, 18, () -> { cfg.ambience = !cfg.ambience; refresh(); });
            button("Tidal stretch: " + on(cfg.spaghettification), left, top + step * 4, column - 4, 18, () -> { cfg.spaghettification = !cfg.spaghettification; refresh(); });
            button("Seamless travel: " + on(cfg.seamlessTravel), left, top + step * 5, column - 4, 18, () -> { cfg.seamlessTravel = !cfg.seamlessTravel; refresh(); });
            button("Motion: " + (cfg.reducedMotion ? "reduced" : "animated"), right, top, column - 4, 18, () -> { cfg.reducedMotion = !cfg.reducedMotion; refresh(); });
            button("Quality: " + new String[]{"Low / 32", "Balanced / 48", "High / 72"}[cfg.quality], right, top + step, column - 4, 18,
                () -> { cfg.quality = (cfg.quality + 1) % 3; refresh(); });
            button("Introduction: " + on(cfg.introduction), right, top + step * 2, column - 4, 18, () -> { cfg.introduction = !cfg.introduction; refresh(); });
            addDrawableChild(new SliderWidget(right, top + step * 3, column - 4, 18, Text.empty(), cfg.intensity) {
                { updateMessage(); }
                @Override protected void updateMessage() { setMessage(Text.literal("Intensity: " + Math.round(value * 100) + "%")); }
                @Override protected void applyValue() { BeyondClient.CONFIG.intensity = (float) value; }
            });
            button("Restore defaults", right, top + step * 4, column - 4, 18, () -> { BeyondClient.restoreDefaults(); clearAndInit(); });
        }
    }
    private static String on(boolean value) { return value ? "on" : "off"; }
    private void refresh() { BeyondClient.CONFIG.save(); clearAndInit(); }
    private void changePage(int page) { this.page = page; scroll = maxScroll = 0; clearAndInit(); }
    private void listRealities() {
        BeyondClient.CONFIG.save();
        for (int i = 0; i < VisualConfig.REALITIES.length; i++) BeyondMinecraft.LOGGER.info("Beyond reality {:02d} · {}", i, VisualConfig.REALITIES[i]);
    }
    private void button(String label, int bx, int by, int bw, int bh, Runnable action) {
        addDrawableChild(ButtonWidget.builder(Text.literal(label), b -> action.run()).dimensions(bx, by, Math.max(10, bw), bh).build());
    }
    @Override public void render(DrawContext ctx, int mouseX, int mouseY, float delta) {
        maxScroll = 0;
        ctx.fillGradient(0, 0, width, height, 0xCF02040D, 0xED060610);
        ctx.fill(x - 2, y - 2, x + w + 2, y + h + 2, 0xFF5B4B3A);
        ctx.fillGradient(x, y, x + w, y + h, 0xFF17242D, 0xFF0B141F);
        ctx.fill(x + w / 2 - 1, y + 65, x + w / 2 + 1, y + h - 36, 0xFF38414A);
        ctx.fill(x + 14, y + 32, x + w - 14, y + 33, 0xFF756447);
        ctx.drawText(textRenderer, Text.literal("B E Y O N D").formatted(Formatting.BOLD), x + 17, y + 13, GOLD, false);
        ctx.drawText(textRenderer, "FIELD NOTES / 02", x + w / 2 + 15, y + 14, MUTED, false);
        // The two clipped pages prevent small GUI scales from painting over controls or outside the book.
        ctx.enableScissor(x + 12, y + 63, x + w - 12, y + h - 49);
        switch (page) {
            case 0 -> {
                heading(ctx, "00 / THE WITNESS", false);
                paragraph(ctx, "You thought the sky was empty.\n\nOn the first arrival the sky itself moves: a figure stands behind the atmosphere, arm reaching up through cloud, and it is watching you back. It is a person, not an eye floating in a void. It breathes, it shifts its weight, and the whole Overworld sky is its backdrop.\n\nIt never attacks. The encounter dissolves into falling code and leaves the world exactly as it was.", false, 91);
                heading(ctx, "FIRST EXPERIMENT", true);
                paragraph(ctx, "1. Use a disposable test world.\n2. Run /beyond kit with cheats.\n3. Equip the glasses in the head slot.\n4. Press V: the glasses re-author the entire screen.\n5. Look up: the well is real, and reachable.\n\nB · this guide\nV · next reality\nO · toggle effects\nR · tear a hole", true, 91);
            }
            case 1 -> {
                heading(ctx, "01 / THE SKY WELL", false);
                paragraph(ctx, "The colossal singularity above the world is not painted on the sky. Its lensing bends the real scene: terrain, water, cloud and other anomalies are all warped around the horizon, and the shader integrates a Schwarzschild-style null orbit for every pixel.\n\nFly high, then keep flying. The nebula thickens, the accretion disk widens, and eventually you are inside it — walk in, and look back at a bent Overworld.", false, 91);
                heading(ctx, "WHAT IT DOES TO MATTER", true);
                paragraph(ctx, "Mobs and items, not only players, are pulled in, stretched along the pull axis and swallowed. Trees and blocks near a feeding hole are torn loose. Wells grow by consuming matter and never stop.\n\nSome are singularities, some are membranes, some are tears, and some are wormholes that drop you into a different period of time.\n\n/beyond well · /beyond singularity · /beyond clear", true, 91);
            }
            case 2 -> {
                heading(ctx, "02 / THE LIVING ATLAS", false);
                int ly = y + 92 - scroll;
                var realms = BeyondMinecraft.CATALOG.realms();
                for (int i = 0; i < realms.size(); i++) {
                    var realm = realms.get(i);
                    if (ly >= y + 91 && ly < y + h - 49)
                        ctx.drawText(textRenderer, "%02d  %-18s %s".formatted(i, realm.name(), realm.terrain()), x + 16, ly, INK, false);
                    ly += 14;
                    maxScroll = Math.max(maxScroll, ly + scroll - (y + h - 60));
                }
                heading(ctx, "EVERY REALM IS IT'S OWN MATERIAL", true);
                paragraph(ctx, "No recolours: each realm generates its own stone, surface, crystal, flora and core materials with its own textures, forges its own terrain or void, and spawns its own creature family. Everything is procedural and unbounded — walk in any direction forever.\n\nSneak-use the Reality Knife, or type /beyond return.", true, 91);
            }
            case 3 -> {
                heading(ctx, "03 / THE MANDELA LENS", false);
                paragraph(ctx, "Radiate Reality Glasses do not tint the world, they re-author the whole screen with a different reality: colossal photoreal cities and traffic, the Backrooms, the Poolrooms, a cel-animated world, an eighties CRT broadcast, psychedelic spacetime folding, wet neon hyperreality.\n\n" + VisualConfig.REALITIES.length + " realities ship, and V cycles them instantly. Leaving the slider alone only changes how hard the treatment hits.", false, 91);
                heading(ctx, "CURRENT LENS", true);
                paragraph(ctx, (BeyondClient.wearingGlasses() ? "Glasses detected." : "Equip the glasses in the head slot.")
                    + " Your reality is " + BeyondClient.CONFIG.reality() + ".\n\nPress the button below to write every reality name to the log.", true, 91);
            }
            case 4 -> {
                heading(ctx, "04 / THE BETWEEN", false);
                paragraph(ctx, "Tear the fabric with /beyond tear or the Reality Knife: a colossal detonation, then a shockwave, then the rift opens in the sky with its own animation and settles. Walk through it — no loading screen, no fade to a new world, you simply keep walking.\n\nBeyond the tear is a cluster of worlds living inside glass bubbles, all visible from each other and all reachable. Tear into another bubble and the world locks to that universe.", false, 91);
                heading(ctx, "UNDER IT", true);
                paragraph(ctx, "Below the bubbles, a black abyss. Fall toward it and the ground glitches into a pure white maze of bricks and black lines, endless in every direction and every depth — dig down and the maze continues.\n\nThere is also the fractal hollow: a Menger-sponge world of infinite recursive tunnels that never ends, and a circular fractal above a white abyss with stairs climbing through it at random.\n\nSound: a soft hum dominates, the vacuum is very quiet, whispers arrive that never resolve.", true, 91);
            }
            default -> {
                heading(ctx, "05 / OBSERVATION CONTROLS", false);
                paragraph(ctx, "Settings are saved locally. They never change server gravity, inventory policy or world generation.\n\nQuality lowers ray-integration work. Seamless travel keeps the world visible while you cross a boundary. Reduced motion freezes shader animation.\n\n" + CosmicRenderer.status(), false, 91);
                heading(ctx, "YOUR PERCEPTION", true);
                paragraph(ctx, "Spawn a well, watch it feed, walk in, and come back out.\n\nIf anything goes wrong, press O: gameplay keeps running with vanilla rendering.\n\n/beyond where · journey state\n/beyond witness · replay the introduction", true, 91);
            }
        }
        ctx.disableScissor();
        ctx.drawCenteredTextWithShadow(textRenderer, (page + 1) + " / " + TABS.length + (maxScroll > 0 ? "  ·  WHEEL TO SCROLL" : "  ·  ALPHA 0.2"), x + w / 2, y + h - 22, MUTED);
        // In 1.21.1 Screen.render applies the default background blur before its widgets.
        // We already drew our own book and ink: render only our registered children here,
        // otherwise the text is blurred while the later buttons remain sharp.
        for (var child : children()) if (child instanceof net.minecraft.client.gui.Drawable drawable)
            drawable.render(ctx, mouseX, mouseY, delta);
    }
    private void heading(DrawContext ctx, String text, boolean right) {
        ctx.drawText(textRenderer, text, x + (right ? w / 2 + 16 : 16), y + 72, TEAL, false);
    }
    private void paragraph(DrawContext ctx, String text, boolean right, int offsetY) {
        int left = x + (right ? w / 2 + 16 : 16), top = y + offsetY - scroll;
        for (String line : text.split("\n", -1)) {
            if (line.isEmpty()) { top += 7; continue; }
            for (var wrapped : textRenderer.wrapLines(Text.literal(line), column - 4)) {
                if (top >= y + 91 && top < y + h - 49) ctx.drawText(textRenderer, wrapped, left, top, INK, false); top += 11;
            }
        }
        maxScroll = Math.max(maxScroll, top + scroll - (y + h - 60));
    }
    @Override public boolean mouseScrolled(double mouseX, double mouseY, double horizontal, double vertical) {
        scroll = Math.clamp(scroll - (int) (vertical * 22), 0, Math.max(0, maxScroll)); return true;
    }
    @Override public void close() { BeyondClient.CONFIG.save(); if (client != null) client.setScreen(parent); }
    @Override public boolean shouldPause() { return true; }
}
