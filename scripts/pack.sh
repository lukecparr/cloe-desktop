#!/bin/bash
# Cloe Desktop — one-command package helper
# Usage: ./scripts/pack.sh [--dir] [--install] [--linux|--mac]
#   default     package for the current platform (macOS -> DMG, Linux -> AppImage/deb)
#   --dir       package unpacked directory only (faster for debugging)
#   --install   after macOS build, deploy to /Applications and launch
#   --linux     force Linux target
#   --mac       force macOS target

set -e
cd "$(dirname "$0")/.."

INSTALL=false
DIR_MODE=false
TARGET_PLATFORM=""
for arg in "$@"; do
  [[ "$arg" == "--install" ]] && INSTALL=true
  [[ "$arg" == "--dir" ]] && DIR_MODE=true
  [[ "$arg" == "--linux" ]] && TARGET_PLATFORM="linux"
  [[ "$arg" == "--mac" ]] && TARGET_PLATFORM="mac"
done

if [[ -z "$TARGET_PLATFORM" ]]; then
  case "$(uname -s)" in
    Darwin) TARGET_PLATFORM="mac" ;;
    Linux) TARGET_PLATFORM="linux" ;;
    *) echo "Unsupported platform: $(uname -s)"; exit 1 ;;
  esac
fi

if [[ "$TARGET_PLATFORM" != "mac" && "$INSTALL" == "true" ]]; then
  echo "--install is currently only supported for macOS /Applications builds"
  exit 1
fi

echo "=== Cloe Desktop package ($TARGET_PLATFORM) ==="

# [0] 清理旧产物，确保全量重建
echo "[0/3] 清理旧构建产物..."
rm -rf dist release

# [1] vite build (publicDir: false, 不拷贝 public/)
echo "[1/3] vite build..."
node ./node_modules/vite/bin/vite.js build

# [2] 只拷贝运行时需要的文件（排除 _work_* 中间产物）
echo "[2/3] 拷贝静态资源..."
mkdir -p dist/gifs dist/audio dist/references dist/manager

# GIFs: 拷贝顶层成品 .gif 文件（排除 _raw.gif）+ 递归拷贝子目录
for gif in public/gifs/*.gif; do
  [[ "$(basename "$gif")" == *_raw.gif ]] && continue
  cp -f "$gif" dist/gifs/
done
for subdir in public/gifs/*/; do
  dirname=$(basename "$subdir")
  # 跳过 _work_* 中间产物目录
  [[ "$dirname" == _work_* ]] && continue
  mkdir -p "dist/gifs/$dirname"
  # 只拷贝成品 .gif 文件（跳过 _raw.gif 和 _work_* 子目录）
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

# [2.5] 校验关键文件已包含最新代码
echo "[2.5/3] 校验打包文件..."
CHECKS_OK=true
for f in dist/manager/actions.js dist/manager/manager.js dist/manager/index.html dist/manager/actions.css; do
    if [[ ! -f "$f" ]]; then
        echo "  ✗ 缺失: $f"
        CHECKS_OK=false
    fi
done
if $CHECKS_OK; then
    echo "  ✓ 关键文件校验通过"
else
    echo "  ✗ 校验失败，请检查"
    exit 1
fi

# [3] electron-builder
BUILDER_ARGS=("--$TARGET_PLATFORM")
if $DIR_MODE; then
    BUILDER_ARGS+=("--dir")
fi
if [[ "$TARGET_PLATFORM" == "linux" ]]; then
    # Linux terminal mode uses scripts/pty-proxy.js under system Node, so do not
    # rebuild node-pty against Electron's ABI during packaging.
    BUILDER_ARGS+=("-c.npmRebuild=false")
fi

echo "[3/3] electron-builder ${BUILDER_ARGS[*]}..."
./node_modules/.bin/electron-builder "${BUILDER_ARGS[@]}"
echo ""
echo "=== 完成! ==="

if [[ "$TARGET_PLATFORM" == "mac" ]]; then
    if $DIR_MODE; then
        echo "App: release/mac/Cloe.app (or release/mac-*/Cloe.app)"
        echo "运行: open release/mac/Cloe.app"
    else
        DMG=$(ls -t release/*.dmg 2>/dev/null | head -1)
        if [[ -n "$DMG" ]]; then
            SIZE=$(du -h "$DMG" | cut -f1)
            echo "DMG: $DMG ($SIZE)"
        fi
    fi
else
    echo "Linux artifacts:"
    find release -maxdepth 2 -type f \( -name '*.AppImage' -o -name '*.deb' \) -print 2>/dev/null || true
    if $DIR_MODE; then
        echo "Unpacked app: release/linux-*"
    fi
fi

# ── Install step ──────────────────────────────────────────
if $INSTALL; then
    echo ""
    echo "=== 部署到 /Applications ==="
    # Find the built app (dir mode puts it in mac-arm64 or mac, DMG mode in mac-universal)
    APP_SRC=""
    for dir in release/mac-arm64 release/mac release/mac-universal; do
        if [[ -d "$dir/Cloe.app" ]]; then
            APP_SRC="$dir/Cloe.app"
            break
        fi
    done
    if [[ -z "$APP_SRC" ]]; then
        echo "  ✗ 未找到 Cloe.app，跳过部署"
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
            echo "  ✓ asar 校验通过 ($SRC_MD5)"
        else
            echo "  ✗ asar MD5 不匹配! 源=$SRC_MD5 目标=$DST_MD5"
            exit 1
        fi
    fi

    # Clear Electron caches to avoid stale code
    rm -rf ~/Library/Application\ Support/cloe-desktop/Cache 2>/dev/null || true
    rm -rf ~/Library/Application\ Support/cloe-desktop/Code\ Cache 2>/dev/null || true
    rm -rf ~/Library/Application\ Support/cloe-desktop/GPUCache 2>/dev/null || true
    rm -rf ~/Library/Application\ Support/cloe-desktop/DawnCache 2>/dev/null || true

    open /Applications/Cloe.app
    echo "  ✓ 已启动 /Applications/Cloe.app"
fi
