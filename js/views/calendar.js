// ═══════════════════════════════════════════════════
//  Nexus — Calendar View
// ═══════════════════════════════════════════════════
import { localDateKey, todayKey, escapeHTML } from '../utils.js';
import { Store } from '../store.js';

export function calendar() {
    const data = Store.get();
    const now = new Date();
    const viewMonth = window.App._calMonth ?? now.getMonth();
    const viewYear = window.App._calYear ?? now.getFullYear();
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const monthName = new Date(viewYear, viewMonth).toLocaleString(undefined, { month: 'long', year: 'numeric' });
    const todayStr = todayKey();

    // Build data maps for the month
    const journalMap = {};
    for (const j of data.journal) { journalMap[j.date] = j; }
    // Vault daily entries
    const vaultJournalMap = {};
    for (const e of (window.App.vaultDailyEntries || [])) { if (e.date) vaultJournalMap[e.date] = e; }
    const taskMap = {};
    for (const t of data.tasks) {
      if (t.due) { if (!taskMap[t.due]) taskMap[t.due] = []; taskMap[t.due].push(t); }
    }
    // Vault tasks due dates
    const vaultTaskMap = {};
    for (const t of [...(window.App.vaultTasks?.active||[]), ...(window.App.vaultTasks?.backlog||[]), ...(window.App.vaultTasks?.other||[])]) {
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
    for (const e of (window.App.vaultDailyEntries || [])) activityDays.add(e.date);
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
    const sel = window.App._calSelected || todayStr;
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
  }
