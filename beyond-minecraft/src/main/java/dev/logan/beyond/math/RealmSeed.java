package dev.logan.beyond.math;

/** Stable SplitMix64 addressing; bounded slots are distinct from unbounded *possible* seeds. */
public final class RealmSeed {
    private RealmSeed() {}
    public static long mix(long value) {
        value = (value ^ (value >>> 30)) * 0xbf58476d1ce4e5b9L;
        value = (value ^ (value >>> 27)) * 0x94d049bb133111ebL;
        return value ^ (value >>> 31);
    }
    public static int slot(long worldSeed, long traveler, int cursor, int count) {
        if (count < 1 || count > 32) throw new IllegalArgumentException("Realm count must be 1..32");
        // Each cycle visits every slot once, without an ever-growing dimension registry.
        return Math.floorMod(Math.floorMod(mix(worldSeed ^ traveler), count) + cursor, count);
    }
}
