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
import java.util.List;

/** A real in-game book/config screen. Every setting here controls the actual renderer. */
public final class FieldGuideScreen extends Screen {
    private static final int INK = 0xFFC7D6D9, MUTED = 0xFF80989F, GOLD = 0xFFD6B87C, TEAL = 0xFF7BE1D4;
    private static final String[] TABS = {"Witness", "Gravity", "Atlas", "Mandela", "Settings"};
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
        int right = x + w / 2 + 16;
        if (page == 0) button("Skip the encounter", right, y + h - 53, column - 4, 18, ClientReality::skipIntroduction);
        if (page == 3) button("Lens: " + VisualConfig.LENSES[BeyondClient.CONFIG.lens], right, y + 111, column - 4, 20, () -> { BeyondClient.cycleLens(); clearAndInit(); });
        if (page == 4) {
            var cfg = BeyondClient.CONFIG;
            button("Effects: " + on(cfg.enabled), right, y + 80, column - 4, 18, () -> { cfg.enabled = !cfg.enabled; refresh(); });
            button("Cosmic sky: " + on(cfg.cosmicSky), right, y + 101, column - 4, 18, () -> { cfg.cosmicSky = !cfg.cosmicSky; refresh(); });
            button("Motion: " + (cfg.reducedMotion ? "reduced" : "animated"), right, y + 122, column - 4, 18, () -> { cfg.reducedMotion = !cfg.reducedMotion; refresh(); });
            button("Quality: " + new String[]{"Low / 32", "Balanced / 48", "High / 72"}[cfg.quality], right, y + 143, column - 4, 18,
                () -> { cfg.quality = (cfg.quality + 1) % 3; refresh(); });
            addDrawableChild(new SliderWidget(right, y + 164, column - 4, 18, Text.empty(), cfg.intensity) {
                { updateMessage(); }
                @Override protected void updateMessage() { setMessage(Text.literal("Intensity: " + Math.round(value * 100) + "%")); }
                @Override protected void applyValue() { BeyondClient.CONFIG.intensity = (float) value; }
            });
            button("Introduction: " + on(cfg.introduction), x + 16, y + h - 54, column, 18, () -> { cfg.introduction = !cfg.introduction; refresh(); });
        }
    }
    private static String on(boolean value) { return value ? "on" : "off"; }
    private void refresh() { BeyondClient.CONFIG.save(); clearAndInit(); }
    private void changePage(int page) { this.page = page; scroll = maxScroll = 0; clearAndInit(); }
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
        ctx.drawText(textRenderer, "FIELD NOTES / 01", x + w / 2 + 15, y + 14, MUTED, false);
        // The two clipped pages prevent small GUI scales from painting over controls or outside the book.
        ctx.enableScissor(x + 12, y + 63, x + w - 12, y + h - 57);
        switch (page) {
            case 0 -> {
                heading(ctx, "00 / THE WITNESS", false);
                paragraph(ctx, "You thought the sky was empty.\n\nThe first time you arrive, something on the other side of it opens an eye. The world is not destroyed. It is being observed.\n\nLook just above your original facing direction. The encounter dissolves into falling code, leaving the Overworld intact.", false, 91);
                heading(ctx, "YOUR FIRST EXPERIMENT", true);
                paragraph(ctx, "1. Use a disposable test world.\n2. Run /beyond kit with cheats.\n3. Equip the glasses in your head slot.\n4. Use the knife toward open space.\n5. Walk through the membrane.\n\nB · this guide\nV · change the Mandela lens\nO · immediately toggle effects", true, 91);
            }
            case 1 -> {
                heading(ctx, "01 / EVENT HORIZON", false);
                paragraph(ctx, "Use a Shattered Relic to open a singularity nine blocks ahead. Its light bends; its accretion disk moves around a dark horizon.\n\nGravity pulls its creator, nearby creatures and loose items. Flying creative players are not pulled. Cross its center to enter a realm.", false, 91);
                heading(ctx, "KEEP YOUR DISTANCE", true);
                paragraph(ctx, "The effect has a lifetime, a speed limit and an entity budget. It does not delete terrain or damage you directly.\n\nThe light solver integrates a Schwarzschild-inspired ray equation. Gameplay gravity is softened inverse-square attraction, not general relativity or ragdolls.\n\n/beyond clear · operator cleanup", true, 91);
            }
            case 2 -> {
                heading(ctx, "02 / THE LIVING ATLAS", false);
                int ly = y + 92 - scroll;
                for (int i = 0; i < Math.min(8, BeyondMinecraft.CATALOG.realms().size()); i++) {
                    if (ly >= y + 91 && ly < y + h - 66) ctx.drawText(textRenderer, "%02d  %s".formatted(i, BeyondMinecraft.CATALOG.realms().get(i).name()), x + 16, ly, INK, false); ly += 16;
                    maxScroll = Math.max(maxScroll, ly + scroll - (y + h - 64));
                }
                heading(ctx, "A WAY BACK", true);
                paragraph(ctx, "Sneak-use the Reality Knife, or type /beyond return. The first external origin is remembered across nested trips.\n\nBy default, each new realm begins with a copy of your current inventory, then keeps its own snapshot. Root reality restores its own inventory. Chests are not isolated.\n\nEight compiled realms, not literally infinite worlds. Back up playerdata before experimenting.", true, 91);
            }
            case 3 -> {
                heading(ctx, "03 / THE MANDELA EFFECT", false);
                paragraph(ctx, "Radiate Reality Glasses change what you perceive, not the world's collision geometry.\n\nLucid · cool spectral clarity\nAurora · flowing polar light\nPrismatic · faceted refraction\nNegative Space · pale void\nLiving Membrane · impossible forms\nEcho Memory · warm displaced traces\n\nPress V while exploring to change the lens.", false, 91);
                heading(ctx, "CALIBRATE YOUR LENS", true);
                paragraph(ctx, BeyondClient.wearingGlasses() ? "Glasses detected. Your lens is active." : "Equip the glasses in the head slot to activate your selected lens.", true, 91);
                paragraph(ctx, "These are stylized GLSL looks, not photorealistic texture replacements.\n\nThe membrane's interior is a procedural vista. Crossing loads the real destination. Recursive live-world portal rendering is not in this alpha.", true, 145);
            }
            default -> {
                heading(ctx, "04 / OBSERVATION CONTROLS", false);
                paragraph(ctx, "Settings are saved locally. They never change server gravity or inventory policy.\n\nLower quality reduces ray-integration work. All effects can be disabled with O.\n\nReduced motion freezes shader animation and removes the introduction's screen distortion.\n\n" + CosmicRenderer.status(), false, 91);
                heading(ctx, "YOUR PERCEPTION", true);
            }
        }
        ctx.disableScissor();
        ctx.drawCenteredTextWithShadow(textRenderer, (page + 1) + " / " + TABS.length + (maxScroll > 0 ? "  ·  WHEEL TO SCROLL" : "  ·  ALPHA 0.1"), x + w / 2, y + h - 22, MUTED);
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
                if (top >= y + 91 && top < y + h - 66) ctx.drawText(textRenderer, wrapped, left, top, INK, false); top += 11;
            }
        }
        maxScroll = Math.max(maxScroll, top + scroll - (y + h - 64));
    }
    @Override public boolean mouseScrolled(double mouseX, double mouseY, double horizontal, double vertical) {
        scroll = Math.clamp(scroll - (int) (vertical * 22), 0, Math.max(0, maxScroll)); return true;
    }
    @Override public void close() { BeyondClient.CONFIG.save(); if (client != null) client.setScreen(parent); }
    @Override public boolean shouldPause() { return true; }
}
