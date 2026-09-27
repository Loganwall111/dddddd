package dev.logan.entersift;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
class RitualSequenceTest {
    @Test void correctSixDistinctNotesComplete() {
        var s = new RitualSequence();
        for (int i = 0; i < 5; i++) assertEquals(RitualSequence.Result.ADVANCED, s.play(RitualSequence.COLORS[i], "note"+i, i*20));
        assertEquals(RitualSequence.Result.COMPLETE, s.play("purple", "note5", 100));
        assertEquals(0, s.progress());
    }
    @Test void wrongColorResets() {
        var s = new RitualSequence(); s.play("red", "a", 0);
        assertEquals(RitualSequence.Result.RESET, s.play("blue", "b", 1));
        assertEquals(0, s.progress());
    }
    @Test void recoloringOneNoteDoesNotSolve() {
        var s = new RitualSequence(); s.play("red", "a", 0);
        assertEquals(RitualSequence.Result.RESET, s.play("magenta", "a", 1));
    }
    @Test void timeoutAndRedRestart() {
        var s = new RitualSequence(); s.play("red", "a", 0);
        assertEquals(RitualSequence.Result.RESET, s.play("magenta", "b", 601));
        s.play("red", "a", 602);
        assertEquals(RitualSequence.Result.RESET, s.play("red", "a", 603));
        assertEquals(1, s.progress());
    }
    @Test void independentFramesCannotShareProgress() {
        var a = new RitualSequence(); var b = new RitualSequence(); a.play("red", "a", 0);
        assertEquals(RitualSequence.Result.RESET, b.play("magenta", "b", 1));
        assertEquals(1, a.progress());
    }
}
