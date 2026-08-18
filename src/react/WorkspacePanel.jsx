/**
 * WorkspacePanel — Unified panel for Agent Sessions + Reminders + Tasks.
 *
 * Vertical-tab layout:
 *   - Left rail: tab icons (Agent / Reminders / Tasks) with count badges
 *   - Right main: full-width content for the active tab
 *
 * Design: solid dark background + blur, zero gradients, minimal.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import './workspace-panel.css';

// ==================== i18n ====================

const isZh = () => {
  const saved = localStorage.getItem('cloe-manager-lang');
  if (saved) return saved.startsWith('zh');
  return navigator.language?.startsWith('zh');
};
const t = (zh, en) => (isZh() ? zh : en);

// ==================== Formatters ====================

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function formatRelative(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('just now', 'just now');
  if (mins < 60) return t(`${mins}m ago`, `${mins}m ago`);
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t(`${hours}h ago`, `${hours}h ago`);
  const days = Math.floor(hours / 24);
  return t(`${days}d ago`, `${days}d ago`);
}

function formatNextTime(triggerAtIso) {
  try {
    const target = new Date(triggerAtIso);
    const diffMs = target - Date.now();
    if (diffMs <= 0) return '';
    const diffMin = Math.round(diffMs / 60000);
    if (diffMin < 1) return t('soon', 'soon');
    if (diffMin < 60) return t(`in ${diffMin}m`, `in ${diffMin}m`);
    const targetStr = target.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return targetStr;
  } catch {
    return '';
  }
}

// ==================== Agent Session Card ====================

const SESSION_STATUS = {
  idle:           { label: t('Idle', 'Idle'),      color: '#4d9eff', pulse: false, blink: true },
  working:        { label: t('Running', 'Running'),   color: '#4d9eff', pulse: true,  blink: true },
  turn_complete:  { label: t('Ready', 'Ready'),     color: '#3dd68c', pulse: false, icon: 'check' },
  needs_decision: { label: t('Waiting', 'Waiting'),   color: '#f5a623', pulse: true,  icon: 'alert' },
};

function SessionIcon({ icon, color }) {
  if (icon === 'spinner') {
    return (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" className="wp-spin">
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
    );
  }
  if (icon === 'check') {
    return (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 9v4M12 17h.01" /><circle cx="12" cy="12" r="10" />
    </svg>
  );
}

function SessionCard({ session, onSetTitle, onCancel, onMute, onOpen, onDelete }) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(session.title || '');
  const inputRef = useRef(null);
  const cfg = SESSION_STATUS[session.status] || SESSION_STATUS.working;
  const isInternal = session.source === 'cloe-desktop';
  const displayName = session.title || session.source_label;
  const needsAction = session.status === 'turn_complete' || session.status === 'needs_decision';

  useEffect(() => { setTitleValue(session.title || ''); }, [session.title]);
  useEffect(() => {
    if (editingTitle && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingTitle]);

  const commitTitle = useCallback(() => {
    setEditingTitle(false);
    const trimmed = titleValue.trim();
    if (trimmed !== (session.title || '')) onSetTitle(session.id, trimmed);
  }, [titleValue, session.id, session.title, onSetTitle]);

  return (
    <div
      className={`wp-session-card${needsAction ? ' wp-session-action' : ''}${isInternal ? ' wp-session-internal' : ''}`}
    >
      <div className="wp-session-status-icon">
        {cfg.blink ? (
          <div className="wp-session-dot-blink" style={{ background: cfg.color }} />
        ) : (
          <div className={`wp-session-icon-bg ${cfg.pulse ? 'wp-pulse' : ''}`} style={{ borderColor: cfg.color }}>
            <SessionIcon icon={cfg.icon} color={cfg.color} />
          </div>
        )}
      </div>
      <div className="wp-session-body">
        {editingTitle ? (
          <input
            ref={inputRef}
            className="wp-inline-input"
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitTitle(); }
              else if (e.key === 'Escape') { e.preventDefault(); setEditingTitle(false); }
            }}
            placeholder={session.source_label}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <>
            <div className="wp-session-name" onClick={(e) => { if (isInternal) { e.stopPropagation(); setEditingTitle(true); } else { setEditingTitle(true); } }}>{displayName}</div>
            <div className="wp-session-meta">
              <span className="wp-session-source">{isInternal ? t('Internal', 'Internal') : session.source_label}</span>
              {session.turn_count > 0 && <span className="wp-session-dot-sep">·</span>}
              {session.turn_count > 0 && <span>{session.turn_count} {t('turns', 'turns')}</span>}
              <span className="wp-session-dot-sep">·</span>
              <span>{formatTime(session.created_at)}</span>
            </div>
          </>
        )}
      </div>
      <div className="wp-session-badge" style={{ color: cfg.color, background: cfg.color + '14' }}>
        {cfg.label}
      </div>
      <div className="wp-session-btns">
        {isInternal ? (
          <>
            <button
              className={`wp-session-mute${session.muted ? ' active' : ''}`}
              onClick={(e) => { e.stopPropagation(); onMute?.(session.id, !session.muted); }}
              title={session.muted ? t('Unmute session', 'Unmute session') : t('Mute session alerts', 'Mute session alerts')}
            >
              {session.muted ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                </svg>
              )}
            </button>
            <button className="wp-session-open" onClick={(e) => { e.stopPropagation(); onOpen?.(session.id); }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </button>
            <button className="wp-session-cancel" onClick={(e) => { e.stopPropagation(); onDelete?.(session.id); }} title={t('Delete', 'Delete')}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
              </svg>
            </button>
          </>
        ) : (
          <>
            <button
              className={`wp-session-mute${session.muted ? ' active' : ''}`}
              onClick={(e) => { e.stopPropagation(); onMute?.(session.id, !session.muted); }}
              title={session.muted ? t('Unmute session', 'Unmute session') : t('Mute session alerts', 'Mute session alerts')}
            >
              {session.muted ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                </svg>
              )}
            </button>
            <button className="wp-session-cancel" onClick={(e) => { e.stopPropagation(); onCancel(session.id); }} title={t('Cancel', 'Cancel')}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ==================== Task Card ====================

function clearTaskDropIndicators() {
  document.querySelectorAll('.wp-task-dragging, .wp-task-drop-before, .wp-task-drop-after')
    .forEach((el) => el.classList.remove('wp-task-dragging', 'wp-task-drop-before', 'wp-task-drop-after'));
}

function TaskCard({ task, dragIndex, isTiming, onToggleComplete, onStartStop, onEdit, onDelete }) {
  const isCompleted = task.status === 'completed';

  const handleDragStart = (e) => {
    if (isCompleted || typeof dragIndex !== 'number' || dragIndex < 0) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/task-idx', String(dragIndex));
    requestAnimationFrame(() => {
      e.currentTarget.classList.add('wp-task-dragging');
    });
  };

  const handleDragEnd = () => {
    clearTaskDropIndicators();
  };

  const handleDragOver = (e) => {
    if (isCompleted) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    clearTaskDropIndicators();
    const rect = e.currentTarget.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    e.currentTarget.classList.add(before ? 'wp-task-drop-before' : 'wp-task-drop-after');
  };

  const handleDrop = (e) => {
    if (isCompleted) return;
    e.preventDefault();
  };

  return (
    <div
      className={`wp-task-card${isCompleted ? ' completed' : ''}${isTiming ? ' timing' : ''}`}
      draggable={!isCompleted}
      data-drag-index={typeof dragIndex === 'number' ? dragIndex : -1}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="wp-task-handle" title={isCompleted ? t('Completed tasks stay at the end', 'Completed tasks stay at the end') : t('Drag to reorder priority', 'Drag to reorder priority')}>
        <svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor" opacity="0.2">
          <circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/>
          <circle cx="2" cy="6" r="1.2"/><circle cx="6" cy="6" r="1.2"/>
          <circle cx="2" cy="10" r="1.2"/><circle cx="6" cy="10" r="1.2"/>
        </svg>
      </div>
      <button
        className={`wp-task-check${isCompleted ? ' checked' : ''}`}
        draggable={false}
        onClick={() => onToggleComplete(task.id, isCompleted)}
        title={isCompleted ? t('Reopen', 'Reopen') : t('Complete', 'Complete')}
      >
        {isCompleted && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </button>

      <div className="wp-task-main" onClick={() => onEdit(task)}>
        <div className="wp-task-title-row">
          <span className="wp-task-title">{task.title}</span>
          {isTiming && <span className="wp-task-focus-tag">{t('Focusing', 'Focusing')}</span>}
        </div>
        {task.tags && task.tags.length > 0 && (
          <div className="wp-task-tags">
            {task.tags.map((tag, i) => <span key={i} className="wp-tag-chip">#{tag}</span>)}
          </div>
        )}
        {task.content && <div className="wp-task-preview">{task.content}</div>}
        <div className="wp-task-meta">{formatRelative(task.updated_at)}</div>
      </div>

      <div className="wp-task-actions">
        {!isCompleted && (
          <button
            className={`wp-task-play${isTiming ? ' active' : ''}`}
            draggable={false}
            onClick={() => onStartStop(task.id, isTiming)}
            title={isTiming ? t('Unfocus', 'Unfocus') : t('Focus', 'Focus')}
          >
            {isTiming ? (
              <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="4" fill="var(--wp-bg, #0a0a0a)" />
              </svg>
            ) : (
              <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="10" />
              </svg>
            )}
          </button>
        )}
        <button className="wp-task-delete" draggable={false} onClick={() => onDelete(task.id)} title={t('Delete', 'Delete')}>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

    </div>
  );
}

// ==================== Task Editor ====================

function TaskEditor({ task, onSave, onCancel }) {
  const [title, setTitle] = useState(task.title);
  const [content, setContent] = useState(task.content || '');
  const [tags, setTags] = useState(Array.isArray(task.tags) ? [...task.tags] : []);
  const [tagDraft, setTagDraft] = useState('');
  const [tagEditing, setTagEditing] = useState(false);
  const [editingTagIdx, setEditingTagIdx] = useState(-1);
  const [editingTagVal, setEditingTagVal] = useState('');
  const titleRef = useRef(null);
  const tagInputRef = useRef(null);

  const startTagEdit = () => {
    setTagEditing(true);
    requestAnimationFrame(() => tagInputRef.current?.focus());
  };
  const onTagBlur = () => {
    if (tagDraft.trim()) commitTagDraft();
    setTimeout(() => { setTagEditing(false); }, 120);
  };

  useEffect(() => {
    if (titleRef.current) { titleRef.current.focus(); titleRef.current.select(); }
  }, []);

  const commitTagDraft = () => {
    const v = tagDraft.trim();
    if (!v) return;
    setTags(prev => {
      if (prev.some(x => x.toLowerCase() === v.toLowerCase())) return prev;
      return [...prev, v];
    });
    setTagDraft('');
  };

  const removeTag = (idx) => setTags(prev => prev.filter((_, i) => i !== idx));

  const startEditTag = (idx) => {
    setEditingTagIdx(idx);
    setEditingTagVal(tags[idx]);
  };
  const commitEditTag = () => {
    if (editingTagIdx < 0) return;
    const val = editingTagVal.trim();
    setTags(prev => {
      if (!val) return prev.filter((_, i) => i !== editingTagIdx);
      const next = [...prev];
      // avoid duplicate (case-insensitive) elsewhere
      if (prev.some((t, i) => i !== editingTagIdx && t.toLowerCase() === val.toLowerCase())) {
        return prev.filter((_, i) => i !== editingTagIdx);
      }
      next[editingTagIdx] = val;
      return next;
    });
    setEditingTagIdx(-1);
    setEditingTagVal('');
  };

  const handleSave = () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    // Flush pending tag draft so it isn't lost on save
    if (tagDraft.trim()) commitTagDraft();
    onSave(task.id, { title: trimmedTitle, content: content.trim(), tags });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSave(); }
  };

  return (
    <div className="wp-editor-overlay" onClick={onCancel}>
      <div className="wp-editor" onClick={(e) => e.stopPropagation()}>
        <input
          ref={titleRef}
          className="wp-editor-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('Task title', 'Task title')}
        />
        <textarea
          className="wp-editor-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('Details (optional)', 'Details (optional)')}
          rows={6}
        />
        <div className="wp-editor-tags">
          {tags.map((tag, i) => (
            editingTagIdx === i ? (
              <span key={i} className="wp-tag-chip wp-tag-editing">
                <span className="wp-tag-edit-hash">#</span>
                <input
                  autoFocus
                  className="wp-tag-edit-input"
                  value={editingTagVal}
                  onChange={(e) => setEditingTagVal(e.target.value)}
                  onBlur={commitEditTag}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); commitEditTag(); }
                    if (e.key === 'Escape') { e.preventDefault(); setEditingTagIdx(-1); }
                  }}
                />
              </span>
            ) : (
              <span key={i} className="wp-tag-chip wp-tag-removable">
                <span onDoubleClick={() => startEditTag(i)} title={t('Double-click to edit', 'Double-click to edit')}>#{tag}</span>
                <button type="button" onClick={() => removeTag(i)} title={t('Remove', 'Remove')}>×</button>
              </span>
            )
          ))}
          {tagEditing ? (
            <span className="wp-tag-edit-wrap">
              <span className="wp-tag-edit-hash">#</span>
              <input
                ref={tagInputRef}
                className="wp-tag-inline-input"
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onBlur={onTagBlur}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commitTagDraft(); }
                  if (e.key === 'Backspace' && !tagDraft && tags.length) { e.preventDefault(); removeTag(tags.length - 1); }
                  if (e.key === 'Escape') { e.preventDefault(); setTagDraft(''); setTagEditing(false); }
                }}
                placeholder={t('tag', 'tag')}
              />
            </span>
          ) : (
            <button type="button" className="wp-tag-add-btn" onClick={startTagEdit} title={t('Add tag', 'Add tag')}>
              {tags.length ? '#' : t('# Add tag', '# Add tag')}
            </button>
          )}
        </div>
        <div className="wp-editor-actions">
          <button className="wp-editor-cancel" onClick={onCancel}>{t('Cancel', 'Cancel')}</button>
          <button className="wp-editor-save" onClick={handleSave}>{t('Save', 'Save')}</button>
        </div>
      </div>
    </div>
  );
}

// ==================== Reminder Card (full — matches settings page) ====================

const RM_STATUS = {
  idle:       { label: t('Ready', 'Ready'),     color: 'rgba(255,255,255,0.3)' },
  running:    { label: t('Running', 'Running'),   color: '#4d9eff' },
  paused:     { label: t('Paused', 'Paused'),    color: '#f5a623' },
  triggered:  { label: t('Due', 'Due'),         color: '#3dd68c' },
  completed:  { label: t('Done', 'Done'),        color: 'rgba(255,255,255,0.2)' },
};

function ReminderCard({ reminder, onToggle, onPauseResume, onDismiss, onDelete, onEdit }) {
  const r = reminder;
  const cfg = RM_STATUS[r.status] || RM_STATUS.idle;
  const isRunning = r.status === 'running';
  const isPaused = r.status === 'paused';
  const isTriggered = r.status === 'triggered';
  const isCompleted = r.status === 'completed';
  const durMin = Math.round(r.duration / 60);
  const isCountdown = r.mode === 'countdown';

  // Live countdown for running reminders
  const [remaining, setRemaining] = useState('');
  useEffect(() => {
    if (!isRunning || !r.trigger_at) return;
    const update = () => {
      const diff = new Date(r.trigger_at).getTime() - Date.now();
      if (diff <= 0) { setRemaining(t('soon', 'soon')); return; }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${m}:${String(s).padStart(2,'0')}`);
    };
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [isRunning, r.trigger_at]);

  const roundInfo = r.total_rounds > 0 && r.round > 0 ? `${r.round}/${r.total_rounds}` : '';
  const nextTime = isRunning && r.trigger_at ? formatNextTime(r.trigger_at) : '';

  return (
    <div className={`wp-rm-card${isTriggered ? ' wp-rm-triggered' : ''}${!r.enabled ? ' wp-rm-off' : ''}${isCompleted ? ' wp-rm-done' : ''}`}>
      <div className={`wp-rm-icon ${isCountdown ? 'wp-rm-ico-timer' : 'wp-rm-ico-drop'}`}>
        {isCountdown ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M9 2h6"/>
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
          </svg>
        )}
      </div>
      <div className="wp-rm-body">
        <div className="wp-rm-name">{r.name}</div>
        <div className="wp-rm-meta">
          <span>{isCountdown ? t('Countdown', 'Countdown') : t('Every', 'Every')} {durMin}{t('min', 'min')}</span>
          {roundInfo && <><span className="wp-rm-dot"></span><span>{roundInfo}</span></>}
          {!r.tts && <><span className="wp-rm-dot"></span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/></svg></>}
          {isRunning && nextTime && <><span className="wp-rm-dot"></span><span className="wp-rm-next">{remaining || nextTime}</span></>}
          {r.action && <><span className="wp-rm-dot"></span><span className="wp-rm-action-tag">{r.action}</span></>}
        </div>
      </div>
      <div className="wp-rm-side">
        <span className="wp-rm-badge wp-rm-status-{r.status}" style={{ color: cfg.color, background: cfg.color + '14' }}>{cfg.label}</span>
        <div className="wp-rm-btns">
          {isRunning && (
            <button className="wp-rm-btn" onClick={() => onPauseResume(r.id, 'pause')} title={t('Pause', 'Pause')}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
            </button>
          )}
          {isPaused && (
            <button className="wp-rm-btn" onClick={() => onPauseResume(r.id, 'resume')} title={t('Resume', 'Resume')}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </button>
          )}
          {isTriggered && (
            <button className="wp-rm-btn wp-rm-btn-accent" onClick={() => onDismiss(r.id)} title={t('Dismiss', 'Dismiss')}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </button>
          )}
          <button className={`wp-rm-btn${r.enabled ? ' wp-rm-btn-on' : ''}`} onClick={() => onToggle(r.id)} title={r.enabled ? t('Disable', 'Disable') : t('Enable', 'Enable')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity={r.enabled ? 1 : 0.5}><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>
          </button>
          <button className="wp-rm-btn" onClick={() => onEdit(r)} title={t('Edit', 'Edit')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button className="wp-rm-btn wp-rm-btn-danger" onClick={() => onDelete(r.id)} title={t('Delete', 'Delete')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================== Reminder Form (modal — matches settings page) ====================

function ReminderFormModal({ reminder, availableActions, onSave, onCancel }) {
  const isEdit = !!reminder;
  const r = reminder || {};
  const [name, setName] = useState(r.name || '');
  const [mode, setMode] = useState(r.mode || 'interval');
  const [duration, setDuration] = useState(r.duration ? Math.round(r.duration / 60) : 30);
  const [breakDur, setBreakDur] = useState(r.break_duration ? Math.round(r.break_duration / 60) : 5);
  const [rounds, setRounds] = useState(r.total_rounds || 0);
  const [autoStart, setAutoStart] = useState(r.auto_start !== false);
  const [tts, setTts] = useState(r.tts !== false);
  const [action, setAction] = useState(r.action || '');
  const nameRef = useRef(null);

  const isCountdown = mode === 'countdown';

  useEffect(() => { if (nameRef.current) nameRef.current.focus(); }, []);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave({
      ...(isEdit ? { id: r.id, start: false } : {}),
      name: trimmed,
      mode,
      duration: duration * 60,
      break_duration: breakDur * 60,
      total_rounds: rounds,
      auto_start: autoStart,
      tts,
      action: action.trim(),
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSave(); }
  };

  return (
    <div className="wp-editor-overlay" onClick={onCancel}>
      <div className="wp-rm-form-modal" onClick={(e) => e.stopPropagation()}>
        <div className="wp-rm-form-head">
          <span className="wp-rm-form-title">{isEdit ? t('Edit Reminder', 'Edit Reminder') : t('Add Reminder', 'Add Reminder')}</span>
          <button className="wp-rm-form-close" onClick={onCancel}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="wp-rm-form-row">
          <div className="wp-rm-field">
            <label className="wp-rm-label">{t('Name', 'Name')}</label>
            <input
              ref={nameRef}
              type="text"
              className="wp-rm-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('Reminder name', 'Reminder name')}
            />
          </div>
          <div className="wp-rm-field wp-rm-field-sm">
            <label className="wp-rm-label">{t('Mode', 'Mode')}</label>
            <div className="wp-rm-segments">
              <button className={`wp-rm-seg${mode === 'interval' ? ' active' : ''}`} onClick={() => setMode('interval')}>{t('Interval', 'Interval')}</button>
              <button className={`wp-rm-seg${mode === 'countdown' ? ' active' : ''}`} onClick={() => setMode('countdown')}>{t('Countdown', 'Countdown')}</button>
            </div>
          </div>
        </div>

        <div className="wp-rm-form-row">
          <div className="wp-rm-field wp-rm-field-sm">
            <label className="wp-rm-label">{t('Duration', 'Duration')}</label>
            <div className="wp-rm-input-group">
              <input type="number" className="wp-rm-input wp-rm-input-narrow" min="1" max="720" value={duration} onChange={(e) => setDuration(Math.max(1, parseInt(e.target.value) || 1))} onKeyDown={handleKeyDown} />
              <span className="wp-rm-unit">{t('min', 'min')}</span>
            </div>
          </div>
          {isCountdown && (
            <div className="wp-rm-field wp-rm-field-sm">
              <label className="wp-rm-label">{t('Break', 'Break')}</label>
              <div className="wp-rm-input-group">
                <input type="number" className="wp-rm-input wp-rm-input-narrow" min="0" max="120" value={breakDur} onChange={(e) => setBreakDur(Math.max(0, parseInt(e.target.value) || 0))} onKeyDown={handleKeyDown} />
                <span className="wp-rm-unit">{t('min', 'min')}</span>
              </div>
            </div>
          )}
          <div className="wp-rm-field wp-rm-field-sm">
            <label className="wp-rm-label">{t('Max Rounds', 'Max Rounds')}</label>
            <input type="number" className="wp-rm-input wp-rm-input-narrow" min="0" max="999" value={rounds} onChange={(e) => setRounds(Math.max(0, parseInt(e.target.value) || 0))} onKeyDown={handleKeyDown} />
          </div>
        </div>

        <div className="wp-rm-form-row">
          <div className="wp-rm-field">
            <label className="wp-rm-label">{t('Action', 'Action')}</label>
            <select className="wp-rm-input wp-rm-select" value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="">{t('None', 'None')}</option>
              {(availableActions || []).map(a => (
                <option key={a.name} value={a.name}>{a.name}{a.description ? ` — ${a.description}` : ''}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="wp-rm-form-toggles">
          <label className="wp-rm-toggle-row">
            <span className="wp-rm-toggle-label">{t('Auto Start', 'Auto Start')}<span className="wp-rm-toggle-desc">{t('Start immediately', 'Start immediately')}</span></span>
            <label className="wp-rm-toggle"><input type="checkbox" checked={autoStart} onChange={(e) => setAutoStart(e.target.checked)} /><span className="wp-rm-toggle-slider"></span></label>
          </label>
          <label className="wp-rm-toggle-row">
            <span className="wp-rm-toggle-label">{t('TTS', 'TTS')}<span className="wp-rm-toggle-desc">{t('Voice alert when due', 'Voice alert when due')}</span></span>
            <label className="wp-rm-toggle"><input type="checkbox" checked={tts} onChange={(e) => setTts(e.target.checked)} /><span className="wp-rm-toggle-slider"></span></label>
          </label>
        </div>

        <div className="wp-rm-form-foot">
          <button className="wp-editor-cancel" onClick={onCancel}>{t('Cancel', 'Cancel')}</button>
          <button className="wp-editor-save" onClick={handleSave} disabled={!name.trim()}>{t('Save', 'Save')}</button>
        </div>
      </div>
    </div>
  );
}

// ==================== Main Panel ====================

export default function WorkspacePanel({
  visible,
  sessions,
  tasks,
  reminders,
  timingId,
  onSessionSetTitle,
  onSessionCancel,
  onSessionMute,
  onSessionOpen,
  onSessionDelete,
  onSessionCreate,
  onTaskCreate,
  onTaskUpdate,
  onTaskDelete,
  onTaskToggleComplete,
  onTaskStartStop,
  onTaskReorder,
  onReminderCreate,
  onReminderToggle,
  onReminderPauseResume,
  onReminderDismiss,
  onReminderDelete,
  onClose,
}) {
  const backdropRef = useRef(null);
  const [activeTab, setActiveTab] = useState('agent'); // 'agent' | 'reminders' | 'tasks'

  // ── Auto-focus the panel when it becomes visible ──
  // Without this, focus stays in the terminal (webview) and Tab key never reaches document.
  const panelRef = useRef(null);
  useEffect(() => {
    if (visible && panelRef.current) {
      panelRef.current.focus();
    }
  }, [visible]);

  // ── Tab key to cycle through tabs (agent → reminders → tasks → agent) ──
  const TAB_ORDER = ['agent', 'reminders', 'tasks'];
  useEffect(() => {
    if (!visible) return;
    const handler = (e) => {
      if (e.key !== 'Tab') return;
      // Don't hijack Tab when focus is in an input/textarea/select/contenteditable
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable) return;
      // Don't interfere if Shift+Tab (browser focus navigation)
      if (e.shiftKey) return;
      e.preventDefault();
      setActiveTab(prev => {
        const idx = TAB_ORDER.indexOf(prev);
        return TAB_ORDER[(idx + 1) % TAB_ORDER.length];
      });
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [visible]);
  const [sessionFilter, setSessionFilter] = useState('all'); // 'all' | 'internal' | 'external'
  const [editingTask, setEditingTask] = useState(null);
  const [editingReminder, setEditingReminder] = useState(null);
  const [showReminderForm, setShowReminderForm] = useState(false);
  const [availableActions, setAvailableActions] = useState([]);
  const [taskTagFilter, setTaskTagFilter] = useState(null); // null = no filter, string = active tag
  const taskListRef = useRef(null);

  // Fetch available actions for reminder form
  useEffect(() => {
    if (showReminderForm) {
      fetch('http://127.0.0.1:19851/actions')
        .then(r => r.json())
        .then(data => {
          const filtered = (data.actions || []).filter(a =>
            !['working', 'idle', 'walk_right', 'walk_left', 'speak'].includes(a.name)
          );
          setAvailableActions(filtered);
        })
        .catch(() => {});
    }
  }, [showReminderForm]);

  const handleBackdropClick = useCallback((e) => {
    if (e.target === backdropRef.current) onClose();
  }, [onClose]);

  const activeSessions = sessions || [];
  const activeTasks = tasks || [];
  const activeReminders = reminders || [];
  const activeReminderCount = activeReminders.filter(r => r.enabled && r.status !== 'completed').length;
  const activeTaskIndexById = new Map();
  let nextActiveTaskIdx = 0;
  activeTasks.forEach((task) => {
    if (task.status === 'completed') return;
    activeTaskIndexById.set(task.id, nextActiveTaskIdx++);
  });
  // Split tasks into pending (top, draggable) and completed (bottom) sections.
  // Collect every tag across tasks for the filter bar (case-insensitive dedupe).
  const allTaskTags = [];
  {
    const seen = new Set();
    for (const task of activeTasks) {
      for (const tag of (task.tags || [])) {
        const key = tag.toLowerCase();
        if (!seen.has(key)) { seen.add(key); allTaskTags.push(tag); }
      }
    }
  }
  // Drop the filter if its tag no longer exists (e.g. after deletion/edit).
  const effectiveTagFilter = taskTagFilter && allTaskTags.some(x => x.toLowerCase() === taskTagFilter.toLowerCase())
    ? taskTagFilter : null;
  const matchesFilter = (task) => !effectiveTagFilter || (task.tags || []).some(x => x.toLowerCase() === effectiveTagFilter.toLowerCase());
  const pendingTasks = activeTasks.filter((task) => task.status !== 'completed' && matchesFilter(task));
  const completedTasks = activeTasks.filter((task) => task.status === 'completed' && matchesFilter(task));

  const handleTaskListDrop = useCallback((e) => {
    e.preventDefault();
    const fromIdx = parseInt(e.dataTransfer.getData('text/task-idx'), 10);
    const targetCard = e.target.closest('.wp-task-card');
    clearTaskDropIndicators();
    if (!targetCard || Number.isNaN(fromIdx)) return;
    const targetIdx = parseInt(targetCard.dataset.dragIndex || '', 10);
    if (Number.isNaN(targetIdx) || targetIdx < 0) return;
    const rect = targetCard.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    const toIdx = before
      ? (fromIdx < targetIdx ? targetIdx - 1 : targetIdx)
      : (fromIdx < targetIdx ? targetIdx : targetIdx + 1);
    if (fromIdx === toIdx) return;
    onTaskReorder?.(fromIdx, toIdx);
  }, [onTaskReorder]);

  const handleTaskListDragOver = useCallback((e) => {
    const hasDrag = Array.from(e.dataTransfer?.types || []).includes('text/task-idx');
    if (!hasDrag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  if (!visible) return null;

  // Detect standalone window mode: electronAPI.closeWindow exists in the workspace preload
  const isStandalone = !!(window.electronAPI && window.electronAPI.closeWindow && !window.electronAPI.toggleWorkspaceWindow);

  return (
    <div className={isStandalone ? "wp-window-root" : "wp-backdrop"} ref={backdropRef} onClick={isStandalone ? undefined : handleBackdropClick}>
      <div className={isStandalone ? "wp-modal wp-modal-window" : "wp-modal wp-modal-overlay"} ref={panelRef} tabIndex={-1} style={{ outline: 'none' }}>
        {/* ── Body: vertical tab rail + content ── */}
        <div className="wp-body">
          {/* ── Left: Tab Rail ── */}
          <div className="wp-tab-rail">
            <button
              className={`wp-tab-item${activeTab === 'agent' ? ' active' : ''}`}
              onClick={() => setActiveTab('agent')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
              </svg>
              {activeSessions.length > 0 && <span className="wp-tab-count">{activeSessions.length}</span>}
            </button>
            <button
              className={`wp-tab-item${activeTab === 'reminders' ? ' active' : ''}`}
              onClick={() => setActiveTab('reminders')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
              {activeReminderCount > 0 && <span className="wp-tab-count">{activeReminderCount}</span>}
            </button>
            <button
              className={`wp-tab-item${activeTab === 'tasks' ? ' active' : ''}`}
              onClick={() => setActiveTab('tasks')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
              {activeTasks.length > 0 && <span className="wp-tab-count">{activeTasks.length}</span>}
            </button>
            <div className="wp-tab-spacer" />
            <button className="wp-tab-close-btn" onClick={onClose} title={t('Close', 'Close')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* ── Divider ── */}
          <div className="wp-divider" />

          {/* ── Right: Content area ── */}
          <div className="wp-content">
            {/* ── Agent Sessions tab ── */}
            {activeTab === 'agent' && (
              <>
                <div className="wp-content-header">
                  <span className="wp-content-title">{t('Sessions', 'Sessions')}</span>
                  <span className="wp-content-count">{activeSessions.length}</span>
                  <button className="wp-content-add" onClick={() => onSessionCreate?.()}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
                    <span>{t('Chat', 'Chat')}</span>
                  </button>
                </div>
                {/* Filter tabs */}
                <div className="wp-filter-bar">
                  {['all', 'internal', 'external'].map(f => (
                    <button
                      key={f}
                      className={`wp-filter-tab${sessionFilter === f ? ' active' : ''}`}
                      onClick={() => setSessionFilter(f)}
                    >
                      {f === 'all' ? t('All', 'All') : f === 'internal' ? t('Internal', 'Internal') : t('External', 'External')}
                    </button>
                  ))}
                </div>
                <div className="wp-scroll-area">
                  {activeSessions
                    .filter(s => sessionFilter === 'all' ? true
                      : sessionFilter === 'internal' ? s.source === 'cloe-desktop'
                      : s.source !== 'cloe-desktop')
                    .map(s => (
                      <SessionCard
                        key={s.id}
                        session={s}
                        onSetTitle={onSessionSetTitle}
                        onCancel={onSessionCancel}
                        onMute={onSessionMute}
                        onOpen={onSessionOpen}
                        onDelete={onSessionDelete}
                      />
                    ))}
                  {activeSessions.length === 0 && (
                    <div className="wp-empty">
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
                      </svg>
                      <p>{t('No sessions', 'No sessions')}</p>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── Reminders tab ── */}
            {activeTab === 'reminders' && (
              <>
                <div className="wp-content-header">
                  <span className="wp-content-title">{t('Reminders', 'Reminders')}</span>
                  <span className="wp-content-count">{activeReminderCount}</span>
                  <button className="wp-content-add" onClick={() => { setEditingReminder(null); setShowReminderForm(true); }}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
                    <span>{t('Add', 'Add')}</span>
                  </button>
                </div>
                <div className="wp-scroll-area">
                  {activeReminders.map(r => (
                    <ReminderCard
                      key={r.id}
                      reminder={r}
                      onToggle={onReminderToggle}
                      onPauseResume={onReminderPauseResume}
                      onDismiss={onReminderDismiss}
                      onDelete={onReminderDelete}
                      onEdit={(rm) => { setEditingReminder(rm); setShowReminderForm(true); }}
                    />
                  ))}
                  {activeReminders.length === 0 && (
                    <div className="wp-empty">
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                      </svg>
                      <p>{t('No reminders', 'No reminders')}</p>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── Tasks tab ── */}
            {activeTab === 'tasks' && (
              <>
                <div className="wp-content-header">
                  <span className="wp-content-title">{t('Tasks', 'Tasks')}</span>
                  <span className="wp-content-count">{activeTasks.length}</span>
                </div>
                <AddTaskInput onAdd={onTaskCreate} />
                {allTaskTags.length > 0 && (
                  <div className="wp-tag-filter-bar">
                    <button
                      className={`wp-tag-filter-chip${!effectiveTagFilter ? ' active' : ''}`}
                      onClick={() => setTaskTagFilter(null)}
                    >
                      {t('All', 'All')}
                    </button>
                    {allTaskTags.map((tag) => (
                      <button
                        key={tag}
                        className={`wp-tag-filter-chip${effectiveTagFilter && effectiveTagFilter.toLowerCase() === tag.toLowerCase() ? ' active' : ''}`}
                        onClick={() => setTaskTagFilter(effectiveTagFilter && effectiveTagFilter.toLowerCase() === tag.toLowerCase() ? null : tag)}
                      >
                        #{tag}
                      </button>
                    ))}
                  </div>
                )}
                <div
                  className="wp-scroll-area wp-scroll-tasks"
                  ref={taskListRef}
                  onDragOver={handleTaskListDragOver}
                  onDrop={handleTaskListDrop}
                >
                  {pendingTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      dragIndex={activeTaskIndexById.has(task.id) ? activeTaskIndexById.get(task.id) : -1}
                      isTiming={timingId === task.id}
                      onToggleComplete={onTaskToggleComplete}
                      onStartStop={onTaskStartStop}
                      onEdit={(tk) => setEditingTask(tk)}
                      onDelete={onTaskDelete}
                    />
                  ))}
                  {completedTasks.length > 0 && (
                    <div className="wp-task-section">
                      <div className="wp-task-section-title">
                        {t('Completed', 'Completed')}
                        <span className="wp-task-section-count">{completedTasks.length}</span>
                      </div>
                      {completedTasks.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          dragIndex={-1}
                          isTiming={timingId === task.id}
                          onToggleComplete={onTaskToggleComplete}
                          onStartStop={onTaskStartStop}
                          onEdit={(tk) => setEditingTask(tk)}
                          onDelete={onTaskDelete}
                        />
                      ))}
                    </div>
                  )}
                  {activeTasks.length === 0 && (
                    <div className="wp-empty">
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                      </svg>
                      <p>{t('No tasks yet', 'No tasks yet')}</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Task Editor modal ── */}
      {editingTask && (
        <TaskEditor
          task={editingTask}
          onSave={(id, data) => { onTaskUpdate(id, data); setEditingTask(null); }}
          onCancel={() => setEditingTask(null)}
        />
      )}

      {/* ── Reminder Form modal ── */}
      {showReminderForm && (
        <ReminderFormModal
          reminder={editingReminder}
          availableActions={availableActions}
          onSave={(data) => {
            onReminderCreate(data);
            setShowReminderForm(false);
            setEditingReminder(null);
          }}
          onCancel={() => { setShowReminderForm(false); setEditingReminder(null); }}
        />
      )}
    </div>
  );
}

// ==================== Add Task Input ====================

function AddTaskInput({ onAdd }) {
  const [value, setValue] = useState('');
  const [tags, setTags] = useState([]);
  const [tagDraft, setTagDraft] = useState('');
  const [tagEditing, setTagEditing] = useState(false);
  const inputRef = useRef(null);
  const tagInputRef = useRef(null);

  const startTagEdit = () => {
    setTagEditing(true);
    requestAnimationFrame(() => tagInputRef.current?.focus());
  };

  const commitTagDraft = () => {
    const parts = tagDraft.split(/[,，\s]+/).map(s => s.trim()).filter(Boolean);
    if (parts.length) {
      setTags(prev => {
        const lower = new Set(prev.map(x => x.toLowerCase()));
        const merged = [...prev];
        for (const p of parts) {
          if (!lower.has(p.toLowerCase())) { lower.add(p.toLowerCase()); merged.push(p); }
        }
        return merged;
      });
    }
    setTagDraft('');
    // Stay in edit mode so multiple tags can be typed consecutively.
    // Clicking away (blur with empty draft) collapses back to the # button.
  };

  const onTagBlur = () => {
    if (tagDraft.trim()) commitTagDraft();
    // Defer collapse so a click on the × of a chip isn't eaten
    setTimeout(() => { if (!tagInputRef.current) return; setTagEditing(false); }, 120);
  };

  const removeTag = (idx) => setTags(prev => prev.filter((_, i) => i !== idx));

  const handleAdd = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const finalTags = tagDraft.trim()
      ? [...tags, ...tagDraft.split(/[,，\s]+/).map(s => s.trim()).filter(Boolean)]
      : tags;
    onAdd(trimmed, finalTags);
    setValue('');
    if (inputRef.current) inputRef.current.focus();
  };

  const hasTags = tags.length > 0;

  const addBtn = (
    <button
      className="wp-add-inline-btn"
      onClick={handleAdd}
      disabled={!value.trim()}
      title={t('Add', 'Add')}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </button>
  );

  return (
    <div className="wp-add-box">
      <input
        ref={inputRef}
        className="wp-add-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); handleAdd(); }
          if (e.key === 'Backspace' && !value && hasTags) {
            e.preventDefault(); removeTag(tags.length - 1);
          }
        }}
        placeholder={t('Add new task…', 'Add new task…')}
      />
      <div className="wp-add-tagrow">
        <div className="wp-add-tagrow-left">
          {tags.map((tag, i) => (
            <span key={i} className="wp-tag-chip wp-tag-removable">
              #{tag}
              <button type="button" onClick={() => removeTag(i)} title={t('Remove', 'Remove')}>×</button>
            </span>
          ))}
          {tagEditing ? (
            <span className="wp-tag-edit-wrap">
              <span className="wp-tag-edit-hash">#</span>
              <input
                ref={tagInputRef}
                className="wp-add-tag-inline"
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onBlur={onTagBlur}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
                    e.preventDefault(); commitTagDraft();
                  }
                  if (e.key === 'Backspace' && !tagDraft && hasTags) {
                    e.preventDefault(); removeTag(tags.length - 1);
                  }
                  if (e.key === 'Escape') { e.preventDefault(); setTagDraft(''); setTagEditing(false); }
                }}
                placeholder={t('tag', 'tag')}
              />
            </span>
          ) : (
            <button type="button" className="wp-tag-add-btn" onClick={startTagEdit} title={t('Add tag', 'Add tag')}>
              {hasTags ? '#' : t('# Add tag', '# Add tag')}
            </button>
          )}
        </div>
        {addBtn}
      </div>
    </div>
  );
}
