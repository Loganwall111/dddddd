package dev.logan.entersift;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.entity.event.v1.ServerLivingEntityEvents;
import net.fabricmc.fabric.api.event.player.AttackBlockCallback;
import net.fabricmc.fabric.api.event.player.AttackEntityCallback;
import net.fabricmc.fabric.api.event.player.UseBlockCallback;
import net.fabricmc.fabric.api.event.player.UseItemCallback;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.NoteBlock;
import net.minecraft.world.phys.AABB;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class EnterTheSift implements ModInitializer {
    public static final Logger LOGGER = LoggerFactory.getLogger("entersift");
    private static final Map<String, RitualSequence> rituals = new HashMap<>();
    private static final Map<String, Long> openingUntil = new HashMap<>();
    /** Last server tick each note block was struck: one click can arrive several times (see strike()). */
    private static final Map<BlockPos, Long> lastStrike = new HashMap<>();
    private static long ticks;
    public static void runAs(ServerPlayer player, String command) {
        if (player.level() instanceof ServerLevel level) run(level, "execute as " + player.getUUID() + " at @s run " + command);
    }
    private static void run(ServerLevel level, String command) {
        level.getServer().getCommands().performPrefixedCommand(level.getServer().createCommandSourceStack().withSuppressedOutput(), command);
    }
    private static void runAt(ServerLevel level, AncientFrame f, String command) {
        run(level, String.format(Locale.ROOT,"execute in %s positioned %.2f %.2f %.2f run %s",level.dimension().identifier(),f.x(),f.y(),f.z(),command));
    }
    private static boolean hasTag(ServerLevel level, AncientFrame f, String tag) {
        // Use the command tag selector API, avoiding version-specific Entity tag accessors.
        java.util.concurrent.atomic.AtomicBoolean found = new java.util.concurrent.atomic.AtomicBoolean(false);
        var source = level.getServer().createCommandSourceStack().withSuppressedOutput()
            .withCallback((success, value) -> found.set(success && value > 0));
        String query=String.format(Locale.ROOT,"execute in %s positioned %.2f %.2f %.2f if entity @e[type=minecraft:marker,tag=%s,distance=..1]",level.dimension().identifier(),f.x(),f.y(),f.z(),tag);
        level.getServer().getCommands().performPrefixedCommand(source, query);
        return found.get();
    }
    private static boolean gauntlet(ItemStack stack) { return stack.is(SiftContent.GAUNTLET) || stack.is(SiftContent.RED_GAUNTLET) || stack.is(SiftContent.RIFT_STAFF) || stack.is(SiftContent.RIFT_STAFF_BLUE); }
    private static boolean isStaff(ItemStack stack) { return stack.is(SiftContent.RIFT_STAFF) || stack.is(SiftContent.RIFT_STAFF_BLUE); }
    private static boolean note(Level world, BlockPos pos) {
        return world.getBlockState(pos).is(Blocks.NOTE_BLOCK) && world.getBlockState(pos.below()).is(SiftContent.SONOROUS_DEEPSLATE);
    }
    private static void glow(ServerPlayer player, BlockPos pos, int pitch) {
        if (player.level() instanceof ServerLevel level) glow(level, pos, pitch);
    }
    private static void glow(ServerLevel level, BlockPos pos, int pitch) {
        // ".0" matters: integer x/z in "positioned" are block-centred (+0.5), which shifted every outline half a block.
        run(level,"execute in "+level.dimension().identifier()+" positioned "+pos.getX()+".0 "+pos.getY()+".0 "+pos.getZ()+".0 run function entersift:notes/"+RitualSequence.COLORS[pitch-1]);
    }
    /** Actionbar message to the striking player (or the server log when a test strikes without a player). */
    private static void tell(ServerPlayer sp, String text, String color) {
        if (sp != null) runAs(sp,"title @s actionbar {\"text\":\""+text+"\",\"color\":\""+color+"\"}");
        else LOGGER.info("Sift ritual: {}", text);
    }
    private static void shaft(ServerPlayer player, BlockPos pos, int pitch) {
        if (player.level() instanceof ServerLevel level) shaft(level, pos, pitch);
    }
    private static void shaft(ServerLevel level, BlockPos pos, int pitch) {
        run(level,"execute in "+level.dimension().identifier()+" positioned "+pos.getX()+".0 "+pos.getY()+".0 "+pos.getZ()+".0 run function entersift:notes/shaft_"+RitualSequence.COLORS[pitch-1]);
    }
    private static void ensureEncounter(ServerLevel level, AncientFrame f) {
        if (!hasTag(level,f,"sift.encounter")) runAt(level,f,"function entersift:guardian/begin");
    }

    /**
     * 0.14.1: one stable frame per ancient city. AncientFrame.find only scans 24 blocks around the note it
     * is given, so note blocks spread around a big city each saw a different slice of the reinforced
     * deepslate and could pick different frames. Every frame has its own song, so progress never reached
     * 8 / 8. Now the first frame found near a spot is remembered and reused, and a frame that already has
     * the guardian's encounter marker always wins.
     */
    private static final Map<String, AncientFrame> knownFrames = new HashMap<>();
    static AncientFrame frameNear(ServerLevel level, BlockPos pos) {
        for (AncientFrame f : knownFrames.values())
            if (Math.abs(f.x() - pos.getX()) <= 32 && Math.abs(f.z() - pos.getZ()) <= 32 && Math.abs(f.y() - pos.getY()) <= 16
                && level.getBlockState(f.bottom()).is(Blocks.REINFORCED_DEEPSLATE)) return f;
        for (net.minecraft.world.entity.Entity e : level.getAllEntities()) {
            if (!e.entityTags().contains("sift.encounter")) continue; // only the ritual frame marker carries this tag
            if (e.distanceToSqr(pos.getX() + .5, pos.getY() + .5, pos.getZ() + .5) > 40 * 40) continue;
            AncientFrame f = AncientFrame.find(level, BlockPos.containing(e.getX(), e.getY(), e.getZ()));
            if (f != null && Math.abs(f.x() - e.getX()) < 1.1 && Math.abs(f.y() - e.getY()) < 1.1 && Math.abs(f.z() - e.getZ()) < 1.1) {
                knownFrames.put(f.key(), f);
                return f;
            }
        }
        AncientFrame f = AncientFrame.find(level, pos);
        if (f != null) knownFrames.put(f.key(), f);
        return f;
    }

    /**
     * Strike a ritual note block (left click). Public so the CI smoke test can play the song without a player.
     *
     * 0.14.1 fix: a cancelled left click is re-sent by the client every tick the button is held (block
     * breaking restarts because it never began), so one click reached the server two or three times. The
     * second copy counted as a wrong note and silently reset the song to 1/8. Repeat strikes of the same
     * block within 8 ticks are now ignored, and replaying the note that was just accepted never resets.
     */
    public static void strike(ServerLevel level, BlockPos pos, ServerPlayer sp) {
        Long last = lastStrike.get(pos);
        if (last != null && ticks - last < 8) { lastStrike.put(pos.immutable(), ticks); return; }
        lastStrike.put(pos.immutable(), ticks);
        int pitch=level.getBlockState(pos).getValue(NoteBlock.NOTE)%8+1;
        glow(level,pos,pitch);
        shaft(level,pos,pitch);
        run(level,"execute in "+level.dimension().identifier()+" positioned "+pos.getX()+".5 "+pos.getY()+".5 "+pos.getZ()+".5 run playsound minecraft:block.note_block.chime block @a[distance=..24] ~ ~ ~ 1 "+Math.pow(2,(pitch-5)/12.0));
        if (!level.dimension().equals(Level.OVERWORLD)) return;
        AncientFrame f=frameNear(level,pos);
        if (f==null) {
            tell(sp,"No ancient city frame (reinforced deepslate) within 24 blocks of this note.","gray");
            return;
        }
        ensureEncounter(level,f);
        if (!hasTag(level,f,"sift.ready")) {
            tell(sp,"The Twisted Warden guards this song. Defeat it first.","red");
            return;
        }
        if (openingUntil.containsKey(f.key()) || hasTag(level,f,"sift.portal")) return;
        RitualSequence sequence=rituals.computeIfAbsent(f.key(),key -> new RitualSequence());
        var result=sequence.play(pitch,pos.getX()+","+pos.getY()+","+pos.getZ(),ticks);
        if (result==RitualSequence.Result.COMPLETE) {
            for(int i=0;i<8;i++) {
                String[] xyz=sequence.completedNotes().get(i).split(",");
                BlockPos n=new BlockPos(Integer.parseInt(xyz[0]),Integer.parseInt(xyz[1]),Integer.parseInt(xyz[2]));
                if(!note(level,n) || level.getBlockState(n).getValue(NoteBlock.NOTE)%8+1!=RitualSequence.ORDER[i]) {
                    rituals.remove(f.key());
                    tell(sp,"Keep all eight pitches intact until the song is complete.","red");
                    return;
                }
            }
            runAt(level,f,"function entersift:ritual/begin");
            runAt(level,f,"tellraw @a[distance=..64] {\"text\":\"The song is complete. The city sings it back...\",\"color\":\"aqua\"}");
            LOGGER.info("Sift ritual complete at frame {} ({}x{}, alongX={})", f.key(), f.width(), f.height(), f.alongX());
            double sx=f.alongX()?f.width()-1:.07, sz=f.alongX()?.07:f.width()-1;
            runAt(level,f,String.format(Locale.ROOT,"data merge entity @e[type=minecraft:marker,tag=sift.ritual,distance=..1,limit=1,sort=nearest] {data:{sx:%ff,sy:%ff,sz:%ff,tx:%ff,tz:%ff,pw:%ff,yaw:%ff}}",sx,(double)f.height()-1,sz,-sx/2,-sz/2,(double)f.width()-1,f.alongX()?0.0:90.0));
            StringBuilder panels=new StringBuilder("data merge entity @e[type=minecraft:marker,tag=sift.ritual,distance=..1,limit=1,sort=nearest] {data:{");
            panels.append("ax:0.015f,az:0.015f,bx:").append(sx/ (f.alongX()?8:1)).append("f,bz:").append(sz/(f.alongX()?1:8)).append('f');
            for(int i=0;i<8;i++) {
                panels.append(",p").append(i).append("x:").append(-sx/2+(f.alongX()?i*sx/8:0)).append('f');
                panels.append(",p").append(i).append("z:").append(-sz/2+(f.alongX()?0:i*sz/8)).append('f');
            }
            runAt(level,f,panels.append("}}").toString());
            StringBuilder data=new StringBuilder("data merge entity @e[type=minecraft:marker,tag=sift.ritual,distance=..1,limit=1,sort=nearest] {data:{");
            for(int i=0;i<8;i++) {
                String[] xyz=sequence.completedNotes().get(i).split(",");
                if(i>0)data.append(',');
                data.append("n").append(i).append("x:").append(xyz[0]).append(",n").append(i).append("y:").append(xyz[1]).append(",n").append(i).append("z:").append(xyz[2]);
            }
            runAt(level,f,data.append("}}").toString());
            openingUntil.put(f.key(),ticks+360); rituals.remove(f.key());
        } else {
            if (result==RitualSequence.Result.IGNORED) { tell(sp,"That note is already sung ("+sequence.progress()+" / 8). Each pitch needs its own note block.","gray"); return; }
            String message=result==RitualSequence.Result.RESET
                ? sequence.resetReason()+" Song reset"+(sequence.progress()==1?" (1 / 8 kept)":"")+". Play 1, 3, 7, 6, 5, 2, 4, 8 on eight different note blocks."
                : "The city listens: "+sequence.progress()+" / 8";
            tell(sp,message,result==RitualSequence.Result.RESET?"gold":"aqua");
        }
    }
    @Override public void onInitialize() {
        SiftContent.initialize();
        RiftBlockEntities.initialize();
        SiftSounds.initialize();
        SiftEntities.initialize();
        SiftSmokeTest.register();
        ServerLifecycleEvents.SERVER_STOPPED.register(server -> { rituals.clear(); openingUntil.clear(); lastStrike.clear(); knownFrames.clear(); ticks=0; });
        ServerTickEvents.END_SERVER_TICK.register(server -> {
            ticks++;
            if (ticks%100==0) {
                rituals.values().removeIf(s -> s.expired(ticks));
                lastStrike.values().removeIf(t -> ticks-t>200);
                openingUntil.values().removeIf(t -> ticks>t);
                // Approach-based guardian trigger. No chunk generation; scans only already-loaded blocks.
                for (ServerPlayer p : server.getPlayerList().getPlayers()) {
                    if (p.isSpectator() || p.getY()>=0 || !(p.level() instanceof ServerLevel level) || !level.dimension().equals(Level.OVERWORLD)) continue;
                    AncientFrame f=frameNear(level,p.blockPosition());
                    if (f!=null) {
                        ensureEncounter(level,f);
                        if (hasTag(level,f,"sift.ready") && !hasTag(level,f,"sift.portal")) {
                            BlockPos centre=BlockPos.containing(f.x(),f.y(),f.z());
                            for(BlockPos n:BlockPos.betweenClosed(centre.offset(-12,-2,-12),centre.offset(12,2,12)))
                                if(level.hasChunkAt(n) && note(level,n)) glow(p,n,level.getBlockState(n).getValue(NoteBlock.NOTE)%8+1);
                        }
                    }
                }
            }
        });
        ServerLivingEntityEvents.AFTER_DEATH.register((entity, source) -> {
            if (entity.level() instanceof ServerLevel level)
                run(level,"execute as "+entity.getUUID()+" at @s if entity @s[tag=sift.guardian] run function entersift:guardian/slain");
        });
        UseBlockCallback.EVENT.register((player,world,hand,hit) -> {
            BlockPos pos=hit.getBlockPos();
            if (player.isSpectator() || !note(world,pos)) return InteractionResult.PASS;
            if (player instanceof ServerPlayer sp) {
                int next=(world.getBlockState(pos).getValue(NoteBlock.NOTE)+1)%8;
                world.setBlock(pos,world.getBlockState(pos).setValue(NoteBlock.NOTE,next),3);
                glow(sp,pos,next+1);
                shaft(sp,pos,next+1);
                runAs(sp,"title @s actionbar {\"text\":\"Sift pitch "+(next+1)+" / 8\",\"color\":\"aqua\"}");
            }
            return InteractionResult.SUCCESS;
        });
        AttackBlockCallback.EVENT.register((player,world,hand,pos,direction) -> {
            if (player.isSpectator()) return InteractionResult.PASS;
            if (gauntlet(player.getItemInHand(hand))) {
                if (player instanceof ServerPlayer sp) runAs(sp,"function entersift:rift/punch");
                return InteractionResult.SUCCESS;
            }
            if (!note(world,pos)) return InteractionResult.PASS;
            if (world instanceof ServerLevel level && player instanceof ServerPlayer sp) strike(level,pos,sp);
            return InteractionResult.SUCCESS;
        });
        AttackEntityCallback.EVENT.register((player,level,hand,entity,hit) -> {
            if (!player.isSpectator() && gauntlet(player.getItemInHand(hand))) {
                if(player instanceof ServerPlayer sp)runAs(sp,"function entersift:rift/punch");
                return InteractionResult.SUCCESS;
            }
            return InteractionResult.PASS;
        });
        UseItemCallback.EVENT.register((player,level,hand) -> {
            if (!player.isSpectator() && gauntlet(player.getItemInHand(hand))) {
                if(player instanceof ServerPlayer sp)runAs(sp,"function entersift:rift/punch");
                return InteractionResult.SUCCESS;
            }
            return InteractionResult.PASS;
        });
        LOGGER.info("Enter the Sift: eight notes, one threshold.");
    }
}
