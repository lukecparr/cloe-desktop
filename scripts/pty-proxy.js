#!/usr/bin/env node
/**
 * pty-proxy.js — PTY proxy for Cloe Desktop
 *
 * Runs under system Node.js (not Electron) to avoid ABI mismatch with node-pty.
 * Communicates with Electron main process via stdin/stdout JSON lines.
 *
 * Protocol:
 *   → {"cmd":"spawn","cols":N,"rows":N}       → {"type":"ready"}
 *   → {"cmd":"write","data":"..."}              → (no reply, data forwarded to PTY)
 *   → {"cmd":"resize","cols":N,"rows":N}        → (no reply)
 *   ← {"type":"data","data":"..."}              ← PTY output
 *   ← {"type":"exit","exitCode":N}              ← PTY exited
 */

const pty = require('node-pty');
const path = require('path');

let ptyProc = null;
let inputBuf = '';

function send(msg) {
  try { process.stdout.write(JSON.stringify(msg) + '\n'); } catch (e) { /* ignore */ }
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  inputBuf += chunk;
  let idx;
  while ((idx = inputBuf.indexOf('\n')) !== -1) {
    const line = inputBuf.slice(0, idx).trim();
    inputBuf = inputBuf.slice(idx + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      handleMsg(msg);
    } catch (e) {
      // ignore malformed
    }
  }
});

function handleMsg(msg) {
  switch (msg.cmd) {
    case 'spawn':
      if (ptyProc) return; // already running
      const shell = process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash');
      const home = process.env.HOME || require('os').homedir();
      const shellArgs = process.platform === 'win32' ? [] : [];
      ptyProc = pty.spawn(shell, shellArgs, {
        name: 'xterm-256color',
        cols: msg.cols || 80,
        rows: msg.rows || 24,
        cwd: home,
        env: {
          ...process.env,
          HOME: home,
          SHELL: shell,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
        },
      });
      ptyProc.onData((data) => send({ type: 'data', data }));
      ptyProc.onExit(({ exitCode }) => {
        send({ type: 'exit', exitCode });
        ptyProc = null;
      });
      send({ type: 'ready' });
      break;

    case 'write':
      if (ptyProc) ptyProc.write(msg.data || '');
      break;

    case 'resize':
      if (ptyProc) ptyProc.resize(msg.cols || 80, msg.rows || 24);
      break;
  }
}

// Graceful shutdown
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
