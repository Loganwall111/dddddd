#!/usr/bin/env bash
set -euo pipefail

# Linux/Ubuntu preparation for inspecting a locally owned Minecraft Dungeons II install.
# This installs generic archive/image parsers only. It does not download the game, unpack
# encrypted content, search for keys, attach to a running process, or read process memory.
#
# Usage:
#   bash tools/setup_mcd2_asset_tools.sh [GAME_INSTALL_DIRECTORY]
#
# UE Viewer and QuickBMS are distributed separately; obtain them from their authors and
# follow their licenses. UnrealPak comes with a matching Unreal Engine installation.

if [[ "$(uname -s)" != "Linux" ]] || ! command -v apt-get >/dev/null 2>&1; then
    echo "This bootstrap targets Debian/Ubuntu on Linux. Use the equivalent packages for your host OS." >&2
    exit 2
fi

if [[ "$EUID" -eq 0 ]]; then
    APT=(apt-get)
elif command -v sudo >/dev/null 2>&1; then
    APT=(sudo apt-get)
else
    echo "Install system packages as root, or install python3-venv, pip, file, unzip, jq, and 7-Zip manually." >&2
    exit 2
fi

"${APT[@]}" update
packages=(ca-certificates curl file jq python3 python3-pip python3-venv unzip)
if apt-cache show 7zip >/dev/null 2>&1; then
    packages+=(7zip)
elif apt-cache show p7zip-full >/dev/null 2>&1; then
    packages+=(p7zip-full)
fi
"${APT[@]}" install -y --no-install-recommends "${packages[@]}"

TOOLS_HOME="${XDG_DATA_HOME:-$HOME/.local/share}/mcd2-asset-tools"
VENV="$TOOLS_HOME/venv"
mkdir -p "$TOOLS_HOME"
python3 -m venv "$VENV"
"$VENV/bin/python" -m pip install --upgrade pip
"$VENV/bin/python" -m pip install Pillow zstandard lz4 construct

printf '\nPython analysis environment: %s\n' "$VENV"
for tool in 7z 7zz quickbms umodel UnrealPak; do
    if command -v "$tool" >/dev/null 2>&1; then
        printf 'FOUND  %-12s %s\n' "$tool" "$(command -v "$tool")"
    else
        printf 'MISSING %-12s\n' "$tool"
    fi
done

GAME_DIR="${1:-${MCD2_GAME_DIR:-}}"
if [[ -n "$GAME_DIR" ]]; then
    if [[ ! -d "$GAME_DIR" ]]; then
        echo "Game directory does not exist: $GAME_DIR" >&2
        exit 2
    fi
    GAME_DIR="$(realpath "$GAME_DIR")"
    printf '\nUnreal files under %s (inventory only; no extraction):\n' "$GAME_DIR"
    find "$GAME_DIR" -type f \( -iname '*.pak' -o -iname '*.ucas' -o -iname '*.utoc' \
        -o -iname '*.uasset' -o -iname '*.umap' \) -print
else
    printf '\nNo game path supplied. Re-run with the exact install directory, or set MCD2_GAME_DIR.\n'
fi

cat <<'EOF'

Manual tool notes:
  UE Viewer / UModel: https://www.gildor.org/en/projects/umodel
  QuickBMS:           https://aluigi.altervista.org/quickbms.htm
  UnrealPak:          use the UnrealPak binary shipped with an authorized matching UE installation.

This script intentionally does not fetch game files, use decryption keys, or perform extraction.
Only inspect or export content you are authorized to access, and do not redistribute original game assets.
EOF
