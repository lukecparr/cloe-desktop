# Cloe Desktop Native Agent — Memory & Coding Tools Upgrade Prompt

## Project Background

Cloe Desktop is an Electron desktop AI companion app. The `native-agent/` directory within it is a standalone agent runtime, built on the `@earendil-works/pi-agent-core` framework, with no dependency on external processes.

### Core File Structure

```
native-agent/
├── agent.js      (547 lines) — AgentSession class, manages the Pi Agent instance, context, retries, thinking
├── tools.js      (504 lines) — Tool definitions and execution (terminal, file_read, file_write, file_search, web_search, web_read, load_skill, memory, cloe_action, cloe_tts)
├── memory.js     (146 lines) — Memory storage, persisted as a JSON file
├── config.js     (176 lines) — Configuration management, ~/.cloe/native-agent.json
├── paths.js      (72 lines)  — Unified path management, ~/.cloe/ preferred, ~/.hermes/ fallback
├── skills.js     (159 lines) — Skill discovery and loading
├── soul.js       (138 lines) — Soul file loading + system prompt construction
├── web-search.js (467 lines) — Multi-provider search engine (zhipu_mcp/tavily/ddg/bing/serpapi)
└── cron.js       (310 lines) — Scheduled tasks
```

### Tool-Calling Mechanism

tools.js exports `getTools()`, which returns an array of tool definitions (OpenAI function-calling format), and `executeTool(name, args)`, which executes a tool.
agent.js's `AgentSession.run()` creates a Pi Agent instance, registers tools, and handles streaming events (text delta, thinking delta, tool call, tool result, turn end, agent end).

### Pi Agent Core's AgentTool Interface

```typescript
interface AgentTool {
  name: string;
  description: string;
  schema: JSONSchema;  // JSON Schema for parameters
  execute(args: object): Promise<string>;
}
```

Pi Agent supports a `transformContext` hook (runs before every LLM call), thinking levels (off/minimal/low/medium/high/xhigh/max), and automatic compaction.

---

## Upgrade Task A: Memory System Refactor

### Problems with the Current Implementation

Current state of `native-agent/memory.js`:
- Stored at `~/.cloe/native-agent-memory.json`, a plain JSON array
- Capped at 50 entries; when exceeded, evicts by `trust × last_used`
- trust starts at 0.5, but **nothing in the code ever calls setTrust()**, so trust never changes
- Search is a simple `content.includes(query)` substring match
- Injected into the system prompt with a cap of 4000 characters
- render() calls saveMemory() on every invocation (updating last_used), which is a performance problem

### Target Design: Tiered Memory + Decaying Forgetfulness

#### 1. Category Strategy

```
user_pref  — user preferences/personal info (never evicted, cap of 100 entries, injected in full)
project    — project-related knowledge (LRU decay, cap of 100 entries)
tool       — tool-usage experience (LRU decay, cap of 80 entries)
general    — general knowledge (LRU decay, cap of 50 entries)
```

#### 2. Dynamic Trust Decay

- New memories start at trust = 0.5
- trust += 0.02 each time it's injected via render() (use reinforces it)
- trust += 0.1 each time it's matched by search()
- trust -= 0.01 per day (time decay), floor of 0.1
- trust < 0.05 and not user_pref → automatically evicted

#### 3. Injection Strategy

```
system prompt injection budget = 6000 characters
priority: user_pref injected in full → tool sorted by trust descending → project sorted by trust descending → general sorted by trust descending
until the budget is used up
```

#### 4. Search Optimization

- Keep substring matching (fast)
- Add tag matching (tags can be attached on add)
- Sort results by a combination of trust + recency

#### 5. Data Structure

```json
{
  "version": 2,
  "entries": [
    {
      "id": "uuid",
      "content": "memory content",
      "category": "user_pref",
      "tags": ["name", "personal"],
      "trust": 0.8,
      "created_at": 1699000000000,
      "last_used": 1699000000000,
      "use_count": 5
    }
  ],
  "last_decay": 1699000000000
}
```

#### 6. Migration

When the v1 format is detected (no version field, or version !== 2), migrate automatically: set category = "general" and trust = 0.5 for all existing memories.

#### 7. Performance

- render() should no longer call saveMemory() on every invocation; instead only write when the trust change exceeds a threshold (0.05)
- Or use a dirty flag + deferred write (flush every 30 seconds)

### Interface Stays Backward-Compatible

The external calling convention is unchanged:
```js
memory.add(content, category, tags)  // tags becomes an optional string or array
memory.remove(idOrContent)
memory.search(query)
memory.render()  // → string for system prompt
```

The memory tool definition in tools.js stays the same, but its execute can pass a tags parameter.

---

## Upgrade Task B: Coding Capability Enhancements

### Current Problems

1. **file_write is a full overwrite** — the whole file gets rewritten, which risks changing content that shouldn't change and wastes tokens
2. **No file_edit tool** — no way to make precise, localized edits
3. **Tools execute serially** — independent tool calls can't run in parallel
4. **No automatic verification** — after code is changed, there's no automatic syntax check or test run
5. **No directory browsing** — no ls/tree tool, so understanding the project structure relies entirely on grep/find

### Target Design

#### B1. Add a file_edit Tool (Most Important)

Diff-based precise file editing, supporting two modes:

**Mode 1: Text replacement**
```json
{
  "name": "file_edit",
  "parameters": {
    "path": "file path",
    "edits": [
      {
        "oldText": "original text to replace (must match exactly, including context lines)",
        "newText": "replacement text"
      }
    ]
  }
}
```

Implementation logic:
1. Read the file content
2. For each edit, search the file for oldText
3. If it matches exactly one location → replace it
4. If it matches multiple locations → error, requiring more context
5. If no match is found → error, returning the most similar line (to help debugging)
6. Write the file back once all edits are applied
7. Return a diff summary (how many spots changed, +/- line counts for each)

Key point: oldText must be a **unique match**, otherwise it errors. This forces the LLM to provide enough context.

**Mode 2: Line-number editing (alternative)**
```json
{
  "path": "file path",
  "lineEdits": [
    { "startLine": 10, "endLine": 15, "newText": "new content" }
  ]
}
```

#### B2. Add a list_files Tool

```json
{
  "name": "list_files",
  "parameters": {
    "path": "directory path (default ~)",
    "recursive": false,
    "maxDepth": 2
  }
}
```

Returns a directory tree to help the LLM understand the project structure. Excludes node_modules/.git/dist, etc.

#### B3. Automatic Verification After Tool Execution

In tools.js's executeTool, append automatic verification after specific tools run:

```js
// After file_write or file_edit operates on a .js/.jsx/.ts file
if (p.endsWith('.js') || p.endsWith('.jsx') || p.endsWith('.ts')) {
  const check = await runShell(`node -c "${p}"`, 5000);
  if (check.includes('SyntaxError')) {
    return result + `\n\n⚠️ Syntax check failed:\n${check}`;
  }
}
```

#### B4. file_read Enhancements

- Return line-numbered content by default (already implemented)
- Add a `maxLines` parameter to cap the number of lines returned (prevents reading a huge file and blowing up context)
- If the file exceeds maxLines, return the first N lines + `... (N more lines, use offset to read more)`

#### B5. file_write Adds Backup

Back up the original file in memory before writing (not persisted); if an error occurs after file_write within the same run, it can be restored on retry.

### On Parallel Tool Calls

Parallelism at the Pi Agent Core framework level would require modifying the harness, so it's out of scope for now. However, an `executeToolsBatch(toolCalls)` batch-execution function can be added at the executeTool layer, using Promise.all to run independent tool calls in parallel.

---

## Implementation Requirements

1. **Pure Node.js (CommonJS)**, no new npm dependencies
2. **Do not modify pi-agent-core's source** — only change files under the native-agent/ directory
3. **tools.js's tool definition format** must stay compatible with OpenAI function calling (type: 'function', function: { name, description, parameters })
4. **Maintain backward compatibility**: existing config files, memory files, and session data formats must not break
5. **Code style**: match the existing code — 'use strict', JSDoc comments, console.log prefixed with `[NativeAgent]`
6. **Testing**: after writing the code, run `node -e "require('./native-agent/memory')"` and `require('./native-agent/tools')` to confirm there are no syntax errors
7. **Do not touch these files**: the AgentSession class structure and the run() method signature in agent.js must stay unchanged — only add to it, don't modify it

## Project Path

```
/Users/lijian/work/cloe-desktop/
```

Config file: `~/.cloe/native-agent.json`
Memory file: `~/.cloe/native-agent-memory.json`
Soul file: `~/.hermes/soul.md` (fallback from `~/.cloe/soul.md`)
Skills directory: `~/.hermes/skills/` (fallback from `~/.cloe/skills/`)
