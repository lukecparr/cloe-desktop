# Config API

Read and write app config, window position/scale, and plugin trigger rules through the Bridge API. Config is persisted in `~/.cloe/config.json`.

> The character's position and size within the window use `/character-layout` -- see [layout.md](layout.md) for details.

## 1. App Config (api-config)

`/api-config` reads/writes the entire `~/.cloe/config.json`. POST does a **shallow merge** (patch) -- it won't overwrite fields that weren't passed.

### Read Full Config

```bash
curl -s http://localhost:19851/api-config
```

Returns the full config.json; common fields include:

```json
{
  "version": 1,
  "dataDir": "~/.cloe",
  "language": "zh-CN",
  "dashscopeApiKey": "...",
  "videoModel": "wan2.7-i2v",
  "hermesApi": { "host": "127.0.0.1", "port": 8642, "key": "" },
  "weather": { "enabled": false, "provider": "open-meteo", ... },
  "windowScale": 1.0,
  "characterPosition": { "x": 0.5, "y": 1.0 },
  "characterSize": { "scale": 1.0 },
  "chatNickname": "Cloe",
  "terminalShortcut": ""
}
```

### Update Config (merge)

```bash
# Set the DashScope API key (used for GIF generation)
curl -s -X POST http://localhost:19851/api-config -H 'Content-Type: application/json' \
  -d '{"dashscopeApiKey":"sk-xxx"}'

# Configure the Hermes API
curl -s -X POST http://localhost:19851/api-config -H 'Content-Type: application/json' \
  -d '{"hermesApi":{"host":"127.0.0.1","port":8642,"key":"your-key"}}'

# Change the language
curl -s -X POST http://localhost:19851/api-config -H 'Content-Type: application/json' \
  -d '{"language":"en-US"}'
```

> Shallow merge: passing `{"hermesApi":{...}}` **replaces the entire** hermesApi object (no deep merge). To change a single field of hermesApi, you need to pass the whole hermesApi object.

## 2. Window Position

Remembers the position of the main floating window. Coordinates are absolute screen pixels.

### Read (including the current actual position)

```bash
curl -s http://localhost:19851/window-position
# {"saved": {"x": 100, "y": 200}, "current": {"x": 105, "y": 210}}
```

- `saved`: the persisted, saved position
- `current`: the window's actual current position (may differ from `saved` if the user dragged it)

### Save / Clear

```bash
# Save the current position
curl -s -X POST http://localhost:19851/window-position -H 'Content-Type: application/json' \
  -d '{"x":100,"y":200}'

# Clear the saved position (uses the default position next launch)
curl -s -X POST http://localhost:19851/window-position -H 'Content-Type: application/json' \
  -d '{"clear":true}'
```

## 3. Window Scale

The scale factor of the entire main window (affects the GIF display size). Range `0.3 ~ 2.0`, default `1.0`.

### Read

```bash
curl -s http://localhost:19851/window-scale
# {"scale": 1.0, "min": 0.3, "max": 2.0}
```

### Set

```bash
curl -s -X POST http://localhost:19851/window-scale -H 'Content-Type: application/json' \
  -d '{"scale":1.5}'
```

Values outside `[0.3, 2.0]` are automatically clamped to the boundary.

## 4. Plugin Trigger Rules

`plugin-rules.json` defines the auto-trigger rules for the Hermes plugin (under what conditions the character automatically performs an action). See [plugin.md](plugin.md) for details.

### Read

```bash
curl -s http://localhost:19851/plugin-rules
```

### Write

```bash
curl -s -X POST http://localhost:19851/plugin-rules -H 'Content-Type: application/json' \
  -d '{"rules":[...]}'
```

Replaces the whole thing (not a merge). The file lives at `<dataDir>/plugin-rules.json`.

## Notes

- All config changes take effect immediately and are persisted, surviving an app restart
- The `dataDir` field determines the data root directory (GIFs/audio/config all live under it), default `~/.cloe`
- After changing sensitive fields like `hermesApi` or `dashscopeApiKey`, related features (chat, GIF generation) immediately use the new values
