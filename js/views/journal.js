// ═══════════════════════════════════════════════════
//  Nexus — Journal View
// ═══════════════════════════════════════════════════
import { formatDate, escapeHTML } from '../utils.js';
import { Store } from '../store.js';

export function journal() {
    const data = Store.get();
    const entries = [...data.journal].reverse();
    const vaultDays = window.App.vaultDailyEntries || [];

    return `
      <h1 class="view-title">Journal
        <button class="btn btn-ghost btn-sm" onclick="App.exportJournal()" style="font-size:11px; vertical-align:middle; margin-left:8px;">⬇ Export .md</button>
        ${data.aiEnabled ? `<button class="btn btn-ghost btn-sm" onclick="App.generateJournalInsights()" style="font-size:11px; vertical-align:middle; margin-left:4px; color:var(--accent);">${window.App._aiInsightLoading ? '⏳ Thinking…' : '✨ AI Insights'}</button>` : ''}
      </h1>
      <p class="view-subtitle">Reflect, learn, grow — one entry at a time</p>
      ${window.App._aiInsightResult ? `
      <div id="ai-insight-result" style="margin-bottom:16px; padding:14px 16px; background:linear-gradient(135deg, color-mix(in srgb, var(--accent) 10%, transparent), var(--bg-card)); border:1px solid color-mix(in srgb, var(--accent) 40%, transparent); border-radius:10px;">
        <div style="font-size:11px; font-weight:700; color:var(--accent); margin-bottom:8px; text-transform:uppercase; letter-spacing:0.5px;">✨ AI Reflection</div>
        <div style="font-size:13px; color:var(--text); line-height:1.6; white-space:pre-wrap;">${escapeHTML(window.App._aiInsightResult)}</div>
        <button onclick="App._aiInsightResult=null; App.render();" style="margin-top:8px; background:none; border:none; cursor:pointer; font-size:11px; color:var(--text-dim);">✕ Dismiss</button>
      </div>` : ''}

      <div style="margin-bottom:24px;">
        <textarea id="journal-input" placeholder="What happened today? What did you learn? (Enter to save, Ctrl+Enter for new line)" rows="4"
          onkeydown="if(event.key==='Enter'){if(event.ctrlKey||event.shiftKey){return;}App.addJournal(); event.preventDefault();}"></textarea>
        <div style="margin-top:10px; display:flex; justify-content:space-between; align-items:center;">
          ${window.App.vaultAvailable ? `
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
              ${window.App._editingJournal === e.id ? `
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
  }
