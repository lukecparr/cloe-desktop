# Cloe Canvas — MVP Documentation

> The canvas system for Cloe Desktop, supporting element rendering, paste interactions, annotations, and Mode plugins.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Element Data Structure](#element-data-structure)
- [Canvas HTTP API](#canvas-http-api)
- [Mode System](#mode-system)
- [Usage Examples](#usage-examples)
- [File Structure](#file-structure)

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                      launcher.js (Electron Main)             │
│  ┌──────────────┐  ┌──────────────────┐  ┌────────────────┐  │
│  │  HTTP Server  │  │  Canvas Elements │  │  Canvas Mode  │  │
│  │  :19851       │  │  (in-memory[])   │  │  State Machine│  │
│  └──────┬───────┘  └────────┬─────────┘  └───────┬────────┘  │
│         │                   │                     │           │
│  ┌──────┴───────────────────┴─────────────────────┴────────┐  │
│  │              broadcastCanvasUpdate() / broadcastMode()  │  │
│  └─────────────────────────┬───────────────────────────────┘  │
└────────────────────────────┼──────────────────────────────────┘
                             │ IPC (canvas-update, canvas-mode-change)
                             ▼
┌──────────────────────────────────────────────────────────────┐
│                  Canvas BrowserWindow                         │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  canvas-preload.js (contextBridge → window.canvasAPI)    │ │
│  └────────────────────────┬────────────────────────────────┘ │
│  ┌────────────────────────┴────────────────────────────────┐ │
│  │  canvas-renderer.js + element-model.js + mode-system.js │ │
│  │  ┌───────────────┐  ┌──────────────────────────────┐   │ │
│  │  │  Element Core │  │  Mode Plugin System           │   │ │
│  │  │  - CRUD       │  │  - mode-system.js (registry)  │   │ │
│  │  │  - Paste      │  │  - modes/code-review.js       │   │ │
│  │  │  - Render     │  │  - (future: design, etc.)     │   │ │
│  │  └───────────────┘  └──────────────────────────────┘   │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
                             ▲
                             │ HTTP REST API (curl / Hermes / scripts)
                    http://localhost:19851
```

### Core Components

| Component | File | Responsibility |
|------|------|------|
| **Electron Main** | `launcher.js` | HTTP API server, Canvas Window management, element storage |
| **Canvas Preload** | `canvas-preload.js` | IPC bridge, exposes `window.canvasAPI` |
| **Element Model** | `src/canvas/element-model.js` | Element data structure definition, creation, validation |
| **Canvas Renderer** | `src/canvas/canvas-renderer.js` | DOM rendering, paste interaction, annotation rendering |
| **Mode System** | `src/canvas/mode-system.js` | Mode registry, switching, context formatting |
| **Code Review Mode** | `src/canvas/modes/code-review.js` | Code review mode plugin |
| **Canvas HTML** | `src/canvas/canvas.html` | Canvas page entry point |

---

## Element Data Structure

Every canvas element follows this JSON structure:

```json
{
  "id": "el_m1abc_defgh",
  "type": "text",
  "x": 50,
  "y": 50,
  "w": 200,
  "h": 120,
  "content": "Hello Canvas!",
  "style": {
    "opacity": 1,
    "rotation": 0,
    "fontSize": 16,
    "fontWeight": "normal",
    "color": "#333333",
    "textAlign": "left",
    "backgroundColor": "transparent",
    "borderColor": "#cccccc",
    "borderWidth": 2,
    "borderRadius": 4,
    "strokeColor": "#ff4444",
    "strokeWidth": 2,
    "highlightColor": "rgba(255, 255, 0, 0.35)"
  },
  "author": "anonymous",
  "timestamp": 1716300000000
}
```

### Field Reference

| Field | Type | Required | Description |
|------|------|------|------|
| `id` | string | Yes | Unique identifier (`el_<timestamp>_<random>`) |
| `type` | string | Yes | Element type, see table below |
| `x` | number | Yes | X coordinate (px) |
| `y` | number | Yes | Y coordinate (px) |
| `w` | number | Yes | Width (px) |
| `h` | number | Yes | Height (px) |
| `content` | string | No | Text content / image URL |
| `style` | object | No | Style config (see above) |
| `author` | string | No | Creator |
| `timestamp` | number | No | Creation timestamp (ms) |

### Element Types

| type | Description | Meaning of content |
|------|------|-------------|
| `text` | Text block (including code) | Text content |
| `image` | Image | Image URL or base64 |
| `rect` | Rectangle | — |
| `arrow` | Arrow | — |
| `highlight` | Highlighted area | — |
| `annotation` | Annotation (Cloe/Hermes) | Annotation text |
| `emoji` | Emoji | emoji character |

---

## Canvas HTTP API

All endpoints are based at `http://localhost:19851`.

### Element CRUD

#### Get all elements

```
GET /canvas/elements
```

```bash
curl http://localhost:19851/canvas/elements
```

**Response:** `{ "elements": [...] }`

#### Add an element

```
POST /canvas/elements
Content-Type: application/json

{ "id": "el_1", "type": "text", "x": 50, "y": 50, "w": 200, "h": 100, "content": "Hello" }
```

```bash
curl -X POST http://localhost:19851/canvas/elements \
  -H "Content-Type: application/json" \
  -d '{"id":"el_1","type":"text","x":50,"y":50,"w":200,"h":100,"content":"Hello World"}'
```

**Response:** `{ "ok": true, "element": {...}, "total": 1 }`

#### Update an element

```
PUT /canvas/elements/:id
Content-Type: application/json

{ "content": "Updated text" }
```

```bash
curl -X PUT http://localhost:19851/canvas/elements/el_1 \
  -H "Content-Type: application/json" \
  -d '{"content":"Updated text","x":100}'
```

**Response:** `{ "ok": true, "element": {...} }`

#### Delete an element

```
DELETE /canvas/elements/:id
```

```bash
curl -X DELETE http://localhost:19851/canvas/elements/el_1
```

**Response:** `{ "ok": true, "total": 0 }`

#### Clear all elements

```
DELETE /canvas
```

```bash
curl -X DELETE http://localhost:19851/canvas
```

**Response:** `{ "ok": true, "total": 0 }`

### Batch Sync

```
POST /canvas/sync
Content-Type: application/json

[{ "id": "el_1", "type": "text", ... }, { "id": "el_2", ... }]
```

or:

```
POST /canvas/sync
Content-Type: application/json

{ "elements": [...] }
```

```bash
curl -X POST http://localhost:19851/canvas/sync \
  -H "Content-Type: application/json" \
  -d '[{"id":"el_1","type":"text","x":0,"y":0,"w":200,"h":100,"content":"First"},{"id":"el_2","type":"rect","x":220,"y":0,"w":100,"h":100}]'
```

**Response:** `{ "ok": true, "total": 2 }`

> ⚠️ `sync` is a full replacement — it clears existing elements.

### Mode Management

#### Get the current mode

```
GET /canvas/mode
```

```bash
curl http://localhost:19851/canvas/mode
```

**Response:** `{ "mode": "free" }` or `{ "mode": "code-review" }`

#### Set the mode

```
POST /canvas/mode
Content-Type: application/json

{ "name": "code-review" }
```

```bash
# Switch to code-review mode
curl -X POST http://localhost:19851/canvas/mode \
  -H "Content-Type: application/json" \
  -d '{"name":"code-review"}'

# Switch back to free mode
curl -X POST http://localhost:19851/canvas/mode \
  -H "Content-Type: application/json" \
  -d '{"name":"free"}'
```

**Response:** `{ "ok": true, "mode": "code-review" }`

#### Reset the mode

```
POST /canvas/mode/reset
```

```bash
curl -X POST http://localhost:19851/canvas/mode/reset
```

**Response:** `{ "ok": true, "mode": "free" }`

---

## Mode System

### Design Philosophy

The Mode system is a **plugin-based architecture** that lets the canvas present different behaviors and toolsets under different "modes".
For example, `code-review` mode automatically recognizes code elements, adds line numbers, and provides formatted review context for the LLM.

### Mode Interface

Every Mode plugin must implement the following interface:

```typescript
interface CanvasMode {
  name: string;              // Unique mode name
  inputs: string[];          // Accepted input types (e.g. ['text', 'image'])
  tools: string[];           // Available tool names (e.g. ['annotate', 'suggest'])
  onInput(elements): void;   // Fired when new elements are added
  getCloeContext(elements): string;  // Formats elements as LLM context
}
```

### Built-in Modes

#### `code-review` — Code Review Mode

- **Trigger condition**: Takes effect automatically upon switching to this mode
- **Input types**: `text`, `image`
- **Available tools**: `annotate`, `suggest`, `approve`
- **Behavior**:
  - Automatically detects code elements (via regex matching keywords like `function`, `const`, `import`)
  - Tags code elements with `_codeReview: true`
  - `getCloeContext()` outputs line-numbered code context along with a review prompt
  - Annotations returned by the LLM are rendered as JSON

### Registering a Custom Mode

```javascript
import { registerMode } from './mode-system.js';

registerMode('my-custom-mode', {
  name: 'my-custom-mode',
  inputs: ['text', 'image'],
  tools: ['annotate'],
  onInput(elements) {
    console.log('New elements:', elements);
  },
  getCloeContext(elements) {
    return JSON.stringify([...elements], null, 2);
  },
});
```

### Mode API Flow

```
POST /canvas/mode { name: "code-review" }
  → launcher.js sets currentCanvasMode
  → IPC broadcast canvas-mode-change → canvas window
  → mode-system.js switchMode()
  → subsequently pasted elements are processed via mode.onInput()
```

---

## Usage Examples

### 1. Basic Element Operations

```bash
# Add a block of text
curl -X POST http://localhost:19851/canvas/elements \
  -H "Content-Type: application/json" \
  -d '{
    "id": "code_1",
    "type": "text",
    "x": 40, "y": 30,
    "w": 600, "h": 200,
    "content": "function hello() {\n  console.log(\"Hello Canvas!\");\n}"
  }'

# Add an annotation
curl -X POST http://localhost:19851/canvas/elements \
  -H "Content-Type: application/json" \
  -d '{
    "id": "ann_1",
    "type": "annotation",
    "x": 40, "y": 240,
    "w": 300, "h": 40,
    "content": "⚠️ Consider using template literals",
    "author": "hermes"
  }'

# View all elements
curl http://localhost:19851/canvas/elements | jq .
```

### 2. Code Review Mode

```bash
# Switch to code review mode
curl -X POST http://localhost:19851/canvas/mode \
  -H "Content-Type: application/json" \
  -d '{"name":"code-review"}'

# Add code to the canvas (will be auto-detected and tagged)
curl -X POST http://localhost:19851/canvas/elements \
  -H "Content-Type: application/json" \
  -d '{
    "id": "code_2",
    "type": "text",
    "x": 40, "y": 300,
    "w": 600, "h": 150,
    "content": "const express = require(\"express\");\nconst app = express();\n\napp.get(\"/\", (req, res) => {\n  res.send(\"Hello\");\n});"
  }'

# Check the current mode
curl http://localhost:19851/canvas/mode

# Exit code review mode
curl -X POST http://localhost:19851/canvas/mode/reset
```

### 3. Batch Sync the Canvas

```bash
# Set all elements at once with a JSON array
curl -X POST http://localhost:19851/canvas/sync \
  -H "Content-Type: application/json" \
  -d '[
    {"id":"el_a","type":"text","x":20,"y":20,"w":300,"h":80,"content":"Design Review Notes"},
    {"id":"el_b","type":"rect","x":20,"y":110,"w":300,"h":200,"style":{"borderColor":"#4CAF50","borderWidth":3}},
    {"id":"el_c","type":"annotation","x":30,"y":320,"w":280,"h":30,"content":"✅ Approved","author":"cloe"}
  ]'
```

### 4. Paste Interaction (inside the Canvas Window)

Inside the Canvas BrowserWindow:

- **⌘V / Ctrl+V** — Paste clipboard content onto the canvas
  - Text → automatically creates a `text` type element
  - Image → automatically creates an `image` type element
  - Code → automatically creates a styled code block
- **Annotation rendering** — Annotations sent by Hermes appear on the canvas with a fadeIn animation

---

## File Structure

```
cloe-desktop/
├── launcher.js              # Electron main process + HTTP API server
├── canvas-preload.js        # Preload script for the Canvas Window (IPC bridge)
├── src/canvas/
│   ├── canvas.html          # Canvas page HTML entry point
│   ├── canvas.css           # Canvas styles
│   ├── canvas-renderer.js   # DOM rendering engine + paste interaction + annotation rendering
│   ├── element-model.js     # Element data structure definition
│   ├── mode-system.js       # Mode plugin system (registry, switching, context)
│   └── modes/
│       └── code-review.js   # Code Review mode implementation
├── public/canvas/           # Built canvas files (Vite output)
│   ├── index.html
│   ├── canvas.css
│   └── canvas.js
└── CANVAS-README.md         # This document
```

---

## Development

```bash
# Start the Vite dev server (hot reload for the canvas page)
npm run dev

# Start Electron (includes the canvas window and HTTP API)
npm run electron
```

The canvas page is accessed via `http://localhost:5173/canvas/index.html`,
and the HTTP API is served at `http://localhost:19851`.
