package dev.logan.entersift;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/** Server-only, per-frame state; contains no Minecraft dependencies so it is unit-testable. */
public final class RitualSequence {
    public static final String[] COLORS = {"red", "magenta", "pink", "cyan", "blue", "purple"};
    public static final long TIMEOUT = 20 * 30;
    private final Set<String> notes = new LinkedHashSet<>();
    private int progress;
    private List<String> completedNotes = List.of();
    private long lastTick = Long.MIN_VALUE;

    public enum Result { ADVANCED, RESET, COMPLETE }
    public Result play(String color, String position, long tick) {
        if (lastTick != Long.MIN_VALUE && tick - lastTick > TIMEOUT) reset();
        lastTick = tick;
        if (!COLORS[progress].equals(color) || notes.contains(position)) {
            reset();
            // A red note also starts a fresh attempt after a mistake.
            if (COLORS[0].equals(color)) { notes.add(position); progress = 1; }
            return Result.RESET;
        }
        notes.add(position);
        if (++progress == COLORS.length) { completedNotes = List.copyOf(notes); reset(); return Result.COMPLETE; }
        return Result.ADVANCED;
    }
    public List<String> completedNotes() { return completedNotes; }
    public int progress() { return progress; }
    public boolean expired(long tick) { return lastTick != Long.MIN_VALUE && tick - lastTick > TIMEOUT; }
    private void reset() { progress = 0; notes.clear(); }
}
