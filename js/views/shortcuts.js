// ═══════════════════════════════════════════════════
//  Nexus — Shortcuts & Guide View
// ═══════════════════════════════════════════════════
import { escapeHTML } from '../utils.js';
import { Store } from '../store.js';

export function shortcuts() {
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
          ${window.App.vaultAvailable ? `<span style="color:var(--green);">&#10003; Connected</span> — ${escapeHTML((window.App.serverConfig || {}).vaultPath || '')}`
            : 'Not connected. Connect your Obsidian vault to enable journaling sync, task sync, and weekly reviews.'}
        </div>
        <div style="display:flex; gap:8px; margin-bottom:8px;">
          <input type="text" id="settings-vault-path" class="strat-settings-input" placeholder="Vault folder path (e.g. D:/Obsidian/My Vault)" style="flex:1;" value="${escapeHTML((window.App.serverConfig || {}).vaultPath || '')}">
          <button class="btn btn-primary btn-sm" onclick="App.updateVaultPath()">Save</button>
        </div>
        <div style="font-size:12px; color:var(--text-dim); margin-bottom:4px;">Daily journal / rapid log filename:</div>
        <div style="display:flex; gap:8px;">
          <input type="text" id="settings-rapid-log" class="strat-settings-input" placeholder="e.g. Daily Notes.md or 02 Rapid logging.md" style="flex:1;" value="${escapeHTML((window.App.serverConfig || {}).rapidLogFile || '02 Rapid logging.md')}">
          <button class="btn btn-primary btn-sm" onclick="App.saveRapidLogFile()">Save</button>
        </div>
        <div style="font-size:11px; color:var(--text-dim); margin-top:4px;">The markdown file in your vault used for daily journaling. Each user may have a different filename.</div>
      </div>
    `;
  }
