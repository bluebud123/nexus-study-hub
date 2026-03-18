// ═══════════════════════════════════════════════════
//  Nexus — Growth View
// ═══════════════════════════════════════════════════
import { localDateKey, escapeHTML } from '../utils.js';
import { VaultAPI } from '../vault-api.js';
import { Store } from '../store.js';

export function growth() {
    const data = Store.get();
    const g = window.App.growthData;
    if (!g) {
      // Trigger load if not already in flight
      if (!window.App._growthLoading) {
        window.App._growthLoading = true;
        VaultAPI.getGrowth().then(d => { window.App.growthData = d; window.App._growthLoading = false; window.App.render(); }).catch(() => { window.App._growthLoading = false; window.App.render(); });
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
            ${window.App.weeklyReview ? `<button class="btn btn-ghost btn-sm" onclick="App.exportWeeklyReview()">Export to Vault</button>` : ''}
            <button class="btn btn-primary btn-sm" onclick="App.generateWeeklyReview()">
              ${window.App.weeklyReview ? 'Refresh' : 'Generate'}
            </button>
          </div>
        </div>
        ${window.App.weeklyReview ? (() => {
          const wr = window.App.weeklyReview;
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
        ${window.App.weeklyExportMsg ? `<div style="font-size:12px; color:var(--green); margin-top:8px;">${escapeHTML(window.App.weeklyExportMsg)}</div>` : ''}
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
          <span style="font-size:11px; color:var(--text-dim); cursor:pointer;" onclick="App.showAllSessions=!App.showAllSessions; App.render();">${window.App.showAllSessions ? 'Show less' : 'Show all'}</span>
        </div>
        ${(() => {
          const sessions = [...((Store.get().timer || {}).sessions || [])].reverse();
          const shown = window.App.showAllSessions ? sessions : sessions.slice(0, 5);
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
            value="${escapeHTML(window.App.growthTagFilter)}"
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
        ${window.App.growthTagEntries ? `
          <div class="growth-tag-results">
            <div style="display:flex; justify-content:space-between; align-items:center; margin:12px 0 8px;">
              <span style="font-size:13px; font-weight:600; color:var(--accent);">#${escapeHTML(window.App.growthTagFilter)} — ${window.App.growthTagEntries.count} entries</span>
              <button class="btn btn-ghost btn-sm" onclick="App.clearGrowthTag()">Clear</button>
            </div>
            ${window.App.growthTagEntries.entries.slice(0, 30).map(e => `
              <div class="lesson-item">
                <div class="lesson-date">
                  ${e.date}${e.source === 'app' ? ' <span style="font-weight:400; opacity:0.5; font-size:10px;">· app</span>' : ''}
                </div>
                <div class="lesson-text">${escapeHTML(e.text)}</div>
              </div>
            `).join('')}
            ${window.App.growthTagEntries.count > 30 ? `<div style="font-size:12px; color:var(--text-dim); padding:8px;">Showing 30 of ${window.App.growthTagEntries.count} entries</div>` : ''}
          </div>
        ` : ''}
      </div>

      <!-- Knowledge Areas -->
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <div class="strat-section-label" style="margin-bottom:0;">Knowledge Areas</div>
          <select class="growth-sort-select" onchange="App.setGrowthSort(this.value)">
            <option value="files" ${window.App.growthSort === 'files' ? 'selected' : ''}>By File Count</option>
            <option value="recent" ${window.App.growthSort === 'recent' ? 'selected' : ''}>By Last Updated</option>
            <option value="name" ${window.App.growthSort === 'name' ? 'selected' : ''}>By Name</option>
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
          if (window.App.growthSort === 'recent') areas.sort((a, b) => (b.lastUpdated || '').localeCompare(a.lastUpdated || ''));
          else if (window.App.growthSort === 'name') areas.sort((a, b) => a.name.localeCompare(b.name));
          else areas.sort((a, b) => (b.fileCount || 0) - (a.fileCount || 0));
          const maxFiles = Math.max(...areas.map(x => x.fileCount || 0), 1);
          if (!areas.length) return '<div style="font-size:12px;color:var(--text-dim);padding:8px 0;">No areas defined yet — add one below to start tracking.</div>';
          const editingArea = window.App._editingKbArea;
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
  }
