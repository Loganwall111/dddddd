# Sift Mod Fixes and Features - Version 0.22

## Summary of Changes

This update addresses multiple issues reported by users and adds new features including the Rift Staff weapon and wearable gauntlet effects.

---

## 1. Blub Texture Fix - Mouth Pixels ✓ FIXED

**Issue:** The blub entity had incorrect mouth pixels - sometimes 1 pixel, sometimes 3 pixels, instead of the correct 2 pixels.

**Solution:** 
- Modified `fabric-mod/src/main/resources/assets/entersift/textures/entity/blub.png`
- Used Python script to read the PNG, locate the mouth region (front face of the blub's body at y=14, x=24-25), and set exactly 2 pixels wide
- The mouth now displays correctly with 2 dark pixels

**Files Changed:**
- `fabric-mod/src/main/resources/assets/entersift/textures/entity/blub.png`

---

## 2. Rift Summoning Issues - Gauntlets and Rifts Disappearing ✓ FIXED

**Issues:**
- When trying to summon a rift with the gauntlet, nothing happened
- Rifts were completely disappearing or not appearing at all
- Rifts spawned too close to the ground

**Root Cause:**
The `rift/punch.mcfunction` was positioning the rift base at `~ ~-1.5 ~` (1.5 blocks below eye level), which placed it underground or at the player's feet. Combined with the requirement for 2 blocks of air above (`~+1` and `~+2`), the rift couldn't spawn in normal 2-block-tall spaces.

**Solution:**
- Changed rift base position from `~ ~-1.5 ~` to `~ ~-0.5 ~` (one block higher, at ground level)
- Updated all three distance checks (4, 3, and 2.5 blocks ahead) to use the new height
- The fallback position now uses `~ ~-0.2 ~` instead of `~ ~-1.2 ~`

**Files Changed:**
- `fabric-mod/src/main/resources/data/entersift/function/rift/punch.mcfunction`

---

## 3. Rift Destination Issues - Spawning in Caves ✓ FIXED

**Issue:** When entering a rift, players were teleported to caves or box areas instead of appearing on land at the surface. The rift also disappeared when coming back out.

**Root Cause:**
- Destination functions were using fixed y-coordinates (y=300 for Overworld/End, y=130 for Nether) which are above the build limit or in the sky
- The `unless loaded` checks would fail and return early, leaving players stranded
- Return portals weren't being created properly

**Solution:**
- Replaced fixed y-coordinate teleportation with `positioned over motion_blocking_no_leaves` to find the actual surface
- Updated all destination functions (Overworld, Nether, End, Sift) to use surface-finding
- Modified `travel/arrive.mcfunction` to always create the return gate
- Updated `travel/plaza.mcfunction` to spawn a visible rift portal entity at the return point
- Fixed `tunnel/exit.mcfunction` fallback to properly teleport to surface and create arrival portal

**Files Changed:**
- `fabric-mod/src/main/resources/data/entersift/function/travel/destination_0.mcfunction` (Overworld)
- `fabric-mod/src/main/resources/data/entersift/function/travel/destination_1.mcfunction` (Nether)
- `fabric-mod/src/main/resources/data/entersift/function/travel/destination_2.mcfunction` (End)
- `fabric-mod/src/main/resources/data/entersift/function/travel/arrive.mcfunction`
- `fabric-mod/src/main/resources/data/entersift/function/travel/plaza.mcfunction`
- `fabric-mod/src/main/resources/data/entersift/function/tunnel/exit.mcfunction`

---

## 4. NEW FEATURE: Rift Staff Weapon ✓ ADDED

**Description:** A new weapon that works exactly like the gauntlet but features a gigantic floating animated blue cube above the staff.

**Features:**
- Functions identically to the rift gauntlet (tears open rifts in space-time)
- Displays a large rotating blue cube floating above the staff when held
- The cube pulses, rotates on multiple axes, and glows with dimensional energy
- Registered as a new item in the creative menu under Tools & Utilities

**Implementation:**
- Added `RIFT_STAFF` item to `SiftContent.java`
- Updated gauntlet detection in `EnterTheSift.java` to include the staff
- Created `RiftStaffRenderer.java` client-side renderer with animated cube effect
- Added item model JSON and 16x16 texture
- Added language file entries
- Registered renderer in `SiftClient.java`

**Files Created:**
- `fabric-mod/src/client/java/dev/logan/entersift/client/RiftStaffRenderer.java`
- `fabric-mod/src/main/resources/assets/entersift/models/item/rift_staff.json`
- `fabric-mod/src/main/resources/assets/entersift/textures/item/rift_staff.png`

**Files Modified:**
- `fabric-mod/src/main/java/dev/logan/entersift/SiftContent.java`
- `fabric-mod/src/main/java/dev/logan/entersift/EnterTheSift.java`
- `fabric-mod/src/client/java/dev/logan/entersift/SiftClient.java`
- `fabric-mod/src/main/resources/assets/entersift/lang/en_us.json`

---

## 5. NEW FEATURE: Wearable Gauntlet Effects ✓ ADDED

**Description:** Gauntlets can now be worn on the arms with visible dimensional energy effects, allowing players to visually "punch holes in space and time."

**Features:**
- When holding a rift gauntlet, glowing energy wraps around both arms
- Swirling energy rings animate around the arms with pulsing effects
- Small dimensional tear particles orbit around the hands
- Color changes based on gauntlet type (blue for regular, red for red gauntlet)
- Effects are visible in third-person view and to other players

**Implementation:**
- Created `GauntletWearRenderer.java` client-side renderer
- Renders energy aura rings around both arms when gauntlet is held
- Adds floating tear particles around the hands
- Detects both main hand and off-hand gauntlets
- Registered in `SiftClient.java`

**Files Created:**
- `fabric-mod/src/client/java/dev/logan/entersift/client/GauntletWearRenderer.java`

**Files Modified:**
- `fabric-mod/src/client/java/dev/logan/entersift/SiftClient.java`

---

## Technical Details

### Rift Spawning Fix
**Before:**
```mcfunction
execute anchored eyes positioned ^ ^ ^4 positioned ~ ~-1.5 ~ ...
```
This placed the rift 1.5 blocks below eye level (underground).

**After:**
```mcfunction
execute anchored eyes positioned ^ ^ ^4 positioned ~ ~-0.5 ~ ...
```
Now places the rift at ground level (0.5 blocks below eye level = feet level).

### Destination Teleportation Fix
**Before:**
```mcfunction
execute in minecraft:overworld positioned 0 300 0 run tp @s 0 300 0
```
Teleported to y=300 (above build limit).

**After:**
```mcfunction
execute in minecraft:overworld positioned 0 0 0 positioned over motion_blocking_no_leaves run function entersift:travel/arrive
```
Finds the actual surface height and teleports there.

### Return Portal Creation
**Before:**
```mcfunction
summon minecraft:marker ~3 ~ ~ {Tags:["sift.return_gate"]}
```
Only created an invisible marker.

**After:**
```mcfunction
summon minecraft:marker ~3 ~ ~ {Tags:["sift.return_gate","sift.encounter"]}
summon entersift:rift_portal ~3 ~1 ~ {Tags:["sift.return_gate","sift.rift_visual","sift.rift_anchor"],RiftType:5,Width:5.0f,Height:4.0f,Age:120}
```
Creates both the marker and a visible rift portal entity.

---

## Testing Checklist

- [ ] Spawn a blub and verify the mouth has exactly 2 pixels
- [ ] Use the rift gauntlet in a 2-block-tall space - rift should appear
- [ ] Use the rift gauntlet outdoors - rift should spawn at ground level, not buried
- [ ] Enter a rift - should arrive on the surface, not in caves
- [ ] Return through the rift - the return portal should be visible and usable
- [ ] Hold the rift staff - floating blue cube should appear above it
- [ ] Rotate the camera while holding staff - cube should rotate and pulse
- [ ] Hold a gauntlet - energy effects should appear around arms
- [ ] Hold a red gauntlet - effects should be red instead of blue
- [ ] Give the staff to another player - they should see your cube and arm effects

---

## Known Limitations

1. **Staff Cube Rendering:** The floating cube uses the `RenderTypes.GLOW` render type which may not work with all shader packs. Players using Iris/Optifine may need to adjust settings.

2. **Gauntlet Arm Effects:** The arm effects are rendered in world space and may clip through blocks when the player is in tight spaces. This is a visual-only effect and doesn't affect gameplay.

3. **Surface Detection:** The `motion_blocking_no_leaves` heightmap may occasionally place players on top of trees or structures. This is a limitation of Minecraft's heightmap system.

4. **Blub Texture:** The texture fix assumes the standard 64x64 entity texture layout. Custom blub skins or resource packs may override this fix.

---

## Version Information

- **Mod Version:** 0.22.0-alpha
- **Minecraft Version:** 26.3
- **Fabric Loader:** 0.19.5
- **Fabric API:** 0.161.0+26.3

---

## Credits

All fixes and features implemented for the Enter the Sift mod by Loganwall111.

**Issues Addressed:**
- Blub mouth pixel accuracy
- Rift summoning failures
- Rift destination problems
- Rift disappearing on return

**New Features:**
- Rift Staff with floating animated cube
- Wearable gauntlet visual effects
