// ═══════════════════════════════════════════════════
//  Nexus — Focus Mode View
// ═══════════════════════════════════════════════════
import { todayKey, escapeHTML } from '../utils.js';
import { Store } from '../store.js';

export function focus() {
    const data = Store.get();
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

    // Open tasks
    const openTasks = data.tasks.filter(t => !t.done).slice(-10).reverse();
    const vt = window.App.vaultTasks;
    let activeTasks = [];
    if (vt) {
      activeTasks = [...(vt.active || []), ...(vt.exam || [])].filter(t => !t.done).slice(0, 10);
    }

    function miniTaskItem(t, isVault) {
      const todayDate = todayKey();
      const safeSource = isVault && t.source ? t.source.replace(/'/g, "\\'") : '';
      const check = isVault
        ? `<div class="item-check ${t.done ? 'done' : ''}" onclick="App.toggleVaultTask('${safeSource}', ${t.line})"></div>`
        : `<div class="item-check ${t.done ? 'done' : ''}" onclick="App.toggleTask('${t.id}')"></div>`;
      return `<div class="item">${check}<div class="item-body"><div class="item-title">${escapeHTML(t.text)}</div></div></div>`;
    }

    return `
      <div class="focus-header">
        <h2>Focus Mode</h2>
        <button class="btn btn-ghost btn-sm" onclick="App.toggleFocusMode()">Exit Focus</button>
      </div>

      <!-- Timer -->
      <div class="card timer-card" style="max-width:400px; margin:0 auto;">
        <div class="timer-display">
          <div class="timer-progress-ring">
            <svg viewBox="0 0 100 100" width="160" height="160">
              <circle cx="50" cy="50" r="44" fill="none" stroke="var(--border)" stroke-width="6"/>
              <circle cx="50" cy="50" r="44" fill="none" stroke="${ts.mode === 'stopwatch' ? '#4ecdc4' : 'var(--accent)'}" stroke-width="6"
                stroke-dasharray="${2 * Math.PI * 44}" stroke-dashoffset="${2 * Math.PI * 44 * (1 - timerPct / 100)}"
                transform="rotate(-90 50 50)" stroke-linecap="round" style="transition: stroke-dashoffset 0.5s"/>
            </svg>
            <div class="timer-time" style="font-size:32px;">${timerDisplay}</div>
          </div>
        </div>
        <div class="timer-controls">
          ${ts.completed ? `
            <div style="text-align:center; margin-bottom:8px; color:var(--accent); font-weight:600;">✓ ${ts.completedDuration}min ${ts.completedType} done!</div>
            <input type="text" id="timer-note" class="strat-settings-input" placeholder="What did you study? (optional)" style="margin-bottom:8px; width:100%;" value="${escapeHTML(window.App._timerNote || '')}">
            <button class="btn btn-primary" onclick="App.timerLogToCapture()">Log to Capture</button>
            <button class="btn btn-ghost" onclick="App.timerDismiss()">Dismiss</button>
          ` : ts.running || (ts.seconds > 0 || ts.mode === 'stopwatch') ? `
            <input type="text" id="timer-note" class="strat-settings-input" placeholder="What are you studying? (optional)" style="margin-bottom:8px; width:100%;" value="${escapeHTML(window.App._timerNote || '')}"
              oninput="App._timerNote=this.value">
            ${ts.running ? `
              <button class="btn btn-ghost" onclick="App.pauseTimer()">Pause</button>
              ${ts.mode === 'stopwatch' ? `<button class="btn btn-primary" onclick="App.stopTimer()">Stop</button>` : `<button class="btn btn-ghost" style="color:var(--red);" onclick="App.stopCountdownEarly()">Stop Early</button>`}
              <button class="btn btn-ghost" onclick="App.resetTimer()">Reset</button>
            ` : `
              <button class="btn btn-primary" onclick="App.resumeTimer()">Resume</button>
              ${ts.mode === 'stopwatch' ? `<button class="btn btn-primary" onclick="App.stopTimer()">Stop</button>` : `<button class="btn btn-ghost" style="color:var(--red);" onclick="App.stopCountdownEarly()">Stop Early</button>`}
              <button class="btn btn-ghost" onclick="App.resetTimer()">Reset</button>
            `}
          ` : `
            <div class="timer-presets">
              <button class="btn btn-primary" onclick="App._pomodoroAuto=true; App._pomodoroCount=0; App.startTimer(25, 'Pomodoro')">25 min</button>
              <button class="btn btn-ghost" onclick="App.startTimer(45, 'Deep Work')">45 min</button>
              <button class="btn btn-ghost" onclick="App.startTimer(15, 'Short')">15 min</button>
            </div>
            <label style="font-size:11px; color:var(--text-dim); display:flex; align-items:center; gap:4px; cursor:pointer; margin-top:4px;">
              <input type="checkbox" ${window.App._pomodoroAuto ? 'checked' : ''} onchange="App._pomodoroAuto=this.checked" style="accent-color:var(--accent);"> Auto-cycle (25-5-25-5-25-15)
            </label>
            <div class="timer-custom-row">
              <input type="number" id="timer-custom-min" placeholder="Min" min="1" max="999" class="timer-custom-input"
                onkeydown="if(event.key==='Enter'){App.startCustomTimer(); event.preventDefault();}">
              <button class="btn btn-ghost" onclick="App.startCustomTimer()">Start</button>
              <button class="btn btn-ghost" onclick="App.startTimer(0, 'Stopwatch', 'stopwatch')" title="Count up">⏱ Stopwatch</button>
            </div>
          `}
        </div>
        ${ts.type && !ts.completed ? `<div style="font-size:11px; color:var(--text-dim); text-align:center; margin-top:4px;">${ts.type}${ts.mode === 'stopwatch' ? ' (counting up)' : ''}</div>` : ''}
      </div>

      <!-- Quick Add -->
      <div class="today-quick-add" style="max-width:400px; margin:16px auto;">
        <input type="text" id="today-quick-input" placeholder="Quick capture..."
          onkeydown="if(event.key==='Enter'){App.todayQuickAdd(); event.preventDefault();}">
        <button class="btn btn-primary btn-sm" onclick="App.todayQuickAdd()">Add</button>
      </div>

      <!-- Tasks -->
      <div class="card" style="max-width:500px; margin:0 auto;">
        <div class="strat-section-label">Tasks</div>
        <div class="item-list">
          ${openTasks.map(t => miniTaskItem(t, false)).join('')}
          ${activeTasks.map(t => miniTaskItem(t, true)).join('')}
          ${!openTasks.length && !activeTasks.length ? '<div style="font-size:13px; color:var(--text-dim); padding:8px;">All clear!</div>' : ''}
        </div>
      </div>
    `;
  }
