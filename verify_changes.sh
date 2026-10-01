#!/bin/bash
echo "=== Verifying Sift Mod v0.22 Changes ==="
echo ""

# 1. Check blub texture was modified
echo "1. Checking blub texture fix..."
if [ -f "fabric-mod/src/main/resources/assets/entersift/textures/entity/blub.png" ]; then
    echo "   ✓ Blub texture exists"
else
    echo "   ✗ Blub texture missing!"
fi

# 2. Check rift punch height fix
echo "2. Checking rift spawn height fix..."
if grep -q "~ ~-0.5 ~" fabric-mod/src/main/resources/data/entersift/function/rift/punch.mcfunction; then
    echo "   ✓ Rift spawn height fixed to ~-0.5"
else
    echo "   ✗ Rift spawn height not fixed!"
fi

# 3. Check destination functions
echo "3. Checking destination teleportation fixes..."
if grep -q "motion_blocking_no_leaves" fabric-mod/src/main/resources/data/entersift/function/travel/destination_0.mcfunction; then
    echo "   ✓ Overworld destination uses surface detection"
else
    echo "   ✗ Overworld destination not fixed!"
fi

if grep -q "motion_blocking_no_leaves" fabric-mod/src/main/resources/data/entersift/function/travel/destination_2.mcfunction; then
    echo "   ✓ End destination uses surface detection"
else
    echo "   ✗ End destination not fixed!"
fi

# 4. Check return portal creation
echo "4. Checking return portal creation..."
if grep -q "sift.return_gate" fabric-mod/src/main/resources/data/entersift/function/travel/plaza.mcfunction; then
    echo "   ✓ Return portal creation implemented"
else
    echo "   ✗ Return portal not created!"
fi

# 5. Check rift close fix
echo "5. Checking rift close fix..."
if grep -q "tag=!sift.return_gate" fabric-mod/src/main/resources/data/entersift/function/rift/close.mcfunction; then
    echo "   ✓ Rift close won't kill return portals"
else
    echo "   ✗ Rift close fix missing!"
fi

# 6. Check Rift Staff item
echo "6. Checking Rift Staff implementation..."
if grep -q "RIFT_STAFF" fabric-mod/src/main/java/dev/logan/entersift/SiftContent.java; then
    echo "   ✓ Rift Staff item registered"
else
    echo "   ✗ Rift Staff not registered!"
fi

if [ -f "fabric-mod/src/main/resources/assets/entersift/models/item/rift_staff.json" ]; then
    echo "   ✓ Rift Staff model exists"
else
    echo "   ✗ Rift Staff model missing!"
fi

if [ -f "fabric-mod/src/main/resources/assets/entersift/textures/item/rift_staff.png" ]; then
    echo "   ✓ Rift Staff texture exists"
else
    echo "   ✗ Rift Staff texture missing!"
fi

# 7. Check Rift Staff renderer
echo "7. Checking Rift Staff renderer..."
if [ -f "fabric-mod/src/client/java/dev/logan/entersift/client/RiftStaffRenderer.java" ]; then
    echo "   ✓ Rift Staff renderer exists"
else
    echo "   ✗ Rift Staff renderer missing!"
fi

if grep -q "RiftStaffRenderer.register" fabric-mod/src/client/java/dev/logan/entersift/SiftClient.java; then
    echo "   ✓ Rift Staff renderer registered"
else
    echo "   ✗ Rift Staff renderer not registered!"
fi

# 8. Check Gauntlet wear renderer
echo "8. Checking Gauntlet wear renderer..."
if [ -f "fabric-mod/src/client/java/dev/logan/entersift/client/GauntletWearRenderer.java" ]; then
    echo "   ✓ Gauntlet wear renderer exists"
else
    echo "   ✗ Gauntlet wear renderer missing!"
fi

if grep -q "GauntletWearRenderer.register" fabric-mod/src/client/java/dev/logan/entersift/SiftClient.java; then
    echo "   ✓ Gauntlet wear renderer registered"
else
    echo "   ✗ Gauntlet wear renderer not registered!"
fi

# 9. Check gauntlet detection includes staff
echo "9. Checking gauntlet detection includes staff..."
if grep -q "RIFT_STAFF" fabric-mod/src/main/java/dev/logan/entersift/EnterTheSift.java; then
    echo "   ✓ Staff included in gauntlet detection"
else
    echo "   ✗ Staff not in gauntlet detection!"
fi

# 10. Check language entries
echo "10. Checking language file entries..."
if grep -q "rift_staff" fabric-mod/src/main/resources/assets/entersift/lang/en_us.json; then
    echo "   ✓ Rift Staff language entry exists"
else
    echo "   ✗ Rift Staff language entry missing!"
fi

if grep -q "red_rift_gauntlet" fabric-mod/src/main/resources/assets/entersift/lang/en_us.json; then
    echo "   ✓ Red gauntlet language entry exists"
else
    echo "   ✗ Red gauntlet language entry missing!"
fi

echo ""
echo "=== Verification Complete ==="
