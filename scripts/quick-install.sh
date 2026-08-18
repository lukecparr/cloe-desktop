#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Cloe Desktop — One-Click Installer
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/lukecparr/cloe-desktop/main/scripts/quick-install.sh | bash
#
# What it does:
#   1. Downloads the latest Cloe.app DMG (universal — Intel + Apple Silicon)
#   2. Installs to /Applications
#   3. Launches Cloe
#   4. If Hermes is installed: installs hook, plugin, skills, plugin-rules
#   5. Prompts for TTS keys (wanxiang/mosi)
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

# ── Colors ────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

ok()   { echo -e "${GREEN}  ✓${NC} $1"; }
warn() { echo -e "${YELLOW}  !${NC} $1"; }
err()  { echo -e "${RED}  ✗${NC} $1"; }
info() { echo -e "${CYAN}  →${NC} $1"; }
step() { echo -e "\n${BOLD}${CYAN}[$1]${NC} ${2}"; }

BANNER="
${BOLD}${CYAN}  ╔══════════════════════════════════════╗${NC}
${BOLD}${CYAN}  ║     Cloe Desktop — Quick Install     ║${NC}
${BOLD}${CYAN}  ╚══════════════════════════════════════╝${NC}
"

echo -e "$BANNER"

# ── Config ────────────────────────────────────────────────────
GITHUB_REPO="${CLOE_GITHUB_REPO:-lukecparr/cloe-desktop}"
APP_NAME="Cloe"
HERMES_DIR="${HOME}/.hermes"
CLOE_DATA_DIR="${HOME}/.cloe"

# ── Helpers ───────────────────────────────────────────────────
get_latest_version() {
    local version
    version=$(curl -fsSL "https://api.github.com/repos/${GITHUB_REPO}/releases/latest" \
        | grep '"tag_name"' | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')
    if [[ -z "$version" ]]; then
        err "Failed to fetch latest version from GitHub"
        exit 1
    fi
    echo "$version"
}

check_hermes() {
    [[ -d "$HERMES_DIR" && -f "$HERMES_DIR/config.yaml" ]]
}

check_hermes_venv() {
    [[ -d "$HERMES_DIR/hermes-agent/venv" ]]
}

# ── Step 1: System Check ─────────────────────────────────────
step "1/5" "Checking system..."
if [[ "$(uname -s)" != "Darwin" ]]; then
    err "This installer only supports macOS"
    exit 1
fi
ok "macOS $(sw_vers -productVersion 2>/dev/null || echo 'unknown'), $(uname -m)"

# ── Step 2: Download DMG ────────────────────────────────────
step "2/5" "Downloading latest Cloe Desktop..."
TAG=$(get_latest_version)
VERSION="${TAG#v}"  # strip 'v' prefix
ok "Latest version: ${BOLD}${TAG}${NC}"

DMG_NAME="${APP_NAME}-${VERSION}-universal.dmg"
DMG_PATH="/tmp/${DMG_NAME}"
DMG_URL="https://github.com/${GITHUB_REPO}/releases/download/${TAG}/${DMG_NAME}"

if [[ -f "$DMG_PATH" ]]; then
    warn "Using cached: ${DMG_PATH}"
else
    info "Downloading ${DMG_NAME}..."
    curl -fSL --progress-bar -o "$DMG_PATH" "$DMG_URL" || {
        err "Download failed: ${DMG_URL}"
        echo "  Check releases: https://github.com/${GITHUB_REPO}/releases"
        exit 1
    }
fi

# ── Step 3: Install App ─────────────────────────────────────
step "3/5" "Installing Cloe to /Applications..."

# Kill running instance
if pgrep -f "${APP_NAME}.app" >/dev/null 2>&1; then
    info "Closing running Cloe..."
    pkill -f "${APP_NAME}.app" 2>/dev/null || true
    sleep 1
fi

# Mount DMG
MOUNT_POINT="/tmp/cloe-mount-$$"
hdiutil attach "$DMG_PATH" -nobrowse -quiet -mountpoint "$MOUNT_POINT" 2>/dev/null

APP_SOURCE=$(find "$MOUNT_POINT" -maxdepth 1 -name "*.app" -type d | head -1)
if [[ -z "$APP_SOURCE" ]]; then
    hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null || true
    err "No .app found in DMG"
    exit 1
fi

rm -rf "/Applications/${APP_NAME}.app"
cp -R "$APP_SOURCE" "/Applications/${APP_NAME}.app"
hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null || true
rm -f "$DMG_PATH"

ok "Installed /Applications/${APP_NAME}.app"

# ── Step 4: Data Directory ───────────────────────────────────
step "4/5" "Setting up data directory..."
mkdir -p "$CLOE_DATA_DIR/audio_cache"
mkdir -p "$CLOE_DATA_DIR/gifs"
ok "Data directory: ${CLOE_DATA_DIR}"

# ── Step 5: Hermes Integration (optional) ────────────────────
step "5/5" "Checking for Hermes Agent..."

if ! check_hermes; then
    warn "Hermes Agent not detected at ${HERMES_DIR}"
    echo ""
    echo "  Cloe Desktop is installed and can run standalone."
    echo "  To enable AI agent integration, install Hermes first:"
    echo "    ${CYAN}curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash${NC}"
else
    ok "Hermes Agent found at ${HERMES_DIR}"

    # ── Install hook ──
    echo ""
    info "Installing Hermes hook..."
    HOOK_SRC="https://raw.githubusercontent.com/${GITHUB_REPO}/main/docs/hermes-hook"
    HOOK_DST="${HERMES_DIR}/hooks/cloe-desktop"
    rm -rf "$HOOK_DST"
    mkdir -p "$HOOK_DST"

    curl -fsSL "${HOOK_SRC}/HOOK.yaml" -o "${HOOK_DST}/HOOK.yaml"
    curl -fsSL "${HOOK_SRC}/handler.py" -o "${HOOK_DST}/handler.py"

    if [[ -f "${HOOK_DST}/handler.py" ]]; then
        ok "Hook → ${HOOK_DST}"
    else
        warn "Hook download failed — skipping"
    fi

    # ── Install plugin ──
    echo ""
    info "Installing Hermes plugin..."
    PLUGIN_SRC="https://raw.githubusercontent.com/${GITHUB_REPO}/main/docs/hermes-plugin"
    PLUGIN_DST="${HERMES_DIR}/plugins/cloe-desktop"
    rm -rf "$PLUGIN_DST"
    mkdir -p "$PLUGIN_DST"

    curl -fsSL "${PLUGIN_SRC}/plugin.yaml" -o "${PLUGIN_DST}/plugin.yaml"
    curl -fsSL "${PLUGIN_SRC}/handler.py" -o "${PLUGIN_DST}/handler.py"
    curl -fsSL "${PLUGIN_SRC}/__init__.py" -o "${PLUGIN_DST}/__init__.py"

    if [[ -f "${PLUGIN_DST}/handler.py" ]]; then
        ok "Plugin → ${PLUGIN_DST}"
    else
        warn "Plugin download failed — skipping"
    fi

    # ── Install skill ──
    echo ""
    info "Installing Cloe Desktop skill..."
    SKILL_SRC="https://raw.githubusercontent.com/${GITHUB_REPO}/main/docs/skills/cloe-desktop-action"
    SKILL_DST="${HERMES_DIR}/skills/creative/cloe-desktop-action"
    rm -rf "$SKILL_DST"
    mkdir -p "${SKILL_DST}/scripts"

    curl -fsSL "${SKILL_SRC}/SKILL.md" -o "${SKILL_DST}/SKILL.md"

    for script in generate_tts.py generate_gif_v2.py generate_gif.py fix_gif_chromakey.py batch_generate_gifs.py; do
        curl -fsSL "${SKILL_SRC}/scripts/${script}" -o "${SKILL_DST}/scripts/${script}" 2>/dev/null || true
    done

    # Download reference docs
    REF_SRC="https://raw.githubusercontent.com/${GITHUB_REPO}/main/docs/skills/references"
    REF_DST="${HERMES_DIR}/skills/creative/references"
    mkdir -p "$REF_DST"
    for ref in fix-gif-chromakey.md packaged-mode-gif-generation.md tray-icon-and-icns.md; do
        curl -fsSL "${REF_SRC}/${ref}" -o "${REF_DST}/${ref}" 2>/dev/null || true
    done

    if [[ -f "${SKILL_DST}/SKILL.md" ]]; then
        ok "Skill → ${SKILL_DST}"
    else
        warn "Skill download failed — skipping"
    fi

    # ── Default plugin-rules (minimal — all null) ──
    echo ""
    info "Installing default plugin-rules..."
    PLUGIN_RULES="${CLOE_DATA_DIR}/plugin-rules.json"
    if [[ -f "$PLUGIN_RULES" ]]; then
        warn "Existing plugin-rules.json — preserving (not overwriting)"
    else
        cat > "$PLUGIN_RULES" << 'RULES_EOF'
{
  "min_interval": 1.5,
  "tool_expressions": {
    "terminal": null,
    "execute_code": null,
    "write_file": null,
    "patch": null,
    "read_file": null,
    "search_files": null,
    "web_search": null,
    "browser_navigate": null,
    "browser_click": null,
    "delegate_task": null,
    "send_message": null,
    "vision_analyze": null
  },
  "tool_completions": {
    "execute_code": null,
    "delegate_task": null
  },
  "keyword_map": [],
  "context_thresholds": {
    "warning": { "pct": 75, "action": null },
    "critical": { "pct": 90, "action": null }
  }
}
RULES_EOF
        ok "Default rules → ${PLUGIN_RULES} (all triggers null, minimal mode)"
        info "Edit to enable triggers — changes auto-reload in 5s"
    fi

    # ── TTS config template ──
    TTS_CONFIG="${CLOE_DATA_DIR}/tts-config.json"
    if [[ -f "$TTS_CONFIG" ]]; then
        warn "Existing tts-config.json — preserving"
    else
        cat > "$TTS_CONFIG" << 'TTS_EOF'
{
  "provider": "mosi",
  "mosi": {
    "api_key": "",
    "voice_id": "2036257587296473088",
    "url": "https://studio.mosi.cn/v1/audio/tts"
  },
  "cosyvoice": {
    "api_key_env": "BAILIAN_API_KEY",
    "model": "cosyvoice-v1",
    "voice": "longmiao"
  }
}
TTS_EOF
        ok "TTS config template → ${TTS_CONFIG}"
    fi

    # ── Restart reminder ──
    echo ""
    warn "Hook and plugin require Hermes gateway restart:"
    echo ""
    if check_hermes_venv; then
        echo "    ${CYAN}source ~/.hermes/hermes-agent/venv/bin/activate${NC}"
        echo "    ${CYAN}python -m hermes_cli.main gateway run --replace${NC}"
    else
        echo "    ${CYAN}hermes gateway restart${NC}"
    fi
fi

# ── Launch ───────────────────────────────────────────────────
echo ""
info "Launching Cloe Desktop..."
open "/Applications/${APP_NAME}.app"

for i in $(seq 1 15); do
    sleep 1
    if curl -s http://localhost:19851/status 2>/dev/null | grep -q "clients"; then
        ok "Cloe Desktop is running!"
        break
    fi
done

if ! curl -s http://localhost:19851/status 2>/dev/null | grep -q "clients"; then
    warn "Cloe is starting up (may take a few more seconds)"
fi

# ── Done ─────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${CYAN}  🎉 Cloe Desktop installed successfully!${NC}"
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${BOLD}What's next:${NC}"
echo ""
echo "  1. If macOS shows a security dialog:"
echo "     System Settings → Privacy & Security → Open Anyway"
echo ""
echo -e "  2. ${BOLD}Configure TTS for voice features:${NC}"
echo ""
echo "     Option A — MOSI (recommended, natural voice):"
echo -e "       ${CYAN}Edit ~/.cloe/tts-config.json${NC}"
echo "       Set your MOSI API key in \"mosi.api_key\" field"
echo "       Get key at: https://studio.mosi.cn"
echo ""
echo "     Option B — Alibaba CosyVoice:"
echo -e "       ${CYAN}Set env var BAILIAN_API_KEY${NC}"
echo "       Or edit ~/.cloe/tts-config.json → cosyvoice.api_key_env"
echo ""
echo "  3. Customize expressions and triggers:"
echo -e "     ${CYAN}Edit ~/.cloe/plugin-rules.json${NC}"
echo "     (changes apply automatically — no restart needed)"
echo ""
echo "  4. Manager UI — right-click the Cloe tray icon → Open Manager"
echo ""
echo -e "  ${BOLD}Docs:${NC} https://github.com/${GITHUB_REPO}"
echo -e "  ${BOLD}Issues:${NC} https://github.com/${GITHUB_REPO}/issues"
echo ""
