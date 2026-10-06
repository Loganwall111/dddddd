package dev.logan.beyond.content;

import com.google.gson.Gson;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.List;

/** Compiled resource catalog, not runtime registry mutation. The generator owns this contract. */
public record RealmCatalog(int schema, long seed, List<Realm> realms) {
    public record Realm(String id, String name, int theme, int color, int seed, List<String> blocks) {}
    public static RealmCatalog load() {
        try (var stream = RealmCatalog.class.getResourceAsStream("/assets/beyond/catalog.json")) {
            if (stream == null) throw new IllegalStateException("Missing procedural catalog; run generate_multiverse.py");
            RealmCatalog catalog = new Gson().fromJson(new InputStreamReader(stream, StandardCharsets.UTF_8), RealmCatalog.class);
            if (catalog.schema != 1 || catalog.realms == null || catalog.realms.isEmpty() || catalog.realms.size() > 32)
                throw new IllegalStateException("Invalid catalog header");
            for (int i = 0; i < catalog.realms.size(); i++) {
                Realm r = catalog.realms.get(i);
                if (!r.id.equals("realm_%02d".formatted(i)) || r.blocks == null || r.blocks.size() != 3 ||
                    r.blocks.stream().anyMatch(b -> !b.matches(r.id + "_(stratum|surface|crystal)")))
                    throw new IllegalStateException("Invalid catalog realm: " + r.id);
            }
            return catalog;
        } catch (Exception error) { throw new IllegalStateException("Unable to read Beyond's catalog", error); }
    }
}
