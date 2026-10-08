#!/usr/bin/env python3
"""Writes the mod's language file.

The prose lives here rather than in the Java so that the writing can be edited without touching
behaviour, and so the whole voice of the mod can be read in one place. The register is deliberate:
a surveyor's field journal, not a tutorial. Nothing is explained that the player has not earned,
and several entries admit that the previous survey did not come back.
"""
import json
import os

LANG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..",
                    "src", "main", "resources", "assets", "beyondthelimits", "lang",
                    "en_us.json")

BLOCKS = {
    "corrupted_grass": "Corrupted Grass",
    "corrupted_soil": "Corrupted Soil",
    "corrupted_stone": "Corrupted Stone",
    "bleeding_vein": "Bleeding Vein",
    "bleed_pool": "Bleed Pool",
    "rift_anchor": "Rift Anchor",
    "rift_frame": "Rift Frame",
    "void_glass": "Void Glass",
    "sky_shard": "Sky Shard",
    "gravity_core": "Gravity Core",
    "memory_stone": "Memory Stone",
    "memory_lamp": "Memory Lamp",
    "mirror_block": "Mirror Block",
    "code_monolith": "Code Monolith",
    "code_brick": "Code Brick",
    "code_panel": "Code Panel",
    "backrooms_carpet": "Damp Carpet",
    "backrooms_wall": "Yellowed Wallpaper",
    "backrooms_ceiling": "Drop Ceiling",
    "backrooms_light": "Fluorescent Panel",
    "pool_tile": "Pool Tile",
    "pool_tile_dark": "Deep Pool Tile",
    "store_shelf": "Store Shelving",
    "warehouse_concrete": "Warehouse Concrete",
    "warehouse_floor": "Warehouse Floor",
    "wrong_grass": "Grass",
    "impossible_grass": "Black Grass",
    "impossible_leaves": "White Leaves",
    "impossible_log": "Pale Log",
    "ancient_brick": "Ancient Brick",
    "ancient_pillar": "Ancient Pillar",
    "ancient_statue": "Worn Statue",
    "signal_casing": "Signal Casing",
    "signal_machine": "Signal Machine",
    "fog_moss": "Fog Moss",
    "fog_stone": "Fog Stone",
}

ITEMS = {
    "guidebook": "The Surveyor's Guide",
    "reality_scanner": "Reality Scanner",
    "dimensional_gauge": "Dimensional Gauge",
    "noclip_device": "Noclip Device",
    "memory_shard": "Memory Shard",
    "signal_receiver": "Signal Receiver",
    "rift_stabilizer": "Rift Stabilizer",
    "void_lens": "Void Lens",
    "storm_beacon": "Storm Beacon",
    "ancient_tablet": "Ancient Tablet",
    "reality_warhead": "Reality Warhead",
    "reality_fragment": "Reality Fragment",
    "black_sun_fragment": "Black Sun Fragment",
    "code_key": "Code Key",
}

ENTITIES = {
    "rift": "Rift",
    "observer": "The Observer",
    "black_sun": "The Black Sun",
    "warhead": "Reality Warhead",
    "smiler": "Smiler",
    "hound": "Hound",
    "skin_stealer": "Skin Stealer",
    "partygoer": "Partygoer",
    "faceling": "Faceling",
    "fog_shade": "Fog Shade",
    "fog_walker": "Fog Walker",
    "code_wraith": "Code Wraith",
    "giant_insect": "Giant Insect",
    "evolved_zombie": "Evolved Zombie",
    "hunter_skeleton": "Hunter Skeleton",
    "ambush_spider": "Ambush Spider",
    "hiding_creeper": "Hiding Creeper",
    "mirror_double": "Mirror Double",
    "memory_echo": "Memory Echo",
}

SOUNDS = {
    "rift_open": "A tear opens",
    "rift_ambient": "A rift hums",
    "reality_tear": "Reality tears",
    "storm_start": "A dimensional storm begins",
    "storm_thunder": "The storm answers",
    "backrooms_hum": "Fluorescent humming",
    "backrooms_drone": "Something enormous moves",
    "backrooms_step": "Footsteps that are not yours",
    "backrooms_chase": "It has noticed you",
    "observer_whisper": "Something whispers",
    "corruption_whisper": "The ground whispers",
    "signal_loop": "A signal repeats",
    "signal_static": "Static",
    "black_sun_arrival": "The light is being taken",
    "codescape_glitch": "The world reads itself",
    "memory_chime": "A memory settles",
    "guide_open": "The journal opens",
    "mirror_whisper": "Your reflection speaks",
    "mirror_crack": "A mirror cracks",
    "signal_found": "A transmission resolves",
    "noclip_whoosh": "You fall out of the world",
    "evolution_growl": "Something has learned",
    "explosion_fallout": "Fallout",
}

BOOK_PAGES = [
    ("welcome", "If you are reading this, the world has already started to come apart, and you were handed a book about it."),
    ("the_bleeding", "It began as a hairline. A place where the air did not agree with itself. The survey that preceded yours recorded three such places in the first month, and eleven in the second, and then stopped recording them, because there was no longer a useful distinction between a tear and the sky."),
    ("reality", "The number in the margin is not a score. It is the proportion of this world that still follows the rules it was built on. It falls for reasons, and it falls faster when you are not watching."),
    ("rifts", "A rift is not a door and it is not a block. It is a place where two worlds are close enough to touch, and it will drag light, sound and matter through in that order."),
    ("the_city", "There is a city. It is not in the world's history and it is not in its future; it is simply standing there, built by something that surveyed before you did. The guide contains its coordinates once you have seen enough to be trusted with them."),
    ("the_warehouse", "At the centre of the city: a warehouse. Inside it, a rift that does not lead somewhere else so much as it leads somewhere under. Do not go through it without a reason. Go through it once, at least."),
    ("the_backrooms", "Yellow wallpaper. Damp carpet. A ceiling of fluorescent panels that hum a note you will hear for the rest of your life. The rooms go on and the rooms change and there is no exit, only further in."),
    ("other_worlds", "The fog is a dimension. The code is a dimension. Your reflection has a dimension, and it has been there long enough to have built things. Everything the world is losing, it is losing to somewhere."),
    ("rules", "You may stabilise a rift with the right instrument. You may not close the sky. You may leave a world and come back to a different one, and the difference is your fault, and the ledger does not care which of those two facts you find harder."),
]

MESSAGES = {
    "intro.one": "Something in the world has been revised. You may not notice for a while.",
    "intro.two": "You have been given a journal. It belonged to a surveyor who is no longer surveying.",
    "guide.given": "The Surveyor's Guide is yours now. Press G to read it.",
    "guide.again": "The journal opens where you left it.",
    "rift.opened": "A rift has opened nearby. Reality is holding at %s%%.",
    "rift.touched": "You touched it, and it touched back.",
    "observer.three": "You are being observed.",
    "observer.seven": "Whatever is watching you has been doing so for a week.",
    "observer.base": "It is standing in your base. It has been for some time.",
    "mutation": "The world has changed shape: %s.",
    "returned": "You came back. %s did not come back with you, entirely.",
    "collision.deeper": "Another world is %s%% of the way through this one.",
    "skycrack": "The sky has cracked.",
    "blacksun.begin": "The sun is being replaced.",
    "blacksun.arrival": "It arrived. It has been arriving for days.",
    "blacksun.close": "It is closer than it was. It is always closer than it was.",
    "blacksun.taken": "The light is gone. Something else is in the sky now.",
    "storm.begin": "A dimensional storm is forming. Find cover, or find something to hold onto.",
    "storm.end": "The storm has passed. The ground is not where it left it.",
    "storm.stamp": "The storm wrote something permanent into the terrain.",
    "backrooms.welcome": "You are not where you were. The carpet is damp and there are no windows.",
    "backrooms.fall": "You fell through the floor and kept falling.",
    "backrooms.noclip": "You stepped outside the world. The world noticed.",
    "backrooms.hum": "The lights are humming a note you will not forget.",
    "backrooms.escaped": "You found a way out. Statistically, you should not have.",
    "codescape.welcome": "The terrain here is not terrain. You are standing on the source of the world.",
    "mirror.entered": "You stepped through, and your reflection stepped out.",
    "mirror.reflection": "Something is copying the things you build.",
    "mirror.swapped": "You have been replaced. The replacement is doing better than you were.",
    "signal.reading": "[UNKNOWN TRANSMISSION] strength %s.",
    "signal.revealed": "The transmission resolves into coordinates.",
    "signal.coordinates": "They are pointing at you.",
    "signal.realisation": "The signal has been coming from your own position for some time.",
    "city.built": "You have found the city. It is at %s.",
    "lostciv.built": "The civilization that was not there has rebuilt itself to stage %s.",
    "movingchunk.trail": "A piece of the world moved past you, heading for %s.",
    "movingchunk.unknown": "Something is running, and it is carrying its own ground.",
    "evolution.learned": "The mobs have learned something about you.",
    "impossible.found": "This biome should not exist. It has decided that it does.",
    "impossible.noticed": "The biome is reacting to how you behave in it.",
    "skinstealer": "Something is wearing %s's face.",
    "gravity.debt": "Dimensional gravity: %s of %s. The world is keeping score.",
    "gravity.left": "You have left the Overworld for %s. It will remember.",
    "gravity.returned": "You have been away too long. %s things happened while you were in %s, and all of them are your fault.",
    "lastchunk.found": "You found it. The chunk is a perfect reconstruction of everywhere you have ever been, and it is still being built.",
}

COMMANDS = {
    "reality": "Reality is at %s%%.",
    "rift": "Opened a rift at %s.",
    "city": "The city is centred at %s.",
    "backrooms": "The gate is open. Do not lose the way back.",
    "storm": "A storm of intensity %s is running for %s ticks.",
    "blacksun": "Advanced the black sun to %s.",
    "signal": "Signal readings taken at %s.",
    "evolve": "Family %s advanced to stage %s.",
    "dimension": "You are in %s.",
    "guide": "The journal has been returned to you.",
    "failed": "That did not work. Reality refused.",
    "unknown_dimension": "No dimension is registered under %s.",
}

DEMENTIA = {
    "hearing": "You are hearing things that are not there. Some of them are.",
    "leaving": "You are leaving part of yourself in this dimension.",
    "stable": "You are stable. For now.",
    "falling": "You are falling through something that used to be ground.",
}

ITEM_LORE = {
    "memory_shard.empty": "The shard is empty. Fill it with something worth remembering.",
    "memory_shard.stored": "The shard contains a memory of %s blocks.",
    "reality_scanner.readout": "Reality %s%%, rifts %s, sky integrity %s.",
    "reality_warhead.armed": "Armed. This will not make things better.",
    "rift_stabilizer.closed": "You closed %s rifts.",
    "rift_stabilizer.none": "There is nothing here to close.",
    "signal_receiver.silent": "Silence. The transmission is not on this frequency yet.",
    "storm_beacon.started": "The beacon has called something down.",
    "storm_beacon.active": "A storm is already running. Adding to it is not wisdom.",
    "void_lens.revealed": "The lens shows you %s things you were not meant to see.",
}

LORE = {
    "guide.header": "— THE SURVEYOR'S GUIDE —",
    "guide.city": "There is a city at ",
    "guide.warehouse": "At its centre is a warehouse. Inside the warehouse is a rift that is not a rift.",
    "guide.warning": "Do not go through it twice in one day.",
    "guide.reality": "Current reality: %s%%.",
    "guide.blacksun": "The sun is being replaced. Do not look at it directly, and do not look away.",
    "guide.signal": "A transmission has been repeating since before you arrived.",
    "objectives.header": "— STANDING OBJECTIVES —",
    "objectives.reality": "Reality: %s%%.",
    "objectives.collision": "World collision: %s%%.",
    "objectives.skycrack": "Sky cracks: %s.",
    "objectives.rifts": "Open rifts: %s.",
    "objectives.blacksun": "Black sun stage: %s.",
    "objectives.civilization": "The civilization that was not there: stage %s.",
    "tablet.reward": "The tablet accepts what you have learned. Something is given back.",
    "statue.0": "The statue's face has been worn away by a weather that never happened here.",
    "statue.1": "The inscription is in a script that is almost readable, in the way a familiar word is almost the right word.",
    "statue.2": "It is holding a tool. You have the same tool in your inventory. It is carved holding it the same way you hold it.",
    "statue.3": "Someone has already surveyed this. The survey is the statue.",
    "statue.4": "There is a name on the plinth. It is not yours. It is not anyone's, yet.",
    "statue.5": "You have seen this statue before, at a different site, in a different shape, in the same pose.",
}

DIMENSIONS = {
    "the_foglands": "The Foglands",
    "codescape": "The Code Verse",
    "backrooms": "The Backrooms",
    "substrata": "The Substrata",
    "mirrorworld": "The Mirror World",
    "wrongworld": "The Wrong Minecraft",
    "the_impossible": "The Impossible",
}

RIFT_VARIANTS = {
    0: "a shard of another overworld",
    1: "somewhere with carpet",
    2: "somewhere white",
    3: "somewhere made of text",
    4: "somewhere that is your world, reversed",
    5: "two worlds at once",
}

HUD = {
    "normal": "reality intact",
    "reality": "REALITY",
    "dementia": "DEMENTIA",
    "gravity": "DIM. GRAVITY",
    "debt": "debt %s",
    "collision": "COLLISION",
    "rifts": "RIFTS",
    "rift_count": "%s open",
    "rift_near": "%s blocks — %s",
    "rift_far": "distant",
    "rift_nearby": "a rift has opened nearby",
    "sky": "SKY",
    "band_shift": "reality has shifted: %s",
    "band.0": "whole",
    "band.1": "flickering",
    "band.2": "distorted",
    "band.3": "failing",
    "band.4": "impossible",
    "sky.none": "intact",
    "sky.crack": "cracking",
    "sky.storm": "storming",
    "sky.blacksun": "eclipsed",
    "sky.collision": "merging",
    "sky.impossible": "wrong",
}


def main():
    lang = {}

    for name, text in BLOCKS.items():
        lang[f"block.beyondthelimits.{name}"] = text
    for name, text in ITEMS.items():
        lang[f"item.beyondthelimits.{name}"] = text
    for name, text in ENTITIES.items():
        lang[f"entity.beyondthelimits.{name}"] = text
    for name, text in SOUNDS.items():
        lang[f"subtitles.beyondthelimits.{name}"] = text

    lang["effect.beyondthelimits.dementia"] = "Dementia"
    lang["effect.beyondthelimits.dimensional_gravity"] = "Dimensional Gravity"
    lang["effect.beyondthelimits.glitch"] = "Glitch"
    lang["itemGroup.beyondthelimits.beyond_the_limits"] = "Beyond the Limits"

    lang["category.beyondthelimits"] = "Beyond the Limits"
    lang["key.beyondthelimits.guide"] = "Open the Surveyor's Guide"
    lang["key.beyondthelimits.scan"] = "Reality Scanner sweep"
    lang["key.beyondthelimits.toggle_hud"] = "Toggle the reality readout"
    lang["screen.beyondthelimits.codescape"] = "THE CODE VERSE"

    lang["book.beyondthelimits.title"] = "The Surveyor's Guide"
    lang["book.beyondthelimits.close"] = "Close"
    lang["book.beyondthelimits.page"] = "page %s of %s"
    lang["book.beyondthelimits.margin"] = "reality %s%%"
    for name, text in BOOK_PAGES:
        lang[f"book.beyondthelimits.{name}.title"] = name.replace("_", " ").upper()
        lang[f"book.beyondthelimits.{name}.body"] = text

    for name, text in HUD.items():
        lang[f"hud.beyondthelimits.{name}"] = text
    for name, text in DIMENSIONS.items():
        lang[f"dimension.beyondthelimits.{name}"] = text
    for index, text in RIFT_VARIANTS.items():
        lang[f"rift.beyondthelimits.variant.{index}"] = text

    for name, text in MESSAGES.items():
        lang[f"message.beyondthelimits.{name}"] = text
    for name, text in COMMANDS.items():
        lang[f"command.beyondthelimits.{name}"] = text
    for name, text in DEMENTIA.items():
        lang[f"dementia.beyondthelimits.{name}"] = text
    for name, text in ITEM_LORE.items():
        lang[f"item.beyondthelimits.{name}"] = text
    for name, text in LORE.items():
        lang[f"lore.beyondthelimits.{name}"] = text
    for stage in range(6):
        lang[f"lore.beyondthelimits.tablet.{stage}"] = TABLET_TEXT[stage]

    os.makedirs(os.path.dirname(LANG), exist_ok=True)
    with open(LANG, "w") as handle:
        json.dump(lang, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    print(f"lang: {len(lang)} keys")


TABLET_TEXT = [
    "The tablet is warm. The first line is a date, and the date is next week.",
    "The second line describes a structure you have not built yet, in the past tense.",
    "The third line names the person who will read it. You are getting closer to being that person.",
    "The fourth line is a map, and the map is of a place that is being built while you read.",
    "The fifth line is an apology.",
    "The sixth line is blank, and the blank is addressed to you.",
]


if __name__ == "__main__":
    main()
