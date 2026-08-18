# Hermes Plugin Auto-Trigger

`~/.hermes/plugins/cloe-desktop/` listens for Hermes lifecycle events and automatically triggers Cloe's expression/actions.

## Trigger Rules

Config file: `~/.cloe/plugin-rules.json` (5-second cache, auto-refreshes)

```json
{
  "min_interval": 1.5,
  "tool_expressions": {},
  "tool_completions": { "delegate_task": "clap", "execute_code": "nod" },
  "keyword_map": [
    { "keywords": ["good night", "going to sleep"], "action": "kiss" }
  ],
  "context_thresholds": {
    "warning": { "pct": 75, "action": "think" },
    "critical": { "pct": 90, "action": "shake_head" }
  }
}
```

- `min_interval`: minimum interval between two actions (seconds)
- `tool_expressions`: expression mapping before a tool runs (currently `working` is triggered by `pre_llm_call`, so no per-tool mapping is needed)
- `tool_completions`: expression mapping after a tool finishes
- `keyword_map`: list of keyword matches; triggers the corresponding action on a hit
- `context_thresholds`: triggers based on context usage thresholds (`pct` is a percentage)

## Hook Listener Table

| Hook | Timing | Action |
|------|------|------|
| `on_session_start` | new session | wave |
| `on_session_end` | ended normally | kiss |
| `on_session_end` | interrupted | shake_head |
| `pre_tool_call` | before a tool runs | per `tool_expressions` |
| `post_tool_call` | after a tool finishes | per `tool_completions` |
| `pre_llm_call` | before an LLM call | working |
| `post_llm_call` | after an LLM call | idle (yawn if it took too long) |
| `post_api_request` | after an API request | context threshold check |
| `subagent_stop` | subagent finished | success -> clap / failure -> shake_head |

## Hot Reload Notes

- `plugin-rules.json`: 5-second TTL cache, refreshes automatically after changes
- `plugin.yaml` hooks config: **does not support hot reload** -- after changes, you must restart the Hermes gateway process (gateway mode) or TUI process (`hermes --tui`)

## Gateway Hooks vs Plugin Hooks

| | Gateway hooks | Plugin hooks |
|---|---|---|
| Location | `~/.hermes/hooks/` | `~/.hermes/plugins/` |
| Trigger scope | GatewayRunner only | all modes (gateway, TUI, direct calls) |
| TUI compatibility | Does not trigger under TUI | Triggers in all modes |

So, key actions like working/idle **must rely on plugin hooks** -- they can't depend solely on gateway hooks.
