'use strict';

/**
 * Task Manager — sub-agent task management system
 *
 * The main agent creates sub-agent tasks via the spawn_agent tool.
 * Sub-agents run independently in the background and notify the main agent
 * via the followUp mechanism when done.
 *
 * Two modes:
 *   - sync:  the main agent blocks waiting for the result (good for short tasks)
 *   - async: the main agent keeps working, and gets an automatic followUp
 *            notification when done (good for long tasks)
 *
 * Lifecycle:
 *   spawn() → running → done/failed/timeout
 *   automatically cleaned up when done (reclaimed after 1 hour by default)
 */

const { AgentSession } = require('./agent');

let taskCounter = 0;
const tasks = new Map(); // taskId → taskInfo

// followUp trigger (registered by native-proxy)
let _followUpTrigger = null;

// Task timeout (ms)
const DEFAULT_TIMEOUT = 10 * 60 * 1000; // 10 minutes

/**
 * Register the followUp trigger.
 * Called to notify the main session when a sub-task completes.
 * @param {function} fn - (cloeSessionId, taskId, task, result) => void
 */
function setFollowUpTrigger(fn) {
  _followUpTrigger = fn;
}

/**
 * Create and start a sub-agent task.
 *
 * @param {string} task - task description
 * @param {object} options
 * @param {string} options.cloeSessionId - parent session ID (for followUp)
 * @param {string} options.mode - "sync" | "async"
 * @param {number} options.timeout - timeout in ms (default 10 minutes)
 * @returns {Promise<string>} taskId
 */
async function spawn(task, options = {}) {
  const taskId = `task-${++taskCounter}`;
  const cloeSessionId = options.cloeSessionId || null;
  const mode = options.mode || 'async';
  const timeout = options.timeout || DEFAULT_TIMEOUT;

  const taskInfo = {
    id: taskId,
    status: 'running',
    result: null,
    startedAt: Date.now(),
    completedAt: null,
    toolsUsed: [],
    task,
    cloeSessionId,
    mode,
  };

  tasks.set(taskId, taskInfo);

  // Create a sub-agent (sub-agent mode: no soul file, no spawn tool, no history)
  const subSession = new AgentSession(`sub-${taskId}`, {
    subAgent: true,
    taskPrompt: task,
  });
  taskInfo.subSession = subSession;

  // Timeout timer
  const timeoutTimer = setTimeout(() => {
    if (taskInfo.status === 'running') {
      try { subSession.abort(); } catch {}
      _finishTask(taskInfo, 'timeout', `Task timed out (${Math.floor(timeout / 1000)}s), aborted`);
    }
  }, timeout);

  // Run the sub-agent in the background
  subSession.addUserMessage(task);

  subSession.run({
    onTool: (toolInfo) => {
      taskInfo.toolsUsed.push(toolInfo);
    },
    onEnd: (fullText) => {
      clearTimeout(timeoutTimer);
      _finishTask(taskInfo, 'done', fullText);
    },
    onError: (err) => {
      clearTimeout(timeoutTimer);
      _finishTask(taskInfo, 'failed', `Sub-agent error: ${err}`);
    },
  }, undefined).catch((e) => {
    clearTimeout(timeoutTimer);
    _finishTask(taskInfo, 'failed', `Sub-agent exception: ${e.message}`);
  });

  return taskId;
}

/**
 * Internal: finish a task and trigger followUp (async mode only).
 */
function _finishTask(taskInfo, status, result) {
  if (taskInfo.status !== 'running') return; // prevent duplicate completion

  taskInfo.status = status;
  taskInfo.result = result;
  taskInfo.completedAt = Date.now();

  console.log(`[TaskManager] Task ${taskInfo.id} ${status} (${Math.floor((taskInfo.completedAt - taskInfo.startedAt) / 1000)}s)`);

  // sync mode does not trigger followUp (result is returned directly via waitForCompletion)
  if (taskInfo.mode === 'sync') return;

  // async mode: trigger followUp to notify the main session
  if (taskInfo.cloeSessionId && _followUpTrigger) {
    const task = taskInfo.task;
    const summary = typeof result === 'string' && result.length > 6000
      ? result.slice(0, 6000) + '\n\n[Result truncated because it was too long. View the full result via check_task]'
      : result;

    const notification = status === 'done'
      ? `[System notification] Background task ${taskInfo.id} completed.\nTask: ${task}\n\nResult:\n${summary}`
      : `[System notification] Background task ${taskInfo.id} ${status === 'timeout' ? 'timed out' : 'failed'}.\nTask: ${task}\n${summary}`;

    try {
      _followUpTrigger(taskInfo.cloeSessionId, taskInfo.id, notification);
    } catch (e) {
      console.error(`[TaskManager] followUp trigger failed for ${taskInfo.id}:`, e.message);
    }
  }
}

/**
 * Query a task's status.
 * @param {string} taskId
 * @returns {object} { status, result, error, toolsUsed, elapsedSeconds, task }
 */
function check(taskId) {
  const task = tasks.get(taskId);
  if (!task) return { status: 'not_found', taskId };

  const elapsed = task.completedAt
    ? Math.floor((task.completedAt - task.startedAt) / 1000)
    : Math.floor((Date.now() - task.startedAt) / 1000);

  const result = {
    taskId: task.id,
    status: task.status,
    task: task.task,
    elapsedSeconds: elapsed,
    toolsUsed: task.toolsUsed.length,
    toolsSummary: task.toolsUsed.slice(-10).map((t) => `${t.emoji || '🔧'} ${t.tool}: ${t.label || ''}`),
  };

  if (task.status === 'done') {
    result.result = task.result;
  } else if (task.status === 'failed' || task.status === 'timeout') {
    result.error = task.result;
  }

  return result;
}

/**
 * Synchronously wait for a task to complete (used in sync mode).
 * @param {string} taskId
 * @param {number} timeout - max wait time in ms
 * @returns {Promise<string>} task result text
 */
function waitForCompletion(taskId, timeout = 300000) {
  return new Promise((resolve) => {
    const task = tasks.get(taskId);
    if (!task) { resolve('Task not found'); return; }
    if (task.status !== 'running') { resolve(task.result); return; }

    const deadline = Date.now() + timeout;
    const interval = setInterval(() => {
      const t = tasks.get(taskId);
      if (!t || t.status !== 'running' || Date.now() > deadline) {
        clearInterval(interval);
        resolve(t?.result || 'Timeout waiting for task completion');
      }
    }, 2000);
  });
}

/**
 * List all tasks.
 */
function list() {
  return Array.from(tasks.values()).map((t) => ({
    id: t.id,
    status: t.status,
    mode: t.mode,
    task: t.task.slice(0, 100),
    elapsedSeconds: Math.floor((Date.now() - t.startedAt) / 1000),
    toolsUsed: t.toolsUsed.length,
  }));
}

/**
 * Clean up old completed tasks (called periodically).
 */
function cleanup(maxAgeMs = 3600000) {
  const now = Date.now();
  for (const [id, task] of tasks) {
    if (task.status !== 'running' && task.completedAt && now - task.completedAt > maxAgeMs) {
      tasks.delete(id);
    }
  }
}

// Periodic cleanup (every hour)
setInterval(() => cleanup(), 3600000);

module.exports = {
  spawn,
  check,
  waitForCompletion,
  list,
  cleanup,
  setFollowUpTrigger,
};
