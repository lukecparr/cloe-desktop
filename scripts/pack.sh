#!/bin/bash
# Cloe Desktop — One-click DMG packaging
# Usage: ./scripts/pack.sh [--dir] [--install]
#   Default: package DMG
#   --dir     Package directory only (for debugging, much faster)
#   --install Deploy to /Applications and launch after packaging (auto-detects arch dir)

set -e
cd "$(dirname "$0")/.."

INSTALL=false
for arg in "$@"; do
  [[ "$arg" == "--install" ]] && INSTALL=true
done

# ── Code signing + notarization config ─────────────────────────────────
# Read credentials from .codesign.env (gitignored, won't leak)
if [[ -f .codesign.env ]]; then
  source .codesign.env
fi

# Export for electron-builder to use
export CSC_NAME="${CSC_NAME:-Chengdu Jishang Technology Co., Ltd (3Y2339R24V)}"
export APPLE_ID
export APPLE_APP_SPECIFIC_PASSWORD
export APPLE_TEAM_ID

# Notarization needs these env vars (skip notarization, sign only, if unset)
# APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID
if [[ -n "${APPLE_ID}" && -n "${APPLE_APP_SPECIFIC_PASSWORD}" ]]; then
  echo "=== Cloe Desktop packaging (sign + notarize) ==="
else
  echo "=== Cloe Desktop packaging (sign only, no notarization) ==="
  echo "  Tip: create .codesign.env and set APPLE_ID and APPLE_APP_SPECIFIC_PASSWORD to enable notarization"
fi

# If the configured signing identity isn't in the keychain, electron-builder
# skips signing; ad-hoc sign the output afterward so macOS will still launch it.
ADHOC_SIGN=false
if ! security find-identity -v -p codesigning 2>/dev/null | grep -qF "$CSC_NAME"; then
  ADHOC_SIGN=true
  echo "  ! Signing identity \"$CSC_NAME\" not in keychain — will ad-hoc sign (local use only, not distributable)"
fi

# [0] Clean old artifacts, ensure a full rebuild
echo "[0/3] Cleaning old build artifacts..."
rm -rf dist release

# [1] vite build (publicDir: false, does not copy public/)
echo "[1/3] vite build..."
node ./node_modules/vite/bin/vite.js build

# [2] Copy only files needed at runtime (exclude _work_* intermediate artifacts)
echo "[2/3] Copying static assets..."
mkdir -p dist/gifs dist/audio dist/references dist/manager

# GIFs: copy top-level finished .gif files (exclude _raw.gif) + recursively copy subdirectories
for gif in public/gifs/*.gif; do
  [[ "$(basename "$gif")" == *_raw.gif ]] && continue
  cp -f "$gif" dist/gifs/
done
for subdir in public/gifs/*/; do
  dirname=$(basename "$subdir")
  # Skip _work_* intermediate artifact directories
  [[ "$dirname" == _work_* ]] && continue
  mkdir -p "dist/gifs/$dirname"
  # Copy only finished .gif files (skip _raw.gif and _work_* subdirectories)
  for gif in "$subdir"*.gif; do
    [[ "$(basename "$gif")" == *_raw.gif ]] && continue
    cp -f "$gif" "dist/gifs/$dirname/" 2>/dev/null || true
  done
done

cp -f public/audio/*.mp3 dist/audio/ 2>/dev/null || true
cp -f public/references/*.png dist/references/ 2>/dev/null || true
cp -rf public/manager/* dist/manager/
cp -f public/action-sets.json dist/action-sets.json 2>/dev/null || true
# Tray icon (extracted from icns, used in packaged Electron)
if [[ -f build/Cloe.iconset/icon_32x32.png ]]; then
    cp -f build/Cloe.iconset/icon_32x32.png dist/tray_icon.png
fi

# [2.5] Verify key files include the latest code
echo "[2.5/3] Verifying packaged files..."
CHECKS_OK=true
for f in dist/manager/actions.js dist/manager/manager.js dist/manager/index.html dist/manager/actions.css; do
    if [[ ! -f "$f" ]]; then
        echo "  ✗ Missing: $f"
        CHECKS_OK=false
    fi
done
if $CHECKS_OK; then
    echo "  ✓ Key file verification passed"
else
    echo "  ✗ Verification failed, please check"
    exit 1
fi

# [2.6] Pre-compile node-pty as universal binary (arm64 + x64)
# electron-builder merges asar.unpacked from x64-temp and arm64-temp, but
# the latter overwrites the former — only ONE architecture survives unless
# we pre-create a fat binary via lipo.
echo "[2.6/3] Pre-compile node-pty (universal fat binary)..."
PTY_TMPDIR=$(mktemp -d)
NATIVE_ARCH=$(uname -m)
[[ "$NATIVE_ARCH" == "x86_64" ]] && NATIVE_ARCH="x64"
OTHER_ARCH="x64"
[[ "$NATIVE_ARCH" == "x64" ]] && OTHER_ARCH="arm64"

# Cross-compiling the non-native arch requires a healthy Xcode CLT install;
# fall back to a native-only binary if it fails (fine for local --dir builds).
if npx electron-rebuild -f -w node-pty --arch "$OTHER_ARCH"; then
  cp node_modules/node-pty/build/Release/pty.node "$PTY_TMPDIR/pty-$OTHER_ARCH.node"
  npx electron-rebuild -f -w node-pty --arch "$NATIVE_ARCH"
  cp node_modules/node-pty/build/Release/pty.node "$PTY_TMPDIR/pty-$NATIVE_ARCH.node"
  lipo -create -output node_modules/node-pty/build/Release/pty.node \
    "$PTY_TMPDIR/pty-arm64.node" "$PTY_TMPDIR/pty-x64.node"
  echo "  ✓ $(file node_modules/node-pty/build/Release/pty.node | grep -o 'universal.*')"
else
  echo "  ! $OTHER_ARCH cross-compile failed (Xcode CLT issue?) — building $NATIVE_ARCH-only pty.node"
  echo "  ! A universal DMG built this way will NOT work on $OTHER_ARCH Macs"
  npx electron-rebuild -f -w node-pty --arch "$NATIVE_ARCH"
  echo "  ✓ $(file node_modules/node-pty/build/Release/pty.node | grep -o 'Mach-O.*')"
fi
rm -rf "$PTY_TMPDIR"

# [3] electron-builder
if [[ "$1" == "--dir" ]]; then
    echo "[3/3] electron-builder --dir..."
    ELECTRON_MIRROR="${ELECTRON_MIRROR:-https://npmmirror.com/mirrors/electron/}" \
      ./node_modules/.bin/electron-builder --mac --dir --config.npmRebuild=false
    echo ""
    echo "=== Done! ==="
    APP_DIR=$(ls -d release/mac-arm64 release/mac 2>/dev/null | head -1)
    echo "App: ${APP_DIR:-release/mac-arm64}/Cloe.app"
    echo "Run: open ${APP_DIR:-release/mac-arm64}/Cloe.app"
else
    echo "[3/3] electron-builder --mac (universal DMG)..."
    pkill -9 hdiutil 2>/dev/null || true
    hdiutil detach "/Volumes/Cloe*" -quiet 2>/dev/null || true
    ELECTRON_MIRROR="${ELECTRON_MIRROR:-https://npmmirror.com/mirrors/electron/}" \
      ./node_modules/.bin/electron-builder --mac --config.npmRebuild=false
    echo ""
    echo "=== Done! ==="
    DMG=$(ls -t release/*.dmg 2>/dev/null | head -1)
    if [[ -n "$DMG" ]]; then
        SIZE=$(du -h "$DMG" | cut -f1)
        echo "DMG: $DMG ($SIZE)"
    fi
fi

# [3.2] Ad-hoc sign when no keychain identity was available (macOS refuses
# to launch unsigned arm64 apps). Local use only — not distributable.
if $ADHOC_SIGN; then
    echo "[3.2/3] Ad-hoc signing..."
    for dir in release/mac-universal release/mac-arm64 release/mac; do
        if [[ -d "$dir/Cloe.app" ]]; then
            codesign --force --deep -s - "$dir/Cloe.app"
            codesign --verify --deep "$dir/Cloe.app"
            echo "  ✓ $dir/Cloe.app ad-hoc signed"
        fi
    done
fi

# [3.5] Verify pty.node architectures in output
echo "[3.5/3] Verifying pty.node..."
for dir in release/mac-universal release/mac-arm64 release/mac; do
    PTY=$(find "$dir/Cloe.app" -name "pty.node" 2>/dev/null | head -1)
    if [[ -n "$PTY" ]]; then
        ARCH=$(file "$PTY" | grep -o 'arm64\|x86_64' | tr '\n' '+')
        echo "  ✓ $dir: $ARCH"
    fi
done

# ── Install step ──────────────────────────────────────────
if $INSTALL; then
    echo ""
    echo "=== Deploying to /Applications ==="
    # Find the built app (dir mode puts it in mac-arm64 or mac, DMG mode in mac-universal)
    APP_SRC=""
    for dir in release/mac-arm64 release/mac release/mac-universal; do
        if [[ -d "$dir/Cloe.app" ]]; then
            APP_SRC="$dir/Cloe.app"
            break
        fi
    done
    if [[ -z "$APP_SRC" ]]; then
        echo "  ✗ Cloe.app not found, skipping deployment"
        exit 0
    fi

    # Kill running instance
    pkill -f "Cloe.app" 2>/dev/null || true
    sleep 2

    # CRITICAL: rm -rf BEFORE cp -R to ensure asar is fully replaced.
    # macOS cp -R into existing .app bundle will NOT overwrite existing files like app.asar.
    rm -rf /Applications/Cloe.app
    cp -R "$APP_SRC" /Applications/Cloe.app

    # Verify asar was actually replaced
    SOURCE_ASAR="$APP_SRC/Contents/Resources/app.asar"
    TARGET_ASAR="/Applications/Cloe.app/Contents/Resources/app.asar"
    if [[ -f "$SOURCE_ASAR" && -f "$TARGET_ASAR" ]]; then
        SRC_MD5=$(md5 -q "$SOURCE_ASAR")
        DST_MD5=$(md5 -q "$TARGET_ASAR")
        if [[ "$SRC_MD5" == "$DST_MD5" ]]; then
            echo "  ✓ asar verification passed ($SRC_MD5)"
        else
            echo "  ✗ asar MD5 mismatch! source=$SRC_MD5 target=$DST_MD5"
            exit 1
        fi
    fi

    # Clear Electron caches to avoid stale code
    rm -rf ~/Library/Application\ Support/cloe-desktop/Cache 2>/dev/null || true
    rm -rf ~/Library/Application\ Support/cloe-desktop/Code\ Cache 2>/dev/null || true
    rm -rf ~/Library/Application\ Support/cloe-desktop/GPUCache 2>/dev/null || true
    rm -rf ~/Library/Application\ Support/cloe-desktop/DawnCache 2>/dev/null || true

    open /Applications/Cloe.app
    echo "  ✓ Launched /Applications/Cloe.app"
fi
