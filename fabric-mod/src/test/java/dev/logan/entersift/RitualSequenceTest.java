package dev.logan.entersift;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
class RitualSequenceTest {
    @Test void exactEightNotePermutationCompletes() {
        var s=new RitualSequence();
        for(int i=0;i<7;i++)assertEquals(RitualSequence.Result.ADVANCED,s.play(RitualSequence.ORDER[i],"note"+i,i*20));
        assertEquals(RitualSequence.Result.COMPLETE,s.play(8,"note7",140));
        assertEquals(8,s.completedNotes().size()); assertEquals(0,s.progress());
    }
    @Test void ascendingOrderIsNotTheSong() {
        var s=new RitualSequence();s.play(1,"a",0);
        assertEquals(RitualSequence.Result.RESET,s.play(2,"b",1));assertEquals(0,s.progress());
    }
    @Test void retuningSamePhysicalBlockDoesNotSolve() {
        var s=new RitualSequence();s.play(1,"a",0);
        assertEquals(RitualSequence.Result.RESET,s.play(3,"a",1));
    }
    @Test void timeoutAndRestart() {
        var s=new RitualSequence();s.play(1,"a",0);
        assertEquals(RitualSequence.Result.RESET,s.play(3,"b",601));
        s.play(1,"a",602);s.play(1,"a",603);assertEquals(1,s.progress());
    }
    @Test void framesAreIndependent() {
        var a=new RitualSequence();var b=new RitualSequence();a.play(1,"a",0);
        assertEquals(RitualSequence.Result.RESET,b.play(3,"b",1));assertEquals(1,a.progress());
    }
    @Test void invalidPitchesResetSafely() {
        var s=new RitualSequence();assertEquals(RitualSequence.Result.RESET,s.play(9,"a",0));
        assertEquals(RitualSequence.Result.RESET,s.play(0,"b",1));
    }
    @Test void allEightPitchesAppearExactlyOnce() {
        assertArrayEquals(new int[]{1,3,7,6,5,2,4,8},RitualSequence.ORDER);
        assertEquals(8,java.util.Arrays.stream(RitualSequence.ORDER).distinct().count());
    }
}
