// ═══════════════════════════════════════════════════
//  Nexus — Search View
// ═══════════════════════════════════════════════════
import { timeAgo, escapeHTML } from '../utils.js';
import { Store } from '../store.js';

export function search() {
    const q = (window.App.searchQuery || '').toLowerCase();
    const data = Store.get();
    let results = [];

    if (q.length >= 2) {
      // Search captures
      for (const c of data.captures) {
        if (c.text.toLowerCase().includes(q)) {
          results.push({ type: 'Capture', text: c.text, date: c.ts || c.created, nav: 'capture' });
        }
      }
      // Search tasks
      for (const t of data.tasks) {
        if (t.text.toLowerCase().includes(q)) {
          results.push({ type: 'Task', text: t.text, date: t.ts || t.created, done: t.done, nav: 'tasks' });
        }
      }
      // Search journal
      for (const j of data.journal) {
        if (j.text.toLowerCase().includes(q)) {
          results.push({ type: 'Journal', text: j.text, date: j.ts || j.created, nav: 'journal' });
        }
      }
      // Search goals
      for (const g of data.goals) {
        if (g.text.toLowerCase().includes(q)) {
          results.push({ type: 'Goal', text: g.text, date: g.created, nav: 'goals' });
        }
      }
      // Search project checklist items
      for (const cl of (data.checklists || [])) {
        for (const sec of (cl.sections || [])) {
          for (const item of (sec.items || [])) {
            if (item.text.toLowerCase().includes(q)) {
              results.push({ type: 'Project', text: item.text, sub: `${cl.name} → ${sec.name}`, done: item.done, projId: cl.id, nav: 'strategy' });
            }
          }
        }
      }
      // Search habit names
      for (const h of (data.habits?.definitions || [])) {
        if (h.name.toLowerCase().includes(q)) {
          results.push({ type: 'Habit', text: h.name, nav: 'today' });
        }
      }
      // Sort by date (newest first), undated items last
      results.sort((a, b) => (b.date || 0) - (a.date || 0));
    }

    const typeColors = { Capture: 'var(--accent)', Task: 'var(--green)', Journal: 'var(--amber)', Goal: '#a78bfa', Project: '#60a5fa', Habit: '#f472b6' };

    return `
      <h1 class="view-title">Search</h1>
      <p class="view-subtitle">Find anything across captures, tasks, journal, goals, projects, habits</p>

      <div class="today-quick-add" style="margin-bottom:20px;">
        <input type="text" id="search-input" placeholder="Type to search... (min 2 chars)"
          value="${escapeHTML(window.App.searchQuery || '')}"
          oninput="clearTimeout(App._searchDebounce); App._searchDebounce=setTimeout(()=>{App.searchQuery=this.value; App.render();},150);"
          onkeydown="if(event.key==='Escape'){clearTimeout(App._searchDebounce); this.value=''; App.searchQuery=''; App.render();}">
      </div>

      ${q.length >= 2 ? `
        <div style="font-size:12px; color:var(--text-dim); margin-bottom:12px;">${results.length > 50 ? `Showing 50 of ${results.length}` : results.length} result${results.length !== 1 ? 's' : ''} for "${escapeHTML(q)}"</div>
        ${results.length ? `
          <div class="item-list">
            ${results.slice(0, 50).map(r => {
              const nav = r.projId ? `App.openStrategyProject('${r.projId}')` : `App.navigateTo('${r.nav}')`;
              return `
              <div class="item" style="border-left:3px solid ${typeColors[r.type] || '#888'}; padding-left:12px; cursor:pointer;" onclick="${nav}">
                <div class="item-body">
                  <div class="item-title">${escapeHTML(r.text)}</div>
                  <div class="item-meta">
                    <span class="search-type-badge" style="background:${typeColors[r.type] || '#888'}20; color:${typeColors[r.type] || '#888'};">${r.type}</span>
                    ${r.sub ? `<span style="font-size:10px; color:var(--text-dim);">${escapeHTML(r.sub)}</span>` : ''}
                    ${r.date ? timeAgo(r.date) : ''}
                    ${r.done ? '<span style="color:var(--green); font-size:10px;">done</span>' : ''}
                  </div>
                </div>
              </div>`;
            }).join('')}
          </div>
        ` : '<div class="empty-state"><div class="empty-text">No results found.</div></div>'}
      ` : '<div class="empty-state"><div class="empty-text">Start typing to search...</div></div>'}
    `;
  }
