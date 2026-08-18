#!/bin/bash
# Install the packaged Cloe.app to /Applications
# Kill the process, delete the old app, copy the new app, then launch
set -e
cd "$(dirname "$0")/.."

APP_SRC="release/mac/Cloe.app"
APP_DST="/Applications/Cloe.app"

if [[ ! -d "$APP_SRC" ]]; then
    echo "✗ $APP_SRC not found, run ./scripts/pack.sh first"
    exit 1
fi

echo "=== Installing Cloe Desktop ==="

# [1] Kill the running Cloe
echo "[1/4] Closing old version..."
pkill -f "Cloe.app" 2>/dev/null || true
sleep 1

# [2] Delete the old app (must delete first, otherwise cp -R may not overwrite asar)
echo "[2/4] Deleting old version..."
rm -rf "$APP_DST"

# [3] Copy the new app
echo "[3/4] Installing new version..."
cp -R "$APP_SRC" "$APP_DST"

# [4] Launch
echo "[4/4] Launching..."
open "$APP_DST"

# Wait until ready
for i in $(seq 1 10); do
    sleep 1
    STATUS=$(curl -s http://localhost:19851/status 2>/dev/null)
    if echo "$STATUS" | grep -q "clients"; then
        echo "✓ Cloe Desktop launched ($STATUS)"
        exit 0
    fi
done
echo "⚠ Starting up, please wait..."
