# Character Layout Control (Position + Size)

Controls the character's position and scale within the desktop window. This isn't an expression/action -- it's the character's spatial layout.

## API

### Get Layout

```bash
curl -s http://localhost:19851/character-layout
# Returns: {"position":{"x":0.5,"y":1},"size":{"scale":1}}
```

### Set Layout

```bash
# Set position and size together
curl -s -X POST http://localhost:19851/character-layout \
  -H 'Content-Type: application/json' \
  -d '{"position":{"x":0.5,"y":1},"size":{"scale":1.2}}'

# Adjust position only (move right)
curl -s -X POST http://localhost:19851/character-layout \
  -H 'Content-Type: application/json' \
  -d '{"position":{"x":0.7,"y":1}}'

# Adjust size only
curl -s -X POST http://localhost:19851/character-layout \
  -H 'Content-Type: application/json' \
  -d '{"size":{"scale":1.5}}'
```

## Parameters

### position

- `x`: horizontal position, 0 = leftmost, 0.5 = centered, 1 = rightmost
- `y`: vertical position, 0 = topmost, 1 = bottommost (default)
- Implemented via CSS translate, not object-position

### size (scale)

- `scale`: scale factor, range 0.2 ~ 3.0, default 1.0
- Implemented via CSS transform scale

## Real-time Sync

- The main window responds instantly after being set (IPC broadcasts `character-position-updated` / `character-size-updated`)
- The translate offset is automatically recalculated on window resize
- The D-pad and slider in the preferences UI use the same API

## Use Cases

- The character moving itself: "move a bit to the right" -> POST position x+0.1
- The character resizing itself: enlarge/shrink for a particular scene
- Manual adjustment in preferences: D-pad direction keys + scale slider

## Defaults

```json
{"position":{"x":0.5,"y":1},"size":{"scale":1}}
```

Centered, at the bottom, original size.

## Notes

- `position` uses ratio values from 0 to 1, not pixels, so relative position is unaffected by window size changes
- `scale` has a hard limit of 0.2 ~ 3.0 (clamped on the launcher.js side)
- POST is a merge update: passing only `position` doesn't affect `size`, and vice versa
