package dev.logan.beyond.content;

import dev.logan.beyond.BeyondMinecraft;
import net.fabricmc.fabric.api.itemgroup.v1.FabricItemGroup;
import net.minecraft.block.AbstractBlock;
import net.minecraft.block.Block;
import net.minecraft.block.Blocks;
import net.minecraft.item.*;
import net.minecraft.recipe.Ingredient;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;
import net.minecraft.registry.entry.RegistryEntry;
import net.minecraft.sound.SoundEvents;
import net.minecraft.text.Text;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public final class BeyondContent {
    public static final List<Item> ALL = new ArrayList<>();
    public static Item KNIFE, RELIC, GUIDE, GLASSES, SCALE;
    private BeyondContent() {}
    private static Item item(String id, Item item) {
        Registry.register(Registries.ITEM, BeyondMinecraft.id(id), item); ALL.add(item); return item;
    }
    public static void initialize() {
        KNIFE = item("reality_knife", new AbilityItem(AbilityItem.Ability.KNIFE));
        RELIC = item("shattered_relic", new AbilityItem(AbilityItem.Ability.RELIC));
        GUIDE = item("field_guide", new AbilityItem(AbilityItem.Ability.GUIDE));
        SCALE = item("scale_prism", new AbilityItem(AbilityItem.Ability.SCALE));
        RegistryEntry<ArmorMaterial> radiate = Registry.registerReference(Registries.ARMOR_MATERIAL, BeyondMinecraft.id("radiate"),
            new ArmorMaterial(Map.of(ArmorItem.Type.HELMET, 1, ArmorItem.Type.CHESTPLATE, 0, ArmorItem.Type.LEGGINGS, 0,
                ArmorItem.Type.BOOTS, 0, ArmorItem.Type.BODY, 0), 12, SoundEvents.ITEM_ARMOR_EQUIP_GOLD,
                () -> Ingredient.ofItems(Items.AMETHYST_SHARD), List.of(new ArmorMaterial.Layer(BeyondMinecraft.id("radiate"))), 0, 0));
        GLASSES = item("radiate_reality_glasses", new ArmorItem(radiate, ArmorItem.Type.HELMET,
            new Item.Settings().maxDamage(384).rarity(net.minecraft.util.Rarity.RARE)));
        for (RealmCatalog.Realm realm : BeyondMinecraft.CATALOG.realms()) {
            for (String blockId : realm.blocks()) {
                boolean crystal = blockId.endsWith("crystal");
                Block block = Registry.register(Registries.BLOCK, BeyondMinecraft.id(blockId),
                    new Block(AbstractBlock.Settings.copy(crystal ? Blocks.AMETHYST_BLOCK : Blocks.STONE)
                        .strength(crystal ? 1.5f : 2.2f).luminance(state -> crystal ? 9 : 0)));
                item(blockId, new BlockItem(block, new Item.Settings()));
            }
            item(realm.id() + "_echo", new Item(new Item.Settings().rarity(net.minecraft.util.Rarity.UNCOMMON)));
        }
        Registry.register(Registries.ITEM_GROUP, BeyondMinecraft.id("beyond"), FabricItemGroup.builder()
            .displayName(Text.translatable("itemGroup.beyond")).icon(() -> new ItemStack(RELIC))
            .entries((context, entries) -> ALL.forEach(entries::add)).build());
    }
}
