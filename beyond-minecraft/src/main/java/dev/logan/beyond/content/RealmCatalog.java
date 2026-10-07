package dev.logan.beyond.content;

import com.google.gson.Gson;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.List;

/** Compiled resource catalog, not runtime registry mutation. The generator owns this contract. */
public record RealmCatalog(int schema, long seed, List<Realm> realms) {
    /** Five materials per realm, its own terrain recipe, its own generator id and its own atmosphere. */
    public record Realm(String id, String name, int theme, int color, int seed, List<String> blocks,
                        String terrain, float ambient, int time, int materials, String generator) {
        public boolean generated() { return !"minecraft:noise".equals(generator); }
        public String stratum() { return blocks.get(0); }
        public String surface() { return blocks.get(1); }
        public String crystal() { return blocks.get(2); }
        public String flora() { return blocks.get(3); }
        public String core() { return blocks.get(4); }
        public static final String[] KINDS = {"stratum", "surface", "crystal", "flora", "core"};
    }
    public static RealmCatalog load() {
        try (var stream = RealmCatalog.class.getResourceAsStream("/assets/beyond/catalog.json")) {
            if (stream == null) throw new IllegalStateException("Missing procedural catalog; run generate_multiverse.py");
            RealmCatalog catalog = new Gson().fromJson(new InputStreamReader(stream, StandardCharsets.UTF_8), RealmCatalog.class);
            if (catalog.schema != 2 || catalog.realms == null || catalog.realms.isEmpty() || catalog.realms.size() > 32)
                throw new IllegalStateException("Invalid catalog header");
            for (int i = 0; i < catalog.realms.size(); i++) {
                Realm r = catalog.realms.get(i);
                if (!r.id.equals("realm_%02d".formatted(i)) || r.blocks == null || r.blocks.size() != Realm.KINDS.length)
                    throw new IllegalStateException("Invalid catalog realm: " + r.id);
                for (int k = 0; k < Realm.KINDS.length; k++)
                    if (!r.blocks.get(k).equals(r.id + "_" + Realm.KINDS[k]))
                        throw new IllegalStateException("Invalid material order in " + r.id);
                if (r.generator == null || (!r.generator.equals("minecraft:noise") && !r.generator.startsWith("beyond:")))
                    throw new IllegalStateException("Invalid generator for " + r.id);
            }
            return catalog;
        } catch (Exception error) { throw new IllegalStateException("Unable to read Beyond's catalog", error); }
    }
    /** Realm index by dimension path, or -1. */
    public int indexOf(String dimensionPath) {
        for (int i = 0; i < realms.size(); i++) if (realms.get(i).id().equals(dimensionPath)) return i;
        return -1;
    }
    public Realm realm(String dimensionPath) {
        int index = indexOf(dimensionPath);
        return index < 0 ? null : realms.get(index);
    }
}
