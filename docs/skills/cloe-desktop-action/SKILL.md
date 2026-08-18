---
name: cloe-desktop-action
description: "Cloe Desktop desktop character companion usage guide -- action triggers, TTS voice, Canvas drawing, embedded terminal, effects, GIF generation"
---

# Cloe Desktop Usage Guide

Cloe Desktop is a desktop character companion built on Electron + xterm.js + Excalidraw. It controls the character's actions, voice, canvas, and embedded terminal through an HTTP bridge API.

## Prerequisites

```bash
curl -s http://localhost:19851/status
# Expected: {"ws_port":19850,"http_port":19851,"clients":1}
```

## Module Index

| File | Description |
|------|------|
| [references/action.md](references/action.md) | Action triggers, TTS voice, GIF generation, screenshots |
| [references/layout.md](references/layout.md) | Character position + size control (move, scale) |
| [references/canvas.md](references/canvas.md) | Excalidraw canvas drawing API |
| [references/terminal.md](references/terminal.md) | Embedded terminal, mode switching, shortcuts |
| [references/plugin.md](references/plugin.md) | Hermes Plugin auto-trigger rules |
| [references/reminders-api.md](references/reminders-api.md) | Reminder system API (recurring reminders, pomodoro timer, global mute/pause) |
| [references/agent-sessions-api.md](references/agent-sessions-api.md) | Agent Session Tracker API (external agent registration, status notifications, TTS) |
| [references/tasks-api.md](references/tasks-api.md) | Task management API (task list, timing, completion, ordering) |
| [references/weather-api.md](references/weather-api.md) | Weather system API (configure provider, preview weather effects) |
| [references/tts-api.md](references/tts-api.md) | TTS voice API (conditional delayed playback, audio file serving) |
| [references/config-api.md](references/config-api.md) | Config API (api-config, window position/scale, plugin-rules) |

## Quick Reference

```bash
# Discover available actions
curl -s http://localhost:19851/actions

# Trigger an action
curl -s http://localhost:19851/action -d '{"action":"wave"}'

# TTS voice (recommended)
python3 ~/.hermes/skills/creative/cloe-desktop-action/scripts/generate_tts.py --text "Hello" --speak

# Canvas: show/hide
curl -s -X POST http://localhost:19851/canvas/show -H 'Content-Type: application/json' -d '{"mode":"canvas"}'
curl -s -X POST http://localhost:19851/canvas/hide

# Canvas: draw elements
curl -s -X POST http://localhost:19851/canvas/excalidraw/draw -H 'Content-Type: application/json' -d '{"elements":[...]}'

# Canvas: read/clear
curl -s http://localhost:19851/canvas/excalidraw/scene
curl -s -X DELETE http://localhost:19851/canvas/excalidraw/scene

# Character layout: get/set position and size
curl -s http://localhost:19851/character-layout
curl -s -X POST http://localhost:19851/character-layout -H 'Content-Type: application/json' \
  -d '{"position":{"x":0.7,"y":1},"size":{"scale":1.2}}'

# Reminder system: create a recurring reminder
curl -s -X POST http://localhost:19851/reminders -H 'Content-Type: application/json' \
  -d '{"name":"Drink water","mode":"interval","duration":1800,"action":"wave"}'

# Global mute toggle
curl -s -X POST http://localhost:19851/toggle-mute

# Global pause/resume reminders toggle
curl -s -X POST http://localhost:19851/toggle-global-pause

# Task management: create a task + start timing
curl -s -X POST http://localhost:19851/tasks -H 'Content-Type: application/json' -d '{"title":"Write docs"}'
curl -s -X POST http://localhost:19851/tasks/TASK_ID/start

# Weather: enable (open-meteo, no key needed) + preview rain effect
curl -s -X POST http://localhost:19851/weather/config -H 'Content-Type: application/json' -d '{"enabled":true,"provider":"open-meteo","city":"auto"}'
curl -s -X POST http://localhost:19851/weather/preview -H 'Content-Type: application/json' -d '{"weatherType":"rain"}'

# Agent Session: register an external agent session
curl -s -X POST http://localhost:19851/agent-sessions -H 'Content-Type: application/json' \
  -d '{"source":"zcode","source_label":"ZCode","title":"Running tests"}'

# Agent Session: notify turn completion (triggers TTS)
curl -s -X POST http://localhost:19851/agent-sessions/SESSION_ID/turn-end -H 'Content-Type: application/json' -d '{}'

# Agent Session: notify that user confirmation is needed (triggers TTS)
curl -s -X POST http://localhost:19851/agent-sessions/SESSION_ID/needs-decision -H 'Content-Type: application/json' -d '{}'
```

## Project Location

- Local: `~/work/cloe-desktop`
- GitHub: https://github.com/JakimLi/cloe-desktop
