// ═══════════════════════════════════════════════════
//  Nexus — Dashboard View
// ═══════════════════════════════════════════════════
import {
  timeAgo, formatDate, contrastColor,
  localDateKey, todayKey, escapeHTML,
  curMonthKey, getGreeting, WEEKLY_TEMPLATE
} from '../utils.js';
import { Store } from '../store.js';

export function dashboard() {
    const data = Store.get();
    const openTasks = data.tasks.filter(t => !t.done).length;
    const nexusDone = data.tasks.filter(t => t.done).length;
    const doneTasks = (window.App.vaultStats ? window.App.vaultStats.completedTasks : 0) + nexusDone;
    const totalCaptures = data.captures.length;
    const journalEntries = (window.App.vaultStats ? window.App.vaultStats.totalDailyEntries : 0) + data.journal.length;
    const activeGoals = data.goals.length;

    // Compute real activity streak — same sources as Calendar view
    const activityDays = new Set();
    for (const j of data.journal) { if (j.date) activityDays.add(j.date); }
    for (const s of (data.timer?.sessions || [])) { if (s.date) activityDays.add(s.date); }
    for (const c of data.captures) {
      const d = localDateKey(new Date(c.created));
      activityDays.add(d);
    }
    for (const e of (window.App.vaultDailyEntries || [])) { if (e.date) activityDays.add(e.date); }
    for (const d of (window.App.vaultStats?.dailyDates || [])) { activityDays.add(d); }
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
    if (taskSource !== 'nexus' && window.App.vaultTasks) {
      vaultOpenTasks.push(...(window.App.vaultTasks.active || []).slice(0, 5));
    }
    const vaultPending = window.App.vaultTasks ? window.App.vaultTasks.summary.pending : 0;

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
        const vaultActive = window.App.vaultTasks ? window.App.vaultTasks.summary.activeCount : 0;
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
        if (!window.App.vaultAvailable || !window.App.vaultSuggestions || !window.App.vaultSuggestions.suggestions || !window.App.vaultSuggestions.suggestions.length) return '';
        return `
          <div class="card" style="border-left: 3px solid var(--amber);">
            <div class="strat-section-label">Nexus Suggests</div>
            ${window.App.vaultSuggestions.suggestions.map(s => `
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
        if (!window.App.vaultAvailable || !window.App.vaultStats) return '';
        return `
          <h3 style="margin:20px 0 12px; font-size:16px; color:var(--text-dim);">Vault Insights</h3>
          <div class="stats-grid">
            <div class="stat-card" onclick="document.querySelector('[data-view=vault]').click()" style="cursor:pointer;">
              <div class="stat-number" style="color:var(--green);">${window.App.vaultStats.totalFiles}</div>
              <div class="stat-label">Vault Files</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${window.App.vaultStats.totalDailyEntries}</div>
              <div class="stat-label">Daily Entries</div>
            </div>
            <div class="stat-card" onclick="document.querySelector('[data-view=tasks]').click()" style="cursor:pointer;">
              <div class="stat-number">${window.App.vaultTasks ? window.App.vaultTasks.summary.pending : window.App.vaultStats.pendingTasks}</div>
              <div class="stat-label">Vault Pending</div>
            </div>
            <div class="stat-card" onclick="document.querySelector('[data-view=growth]').click()" style="cursor:pointer;">
              <div class="stat-number">${window.App.vaultStats.entriesThisWeek}</div>
              <div class="stat-label">Journal This Week</div>
            </div>
          </div>`;
      },

      'tag-cloud': () => {
        // Merge vault tags + app capture tags for real-time updates
        const combined = { ...(window.App.vaultStats?.tagCounts || {}) };
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
  }
