// ═══════════════════════════════════════════════════
//  Nexus — Tasks View
// ═══════════════════════════════════════════════════
import { formatDate, todayKey, escapeHTML } from '../utils.js';
import { Store } from '../store.js';

export function tasks() {
    const data = Store.get();
    const filter = window.App.taskFilter || 'active';
    let tasks = [...data.tasks].reverse();

    if (filter === 'done') tasks = tasks.filter(t => t.done);
    else {
      // Default (active): undone first (with #active tagged at top), then done at bottom
      tasks = tasks.filter(t => !t.done);
    }

    // Apply text search
    const taskSearch = (window.App._taskSearch || '').toLowerCase().trim();
    if (taskSearch) tasks = tasks.filter(t =>
      t.text.toLowerCase().includes(taskSearch) ||
      (t.category || '').toLowerCase().includes(taskSearch)
    );
    // Apply category filter
    const taskCatFilter = window.App._taskCatFilter || '';
    if (taskCatFilter) tasks = tasks.filter(t => t.category === taskCatFilter);

    // Vault tasks
    const vt = window.App.vaultTasks;
    const vtab = window.App.vaultTaskTab || 'active';
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
    const vaultActive = window.App.vaultTasks ? window.App.vaultTasks.summary.activeCount : 0;
    const totalOpen = taskSrc === 'nexus' ? nexusOpen : taskSrc === 'vault' ? vaultActive : nexusOpen + vaultActive;
    return `
      <h1 class="view-title">Tasks ${totalOpen > 0 ? `<span style="font-size:14px; font-weight:600; color:var(--accent); background:var(--accent)18; border-radius:12px; padding:2px 10px; vertical-align:middle;">${totalOpen} open</span>` : ''}</h1>
      <p class="view-subtitle">Track what needs to get done</p>

      <div style="display:flex; gap:8px; margin-bottom:12px; align-items:center;">
        <input type="text" id="task-search-input" placeholder="Search tasks…"
          value="${window.App._taskSearch || ''}"
          oninput="App._taskSearch=this.value; App.render();"
          style="flex:1; padding:8px 12px; background:var(--surface); border:1px solid var(--border); border-radius:8px; color:var(--text); font-size:13px;">
        ${window.App._taskSearch ? `<button class="btn btn-ghost btn-sm" onclick="App._taskSearch=''; App.render();">✕</button>` : ''}
      </div>

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
      ${(() => { const allCats = [...new Set(data.tasks.map(t => t.category).filter(Boolean))]; return allCats.length ? `
      <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px;">
        <span class="tag-badge ${!taskCatFilter ? 'tag-active' : ''}" onclick="App._taskCatFilter=''; App.render();">All</span>
        ${allCats.map(cat => `<span class="tag-badge ${taskCatFilter===cat ? 'tag-active' : ''}" onclick="App._taskCatFilter='${escapeHTML(cat)}'; App.render();">${escapeHTML(cat)}</span>`).join('')}
      </div>` : ''; })()}

      ${tasks.length ? `
        <div class="item-list">
          ${tasks.map(t => {
            const overdue = t.due && !t.done && t.due < todayKey();
            const subs = t.subtasks || [];
            const subsDone = subs.filter(s => s.done).length;
            const expanded = window.App._expandedTasks && window.App._expandedTasks[t.id];
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
  }
