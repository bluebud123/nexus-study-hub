// ═══════════════════════════════════════════════════
//  Nexus — View Functions
// ═══════════════════════════════════════════════════
import {
  uid, timeAgo, formatDate, contrastColor, formatTime,
  localDateKey, todayKey, escapeHTML, toast,
  addMonths, curMonthKey, monthLabel, getRoadmapMonths,
  getGreeting, DEFAULT_ALLOC, DEFAULT_MILESTONES, WEEKLY_TEMPLATE,
  renderMarkdown, preprocessObsidian, updateStreak, parseChecklistMD
} from './utils.js';
import { VaultAPI } from './vault-api.js';
import { Store } from './store.js';

// App reference — set by entry point to break circular dependency
let App;
export function _setApp(a) { App = a; }

export const Views = {

  // ─── Dashboard ───────────────────────────────
  dashboard() {
    const data = Store.get();
    const openTasks = data.tasks.filter(t => !t.done).length;
    const nexusDone = data.tasks.filter(t => t.done).length;
    const doneTasks = (App.vaultStats ? App.vaultStats.completedTasks : 0) + nexusDone;
    const totalCaptures = data.captures.length;
    const journalEntries = (App.vaultStats ? App.vaultStats.totalDailyEntries : 0) + data.journal.length;
    const activeGoals = data.goals.length;

    // Compute real activity streak — same sources as Calendar view
    const activityDays = new Set();
    for (const j of data.journal) { if (j.date) activityDays.add(j.date); }
    for (const s of (data.timer?.sessions || [])) { if (s.date) activityDays.add(s.date); }
    for (const c of data.captures) {
      const d = localDateKey(new Date(c.created));
      activityDays.add(d);
    }
    for (const e of (App.vaultDailyEntries || [])) { if (e.date) activityDays.add(e.date); }
    for (const d of (App.vaultStats?.dailyDates || [])) { activityDays.add(d); }
    for (const [date, log] of Object.entries(data.scheduleLog || {})) {
      if (Object.values(log).some(v => v)) activityDays.add(date);
    }
    for (const [date, log] of Object.entries((data.habits?.log) || {})) {
      if (Object.values(log).some(v => v)) activityDays.add(date);
    }
    let currentStreak = 0;
    const streakCheck = new Date();
    // Grace-for-today: if today has no activity yet, start counting from yesterday
    if (!activityDays.has(localDateKey(streakCheck))) streakCheck.setDate(streakCheck.getDate() - 1);
    for (let i = 0; i < 365; i++) {
      const dk = localDateKey(streakCheck);
      if (activityDays.has(dk)) { currentStreak++; streakCheck.setDate(streakCheck.getDate() - 1); }
      else break;
    }

    const recentCaptures = data.captures.slice(-3).reverse();
    const recentTasks = data.tasks.filter(t => !t.done).slice(-5).reverse();

    // Goals summary for dashboard
    const activeGoalsList = (data.goals || []).filter(g => !g.achieved && !g.gaveUp);
    const achievedGoalsList = (data.goals || []).filter(g => g.achieved);

    // Today's habits summary
    const scheduleItems = data.strategy?.schedule || [];
    const todaySchedLog = (data.scheduleLog || {})[todayKey()] || {};
    const checkedHabitsToday = scheduleItems.filter((_, i) => todaySchedLog['slot-' + i]).length;
    const habitPctToday = scheduleItems.length ? Math.round(checkedHabitsToday / scheduleItems.length * 100) : 0;

    // Vault open tasks — #active only
    const taskSource = data.taskSource || 'both';
    const vaultOpenTasks = [];
    if (taskSource !== 'nexus' && App.vaultTasks) {
      vaultOpenTasks.push(...(App.vaultTasks.active || []).slice(0, 5));
    }
    const vaultPending = App.vaultTasks ? App.vaultTasks.summary.pending : 0;

    // Strategy summary
    const strat = data.strategy;
    const allMs = Object.values(strat.milestones).flat();
    const stratTotal = allMs.length;
    const stratDone = allMs.filter(m => m.done).length;
    const stratPct = stratTotal ? Math.round((stratDone / stratTotal) * 100) : 0;
    const examDate = strat.examDate ? new Date(strat.examDate) : null;
    const daysLeft = examDate ? Math.max(0, Math.ceil((examDate - new Date()) / 864e5)) : null;

    const layout = data.dashboardLayout || ['strategy-banner', 'stats-grid', 'open-tasks', 'recent-captures', 'suggestions', 'vault-insights', 'tag-cloud'];

    function dashCard(key, content) {
      if (!content) return '';
      return `<div class="dash-card" draggable="true" data-card="${key}"
        ondragstart="App.onDashDragStart(event, '${key}')"
        ondragover="event.preventDefault(); this.classList.add('drag-over')"
        ondragleave="this.classList.remove('drag-over')"
        ondrop="this.classList.remove('drag-over'); App.onDashDrop(event, '${key}')">${content}</div>`;
    }

    const cardRenderers = {
      'strategy-banner': () => {
        const s = Store.get().strategy;
        const clProjects = Store.get().checklists || [];
        const allMs = Object.values(s.milestones).flat();
        const doneMs = allMs.filter(m => m.done).length;
        return `
        <div class="card dash-strategy-banner">
          <div style="display:flex; flex-wrap:wrap; gap:12px; align-items:stretch;">
            ${clProjects.map(proj => {
              const dl = proj.deadline ? new Date(proj.deadline) : null;
              const dLeft = dl && !isNaN(dl) ? Math.max(0, Math.ceil((dl - new Date()) / 864e5)) : null;
              const clColor = proj.color || '#7c6ff7';
              return `
              <div style="flex:1; min-width:120px; padding:12px 16px; background:${clColor}; border:1px solid ${clColor}; border-radius:10px; cursor:pointer;" onclick="App.openStrategyProject('${proj.id}')">
                <div style="font-size:10px; color:${contrastColor(clColor)}; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; opacity:0.85;">${escapeHTML(proj.icon || '')} ${escapeHTML(proj.name)}</div>
                <div style="font-size:28px; font-weight:800; color:${contrastColor(clColor)}; line-height:1.1; margin:4px 0;">${dLeft !== null ? dLeft : '—'}</div>
                <div style="font-size:11px; color:${contrastColor(clColor)}; opacity:0.7;">${dLeft !== null ? 'days left' : 'no deadline'}</div>
              </div>`;
            }).join('')}
            <div style="flex:1; min-width:120px; padding:12px 16px; background:var(--bg-card); border:1px solid var(--border); border-radius:10px; cursor:pointer;" onclick="App.navigateTo('goals');">
              <div style="font-size:10px; color:var(--text-dim); font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">Goals</div>
              <div style="font-size:28px; font-weight:800; color:#a78bfa; line-height:1.1; margin:4px 0;">${activeGoalsList.length}</div>
              <div style="font-size:11px; color:var(--text-dim);">${activeGoalsList.length === 1 ? '1 active' : activeGoalsList.length + ' active'}${achievedGoalsList.length ? ' · ' + achievedGoalsList.length + ' achieved' : ''}</div>
              ${activeGoalsList.length ? `<div style="margin-top:6px; display:flex; flex-direction:column; gap:3px;">${activeGoalsList.slice(0,2).map(g => {
                const pct = g.target > 0 ? Math.min(100, Math.round(g.current/g.target*100)) : 0;
                return `<div><div style="font-size:10px; color:var(--text-dim); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100px;">${escapeHTML(g.text)}</div><div style="height:3px; background:var(--border); border-radius:2px; margin-top:2px;"><div style="height:3px; width:${pct}%; background:#a78bfa; border-radius:2px;"></div></div></div>`;
              }).join('')}</div>` : '<div style="font-size:11px; color:var(--text-dim); margin-top:4px;">Set a goal →</div>'}
            </div>
            <div style="flex:1; min-width:120px; padding:12px 16px; background:var(--bg-card); border:1px solid var(--border); border-radius:10px; cursor:pointer;" onclick="App.navigateTo('strategy');">
              <div style="font-size:10px; color:var(--text-dim); font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">Habits Today</div>
              <div style="font-size:28px; font-weight:800; color:#f472b6; line-height:1.1; margin:4px 0;">${checkedHabitsToday}<span style="font-size:14px; font-weight:400; color:var(--text-dim);">/${scheduleItems.length}</span></div>
              <div style="font-size:11px; color:var(--text-dim); margin-bottom:4px;">${scheduleItems.length === 0 ? 'No habits set' : habitPctToday === 100 ? 'All done! 🎉' : habitPctToday + '% complete'}</div>
              ${scheduleItems.length ? `<div class="progress-bar" style="margin-top:4px;"><div class="progress-fill" style="width:${habitPctToday}%; background:#f472b6;"></div></div>` : ''}
            </div>
          </div>
        </div>`;
      },

      'stats-grid': () => {
        const vaultActive = App.vaultTasks ? App.vaultTasks.summary.activeCount : 0;
        const openTaskCount = taskSource === 'nexus' ? openTasks
          : taskSource === 'vault' ? vaultActive
          : vaultActive + openTasks;  // 'both': sum vault + nexus
        return `
        <div class="stats-grid">
          <div class="stat-card stat-card-link" onclick="App.navigateTo('tasks');"><div class="stat-number">${openTaskCount}</div><div class="stat-label">Open Tasks <span style="font-size:10px; color:var(--text-dim);">(active)</span></div></div>
          <div class="stat-card stat-card-link" onclick="App._taskShowDone=true; App.navigateTo('tasks');"><div class="stat-number">${doneTasks}</div><div class="stat-label">Completed</div></div>
          <div class="stat-card stat-card-link" onclick="App.navigateTo('capture');"><div class="stat-number">${totalCaptures}</div><div class="stat-label">Captures</div></div>
          <div class="stat-card stat-card-link" onclick="App.navigateTo('journal');"><div class="stat-number">${journalEntries}</div><div class="stat-label">Journal</div></div>
        </div>`;
      },

      'open-tasks': () => {
        const showVault = taskSource !== 'nexus' && vaultOpenTasks.length > 0;
        const showNexus = taskSource !== 'vault' && recentTasks.length > 0;
        const emptyHint = taskSource === 'nexus' ? 'No Nexus tasks yet — add one in the Tasks view.' : taskSource === 'vault' ? 'No vault tasks found.' : 'No open tasks.';
        if (!showVault && !showNexus) return `<h3 style="margin-bottom:12px; font-size:16px; color:var(--text-dim);">Open Tasks</h3><div class="empty-state" style="padding:20px;"><div class="empty-text">${emptyHint}</div></div>`;
        return `
        <h3 style="margin-bottom:12px; font-size:16px; color:var(--text-dim);">Open Tasks</h3>
        ${showVault ? `
          <div class="item-list" style="margin-bottom:${showNexus ? 12 : 0}px;">
            ${vaultOpenTasks.map(t => {
              const safeSource = t.source ? t.source.replace(/'/g, "\\'") : '';
              return `<div class="item">
                <div class="item-check ${t.done ? 'done' : ''}" onclick="App.toggleVaultTask('${safeSource}', ${t.line})"></div>
                <div class="item-body">
                  <div class="item-title">${escapeHTML(t.text)}</div>
                  <div class="item-meta"><span class="vtask-source">vault</span>${t.dueDate ? ` <span class="vtask-due">${t.dueDate}</span>` : ''}</div>
                </div>
              </div>`;
            }).join('')}
          </div>
        ` : ''}
        ${showNexus ? `
          <div class="item-list">
            ${recentTasks.map(t => `<div class="item">
              <div class="item-check" onclick="App.toggleTask('${t.id}')"></div>
              <div class="item-body"><div class="item-title">${escapeHTML(t.text)}</div>
              <div class="item-meta"><span class="vtask-source">nexus</span></div></div>
            </div>`).join('')}
          </div>
        ` : ''}`;
      },

      'recent-captures': () => `
        <h3 style="margin-bottom:12px; font-size:16px; color:var(--text-dim);">Recent Captures</h3>
        ${recentCaptures.length ? `
          <div class="capture-grid">
            ${recentCaptures.map(c => `
              <div class="capture-card">
                <div class="capture-text">${escapeHTML(c.text)}</div>
                <div class="capture-time">${timeAgo(c.created)}</div>
              </div>
            `).join('')}
          </div>
        ` : '<div class="empty-state" style="padding:20px;"><div class="empty-text">Nothing captured yet.</div></div>'}`,

      'suggestions': () => {
        if (!App.vaultAvailable || !App.vaultSuggestions || !App.vaultSuggestions.suggestions || !App.vaultSuggestions.suggestions.length) return '';
        return `
          <div class="card" style="border-left: 3px solid var(--amber);">
            <div class="strat-section-label">Nexus Suggests</div>
            ${App.vaultSuggestions.suggestions.map(s => `
              <div class="suggestion-item">
                <span class="suggestion-icon">${s.icon}</span>
                <span class="suggestion-text">${escapeHTML(s.text)}</span>
                ${s.action === 'log' ? '<button class="btn btn-ghost btn-sm" onclick="document.querySelector(\'[data-view=capture]\').click()">Log</button>' : ''}
                ${s.action === 'review_tasks' ? '<button class="btn btn-ghost btn-sm" onclick="document.querySelector(\'[data-view=tasks]\').click()">Review</button>' : ''}
                ${s.action === 'monthly_review' ? '<button class="btn btn-ghost btn-sm" onclick="App.openVaultFile(\'03 Monthly log.md\')">Reflect</button>' : ''}
              </div>
            `).join('')}
          </div>`;
      },

      'vault-insights': () => {
        if (!App.vaultAvailable || !App.vaultStats) return '';
        return `
          <h3 style="margin:20px 0 12px; font-size:16px; color:var(--text-dim);">Vault Insights</h3>
          <div class="stats-grid">
            <div class="stat-card" onclick="document.querySelector('[data-view=vault]').click()" style="cursor:pointer;">
              <div class="stat-number" style="color:var(--green);">${App.vaultStats.totalFiles}</div>
              <div class="stat-label">Vault Files</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${App.vaultStats.totalDailyEntries}</div>
              <div class="stat-label">Daily Entries</div>
            </div>
            <div class="stat-card" onclick="document.querySelector('[data-view=tasks]').click()" style="cursor:pointer;">
              <div class="stat-number">${App.vaultTasks ? App.vaultTasks.summary.pending : App.vaultStats.pendingTasks}</div>
              <div class="stat-label">Vault Pending</div>
            </div>
            <div class="stat-card" onclick="document.querySelector('[data-view=growth]').click()" style="cursor:pointer;">
              <div class="stat-number">${App.vaultStats.entriesThisWeek}</div>
              <div class="stat-label">Journal This Week</div>
            </div>
          </div>`;
      },

      'tag-cloud': () => {
        // Merge vault tags + app capture tags for real-time updates
        const combined = { ...(App.vaultStats?.tagCounts || {}) };
        for (const c of (data.captures || [])) {
          for (const t of (c.text.match(/#(\w+)/g) || [])) {
            const tag = t.slice(1).toLowerCase();
            combined[tag] = (combined[tag] || 0) + 1;
          }
        }
        if (!Object.keys(combined).length) return '';
        return `
          <div class="card">
            <div class="strat-section-label">Top Tags</div>
            <div class="vault-tag-cloud">
              ${Object.entries(combined)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 15)
                .map(([tag, count]) => {
                  const size = count > 50 ? 'lg' : count > 15 ? 'md' : 'sm';
                  return `<span class="vault-tag vault-tag-${size}" onclick="App.vaultSearchByTag('${tag}')">#${escapeHTML(tag)} <small>${count}</small></span>`;
                }).join(' ')}
            </div>
          </div>`;
      },
    };

    const cardsHTML = layout
      .filter(key => cardRenderers[key])
      .map(key => dashCard(key, cardRenderers[key]()))
      .filter(html => html)
      .join('');

    return `
      <h1 class="view-title">Dashboard</h1>
      <p class="view-subtitle">${getGreeting(data.userName)}</p>

      ${currentStreak > 0 ? `
        <div class="streak-display">
          <span class="streak-fire">&#128293;</span>
          ${currentStreak} day streak — keep it going!
        </div>
      ` : ''}

      <div id="dashboard-cards">${cardsHTML}</div>
    `;
  },

  // ─── Today ──────────────────────────────────
  today() {
    const data = Store.get();
    const todayDate = todayKey();
    const dayName = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

    // Today's vault daily log
    const todayLog = (App.vaultDailyEntries || []).find(d => d.date === todayDate);

    // Due / overdue vault tasks
    const vt = App.vaultTasks;
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
    const ts = App.timerState || {};
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
    const topicsDue = App.getTopicsDue ? App.getTopicsDue() : [];

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
            <input type="text" id="timer-note" class="strat-settings-input" placeholder="What did you study? (optional)" style="margin-bottom:8px; width:100%;" value="${escapeHTML(App._timerNote || '')}">
            <button class="btn btn-primary btn-sm" onclick="App.timerLogToCapture()">Log to Capture</button>
            <button class="btn btn-ghost btn-sm" onclick="App.timerDismiss()">Dismiss</button>
          ` : ts.running || (ts.seconds > 0 || ts.mode === 'stopwatch') ? `
            <input type="text" id="timer-note" class="strat-settings-input" placeholder="What are you studying? (optional)" style="margin-bottom:8px; width:100%;" value="${escapeHTML(App._timerNote || '')}"
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
              <input type="checkbox" ${App._pomodoroAuto ? 'checked' : ''} onchange="App._pomodoroAuto=this.checked" style="accent-color:var(--accent);"> Auto-cycle (25-5-25-5-25-15)
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
              <span class="vtask-source" onclick="App._editSchedule=!App._editSchedule; App.render();">${App._editSchedule ? 'Done' : 'Edit'}</span>
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
          ${App._editSchedule ? `
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
  },

  // ─── Capture ─────────────────────────────────
  capture() {
    const data = Store.get();
    let captures = [...data.captures].reverse();

    // Extract all tags across captures
    const allTags = {};
    for (const c of captures) {
      const tags = c.text.match(/#\w+/g) || [];
      for (const t of tags) allTags[t.toLowerCase()] = (allTags[t.toLowerCase()] || 0) + 1;
    }
    const tagList = Object.entries(allTags).sort((a, b) => b[1] - a[1]);

    // Filter by tag if active
    const activeTag = App.captureTagFilter || '';
    if (activeTag) {
      captures = captures.filter(c => c.text.toLowerCase().includes(activeTag));
    }

    // Pinned first
    captures.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

    return `
      <h1 class="view-title">Capture <button class="btn btn-ghost btn-sm" onclick="App.exportCaptures()" style="font-size:11px; vertical-align:middle; margin-left:8px;">⬇ Export .md</button></h1>
      <p class="view-subtitle">Quick thoughts, ideas, anything — get it out of your head</p>

      <div style="margin-bottom:20px;">
        <textarea id="capture-input" placeholder="What's on your mind? Use #tags to categorize (Enter to save, Ctrl+Enter for new line)" rows="3"
          onkeydown="if(event.key==='Enter'){if(event.ctrlKey||event.shiftKey){return;}App.addCapture(); event.preventDefault();}"></textarea>
        <div style="margin-top:10px; display:flex; justify-content:space-between; align-items:center;">
          ${App.vaultAvailable ? `
            <label class="vault-toggle-label">
              <input type="checkbox" id="capture-vault-toggle" checked>
              <span>Also log to vault</span>
            </label>
          ` : '<div></div>'}
          <button class="btn btn-primary" onclick="App.addCapture()">Capture</button>
        </div>
      </div>

      ${tagList.length ? `
        <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:16px;">
          <span class="tag-badge ${!activeTag ? 'tag-active' : ''}" onclick="App.captureTagFilter=''; App.render();">All</span>
          ${tagList.map(([tag, count]) => `
            <span class="tag-badge ${activeTag === tag ? 'tag-active' : ''}" onclick="App.captureTagFilter=${JSON.stringify(tag)}; App.render();">${tag} (${count})</span>
          `).join('')}
        </div>
      ` : ''}

      ${captures.length ? `
        <div class="capture-grid">
          ${captures.map(c => {
            const tags = c.text.match(/#\w+/g) || [];
            return `
            <div class="capture-card ${c.pinned ? 'capture-pinned' : ''}">
              <div class="capture-actions-row">
                <button class="capture-action-btn" onclick="App.togglePinCapture('${c.id}')" title="${c.pinned ? 'Unpin' : 'Pin'}">${c.pinned ? '&#9733;' : '&#9734;'}</button>
                <button class="capture-action-btn" onclick="App.captureToTask('${c.id}')" title="Convert to task">&#8594;T</button>
                <button class="item-delete" onclick="App.deleteCapture('${c.id}')">&times;</button>
              </div>
              ${App._editingCapture === c.id ? `
                <textarea id="edit-capture-${c.id}" class="capture-edit-area" rows="3" onkeydown="if(event.key==='Enter'&&!event.ctrlKey&&!event.shiftKey){App.saveEditCapture('${c.id}');event.preventDefault();} if(event.key==='Escape'){App._editingCapture=null;App.render();}">${escapeHTML(c.text)}</textarea>
                <div style="display:flex;gap:6px;margin-top:6px;">
                  <button class="btn btn-primary btn-sm" onclick="App.saveEditCapture('${c.id}')">Save</button>
                  <button class="btn btn-ghost btn-sm" onclick="App._editingCapture=null;App.render();">Cancel</button>
                </div>
              ` : `
                <div class="capture-text" ondblclick="App._editingCapture='${c.id}';App.render();setTimeout(()=>{const t=document.getElementById('edit-capture-${c.id}');if(t){t.focus();t.selectionStart=t.value.length;}},50);">${escapeHTML(c.text)}</div>
              `}
              <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
                <div class="capture-time">${formatDate(c.created)}</div>
                <div style="display:flex; gap:4px; align-items:center;">
                  ${App._editingCapture !== c.id ? `<button class="btn btn-ghost btn-sm" style="font-size:10px; padding:2px 6px;" onclick="App._editingCapture='${c.id}';App.render();setTimeout(()=>{const t=document.getElementById('edit-capture-${c.id}');if(t){t.focus();t.selectionStart=t.value.length;}},50);">Edit</button>` : ''}
                  ${tags.length ? tags.map(t => `<span class="tag-badge-sm">${t}</span>`).join('') : ''}
                </div>
              </div>
            </div>`;
          }).join('')}
        </div>
      ` : `
        <div class="empty-state">
          <div class="empty-icon">&#9889;</div>
          <div class="empty-text">${activeTag ? 'No captures with this tag.' : 'Your captures will appear here. Type anything above and hit Capture!'}</div>
        </div>
      `}
    `;
  },

  // ─── Tasks ───────────────────────────────────
  tasks() {
    const data = Store.get();
    const filter = App.taskFilter || 'active';
    let tasks = [...data.tasks].reverse();

    if (filter === 'done') tasks = tasks.filter(t => t.done);
    else {
      // Default (active): undone first (with #active tagged at top), then done at bottom
      tasks = tasks.filter(t => !t.done);
    }

    // Vault tasks
    const vt = App.vaultTasks;
    const vtab = App.vaultTaskTab || 'active';
    const vtSummary = vt ? vt.summary : null;

    function vaultTaskItem(t) {
      const tagPills = (t.tags || []).map(tag =>
        `<span class="tag tag-accent">#${escapeHTML(tag)}</span>`
      ).join(' ');
      const due = t.dueDate ? `<span class="vtask-due${new Date(t.dueDate) < new Date() && !t.done ? ' vtask-overdue' : ''}">\u{1F4C5} ${t.dueDate}</span>` : '';
      const pri = t.priority !== 'normal' ? `<span class="vtask-pri vtask-pri-${t.priority}">${t.priority}</span>` : '';
      const source = t.source ? `<span class="vtask-source" onclick="event.stopPropagation();App.openVaultFile('${t.source.replace(/'/g, "\\'")}')" title="${escapeHTML(t.source)}">${escapeHTML(t.source.replace('.md','').split('/').pop())}</span>` : '';
      const safeSource = t.source ? t.source.replace(/'/g, "\\'") : '';
      return `
        <div class="item vtask-item">
          <div class="item-check ${t.done ? 'done' : ''}" onclick="App.toggleVaultTask('${safeSource}', ${t.line})"></div>
          <div class="item-body">
            <div class="item-title ${t.done ? 'done' : ''}">${escapeHTML(t.text)}</div>
            <div class="item-meta">${tagPills} ${due} ${pri} ${source} ${t.doneDate ? `<span class="vtask-done">\u2705 ${t.doneDate}</span>` : ''}</div>
          </div>
        </div>`;
    }

    let vaultTaskList = [];
    if (vt) {
      if (vtab === 'active') vaultTaskList = vt.active || [];
      else if (vtab === 'exam') vaultTaskList = vt.exam || [];
      else if (vtab === 'backlog') vaultTaskList = vt.backlog || [];
      else if (vtab === 'other') vaultTaskList = vt.other || [];
      else if (vtab === 'archived') vaultTaskList = vt.archived || [];
    }

    const taskSrc = data.taskSource || 'both';
    const nexusOpen = data.tasks.filter(t => !t.done).length;
    const vaultActive = App.vaultTasks ? App.vaultTasks.summary.activeCount : 0;
    const totalOpen = taskSrc === 'nexus' ? nexusOpen : taskSrc === 'vault' ? vaultActive : nexusOpen + vaultActive;
    return `
      <h1 class="view-title">Tasks ${totalOpen > 0 ? `<span style="font-size:14px; font-weight:600; color:var(--accent); background:var(--accent)18; border-radius:12px; padding:2px 10px; vertical-align:middle;">${totalOpen} open</span>` : ''}</h1>
      <p class="view-subtitle">Track what needs to get done</p>

      <div class="input-row">
        <input type="text" id="task-input" placeholder="Add a task..." style="flex:1;" onkeydown="if(event.key==='Enter')App.addTask()">
        <input type="text" id="task-category" placeholder="Category" style="max-width:100px;" onkeydown="if(event.key==='Enter')App.addTask()">
        <input type="date" id="task-due" class="strat-settings-input" style="max-width:130px;" title="Due date (optional)">
        <select id="task-recurring" class="strat-settings-input" style="max-width:90px;" title="Repeat (optional)">
          <option value="">Once</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </select>
        <button class="btn btn-primary" onclick="App.addTask()">Add</button>
      </div>

      ${taskSrc !== 'vault' ? `
      <div class="filter-tabs" style="display:flex; align-items:center;">
        <span class="filter-tab ${filter==='active'?'active':''}" onclick="App.setTaskFilter('active')">Active (${data.tasks.filter(t=>!t.done).length})</span>
        <span class="filter-tab ${filter==='done'?'active':''}" onclick="App.setTaskFilter('done')">Done (${data.tasks.filter(t=>t.done).length})</span>
        ${filter === 'done' && data.tasks.filter(t=>t.done).length > 0 ? `<button class="btn btn-ghost btn-sm" onclick="App.clearDoneTasks()" style="margin-left:auto; color:var(--red); font-size:11px;">Clear all done</button>` : ''}
      </div>

      ${tasks.length ? `
        <div class="item-list">
          ${tasks.map(t => {
            const overdue = t.due && !t.done && t.due < todayKey();
            const subs = t.subtasks || [];
            const subsDone = subs.filter(s => s.done).length;
            const expanded = App._expandedTasks && App._expandedTasks[t.id];
            return `
            <div class="item ${overdue ? 'task-overdue' : ''}" style="flex-wrap:wrap;">
              <div class="item-check ${t.done ? 'done' : ''}" onclick="App.toggleTask('${t.id}')"></div>
              <div class="item-body">
                <div class="item-title ${t.done ? 'done' : ''}">${escapeHTML(t.text)}${subs.length ? ` <span style="font-size:11px; color:var(--text-dim);">(${subsDone}/${subs.length})</span>` : ''}</div>
                <div class="item-meta">
                  ${t.category ? `<span class="tag tag-accent">${escapeHTML(t.category)}</span> ` : ''}
                  ${t.due ? `<span style="color:${overdue ? '#e74c3c' : 'var(--text-dim)'};">&#128197; ${t.due}</span> ` : ''}
                  ${t.recurring ? `<span class="tag tag-green">${escapeHTML(t.recurring)}</span> ` : ''}
                  ${formatDate(t.created)}
                </div>
              </div>
              <button class="btn-ghost btn-sm" style="border:none; font-size:11px; padding:2px 6px; cursor:pointer;" onclick="App.toggleExpandTask('${t.id}')">${expanded ? '&#9660;' : '&#9654;'} sub</button>
              <button class="item-delete" onclick="App.deleteTask('${t.id}')">&times;</button>
              ${expanded ? `
                <div style="width:100%; padding-left:32px; margin-top:4px;">
                  ${subs.map((s, i) => `
                    <div style="display:flex; align-items:center; gap:8px; padding:3px 0; font-size:13px;">
                      <div class="item-check ${s.done ? 'done' : ''}" style="width:16px; height:16px; border-width:1.5px;" onclick="App.toggleSubtask('${t.id}', ${i})"></div>
                      <span class="${s.done ? 'done' : ''}" style="${s.done ? 'text-decoration:line-through; color:var(--text-dim);' : ''}">${escapeHTML(s.text)}</span>
                      <button style="background:none; border:none; color:var(--text-dim); cursor:pointer; font-size:14px; margin-left:auto;" onclick="App.deleteSubtask('${t.id}', ${i})">&times;</button>
                    </div>
                  `).join('')}
                  <div style="display:flex; gap:6px; margin-top:4px;">
                    <input type="text" id="subtask-${t.id}" placeholder="Add subtask..." style="flex:1; padding:4px 8px; font-size:12px;" onkeydown="if(event.key==='Enter')App.addSubtask('${t.id}')">
                    <button class="btn btn-primary btn-sm" style="padding:2px 8px; font-size:11px;" onclick="App.addSubtask('${t.id}')">+</button>
                  </div>
                </div>
              ` : ''}</div>`;
          }).join('')}
        </div>
      ` : `
        <div class="empty-state" style="padding:20px;">
          <div class="empty-text">${filter === 'done' ? 'No completed tasks yet.' : 'All clear! Add a task above.'}</div>
        </div>
      `}
      ` : ''}

      ${taskSrc !== 'nexus' && vt ? `
        <div class="vtask-section">
          <div class="vtask-header">
            <h3 class="vtask-title">Vault Tasks</h3>
            <span class="vtask-summary">${vtSummary.pending} pending &middot; ${vtSummary.done} done</span>
          </div>

          <div class="filter-tabs">
            <span class="filter-tab ${vtab==='active'?'active':''}" onclick="App.setVaultTaskTab('active')">Active (${vtSummary.activeCount})</span>
            <span class="filter-tab ${vtab==='exam'?'active':''}" onclick="App.setVaultTaskTab('exam')">Exam (${vtSummary.examCount})</span>
            <span class="filter-tab ${vtab==='backlog'?'active':''}" onclick="App.setVaultTaskTab('backlog')">Backlog (${vtSummary.backlogCount})</span>
            <span class="filter-tab ${vtab==='other'?'active':''}" onclick="App.setVaultTaskTab('other')">Other (${vtSummary.otherCount})</span>
            <span class="filter-tab ${vtab==='archived'?'active':''}" onclick="App.setVaultTaskTab('archived')">Done (${vtSummary.done})</span>
          </div>

          ${vaultTaskList.length ? `
            <div class="item-list">
              ${vaultTaskList.map(vaultTaskItem).join('')}
            </div>
          ` : `
            <div class="empty-state" style="padding:20px;">
              <div class="empty-text">No tasks in this category.</div>
            </div>
          `}
        </div>
      ` : taskSrc !== 'nexus' ? `<div class="empty-state" style="padding:20px;"><div class="empty-text">No vault tasks. Connect your vault in Strategy &gt; Settings.</div></div>` : ''}
    `;
  },

  // ─── Journal ─────────────────────────────────
  journal() {
    const data = Store.get();
    const entries = [...data.journal].reverse();
    const vaultDays = App.vaultDailyEntries || [];

    return `
      <h1 class="view-title">Journal <button class="btn btn-ghost btn-sm" onclick="App.exportJournal()" style="font-size:11px; vertical-align:middle; margin-left:8px;">⬇ Export .md</button></h1>
      <p class="view-subtitle">Reflect, learn, grow — one entry at a time</p>

      <div style="margin-bottom:24px;">
        <textarea id="journal-input" placeholder="What happened today? What did you learn? (Enter to save, Ctrl+Enter for new line)" rows="4"
          onkeydown="if(event.key==='Enter'){if(event.ctrlKey||event.shiftKey){return;}App.addJournal(); event.preventDefault();}"></textarea>
        <div style="margin-top:10px; display:flex; justify-content:space-between; align-items:center;">
          ${App.vaultAvailable ? `
            <label class="vault-toggle-label">
              <input type="checkbox" id="journal-vault-toggle" checked>
              <span>Also log to vault</span>
            </label>
          ` : '<div></div>'}
          <button class="btn btn-primary" onclick="App.addJournal()">Save Entry</button>
        </div>
      </div>

      ${entries.length ? `
        <h3 style="margin-bottom:12px; font-size:14px; color:var(--text-dim);">Nexus Entries</h3>
        <div style="margin-bottom:24px;">
          ${entries.map(e => `
            <div class="journal-entry">
              <div class="journal-date">${formatDate(e.created)}</div>
              ${App._editingJournal === e.id ? `
                <textarea id="edit-journal-${e.id}" class="journal-edit-area" rows="4" onkeydown="if(event.key==='Enter'&&!event.ctrlKey&&!event.shiftKey){App.saveEditJournal('${e.id}');event.preventDefault();} if(event.key==='Escape'){App._editingJournal=null;App.render();}">${escapeHTML(e.text)}</textarea>
                <div style="display:flex;gap:6px;margin-top:6px;">
                  <button class="btn btn-primary btn-sm" onclick="App.saveEditJournal('${e.id}')">Save</button>
                  <button class="btn btn-ghost btn-sm" onclick="App._editingJournal=null;App.render();">Cancel</button>
                </div>
              ` : `
                <div class="journal-text" ondblclick="App._editingJournal='${e.id}';App.render();setTimeout(()=>{const t=document.getElementById('edit-journal-${e.id}');if(t){t.focus();t.selectionStart=t.value.length;}},50);">${escapeHTML(e.text)}</div>
                <div style="display:flex;gap:6px;margin-top:8px;">
                  <button class="btn btn-ghost btn-sm" onclick="App._editingJournal='${e.id}';App.render();setTimeout(()=>{const t=document.getElementById('edit-journal-${e.id}');if(t){t.focus();t.selectionStart=t.value.length;}},50);">Edit</button>
                  <button class="btn btn-ghost btn-sm" onclick="App.deleteJournal('${e.id}')">Delete</button>
                </div>
              `}
            </div>
          `).join('')}
        </div>
      ` : ''}

      ${vaultDays.length ? `
        <div class="vtask-section" style="border-top:${entries.length ? '1px solid var(--border)' : 'none'};">
          <div class="vtask-header">
            <h3 class="vtask-title">Rapid Log</h3>
            <span class="vtask-summary" style="cursor:pointer;" onclick="App.openVaultFile('02 Rapid logging.md')">Open in Vault</span>
          </div>
          ${vaultDays.map(day => `
            <div class="journal-entry">
              <div class="journal-date">${day.date}</div>
              <div class="journal-text vault-daily-lines">${day.lines.filter(l => l.trim()).map(l => escapeHTML(l)).join('<br>')}</div>
            </div>
          `).join('')}
        </div>
      ` : `
        ${!entries.length ? `
          <div class="empty-state">
            <div class="empty-icon">&#9998;</div>
            <div class="empty-text">Start writing. Quick bullets about your day — use #tags like #lesson or #people for weekly reviews.</div>
          </div>
        ` : ''}
      `}
    `;
  },

  // ─── Goals ───────────────────────────────────
  goals() {
    const data = Store.get();
    const activeGoals = (data.goals || []).filter(g => !g.achieved);
    const achievedGoals = (data.goals || []).filter(g => g.achieved);

    return `
      <h1 class="view-title">Goals</h1>
      <p class="view-subtitle">Set targets, track progress, level up</p>

      <div class="input-row">
        <input type="text" id="goal-input" placeholder="What's your goal?" onkeydown="if(event.key==='Enter')App.addGoal()">
        <input type="text" id="goal-target" placeholder="Target (number)" style="max-width:130px;" onkeydown="if(event.key==='Enter')App.addGoal()">
        <select id="goal-frequency" style="background:var(--bg-input); border:1px solid var(--border); color:var(--text); border-radius:6px; padding:6px 10px; font-size:12px; max-width:110px;">
          <option value="once">Once</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
        <button class="btn btn-primary" onclick="App.addGoal()">Add Goal</button>
      </div>

      ${activeGoals.length ? `
        <div class="strat-section-label" style="margin-top:16px; margin-bottom:8px;">Active Goals</div>
        <div class="item-list">
          ${activeGoals.map(g => {
            const pct = g.target > 0 ? Math.min(100, Math.round((g.current / g.target) * 100)) : 0;
            const freqBadge = g.frequency && g.frequency !== 'once' ? `<span style="font-size:10px;color:var(--text-dim);background:var(--bg-input);border-radius:4px;padding:1px 6px;margin-left:6px;">${g.frequency}</span>` : '';
            const prompt = App._goalPrompt;
            const isArchivePrompt = prompt?.id === g.id && prompt?.type === 'archive';
            const isGiveUpPrompt = prompt?.id === g.id && prompt?.type === 'giveup';
            const barColor = pct >= 100 ? 'var(--green)' : 'var(--accent)';
            return `
              <div class="card" style="${pct >= 100 ? 'border-left:3px solid var(--green);' : ''}">
                <div class="goal-header">
                  <span class="goal-title">${escapeHTML(g.text)}${freqBadge}</span>
                  <span class="goal-pct">${g.current} / ${g.target} (${pct}%)</span>
                </div>
                <div class="progress-bar">
                  <div class="progress-fill" style="width:${pct}%; background:${barColor}"></div>
                </div>
                <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;">
                  <button class="btn btn-ghost btn-sm" onclick="App.incrementGoal('${g.id}', -1)">-1</button>
                  <button class="btn btn-primary btn-sm" onclick="App.incrementGoal('${g.id}', 1)">+1</button>
                  <button class="btn btn-ghost btn-sm" onclick="App.incrementGoal('${g.id}', 5)">+5</button>
                  <button class="btn btn-ghost btn-sm" onclick="App.incrementGoal('${g.id}', 10)">+10</button>
                  <div style="flex:1;"></div>
                  ${pct >= 100 ? `<button class="btn btn-sm" style="background:var(--green);color:#fff;" onclick="App.showGoalPrompt('${g.id}','archive')">🏆 Archive</button>` : ''}
                  <button class="btn btn-ghost btn-sm" style="color:var(--red);" onclick="App.showGoalPrompt('${g.id}','giveup')">Give Up</button>
                </div>
                ${isArchivePrompt ? `
                  <div style="margin-top:12px; padding:12px; background:var(--bg-input); border-radius:8px; border-left:3px solid var(--green);">
                    <div style="font-size:13px; font-weight:600; color:var(--green); margin-bottom:6px;">🎉 Amazing work! What made you succeed?</div>
                    <div style="font-size:12px; color:var(--text-dim); margin-bottom:8px;">Reflect on your win — this will inspire your future self.</div>
                    <textarea id="goal-reason-input" placeholder="e.g. Stayed consistent, broke it into smaller steps, had a study buddy..." style="width:100%; min-height:64px; background:var(--bg-card); border:1px solid var(--border); color:var(--text); border-radius:6px; padding:8px; font-size:12px; resize:vertical; box-sizing:border-box;"></textarea>
                    <div style="display:flex; gap:8px; margin-top:8px; justify-content:flex-end;">
                      <button class="btn btn-ghost btn-sm" onclick="App._goalPrompt=null;App.render()">Cancel</button>
                      <button class="btn btn-sm" style="background:var(--green);color:#fff;" onclick="App.archiveGoal('${g.id}')">Save & Archive 🏆</button>
                    </div>
                  </div>
                ` : ''}
                ${isGiveUpPrompt ? `
                  <div style="margin-top:12px; padding:12px; background:var(--bg-input); border-radius:8px; border-left:3px solid var(--red);">
                    <div style="font-size:13px; font-weight:600; color:var(--text); margin-bottom:6px;">It's okay to let go — every step taught you something.</div>
                    <div style="font-size:12px; color:var(--text-dim); margin-bottom:8px;">What held you back? Being honest helps you grow.</div>
                    <textarea id="goal-reason-input" placeholder="e.g. Life got busy, goal was too ambitious, priorities shifted..." style="width:100%; min-height:64px; background:var(--bg-card); border:1px solid var(--border); color:var(--text); border-radius:6px; padding:8px; font-size:12px; resize:vertical; box-sizing:border-box;"></textarea>
                    <div style="display:flex; gap:8px; margin-top:8px; justify-content:flex-end;">
                      <button class="btn btn-ghost btn-sm" onclick="App._goalPrompt=null;App.render()">Cancel</button>
                      <button class="btn btn-ghost btn-sm" style="color:var(--red);" onclick="App.giveUpGoal('${g.id}')">Give Up Goal</button>
                    </div>
                  </div>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>
      ` : `
        <div class="empty-state">
          <div class="empty-icon">&#9650;</div>
          <div class="empty-text">No active goals. Set a target like "Complete 500 MCQs" and track your progress!</div>
        </div>
      `}

      ${achievedGoals.length ? `
        <details style="margin-top:24px;">
          <summary class="strat-section-label" style="margin-bottom:8px; color:#a78bfa; cursor:pointer; list-style:none;">🏆 Achieved Goals <span style="font-size:12px; opacity:0.7;">(${achievedGoals.length})</span></summary>
          <div class="item-list">
            ${achievedGoals.map(g => `
              <div class="card" style="opacity:0.9; border-left:3px solid #a78bfa;">
                <div class="goal-header">
                  <span class="goal-title" style="color:var(--text);">✓ ${escapeHTML(g.text)}</span>
                  <span style="font-size:11px; color:#a78bfa;">${g.achievedDate || ''}</span>
                </div>
                ${g.achievedReason ? `<div style="font-size:12px; color:var(--text-dim); margin-top:6px; padding:6px 8px; background:var(--bg-input); border-radius:6px; font-style:italic;">"${escapeHTML(g.achievedReason)}"</div>` : ''}
                <div style="margin-top:8px; display:flex; justify-content:flex-end;">
                  <button class="btn btn-ghost btn-sm" onclick="App.deleteGoal('${g.id}')">Remove</button>
                </div>
              </div>
            `).join('')}
          </div>
        </details>
      ` : ''}

      ${(() => { const gaveUp = (data.goals || []).filter(g => g.gaveUp); return gaveUp.length ? `
        <details style="margin-top:24px;">
          <summary class="strat-section-label" style="margin-bottom:8px; color:var(--text-dim); cursor:pointer; list-style:none;">Given Up Goals <span style="font-size:12px; opacity:0.7;">(${gaveUp.length})</span></summary>
          <div class="item-list">
            ${gaveUp.map(g => `
              <div class="card" style="opacity:0.65; border-left:3px solid var(--border);">
                <div class="goal-header">
                  <span class="goal-title" style="color:var(--text-dim); text-decoration:line-through;">${escapeHTML(g.text)}</span>
                  <span style="font-size:11px; color:var(--text-dim);">${g.gaveUpDate || ''}</span>
                </div>
                ${g.gaveUpReason ? `<div style="font-size:12px; color:var(--text-dim); margin-top:6px; padding:6px 8px; background:var(--bg-input); border-radius:6px; font-style:italic;">"${escapeHTML(g.gaveUpReason)}"</div>` : ''}
                <div style="margin-top:8px; display:flex; justify-content:flex-end;">
                  <button class="btn btn-ghost btn-sm" onclick="App.deleteGoal('${g.id}')">Remove</button>
                </div>
              </div>
            `).join('')}
          </div>
        </details>
      ` : ''; })()}
    `;
  },

  // ─── Strategy ──────────────────────────────────
  strategy() {
    const data = Store.get();
    const s = data.strategy;
    const roadmapMonths = getRoadmapMonths(s, data.checklists);
    const month = App.strategyMonth || curMonthKey();
    const tab = App.strategyTab || 'roadmap';
    const mLabel = monthLabel(month);

    const allMs = Object.values(s.milestones).flat();
    const totalMs = allMs.length;
    const doneMs = allMs.filter(m => m.done).length;
    const pct = totalMs ? Math.round((doneMs / totalMs) * 100) : 0;

    const examDate = s.examDate ? new Date(s.examDate) : null;
    const daysLeft = examDate ? Math.max(0, Math.ceil((examDate - new Date()) / 864e5)) : null;

    const roadmapIdx = roadmapMonths.findIndex(m => m.key === month);
    const totalRoadmapMonths = roadmapMonths.length;
    const phasePct = totalRoadmapMonths > 0 ? roadmapIdx / totalRoadmapMonths : 0;
    const phase = phasePct <= 0.25 ? 'Foundation' : phasePct <= 0.5 ? 'Deep Study' : phasePct <= 0.75 ? 'Intensive' : 'Final Sprint';

    const curMs = s.milestones[month] || [];
    const monthDone = curMs.filter(m => m.done).length;

    function priorityBadge(p) {
      const m = { critical: ['var(--red)', 'CRIT'], high: ['var(--amber)', 'HIGH'], medium: ['var(--accent)', 'MED'], low: ['var(--text-dim)', 'LOW'] };
      const [c, l] = m[p] || m.low;
      return `<span class="strat-badge" style="color:${c}; border-color:${c};">${l}</span>`;
    }

    // Sub-tab content
    let tabContent = '';

    if (tab === 'roadmap') {
      if (!App.calendarYear) App.calendarYear = parseInt(month.slice(0,4), 10) || new Date().getFullYear();
      const calYear = App.calendarYear;
      const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      tabContent = `
        <!-- Project Timeline (Gantt) — checklists as rows -->
        ${(() => {
          const ganttMonths = roadmapMonths;
          const clLists = data.checklists || [];
          if (!clLists.length) return '<div class="card"><div style="font-size:12px;color:var(--text-dim);padding:12px;">Add a project in the Projects tab to see the timeline.</div></div>';
          const ganttRows = clLists.map(cl => {
            const allItems = (cl.sections||[]).flatMap(sec => sec.items||[]);
            const totalItems = allItems.length;
            const activityByMonth = {};
            for (const item of allItems) {
              for (const rev of (item.revisions||[])) {
                const mKey = rev.date ? rev.date.slice(0,7) : null;
                if (mKey) activityByMonth[mKey] = (activityByMonth[mKey]||0) + 1;
              }
            }
            const doneItems = allItems.filter(it => (it.revisions||[]).length > 0 || it.done).length;
            const overallPct = totalItems ? Math.round(doneItems/totalItems*100) : 0;
            const sections = (cl.sections||[]).map(sec => {
              const sitems = sec.items||[];
              const sdone = sitems.filter(it => (it.revisions||[]).length > 0 || it.done).length;
              return { name: sec.name||'Untitled', total: sitems.length, done: sdone, pct: sitems.length ? Math.round(sdone/sitems.length*100) : 0 };
            });
            const deadlineMonth = cl.deadline ? cl.deadline.slice(0,7) : null;
            const endIdx = deadlineMonth ? ganttMonths.findIndex(m => m.key === deadlineMonth) : ganttMonths.length-1;
            const color = cl.color || 'var(--accent)';
            return { ...cl, activityByMonth, totalItems, doneItems, overallPct, sections, deadlineMonth, endIdx: endIdx >= 0 ? endIdx : ganttMonths.length-1, color };
          });
          const curIdx = ganttMonths.findIndex(m => m.key === curMonthKey());
          const yearGroups = [];
          let curYG = null;
          for (const m of ganttMonths) {
            const yr = m.key.slice(0,4);
            if (!curYG || curYG.year !== yr) { curYG = { year: yr, count: 0 }; yearGroups.push(curYG); }
            curYG.count++;
          }
          if (!App._ganttExpanded) App._ganttExpanded = {};
          return `
          <div class="card">
            <div class="strat-section-label">Project Timeline</div>
            <div class="gantt-chart">
              <div class="gantt-header gantt-year-row">
                <div class="gantt-label-wide"></div>
                ${yearGroups.map(yg => `<div class="gantt-year-cell" style="width:${yg.count * 52}px;">${yg.year}</div>`).join('')}
              </div>
              <div class="gantt-header">
                <div class="gantt-label-wide"></div>
                ${ganttMonths.map(m => `<div class="gantt-month ${m.key === curMonthKey() ? 'gantt-today' : ''}">${m.label.split(' ')[0]}</div>`).join('')}
              </div>
              ${ganttRows.map(row => {
                const isExpanded = !!App._ganttExpanded[row.id];
                const curKey = curMonthKey();
                const maxBarH = 43;
                const mainRow = `
                <div class="gantt-row">
                  <div class="gantt-label-wide gantt-proj-label" title="Click to ${isExpanded ? 'collapse' : 'expand'} sections" style="border-left:3px solid ${row.color}; cursor:pointer;" onclick="App.toggleGanttExpand('${row.id}')"><span class="gantt-expand-arrow">${isExpanded ? '▾' : '▸'}</span><span style="color:${row.color};">${row.icon||'📋'}</span> <span style="color:var(--text); font-size:13px; font-weight:700;">${escapeHTML(row.name)}</span></div>
                  ${ganttMonths.map((m, i) => {
                    const isDeadline = m.key === row.deadlineMonth;
                    const inRange = i <= row.endIdx;
                    const isCurrent = m.key === month;
                    const isFutureMonth = m.key > curKey;
                    const isCurrentMonth = m.key === curKey;
                    // Cumulative: sum all activity up to and including this month
                    const cumDone = ganttMonths.slice(0, i + 1).reduce((s, gm) => s + (row.activityByMonth[gm.key] || 0), 0);
                    const prevCumDone = ganttMonths.slice(0, i).reduce((s, gm) => s + (row.activityByMonth[gm.key] || 0), 0);
                    const fillPct = row.totalItems > 0 ? Math.min(100, Math.round(cumDone / row.totalItems * 100)) : 0;
                    const prevPct = row.totalItems > 0 ? Math.min(100, Math.round(prevCumDone / row.totalItems * 100)) : 0;
                    const hasActivity = (row.activityByMonth[m.key] || 0) > 0;
                    const hasAnyCumulative = cumDone > 0;
                    const allDone = row.overallPct >= 100;
                    const pctText = hasAnyCumulative ? (allDone ? '✓' : fillPct + '%') : '';
                    const cellClass = [
                      hasActivity ? (allDone ? 'gantt-done' : 'gantt-active') : inRange ? 'gantt-span' : '',
                      isDeadline ? 'gantt-deadline-cell' : '',
                      isCurrent ? 'gantt-selected' : ''
                    ].filter(Boolean).join(' ');
                    const barColor = allDone ? 'var(--green)' : row.color;
                    const showBar = !isFutureMonth && hasAnyCumulative;
                    const curBarH = Math.max(2, Math.round(fillPct / 100 * maxBarH));
                    const prevBarH = Math.max(0, Math.round(prevPct / 100 * maxBarH));
                    const thisMonthBarH = Math.max(0, curBarH - prevBarH);
                    const barHtml = showBar ? (isCurrentMonth && thisMonthBarH > 0 ?
                      `<div style="position:absolute;bottom:2px;left:4px;right:4px;height:${curBarH}px;">
                        ${prevBarH > 0 ? `<div style="position:absolute;bottom:0;left:0;right:0;height:${prevBarH}px;background:${barColor};border-radius:2px;opacity:0.75;"></div>` : ''}
                        <div style="position:absolute;bottom:${prevBarH}px;left:0;right:0;height:${thisMonthBarH}px;background:${barColor};border-radius:2px;filter:brightness(1.7);"></div>
                      </div>` :
                      `<span class="gantt-bar" style="height:${curBarH}px;background:${barColor};opacity:0.85;"></span>`) : '';
                    return `<div class="gantt-cell ${cellClass}" onclick="App.setStrategyMonth('${m.key}')" title="${showBar ? cumDone+' items done (cumulative)' : isDeadline ? 'Deadline' : ''}">
                      ${barHtml}
                      ${showBar ? `<span class="gantt-pct">${pctText}</span>` : ''}
                      ${isDeadline ? '<span class="gantt-deadline-marker">◆</span>' : ''}
                    </div>`;
                  }).join('')}
                </div>`;
                const sectionRows = isExpanded ? row.sections.filter(sec => sec.total > 0).map((sec, secI) => `
                <div class="gantt-row gantt-section-row">
                  <div class="gantt-label-wide gantt-section-label-cell" onclick="App.jumpToProjectSection('${row.id}', ${secI})" style="cursor:pointer;" title="Go to ${escapeHTML(sec.name)}">
                    <div style="display:flex;align-items:center;gap:6px;padding-left:12px;">
                      <span style="font-size:11px;font-weight:600;color:var(--text-dim);overflow:hidden;text-overflow:ellipsis;" title="${escapeHTML(sec.name)}">${escapeHTML(sec.name)}</span>
                      <span style="font-size:10px;color:var(--text-dim);white-space:nowrap;flex-shrink:0;">${sec.done}/${sec.total}</span>
                    </div>
                  </div>
                  <div style="display:flex;align-items:center;flex:1;padding:0 8px;">
                    <div style="flex:1;height:6px;background:var(--bg-input);border-radius:3px;">
                      <div style="height:100%;width:${sec.pct}%;background:${sec.pct===100?'var(--green)':row.color};border-radius:3px;transition:width 0.3s;"></div>
                    </div>
                    <span style="font-size:10px;color:var(--text-dim);margin-left:6px;min-width:28px;">${sec.pct}%</span>
                  </div>
                </div>`).join('') : '';
                return mainRow + sectionRows;
              }).join('')}
              ${curIdx >= 0 ? `<div class="gantt-row gantt-now-row">
                <div class="gantt-label-wide" style="font-size:10px;color:var(--text-dim);">Now</div>
                ${ganttMonths.map((m, i) => `<div class="gantt-cell" style="${i===curIdx?'border-left:2px solid var(--accent);':''}"></div>`).join('')}
              </div>` : ''}
            </div>
            <div style="display:flex;gap:14px;margin-top:8px;font-size:10px;color:var(--text-dim);flex-wrap:wrap;">
              <span><span class="gantt-legend-box" style="background:rgba(124,111,247,0.15);"></span> In range</span>
              <span><span class="gantt-legend-box" style="background:rgba(52,211,153,0.25);"></span> All done</span>
              <span>Bar height = cumulative %</span>
              <span style="display:flex;align-items:center;gap:3px;"><span style="color:var(--red);font-size:11px;">◆</span> Deadline</span>
            </div>
          </div>`;
        })()}

        <!-- Calendar Month Picker -->
        <div class="roadmap-cal-header">
          <button class="roadmap-cal-btn" onclick="App.calYear(-1)">&#9664;</button>
          <span class="roadmap-cal-year">${calYear}</span>
          <button class="roadmap-cal-btn" onclick="App.calYear(1)">&#9654;</button>
        </div>
        <div class="roadmap-month-grid">
          ${monthNames.map((lbl, i) => {
            const key = `${calYear}-${String(i+1).padStart(2,'0')}`;
            const isActive  = key === month;
            const isCurrent = key === curMonthKey();
            const mMs       = s.milestones[key] || [];
            const hasDot    = mMs.length > 0;
            const allDone   = hasDot && mMs.every(m => m.done);
            const cls = [
              'roadmap-mcell',
              isActive  ? 'active'   : '',
              isCurrent ? 'today'    : '',
              allDone   ? 'all-done' : hasDot ? 'has-data' : ''
            ].filter(Boolean).join(' ');
            return `<div class="${cls}" onclick="App.setStrategyMonth('${key}')">
              ${lbl}
              ${hasDot ? '<span class="roadmap-mcell-dot"></span>' : ''}
            </div>`;
          }).join('')}
        </div>

        <!-- Reflections -->
        <div class="card">
          <div class="strat-section-label">Reflections \u2014 ${mLabel}</div>
          <div style="font-size:11px; color:var(--text-dim); margin-bottom:6px;">What went well? What needs adjustment? These are saved automatically.</div>
          <textarea id="strat-notes" placeholder="Write your reflections for this month..."
            onchange="App.saveStrategyNote('${month}', this.value)"
            rows="3" style="min-height:70px;">${escapeHTML(s.notes[month] || '')}</textarea>
        </div>

        <!-- Project activity log for selected month -->
        ${(() => {
          const reviewedThisMonth = [];
          for (const cl of (data.checklists || [])) {
            const monthItems = [];
            for (const sec of (cl.sections || [])) {
              for (const item of (sec.items || [])) {
                if ((item.revisions || []).some(r => (r.date || '').slice(0, 7) === month)) {
                  monthItems.push({ item: item.text, section: sec.name });
                }
              }
            }
            if (monthItems.length) reviewedThisMonth.push({ project: cl.name, icon: cl.icon || '📋', color: cl.color || 'var(--accent)', items: monthItems });
          }
          if (!reviewedThisMonth.length) return '';
          return `<div class="card">
            <div class="strat-section-label">Project Activity \u2014 ${mLabel}</div>
            ${reviewedThisMonth.map(p => `
              <div style="margin-bottom:12px;">
                <div style="font-size:12px; font-weight:700; color:${p.color}; margin-bottom:4px;">${p.icon} ${escapeHTML(p.project)} <span style="font-weight:400; color:var(--text-dim);">(${p.items.length} item${p.items.length!==1?'s':''})</span></div>
                ${p.items.map(i => `<div style="font-size:12px; color:var(--text-dim); padding:2px 0 2px 12px; border-left:2px solid ${p.color}40; margin-bottom:2px;">${escapeHTML(i.item)}</div>`).join('')}
              </div>
            `).join('')}
          </div>`;
        })()}

        <!-- Goals -->
        <div class="card">
          <div class="strat-section-label">Goals</div>
          <div class="input-row" style="margin-bottom:12px;">
            <input type="text" id="goal-input" placeholder="What's your goal?" style="flex:1;"
              onkeydown="if(event.key==='Enter')App.addGoal()">
            <input type="text" id="goal-target" placeholder="Target" style="width:80px;"
              onkeydown="if(event.key==='Enter')App.addGoal()">
            <select id="goal-frequency" style="background:var(--bg-input); border:1px solid var(--border); color:var(--text); border-radius:6px; padding:4px 8px; font-size:12px; width:90px;">
              <option value="once">Once</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            <button class="btn btn-primary btn-sm" onclick="App.addGoal()">+ Add</button>
          </div>
          ${(() => {
            const activeGoals = data.goals.filter(g => !g.achieved && !g.gaveUp);
            const achievedGoals = data.goals.filter(g => g.achieved);
            const gaveUpGoals = data.goals.filter(g => g.gaveUp);
            const prompt = App._goalPrompt;
            return `
              ${activeGoals.length ? activeGoals.map(g => {
                const pct = g.target > 0 ? Math.min(100, Math.round((g.current / g.target) * 100)) : 0;
                const freqBadge = g.frequency && g.frequency !== 'once' ? `<span style="font-size:10px;color:var(--text-dim);background:var(--bg-input);border-radius:4px;padding:1px 5px;margin-left:4px;">${g.frequency}</span>` : '';
                const isArchive = prompt?.id === g.id && prompt?.type === 'archive';
                const isGiveUp = prompt?.id === g.id && prompt?.type === 'giveup';
                const barColor = pct >= 100 ? 'var(--green)' : 'var(--accent)';
                return `<div style="margin-bottom:14px; padding:10px; background:var(--bg-input); border-radius:8px; ${pct >= 100 ? 'border-left:3px solid var(--green);' : ''}">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <span style="font-size:13px; font-weight:600;">${escapeHTML(g.text)}${freqBadge}</span>
                    <span style="font-size:12px; font-weight:700; color:${barColor};">${g.current}/${g.target} (${pct}%)</span>
                  </div>
                  <div class="progress-bar">
                    <div class="progress-fill" style="width:${pct}%; background:${barColor};"></div>
                  </div>
                  <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;">
                    <button class="btn btn-ghost btn-sm" onclick="App.incrementGoal('${g.id}', -1)">-1</button>
                    <button class="btn btn-primary btn-sm" onclick="App.incrementGoal('${g.id}', 1)">+1</button>
                    <button class="btn btn-ghost btn-sm" onclick="App.incrementGoal('${g.id}', 5)">+5</button>
                    <button class="btn btn-ghost btn-sm" onclick="App.incrementGoal('${g.id}', 10)">+10</button>
                    <div style="flex:1;"></div>
                    ${pct >= 100 ? `<button class="btn btn-sm" style="background:var(--green);color:#fff;font-size:11px;" onclick="App.showGoalPrompt('${g.id}','archive')">🏆 Archive</button>` : ''}
                    <button class="btn btn-ghost btn-sm" style="color:var(--red);" onclick="App.showGoalPrompt('${g.id}','giveup')">Give Up</button>
                  </div>
                  ${isArchive ? `
                    <div style="margin-top:10px; padding:10px; background:var(--bg-card); border-radius:6px; border-left:2px solid var(--green);">
                      <div style="font-size:12px; font-weight:600; color:var(--green); margin-bottom:4px;">🎉 What made you succeed?</div>
                      <textarea id="goal-reason-input" placeholder="Reflect on your win..." style="width:100%; min-height:52px; background:var(--bg-input); border:1px solid var(--border); color:var(--text); border-radius:6px; padding:6px; font-size:12px; resize:vertical; box-sizing:border-box;"></textarea>
                      <div style="display:flex; gap:6px; margin-top:6px; justify-content:flex-end;">
                        <button class="btn btn-ghost btn-sm" onclick="App._goalPrompt=null;App.render()">Cancel</button>
                        <button class="btn btn-sm" style="background:var(--green);color:#fff;" onclick="App.archiveGoal('${g.id}')">Archive 🏆</button>
                      </div>
                    </div>
                  ` : ''}
                  ${isGiveUp ? `
                    <div style="margin-top:10px; padding:10px; background:var(--bg-card); border-radius:6px; border-left:2px solid var(--red);">
                      <div style="font-size:12px; font-weight:600; color:var(--text); margin-bottom:4px;">What held you back?</div>
                      <textarea id="goal-reason-input" placeholder="It's okay — every experience teaches something." style="width:100%; min-height:52px; background:var(--bg-input); border:1px solid var(--border); color:var(--text); border-radius:6px; padding:6px; font-size:12px; resize:vertical; box-sizing:border-box;"></textarea>
                      <div style="display:flex; gap:6px; margin-top:6px; justify-content:flex-end;">
                        <button class="btn btn-ghost btn-sm" onclick="App._goalPrompt=null;App.render()">Cancel</button>
                        <button class="btn btn-ghost btn-sm" style="color:var(--red);" onclick="App.giveUpGoal('${g.id}')">Give Up</button>
                      </div>
                    </div>
                  ` : ''}
                </div>`;
              }).join('') : '<div style="font-size:12px;color:var(--text-dim);margin-bottom:10px;">No active goals — add one above.</div>'}
              ${achievedGoals.length ? `
                <details style="margin-top:10px;">
                  <summary style="font-size:11px;font-weight:700;color:#a78bfa;margin-bottom:6px;cursor:pointer;list-style:none;">🏆 Achieved <span style="opacity:0.7;">(${achievedGoals.length})</span></summary>
                  ${achievedGoals.map(g => `
                    <div style="padding:6px 8px;margin-bottom:4px;background:var(--bg-input);border-radius:6px;border-left:2px solid #a78bfa;">
                      <div style="display:flex;justify-content:space-between;align-items:center;">
                        <span style="font-size:12px;color:#a78bfa;">✓ ${escapeHTML(g.text)}</span>
                        <span style="font-size:10px;color:var(--text-dim);">${g.achievedDate || ''}</span>
                      </div>
                      ${g.achievedReason ? `<div style="font-size:11px;color:var(--text-dim);margin-top:2px;font-style:italic;">"${escapeHTML(g.achievedReason)}"</div>` : ''}
                    </div>`).join('')}
                </details>
              ` : ''}
              ${gaveUpGoals.length ? `
                <details style="margin-top:10px;">
                  <summary style="font-size:11px;font-weight:700;color:var(--text-dim);margin-bottom:6px;cursor:pointer;list-style:none;">Given Up <span style="opacity:0.7;">(${gaveUpGoals.length})</span></summary>
                  ${gaveUpGoals.map(g => `
                    <div style="padding:6px 8px;margin-bottom:4px;background:var(--bg-input);border-radius:6px;opacity:0.6;">
                      <div style="display:flex;justify-content:space-between;align-items:center;">
                        <span style="font-size:12px;color:var(--text-dim);text-decoration:line-through;">${escapeHTML(g.text)}</span>
                        <span style="font-size:10px;color:var(--text-dim);">${g.gaveUpDate || ''}</span>
                      </div>
                      ${g.gaveUpReason ? `<div style="font-size:11px;color:var(--text-dim);margin-top:2px;font-style:italic;">"${escapeHTML(g.gaveUpReason)}"</div>` : ''}
                    </div>`).join('')}
                </details>
              ` : ''}
            `;
          })()}
        </div>

      `;
    } else if (tab === 'projects') {
      const checklists = data.checklists || [];
      const stratProjects = s.projects || [];

      // Topics import banner
      const showImportBanner = (data.topics || []).length > 0
        && !data._topicsImportDismissed
        && !checklists.find(c => c._fromTopics);

      // Active project
      const activeId = App.strategyProject || checklists[0]?.id || null;
      const activeCL = checklists.find(c => c.id === activeId);

      const statusColors = { 'not-started': 'var(--text-dim)', weak: 'var(--red)', moderate: 'var(--amber)', strong: 'var(--green)' };

      tabContent = `
        ${showImportBanner ? `
          <div style="margin-bottom:16px; padding:12px 16px; background:var(--amber)15; border:1px solid var(--amber)40; border-radius:10px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <div style="font-size:13px;">📋 You have <strong>${(data.topics||[]).length} topics</strong> from the old Topics tracker. Import them as a Project?</div>
            <div style="display:flex; gap:8px;">
              <button class="btn btn-primary btn-sm" onclick="App.importTopicsAsProject()">Import</button>
              <button class="btn btn-ghost btn-sm" onclick="App.dismissTopicsImport()">Dismiss</button>
            </div>
          </div>
        ` : ''}

        <!-- Project pills nav -->
        <div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin-bottom:20px;">
          ${checklists.map(cl => {
            const clPillColor = cl.color || 'var(--accent)';
            const allItems = (cl.sections||[]).flatMap(sec => sec.items||[]);
            const revDone = allItems.filter(it => (it.revisions||[]).length > 0 || it.done).length;
            const isActive = cl.id === activeId;
            return `<button
              class="strat-month-pill ${isActive ? 'active' : ''}"
              onclick="App.setStrategyProject('${cl.id}')"
              style="${isActive ? `background:${clPillColor}; border-color:${clPillColor}; color:${contrastColor(clPillColor.startsWith('var') ? '#7c6ff7' : clPillColor)};` : ''}">
              ${escapeHTML(cl.icon || '📋')} ${escapeHTML(cl.name)}
              <span style="font-size:10px; opacity:0.7; margin-left:4px;">${revDone}/${allItems.length}</span>
            </button>`;
          }).join('')}

          <!-- + Add button -->
          <div style="position:relative; display:inline-block;">
            <button class="strat-month-pill" onclick="App._projAddOpen=!App._projAddOpen; App.render();" style="color:var(--accent); border-color:var(--accent)60;">+ Add</button>
            ${App._projAddOpen ? `
              <div style="position:absolute; top:36px; left:0; z-index:100; background:var(--bg-card); border:1px solid var(--border); border-radius:10px; padding:10px; min-width:220px; box-shadow:0 4px 20px rgba(0,0,0,0.3);">
                <button class="btn btn-primary" style="width:100%; margin-bottom:8px;" onclick="App._projAddOpen=false; App.uploadChecklist()">⬆ Upload .md file</button>
                <div style="display:flex; gap:6px;">
                  <input type="text" id="blank-proj-name" placeholder="Project name" class="strat-settings-input" style="flex:1;">
                  <button class="btn btn-ghost btn-sm" onclick="App.addBlankProject(document.getElementById('blank-proj-name')?.value)">✎ Blank</button>
                </div>
                <button class="btn btn-ghost btn-sm" style="width:100%; margin-top:6px; font-size:11px;" onclick="App._projAddOpen=false; App.render();">Cancel</button>
              </div>
            ` : ''}
          </div>
        </div>

        ${!activeCL ? `
          <div class="empty-state">
            <div class="empty-icon">📋</div>
            <div class="empty-text">No projects yet — upload a .md file or create a blank project</div>
            <details style="margin-top:16px; text-align:left; max-width:420px;">
              <summary style="font-size:12px; color:var(--accent); cursor:pointer;">ⓘ Supported .md format</summary>
              <div style="margin-top:8px; padding:12px; background:var(--bg-input); border-radius:8px; font-size:12px; color:var(--text-dim); line-height:1.8;">
                <code style="color:var(--accent);"># Project Name</code> — checklist title<br>
                <code style="color:var(--accent);">## Section</code> — section group<br>
                <code style="color:var(--accent);">1. Item text</code> — checkable item<br>
                <code style="color:var(--accent);">2. [AI] Item</code> — shows AI badge<br>
                <code style="color:var(--accent);">- Bullet also works</code>
              </div>
            </details>
          </div>
        ` : (() => {
          const allItems = activeCL.sections.flatMap(sec => sec.items);
          const revDone = allItems.filter(it => (it.revisions||[]).length > 0 || it.done).length;
          const pct = allItems.length ? Math.round(revDone / allItems.length * 100) : 0;
          const clColor = activeCL.color || '#7c6ff7';
          const daysLeft = activeCL.deadline ? Math.max(0, Math.ceil((new Date(activeCL.deadline) - new Date()) / 864e5)) : null;
          const defaultTag = '#' + (activeCL.name || 'study').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
          const captureTag = activeCL.captureTag || defaultTag;
          const isEditingProj = App._editingProject === activeCL.id;

          return `
            <!-- Project header card -->
            <div class="card" style="margin-bottom:16px;">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
                <div style="flex:1; min-width:0;">
                  ${isEditingProj ? `
                    <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                      <input id="edit-proj-icon" value="${escapeHTML(activeCL.icon||'📋')}" style="width:40px; text-align:center; padding:4px;" class="strat-settings-input">
                      <input id="edit-proj-name" value="${escapeHTML(activeCL.name)}" style="flex:1; min-width:140px;" class="strat-settings-input"
                        onkeydown="if(event.key==='Enter') App.saveEditProject('${activeCL.id}', document.getElementById('edit-proj-name').value, document.getElementById('edit-proj-icon').value)">
                      <button class="btn btn-primary btn-sm" onclick="App.saveEditProject('${activeCL.id}', document.getElementById('edit-proj-name').value, document.getElementById('edit-proj-icon').value)">Save</button>
                      <button class="btn btn-ghost btn-sm" onclick="App._editingProject=null; App.render();">Cancel</button>
                    </div>
                  ` : `
                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                      <span style="font-size:20px;">${escapeHTML(activeCL.icon||'📋')}</span>
                      <span style="font-size:16px; font-weight:700; color:var(--text); border-bottom:2px solid ${clColor}; padding-bottom:1px;">${escapeHTML(activeCL.name)}</span>
                      <button onclick="App.startEditProject('${activeCL.id}')" title="Rename" style="background:none; border:none; cursor:pointer; color:var(--text-dim); font-size:13px; opacity:0.6;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6">✎</button>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px; margin-top:6px; flex-wrap:wrap;">
                      <input type="date" value="${activeCL.deadline||''}" class="strat-settings-input" style="font-size:11px; padding:3px 6px; width:140px;"
                        title="Deadline" onchange="App.updateChecklistMeta('${activeCL.id}', 'deadline', this.value)">
                      <input type="color" value="${clColor}" style="width:28px; height:28px; border:none; background:none; cursor:pointer; border-radius:6px;" title="Color"
                        onchange="App.updateChecklistMeta('${activeCL.id}', 'color', this.value)">
                      ${daysLeft !== null ? `<span style="font-size:11px; color:var(--text-dim);">${daysLeft} days left</span>` : ''}
                      <span style="font-size:11px; color:var(--text-dim);">${revDone}/${allItems.length} reviewed</span>
                    </div>
                    <textarea placeholder="Add a description…" rows="2"
                      style="width:100%; margin-top:8px; font-size:12px; background:var(--bg-input); border:1px solid var(--border); border-radius:6px; color:var(--text); padding:6px 8px; resize:vertical; box-sizing:border-box;"
                      onchange="App.updateChecklistMeta('${activeCL.id}', 'description', this.value)">${escapeHTML(activeCL.description||'')}</textarea>
                  `}
                </div>
                <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                  ${App.vaultAvailable ? `<span style="font-size:10px; color:var(--green); opacity:0.7;" title="Auto-syncs to vault when items are checked">&#8593; vault${activeCL.lastVaultSync ? ' · ' + activeCL.lastVaultSync : ''}</span>` : ''}
                  ${App.vaultAvailable && !activeCL.vaultFile ? `<button class="btn btn-ghost btn-sm" style="color:var(--accent); font-size:11px;" onclick="App.createProjectVaultFile('${activeCL.id}')" title="Create vault MD file">📁 Link vault</button>` : ''}
                  ${activeCL.vaultFile ? `<span style="font-size:10px; color:var(--green); opacity:0.7;" title="${escapeHTML(activeCL.vaultFile)}">📁 linked</span>` : ''}
                  <button class="btn btn-ghost btn-sm" style="color:var(--red);" onclick="App.deleteChecklist('${activeCL.id}')">🗑</button>
                </div>
              </div>
              <div class="progress-bar"><div class="progress-fill" style="width:${pct}%; background:${clColor};"></div></div>
              <div style="font-size:11px; color:var(--text-dim); margin-top:4px;">${pct}% reviewed</div>
            </div>

            <!-- Quick capture bar -->
            <div class="card" style="margin-bottom:16px; padding:10px 14px;">
              <div style="font-size:11px; color:var(--text-dim); margin-bottom:6px; font-weight:600;">⚡ Quick Log</div>
              <div style="display:flex; gap:6px; flex-wrap:wrap;">
                <input type="text" id="proj-log-text" placeholder="Note, insight, what you studied..." class="strat-settings-input" style="flex:1; min-width:180px;"
                  onkeydown="if(event.key==='Enter') App.logProjectCapture('${activeCL.id}')">
                <input type="text" id="proj-log-tag" value="${escapeHTML(captureTag)}" placeholder="#tag" class="strat-settings-input" style="width:80px;"
                  title="Any #tag — e.g. #study #exam #review #note">
                <button class="btn btn-primary btn-sm" onclick="App.logProjectCapture('${activeCL.id}')">Log</button>
              </div>
              <div style="font-size:10px; color:var(--text-dim); margin-top:4px;">Any #tag works — logs to Capture view</div>
            </div>

            <!-- Hint bar -->
            <div style="font-size:11px; color:var(--text-dim); margin-bottom:12px; padding:6px 10px; background:var(--bg-input); border-radius:6px;">
              💡 Click <strong>○</strong> or <strong>[+ Rev]</strong> on any item to log a review pass. Each dot = one review with its date. Click a dot to remove it.
            </div>

            ${activeCL.sections.map((sec, secIdx) => {
              const secRevDone = sec.items.filter(it => (it.revisions||[]).length > 0 || it.done).length;
              const isEditingSec = App._editingSection && App._editingSection.clId === activeCL.id && App._editingSection.secIdx === secIdx;

              return `
                <details style="margin-bottom:10px;" open>
                  <summary style="cursor:pointer; user-select:none; padding:8px 0; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border);">
                    ${isEditingSec ? `
                      <div style="display:flex; gap:6px; flex:1;" onclick="event.preventDefault()">
                        <input id="edit-sec-name-${secIdx}" value="${escapeHTML(sec.name)}" class="strat-settings-input" style="flex:1; font-size:13px;"
                          onkeydown="if(event.key==='Enter') App.saveEditSection('${activeCL.id}', ${secIdx}, this.value)">
                        <button class="btn btn-primary btn-sm" onclick="App.saveEditSection('${activeCL.id}', ${secIdx}, document.getElementById('edit-sec-name-${secIdx}').value)">Save</button>
                        <button class="btn btn-ghost btn-sm" onclick="App._editingSection=null; App.render();">✕</button>
                      </div>
                    ` : `
                      <div style="display:flex; align-items:center; gap:6px;">
                        <span style="font-size:13px; font-weight:700; color:var(--text);">${escapeHTML(sec.name)}</span>
                        <button onclick="event.preventDefault(); App.startEditSection('${activeCL.id}', ${secIdx})" title="Rename section" style="background:none; border:none; cursor:pointer; color:var(--text-dim); font-size:12px; opacity:0.5;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.5">✎</button>
                      </div>
                    `}
                    <div style="display:flex; align-items:center; gap:8px;">
                      <span style="font-size:11px; color:${secRevDone===sec.items.length && sec.items.length>0 ? 'var(--green)' : 'var(--text-dim)'};">${secRevDone}/${sec.items.length}</span>
                      <button class="btn btn-ghost btn-sm" style="color:var(--red); font-size:11px; padding:2px 6px;" onclick="event.preventDefault(); App.deleteChecklistSection('${activeCL.id}', ${secIdx})">✕ section</button>
                    </div>
                  </summary>
                  <div style="padding-top:6px;">
                    ${sec.items.map((item, itemIdx) => {
                      const revs = item.revisions || (item.done ? [{date: localDateKey(new Date(activeCL.uploadedAt))}] : []);
                      const itemStatus = item.status || (item.done ? 'weak' : 'not-started');
                      const statusColor = statusColors[itemStatus] || 'var(--text-dim)';
                      const isEditingIt = App._editingItem && App._editingItem.clId === activeCL.id && App._editingItem.secIdx === secIdx && App._editingItem.itemIdx === itemIdx;

                      return `
                        <div style="display:flex; align-items:flex-start; gap:6px; padding:5px 0; border-bottom:1px solid rgba(255,255,255,0.04);">
                          <!-- Revision circle/dots — clickable -->
                          <div style="display:flex; gap:3px; align-items:center; flex-shrink:0; padding-top:3px; cursor:pointer;" onclick="App.addRevision('${activeCL.id}', ${secIdx}, ${itemIdx})" title="Log review">
                            ${revs.length === 0
                              ? `<span style="width:16px; height:16px; border-radius:50%; border:2px solid var(--text-dim); display:inline-block; cursor:pointer;"></span>`
                              : revs.map((r, rIdx) => `<span title="Reviewed ${r.date} — click to remove" onclick="event.stopPropagation(); App.removeRevision('${activeCL.id}', ${secIdx}, ${itemIdx}, ${rIdx})" style="width:10px; height:10px; border-radius:50%; background:var(--green); display:inline-block; cursor:pointer; opacity:0.85; flex-shrink:0;"></span>`).join('')
                            }
                          </div>
                          <!-- Item text — editable -->
                          <div style="flex:1; font-size:13px;">
                            ${isEditingIt ? `
                              <div style="display:flex; gap:4px;">
                                <input id="edit-item-${secIdx}-${itemIdx}" value="${escapeHTML(item.text)}" class="strat-settings-input" style="flex:1; font-size:12px;"
                                  onkeydown="if(event.key==='Enter') App.saveEditItem('${activeCL.id}', ${secIdx}, ${itemIdx}, this.value); if(event.key==='Escape'){App._editingItem=null; App.render();}">
                                <button class="btn btn-primary btn-sm" style="font-size:11px; padding:2px 6px;" onclick="App.saveEditItem('${activeCL.id}', ${secIdx}, ${itemIdx}, document.getElementById('edit-item-${secIdx}-${itemIdx}').value)">✓</button>
                                <button class="btn btn-ghost btn-sm" style="font-size:11px; padding:2px 4px;" onclick="App._editingItem=null; App.render();">✕</button>
                              </div>
                            ` : `
                              ${escapeHTML(item.text)}
                              ${item.tag === 'AI' ? '<span style="font-size:9px; color:var(--accent); border:1px solid var(--accent); border-radius:3px; padding:0 3px; margin-left:4px; vertical-align:middle; opacity:0.6;">AI</span>' : ''}
                              ${revs.length > 0 ? `<span style="font-size:10px; color:var(--text-dim); margin-left:6px;">${revs.map(r=>r.date.slice(5)).join(' · ')}</span>` : ''}
                            `}
                          </div>
                          <!-- Status badge -->
                          <button onclick="App.cycleItemStatus('${activeCL.id}', ${secIdx}, ${itemIdx})" title="not-started → weak → moderate → strong"
                            style="font-size:10px; color:${statusColor}; border:1px solid ${statusColor}; border-radius:4px; padding:1px 5px; background:none; cursor:pointer; flex-shrink:0; white-space:nowrap;">
                            ${itemStatus === 'not-started' ? '—' : itemStatus.replace('-',' ')}
                          </button>
                          <!-- + Rev button (explicit affordance) -->
                          <button onclick="App.addRevision('${activeCL.id}', ${secIdx}, ${itemIdx})" title="Log a review pass"
                            style="font-size:10px; color:var(--green); border:1px solid var(--green)40; border-radius:4px; padding:1px 5px; background:var(--green)10; cursor:pointer; flex-shrink:0; white-space:nowrap;">
                            + Rev
                          </button>
                          <!-- Edit item button -->
                          <button onclick="App.startEditItem('${activeCL.id}', ${secIdx}, ${itemIdx})" title="Edit item text"
                            style="font-size:11px; color:var(--text-dim); background:none; border:none; cursor:pointer; flex-shrink:0; padding:0 2px; opacity:0.5;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.5">✎</button>
                          <!-- Delete item -->
                          <button onclick="App.deleteChecklistItem('${activeCL.id}', ${secIdx}, ${itemIdx})" title="Delete item"
                            style="font-size:11px; color:var(--text-dim); background:none; border:none; cursor:pointer; flex-shrink:0; padding:0 2px; opacity:0.4;" onmouseover="this.style.opacity=1; this.style.color='var(--red)'" onmouseout="this.style.opacity=0.4; this.style.color='var(--text-dim)'">✕</button>
                        </div>
                      `;
                    }).join('')}
                    <!-- Add item to section -->
                    <div style="display:flex; gap:6px; margin-top:8px;">
                      <input type="text" id="new-item-${secIdx}" placeholder="Add item..." class="strat-settings-input" style="flex:1; font-size:12px;"
                        onkeydown="if(event.key==='Enter'){App.addChecklistItem('${activeCL.id}', ${secIdx}, this.value); this.value='';}">
                      <button class="btn btn-ghost btn-sm" onclick="App.addChecklistItem('${activeCL.id}', ${secIdx}, document.getElementById('new-item-${secIdx}').value); document.getElementById('new-item-${secIdx}').value='';">+</button>
                    </div>
                  </div>
                </details>
              `;
            }).join('')}

            <!-- Add new section -->
            <div style="display:flex; gap:6px; margin-top:12px;">
              <input type="text" id="new-section-name" placeholder="New section name..." class="strat-settings-input" style="flex:1;"
                onkeydown="if(event.key==='Enter'){App.addChecklistSection('${activeCL.id}', this.value); this.value='';}">
              <button class="btn btn-ghost btn-sm" onclick="App.addChecklistSection('${activeCL.id}', document.getElementById('new-section-name').value); document.getElementById('new-section-name').value='';">+ Section</button>
            </div>
          `;
        })()}
      `;
    }

    return `
      <h1 class="view-title">Strategy</h1>
      <p class="view-subtitle">${(data.checklists||[]).map(cl=>escapeHTML(cl.name)).join(' \u00B7 ') || 'Your integrated plan'}</p>

      <!-- Stat Cards — one per project + milestones -->
      <div class="stats-grid" style="grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));">
        ${(data.checklists || []).map(proj => {
          const dl = proj.deadline ? new Date(proj.deadline) : null;
          const dLeft = dl && !isNaN(dl) ? Math.max(0, Math.ceil((dl - new Date()) / 864e5)) : null;
          const clColor = proj.color || '#7c6ff7';
          return `<div class="stat-card" style="background:${clColor}; border-color:${clColor}; cursor:pointer;" onclick="App.setStrategyProject('${proj.id}')">
            <div style="font-size:11px; color:${contrastColor(clColor)}; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px; opacity:0.85;">${escapeHTML(proj.icon || '')} ${escapeHTML(proj.name)}</div>
            <div class="stat-number" style="color:${contrastColor(clColor)}; font-size:28px;">${dLeft !== null ? dLeft : '\u2014'}</div>
            <div class="stat-label" style="color:${contrastColor(clColor)}; opacity:0.7;">${dLeft !== null ? 'days left' : 'no deadline'}</div>
          </div>`;
        }).join('')}
        <div class="stat-card">
          <div class="stat-number" style="color:var(--green);">${doneMs}/${totalMs}</div>
          <div class="stat-label">Milestones</div>
          <div class="progress-bar" style="margin-top:6px;">
            <div class="progress-fill" style="width:${pct}%;"></div>
          </div>
        </div>
      </div>

      <!-- Sub-Tabs -->
      <div class="strat-tabs">
        <span class="strat-tab ${tab==='roadmap'?'active':''}" onclick="App.setStrategyTab('roadmap')">Roadmap</span>
        <span class="strat-tab ${tab==='projects'?'active':''}" onclick="App.setStrategyTab('projects')">Projects</span>
      </div>

      ${tabContent}
    `;
  },

  // ─── Vault ──────────────────────────────────
  vault() {
    const mode = App.vaultMode || 'browse';
    const vaultPath = App.vaultPath || '';

    if (mode === 'read' && App.vaultFile) {
      return Views._vaultReader();
    }
    if (mode === 'edit' && App.vaultFile) {
      return Views._vaultEditor();
    }
    return Views._vaultBrowser();
  },

  _vaultBrowser() {
    const vaultPath = App.vaultPath || '';
    const files = App.vaultFileList || [];
    const searchQuery = App.vaultSearchQuery || '';
    const searchResults = App.vaultSearchResults || [];
    const isSearching = App.vaultIsSearching || false;

    // Breadcrumb
    const parts = vaultPath ? vaultPath.split('/') : [];
    let breadcrumb = `<span class="vault-crumb" onclick="App.vaultNavigate('')">Vault</span>`;
    let accumulated = '';
    for (const p of parts) {
      accumulated += (accumulated ? '/' : '') + p;
      const safePath = accumulated.replace(/'/g, "\\'");
      breadcrumb += ` <span class="vault-crumb-sep">/</span> <span class="vault-crumb" onclick="App.vaultNavigate('${safePath}')">${escapeHTML(p)}</span>`;
    }

    return `
      <h1 class="view-title">Vault</h1>
      <p class="view-subtitle">Your Obsidian knowledge base</p>

      <div class="vault-toolbar">
        <div class="vault-breadcrumb">${breadcrumb}</div>
        <div class="vault-search-row">
          <input type="text" id="vault-search" placeholder="Search vault..." value="${escapeHTML(searchQuery)}"
            onkeydown="if(event.key==='Enter')App.vaultSearch()">
          <button class="btn btn-primary btn-sm" onclick="App.vaultSearch()">Search</button>
          <button class="btn btn-ghost btn-sm" onclick="App.vaultNewFile()">+ New</button>
        </div>
      </div>

      ${isSearching && searchResults.length > 0 ? `
        <div class="card" style="margin-bottom:16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div class="strat-section-label" style="margin-bottom:0;">Search Results (${searchResults.length})</div>
            <button class="btn btn-ghost btn-sm" onclick="App.vaultClearSearch()">Clear</button>
          </div>
          <div class="item-list">
            ${searchResults.map(r => `
              <div class="item" style="cursor:pointer;" onclick="App.openVaultFile('${r.path.replace(/'/g, "\\'")}')">
                <div class="item-body">
                  <div class="item-title">${escapeHTML(r.name)}</div>
                  <div class="item-meta">${r.matches.map(m => `Line ${m.line}: ${escapeHTML(m.text.slice(0, 80))}`).join(' | ')}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : isSearching ? '<div class="empty-state" style="padding:20px;"><div class="empty-text">No results found.</div></div>' : ''}

      ${!isSearching ? `
        ${files.length ? `
          <div class="vault-file-grid">
            ${files.map(f => {
              const safePath = f.path.replace(/'/g, "\\'");
              if (f.isFolder) {
                return `
                  <div class="vault-file-card vault-folder" onclick="App.vaultNavigate('${safePath}')">
                    <div class="vault-file-icon">\uD83D\uDCC1</div>
                    <div class="vault-file-name">${escapeHTML(f.name)}</div>
                    <div class="vault-file-meta">${f.children} items</div>
                  </div>`;
              }
              const sizeKB = f.size ? Math.round(f.size / 1024) : 0;
              const modDate = f.modified ? new Date(f.modified).toLocaleDateString() : '';
              return `
                <div class="vault-file-card" onclick="App.openVaultFile('${safePath}')">
                  <div class="vault-file-icon">\uD83D\uDCC4</div>
                  <div class="vault-file-name">${escapeHTML(f.name.replace('.md', ''))}</div>
                  <div class="vault-file-meta">${sizeKB}KB &middot; ${modDate}</div>
                </div>`;
            }).join('')}
          </div>
        ` : `
          <div class="empty-state">
            <div class="empty-icon">${App.vaultLoadError ? '&#9888;' : '&#128218;'}</div>
            <div class="empty-text">${App.vaultLoadError ? 'Could not load vault — check your vault path in Settings.' : 'Loading vault...'}</div>
          </div>
        `}
      ` : ''}
    `;
  },

  _vaultReader() {
    const file = App.vaultFile;
    const content = App.vaultFileContent || '';
    const rendered = renderMarkdown(content);

    return `
      <div class="vault-header">
        <button class="btn btn-ghost btn-sm" onclick="App.vaultBack()">&larr; Back</button>
        <h2 class="vault-file-title">${escapeHTML(file.replace('.md', '').split('/').pop())}</h2>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-ghost btn-sm" onclick="App.vaultEdit()">Edit</button>
        </div>
      </div>
      <div class="vault-rendered card">${rendered}</div>
    `;
  },

  _vaultEditor() {
    const file = App.vaultFile;
    const content = App.vaultFileContent || '';

    return `
      <div class="vault-header">
        <button class="btn btn-ghost btn-sm" onclick="App.vaultCancelEdit()">&larr; Cancel</button>
        <h2 class="vault-file-title">Editing: ${escapeHTML(file.split('/').pop())}</h2>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-primary btn-sm" onclick="App.vaultSave()">Save</button>
        </div>
      </div>
      <textarea id="vault-editor-area" class="vault-editor-textarea">${escapeHTML(content)}</textarea>
    `;
  },

  // ─── Growth ─────────────────────────────────
  growth() {
    const data = Store.get();
    const g = App.growthData;
    if (!g) {
      // Trigger load if not already in flight
      if (!App._growthLoading) {
        App._growthLoading = true;
        VaultAPI.getGrowth().then(d => { App.growthData = d; App._growthLoading = false; App.render(); }).catch(() => { App._growthLoading = false; App.render(); });
      }
      return `
        <h1 class="view-title">Growth</h1>
        <p class="view-subtitle">Your evolution over time</p>
        <div class="empty-state"><div class="empty-icon">&#128200;</div><div class="empty-text">Loading growth data...</div></div>
      `;
    }

    // Study activity heatmap (last 20 weeks) — combines journal + timer sessions
    const today = new Date();
    const weeks = 20;
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - (weeks * 7) + (7 - startDate.getDay()));
    const loggingSet = new Set(g.loggingDays || []);

    // Build study minutes per day
    const studyMap = {};
    for (const s of (data.timer?.sessions || [])) {
      studyMap[s.date] = (studyMap[s.date] || 0) + (s.duration || 0);
    }

    let heatmapHTML = '<div class="heatmap-grid">';
    const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    heatmapHTML += '<div class="heatmap-labels">';
    for (const d of dayLabels) heatmapHTML += `<div class="heatmap-label">${d}</div>`;
    heatmapHTML += '</div>';

    for (let w = 0; w < weeks; w++) {
      heatmapHTML += '<div class="heatmap-week">';
      for (let d = 0; d < 7; d++) {
        const cellDate = new Date(startDate);
        cellDate.setDate(startDate.getDate() + w * 7 + d);
        const dateStr = localDateKey(cellDate);
        const hasEntry = loggingSet.has(dateStr);
        const studyMins = studyMap[dateStr] || 0;
        const isFuture = cellDate > today;
        // Intensity: 0=empty, 1=light(logged or <30m), 2=medium(30-60m), 3=heavy(60m+)
        let level = 'empty';
        let title = dateStr;
        if (isFuture) { level = 'future'; }
        else if (studyMins >= 60) { level = 'l3'; title += ` — ${studyMins}min study`; }
        else if (studyMins >= 30) { level = 'l2'; title += ` — ${studyMins}min study`; }
        else if (studyMins > 0 || hasEntry) { level = 'l1'; title += hasEntry ? ' (logged)' : ` — ${studyMins}min`; }
        heatmapHTML += `<div class="heatmap-cell heatmap-${level}" title="${title}"></div>`;
      }
      heatmapHTML += '</div>';
    }
    heatmapHTML += '</div>';
    heatmapHTML += `<div style="display:flex; gap:4px; align-items:center; margin-top:6px; font-size:10px; color:var(--text-dim);">
      Less <div class="heatmap-cell heatmap-empty" style="width:12px;height:12px;display:inline-block;"></div>
      <div class="heatmap-cell heatmap-l1" style="width:12px;height:12px;display:inline-block;"></div>
      <div class="heatmap-cell heatmap-l2" style="width:12px;height:12px;display:inline-block;"></div>
      <div class="heatmap-cell heatmap-l3" style="width:12px;height:12px;display:inline-block;"></div> More
    </div>`;


    // Writing volume sparkline
    const volumes = g.writingVolume || [];
    const maxWords = Math.max(...volumes.map(v => v.words), 1);
    const sparkHTML = volumes.slice(-8).map(v => {
      const h = Math.max(4, Math.round((v.words / maxWords) * 60));
      return `<div class="spark-bar" style="height:${h}px;" title="${v.month}: ${v.words} words"></div>`;
    }).join('');

    // Lessons timeline — merge vault + app captures + journal
    const _appLessons = [];
    for (const cap of (data.captures || [])) {
      if (/#lesson/i.test(cap.text || '')) {
        _appLessons.push({ date: cap.created ? localDateKey(new Date(cap.created)) : '—', text: (cap.text||'').replace(/#\w+/g,'').trim(), src: '📱' });
      }
    }
    for (const j of (data.journal || [])) {
      if (/#lesson/i.test(j.text || '')) {
        _appLessons.push({ date: j.date || '—', text: (j.text||'').replace(/#\w+/g,'').trim(), src: '📓' });
      }
    }
    const _allLessons = [
      ...(g.lessons || []).map(l => ({ ...l, src: '🗃️' })),
      ..._appLessons
    ].sort((a, b) => (a.date||'').localeCompare(b.date||'')).slice(-12).reverse();
    const lessonsHTML = _allLessons.map(l => `
      <div class="lesson-item">
        <div class="lesson-date">${l.date} <span style="font-size:10px; opacity:0.6;">${l.src}</span></div>
        <div class="lesson-text">${escapeHTML(l.text)}</div>
      </div>
    `).join('');

    // Clinical cases
    const cases = g.clinicalCases || [];
    const maxCases = Math.max(...cases.map(c => c.count), 1);
    const casesHTML = cases.slice(-8).map(c => {
      const h = Math.max(4, Math.round((c.count / maxCases) * 60));
      return `<div class="spark-bar spark-bar-green" style="height:${h}px;" title="${c.month}: ${c.count} cases"></div>`;
    }).join('');

    return `
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:4px;">
        <h1 class="view-title" style="margin-bottom:0;">Growth</h1>
        <button class="btn btn-ghost btn-sm" onclick="App.refreshGrowth()" title="Reload growth data from vault">&#8635; Refresh</button>
      </div>
      <p class="view-subtitle">Your evolution over time</p>

      <!-- Streak Stats -->
      <div class="stats-grid" style="grid-template-columns: repeat(3, 1fr);">
        <div class="stat-card">
          <div class="stat-number" style="color:var(--amber);">${g.currentStreak || 0}</div>
          <div class="stat-label">Current Streak</div>
        </div>
        <div class="stat-card">
          <div class="stat-number">${g.longestStreak || 0}</div>
          <div class="stat-label">Longest Streak</div>
        </div>
        <div class="stat-card">
          <div class="stat-number" style="color:var(--green);">${g.loggingDays ? g.loggingDays.length : 0}</div>
          <div class="stat-label">Days Logged</div>
        </div>
      </div>

      <!-- Heatmap -->
      <div class="card">
        <div class="strat-section-label">Logging Activity (last ${weeks} weeks)</div>
        ${heatmapHTML}
      </div>

      <!-- Study Time Stats -->
      ${(() => {
        const sessions = data.timer?.sessions || [];
        if (!sessions.length) return '';
        // Last 14 days of study time
        const dayMap = {};
        const now2 = new Date();
        for (let i = 13; i >= 0; i--) {
          const d = new Date(now2);
          d.setDate(d.getDate() - i);
          dayMap[localDateKey(d)] = 0;
        }
        for (const s of sessions) {
          if (s.date in dayMap) dayMap[s.date] += s.duration;
        }
        const days = Object.entries(dayMap);
        const maxMin = Math.max(...days.map(d => d[1]), 1);
        const totalWeek = sessions.filter(s => {
          const d = new Date(s.date || s.ts);
          return (now2 - d) < 7 * 864e5;
        }).reduce((sum, s) => sum + s.duration, 0);
        const totalAll = sessions.reduce((sum, s) => sum + s.duration, 0);

        return `
      <div class="card">
        <div class="strat-section-label">Study Time</div>
        <div class="stats-grid" style="grid-template-columns: repeat(3, 1fr); margin-bottom:12px;">
          <div class="stat-card" style="padding:10px 8px;">
            <div class="stat-number" style="font-size:18px;">${Math.round(totalWeek / 60)}h ${totalWeek % 60}m</div>
            <div class="stat-label">This Week</div>
          </div>
          <div class="stat-card" style="padding:10px 8px;">
            <div class="stat-number" style="font-size:18px;">${Math.round(totalAll / 60)}h ${totalAll % 60}m</div>
            <div class="stat-label">All Time</div>
          </div>
          <div class="stat-card" style="padding:10px 8px;">
            <div class="stat-number" style="font-size:18px;">${sessions.length}</div>
            <div class="stat-label">Sessions</div>
          </div>
        </div>
        <div style="display:flex; align-items:flex-end; gap:3px; height:60px;">
          ${days.map(([date, mins]) => {
            const h = Math.max(2, Math.round((mins / maxMin) * 56));
            const label = date.slice(5);
            return `<div style="flex:1; display:flex; flex-direction:column; align-items:center;">
              <div style="width:100%; height:${h}px; background:${mins > 0 ? 'var(--accent)' : 'var(--border)'}; border-radius:3px;" title="${date}: ${mins}min"></div>
              <div style="font-size:9px; color:var(--text-dim); margin-top:2px;">${label}</div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
      })()}

      <!-- Weekly Review -->
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div class="strat-section-label" style="margin:0;">Weekly Review</div>
          <div style="display:flex; gap:6px; align-items:center;">
            <label class="auto-export-toggle" title="Auto-export weekly review when you open Nexus on a new week">
              <input type="checkbox" ${data.autoWeeklyExport ? 'checked' : ''} onchange="App.toggleAutoWeeklyExport()">
              <span style="font-size:11px; color:var(--text-dim);">Auto</span>
            </label>
            ${App.weeklyReview ? `<button class="btn btn-ghost btn-sm" onclick="App.exportWeeklyReview()">Export to Vault</button>` : ''}
            <button class="btn btn-primary btn-sm" onclick="App.generateWeeklyReview()">
              ${App.weeklyReview ? 'Refresh' : 'Generate'}
            </button>
          </div>
        </div>
        ${App.weeklyReview ? (() => {
          const wr = App.weeklyReview;
          return `
            <div class="weekly-review-content">
              <div class="stats-grid" style="grid-template-columns: repeat(4, 1fr); margin-bottom:12px;">
                <div class="stat-card" style="padding:12px 8px;">
                  <div class="stat-number" style="font-size:20px;">${wr.daysLogged}/7</div>
                  <div class="stat-label">Days Logged</div>
                </div>
                <div class="stat-card" style="padding:12px 8px;">
                  <div class="stat-number" style="font-size:20px;">${wr.totalWords}</div>
                  <div class="stat-label">Words Written</div>
                </div>
                <div class="stat-card" style="padding:12px 8px;">
                  <div class="stat-number" style="font-size:20px;">${wr.tasksCompleted}</div>
                  <div class="stat-label">Tasks Done</div>
                </div>
                <div class="stat-card" style="padding:12px 8px;">
                  <div class="stat-number" style="font-size:20px;">${wr.totalStudyMin ? Math.round(wr.totalStudyMin / 60 * 10) / 10 + 'h' : wr.topTags.length}</div>
                  <div class="stat-label">${wr.totalStudyMin !== undefined ? 'Study Time' : 'Tags Used'}</div>
                </div>
              </div>
              ${wr.mostActiveDay ? `<div style="font-size:12px; color:var(--text-dim); margin-bottom:8px;">Most active: ${wr.mostActiveDay} (${wr.mostActiveLines} lines)</div>` : ''}
              ${wr.topTags.length > 0 ? `
                <div style="margin-bottom:8px;">
                  <span style="font-size:12px; color:var(--text-dim);">Top tags: </span>
                  ${wr.topTags.map(t => `<span class="vault-tag vault-tag-sm">#${escapeHTML(t.tag)} <small>${t.count}</small></span>`).join(' ')}
                </div>
              ` : ''}
              ${wr.lessons.length > 0 ? `
                <div style="border-top:1px solid var(--border); padding-top:8px;">
                  <div style="font-size:12px; font-weight:600; margin-bottom:4px;">Lessons this week</div>
                  ${wr.lessons.map(l => `<div class="lesson-item" style="padding:4px 0;"><div class="lesson-date">${l.date}</div><div class="lesson-text">${escapeHTML(l.text)}</div></div>`).join('')}
                </div>
              ` : ''}
            </div>`;
        })() : '<div style="font-size:13px; color:var(--text-dim); padding:8px;">Click Generate to see your weekly summary.</div>'}
        ${App.weeklyExportMsg ? `<div style="font-size:12px; color:var(--green); margin-top:8px;">${escapeHTML(App.weeklyExportMsg)}</div>` : ''}
      </div>

      <!-- Study Time -->
      <div class="card">
        <div class="strat-section-label">Study Time</div>
        ${(() => {
          const sessions = (Store.get().timer || {}).sessions || [];
          const thisWeek = sessions.filter(s => {
            const d = new Date(); d.setDate(d.getDate() - 7);
            return s.date >= localDateKey(d);
          });
          const weekMins = thisWeek.reduce((s, x) => s + (x.duration || 0), 0);
          const totalMins = sessions.reduce((s, x) => s + (x.duration || 0), 0);
          return `
            <div class="stats-grid" style="grid-template-columns:1fr 1fr; margin-bottom:8px;">
              <div class="stat-card" style="padding:10px;">
                <div class="stat-number" style="font-size:18px;">${Math.round(weekMins / 60 * 10) / 10}h</div>
                <div class="stat-label">This Week</div>
              </div>
              <div class="stat-card" style="padding:10px;">
                <div class="stat-number" style="font-size:18px;">${Math.round(totalMins / 60 * 10) / 10}h</div>
                <div class="stat-label">All Time</div>
              </div>
            </div>
            <div style="font-size:12px; color:var(--text-dim);">${sessions.length} sessions total</div>
          `;
        })()}
      </div>

      <!-- Session History -->
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div class="strat-section-label">Session History</div>
          <span style="font-size:11px; color:var(--text-dim); cursor:pointer;" onclick="App.showAllSessions=!App.showAllSessions; App.render();">${App.showAllSessions ? 'Show less' : 'Show all'}</span>
        </div>
        ${(() => {
          const sessions = [...((Store.get().timer || {}).sessions || [])].reverse();
          const shown = App.showAllSessions ? sessions : sessions.slice(0, 5);
          if (!shown.length) return '<div style="font-size:12px; color:var(--text-dim);">No sessions yet. Start a timer!</div>';
          return shown.map(s => `
            <div style="display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid var(--border); flex-wrap:wrap;">
              <span style="font-size:11px; color:var(--text-dim); min-width:80px;">${new Date(s.ts).toLocaleDateString(undefined, { month:'short', day:'numeric' })}</span>
              <span style="font-size:12px; font-weight:600; min-width:45px;">${s.duration}min</span>
              <span class="tag-badge-sm">${escapeHTML(s.type || 'Study')}</span>
              ${s.note ? `<span style="font-size:12px; color:var(--text-dim); flex:1;">${escapeHTML(s.note)}</span>` : ''}
              ${s.stoppedEarly ? `<span style="font-size:10px; color:var(--amber);" title="${escapeHTML(s.reason || '')}">(stopped early${s.originalDuration ? ' — planned ' + s.originalDuration + 'min' : ''})</span>` : ''}
            </div>
          `).join('');
        })()}
      </div>

      <!-- Writing Volume -->
      <div class="card">
        <div class="strat-section-label">Writing Volume (monthly)</div>
        <div class="spark-row">${sparkHTML || '<span style="color:var(--text-dim); font-size:12px;">No data yet</span>'}</div>
      </div>

      <!-- Tag Trend Sparklines -->
      <div class="card">
        <div class="strat-section-label">Tag Trends (monthly)</div>
        ${(() => {
          const trends = g.tagTrends || {};
          // Get all months across all tags, sorted
          const allMonths = new Set();
          for (const t of Object.values(trends)) {
            for (const m of Object.keys(t)) allMonths.add(m);
          }
          const months = [...allMonths].sort().slice(-6);
          if (months.length === 0) return '<div style="font-size:12px; color:var(--text-dim);">No tag data yet</div>';

          // Top 8 tags by total usage
          const topTags = Object.entries(trends)
            .map(([tag, data]) => ({ tag, data, total: Object.values(data).reduce((s, v) => s + v, 0) }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 8);

          return topTags.map(({ tag, data }) => {
            const values = months.map(m => data[m] || 0);
            const max = Math.max(...values, 1);
            const bars = values.map((v, i) => {
              const h = Math.max(2, Math.round((v / max) * 28));
              return '<div class="sparkline-bar" style="height:' + h + 'px;" title="' + months[i] + ': ' + v + '"></div>';
            }).join('');
            return '<div class="tag-trend-row"><span class="tag-trend-label">#' + escapeHTML(tag) + '</span><div class="tag-trend-sparkline">' + bars + '</div><span class="tag-trend-total">' + values.reduce((s, v) => s + v, 0) + '</span></div>';
          }).join('');
        })()}
      </div>

      <!-- Tag Explorer -->
      <div class="card">
        <div class="strat-section-label">Tag Explorer</div>
        <div class="growth-tag-search">
          <input type="text" id="growth-tag-input" placeholder="Search a tag (e.g. food, family, active)..."
            value="${escapeHTML(App.growthTagFilter)}"
            onkeydown="if(event.key==='Enter')App.searchGrowthTag()">
          <button class="btn btn-primary btn-sm" onclick="App.searchGrowthTag()">Search</button>
        </div>
        <div class="growth-tag-pills">
          ${Object.entries(g.tagTrends || {}).sort((a, b) => {
            const aTotal = Object.values(a[1]).reduce((s, v) => s + v, 0);
            const bTotal = Object.values(b[1]).reduce((s, v) => s + v, 0);
            return bTotal - aTotal;
          }).slice(0, 20).map(([tag]) =>
            `<span class="vault-tag vault-tag-sm" onclick="App.searchGrowthTag('${tag}')" style="cursor:pointer;">#${escapeHTML(tag)}</span>`
          ).join(' ')}
        </div>
        ${App.growthTagEntries ? `
          <div class="growth-tag-results">
            <div style="display:flex; justify-content:space-between; align-items:center; margin:12px 0 8px;">
              <span style="font-size:13px; font-weight:600; color:var(--accent);">#${escapeHTML(App.growthTagFilter)} — ${App.growthTagEntries.count} entries</span>
              <button class="btn btn-ghost btn-sm" onclick="App.clearGrowthTag()">Clear</button>
            </div>
            ${App.growthTagEntries.entries.slice(0, 30).map(e => `
              <div class="lesson-item">
                <div class="lesson-date">
                  ${e.date}${e.source === 'app' ? ' <span style="font-weight:400; opacity:0.5; font-size:10px;">· app</span>' : ''}
                </div>
                <div class="lesson-text">${escapeHTML(e.text)}</div>
              </div>
            `).join('')}
            ${App.growthTagEntries.count > 30 ? `<div style="font-size:12px; color:var(--text-dim); padding:8px;">Showing 30 of ${App.growthTagEntries.count} entries</div>` : ''}
          </div>
        ` : ''}
      </div>

      <!-- Knowledge Areas -->
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <div class="strat-section-label" style="margin-bottom:0;">Knowledge Areas</div>
          <select class="growth-sort-select" onchange="App.setGrowthSort(this.value)">
            <option value="files" ${App.growthSort === 'files' ? 'selected' : ''}>By File Count</option>
            <option value="recent" ${App.growthSort === 'recent' ? 'selected' : ''}>By Last Updated</option>
            <option value="name" ${App.growthSort === 'name' ? 'selected' : ''}>By Name</option>
          </select>
        </div>
        <div style="font-size:11px; color:var(--text-dim); margin-bottom:14px; padding:8px 10px; background:var(--bg-input); border-radius:6px; line-height:1.6;">
          💡 <strong>How it works:</strong> Each area has keywords — any vault file whose name contains a keyword gets counted under that area (like a multi-term search).
          Files matching no area appear under <em>General</em>.<br>
          <span style="opacity:0.8;">Example: area "Orthopaedics" with keywords <code style="background:rgba(255,255,255,0.08);padding:1px 4px;border-radius:3px;">spine, hip, knee, fracture</code> — any file with those words in the name counts.</span>
        </div>
        ${(() => {
          const defs = data.customKnowledgeAreas || []; // [{name, keywords:[]}]
          const serverMap = {};
          for (const a of (g.knowledgeAreas || [])) serverMap[a.area] = a;
          let areas = defs.map(def => ({
            name: def.name,
            keywords: def.keywords || [],
            fileCount: serverMap[def.name]?.fileCount ?? 0,
            lastUpdated: serverMap[def.name]?.lastUpdated ?? null,
          }));
          // Append General if it has files
          const general = serverMap['General'];
          if (general?.fileCount) areas.push({ name: 'General', keywords: [], fileCount: general.fileCount, lastUpdated: general.lastUpdated, isGeneral: true });
          if (App.growthSort === 'recent') areas.sort((a, b) => (b.lastUpdated || '').localeCompare(a.lastUpdated || ''));
          else if (App.growthSort === 'name') areas.sort((a, b) => a.name.localeCompare(b.name));
          else areas.sort((a, b) => (b.fileCount || 0) - (a.fileCount || 0));
          const maxFiles = Math.max(...areas.map(x => x.fileCount || 0), 1);
          if (!areas.length) return '<div style="font-size:12px;color:var(--text-dim);padding:8px 0;">No areas defined yet — add one below to start tracking.</div>';
          const editingArea = App._editingKbArea;
          return areas.map(a => {
            const pct = Math.round((a.fileCount / maxFiles) * 100);
            const isEditing = !a.isGeneral && editingArea === a.name;
            const chips = a.keywords.map(k => `<span style="font-size:10px;color:var(--accent);background:var(--accent)15;border-radius:3px;padding:1px 5px;margin-right:3px;">${escapeHTML(k)}</span>`).join('');
            if (isEditing) {
              return `<div style="margin-bottom:12px; padding:8px; background:var(--bg-input); border-radius:6px; border:1px solid var(--accent)40;">
                <div style="font-size:12px; font-weight:600; margin-bottom:6px; color:var(--accent);">✎ Edit — ${escapeHTML(a.name)}</div>
                <input id="edit-area-kw-${escapeHTML(a.name)}" value="${escapeHTML(a.keywords.join(', '))}" class="strat-settings-input" style="width:100%; font-size:12px;" placeholder="Keywords: spine, hip, knee">
                <div style="display:flex; gap:6px; margin-top:6px; justify-content:flex-end;">
                  <button class="btn btn-ghost btn-sm" onclick="App._editingKbArea=null; App.render()">Cancel</button>
                  <button class="btn btn-primary btn-sm" onclick="App.saveKnowledgeAreaKeywords('${escapeHTML(a.name)}', document.getElementById('edit-area-kw-${escapeHTML(a.name)}').value)">Save</button>
                </div>
              </div>`;
            }
            return `<div style="margin-bottom:12px;">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:4px;">
                <div style="flex:1;">
                  <span style="font-size:13px; font-weight:600;">${escapeHTML(a.name)}${a.isGeneral ? ' <span style="font-size:10px;color:var(--text-dim);font-weight:400;">(unmatched)</span>' : ''}</span>
                  ${chips ? `<div style="margin-top:3px;">${chips}</div>` : '<div style="margin-top:2px; font-size:10px; color:var(--text-dim);">No keywords — all unmatched files land here</div>'}
                </div>
                <div style="display:flex; align-items:center; gap:6px; flex-shrink:0; margin-left:8px;">
                  <span style="font-size:11px;color:var(--text-dim);">${a.fileCount} files${a.lastUpdated ? ' · ' + a.lastUpdated : ''}</span>
                  ${!a.isGeneral ? `<button onclick="App._editingKbArea='${escapeHTML(a.name)}'; App.render()" title="Edit keywords" style="background:none;border:none;cursor:pointer;color:var(--text-dim);font-size:12px;padding:0 2px;opacity:0.5;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.5">✎</button>` : ''}
                  ${!a.isGeneral ? `<button onclick="App.deleteKnowledgeArea('${escapeHTML(a.name)}')" title="Remove area" style="background:none;border:none;cursor:pointer;color:var(--text-dim);font-size:13px;padding:0 2px;opacity:0.5;" onmouseover="this.style.opacity=1;this.style.color='var(--red)'" onmouseout="this.style.opacity=0.5;this.style.color='var(--text-dim)'">✕</button>` : ''}
                </div>
              </div>
              <div class="progress-bar" style="margin-top:0;"><div class="progress-fill" style="width:${pct}%;background:${a.isGeneral ? 'var(--text-dim)' : 'var(--accent)'};"></div></div>
            </div>`;
          }).join('');
        })()}
        <!-- Add new area -->
        <div style="border-top:1px solid var(--border); padding-top:12px; margin-top:8px;">
          <div style="font-size:11px; color:var(--text-dim); margin-bottom:6px;">Add a new knowledge area with keywords to match vault filenames:</div>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <input type="text" id="new-area-name" placeholder="Area name (e.g. Orthopaedics)" class="strat-settings-input" style="flex:1; min-width:140px; font-size:12px;">
            <input type="text" id="new-area-keywords" placeholder="Keywords: spine, hip, knee, fracture" class="strat-settings-input" style="flex:2; min-width:180px; font-size:12px;"
              onkeydown="if(event.key==='Enter') App.addKnowledgeArea(document.getElementById('new-area-name')?.value, this.value)">
            <button class="btn btn-ghost btn-sm" onclick="App.addKnowledgeArea(document.getElementById('new-area-name')?.value, document.getElementById('new-area-keywords')?.value)">+ Add</button>
          </div>
        </div>
      </div>

      <!-- Lessons -->
      <div class="card">
        <div class="strat-section-label">Recent Lessons</div>
        <div style="font-size:11px; color:var(--text-dim); margin-bottom:10px;">Tag any capture, journal entry, or vault note with <code style="background:var(--bg-input);padding:1px 4px;border-radius:3px;">#lesson</code> to see it here.</div>
        ${lessonsHTML || '<div style="font-size:12px; color:var(--text-dim); padding:8px 0;">No #lesson entries found yet.</div>'}
      </div>
    `;
  },

  // ─── Focus Mode View ──────────────────────────
  focus() {
    const data = Store.get();
    const ts = App.timerState || {};
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
    const vt = App.vaultTasks;
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
            <input type="text" id="timer-note" class="strat-settings-input" placeholder="What did you study? (optional)" style="margin-bottom:8px; width:100%;" value="${escapeHTML(App._timerNote || '')}">
            <button class="btn btn-primary" onclick="App.timerLogToCapture()">Log to Capture</button>
            <button class="btn btn-ghost" onclick="App.timerDismiss()">Dismiss</button>
          ` : ts.running || (ts.seconds > 0 || ts.mode === 'stopwatch') ? `
            <input type="text" id="timer-note" class="strat-settings-input" placeholder="What are you studying? (optional)" style="margin-bottom:8px; width:100%;" value="${escapeHTML(App._timerNote || '')}"
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
              <input type="checkbox" ${App._pomodoroAuto ? 'checked' : ''} onchange="App._pomodoroAuto=this.checked" style="accent-color:var(--accent);"> Auto-cycle (25-5-25-5-25-15)
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
  },

  // ─── Search ──────────────────────────────────
  search() {
    const q = (App.searchQuery || '').toLowerCase();
    const data = Store.get();
    let results = [];

    if (q.length >= 2) {
      // Search captures
      for (const c of data.captures) {
        if (c.text.toLowerCase().includes(q)) {
          results.push({ type: 'Capture', text: c.text, date: c.created, id: c.id });
        }
      }
      // Search tasks
      for (const t of data.tasks) {
        if (t.text.toLowerCase().includes(q)) {
          results.push({ type: 'Task', text: t.text, date: t.created, done: t.done });
        }
      }
      // Search journal
      for (const j of data.journal) {
        if (j.text.toLowerCase().includes(q)) {
          results.push({ type: 'Journal', text: j.text, date: j.created });
        }
      }
      // Search goals
      for (const g of data.goals) {
        if (g.text.toLowerCase().includes(q)) {
          results.push({ type: 'Goal', text: g.text, date: g.created });
        }
      }
      // Sort by date (newest first)
      results.sort((a, b) => (b.date || 0) - (a.date || 0));
    }

    return `
      <h1 class="view-title">Search</h1>
      <p class="view-subtitle">Find anything across captures, tasks, journal, goals</p>

      <div class="today-quick-add" style="margin-bottom:20px;">
        <input type="text" id="search-input" placeholder="Type to search... (min 2 chars)"
          value="${escapeHTML(App.searchQuery || '')}"
          oninput="clearTimeout(App._searchDebounce); App._searchDebounce=setTimeout(()=>{App.searchQuery=this.value; App.render();},150);"
          onkeydown="if(event.key==='Escape'){clearTimeout(App._searchDebounce); this.value=''; App.searchQuery=''; App.render();}">
      </div>

      ${q.length >= 2 ? `
        <div style="font-size:12px; color:var(--text-dim); margin-bottom:12px;">${results.length > 50 ? `Showing 50 of ${results.length}` : results.length} result${results.length !== 1 ? 's' : ''} for "${escapeHTML(q)}"</div>
        ${results.length ? `
          <div class="item-list">
            ${results.slice(0, 50).map(r => `
              <div class="item" style="border-left:3px solid ${r.type === 'Capture' ? 'var(--accent)' : r.type === 'Task' ? 'var(--green)' : r.type === 'Journal' ? 'var(--amber)' : '#888'}; padding-left:12px;">
                <div class="item-body">
                  <div class="item-title">${escapeHTML(r.text)}</div>
                  <div class="item-meta">
                    <span class="search-type-badge">${r.type}</span>
                    ${r.date ? timeAgo(r.date) : ''}
                    ${r.done ? ' (done)' : ''}
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        ` : '<div class="empty-state"><div class="empty-text">No results found.</div></div>'}
      ` : '<div class="empty-state"><div class="empty-text">Start typing to search...</div></div>'}
    `;
  },

  // ─── Calendar View ──────────────────────────
  calendar() {
    const data = Store.get();
    const now = new Date();
    const viewMonth = App._calMonth ?? now.getMonth();
    const viewYear = App._calYear ?? now.getFullYear();
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const monthName = new Date(viewYear, viewMonth).toLocaleString(undefined, { month: 'long', year: 'numeric' });
    const todayStr = todayKey();

    // Build data maps for the month
    const journalMap = {};
    for (const j of data.journal) { journalMap[j.date] = j; }
    // Vault daily entries
    const vaultJournalMap = {};
    for (const e of (App.vaultDailyEntries || [])) { if (e.date) vaultJournalMap[e.date] = e; }
    const taskMap = {};
    for (const t of data.tasks) {
      if (t.due) { if (!taskMap[t.due]) taskMap[t.due] = []; taskMap[t.due].push(t); }
    }
    // Vault tasks due dates
    const vaultTaskMap = {};
    for (const t of [...(App.vaultTasks?.active||[]), ...(App.vaultTasks?.backlog||[]), ...(App.vaultTasks?.other||[])]) {
      if (t.dueDate) { if (!vaultTaskMap[t.dueDate]) vaultTaskMap[t.dueDate] = []; vaultTaskMap[t.dueDate].push(t); }
    }
    const sessionMap = {};
    for (const s of (data.timer?.sessions || [])) {
      if (!sessionMap[s.date]) sessionMap[s.date] = 0;
      sessionMap[s.date] += s.duration || 0;
    }
    // Captures per day
    const captureMap = {};
    for (const c of data.captures) {
      const d = localDateKey(new Date(c.created));
      if (!captureMap[d]) captureMap[d] = [];
      captureMap[d].push(c);
    }

    // Activity streak computation
    const activityDays = new Set();
    for (const j of data.journal) activityDays.add(j.date);
    for (const s of (data.timer?.sessions || [])) activityDays.add(s.date);
    for (const c of data.captures) {
      const d = localDateKey(new Date(c.created));
      activityDays.add(d);
    }
    for (const e of (App.vaultDailyEntries || [])) activityDays.add(e.date);
    // Schedule completions count as activity
    for (const [date, log] of Object.entries(data.scheduleLog || {})) {
      if (Object.values(log).some(v => v)) activityDays.add(date);
    }
    // Habit completions count as activity
    for (const [date, log] of Object.entries((data.habits?.log) || {})) {
      if (Object.values(log).some(v => v)) activityDays.add(date);
    }

    // Goal achievements map: date → array of achieved goals
    const goalAchievementMap = {};
    for (const g of (data.goals || [])) {
      if (g.achieved && g.achievedDate) {
        if (!goalAchievementMap[g.achievedDate]) goalAchievementMap[g.achievedDate] = [];
        goalAchievementMap[g.achievedDate].push(g);
      }
    }

    // Current streak (all activity)
    let currentStreak = 0;
    const checkDate = new Date();
    for (let i = 0; i < 365; i++) {
      const dk = localDateKey(checkDate);
      if (activityDays.has(dk)) { currentStreak++; checkDate.setDate(checkDate.getDate() - 1); }
      else break;
    }

    // Longest streak
    let longestStreak = 0, tempStreak = 0;
    const sortedDays = [...activityDays].sort();
    for (let i = 0; i < sortedDays.length; i++) {
      if (i === 0) { tempStreak = 1; }
      else {
        const prev = new Date(sortedDays[i - 1]);
        const curr = new Date(sortedDays[i]);
        const diff = (curr - prev) / 864e5;
        tempStreak = diff === 1 ? tempStreak + 1 : 1;
      }
      longestStreak = Math.max(longestStreak, tempStreak);
    }

    // Journal streak: consecutive days with in-app journal OR vault daily entry
    // Grace-for-today: if today has no entry, start counting from yesterday
    let journalStreak = 0;
    { const d = new Date();
      const todayDk = localDateKey(d);
      if (!journalMap[todayDk] && !vaultJournalMap[todayDk]) d.setDate(d.getDate() - 1);
      for (let i = 0; i < 365; i++) {
        const dk = localDateKey(d);
        if (journalMap[dk] || vaultJournalMap[dk]) { journalStreak++; d.setDate(d.getDate() - 1); }
        else break;
      }
    }

    // Habit streak: consecutive days with ≥1 schedule slot checked
    // Grace-for-today: if today has no habit checked, start from yesterday
    const calUserSched = data.strategy?.schedule || [];
    let habitStreak = 0;
    { const d = new Date();
      const todayDk = localDateKey(d);
      const todayLog = (data.scheduleLog || {})[todayDk] || {};
      if (!calUserSched.some((_, idx) => todayLog['slot-' + idx])) d.setDate(d.getDate() - 1);
      for (let i = 0; i < 365; i++) {
        const dk = localDateKey(d);
        const dayLog = (data.scheduleLog || {})[dk] || {};
        if (calUserSched.some((_, idx) => dayLog['slot-' + idx])) { habitStreak++; d.setDate(d.getDate() - 1); }
        else break;
      }
    }

    // Month study total
    const monthPrefix = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`;
    const monthStudy = (data.timer?.sessions || [])
      .filter(s => s.date && s.date.startsWith(monthPrefix))
      .reduce((sum, s) => sum + (s.duration || 0), 0);

    let cells = '';
    for (let i = 0; i < firstDay; i++) cells += '<div class="cal-cell cal-empty"></div>';
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isToday = dateStr === todayStr;
      const hasJournal = journalMap[dateStr];
      const hasVaultJournal = !!vaultJournalMap[dateStr];
      const dueTasks = taskMap[dateStr] || [];
      const dueVaultTasks = vaultTaskMap[dateStr] || [];
      const studyMins = sessionMap[dateStr] || 0;
      const dayCaptures = captureMap[dateStr] || [];
      const isActive = activityDays.has(dateStr);
      const activityCount = ((hasJournal || hasVaultJournal) ? 1 : 0) + (dueTasks.length + dueVaultTasks.length > 0 ? 1 : 0) + (studyMins > 0 ? 1 : 0) + (dayCaptures.length > 0 ? 1 : 0) + (isActive ? 1 : 0);
      const intensityClass = activityCount >= 4 ? 'cal-high' : activityCount >= 2 ? 'cal-med' : activityCount >= 1 ? 'cal-low' : '';
      const daySchedLog = (data.scheduleLog || {})[dateStr] || {};
      const hasHabit = (data.strategy?.schedule || []).some((_, hi) => daySchedLog['slot-' + hi]);
      const dots = [];
      if (hasVaultJournal || hasJournal) dots.push('var(--green)');
      if (dueTasks.length || dueVaultTasks.length) dots.push('var(--red)');
      if (studyMins > 0) dots.push('var(--accent)');
      if (dayCaptures.length > 0 && !dots.includes('var(--accent)')) dots.push('var(--amber)');
      if (hasHabit) dots.push('#f472b6');
      if (goalAchievementMap[dateStr]?.length) dots.push('#a78bfa');

      cells += `
        <div class="cal-cell ${isToday ? 'cal-today' : ''} ${intensityClass}" onclick="App._calSelected='${dateStr}'; App.render();">
          <div class="cal-day">${d}</div>
          ${dots.length ? `<div class="cal-dots">${dots.map(c => `<span class="cal-dot" style="background:${c};"></span>`).join('')}</div>` : ''}
        </div>`;
    }

    // Selected day detail
    const sel = App._calSelected || todayStr;
    const selTasks = (taskMap[sel] || []);
    const selVaultTasks = (vaultTaskMap[sel] || []);
    const selStudy = sessionMap[sel] || 0;
    const selJournal = journalMap[sel];
    const selVaultJournal = vaultJournalMap[sel];
    const selSessions = (data.timer?.sessions || []).filter(s => s.date === sel);
    const selCaptures = (captureMap[sel] || []);

    return `
      <h1 class="view-title">Calendar</h1>
      <p class="view-subtitle">Overview of your month</p>

      <!-- Streak Banner -->
      <div class="cal-streak-banner">
        <div style="display:flex; gap:32px; align-items:center; flex-wrap:wrap;">
          <div>
            <div style="font-size:10px; color:var(--text-dim); margin-bottom:2px;">&#9312; Journal</div>
            <div class="cal-streak-main">
              <span class="cal-streak-fire">&#128211;</span>
              <span class="cal-streak-count">${journalStreak}</span>
              <span class="cal-streak-label">day streak</span>
              ${journalStreak >= 30 ? '<span class="cal-milestone">&#127942; 30+</span>' :
                journalStreak >= 7 ? '<span class="cal-milestone">&#11088; 7+</span>' : ''}
            </div>
          </div>
          <div>
            <div style="font-size:10px; color:var(--text-dim); margin-bottom:2px;">&#9313; Habits</div>
            <div class="cal-streak-main">
              <span class="cal-streak-fire">&#128293;</span>
              <span class="cal-streak-count">${habitStreak}</span>
              <span class="cal-streak-label">day streak</span>
              ${habitStreak >= 30 ? '<span class="cal-milestone">&#127942; 30+</span>' :
                habitStreak >= 7 ? '<span class="cal-milestone">&#11088; 7+</span>' : ''}
            </div>
          </div>
        </div>
        <div class="cal-streak-secondary">
          Longest: ${longestStreak} days &middot; This month: ${monthStudy >= 60 ? Math.floor(monthStudy / 60) + 'h ' + (monthStudy % 60) + 'm' : monthStudy + 'min'} study
        </div>
      </div>

      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <button class="btn btn-ghost btn-sm" onclick="App._calMonth=${viewMonth === 0 ? 11 : viewMonth - 1}; App._calYear=${viewMonth === 0 ? viewYear - 1 : viewYear}; App.render();">&laquo; Prev</button>
          <strong style="font-size:16px;">${monthName}</strong>
          <button class="btn btn-ghost btn-sm" onclick="App._calMonth=${viewMonth === 11 ? 0 : viewMonth + 1}; App._calYear=${viewMonth === 11 ? viewYear + 1 : viewYear}; App.render();">Next &raquo;</button>
        </div>
        <div class="cal-grid">
          <div class="cal-header">Su</div><div class="cal-header">Mo</div><div class="cal-header">Tu</div>
          <div class="cal-header">We</div><div class="cal-header">Th</div><div class="cal-header">Fr</div><div class="cal-header">Sa</div>
          ${cells}
        </div>
        <div style="display:flex; gap:12px; margin-top:8px; font-size:11px; color:var(--text-dim);">
          <span><span class="cal-dot" style="background:var(--green); display:inline-block;"></span> Journal</span>
          <span><span class="cal-dot" style="background:var(--red); display:inline-block;"></span> Tasks due</span>
          <span><span class="cal-dot" style="background:var(--accent); display:inline-block;"></span> Study</span>
          <span><span class="cal-dot" style="background:var(--amber); display:inline-block;"></span> Captures</span>
          <span><span class="cal-dot" style="background:#f472b6; display:inline-block;"></span> Habits</span>
          <span><span class="cal-dot" style="background:#a78bfa; display:inline-block;"></span> Achieved</span>
        </div>
      </div>

      <div class="card">
        <div class="strat-section-label" style="margin-bottom:10px;">${new Date(sel + 'T12:00:00').toLocaleDateString(undefined, { weekday:'long', month:'long', day:'numeric' })}</div>
        ${selVaultJournal ? `
          <div style="display:flex; align-items:flex-start; gap:8px; margin-bottom:10px; padding:8px; background:var(--bg-input); border-radius:8px; border-left:3px solid var(--green);">
            <span style="font-size:13px;">📓</span>
            <div style="flex:1;">
              <div style="font-size:11px; font-weight:600; color:var(--green); margin-bottom:4px;">Vault Journal</div>
              <div style="font-size:12px; color:var(--text-dim); line-height:1.6; white-space:pre-wrap;">${selVaultJournal.lines.filter(l => l.trim()).map(l => escapeHTML(l)).join('\n')}</div>
            </div>
          </div>
        ` : selJournal ? `
          <div style="display:flex; align-items:flex-start; gap:8px; margin-bottom:10px; padding:8px; background:var(--bg-input); border-radius:8px; border-left:3px solid var(--green);">
            <span style="font-size:13px;">📓</span>
            <div style="flex:1;">
              <div style="font-size:11px; font-weight:600; color:var(--green); margin-bottom:4px;">Journal</div>
              ${selJournal.content ? `<div style="font-size:12px; color:var(--text-dim); line-height:1.6; white-space:pre-wrap;">${escapeHTML(selJournal.content)}</div>` : `<div style="font-size:12px; color:var(--text-dim);">Entry logged</div>`}
            </div>
          </div>
        ` : ''}
        ${selStudy > 0 ? `
          <div style="display:flex; align-items:flex-start; gap:8px; margin-bottom:10px; padding:8px; background:var(--bg-input); border-radius:8px; border-left:3px solid var(--accent);">
            <span style="font-size:13px;">⏱</span>
            <div style="flex:1;">
              <div style="font-size:11px; font-weight:600; color:var(--accent); margin-bottom:2px;">Study — ${selStudy >= 60 ? Math.floor(selStudy/60)+'h '+(selStudy%60)+'m' : selStudy+'min'}</div>
              ${selSessions.map(s => `<div style="font-size:12px; color:var(--text-dim);">${s.duration}min ${escapeHTML(s.type||'Study')}${s.note?' — '+escapeHTML(s.note):''}</div>`).join('')}
            </div>
          </div>
        ` : ''}
        ${(selTasks.length || selVaultTasks.length) ? `
          <div style="display:flex; align-items:flex-start; gap:8px; margin-bottom:10px; padding:8px; background:var(--bg-input); border-radius:8px; border-left:3px solid var(--red);">
            <span style="font-size:13px;">📋</span>
            <div style="flex:1;">
              <div style="font-size:11px; font-weight:600; color:var(--red); margin-bottom:4px;">Tasks due</div>
              ${[...selTasks, ...selVaultTasks].map(t => `<div style="font-size:12px; padding:1px 0; color:${t.done ? 'var(--green)' : 'var(--text)'};">${t.done ? '✓' : '○'} ${escapeHTML(t.text)}</div>`).join('')}
            </div>
          </div>
        ` : ''}
        ${selCaptures.length ? `
          <div style="display:flex; align-items:flex-start; gap:8px; margin-bottom:10px; padding:8px; background:var(--bg-input); border-radius:8px; border-left:3px solid var(--amber);">
            <span style="font-size:13px;">⚡</span>
            <div style="flex:1;">
              <div style="font-size:11px; font-weight:600; color:var(--amber); margin-bottom:4px;">Captures (${selCaptures.length})</div>
              ${selCaptures.map(c => `<div style="font-size:12px; color:var(--text-dim); padding:2px 0; border-bottom:1px solid var(--border); margin-bottom:2px;">${escapeHTML(c.text)}</div>`).join('')}
            </div>
          </div>
        ` : ''}
        ${(() => {
          const selSchedLog = (data.scheduleLog || {})[sel] || {};
          const userSched = data.strategy?.schedule || [];
          const checkedSlots = userSched.filter((_, i) => selSchedLog['slot-' + i]);
          if (!userSched.length || !checkedSlots.length) return '';
          const schedPct = Math.round(checkedSlots.length / userSched.length * 100);
          return `<div style="display:flex; align-items:flex-start; gap:8px; margin-bottom:10px; padding:8px; background:var(--bg-input); border-radius:8px; border-left:3px solid var(--accent);">
            <span style="font-size:13px;">✅</span>
            <div style="flex:1;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <div style="font-size:11px; font-weight:600; color:var(--accent);">Habits — ${checkedSlots.length}/${userSched.length} (${schedPct}%)</div>
              </div>
              <div class="progress-bar" style="height:4px; margin-bottom:6px;">
                <div class="progress-fill" style="width:${schedPct}%; background:${schedPct===100?'var(--green)':'var(--accent)'};"></div>
              </div>
              ${checkedSlots.map(s => `<div style="font-size:12px; color:var(--text-dim); padding:1px 0;">✓ ${escapeHTML(s.time)} ${escapeHTML(s.activity)}</div>`).join('')}
            </div>
          </div>`;
        })()}
        ${(() => {
          // Project items reviewed on this day
          const reviewedItems = [];
          for (const cl of (data.checklists || [])) {
            for (const sec of (cl.sections || [])) {
              for (const item of (sec.items || [])) {
                if ((item.revisions || []).some(r => r.date === sel)) {
                  reviewedItems.push({ project: cl.name, icon: cl.icon || '📋', color: cl.color || 'var(--accent)', item: item.text, section: sec.name });
                }
              }
            }
          }
          if (!reviewedItems.length) return '';
          return `<div style="display:flex; align-items:flex-start; gap:8px; margin-bottom:10px; padding:8px; background:var(--bg-input); border-radius:8px; border-left:3px solid var(--accent);">
            <span style="font-size:13px;">📚</span>
            <div style="flex:1;">
              <div style="font-size:11px; font-weight:600; color:var(--accent); margin-bottom:4px;">Reviewed (${reviewedItems.length})</div>
              ${reviewedItems.map(r => `<div style="font-size:12px; color:var(--text-dim); padding:1px 0;"><span style="color:${r.color};">${r.icon} ${escapeHTML(r.project)}</span> — ${escapeHTML(r.item)}</div>`).join('')}
            </div>
          </div>`;
        })()}
        ${(() => {
          const selAchievements = goalAchievementMap[sel] || [];
          if (!selAchievements.length) return '';
          return `<div style="display:flex; align-items:flex-start; gap:8px; margin-bottom:10px; padding:8px; background:var(--bg-input); border-radius:8px; border-left:3px solid #a78bfa;">
            <span style="font-size:13px;">🏆</span>
            <div style="flex:1;">
              <div style="font-size:11px; font-weight:600; color:#a78bfa; margin-bottom:4px;">Goal Achieved!</div>
              ${selAchievements.map(g => `<div style="font-size:12px; color:var(--text-dim);">✓ ${escapeHTML(g.text)}</div>`).join('')}
            </div>
          </div>`;
        })()}
        ${!selStudy && !selTasks.length && !selVaultTasks.length && !selJournal && !selVaultJournal && !selCaptures.length && !(data.strategy?.schedule||[]).some((_,i) => ((data.scheduleLog||{})[sel]||{})['slot-'+i]) && !Object.values((data.checklists||[])).some(cl => (cl.sections||[]).some(sec => (sec.items||[]).some(item => (item.revisions||[]).some(r => r.date===sel)))) && !(goalAchievementMap[sel]?.length) ? `<div style="font-size:13px; color:var(--text-dim); text-align:center; padding:12px 0;">No activity on this day</div>` : ''}
      </div>
    `;
  },

  // ─── Shortcuts (Help Page) ──────────────────
  shortcuts() {
    const data = Store.get();
    const customTags = data.weeklyReviewTags || ['lesson', 'people', 'food'];

    return `
      <h1 class="view-title">Shortcuts & Guide</h1>
      <p class="view-subtitle">How to use Nexus</p>
      <div style="margin-bottom:16px;">
        <button class="btn btn-primary btn-sm" onclick="App.startTutorial()">&#128218; Take Interactive Tour</button>
      </div>

      <div class="card">
        <div class="strat-section-label">Keyboard Shortcuts</div>
        <div style="font-size:11px; color:var(--text-dim); margin-bottom:10px;">Hold <strong>Ctrl+Shift</strong> then press the key.</div>
        <div class="shortcuts-grid">
          <div class="shortcut-row"><span>Dashboard</span><span class="shortcut-key">Ctrl+Shift+D</span></div>
          <div class="shortcut-row"><span>Today</span><span class="shortcut-key">Ctrl+Shift+Y</span></div>
          <div class="shortcut-row"><span>Capture</span><span class="shortcut-key">Ctrl+Shift+C</span></div>
          <div class="shortcut-row"><span>Tasks</span><span class="shortcut-key">Ctrl+Shift+T</span></div>
          <div class="shortcut-row"><span>Journal</span><span class="shortcut-key">Ctrl+Shift+J</span></div>
          <div class="shortcut-row"><span>Strategy</span><span class="shortcut-key">Ctrl+Shift+G</span></div>
          <div class="shortcut-row"><span>Vault</span><span class="shortcut-key">Ctrl+Shift+V</span></div>
          <div class="shortcut-row"><span>Search</span><span class="shortcut-key">Ctrl+Shift+S</span></div>
          <div class="shortcut-row"><span>Focus Mode</span><span class="shortcut-key">Ctrl+Shift+F</span></div>
          <div class="shortcut-row"><span>Vault Search</span><span class="shortcut-key">Ctrl+Shift+/</span></div>
          <div class="shortcut-row"><span>Shortcut Help</span><span class="shortcut-key">Ctrl+Shift+?</span></div>
        </div>
      </div>

      <div class="card">
        <div class="strat-section-label">How It Works</div>
        <div style="font-size:13px; color:var(--text-dim); line-height:1.8;">
          <p><strong>Dashboard</strong> — Overview of your progress, exam countdown, recent captures.</p>
          <p><strong>Today</strong> — Daily view with study timer, habits, tasks, and schedule.</p>
          <p><strong>Capture</strong> — Quick thoughts and ideas. Saved to app + Obsidian vault.</p>
          <p><strong>Tasks</strong> — To-do list. Vault tasks sync from your Obsidian files.</p>
          <p><strong>Journal</strong> — Quick daily log for recording what happened today. Feeds into streaks and weekly reviews.</p>
          <p><strong>Goals</strong> — Track long-term goals and milestones.</p>
          <p><strong>Vault</strong> — Browse and search your Obsidian vault files.</p>
          <p><strong>Growth</strong> — Stats, streaks, heatmap, and weekly review export.</p>
          <p><strong>Strategy</strong> — Exam roadmap, monthly allocations, topics, MCQ tracker.</p>
        </div>
      </div>

      <div class="card">
        <div class="strat-section-label">Study Timer</div>
        <div style="font-size:13px; color:var(--text-dim); line-height:1.8;">
          <p><strong>Presets:</strong> 25m (Pomodoro), 45m (Deep Work), 15m (Short Break)</p>
          <p><strong>Custom:</strong> Type any number of minutes and click Start.</p>
          <p><strong>Stopwatch:</strong> Counts up — press Stop when done.</p>
          <p>After completing a session, you can <strong>Log to Capture</strong> to save it.</p>
          <p>A browser notification will alert you when a countdown finishes.</p>
        </div>
      </div>

      <div class="card">
        <div class="strat-section-label">Tags in Captures</div>
        <div style="font-size:13px; color:var(--text-dim); line-height:1.8;">
          <p>Use <code>#tags</code> in your captures to categorize them.</p>
          <p>Examples: <code>#idea</code>, <code>#todo</code>, <code>#exam</code>, <code>#review</code></p>
          <p>Filter captures by clicking on tag badges in the Capture view.</p>
        </div>
      </div>

      <div class="card">
        <div class="strat-section-label">Journal / Daily Log</div>
        <div style="font-size:13px; color:var(--text-dim); line-height:1.8;">
          <p>The Journal is a <strong>quick daily log</strong> — write short bullets about what you did, learned, or noticed today.</p>
          <p>Keep it simple: one line per thought. Use <code>#tags</code> like <code>#lesson</code>, <code>#people</code>, <code>#food</code> so they appear in your weekly review.</p>
          <p>Your entries automatically count toward <strong>streaks</strong> and <strong>Growth stats</strong> (days logged, words written).</p>
          <p>If connected to Obsidian, entries sync to your <strong>Rapid Log</strong> — open them in Obsidian for richer editing (headings, checkboxes, links).</p>
          <p style="color:var(--accent);">Tip: Use Nexus for quick logging, Obsidian for deep journaling.</p>
        </div>
      </div>

      <div class="card">
        <div class="strat-section-label">Weekly Review — Custom Tags</div>
        <div style="font-size:13px; color:var(--text-dim); margin-bottom:8px;">
          Tags below get their own section in the weekly review export. Uses entries from your Rapid Log that contain these #tags.
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px;">
          ${customTags.map(t => `
            <span class="tag-badge" style="display:inline-flex; align-items:center; gap:4px;">
              #${escapeHTML(t)}
              <button class="item-delete" style="position:static; font-size:14px; padding:0 2px;" onclick="App.removeWeeklyTag('${t}')">&times;</button>
            </span>
          `).join('')}
        </div>
        <div class="strat-settings-row">
          <input type="text" id="weekly-tag-input" class="strat-settings-input" placeholder="Add tag (without #)" style="flex:1;"
            onkeydown="if(event.key==='Enter')App.addWeeklyTag()">
          <button class="btn btn-primary btn-sm" onclick="App.addWeeklyTag()">Add</button>
        </div>
      </div>

      <div class="card">
        <div class="strat-section-label">Task Source</div>
        <div style="margin-bottom:8px;">
          <select class="strat-settings-input" style="width:100%;" onchange="App.setTaskSource(this.value)">
            <option value="both" ${(data.taskSource||'both')==='both'?'selected':''}>Both (Nexus tasks + Vault tasks)</option>
            <option value="nexus" ${data.taskSource==='nexus'?'selected':''}>Nexus tasks only (no vault needed)</option>
            <option value="vault" ${data.taskSource==='vault'?'selected':''}>Vault tasks only</option>
          </select>
        </div>
        <div style="font-size:11px; color:var(--text-dim);">Use "Nexus only" if you don't have an Obsidian vault. Tasks added in the app will still appear.</div>
      </div>

      <div class="card">
        <div class="strat-section-label">Vault Connection</div>
        <div style="font-size:13px; color:var(--text-dim); margin-bottom:8px;">
          ${App.vaultAvailable ? `<span style="color:var(--green);">&#10003; Connected</span> — ${escapeHTML((App.serverConfig || {}).vaultPath || '')}`
            : 'Not connected. Connect your Obsidian vault to enable journaling sync, task sync, and weekly reviews.'}
        </div>
        <div style="display:flex; gap:8px; margin-bottom:8px;">
          <input type="text" id="settings-vault-path" class="strat-settings-input" placeholder="Vault folder path (e.g. D:/Obsidian/My Vault)" style="flex:1;" value="${escapeHTML((App.serverConfig || {}).vaultPath || '')}">
          <button class="btn btn-primary btn-sm" onclick="App.updateVaultPath()">Save</button>
        </div>
        <div style="font-size:12px; color:var(--text-dim); margin-bottom:4px;">Daily journal / rapid log filename:</div>
        <div style="display:flex; gap:8px;">
          <input type="text" id="settings-rapid-log" class="strat-settings-input" placeholder="e.g. Daily Notes.md or 02 Rapid logging.md" style="flex:1;" value="${escapeHTML((App.serverConfig || {}).rapidLogFile || '02 Rapid logging.md')}">
          <button class="btn btn-primary btn-sm" onclick="App.saveRapidLogFile()">Save</button>
        </div>
        <div style="font-size:11px; color:var(--text-dim); margin-top:4px;">The markdown file in your vault used for daily journaling. Each user may have a different filename.</div>
      </div>
    `;
  },

  // ─── Settings (standalone) ──────────────────
  settings() {
    const data = Store.get();
    const theme = data.theme || 'dark';
    const accentColor = data.accentColor || '#7c6ff7';
    const fontSize = data.fontSize || 'medium';
    const defaultView = data.defaultView || 'dashboard';
    const hiddenNav = data.hiddenNavItems || [];

    // All hideable nav items (dashboard + settings are always visible)
    const navOptions = [
      { view: 'today',     label: 'Today' },
      { view: 'capture',   label: 'Capture' },
      { view: 'tasks',     label: 'Tasks' },
      { view: 'journal',   label: 'Journal' },
      { view: 'vault',     label: 'Vault' },
      { view: 'growth',    label: 'Growth' },
      { view: 'calendar',  label: 'Calendar' },
      { view: 'strategy',  label: 'Strategy' },
      { view: 'shortcuts', label: 'Shortcuts' },
    ];

    return `
      <h1 class="view-title">Settings</h1>
      <p class="view-subtitle">App preferences and connections</p>

      <!-- Profile -->
      <div class="card">
        <div class="strat-section-label">Profile</div>
        <div style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
          <div>
            <div style="font-size:13px; font-weight:600;">Your Name</div>
            <div style="font-size:11px; color:var(--text-dim);">Personalises your dashboard greeting every day</div>
          </div>
          <div style="display:flex; gap:8px; align-items:center;">
            <input type="text" id="settings-username" class="strat-settings-input" placeholder="e.g. Alex" style="width:130px;" value="${escapeHTML(data.userName || '')}">
            <button class="btn btn-primary btn-sm" onclick="App.saveUserName()">Save</button>
          </div>
        </div>
      </div>

      <!-- Appearance -->
      <div class="card">
        <div class="strat-section-label">Appearance</div>
        <div style="display:flex; flex-direction:column; gap:14px;">

          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-size:13px; font-weight:600;">Theme</div>
              <div style="font-size:11px; color:var(--text-dim);">Switch between dark and light mode</div>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="App.toggleTheme()" style="min-width:90px;">
              ${theme === 'dark' ? '☀ Light mode' : '☾ Dark mode'}
            </button>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-size:13px; font-weight:600;">Accent Color</div>
              <div style="font-size:11px; color:var(--text-dim);">Primary highlight color throughout the app</div>
            </div>
            <input type="color" value="${accentColor}" style="width:36px; height:36px; border:none; background:none; cursor:pointer; border-radius:8px;"
              onchange="App.setAccentColor(this.value)">
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-size:13px; font-weight:600;">Font Size</div>
              <div style="font-size:11px; color:var(--text-dim);">Base text size across the app</div>
            </div>
            <select class="strat-settings-input" style="width:110px;" onchange="App.setFontSize(this.value)">
              <option value="small" ${fontSize==='small'?'selected':''}>Small (13px)</option>
              <option value="medium" ${fontSize==='medium'?'selected':''}>Medium (15px)</option>
              <option value="large" ${fontSize==='large'?'selected':''}>Large (17px)</option>
            </select>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-size:13px; font-weight:600;">Default View</div>
              <div style="font-size:11px; color:var(--text-dim);">Which view opens when you launch the app</div>
            </div>
            <select class="strat-settings-input" style="width:120px;" onchange="App.setDefaultView(this.value)">
              <option value="dashboard" ${defaultView==='dashboard'?'selected':''}>Dashboard</option>
              <option value="today" ${defaultView==='today'?'selected':''}>Today</option>
              <option value="tasks" ${defaultView==='tasks'?'selected':''}>Tasks</option>
              <option value="strategy" ${defaultView==='strategy'?'selected':''}>Strategy</option>
              <option value="journal" ${defaultView==='journal'?'selected':''}>Journal</option>
            </select>
          </div>

        </div>
      </div>

      <!-- Navigation -->
      <div class="card">
        <div class="strat-section-label">Navigation</div>
        <div style="font-size:11px; color:var(--text-dim); margin-bottom:12px;">Show or hide items in the sidebar. Dashboard and Settings are always visible.</div>
        <div style="display:flex; flex-direction:column; gap:10px;">
          ${navOptions.map(opt => {
            const isHidden = hiddenNav.includes(opt.view);
            return `
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:13px; ${isHidden ? 'color:var(--text-dim);text-decoration:line-through;' : ''}">${opt.label}</span>
              <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:12px; color:var(--text-dim);">
                <span>${isHidden ? 'Hidden' : 'Visible'}</span>
                <div class="settings-toggle ${isHidden ? '' : 'on'}" onclick="App.toggleNavItem('${opt.view}')">
                  <div class="settings-toggle-knob"></div>
                </div>
              </label>
            </div>`;
          }).join('')}
        </div>
      </div>

      <!-- Task Source -->
      <div class="card">
        <div class="strat-section-label">Task Source</div>
        <div style="margin-bottom:8px;">
          <select class="strat-settings-input" style="width:100%;" onchange="App.setTaskSource(this.value)">
            <option value="both" ${(data.taskSource||'both')==='both'?'selected':''}>Both (Nexus tasks + Vault tasks)</option>
            <option value="nexus" ${data.taskSource==='nexus'?'selected':''}>Nexus tasks only (no vault needed)</option>
            <option value="vault" ${data.taskSource==='vault'?'selected':''}>Vault tasks only</option>
          </select>
        </div>
        <div style="font-size:11px; color:var(--text-dim);">Use "Nexus only" if you don't have an Obsidian vault. <span style="color:var(--green);">Saved automatically.</span></div>
      </div>

      <!-- Vault Connection -->
      <div class="card">
        <div class="strat-section-label">Vault Connection</div>
        <div style="font-size:13px; color:var(--text-dim); margin-bottom:8px;">
          ${App.vaultAvailable ? `<span style="color:var(--green);">&#10003; Connected</span> — ${escapeHTML((App.serverConfig || {}).vaultPath || '')}`
            : 'Not connected. Connect your Obsidian vault to enable journaling sync and task sync.'}
        </div>
        <div style="display:flex; gap:8px; margin-bottom:8px;">
          <input type="text" id="settings-vault-path" class="strat-settings-input" placeholder="Vault folder path (e.g. D:/Obsidian/My Vault)" style="flex:1;" value="${escapeHTML((App.serverConfig || {}).vaultPath || '')}">
          <button class="btn btn-primary btn-sm" onclick="App.updateVaultPath()">Save</button>
        </div>
        <div style="font-size:12px; color:var(--text-dim); margin-bottom:4px;">Daily journal / rapid log filename:</div>
        <div style="display:flex; gap:8px;">
          <input type="text" id="settings-rapid-log" class="strat-settings-input" placeholder="e.g. Daily Notes.md" style="flex:1;" value="${escapeHTML((App.serverConfig || {}).rapidLogFile || '02 Rapid logging.md')}">
          <button class="btn btn-primary btn-sm" onclick="App.saveRapidLogFile()">Save</button>
        </div>
        <div style="font-size:11px; color:var(--text-dim); margin-top:4px;">The markdown file used for daily journaling.</div>
      </div>

      <!-- File Locations -->
      ${App.vaultAvailable ? (() => {
        const vaultPath = (App.serverConfig || {}).vaultPath || '';
        const rapidLog = (App.serverConfig || {}).rapidLogFile || '02 Rapid logging.md';
        const checklists = data.checklists || [];
        return `<div class="card">
          <div class="strat-section-label">File Locations</div>
          <div style="font-size:11px; color:var(--text-dim); margin-bottom:10px;">All Markdown files read or written by Nexus:</div>
          <div class="settings-file-row">
            <span class="settings-file-label">App Data</span>
            <code class="settings-file-path">nexus-data.json (+ backups/)</code>
          </div>
          <div class="settings-file-row">
            <span class="settings-file-label">Daily Journal / Rapid Log</span>
            <code class="settings-file-path">${escapeHTML(vaultPath)}/${escapeHTML(rapidLog)}</code>
          </div>
          <div class="settings-file-row">
            <span class="settings-file-label">Captures</span>
            <code class="settings-file-path">${escapeHTML(vaultPath)}/${escapeHTML((App.serverConfig||{}).captureFile||'04 Quick captures.md')}</code>
          </div>
          ${checklists.map(cl => {
            const sn = cl.name.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
            return `<div class="settings-file-row">
              <span class="settings-file-label">${escapeHTML(cl.icon||'📋')} ${escapeHTML(cl.name)}</span>
              <code class="settings-file-path">${escapeHTML(vaultPath)}/nexus_project/${sn}/checklist.md</code>
            </div>`;
          }).join('')}
        </div>`;
      })() : ''}

      <!-- Export & Import -->
      <div class="card">
        <div class="strat-section-label">Export &amp; Import</div>
        <div style="font-size:12px; font-weight:600; color:var(--text); margin-bottom:6px;">Export</div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
          <button class="btn btn-primary btn-sm" id="export-btn">&#11015; Export App Data (JSON)</button>
          <button class="btn btn-ghost btn-sm" onclick="App.exportNexusProject()" ${!App.vaultAvailable ? 'disabled title="Connect vault first"' : ''}>
            &#11015; Export nexus_project/ <span style="font-size:10px; color:var(--amber);">&#9888; may be large</span>
          </button>
          <button class="btn btn-ghost btn-sm" onclick="App.exportFullVault()" ${!App.vaultAvailable ? 'disabled title="Connect vault first"' : ''} style="border-color:var(--amber)40;">
            &#11015; Export Full Vault <span style="font-size:10px; color:var(--red);">&#9888; can be GBs</span>
          </button>
        </div>
        <div style="font-size:11px; color:var(--text-dim); margin-bottom:14px;">
          <strong>App Data</strong> = tasks, journal, captures, checklists, settings (small JSON).<br>
          <strong>nexus_project/</strong> = your project checklists as Markdown (small).<br>
          <strong>Full Vault</strong> = your entire linked Obsidian vault folder as a zip. This can be very large — only use if you want a local backup and have enough disk space.
        </div>
        <div style="font-size:12px; font-weight:600; color:var(--text); margin-bottom:6px;">Import / Restore</div>
        <button class="btn btn-ghost btn-sm" id="import-wizard-btn" onclick="App.openImportWizard()">&#9874; Import &amp; Setup Wizard</button>
        <div style="font-size:11px; color:var(--text-dim); margin-top:4px; margin-bottom:14px;">Step-by-step: restore a backup, connect a vault, or set up fresh.</div>
        <div style="border-top:1px solid var(--border); padding-top:12px; margin-top:4px;">
          <div style="font-size:12px; font-weight:600; color:var(--text); margin-bottom:4px;">Onboarding</div>
          <div style="font-size:11px; color:var(--text-dim); margin-bottom:8px;">Re-run the step-by-step setup wizard. Your existing data will not be deleted.</div>
          <button class="btn btn-ghost btn-sm" onclick="App.rerunSetup()">&#9654; Replay Setup Wizard</button>
          <button class="btn btn-ghost btn-sm" onclick="App.startTutorial()" style="margin-left:8px;">&#128218; Interactive Tour</button>
        </div>
        <div style="border-top:1px solid var(--border); padding-top:12px; margin-top:12px;">
          <div style="font-size:12px; font-weight:600; color:var(--text); margin-bottom:4px;">Backups</div>
          <div style="font-size:11px; color:var(--text-dim); margin-bottom:8px;">Auto-backups run hourly. You can also create a manual backup anytime.</div>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <button class="btn btn-ghost btn-sm" onclick="App.createManualBackup()">&#128190; Create Backup Now</button>
            <button class="btn btn-ghost btn-sm" onclick="App.showBackupInfo()">&#128196; View Backups</button>
            <span id="backup-status" style="font-size:11px; color:var(--text-dim);"></span>
          </div>
          <div id="backup-list" style="margin-top:8px;"></div>
        </div>
        <div style="border-top:1px solid var(--border); padding-top:12px; margin-top:12px;">
          <div style="font-size:12px; font-weight:600; color:var(--text); margin-bottom:4px;">Update Nexus</div>
          <div style="font-size:11px; color:var(--text-dim); margin-bottom:8px;">Pull the latest version from GitHub. Your data will be backed up automatically.</div>
          <button class="btn btn-primary btn-sm" id="update-nexus-btn" onclick="App.checkForUpdates()">&#8635; Check for Updates</button>
          <span id="update-status" style="font-size:11px; color:var(--text-dim); margin-left:8px;"></span>
        </div>
      </div>

      <!-- Import Wizard Modal (rendered inline when active) -->
      ${App._importWizard ? App._renderImportWizard() : ''}
    `;
  }
};
