# Action Triggers, TTS Voice, GIF Generation

Discover and trigger the Cloe desktop character's expression/action animations through the HTTP API.

## Dynamically Discover Available Actions

**Do not hardcode the action list.** Fetch it live via the API:

```bash
curl -s http://localhost:19851/actions
curl -s http://localhost:19851/action-sets
```

`GET /actions` returns a list of actions with fields such as `name`, `description`, `hookNames`, `special`, etc.

## Triggering an Action

```bash
curl -s http://localhost:19851/action -d '{"action":"<ACTION_NAME>"}'
```

The action plays for about 3 seconds, then automatically returns to the idle loop.

## System Actions

| Action | Description |
|------|------|
| `working` | Typing on a keyboard, locks the "working" mode |
| `idle` | Returns to the idle loop |
| `wave` | Greeting for a new session |
| `kiss` | Session ended |

## Voice Action (speak)

> **TTS strategy in Hermes voice conversation mode**: Hermes's built-in TTS (frontend/backend) causes duplicate playback -- the frontend splits by sentence and calls TTS multiple times, and the backend calls it once per turn. **Voice output should always use `generate_tts.py --speak`** (via the Cloe Desktop bridge), and not rely on Hermes's built-in TTS. See the "triple playback pitfall" section of the `hermes-voice-setup` skill for details.
>
> **Voice conversation cadence**: the user speaks via Ctrl+B voice input -> Whisper transcribes -> the agent replies -> the agent manually calls `--speak` to play the voice. Call `--speak` only once per conversation turn, and don't also trigger Hermes's automatic TTS.

### Method 1: Dynamic TTS (recommended)

Pipeline: `generate_tts.py` generates an MP3 -> saved to `~/.cloe/audio_cache/` -> served by the bridge's `/tts/` route -> played via speak.

```bash
# Generate + automatically trigger desktop speak playback
python3 ~/.hermes/skills/creative/cloe-desktop-action/scripts/generate_tts.py \
  --text "Text to speak" --speak

# Generate audio only (prints the MP3 path to stdout)
python3 ~/.hermes/skills/creative/cloe-desktop-action/scripts/generate_tts.py \
  --text "Text to speak"

# Specify an output path
python3 ~/.hermes/skills/creative/cloe-desktop-action/scripts/generate_tts.py \
  --text "Text to speak" --output /tmp/custom.mp3

# Force a specific provider
python3 ~/.hermes/skills/creative/cloe-desktop-action/scripts/generate_tts.py \
  --text "Text to speak" --provider cosyvoice
```

stdout only prints the MP3 file path; logs go to stderr.

#### TTS Configuration

Config file: `~/.cloe/tts-config.json`

```json
{
  "provider": "mosi",
  "mosi": {
    "api_key": "***",
    "voice_id": "2036257587296473088",
    "url": "https://studio.mosi.cn/v1/audio/tts"
  },
  "cosyvoice": {
    "api_key_env": "BAILIAN_API_KEY",
    "model": "cosyvoice-v1",
    "voice": "longmiao"
  }
}
```

- `mosi` -- MOSI cloud TTS (fast, ~3s) **<- default**
- `cosyvoice` -- Alibaba Cloud CosyVoice (multiple voices available)

#### MOSI API Call Convention

The script already wraps this; you generally don't need to call it manually. If you do:

```python
headers = {
    "Authorization": f"Bearer {api_key}",  # must use Bearer auth
    "Content-Type": "application/json",
}
payload = {
    "model": "moss-tts",        # required
    "text": text,
    "voice_id": voice_id,
    "sampling_params": {"temperature": 1.7, "top_p": 0.8, "top_k": 25},
}
```

#### Playback Notes

- Use complete, coherent sentences for TTS text; avoid ellipses/tildes
- MOSI returns WAV; the script automatically converts to MP3 (Electron's `new Audio()` doesn't play WAV completely)
- To manually speak existing audio: `curl -s http://localhost:19851/action -d '{"action":"speak","audio_url":"http://localhost:19851/tts/<FILENAME>.mp3"}'`
- **Other actions are dropped while speak is playing, and another speak call can override it** -- merge long content into a single TTS call sent all at once

### Method 2: Pre-recorded Voice (`audio` field)

```bash
curl -s http://localhost:19851/action -d '{"action":"speak","audio":"doing"}'
```

Pre-recorded files live in `~/.cloe/audio_cache/`. Existing ones: `doing.mp3`, `done.mp3`.
To add a new voice line: generate via TTS -> convert to mp3 with `ffmpeg` -> place in `~/.cloe/audio_cache/`.

### Method 3: data URL (short audio, <5s)

Base64-encode it and pass `data:audio/mpeg;base64,...`; the curl limit is about 128KB.

## Generating a New Action GIF

Full pipeline: reference image -> AI video -> chromakey -> transparent GIF.

```bash
# Generate a single action (default green screen, output to ~/.cloe/gifs/{action}.gif)
python3 ~/.hermes/skills/creative/cloe-desktop-action/scripts/generate_gif_v2.py \
  --action pout \
  --prompt "She pouts slightly, with a cute, sulky expression, body staying still. Cinematic, high definition."

# Blue screen mode (works better for black hair)
python3 ~/.hermes/skills/creative/cloe-desktop-action/scripts/generate_gif_v2.py \
  --action pout \
  --prompt "..." --chromakey blue

# Specify a reference image
python3 ~/.hermes/skills/creative/cloe-desktop-action/scripts/generate_gif_v2.py \
  --action wave \
  --prompt "..." --reference ~/.cloe/references/default.png
```

The script automatically handles: compressing the reference image -> padding it wider -> generating video via Bailian wan2.7-i2v -> ffmpeg chromakey -> removing color fringing -> transparent GIF -> copying to `~/.cloe/gifs/`.

### Registering the Action After Generation (the script does NOT register it automatically!)

In the active set (usually `default`), **three** places need to be updated:

1. **`animations`** -- maps the action name to the GIF path:
   ```json
   "pout": "gifs/pout.gif"
   ```
2. **`actionInfo`** -- action description metadata:
   ```json
   "pout": { "description": "Pout", "descriptionEn": "Pout" }
   ```
3. **`actionMap`** -- maps hook names to action names (**required for hook-triggered actions, or the trigger won't fire!**):
   ```json
   "pout": "pout"
   ```
   > If the `actionMap` entry is omitted, the action will show up in the `/actions` list but won't play when triggered by a hook.

After registering:
- Cloe automatically watches for file changes and reloads, no restart needed
- Verify: `curl -s http://localhost:19851/actions` to check the new action
- Test: `curl -s http://localhost:19851/action -d '{"action":"pout"}'`

> Warning: Just copying the GIF to `~/.cloe/gifs/` is not enough -- you must also update all three fields in action-sets.json.

**Prefer the auto-registration script** (avoids mistakes from manually editing JSON):
```bash
python3 ~/.hermes/skills/creative/cloe-desktop-action/scripts/register_action.py \
  --action pout \
  --description "Pout" \
  --description-en "Pout" \
  --trigger hook   # hook or idle
```
The script automatically adds the animations + actionInfo + actionMap entries, and handles `idlePlaylist` (adds the action to it when trigger=idle).

### Prompt Writing Tips

- **Keep the body still**: only describe subtle head/upper-body movements (except for large-motion actions like dancing)
- **Make sure the character stays fully in frame**: the script has a built-in `pad_reference_to_wider()` that automatically pads a portrait reference image on both sides with the chroma color to a 0.75 aspect ratio (1482x2829 -> 2121x2829); the final GIF output is 400x534
- **Chroma color consistency**: the padding color must match `--chromakey`. When using `--chromakey blue`, the script automatically calls `convert_chroma_color()` to convert the green-screen reference to blue screen before padding
- **Avoid Bailian's content review**: don't write "pure green background" in the prompt (triggers `Green net check`). `prompt_extend=False` is already disabled. Avoid sensitive words like "chest" or "hands" in the prompt
- **Cinematic, high definition**: improves generation quality
- Duration is typically 3-5 seconds

### Clarity Optimization Tips

The root cause of blurry GIFs is **over-compressing the reference image + video resolution being too low**. Key parameters in the generation pipeline:

| Parameter | Recommended value | Notes |
|------|--------|------|
| `compress_image` long-edge cap | **1920px** | after padding, the reference image is larger (1482->2121px wide); compressing to 1280 leaves the character at only 670px, causing blur |
| Video resolution | **1080P** | 720P output doesn't give the character enough pixels; 1080P noticeably improves GIF clarity |
| pad target_ratio | **0.75** | 1.0 (square) wastes too much area, diluting the character's effective pixels; 0.75 balances extra space against clarity |
| ffmpeg scale | `400:-1` | fixed 400px width, height scales proportionally (0.75 -> 533px) |

> Warning: **The three parameters are linked** -- changing the pad ratio requires reconsidering the compression cap and video resolution together. The larger the padded area, the smaller the character becomes after compression, and the more video resolution matters.

> Warning: **Temp file cleanup order** -- in `generate_video()`, you must `open(compressed_path)` and read it into memory as base64 *before* calling `os.unlink()` to delete the temp file. Doing it the other way around causes a FileNotFoundError.

### Window Size and GIF Cropping

GIF dimensions vary with the generation ratio (old portrait: 400x764, new 0.75 ratio: 400x534). The window's `BASE_WIDTH` and `BASE_HEIGHT` must account for three factors:

1. **GIF pixel dimensions** (400px width is the baseline)
2. **characterPosition.x** (when the character is positioned to the right, the space on the right = width * (1-x), which must exceed the GIF's display width)
3. **characterSize.scale** (at scale=1.2, the character's actual width = 400*1.2 = 480px)

Current config: `BASE_WIDTH=640, position.x=0.65, scale=1.2` -> right-side space = 640*0.35 = 224px > 480px (not enough! In practice this is compensated for by the GIF's narrower aspect ratio).

### GIF Caching Issue (Chromium `file://` caching)

The packaged app loads GIFs via the `file://` protocol. Chromium caches images by full URL, so when `~/.cloe/gifs/xxx.gif` is replaced on disk, the URL stays the same and Chromium returns the cached old version.

**Solution** (already implemented in renderer.js): `preloadGif()` appends a `?v=N` version number to the URL, and increments `_gifVersion++` on every `set-config` (action-sets hot reload) to force a fresh load from disk.

### Generation Script Pitfalls

**1. Bailian content review ("Green net check failed")**
- Green-screen reference image + prompt containing words like "chest"/"hands" -> triggers text review
- Fix: use `--chromakey blue` (the script automatically converts the green-screen reference to blue screen), `prompt_extend=False` (disables auto-expansion to avoid introducing sensitive words), and avoid sensitive descriptions in the prompt

**2. Green screen -> blue screen conversion**
- `default.png` has a green-screen background. With `--chromakey blue`, the script automatically calls `convert_chroma_color()` to convert the green background to blue, then pads both sides with blue, keeping the chroma color consistent across the whole image
- Chromakey is not done at the ffmpeg stage (it would incorrectly remove white clothing); it's handled entirely by Python post-processing

**3. Clarity optimization**
- `compress_image` long-edge cap raised from 1280 to 1920 (after padding the image is larger; 1280 would shrink the character to only 670px)
- Video resolution raised from 720P to 1080P (720P output was too blurry)
- pad ratio 0.75 (not 1.0 -- a square wastes too much area, leaving too few effective pixels on the character)
- `prompt_extend=False` (disables Bailian's automatic prompt expansion, avoiding sensitive words that trigger review)

**4. Reference image padding (prevents the character's motion from leaving the frame)**
- The original reference image is 1482x2829 (ratio 0.52, portrait), and the character moves out of frame as soon as they raise a hand
- Pad to a 0.75 ratio (2121x2829), filling both sides with the chroma color, giving the character room to move
- The padded sides are removed along with the background during chromakey

**5. Temp file cleanup order**
- pad -> compress -> read as base64 -> only then delete the temp files
- Read into memory first, then clean up, to avoid a FileNotFoundError from deleting files too early

**6. Warning: AI video background drift (the most subtle issue)**
- wan2.7-i2v keeps the chroma-color background from the reference image in the first frame, but in later frames the model **improvises** and may replace the background with a different scene (e.g. sunset, indoors, etc.)
- Symptom: the blue background looks fine in the first few frames, but after frame 20 it turns warm orange -> chromakey can't remove it -> background residue remains in the GIF
- Root cause: the prompt doesn't explicitly constrain the background to stay a solid color, so the model decides the chroma screen is "unrealistic" and changes it
- **Fix**: the script automatically appends a background constraint to the end of the prompt (blue screen adds "solid blue background"; green screen adds "solid monochrome background" to avoid triggering review)
- Verification method: extract frames 1/25/49 of the video and check whether the chroma-color proportion stays stable (>70% means the background hasn't drifted)

### Chromium `file://` Image Caching (packaged-build GIFs don't update)

The packaged build loads GIFs via the `file://` protocol. Chromium caches images by full URL, so if the file on disk is replaced but the URL stays the same, it returns the cached old image. `src/renderer.js` already has cache-busting built in: `preloadGif()` appends a `?v=N` parameter, and `_gifVersion++` happens on `set-config`.

After regenerating a GIF, you also need to update the old files in both `public/gifs/` and `dist/gifs/`, otherwise a fresh install will copy the old version via `seedPackagedDataDir`.

### Chromakey Incorrectly Removing White Clothing (the trickiest matting issue)

**Symptom**: the GIF background becomes transparent, but large transparent holes appear in the character's white clothing.

**Root cause**: in the AI video, lighting from the chroma-color background bleeds onto the character, tinting white clothing with a blue/green cast. ffmpeg chromakey matches by color and can't distinguish "white clothing contaminated by chroma-color lighting" from "background color" -- raising similarity cleans up the background but removes white clothing, lowering it keeps the white clothing but leaves background residue.

**Key data** (blue-screen heart action test):
| similarity | total transparent | transparent within character area | notes |
|-----------|--------|-----------|------|
| 0.30 | 85% | **62%** | white clothing almost entirely gone |
| 0.20 | 69% | 22% | lots of background residue |
| 0.15 | 69% | 22% | same as above |

Green screen tests were even worse -- at sim=0.12, 99.8% of the character area was transparent.

**Current approach**: don't do chromakey at the ffmpeg stage (only palettegen + paletteuse); background removal is handled entirely by Python post-processing (which already has chroma-color detection + fringe-removal logic). The Python post-processing's chroma-color detection threshold is more precise and can distinguish solid chroma color from clothing contaminated by lighting.

> Warning: if Python post-processing still incorrectly removes white clothing, a mask-based approach using the reference image may be needed: generate a precise mask from the first frame (the pure reference image), and only process the background outside the mask in subsequent frames.

### Admin UI API (requires the bridge service to be running)

```bash
# Async generation, returns 202 + taskId
curl -s -X POST http://localhost:19851/action-sets/default/generate-action \
  -H "Content-Type: application/json" \
  -d '{"name":"pout","prompt":"...","duration":5}'

# Query task status
curl -s http://localhost:19851/generation-tasks/<taskId>
```

Automatically handles: generating the GIF -> updating action-sets.json -> broadcasting to the renderer.

## Walk Action (walk_right / walk_left)

- `walk_right` and `walk_left` are two separate GIF files; `walk_left` is a mirror image
- The walk action has special logic (window movement + GIF switching + edge detection + direction switching)
- After GIF generation, the first few frames (standing up/getting-ready motion) need to be trimmed (analyze the centroid Y to determine the cut point)
- Generating the mirror: `frames_left = [f.transpose(Image.FLIP_LEFT_RIGHT) for f in frames]`

## Screenshotting a Transparent Window

Cloe Desktop is an Electron transparent overlay window, so `screencapture -R` can't capture it. You must use PyObjC:

```python
import Quartz
from Foundation import NSURL

windows = Quartz.CGWindowListCopyWindowInfo(Quartz.kCGWindowListOptionAll, Quartz.kCGNullWindowID)
for w in windows:
    owner = w.get('kCGWindowOwnerName', '')
    if 'Cloe' in owner or 'Electron' in owner:
        bounds = w.get('kCGWindowBounds', {})
        x, y, ww, h = bounds['X'], bounds['Y'], bounds['Width'], bounds['Height']
        # Use kCGWindowListOptionOnScreenOnly to capture all visible layers in the region
        image = Quartz.CGWindowListCreateImage(
            Quartz.CGRectMake(x, y, ww, h),
            Quartz.kCGWindowListOptionOnScreenOnly,
            Quartz.kCGNullWindowID,
            Quartz.kCGWindowImageNominalResolution)
        if image:
            url = NSURL.fileURLWithPath_('/path/to/output.png')
            dest = Quartz.CGImageDestinationCreateWithURL(url, 'public.png', 1, None)
            Quartz.CGImageDestinationAddImage(dest, image, None)
            Quartz.CGImageDestinationFinalize(dest)
            break
```

> Warning: you must use `kCGWindowListOptionOnScreenOnly` -- `kCGWindowListOptionIncludingWindow` returns a blank image for transparent windows.

## Chat Message Injection

Inject a message (text + image) into the chat window via `/chat/message`; injected messages appear in the chat box.

```bash
# Images are too large (~6MB base64) to pass as a command-line argument, so build the JSON file with python, then curl -d @file
base64 -i /path/to/photo.png > /tmp/img_b64.txt
python3 -c "
import json
with open('/tmp/img_b64.txt','r') as f: b64=f.read().strip()
json.dump({'role':'assistant','content':'Description text','image':b64}, open('/tmp/inject.json','w'))
"
curl -s -X POST http://localhost:19851/chat/message \
  -H 'Content-Type: application/json' \
  -d @/tmp/inject.json
# Returns {"ok":true}
```

- Clicking an image opens a new system window via `window.open` (centered on black) to view it directly
- **Don't build a custom modal** -- don't implement a `previewImage` state, `chat-image-modal` overlay, etc. -- this was tried before and rejected

## Notes

- Leave at least 3-5 seconds between actions, or they get interrupted too quickly
- Actions have no effect when `clients=0`
- `action-sets.json` and `plugin-rules.json` support hot reload (rules have a 5-second TTL cache)
- Hooks in `plugin.yaml` do not support hot reload -- you must restart the Hermes process after changes
