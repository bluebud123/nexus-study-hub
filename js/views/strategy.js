// ═══════════════════════════════════════════════════
//  Nexus — Strategy View
// ═══════════════════════════════════════════════════
import {
  contrastColor, localDateKey, escapeHTML,
  curMonthKey, monthLabel, getRoadmapMonths, COLOUR_PALETTE
} from '../utils.js';
import { Store } from '../store.js';

export function strategy() {
    const data = Store.get();
    const s = data.strategy;
    const roadmapMonths = getRoadmapMonths(s, data.checklists);
    const month = window.App.strategyMonth || curMonthKey();
    const tab = window.App.strategyTab || 'roadmap';
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
      if (!window.App.calendarYear) window.App.calendarYear = parseInt(month.slice(0,4), 10) || new Date().getFullYear();
      const calYear = window.App.calendarYear;
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
          if (!window.App._ganttExpanded) window.App._ganttExpanded = {};
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
                const isExpanded = !!window.App._ganttExpanded[row.id];
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
            const prompt = window.App._goalPrompt;
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
      const activeId = window.App.strategyProject || checklists[0]?.id || null;
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
            ${window.App._projAddOpen ? `
              <div style="position:absolute; top:36px; left:0; z-index:100; background:var(--bg-card); border:1px solid var(--border); border-radius:10px; padding:10px; min-width:220px; box-shadow:0 4px 20px rgba(0,0,0,0.3);">
                <button class="btn btn-ghost" style="width:100%; margin-bottom:8px;" onclick="App._projAddOpen=false; App.uploadChecklist()">⬆ Upload .md file</button>
                <div style="display:flex; gap:6px; margin-bottom:8px;">
                  <button class="btn btn-ghost btn-sm" style="flex:1;" onclick="App.downloadChecklistTemplate()">↓ Template</button>
                  <button class="btn btn-ghost btn-sm" style="flex:1;" onclick="App.copyAIPrompt()">⧉ AI Prompt</button>
                </div>
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
          const isEditingProj = window.App._editingProject === activeCL.id;

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
                      <div class="colour-palette-row" style="display:flex; flex-wrap:wrap; gap:4px; align-items:center;">
                        ${COLOUR_PALETTE.map(c => `<div class="colour-swatch${c === clColor ? ' selected' : ''}" style="background:${c};" title="${c}" onclick="App.updateChecklistMeta('${activeCL.id}', 'color', '${c}')"></div>`).join('')}
                        <label title="Custom colour" style="cursor:pointer;">
                          <div class="colour-swatch" style="background:var(--border); display:flex; align-items:center; justify-content:center; font-size:13px; color:var(--text-dim);">+</div>
                          <input type="color" value="${clColor}" style="position:absolute; opacity:0; width:0; height:0;" onchange="App.updateChecklistMeta('${activeCL.id}', 'color', this.value)">
                        </label>
                      </div>
                      ${daysLeft !== null ? `<span style="font-size:11px; color:var(--text-dim);">${daysLeft} days left</span>` : ''}
                      <span style="font-size:11px; color:var(--text-dim);">${revDone}/${allItems.length} reviewed</span>
                    </div>
                    <textarea placeholder="Add a description…" rows="2"
                      style="width:100%; margin-top:8px; font-size:12px; background:var(--bg-input); border:1px solid var(--border); border-radius:6px; color:var(--text); padding:6px 8px; resize:vertical; box-sizing:border-box;"
                      onchange="App.updateChecklistMeta('${activeCL.id}', 'description', this.value)">${escapeHTML(activeCL.description||'')}</textarea>
                  `}
                </div>
                <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                  ${window.App.vaultAvailable ? `<span style="font-size:10px; color:var(--green); opacity:0.7;" title="Auto-syncs to vault when items are checked">&#8593; vault${activeCL.lastVaultSync ? ' · ' + activeCL.lastVaultSync : ''}</span>` : ''}
                  ${window.App.vaultAvailable && !activeCL.vaultFile ? `<button class="btn btn-ghost btn-sm" style="color:var(--accent); font-size:11px;" onclick="App.createProjectVaultFile('${activeCL.id}')" title="Create vault MD file">📁 Link vault</button>` : ''}
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
              const isEditingSec = window.App._editingSection && window.App._editingSection.clId === activeCL.id && window.App._editingSection.secIdx === secIdx;

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
                      const isEditingIt = window.App._editingItem && window.App._editingItem.clId === activeCL.id && window.App._editingItem.secIdx === secIdx && window.App._editingItem.itemIdx === itemIdx;

                      return `
                        <div style="display:flex; align-items:flex-start; gap:6px; padding:5px 0; border-bottom:1px solid rgba(255,255,255,0.04);"
                          draggable="true"
                          ondragstart="App.onItemDragStart(event, '${activeCL.id}', ${secIdx}, ${itemIdx})"
                          ondragover="event.preventDefault(); this.style.borderTop='2px solid var(--accent)'"
                          ondragleave="this.style.borderTop=''"
                          ondrop="this.style.borderTop=''; App.onItemDrop(event, '${activeCL.id}', ${secIdx}, ${itemIdx})">
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
  }
