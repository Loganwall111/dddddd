package dev.logan.entersift;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/** Eight distinct physical notes, per frame; pitches are persisted in NoteBlock.NOTE. */
public final class RitualSequence {
    public static final int[] ORDER = {1, 3, 7, 6, 5, 2, 4, 8};
    public static final String[] COLORS = {"red", "orange", "yellow", "green", "cyan", "blue", "purple", "pink"};
    public static final long TIMEOUT = 20 * 30;
    private final Set<String> notes = new LinkedHashSet<>();
    private int progress;
    private List<String> completedNotes = List.of();
    private long lastTick = Long.MIN_VALUE;
    public enum Result { ADVANCED, RESET, COMPLETE, IGNORED }
    private String lastPosition;
    private int lastPitch;
    private int lastWrongPitch, lastExpected;
    public Result play(int pitch, String position, long tick) {
        if (lastTick != Long.MIN_VALUE && tick - lastTick > TIMEOUT) reset();
        lastTick = tick;
        // The same block at the same pitch as the note just accepted is a duplicate click: ignore it, don't reset.
        // (Retuning that block to another pitch is still a wrong note and resets, see RitualSequenceTest.)
        if (progress > 0 && position.equals(lastPosition) && pitch == lastPitch) return Result.IGNORED;
        if (pitch != ORDER[progress] || notes.contains(position)) {
            lastWrongPitch = pitch; lastExpected = ORDER[progress];
            reset();
            lastPosition = null;
            if (pitch == ORDER[0]) { notes.add(position); progress = 1; lastPosition = position; lastPitch = pitch; }
            return Result.RESET;
        }
        notes.add(position);
        lastPosition = position; lastPitch = pitch;
        if (++progress == ORDER.length) { completedNotes = List.copyOf(notes); reset(); return Result.COMPLETE; }
        return Result.ADVANCED;
    }
    public List<String> completedNotes() { return completedNotes; }
    public int progress() { return progress; }
    public boolean expired(long tick) { return lastTick != Long.MIN_VALUE && tick - lastTick > TIMEOUT; }
    /** Human-readable reason for the last RESET. */
    public String resetReason() {
        return "Pitch " + lastWrongPitch + " is not next (expected " + lastExpected + ").";
    }
    private void reset() { progress = 0; notes.clear(); lastPosition = null; }
}
