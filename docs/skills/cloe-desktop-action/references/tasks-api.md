# Task Management API

Create and manage a task list through the Bridge API, with support for timing (tracking time spent per task), completion/reopening, and priority ordering. The task list is displayed live in the character's task panel.

## Data Model

```json
{
  "id": "task_1719400000000_abc12",
  "title": "Write docs",
  "content": "Fill in the weather and tasks API documentation",
  "status": "pending",
  "created_at": "2026-07-26T10:00:00.000Z",
  "updated_at": "2026-07-26T10:00:00.000Z",
  "completed_at": null,
  "elapsed_seconds": 0
}
```

| Field | Type | Description |
|------|------|------|
| `id` | string | auto-generated (`task_<timestamp>_<random>`), can be provided manually on creation |
| `title` | string | title (required; defaults to `'Untitled'` if empty) |
| `content` | string | details/notes (optional) |
| `status` | string | `pending` \| `timing` (currently timed) \| `completed` |
| `created_at` | string | creation time, ISO |
| `updated_at` | string | last update time, ISO |
| `completed_at` | string\|null | completion time, ISO (null if not completed) |
| `elapsed_seconds` | number | total elapsed seconds (accumulates across multiple start/stop cycles) |

## Ordering Rules

- Tasks have a **priority order** (the `order` array); earlier entries have higher priority
- Active tasks (pending/timing) come before completed ones
- New tasks are inserted at the end of the active section (before the completed section)
- Both `GET /tasks` and `POST /tasks/reorder` return the list sorted per this rule

## API Endpoints

### List All Tasks

```bash
curl -s http://localhost:19851/tasks
# {"tasks": [...], "timing_id": null}
```

`timing_id` is the id of the currently-timed task (at most one task can be timed at once); `null` if none.

### Create a Task

```bash
curl -s -X POST http://localhost:19851/tasks -H 'Content-Type: application/json' \
  -d '{"title":"Write docs","content":"Fill in API documentation"}'

# Custom id
curl -s -X POST http://localhost:19851/tasks -H 'Content-Type: application/json' \
  -d '{"id":"my-task-1","title":"Review PR"}'
```

### Update a Task

Only `title` and `content` can be changed (use complete/reopen/start/stop below for status changes).

```bash
curl -s -X PATCH http://localhost:19851/tasks/task_1719400000000_abc12 -H 'Content-Type: application/json' \
  -d '{"title":"New title","content":"New content"}'
```

### Delete a Task

```bash
curl -s -X DELETE http://localhost:19851/tasks/task_1719400000000_abc12
```

### Mark Complete / Reopen

```bash
# Mark complete (automatically stops timing, records completed_at)
curl -s -X POST http://localhost:19851/tasks/task_1719400000000_abc12/complete

# Reopen (status goes back to pending, completed_at is cleared)
curl -s -X POST http://localhost:19851/tasks/task_1719400000000_abc12/reopen
```

## Timing

Each task can be timed individually, to track time invested. **Only one task can be timed at a time** -- starting a new one automatically stops the previous one.

### Start Timing

```bash
curl -s -X POST http://localhost:19851/tasks/task_1719400000000_abc12/start
```

- Task status changes to `timing`
- If another task was being timed, it's stopped first (its elapsed seconds are accumulated)
- Broadcasts `task-timer-tick` to clients every second (including the current timing_id and elapsed time)

### Stop Timing

```bash
curl -s -X POST http://localhost:19851/tasks/task_1719400000000_abc12/stop
```

- Accumulates this session's elapsed seconds into `elapsed_seconds`
- Status reverts to `pending`

> Completing a task that's currently being timed automatically stops the timer; deleting a task being timed also clears the timing state.

## Reordering Tasks

Adjusts task priority order (moves it within the active section).

```bash
# Move task 0 to position 2
curl -s -X POST http://localhost:19851/tasks/reorder -H 'Content-Type: application/json' \
  -d '{"from_idx":0,"to_idx":2}'
```

Returns the full reordered list. `from_idx`/`to_idx` are indexes into the array returned by `GET /tasks` (including completed tasks).

## Notes

- `id` needs `encodeURIComponent` in the URL (for custom ids containing special characters)
- Tasks are persisted in `~/.cloe/tasks.json`, order in `~/.cloe/task-order.json`, both automatically restored after an app restart
- The `timing` state is not restored on restart (a task being timed is reset to `pending`, but `elapsed_seconds` is preserved) -- time elapsed while the app was off shouldn't count
- Clients receive `task-created`, `task-updated`, `task-deleted`, `task-completed`, `task-reopened`, `task-timing-started`, `task-timing-stopped`, `task-reordered`, `task-timer-tick`, etc. via WebSocket
