# Excalidraw Canvas Drawing

Draw on the Excalidraw canvas embedded in Cloe Desktop in real time through the HTTP API.

## Prerequisites

```bash
# Switch to Canvas mode
curl -s -X POST http://localhost:19851/canvas/show -H 'Content-Type: application/json' -d '{"mode":"canvas"}'

# Hide the overlay (return to character mode)
curl -s -X POST http://localhost:19851/canvas/hide

# Switch to Terminal mode
curl -s -X POST http://localhost:19851/canvas/show -H 'Content-Type: application/json' -d '{"mode":"terminal"}'
```

## Color Recommendations for a Dark Background

The canvas background is **fully transparent**, so dark text is nearly invisible.

- **Text color**: `#ffffff` (white) or light colors (`#dfe6e9`, `#b2bec3`)
- **Containers/lines**: saturated colors (`#a29bfe` purple, `#55efc4` green, `#fd79a8` pink, `#74b9ff` blue, `#ffeaa7` yellow); append `33` or `44` to `backgroundColor` for semi-transparency

```json
{ "strokeColor": "#a29bfe", "backgroundColor": "#a29bfe44" }
```

## Drawing Elements

```bash
curl -s -X POST http://localhost:19851/canvas/excalidraw/draw \
  -H 'Content-Type: application/json' -d '{
  "elements": [
    { "id": "box1", "type": "rectangle", "x": 200, "y": 80,
      "width": 240, "height": 80,
      "strokeColor": "#ff6b6b", "backgroundColor": "#ff6b6b33",
      "roundness": { "type": 3 } },
    { "id": "text1", "type": "text", "x": 230, "y": 107,
      "text": "Hello", "fontSize": 22, "strokeColor": "#ff6b6b",
      "boundElements": [{ "id": "box1", "type": "rectangle" }] },
    { "id": "arrow1", "type": "arrow", "x": 320, "y": 160,
      "width": 0, "height": 80, "points": [[0,0],[0,80]],
      "strokeColor": "#a8e6cf", "strokeWidth": 2 }
  ]
}'
# Returns {"ok":true,"count":3}
```

Just pass the minimal skeleton JSON -- CanvasMode automatically fills in all required fields and computes text dimensions correctly. After drawing, it automatically calls `scrollToContent({ fitToContent: true })`.

## Text Sizing & Container Auto-fit

1. **Never manually set `width`/`height` on a text element** -- Excalidraw computes these automatically
2. **Containers auto-expand**: adding `boundElements` linking a text element to a container makes the container automatically expand to `text width/height + 48px padding`, with the text auto-centered:
   ```json
   { "id": "text1", "type": "text", "text": "Text of any length",
     "boundElements": [{ "id": "box1", "type": "rectangle" }] }
   ```
   - The container only needs a minimum width/height -- it expands automatically if too small
   - Rectangle, ellipse, and diamond containers are all supported
   - Container position is set by `x`/`y`; text is automatically centered within the container

## Reading / Clearing the Scene

```bash
# Read all elements in the current scene
curl -s http://localhost:19851/canvas/excalidraw/scene

# Clear the canvas
curl -s -X DELETE http://localhost:19851/canvas/excalidraw/scene
```

## View Guidance (zoom / pan / focus / select)

Besides draw/scene, there's a set of guidance endpoints to control the canvas view (they don't change elements, only the "camera"):

```bash
# Zoom to a specific level (1 = 100%)
curl -s -X POST http://localhost:19851/canvas/excalidraw/zoom -H 'Content-Type: application/json' \
  -d '{"zoom":1.5}'

# Pan to a specific coordinate (moves the canvas center to x,y)
curl -s -X POST http://localhost:19851/canvas/excalidraw/pan -H 'Content-Type: application/json' \
  -d '{"x":200,"y":150}'

# Select specific elements (pass an array of element ids)
curl -s -X POST http://localhost:19851/canvas/excalidraw/select -H 'Content-Type: application/json' \
  -d '{"ids":["box1","arrow1"]}'

# Clear selection
curl -s -X POST http://localhost:19851/canvas/excalidraw/deselect

# Focus on specific elements (automatically zooms + pans so they fill the viewport)
curl -s -X POST http://localhost:19851/canvas/excalidraw/focus -H 'Content-Type: application/json' \
  -d '{"ids":["box1","text1"]}'

# Delete specific elements (by id; if `ids` is omitted, clears everything)
curl -s -X DELETE http://localhost:19851/canvas/excalidraw/elements -H 'Content-Type: application/json' \
  -d '{"ids":["box1"]}'
```

These endpoints are great for guiding the user's attention in a "talk while drawing" walkthrough: after drawing something, `focus` on the newly drawn element while narrating with TTS.

## Warning: Large Payloads Must Use @file

Inline curl JSON payloads over ~2000 characters get truncated by the shell, and the request silently fails (returns an empty string).

**You must write_file first, then curl -d @file:**

```python
from hermes_tools import write_file, terminal
write_file("/tmp/canvas-payload.json", json.dumps({"elements": elements}))
result = terminal("curl -s -X POST http://localhost:19851/canvas/excalidraw/draw -H 'Content-Type: application/json' -d @/tmp/canvas-payload.json")
# Always check the response
data = json.loads(result["output"])
assert data.get("ok"), f"Drawing failed: {data}"
```

## Talk While Drawing

```bash
# Draw first
curl -s -X POST http://localhost:19851/canvas/excalidraw/draw -H 'Content-Type: application/json' -d '{"elements": [...]}'

# Then speak
python3 ~/.hermes/skills/creative/cloe-desktop-action/scripts/generate_tts.py \
  --text "Narration content" --speak
```

TTS generation takes about 3 seconds, so you can send TTS first and draw the next batch while it plays. Other actions are dropped while MOSI speak is playing, but the draw endpoint is unaffected.

## Visual Layering

Layers from bottom to top:

1. `body` -- `background: transparent` (Electron transparent window)
2. `#gif-container` -- character GIF (`pointer-events: none` in canvas mode)
3. `#react-root` -- z-index 5, React overlay (black, semi-transparent background)
4. Excalidraw canvas -- transparent (only drawn shapes are visible)

> Warning: if the curl payload contains emoji or newlines, the shell will truncate the command. Use `execute_code` calling `terminal` to avoid escaping issues.

## Image Elements

The canvas supports displaying images. Process: register the file data first, then draw the image element.

### 1. Register the File

```bash
curl -s -X POST http://localhost:19851/canvas/excalidraw/files \
  -H 'Content-Type: application/json' -d '{
  "files": {
    "photo-1": {
      "mimeType": "image/jpeg",
      "data": "<base64-encoded image data>"
    }
  }
}'
# Returns {"ok":true}
```

### 2. Draw the Image Element

```bash
curl -s -X POST http://localhost:19851/canvas/excalidraw/draw \
  -H 'Content-Type: application/json' -d '{
  "elements": [
    {
      "id": "img-1",
      "type": "image",
      "x": 100,
      "y": 100,
      "width": 200,
      "height": 200,
      "fileId": "photo-1",
      "status": "saved",
      "strokeColor": "transparent",
      "backgroundColor": "transparent",
      "roundness": null
    }
  ]
}'
```

### Python Example (image file -> canvas)

```python
import base64, json
from hermes_tools import write_file, terminal

# Read and encode the image
with open("/tmp/photo.jpg", "rb") as f:
    img_b64 = base64.b64encode(f.read()).decode()

file_id = "my-photo-1"

# Register the file
files_payload = {"files": {file_id: {"mimeType": "image/jpeg", "data": img_b64}}}
write_file("/tmp/canvas-files.json", json.dumps(files_payload))
r = terminal(f"curl -s -X POST http://localhost:19851/canvas/excalidraw/files -H 'Content-Type: application/json' -d @/tmp/canvas-files.json")

# Draw the image element (dimensions must be known ahead of time, or given a default)
img_elements = [{
    "id": "img-1", "type": "image",
    "x": 100, "y": 100, "width": 300, "height": 200,
    "fileId": file_id, "status": "saved",
    "strokeColor": "transparent", "backgroundColor": "transparent"
}]
draw_payload = {"elements": img_elements}
write_file("/tmp/canvas-draw.json", json.dumps(draw_payload))
terminal(f"curl -s -X POST http://localhost:19851/canvas/excalidraw/draw -H 'Content-Type: application/json' -d @/tmp/canvas-draw.json")
```

> **Note**: image dimensions are not auto-fitted -- width/height must be specified manually.

## Chat Message Injection

Inject a message into the Chat panel (main window or standalone chat window) via the HTTP API, supporting both plain text and messages with images.

```bash
# Plain text message
curl -s -X POST http://localhost:19851/chat/message \
  -H 'Content-Type: application/json' -d '{
  "role": "assistant",
  "content": "Hello from Hermes!"
}'

# Message with an image
curl -s -X POST http://localhost:19851/chat/message \
  -H 'Content-Type: application/json' -d '{
  "role": "assistant",
  "content": "Check out this image",
  "image": "<base64-encoded image>"
}'
```

The message is sent to both the ChatPanel in the main window and the standalone chat window (if open). Images support click-to-enlarge.
