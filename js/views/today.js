// ═══════════════════════════════════════════════════
//  Nexus — Today View
// ═══════════════════════════════════════════════════
import {
  formatTime, localDateKey, todayKey, escapeHTML,
  curMonthKey, WEEKLY_TEMPLATE
} from '../utils.js';
import { Store } from '../store.js';

export function today() {
    const data = Store.get();
    const todayDate = todayKey();
    const dayName = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

    // Today's vault daily log
    const todayLog = (window.App.vaultDailyEntries || []).find(d => d.date === todayDate);

    // Due / overdue vault tasks
    const vt = window.App.vaultTasks;
    let overdueTasks = [];
    let dueTodayTasks = [];
    let activeTasks = [];
    if (vt) {
      const allPending = [...(vt.active || []), ...(vt.exam || []), ...(vt.backlog || []), ...(vt.other || [])];
      overdueTasks = allPending.filter(t => t.dueDate && t.dueDate < todayDate);
      dueTodayTasks = allPending.filter(t => t.dueDate === todayDate);
      activeTasks = (vt.active || []).filter(t => !t.dueDate || t.dueDate > todayDate).slice(0, 5);
    }

    // Nexus tasks (open)
    const openTasks = data.tasks.filter(t => !t.done).slice(-5).reverse();

    // Strategy: current month allocation
    const now = new Date();
    const _cmk = curMonthKey();
    const curAlloc = data.strategy.allocations[_cmk] || {};
    const examDate = data.strategy.examDate ? new Date(data.strategy.examDate) : null;
    const daysLeft = examDate ? Math.max(0, Math.ceil((examDate - now) / 864e5)) : null;

    // Schedule
    const userSchedule = data.strategy.schedule || WEEKLY_TEMPLATE;
    const schedLog = data.scheduleLog || {};
    const todaySchedLog = schedLog[todayDate] || {};
    const schedDone = Object.keys(todaySchedLog).filter(k => todaySchedLog[k]).length;
    const scheduleHTML = userSchedule.map((slot, idx) => {
      const checked = todaySchedLog['slot-' + idx];
      const schedProj = (data.strategy.projects || []).find(p => p.id === slot.stream || p.name === slot.stream);
      const color = schedProj ? schedProj.color : slot.stream === 'flex' ? 'var(--accent)' : 'var(--text-dim)';
      const streak = schedSlotStreak(idx);
      const timeLabel = slot.time === 'Anytime' ? '<span style="font-style:italic; opacity:0.7;">Anytime</span>' : (formatTime(slot.time) || slot.time);
      return `<div class="today-sched-row ${checked ? 'sched-done' : ''}" style="align-items:center;"
        draggable="true"
        ondragstart="App.onSchedDragStart(event, ${idx})"
        ondragover="event.preventDefault(); this.style.borderTop='2px solid var(--accent)'"
        ondragleave="this.style.borderTop=''"
        ondrop="this.style.borderTop=''; App.onSchedDrop(event, ${idx})">
        <input type="checkbox" class="sched-check" ${checked ? 'checked' : ''} onclick="event.stopPropagation(); App.toggleScheduleSlot(${idx})" style="accent-color:${color}; cursor:pointer; flex-shrink:0;">
        <span class="today-sched-time" style="color:${color};">${timeLabel}</span>
        <span style="flex:1;" class="${checked ? 'sched-activity-done' : ''}">${escapeHTML(slot.activity)}</span>
        ${streak > 0 ? `<span class="habit-streak" title="${streak}-day streak"><span class="habit-streak-fire">&#128293;</span>${streak}d</span>` : ''}
      </div>`;
    }).join('');

    function miniTaskItem(t, isVault) {
      const safeSource = isVault && t.source ? t.source.replace(/'/g, "\\'") : '';
      const check = isVault
        ? `<div class="item-check ${t.done ? 'done' : ''}" onclick="App.toggleVaultTask('${safeSource}', ${t.line})"></div>`
        : `<div class="item-check ${t.done ? 'done' : ''}" onclick="App.toggleTask('${t.id}')"></div>`;
      const overdue = isVault && t.dueDate && t.dueDate < todayDate ? ' vtask-overdue' : '';
      const dueLabel = isVault && t.dueDate ? `<span class="vtask-due${overdue}">${t.dueDate}</span>` : '';
      return `<div class="item">${check}<div class="item-body"><div class="item-title">${escapeHTML(t.text)}</div><div class="item-meta">${dueLabel}</div></div></div>`;
    }

    // Timer state
    const ts = window.App.timerState || {};
    let timerDisplay, timerPct;
    if (ts.mode === 'stopwatch') {
      const e = ts.elapsed || 0;
      const h = Math.floor(e / 3600);
      const m = Math.floor((e % 3600) / 60);
      const s = e % 60;
      timerDisplay = h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
      timerPct = (e % 60) / 60 * 100;
    } else {
      const timerMins = Math.floor((ts.seconds || 0) / 60);
      const timerSecs = (ts.seconds || 0) % 60;
      timerDisplay = `${String(timerMins).padStart(2, '0')}:${String(timerSecs).padStart(2, '0')}`;
      timerPct = ts.total ? Math.round(((ts.total - (ts.seconds || 0)) / ts.total) * 100) : 0;
    }

    // Schedule slot streak helper
    function schedSlotStreak(idx) {
      let streak = 0;
      const d = new Date();
      for (let i = 0; i < 60; i++) {
        const dk = localDateKey(d);
        if ((schedLog[dk] || {})['slot-' + idx]) { streak++; d.setDate(d.getDate() - 1); }
        else break;
      }
      return streak;
    }

    // Spaced repetition: topics due for review
    const topicsDue = window.App.getTopicsDue ? window.App.getTopicsDue() : [];

    return `
      <h1 class="view-title">${dayName}</h1>
      <p class="view-subtitle">${daysLeft !== null ? daysLeft + ' days to exam &middot; ' : ''}Focus: ${curAlloc.exam || 0}% exam</p>

      <!-- Quick Add -->
      <div class="today-quick-add">
        <input type="text" id="today-quick-input" placeholder="Quick capture... (press Enter)"
          onkeydown="if(event.key==='Enter'){App.todayQuickAdd(); event.preventDefault();}">
        <button class="btn btn-primary btn-sm" onclick="App.todayQuickAdd()">Add</button>
      </div>

      <!-- Study Timer -->
      <div class="card timer-card">
        <div class="strat-section-label">Study Timer</div>
        <div style="font-size:11px; color:var(--text-dim); margin-bottom:8px;">Start a timer to log study sessions. Sessions appear in Growth &gt; Session History.</div>
        <div class="timer-display">
          <div class="timer-progress-ring">
            <svg viewBox="0 0 100 100" width="120" height="120">
              <circle cx="50" cy="50" r="44" fill="none" stroke="var(--border)" stroke-width="6"/>
              <circle cx="50" cy="50" r="44" fill="none" stroke="${ts.mode === 'stopwatch' ? '#4ecdc4' : 'var(--accent)'}" stroke-width="6"
                stroke-dasharray="${2 * Math.PI * 44}" stroke-dashoffset="${2 * Math.PI * 44 * (1 - timerPct / 100)}"
                transform="rotate(-90 50 50)" stroke-linecap="round" style="transition: stroke-dashoffset 0.5s"/>
            </svg>
            <div class="timer-time">${timerDisplay}</div>
          </div>
        </div>
        <div class="timer-controls">
          ${ts.completed ? `
            <div style="text-align:center; margin-bottom:8px; color:var(--accent); font-weight:600;">✓ ${ts.completedDuration}min ${ts.completedType} done!</div>
            <input type="text" id="timer-note" class="strat-settings-input" placeholder="What did you study? (optional)" style="margin-bottom:8px; width:100%;" value="${escapeHTML(window.App._timerNote || '')}">
            <button class="btn btn-primary btn-sm" onclick="App.timerLogToCapture()">Log to Capture</button>
            <button class="btn btn-ghost btn-sm" onclick="App.timerDismiss()">Dismiss</button>
          ` : ts.running || (ts.seconds > 0 || ts.mode === 'stopwatch') ? `
            <input type="text" id="timer-note" class="strat-settings-input" placeholder="What are you studying? (optional)" style="margin-bottom:8px; width:100%;" value="${escapeHTML(window.App._timerNote || '')}"
              oninput="App._timerNote=this.value">
            ${ts.running ? `
              <button class="btn btn-ghost btn-sm" onclick="App.pauseTimer()">Pause</button>
              ${ts.mode === 'stopwatch' ? `<button class="btn btn-primary btn-sm" onclick="App.stopTimer()">Stop</button>` : `<button class="btn btn-ghost btn-sm" style="color:var(--red);" onclick="App.stopCountdownEarly()">Stop Early</button>`}
              <button class="btn btn-ghost btn-sm" onclick="App.resetTimer()">Reset</button>
            ` : `
              <button class="btn btn-primary btn-sm" onclick="App.resumeTimer()">Resume</button>
              ${ts.mode === 'stopwatch' ? `<button class="btn btn-primary btn-sm" onclick="App.stopTimer()">Stop</button>` : `<button class="btn btn-ghost btn-sm" style="color:var(--red);" onclick="App.stopCountdownEarly()">Stop Early</button>`}
              <button class="btn btn-ghost btn-sm" onclick="App.resetTimer()">Reset</button>
            `}
          ` : `
            <div class="timer-presets">
              <button class="btn btn-primary btn-sm" onclick="App._pomodoroAuto=true; App._pomodoroCount=0; App.startTimer(25, 'Pomodoro')">25m</button>
              <button class="btn btn-ghost btn-sm" onclick="App.startTimer(45, 'Deep Work')">45m</button>
              <button class="btn btn-ghost btn-sm" onclick="App.startTimer(15, 'Short')">15m</button>
            </div>
            <label style="font-size:11px; color:var(--text-dim); display:flex; align-items:center; gap:4px; cursor:pointer;">
              <input type="checkbox" ${window.App._pomodoroAuto ? 'checked' : ''} onchange="App._pomodoroAuto=this.checked" style="accent-color:var(--accent);"> Auto-cycle (25-5-25-5-25-15)
            </label>
            <div class="timer-custom-row">
              <input type="number" id="timer-custom-min" placeholder="Min" min="1" max="999" class="timer-custom-input"
                onkeydown="if(event.key==='Enter'){App.startCustomTimer(); event.preventDefault();}">
              <button class="btn btn-ghost btn-sm" onclick="App.startCustomTimer()">Start</button>
              <button class="btn btn-ghost btn-sm" onclick="App.startTimer(0, 'Stopwatch', 'stopwatch')" title="Count up">⏱ Stopwatch</button>
            </div>
          `}
        </div>
        ${ts.type && !ts.completed ? `<div style="font-size:11px; color:var(--text-dim); text-align:center; margin-top:4px;">${ts.type}${ts.mode === 'stopwatch' ? ' (counting up)' : ''}</div>` : ''}
        ${(() => {
          const todaySessions = (data.timer?.sessions || []).filter(s => s.date === todayDate);
          const todayStudyMins = todaySessions.reduce((sum, s) => sum + (s.duration || 0), 0);
          if (!todaySessions.length) return '';
          return `<div style="font-size:12px; color:var(--text-dim); text-align:center; margin-top:8px; border-top:1px solid var(--border); padding-top:8px;">
            Today: ${todayStudyMins}min across ${todaySessions.length} session${todaySessions.length !== 1 ? 's' : ''}
            ${todaySessions.map(s => `<span class="tag-badge-sm">${s.duration}m ${escapeHTML(s.type || '')}</span>`).join(' ')}
          </div>`;
        })()}
      </div>


      <!-- Topics Due for Review -->
      ${topicsDue.length > 0 ? `
        <div class="card today-alert-card" style="border-left:3px solid var(--amber);">
          <div class="strat-section-label" style="color:var(--amber);">Due for Review (${topicsDue.length})</div>
          <div class="item-list">
            ${topicsDue.map(t => `
              <div class="item" style="cursor:pointer;" onclick="App.markTopicReviewed('${t.id}')">
                <div class="item-check" style="background:var(--amber); opacity:0.6;"></div>
                <div class="item-body">
                  <div class="item-title">${escapeHTML(t.name)}</div>
                  <div class="item-meta">${t.category ? escapeHTML(t.category) + ' &middot; ' : ''}${t.status} &middot; last: ${t.lastStudied || 'never'}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${overdueTasks.length > 0 ? `
        <div class="card today-alert-card">
          <div class="strat-section-label" style="color:var(--red);">Overdue (${overdueTasks.length})</div>
          <div class="item-list">${overdueTasks.map(t => miniTaskItem(t, true)).join('')}</div>
        </div>
      ` : ''}

      ${dueTodayTasks.length > 0 ? `
        <div class="card">
          <div class="strat-section-label" style="color:var(--amber);">Due Today (${dueTodayTasks.length})</div>
          <div class="item-list">${dueTodayTasks.map(t => miniTaskItem(t, true)).join('')}</div>
        </div>
      ` : ''}

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
        <!-- Active Tasks -->
        <div class="card">
          <div class="strat-section-label">Active Tasks</div>
          ${activeTasks.length || openTasks.length ? `
            <div class="item-list">
              ${openTasks.map(t => miniTaskItem(t, false)).join('')}
              ${activeTasks.map(t => miniTaskItem(t, true)).join('')}
            </div>
          ` : '<div style="font-size:13px; color:var(--text-dim); padding:8px;">All clear!</div>'}
        </div>

        <!-- Schedule -->
        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <div class="strat-section-label" style="margin:0;">Habits</div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:11px; color:var(--text-dim);">${schedDone}/${userSchedule.length}</span>
              <span class="vtask-source" onclick="App._editSchedule=!App._editSchedule; App.render();">${window.App._editSchedule ? 'Done' : 'Edit'}</span>
            </div>
          </div>
          ${userSchedule.length > 0 ? (() => {
            const schedPct = Math.round((schedDone / userSchedule.length) * 100);
            return `<div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
              <div class="progress-bar" style="height:5px; flex:1;">
                <div class="progress-fill" style="width:${schedPct}%; background:${schedPct===100?'var(--green)':'var(--accent)'};"></div>
              </div>
              <span style="font-size:11px; color:${schedPct===100?'var(--green)':'var(--text-dim)'}; min-width:30px;">${schedPct}%</span>
            </div>`;
          })() : ''}
          ${scheduleHTML}
          ${window.App._editSchedule ? `
            <div style="margin-top:8px; border-top:1px solid var(--border); padding-top:8px;">
              <div style="font-size:11px; color:var(--text-dim); margin-bottom:6px;">Drag items above to reorder. Add new habits below:</div>
              <div class="strat-settings-row" style="margin-top:4px; flex-wrap:wrap; gap:6px;">
                <div style="display:flex; align-items:center; gap:4px;">
                  <input type="time" id="sched-new-time" class="strat-settings-input" style="width:110px;">
                  <label style="font-size:11px; color:var(--text-dim); display:flex; align-items:center; gap:3px; cursor:pointer; white-space:nowrap;">
                    <input type="checkbox" id="sched-anytime" onchange="document.getElementById('sched-new-time').disabled=this.checked;"> Anytime
                  </label>
                </div>
                <input type="text" id="sched-new-activity" class="strat-settings-input" placeholder="Activity" style="flex:1; min-width:120px;"
                  onkeydown="if(event.key==='Enter')App.addScheduleSlot()">
                <button class="btn btn-primary btn-sm" onclick="App.addScheduleSlot()">Add</button>
              </div>
              ${userSchedule.map((slot, idx) => `
                <div class="strat-settings-row" style="margin-top:4px;" draggable="true"
                  ondragstart="App.onSchedDragStart(event, ${idx})"
                  ondragover="event.preventDefault(); this.style.borderTop='2px solid var(--accent)'"
                  ondragleave="this.style.borderTop=''"
                  ondrop="this.style.borderTop=''; App.onSchedDrop(event, ${idx})">
                  <span style="font-size:12px; color:var(--text-dim); min-width:70px; cursor:grab;">&#9776; ${slot.time === 'Anytime' ? 'Anytime' : (formatTime(slot.time) || slot.time)}</span>
                  <span style="font-size:12px; flex:1;">${escapeHTML(slot.activity)}</span>
                  <button class="btn btn-ghost btn-sm" onclick="App.removeScheduleSlot(${idx})" style="color:var(--red);">&times;</button>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      </div>

      <!-- Today's Rapid Log -->
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <div class="strat-section-label" style="margin:0;">Today's Log</div>
          <span class="vtask-source" onclick="App.openVaultFile('02 Rapid logging.md')">Open in Vault</span>
        </div>
        ${todayLog && todayLog.lines.filter(l => l.trim()).length > 0 ? `
          <div class="vault-daily-lines">${todayLog.lines.filter(l => l.trim()).map(l => escapeHTML(l)).join('<br>')}</div>
        ` : '<div style="font-size:13px; color:var(--text-dim);">Nothing logged yet today. Use the quick add above.</div>'}
      </div>
    `;
  }
