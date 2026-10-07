package dev.logan.beyond.math;

import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class InventoryLedgerTest {
    private InventoryLedger<List<String>> ledger() { return new InventoryLedger<>(ArrayList::new); }
    @Test void firstVisitClonesThenKeepsIndependentInventories() {
        var ledger = ledger();
        var root = new ArrayList<>(List.of("sword", "bread"));
        var first = ledger.switchTo("beyond:realm_00", root);
        first.remove("bread"); first.add("realm crystal");
        var restored = ledger.switchTo("root", first);
        assertEquals(root, restored);
        restored.add("root torch");
        assertEquals(List.of("sword", "realm crystal"), ledger.switchTo("beyond:realm_00", restored));
        assertEquals(List.of("sword", "bread", "root torch"), ledger.switchTo("root", first));
    }
    @Test void serializableSnapshotRoundTripRetainsAllScopes() {
        var one = ledger(); one.switchTo("beyond:realm_00", new ArrayList<>(List.of("root")));
        one.switchTo("beyond:realm_01", new ArrayList<>(List.of("realm zero")));
        var two = ledger(); two.restore(one.active(), one.snapshots());
        assertEquals(List.of("root"), two.switchTo("root", new ArrayList<>(List.of("realm one"))));
        assertEquals(List.of("realm zero"), two.switchTo("beyond:realm_00", new ArrayList<>(List.of("root"))));
    }
    @Test void deathDoesNotResurrectTheOldRealmInventory() {
        var vault = ledger(); vault.switchTo("beyond:realm_00", new ArrayList<>(List.of("root sword")));
        // Vanilla dropped these items. The outgoing live state is empty on cross-world respawn.
        assertEquals(List.of("root sword"), vault.switchTo("root", new ArrayList<>()));
        assertTrue(vault.switchTo("beyond:realm_00", new ArrayList<>(List.of("root sword"))).isEmpty());
    }
    @Test void sameScopeNeverRestoresAStaleSnapshot() {
        var vault = ledger(); vault.switchTo("beyond:realm_00", new ArrayList<>(List.of("old")));
        assertEquals(List.of("new"), vault.switchTo("beyond:realm_00", new ArrayList<>(List.of("new"))));
    }
    @Test void exportedSnapshotCannotMutateTheVault() {
        var vault = ledger(); vault.switchTo("beyond:realm_00", new ArrayList<>(List.of("root")));
        vault.snapshots().get("root").clear();
        assertEquals(List.of("root"), vault.switchTo("root", new ArrayList<>()));
    }
    @Test void invalidNamespaceCannotGrowTheVault() {
        var vault = ledger();
        assertThrows(IllegalArgumentException.class, () -> vault.switchTo("../playerdata/other", List.of()));
        assertEquals("root", vault.active()); assertTrue(vault.snapshots().isEmpty());
    }
    @Test void fullVaultFailsBeforeMutation() {
        var vault = ledger();
        for (int i = 0; i < 32; i++) vault.switchTo("beyond:realm_%02d".formatted(i), new ArrayList<>(List.of("slot" + i)));
        var before = vault.snapshots();
        assertThrows(IllegalStateException.class, () -> vault.switchTo("beyond:realm_32", List.of("unsafe")));
        assertEquals(before, vault.snapshots()); assertEquals("beyond:realm_31", vault.active());
    }
    @Test void serializationFailureIsTransactional() {
        var vault = new InventoryLedger<List<String>>(value -> {
            if (value.contains("bad")) throw new IllegalStateException("encoder failure");
            return new ArrayList<>(value);
        });
        assertThrows(IllegalStateException.class, () -> vault.switchTo("beyond:realm_00", List.of("bad")));
        assertEquals("root", vault.active()); assertTrue(vault.snapshots().isEmpty());
    }
}
