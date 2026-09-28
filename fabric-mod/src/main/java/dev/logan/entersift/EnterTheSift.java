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
    private final Map<String, RitualSequence> rituals = new HashMap<>();
    private final Map<String, Long> openingUntil = new HashMap<>();
    private long ticks;
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
    private static boolean gauntlet(ItemStack stack) { return stack.is(SiftContent.GAUNTLET) || stack.is(SiftContent.RED_GAUNTLET); }
    private static boolean note(Level world, BlockPos pos) {
        return world.getBlockState(pos).is(Blocks.NOTE_BLOCK) && world.getBlockState(pos.below()).is(SiftContent.SONOROUS_DEEPSLATE);
    }
    private static void glow(ServerPlayer player, BlockPos pos, int pitch) {
        runAs(player,"execute positioned "+pos.getX()+" "+pos.getY()+" "+pos.getZ()+" run function entersift:notes/"+RitualSequence.COLORS[pitch-1]);
    }
    private static void ensureEncounter(ServerLevel level, AncientFrame f) {
        if (!hasTag(level,f,"sift.encounter")) runAt(level,f,"function entersift:guardian/begin");
    }
    @Override public void onInitialize() {
        SiftContent.initialize();
        SiftEntities.initialize();
        SiftSmokeTest.register();
        ServerLifecycleEvents.SERVER_STOPPED.register(server -> { rituals.clear(); openingUntil.clear(); ticks=0; });
        ServerTickEvents.END_SERVER_TICK.register(server -> {
            ticks++;
            if (ticks%100==0) {
                rituals.values().removeIf(s -> s.expired(ticks));
                openingUntil.values().removeIf(t -> ticks>t);
                // Approach-based guardian trigger. No chunk generation; scans only already-loaded blocks.
                for (ServerPlayer p : server.getPlayerList().getPlayers()) {
                    if (p.isSpectator() || p.getY()>=0 || !(p.level() instanceof ServerLevel level) || !level.dimension().equals(Level.OVERWORLD)) continue;
                    AncientFrame f=AncientFrame.find(level,p.blockPosition());
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
            if (!(world instanceof ServerLevel level) || !(player instanceof ServerPlayer sp)) return InteractionResult.SUCCESS;
            int pitch=world.getBlockState(pos).getValue(NoteBlock.NOTE)%8+1;
            glow(sp,pos,pitch);
            runAs(sp,"playsound minecraft:block.note_block.chime block @a[distance=..24] ~ ~ ~ 1 "+Math.pow(2,(pitch-5)/12.0));
            if (!level.dimension().equals(Level.OVERWORLD)) return InteractionResult.SUCCESS;
            AncientFrame f=AncientFrame.find(level,pos);
            if (f==null) return InteractionResult.SUCCESS;
            ensureEncounter(level,f);
            if (!hasTag(level,f,"sift.ready")) {
                runAs(sp,"title @s actionbar {\"text\":\"The Twisted Warden guards this song. Defeat it first.\",\"color\":\"red\"}");
                return InteractionResult.SUCCESS;
            }
            if (openingUntil.containsKey(f.key()) || hasTag(level,f,"sift.portal")) return InteractionResult.SUCCESS;
            RitualSequence sequence=rituals.computeIfAbsent(f.key(),key -> new RitualSequence());
            var result=sequence.play(pitch,pos.getX()+","+pos.getY()+","+pos.getZ(),ticks);
            if (result==RitualSequence.Result.COMPLETE) {
                for(int i=0;i<8;i++) {
                    String[] xyz=sequence.completedNotes().get(i).split(",");
                    BlockPos n=new BlockPos(Integer.parseInt(xyz[0]),Integer.parseInt(xyz[1]),Integer.parseInt(xyz[2]));
                    if(!note(level,n) || level.getBlockState(n).getValue(NoteBlock.NOTE)%8+1!=RitualSequence.ORDER[i]) {
                        rituals.remove(f.key());
                        runAs(sp,"title @s actionbar {\"text\":\"Keep all eight pitches intact until the song is complete.\",\"color\":\"red\"}");
                        return InteractionResult.SUCCESS;
                    }
                }
                runAt(level,f,"function entersift:ritual/begin");
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
                String message=result==RitualSequence.Result.RESET?"Song reset. Play 1, 3, 7, 6, 5, 2, 4, 8.":"The city listens: "+sequence.progress()+" / 8";
                runAs(sp,"title @s actionbar {\"text\":\""+message+"\",\"color\":\"aqua\"}");
            }
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
