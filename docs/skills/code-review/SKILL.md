---
name: code-review
description: "Cloe Desktop terminal code walkthrough feature -- step-by-step code display, bat syntax highlighting, keyboard navigation, comment collection"
---

# Code Review -- Terminal Code Walkthrough

Displays code step by step in Cloe Desktop's Terminal; the user can navigate with the keyboard and add comments. After the walkthrough ends, the agent pulls the comments and applies fixes.

## Prerequisites

```bash
curl -s http://localhost:19851/status
# Expected: {"ws_port":19850,"http_port":19851,"clients":1}
```

## API

```
POST http://localhost:19851/terminal/walk
Content-Type: application/json
```

### action=start -- Start the Walkthrough

```json
{
  "action": "start",
  "steps": [
    {
      "file": "/path/to/file.js",
      "start": 10,
      "end": 30,
      "title": "Feature title",
      "highlight": [12, 15],
      "note": "Explanation of what this code does"
    }
  ]
}
```

Each step is pre-rendered asynchronously via bat with ANSI syntax highlighting, base64-encoded, and passed to the frontend for rendering.

### action=next / prev -- Switch Code Segment

```json
{"action": "next"}
{"action": "prev"}
```

### action=stop -- Exit Back to Shell

```json
{"action": "stop"}
```

### action=get-comments -- Get All Comments

Called after the walkthrough ends, to pull the comments the user left in the terminal:

```json
{"action": "get-comments"}
```

Returns:

```json
{
  "ok": true,
  "comments": [
    {
      "stepIndex": 0,
      "stepTitle": "Feature title",
      "file": "/path/to/file.js",
      "lines": "10-30",
      "text": "There's a bug here",
      "timestamp": "2026-06-13T03:30:00.000Z"
    }
  ]
}
```

## User Keyboard Navigation

| Key | Function |
|------|------|
| `n` / `Space` | next code segment |
| `p` | previous segment |
| `c` | enter comment mode (pops up an input box) |
| `d` | toggle Diff mode (git diff HEAD -> working tree) |
| `j` | scroll down 3 lines (vim-style) |
| `k` | scroll up 3 lines (vim-style) |
| `↑` / `↓` | scroll (3 lines) |
| `PgUp` / `PgDn` | page up/down |
| `Home` / `End` | jump to top/bottom |
| `q` / `Esc` | exit back to shell |

## Comment System Flow

1. **During the walkthrough**: user presses `c` -> an HTML input overlay pops up; typing text and pressing Enter submits it
2. **Displayed at each step**: submitted comments are shown below the code (marked with a 💬)
3. **On exit**: if there are comments, pressing q/Esc first shows a **summary page** (listing all comments grouped by step)
4. **Confirm exit**: pressing Enter/q again on the summary page exits completely
5. **Pull comments**: call `get-comments` to fetch the comment data
6. **Confirm fixes**: show the comment summary in Chat, confirming whether to fix each one
7. **Apply fixes**: once confirmed, apply patches / code changes

## Diff Mode

Each step pre-renders both code highlighting and the git diff; the user presses `d` to switch between them:

- **Code view**: bat syntax highlighting + line numbers
- **Diff view**: colorized `git diff HEAD` output, showing current working-tree changes
- The bottom nav bar shows a `[DIFF]` indicator for the current mode

## Technical Details

### bat Rendering Parameters

```bash
bat --style=numbers --force-colorization --highlight-line {lines} \
    --line-range {start}:{end} --wrap=never --terminal-width=120 {file}
```

### Encoding Notes

- bat's output `\n` must be replaced with `\r\n`, otherwise xterm.js won't return the cursor to the start of the line
- Non-ASCII title/note text is transmitted via base64; the frontend must decode it with `TextDecoder('utf-8')`, not `atob()` directly to a string (which produces garbled output):

```javascript
const bytes = Uint8Array.from(atob(base64String), c => c.charCodeAt(0));
const text = new TextDecoder().decode(bytes);
```

## Typical Usage

1. The agent analyzes code changes (e.g. via `git diff`)
2. Splits the changes into logical segments, building one step per segment
3. Calls `action=start` to push it to the terminal
4. The user browses the code in the terminal, pressing `c` to comment on anything questionable
5. After the user exits, the agent calls `get-comments` to pull the comments
6. The agent shows the comments in Chat, and applies fixes after confirming each one
