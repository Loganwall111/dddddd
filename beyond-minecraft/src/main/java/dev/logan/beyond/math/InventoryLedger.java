package dev.logan.beyond.math;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.UnaryOperator;

/** Copy-on-boundary inventory vault. The live inventory remains Minecraft's source of truth.
 * Serialized alongside the player's live inventory, never as a separate save/transaction file.
 */
public final class InventoryLedger<T> {
    public static final String ROOT = "root";
    public static final int MAX_SCOPES = 33;
    private final UnaryOperator<T> copy;
    private final Map<String, T> snapshots = new LinkedHashMap<>();
    private String active = ROOT;
    public InventoryLedger(UnaryOperator<T> copy) { this.copy = copy; }
    public String active() { return active; }
    public Map<String, T> snapshots() {
        Map<String, T> result = new LinkedHashMap<>();
        snapshots.forEach((key, value) -> result.put(key, copy.apply(value)));
        return result;
    }
    public void restore(String active, Map<String, T> data) {
        if (!valid(active) || data.size() > MAX_SCOPES || data.keySet().stream().anyMatch(k -> !valid(k)))
            throw new IllegalArgumentException("Invalid inventory vault");
        snapshots.clear();
        data.forEach((key, value) -> snapshots.put(key, copy.apply(value)));
        this.active = active;
    }
    public T switchTo(String target, T live) {
        if (!valid(target)) throw new IllegalArgumentException("Invalid realm scope");
        if (active.equals(target)) return copy.apply(live);
        int additions = (snapshots.containsKey(active) ? 0 : 1) + (snapshots.containsKey(target) ? 0 : 1);
        if (snapshots.size() + additions > MAX_SCOPES) throw new IllegalStateException("Inventory vault is full");
        // Copy everything before changing the ledger: a failed serializer cannot half-switch it.
        T outgoing = copy.apply(live);
        T incoming = copy.apply(snapshots.getOrDefault(target, live));
        T savedIncoming = copy.apply(incoming);
        snapshots.put(active, outgoing);
        snapshots.put(target, savedIncoming);
        active = target;
        return incoming;
    }
    public static boolean valid(String key) {
        return ROOT.equals(key) || key != null && key.matches("beyond:realm_[0-9]{2}");
    }
}
