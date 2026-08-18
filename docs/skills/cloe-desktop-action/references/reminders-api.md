# Reminder System API

Create and manage timed reminders (drink water, pomodoro timer, custom interval/countdown) through the Bridge API.

## Data Model

```json
{
  "id": "drink-water",
  "name": "Drink water",
  "mode": "interval",          // interval=recurring, countdown=pomodoro
  "duration": 1800,            // seconds
  "enabled": true,
  "auto_start": true,          // automatically start the next round after dismiss
  "tts": true,                 // play voice when triggered
  "action": "wave",            // character action when triggered (empty string = no action)
  "break_duration": 0,         // countdown break duration (seconds)
  "total_rounds": 0,           // countdown total rounds (0 = unlimited)
  "status": "running",         // idle/running/triggered/paused/completed
  "round": 0,
  "phase": "work",             // work/break (countdown mode)
  "trigger_at": "2026-07-14T12:00:00.000Z"
}
```

## API Endpoints

### List All Reminders

```bash
curl -s http://localhost:19851/reminders
```

### Create a Reminder

```bash
# Recurring reminder: drink water every 30 minutes, wave + voice when triggered
curl -s -X POST http://localhost:19851/reminders -H 'Content-Type: application/json' \
  -d '{"name":"Drink water","mode":"interval","duration":1800,"action":"wave"}'

# Pomodoro: 25 min work + 5 min break, 4 rounds, clap + voice when triggered
curl -s -X POST http://localhost:19851/reminders -H 'Content-Type: application/json' \
  -d '{"name":"Focus","mode":"countdown","duration":1500,"break_duration":300,"total_rounds":4,"action":"clap","auto_start":true}'

# Countdown: one-time reminder in 15 minutes
curl -s -X POST http://localhost:19851/reminders -H 'Content-Type: application/json' \
  -d '{"name":"Meeting time","mode":"countdown","duration":900,"auto_start":false}'
```

### Update a Reminder (change timing and restart)

```bash
# Change "Drink water" to every 15 minutes, start:true restarts the timer immediately
curl -s -X POST http://localhost:19851/reminders -H 'Content-Type: application/json' \
  -d '{"id":"drink-water","name":"Drink water","mode":"interval","duration":900,"start":true,"action":"wave"}'
```

### Control Reminder State

```bash
# Clear the current trigger (starts the next round if auto_start=true, otherwise goes idle)
curl -s -X POST http://localhost:19851/reminders/drink-water/dismiss

# Stop and disable
curl -s -X POST http://localhost:19851/reminders/drink-water/stop

# Toggle enabled/disabled
curl -s -X POST http://localhost:19851/reminders/drink-water/toggle

# Pause (records the remaining time)
curl -s -X POST http://localhost:19851/reminders/drink-water/pause

# Resume (continues with the remaining time)
curl -s -X POST http://localhost:19851/reminders/drink-water/resume
```

### Delete a Reminder

```bash
curl -s -X DELETE http://localhost:19851/reminders/drink-water
```

## Global Controls

### Global Mute

Toggles global voice mute. When on, TTS for all reminders and Agent Sessions is suppressed. Toggling via the keyboard shortcut shows a desktop notification.

```bash
# Check mute state
curl -s http://localhost:19851/mute-state
# {"muted": false}

# Toggle mute
curl -s -X POST http://localhost:19851/toggle-mute
# {"muted": true}
```

### Global Pause / Resume Reminders

Pauses all "running" reminders (does not affect already-stopped ones). Calling it again resumes all reminders that were globally paused.

```bash
# Check pause state
curl -s http://localhost:19851/global-pause-state
# {"paused": false}

# Toggle pause/resume
curl -s -X POST http://localhost:19851/toggle-global-pause
# {"paused": true, "count": 3}  -- paused 3 reminders
```

> Note: global pause only pauses reminders with status=running -- manually paused or stopped reminders are unaffected. Resuming only resumes the batch that was globally paused.

## Trigger Effects

When a reminder fires:
1. A frosted-glass card pops up on the desktop (directly below the character), showing the reminder name and action buttons
2. The character plays the action GIF specified by `action`
3. If `tts=true`, voice is generated and played via MOSI TTS:
   - Work phase: `"Time for {name}"`
   - Break phase: `"Break time, go relax for a bit"`
   - All rounds completed: `"{name} all done, great work"`

## Notes

- `duration` is in **seconds** (not minutes)
- If `id` is not provided, it's auto-generated from `name` (non-ASCII characters are preserved)
- For interval mode, `auto_start` defaults to true; for countdown, it defaults to false
- Dismissing a pomodoro reminder automatically toggles the work<->break phase; once `total_rounds` is reached, it's automatically marked completed
- Reminder data is persisted in `~/.cloe/reminders.json` and automatically restored after an app restart
- Reminder names containing special characters need `encodeURIComponent` encoding in the URL
