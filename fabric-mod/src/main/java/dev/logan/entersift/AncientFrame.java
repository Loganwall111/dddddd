package dev.logan.entersift;

import java.util.HashSet;
import java.util.Set;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.block.Blocks;

/** Finds an actual intact reinforced-deepslate rectangle, without editing the city. */
public record AncientFrame(BlockPos bottom, int width, int height, boolean alongX) {
    public String key() { return bottom.toShortString() + ":" + alongX; }
    public double x() { return bottom.getX() + (alongX ? width / 2.0 : 0) + .5; }
    public double y() { return bottom.getY() + 1.0; }
    public double z() { return bottom.getZ() + (alongX ? 0 : width / 2.0) + .5; }
    public static AncientFrame find(ServerLevel level, BlockPos note) {
        Set<BlockPos> rim = new HashSet<>();
        for (BlockPos p : BlockPos.betweenClosed(note.offset(-24, -10, -24), note.offset(24, 14, 24))) {
            if (level.hasChunkAt(p) && level.getBlockState(p).is(Blocks.REINFORCED_DEEPSLATE)) rim.add(p.immutable());
        }
        AncientFrame best = null;
        for (BlockPos base : rim) for (boolean x : new boolean[]{true, false}) {
            for (int w = 5; w <= 24; w++) for (int h = 4; h <= 12; h++) {
                if (best != null && w*h <= best.width*best.height) continue;
                boolean valid = true;
                for (int i = 0; i <= w && valid; i++)
                    valid = rim.contains(base.offset(x ? i : 0, 0, x ? 0 : i)) && rim.contains(base.offset(x ? i : 0, h, x ? 0 : i));
                for (int i = 1; i < h && valid; i++)
                    valid = rim.contains(base.above(i)) && rim.contains(base.offset(x ? w : 0, i, x ? 0 : w));
                if (valid) best = new AncientFrame(base, w, h, x);
            }
        }
        return best;
    }
}
