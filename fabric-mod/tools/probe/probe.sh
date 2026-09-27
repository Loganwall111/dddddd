#!/usr/bin/env bash
# CI-only API probe: dumps public signatures of the real 26.3 / Fabric classes.
set -u
cd "$(dirname "$0")/../.."
./gradlew --no-daemon -q printProbeClasspath > /dev/null
CP=$(cat build/probe-classpath.txt)
OUT=build/probe; mkdir -p $OUT
while read -r c; do [ -z "$c" ] && continue; echo "===== $c"; javap -public -cp "$CP" "$c" 2>&1 | head -400; done < tools/probe/classes.txt > $OUT/signatures.txt
IFS=':' read -ra JARS <<< "$CP"
for j in "${JARS[@]}"; do case "$j" in *.jar) unzip -Z1 "$j" 2>/dev/null | grep '\.class$' | grep -E "$(cat tools/probe/patterns.txt)" | sed "s|^|$(basename $j): |";; esac; done | grep -v '\$[0-9]' | sort -u > $OUT/classlist.txt
wc -l $OUT/*
