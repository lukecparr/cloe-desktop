# Embedded Terminal Usage

Cloe Desktop has an embedded xterm.js terminal that shares the same transparent window as the character, with mode switching support.

## File Responsibilities

| File | Responsibility |
|------|------|
| `launcher.js` | HTTP bridge endpoints, window management, PTY proxy lifecycle |
| `preload.js` | exposes IPC APIs like `ptySpawn`/`ptyWrite`/`ptyResize`/`setWindowMode` |
| `src/renderer.js` | GIF/audio/WebSocket/drag/effects (plain vanilla JS, does not manage terminal visibility) |
| `src/react/App.jsx` | root component: visible/mode state, localStorage sync, keyboard shortcuts |
| `src/react/TerminalMode.jsx` | xterm.js wrapper (lazy-loaded), PTY spawn, fit/resize |
| `src/react/CanvasMode.jsx` | Excalidraw wrapper (lazy-loaded), dark theme |
| `src/react/OverlayTitlebar.jsx` | macOS-style traffic-light buttons + mode switcher |
| `scripts/pty-proxy.js` | standalone Node.js process: runs node-pty, proxies I/O via JSON lines |

## Mode Switching

A single BrowserWindow, with three modes switched by adjusting window properties (no destroy/recreate):

- **Character mode**: `alwaysOnTop: true`, small window
- **Terminal mode**: `alwaysOnTop: false`, 75% of screen work area, centered
- **Canvas mode**: builds on Terminal mode, displaying Excalidraw

```bash
# Show canvas
curl -s -X POST http://localhost:19851/canvas/show -H 'Content-Type: application/json' -d '{"mode":"canvas"}'

# Show terminal
curl -s -X POST http://localhost:19851/canvas/show -H 'Content-Type: application/json' -d '{"mode":"terminal"}'

# Hide (return to character mode)
curl -s -X POST http://localhost:19851/canvas/hide
```

## API Endpoint Cheatsheet

| Endpoint | Method | Description |
|------|------|------|
| `/canvas/show` | POST | show overlay: `{"mode":"canvas"}` or `{"mode":"terminal"}` |
| `/canvas/hide` | POST | hide overlay |
| `/canvas/excalidraw/draw` | POST | draw elements: `{"elements":[...]}` |
| `/canvas/excalidraw/scene` | GET | read the current scene |
| `/canvas/excalidraw/scene` | DELETE | clear the canvas |
| `/canvas/excalidraw/files` | POST | register image files: `{"files":{id:{mimeType,data}}}` |
| `/canvas/excalidraw/zoom` | POST | zoom: `{"level":2}` |
| `/canvas/excalidraw/pan` | POST | pan: `{"x":200,"y":300}` |
| `/canvas/excalidraw/select` | POST | select elements: `{"ids":["el1"]}` |
| `/canvas/excalidraw/deselect` | POST | clear selection |
| `/canvas/excalidraw/focus` | POST | focus elements: `{"ids":["el1"]}` |
| `/canvas/excalidraw/elements` | DELETE | delete elements: `{"ids":["el1"]}` |
| `/chat/message` | POST | inject a message: `{"role":"assistant","content":"...","image":"<base64>"}` |
| `/screenshot` | GET | capture the window as PNG |

## Terminal Keyboard Shortcuts

- Uses **document-level capture-phase keydown** (not Electron's `globalShortcut`, which silently fails when the shortcut is already taken)
- In terminal mode, shortcuts are intercepted to exit the terminal; outside terminal mode, they aren't intercepted when xterm has focus
- Shortcuts are persisted via `localStorage('cloe-terminal-shortcut')`, configured in the admin UI

## macOS-style Traffic Light Buttons

`transparent: true` + `frame: false` disables native traffic lights, so they're simulated with custom HTML/CSS:

- Red `#ff5f57`, yellow `#febc2e`, green `#28c840`
- `inset box-shadow` simulates an inner glow
- icons (x, -, diagonal arrows) shown on hover
- 32px draggable title bar

## Fullscreen Support

- `fullscreenable: true` must be explicitly set (`frame: false` disables fullscreen by default)
- Entering/exiting fullscreen triggers xterm's `fitAddon.fit()` (~100ms delay)
- Exposed to the renderer via the `onFullscreenChanged` preload API

## Notes

- Changes to `launcher.js` or `preload.js` require an Electron restart (not managed by Vite HMR)
- node-pty can't be loaded directly in Electron (ABI mismatch); it must go through the PTY proxy subprocess
- `#react-root` has `pointer-events: none` set, with `auto` on inner overlays -- otherwise GIF dragging gets blocked when hidden
- Terminal/Canvas switching uses CSS `display: none/block`, not component unmounting (otherwise state is lost)
