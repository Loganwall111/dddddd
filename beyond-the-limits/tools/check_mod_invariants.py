#!/usr/bin/env python3
"""Static checks for gameplay invariants that are easy to violate while wiring features.

The compiler cannot tell that a Fabric initializer forgot to register a command tree, that
S2C payload codecs were never registered, or that there are four entrances to a dimension
whose design explicitly allows three. This catches those integration mistakes without a
Minecraft runtime.
"""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
JAVA = ROOT / "src/main/java/com/beyondthelimits"


def read(relative):
    return (ROOT / relative).read_text()


def fail(message):
    print(f"invariant failed: {message}")
    return 1


def main():
    main_initializer = read("src/main/java/com/beyondthelimits/BeyondTheLimits.java")
    events = read("src/main/java/com/beyondthelimits/world/BtlWorldEvents.java")
    commands = read("src/main/java/com/beyondthelimits/command/BtlCommands.java")
    teleport_mixin = read("src/main/java/com/beyondthelimits/mixin/TeleportCommandMixin.java")
    backrooms = read("src/main/java/com/beyondthelimits/core/engine/BackroomsEngine.java")
    dementia = read("src/main/java/com/beyondthelimits/core/engine/DementiaEngine.java")
    city = read("src/main/java/com/beyondthelimits/world/CityGenerator.java")
    rifts = read("src/main/java/com/beyondthelimits/core/engine/RiftEngine.java")
    moving_chunk = read("src/main/java/com/beyondthelimits/core/engine/MovingChunkEngine.java")

    # Main initialization must install payload codecs and the root commands, and delegate all
    # lifecycle/tick subscriptions to exactly one event-wiring class.
    for call in ("BtlNetworking.registerPayloadTypes();", "BtlCommands.register();", "BtlWorldEvents.register();"):
        if main_initializer.count(call) != 1:
            return fail(f"BeyondTheLimits must call {call} exactly once")
    if "ServerLifecycleEvents" in main_initializer or "ServerTickEvents" in main_initializer:
        return fail("server lifecycle/tick listeners are duplicated in the mod initializer")
    if events.count("ServerTickEvents.END_SERVER_TICK.register") != 1:
        return fail("BtlWorldEvents must own exactly one server-tick listener")

    # The three player entry paths: City rift, dementia-corrupted fall, and vanilla teleport branch.
    if city.count("BackroomsEngine.registerGate(") != 1:
        return fail("the City must register exactly one Backrooms gate")
    if dementia.count("BackroomsEngine.enterViaCorruptedGrass(") != 1:
        return fail("corrupted-ground dementia must be the only automatic entry call")
    if commands.count("BackroomsEngine.enterViaTeleportCommand(") != 1:
        return fail("the command entry must call the command-specific Backrooms route")
    if len(re.findall(r'CommandManager\.literal\("backrooms"\)', teleport_mixin)) != 1:
        return fail("/teleport backrooms must be the sole Backrooms command branch")
    if 'literal("backrooms")' in commands or 'case "backrooms"' in commands:
        return fail("BtlCommands exposes an additional direct Backrooms entry")
    if "enterViaNoclipDevice" in backrooms or (JAVA / "item/NoclipDeviceItem.java").exists():
        return fail("the unrequested Noclip Device adds a fourth Backrooms entrance")

    # The city gate is the only rift variant that goes into the Backrooms. Random rifts and the
    # moving-chunk scare must never silently create an additional seamless route.
    roll = rifts.split("public static int rollVariant", 1)[1].split("public static void tick", 1)[0]
    if "VARIANT_BACKROOMS" in roll or "VARIANT_BACKROOMS" in moving_chunk:
        return fail("random anomaly rifts must not lead into the Backrooms")
    if "VARIANT_BACKROOMS" in commands:
        return fail("a mod command exposes the Backrooms as a free-form dimension destination")

    print("runtime invariants: bootstrap wired once; exactly 3 Backrooms entry routes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
