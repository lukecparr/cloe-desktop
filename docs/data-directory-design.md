# Cloe Desktop Data Directory Design

## Goals

1. **Cross-platform**: not tied to macOS userData, use `~/.cloe/` uniformly
2. **Configurable**: the data directory path can be changed within the app
3. **Hermes can write**: a skill writes files directly to the data directory, and the app picks them up automatically
4. **Install script**: one-command initialization of default files

## Directory Structure

```
~/.cloe/                          ← CLOE_HOME (configurable)
├── config.json                   ← global config (API key, data directory, language, etc.)
├── action-sets.json              ← action set config
├── gifs/                         ← all GIF animations
│   ├── blink.gif
│   ├── smile.gif
│   ├── heart.gif                 ← AI-generated / written by a Hermes skill
│   └── _work_heart/              ← intermediate generation artifacts
├── references/                   ← reference images (one per set)
│   ├── default.png
│   └── cutekeke_63392.png
└── audio/                        ← pre-recorded TTS audio
    ├── doing.mp3
    └── done.mp3
```

## config.json

```json
{
  "version": 1,
  "dataDir": "~/.cloe",
  "dashscopeApiKey": "sk-xxx",
  "videoModel": "wan2.7-i2v",
  "language": "zh-CN"
}
```

- `dataDir`: the data root directory, defaults to `~/.cloe`
- The Hermes skill reads `~/.cloe/config.json` to get `dataDir`, and writes into `dataDir/gifs/`
- On startup, the app reads `config.json`; if `dataDir` doesn't exist, it's created and default files are copied in from the asar

## Path Resolution Priority

When the app reads a file:

```
1. {dataDir}/gifs/xxx.gif         ← user-generated / written by Hermes (preferred)
2. asar:dist/gifs/xxx.gif          ← built-in default (fallback)
```

All writes go under `{dataDir}/`.

## Install Script `scripts/install.sh`

```bash
#!/bin/bash
# Initialize the ~/.cloe data directory
CLOE_HOME="${1:-$HOME/.cloe}"
mkdir -p "$CLOE_HOME"/{gifs,references,audio}

# Copy default files from the project's public/
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cp -n "$SCRIPT_DIR/public/gifs/"*.gif "$CLOE_HOME/gifs/"
cp -n "$SCRIPT_DIR/public/audio/"*.mp3 "$CLOE_HOME/audio/"
cp -n "$SCRIPT_DIR/public/references/"*.png "$CLOE_HOME/references/"
cp -n "$SCRIPT_DIR/public/action-sets.json" "$CLOE_HOME/action-sets.json"

# Generate a default config.json (if it doesn't exist)
if [ ! -f "$CLOE_HOME/config.json" ]; then
  cat > "$CLOE_HOME/config.json" << 'EOF'
{"version":1,"dataDir":"~/.cloe","language":"zh-CN"}
EOF
fi

echo "✓ Cloe data directory initialized: $CLOE_HOME"
```

## How the Renderer Loads GIFs

No HTTP static file server is needed anymore. The dataDir path is exposed via preload.js:

```js
// preload.js
contextBridge.exposeInMainWorld('electronAPI', {
  moveWindow: (dx, dy) => ipcRenderer.send('window-move', { dx, dy }),
  getDataDir: () => ipcRenderer.sendSync('get-data-dir'),
});
```

```js
// renderer.js
const DATA_DIR = window.electronAPI?.getDataDir() || '';
const BASE = (location.protocol === 'file:' && DATA_DIR)
  ? `file://${DATA_DIR}/`
  : '/';
```

This way, the renderer loads local files directly via `file://`, with no HTTP relay needed.

## Hermes Skill Interaction

Hermes skills (such as cloe-moment, cloe-video, adding new actions):

1. Read `~/.cloe/config.json` to get `dataDir`
2. Write the GIF to `{dataDir}/gifs/xxx.gif`
3. Update the animations in `{dataDir}/action-sets.json`
4. Trigger playback with `curl http://localhost:19851/action -d '{"action":"xxx"}'`

## Migration Plan

Migrating from the current userData path to `~/.cloe/`:

1. On first launch, the app detects: if `~/.cloe/` doesn't exist but old data does, migrate automatically
2. Old path `~/Library/Application Support/cloe-desktop/` → new path `~/.cloe/`
3. Old data is kept, not deleted, after migration (safe)

## Benefits

- **Cross-platform**: `~/.cloe/` works on Linux/macOS/Windows
- **Hermes-friendly**: a fixed path means the skill doesn't have to guess
- **User-configurable**: put it wherever you want
- **Simpler**: cuts the HTTP static file server, removes path functions like `getPublicAssetsRoot`/`getWritableAssetsRoot`
- **asar is a read-only bundle**: asar only holds the initial data; at runtime everything uses `~/.cloe/`
