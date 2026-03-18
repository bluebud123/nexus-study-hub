// ═══════════════════════════════════════════════════
//  Nexus — Settings View
// ═══════════════════════════════════════════════════
import { escapeHTML, COLOUR_PALETTE } from '../utils.js';
import { Store } from '../store.js';

export function settings() {
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

    const App = window.App;

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

          <div>
            <div style="font-size:13px; font-weight:600; margin-bottom:4px;">Accent Color</div>
            <div style="font-size:11px; color:var(--text-dim); margin-bottom:8px;">Primary highlight color throughout the app</div>
            <div style="display:flex; flex-wrap:wrap; gap:5px; align-items:center;">
              ${COLOUR_PALETTE.map(c => `<div class="colour-swatch${c === accentColor ? ' selected' : ''}" style="background:${c};" title="${c}" onclick="App.setAccentColor('${c}')"></div>`).join('')}
              <label title="Custom colour" style="cursor:pointer; position:relative;">
                <div class="colour-swatch" style="background:${COLOUR_PALETTE.includes(accentColor) ? 'var(--border)' : accentColor}; display:inline-flex; align-items:center; justify-content:center; font-size:13px; color:var(--text-dim);">${COLOUR_PALETTE.includes(accentColor) ? '+' : '✓'}</div>
                <input type="color" value="${accentColor}" style="position:absolute; opacity:0; width:0; height:0;" onchange="App.setAccentColor(this.value)">
              </label>
            </div>
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

      <!-- AI Settings -->
      <div class="card">
        <div class="strat-section-label">AI Insights</div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div>
            <div style="font-size:13px; font-weight:600;">Enable AI features</div>
            <div style="font-size:11px; color:var(--text-dim);">Journal insights, smart suggestions. Uses your own API key — no data sent to Nexus servers.</div>
          </div>
          <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:12px; color:var(--text-dim);">
            <span>${data.aiEnabled ? 'On' : 'Off'}</span>
            <div class="settings-toggle ${data.aiEnabled ? 'on' : ''}" id="ai-enabled-toggle" onclick="this.classList.toggle('on'); document.getElementById('ai-enabled').checked=this.classList.contains('on');"><div class="settings-toggle-knob"></div></div>
            <input type="checkbox" id="ai-enabled" ${data.aiEnabled ? 'checked' : ''} style="display:none;">
          </label>
        </div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          <div style="display:flex; gap:8px; align-items:center;">
            <select id="ai-provider" class="strat-settings-input" style="width:140px;">
              <option value="anthropic" ${(data.aiProvider||'anthropic')==='anthropic'?'selected':''}>Claude (Anthropic)</option>
              <option value="openai" ${data.aiProvider==='openai'?'selected':''}>ChatGPT (OpenAI)</option>
              <option value="gemini" ${data.aiProvider==='gemini'?'selected':''}>Gemini (Google)</option>
            </select>
            <input type="password" id="ai-apikey" class="strat-settings-input" placeholder="Paste API key…" style="flex:1;" value="${data.aiApiKey ? '••••••••' : ''}">
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-primary btn-sm" onclick="App.saveAiSettings()">Save</button>
            ${data.aiApiKey ? `<button class="btn btn-ghost btn-sm" onclick="App.clearAiKey()">Clear key</button>` : ''}
          </div>
          <div style="font-size:11px; color:var(--text-dim);">
            Get a free key: <strong>Anthropic</strong> — console.anthropic.com · <strong>OpenAI</strong> — platform.openai.com · <strong>Gemini</strong> — aistudio.google.com<br>
            Your key is stored locally on this device only. Uses the smallest/cheapest model per provider.
          </div>
        </div>
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
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:6px;">
          <button class="btn btn-primary btn-sm" id="export-btn">&#11015; Export App Data (JSON)</button>
          <button class="btn btn-ghost btn-sm" onclick="App.exportNexusProject()" ${!App.vaultAvailable ? 'disabled title="Connect vault first"' : ''}>
            &#11015; Export nexus_project/ <span style="font-size:10px; color:var(--amber);">&#9888; may be large</span>
          </button>
          <button class="btn btn-ghost btn-sm" onclick="App.exportFullVault()" ${!App.vaultAvailable ? 'disabled title="Connect vault first"' : ''} style="border-color:var(--amber)40;">
            &#11015; Export Full Vault <span style="font-size:10px; color:var(--red);">&#9888; can be GBs</span>
          </button>
        </div>
        <div style="font-size:11px; color:var(--text-dim); margin-bottom:10px;">
          <strong>App Data</strong> = tasks, journal, captures, checklists, settings (small JSON).<br>
          <strong>nexus_project/</strong> = your project checklists as Markdown (small).<br>
          <strong>Full Vault</strong> = your entire linked Obsidian vault folder as a zip. This can be very large — only use if you want a local backup and have enough disk space.
        </div>
        <div style="font-size:12px; font-weight:600; color:var(--text); margin-bottom:6px;">Export as CSV</div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
          <button class="btn btn-ghost btn-sm" onclick="App.exportTasksCSV()">&#11015; Tasks CSV</button>
          <button class="btn btn-ghost btn-sm" onclick="App.exportJournalCSV()">&#11015; Journal CSV</button>
          <button class="btn btn-ghost btn-sm" onclick="App.exportCapturesCSV()">&#11015; Captures CSV</button>
        </div>
        <div style="font-size:11px; color:var(--text-dim); margin-bottom:14px;">Export individual data types as spreadsheet-compatible CSV files.</div>
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
