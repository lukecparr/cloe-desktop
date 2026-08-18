---
name: cloe-android
description: Cloe Android native floating-window app — Kotlin + WebSocket + GIF animation, connects to the PC bridge across networks via Tailscale.
---

# Cloe Android — Floating Window Client

## Project Location

`~/work/cloe-android/`
GitHub: `https://github.com/JakimLi/cloe-android` (independent private repo, split out from cloe-desktop issue #5)

## Tech Stack

- **Kotlin** + Android SDK 35 (minSdk 26)
- **Glide** — GIF playback
- **Java-WebSocket** — WS client connecting to the PC bridge
- **Kotlin Coroutines** — idle loop + reconnect on disconnect
- **Tailscale** — cross-network setup (PC bridge 100.91.131.48)

## Core Architecture

```
PC (Hermes/Bridge, Tailscale IP) ←──WS──→ Android App (floating window)
  bridge: :19850 WS + :19851 HTTP          CloeService: Foreground Service
  launcher.js: listens on 0.0.0.0          Floating window: SYSTEM_ALERT_WINDOW
                                            GIF: loaded locally from APK assets
```

## Build

```bash
cd ~/work/cloe-android && ./gradlew assembleDebug --no-daemon
# APK: app/build/outputs/apk/debug/app-debug.apk (~29MB)
```

## Lessons Learned

### ⚠️ The GIF cache doesn't refresh when the APK updates

CloeService's `copyAssetToFile()` caches GIFs in `cacheDir`, with logic of `if (cacheFile.exists()) return`. After upgrading the APK, the old cache is still there, so new GIFs don't take effect.

**Workaround**: the user must **uninstall and reinstall** or **clear app data** (Settings → Apps → Cloe → Storage → Clear Data).

**Real fix**: embed `BuildConfig.VERSION_CODE` in the cache filename, or isolate the cache in a `versionCode` subdirectory, so it refreshes automatically on every upgrade.

### Generating the Gradle Wrapper

**Problem**: gradle-wrapper.jar downloaded from GitHub raw has no main manifest attribute and can't run directly.

**Solution**: you must use a full Gradle distribution to generate the wrapper.
```bash
# Download Gradle from a Tencent mirror (the official source is too slow domestically)
curl -L -o /tmp/gradle-8.11.1-bin.zip "https://mirrors.cloud.tencent.com/gradle/gradle-8.11.1-bin.zip"
unzip -q /tmp/gradle-8.11.1-bin.zip -d /tmp
# Generate the wrapper in an empty directory
cd /tmp && mkdir gw-gen && cd gw-gen && touch settings.gradle
/tmp/gradle-8.11.1/bin/gradle wrapper --gradle-version 8.11.1 --no-daemon
# Copy into the project
cp gradlew ~/work/cloe-android/
cp -r gradle/ ~/work/cloe-android/
```

**Use the Tencent mirror for wrapper properties**:
```properties
distributionUrl=https\://mirrors.cloud.tencent.com/gradle/gradle-8.11.1-bin.zip
validateDistributionUrl=false
```

### Domestic Maven Mirrors

`settings.gradle.kts` prioritizes Alibaba Cloud mirrors:
```kotlin
maven { url = uri("https://maven.aliyun.com/repository/google") }
maven { url = uri("https://maven.aliyun.com/repository/central") }
maven { url = uri("https://maven.aliyun.com/repository/public") }
google()
mavenCentral()
```

### Required Config Files

1. **`gradle.properties`**: `android.useAndroidX=true` — otherwise AndroidX dependencies like Glide throw errors
2. **`local.properties`**: `sdk.dir=/Users/lijian/Library/Android/sdk`
3. **`app/build.gradle.kts`**: must declare `plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }` at the top of the file — it's not enough to declare `apply false` only in root

### Common Kotlin Compile Errors

- `Unresolved reference 'Intent'` → missing `import android.content.Intent`
- `Unresolved reference 'File'` → missing `import java.io.File`
- `'onBind' overrides nothing` → missing `import android.os.IBinder`
- When using `JsonReader`, don't write `android.util.JsonReader` — just `import android.util.JsonReader` (already built in)

### Bridge Changed to 0.0.0.0

In `~/work/cloe-desktop/launcher.js`, the host for the WS server and HTTP server was changed from `127.0.0.1` to `0.0.0.0` — otherwise the Tailscale virtual network interface can't reach it. Probe detection (`waitForBridge`) stays on `127.0.0.1`.

### ⚠️ The idle loop interrupts reaction actions actively sent by Hermes

**Problem**: `playAction()` has `if (action == lastAction) return` logic — if idle happens to randomly play kiss, and Hermes/curl immediately sends kiss actively afterward, the Android side just skips it. Even without a repeat, the reaction reverts to idle after 3 seconds, so the GIF gets overwritten before it finishes playing.

**Fix (committed 2026-05-04)**: added an `isReaction` parameter to `playAction`:
- `isReaction=true` (default): actions triggered by Hermes/curl, **forced to play, never skipped**, 4-second cooldown
- `isReaction=false`: idle auto-triggered pulses, repeats still skipped, 3-second cooldown
- In `scheduleNextIdle()`, after idle finishes playing, manually cancel + delay + reschedule, instead of recursing directly

```kotlin
private fun playAction(action: String, isReaction: Boolean = true) {
    if (!pathByAction.containsKey(action)) return
    if (action == lastAction && !isReaction) return  // dedupe for idle, not for reaction
    lastAction = action
    loadGif(action)
    if (action != "working") {
        idleJob?.cancel()
        idleJob = scope.launch {
            delay(if (isReaction) 4000L else 3000L)
            if (!isWorking) scheduleNextIdle()
        }
    }
}
```

### GIF Asset Strategy

**Bundled into APK assets** (recommended) rather than fetched over the network:
- Each GIF is ~2.5-2.9MB, 10 of them total 27MB
- `copyAssetToFile()` copies to `cacheDir` in `onCreate`, and Glide loads via `file://`
- Advantages: instant open, works offline, uses no network
- Total APK size ~29MB (including GIFs + dependencies)
- **New actions sync via "pull from PC"**, no repackaging needed (unless you want to bake them into assets)

### Starting Tailscale (Intel Mac, brew install)

⚠️ **Must use the brew userspace-networking version, not the Tailscale desktop app!**
The Tailscale desktop app (kernel-mode tun) is incompatible with Node.js on macOS: TCP ports connect fine but HTTP/WS requests get RST'd, so the Android connection is fake even when it looks connected. The brew version, running a userspace network stack, doesn't have this problem.

If you accidentally installed the desktop version, stop it first:
```bash
sudo tailscale down
sudo launchctl unload /Library/LaunchDaemons/io.tailscale.ipn.macsys.tailscaled.plist
```

Then start the brew version:
```bash
# The brew-installed tailscaled doesn't run under launchd, start it manually
tailscaled --tun=userspace-networking --socket=/tmp/tailscaled.sock --state=/tmp/tailscaled.state &
TAILSCALE_USE_WIP_STATE=1 tailscale --socket=/tmp/tailscaled.sock up
# The auth URL will print to the terminal — open it on your phone's browser to log in
# IP: tailscale --socket=/tmp/tailscaled.sock ip -4
```

Tailscale is a split tunnel — it only routes the `100.x.x.x` subnet and doesn't affect other traffic.

### Troubleshooting a Fake "Connected" State on Android

When Android shows "connected" but isn't receiving events:
1. `curl -s http://127.0.0.1:19851/status` — check the `clients` count (the Electron renderer occupies 1 by itself, so Android connected should show ≥2)
2. `curl -s http://127.0.0.1:19851/action -d '{"action":"working"}'` — check the `sent_to` count
3. If clients=1 but Android shows connected → the IP is wrong or there's a Tailscale version issue
4. You can also test from the Tailscale IP: `curl -s http://100.91.131.48:19851/status` (the brew version should return JSON, the desktop version returns an empty reply)

## File Structure

```
cloe-android/
├── app/src/main/
│   ├── java/com/cloe/android/
│   │   ├── MainActivity.kt          # Settings page: IP input, permission requests, connect/disconnect
│   │   └── CloeService.kt           # Core: floating window + WS + GIF playback + idle loop
│   ├── assets/
|   │   ├── gifs/*.gif               # 13 action GIFs (copied from cloe-desktop)
│   │   └── audio/*.mp3              # Voice files
│   ├── res/
│   │   ├── layout/activity_main.xml # Settings page UI
│   │   └── values/styles.xml
│   └── AndroidManifest.xml
├── gradle/wrapper/                  # gradle-wrapper.jar + properties
├── local.properties                 # SDK path
├── gradle.properties                # android.useAndroidX=true
├── settings.gradle.kts              # Alibaba Cloud mirror
├── build.gradle.kts                 # root: AGP + Kotlin plugin declarations
└── app/build.gradle.kts             # app: dependencies + build config
```

## Action Mapping (matches Electron)

| Action | GIF | Trigger |
|--------|-----|---------|
| smile/kiss/nod/wave/think/tease/speak/shake_head/working/blink/clap/shy/yawn/laugh/pout/sigh | same-named .gif | WS action message |

### Speak Animation + Audio Sync (Android)

On Android, speak must be audio-visually synced — **the mouth can't move without sound**.

**Message format**:
```json
{"action":"speak","audio":"doing"}           // pre-recorded voice
{"action":"speak","audio_url":"http://..."}   // TTS voice
```

**Audio source URL rules**:
- Both pre-recorded and TTS go through the unified `/tts/` route: `http://<host>:19851/tts/<name>.mp3`
- The bridge serves `~/.cloe/audio_cache/` — pre-recorded files (doing.mp3, done.mp3) need to be copied into that directory ahead of time
- **Don't create a new `/audio/` route, just reuse `/tts/`**

**⚠️ Cross-device URL substitution**: `localhost`/`127.0.0.1` in `audio_url` must be replaced with `host` (the PC IP configured when Android connects). In `audioName` mode, just concatenate `host` directly.

**Sync approach (v2 — natural experience)**:
1. On receiving speak → play the smile GIF as a transition (**not speak.gif!**), download the audio in the background
2. Once the audio download+prep completes (`onPrepared`) → **simultaneously** switch to speak.gif + start playing the sound
3. During audio playback → the `isSpeaking=true` lock is active
4. On playback complete → unlock, resume the idle loop

> ⚠️ **v1 approach (deprecated)**: play speak.gif immediately while waiting for the audio download. Problem: on a slow network, the mouth moves with no sound, which is awkward.

**Audio caching (⚠️ file integrity must be verified)**:
- Download to `cacheDir/audio/`, only skip the download if the file exists and `length() > 0`
- **0-byte files must be deleted and re-downloaded** (a previous 404 response could leave behind an empty cache, causing MediaPlayer setDataSource to crash)
- Must check HTTP responseCode == 200 before downloading; throw immediately on non-200

**Pre-recorded audio deployment**:
- Pre-recorded files originally live at `~/.cloe/audio/`, but the bridge only serves `~/.cloe/audio_cache/`
- **Must copy manually**: `cp ~/.cloe/audio/*.mp3 ~/.cloe/audio_cache/`
- Otherwise: 404 → Android caches a 0-byte empty file → playback still fails even after a later fix

**State protection**:
- `isSpeaking` lock: while speaking, idle/wave/working don't interrupt; a new proactive action will call `stopSpeaking()` first, then play
- On download failure/playback error → automatically resume idle, never gets stuck
- `onDestroy` → `releaseMediaPlayer()`

**Debugging**:
```bash
# Check whether the bridge serves the pre-recorded audio (unified through /tts/)
curl -s -o /dev/null -w "%{http_code}" http://localhost:19851/tts/doing.mp3
# Expect 200; a 404 means the pre-recorded file wasn't copied to audio_cache

# Inspect the Android-side cache (to debug empty-file issues)
adb shell run-as com.cloe.android ls -la cache/audio/

# Clear a bad cache entry
adb shell run-as com.cloe.android rm cache/audio/doing.mp3

# View Android-side logs
adb logcat -d | grep CloeService
# Look for: Downloading audio / Audio downloaded / Audio playing / Audio error
```

**⚠️ MediaPlayer downloads on an IO thread, plays on the Main thread**. `setDataSource` must use a local file path (`File.absolutePath`), not a URL directly. A 0-byte file will crash setDataSource (with a null error message).

## Floating Window Interaction

- **Expanded**: shows the GIF animation, tap or receive an action → collapses to a dot
- **Collapsed**: pink dot (50dp), tap → expands
- **Drag**: both expanded and collapsed states support dragging
- **idle loop**: random switch every 8-15 seconds, paused in working mode

### ⚠️ Gravity.END Reverses Drag Direction

When `WindowManager.LayoutParams` uses `Gravity.END`, `p.x` is the offset **from the right edge**, not an absolute coordinate. So **dx must be negated** when dragging:

```kotlin
// With Gravity.TOP | Gravity.END: negate dx for horizontal dragging, dy stays as-is for vertical
p.x -= dx; p.y += dy
```

If written as `p.x += dx`, the drag direction will be reversed from the finger's movement.

## Sending the APK via Feishu

**⚠️ Feishu's `im/v1/files` upload with file_type=stream is capped at 30MB.** 14 GIFs (200px/10fps) packaged together come to about 29MB, just under the limit. If the GIFs are the high-res version (400px/10fps), the APK comes to about 40MB, and the GIFs need to be compressed first.

### GIF Compression Approach When the APK Exceeds 30MB

Heavily compress with ffmpeg (200px wide + 8fps), bringing 14 GIFs from 37MB down to 10MB, and the APK from 40MB down to 29MB:

```bash
# Compress all GIFs into a temp directory
mkdir -p /tmp/gifs_tiny
cd ~/work/cloe-android/app/src/main/assets/gifs/
for f in *.gif; do
  ffmpeg -y -i "$f" -vf "fps=8,scale=200:-1:flags=lanczos" -loop 0 /tmp/gifs_tiny/"$f" 2>/dev/null
done

# Back up the originals, swap in the compressed versions
cp *.gif /tmp/gifs_original/   # first-time backup
cp /tmp/gifs_tiny/*.gif .

# Repackage
cd ~/work/cloe-android && ./gradlew assembleDebug --no-daemon

# After packaging, restore the high-res originals (keep the high-res versions in source)
cp /tmp/gifs_original/*.gif ~/work/cloe-android/app/src/main/assets/gifs/
```

## Sending the APK via Feishu

**⚠️ Feishu's file upload is capped at 30MB; an APK with 14 GIFs comes to about 40MB, which exceeds it.**

**Solution**: compress the GIFs with ffmpeg to 200px/8fps before packaging (37MB→10MB), then restore the originals after packaging.

```bash
# 1. Compress GIFs into a temp directory
for f in app/src/main/assets/gifs/*.gif; do
  ffmpeg -y -i "$f" -vf "fps=8,scale=200:-1:flags=lanczos" -loop 0 /tmp/gifs_tiny/$(basename $f) 2>/dev/null
done

# 2. Back up the originals, swap in the compressed versions
cp -r app/src/main/assets/gifs/ /tmp/gifs_original/
cp /tmp/gifs_tiny/*.gif app/src/main/assets/gifs/

# 3. Package
./gradlew assembleDebug --no-daemon

# 4. Restore the originals (compressed versions are only used inside the APK)
cp /tmp/gifs_original/*.gif app/src/main/assets/gifs/
```

## Sending the APK via Feishu

**⚠️ Feishu's `im/v1/files` file_type=stream is capped at 30MB!** The original-quality APK (14 GIFs) comes to about 43MB, which exceeds it.

### Option 1: Compress the GIFs (⚠️ must preserve transparency)

```bash
# Correct method: palettegen + paletteuse to preserve the alpha channel
for f in public/gifs/*.gif; do
  name=$(basename "$f")
  ffmpeg -y -i "$f" -vf "fps=8,scale=200:-1:flags=lanczos,palettegen=stats_mode=diff" /tmp/pal.png
  ffmpeg -y -i "$f" -i /tmp/pal.png -lavfi "[0:v]fps=8,scale=200:-1:flags=lanczos[x];[x][1:v]paletteuse" /tmp/gifs_tiny/"$name"
done
```

**❌ Wrong method (loses transparency, shows a white background on Android):**
```bash
ffmpeg -y -i input.gif -vf "fps=8,scale=200:-1" output.gif  # no palette → white background!
```

After compression, the 14 GIFs drop from 37MB to 17MB, and the APK comes to about 29MB, just under the limit.

**⚠️ Compression is only for packaging the APK — keep the originals in the source assets. Remember to restore them after packaging.**

### Option 2: Other Transfer Methods

Feishu cloud docs upload, AirDrop, ADB install, etc.

## Chroma Key Frame-to-Frame Flicker Fix

GIFs with large motion (like laugh) have inconsistent chromakey edges between frames, causing background flicker.

**Fix**: use PIL to process semi-transparent pixels (alpha 30-150) frame by frame, removing residual green, and apply morphological dilation to expand the foreground edge.

Can be delegated to Claude Code for deep processing: `claude -p 'fix laugh.gif chromakey flicker' --effort max --allowedTools 'Read,Edit,Bash'`

**Note**: `file_type` only supports `stream/pdf/doc/xls/ppt`, not `apk` or `octet-stream`.
