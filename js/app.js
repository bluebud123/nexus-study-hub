// ═══════════════════════════════════════════════════
//  Nexus — App Controller
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
import { Views } from './views.js';

export const App = {
  currentView: 'dashboard',
  taskFilter: 'all',
  strategyMonth: curMonthKey(),
  strategyTab: 'roadmap',
  strategyProject: null,
  _projAddOpen: false,
  _editingItem: null,
  _editingSection: null,
  _editingProject: null,

  // Vault state
  vaultMode: 'browse',
  vaultPath: '',
  vaultFile: null,
  vaultFileContent: '',
  vaultFileList: [],
  vaultSearchQuery: '',
  vaultSearchResults: [],
  vaultIsSearching: false,

  // Cached data
  vaultStats: null,
  vaultSuggestions: null,
  growthData: null,
  vaultTasks: null,
  vaultDailyEntries: [],
  vaultAvailable: false,
  vaultTaskTab: 'active',
  growthTagFilter: '',
  growthTagEntries: null,
  growthSort: 'recent',
  _editingKbArea: null,
  weeklyReview: null,
  showShortcutHelp: false,

  // ─── Interactive Tutorial State ────────────────
  _tutorialActive: false,
  _tutorialStep: 0,
  _tutorialSteps: [
    { id: 'welcome', target: null, title: 'Welcome to Nexus', body: 'This quick tour will walk you through the key features of your personal evolution hub. Use the arrows or buttons to navigate — you can skip at any time.', position: 'center' },
    { id: 'sidebar', target: '#nav-links', title: 'Sidebar Navigation', body: 'This is your command center. Each item opens a different view. You can show/hide items from Settings.', position: 'right' },
    { id: 'dashboard', target: '[data-view="dashboard"]', title: 'Dashboard', body: 'Your home base — see today\'s stats, open tasks, recent captures, and project progress at a glance.', position: 'right', view: 'dashboard' },
    { id: 'today', target: '[data-view="today"]', title: 'Today View', body: 'Your daily cockpit: streaming tasks, habits, journal, and a focus timer all in one place.', position: 'right', view: 'today' },
    { id: 'capture', target: '[data-view="capture"]', title: 'Capture', body: 'Quickly jot down ideas, notes, or links. Tag them with #hashtags for easy filtering later.', position: 'right', view: 'capture' },
    { id: 'tasks', target: '[data-view="tasks"]', title: 'Tasks', body: 'Manage your to-dos with priorities, due dates, categories, and recurring schedules.', position: 'right', view: 'tasks' },
    { id: 'strategy', target: '[data-view="strategy"]', title: 'Strategy', body: 'Plan long-term with projects, milestones, Gantt charts, and weekly schedules.', position: 'right', view: 'strategy' },
    { id: 'vault', target: '[data-view="vault"]', title: 'Vault', body: 'Browse and search your linked Obsidian vault. Read, edit, and sync markdown files directly.', position: 'right' },
    { id: 'theme', target: '#theme-toggle', title: 'Theme Toggle', body: 'Switch between dark and light mode instantly. Your preference is saved automatically.', position: 'top' },
    { id: 'fab', target: '.fab-btn', title: 'Quick Capture', body: 'This floating button lets you capture a thought from any view without leaving your current page.', position: 'left', view: 'dashboard' },
    { id: 'shortcuts', target: null, title: 'Keyboard Shortcuts', body: 'Power users: Ctrl+Shift+D for Dashboard, Y for Today, C for Capture, T for Tasks, J for Journal, V for Vault, F for Focus Mode, and ? for the full shortcut list.', position: 'center' },
    { id: 'settings', target: '[data-view="settings"]', title: 'Settings', body: 'Customize everything: theme, accent color, font size, vault connection, data export/import, and more.', position: 'right', view: 'settings' },
    { id: 'done', target: null, title: 'You\'re All Set!', body: 'You can replay this tutorial any time from Settings. Enjoy using Nexus!', position: 'center' },
  ],

  async init() {
    // Prevent multiple tabs
    const channel = new BroadcastChannel('nexus-tab');
    channel.postMessage('ping');
    channel.onmessage = (e) => {
      if (e.data === 'ping') channel.postMessage('pong');
      if (e.data === 'pong') {
        document.getElementById('content').innerHTML = `
          <div style="text-align:center; padding:80px 20px;">
            <div style="font-size:48px; margin-bottom:16px;">&#9888;</div>
            <h2>Nexus is already open</h2>
            <p style="color:var(--text-dim); margin-top:8px;">Close the other tab first, or use it instead.</p>
            <button class="btn btn-primary" style="margin-top:20px;" onclick="window.location.reload()">Try again</button>
          </div>`;
        document.getElementById('sidebar').style.display = 'none';
        throw new Error('duplicate');
      }
    };
    // Small delay to detect existing tabs
    await new Promise(r => setTimeout(r, 200));
    if (document.getElementById('sidebar').style.display === 'none' && !document.querySelector('.setup-wizard')) return;

    // Check if setup is needed
    try {
      const cfgRes = await fetch('/api/config');
      const cfg = await cfgRes.json();
      if (!cfg.setupComplete) {
        this.showSetupWizard();
        return;
      }
      this.serverConfig = cfg;
    } catch {}

    // Load data from server before anything else
    await Store.init();
    // Request notification permission for timer
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    // SW registration removed — inline script in index.html handles cache-busting
    updateStreak(Store);
    // Apply saved theme + appearance preferences
    const savedData = Store.get();
    const savedTheme = savedData.theme || 'dark';
    if (savedTheme === 'light') document.body.classList.add('light');
    this._updateThemeToggle(savedTheme);
    if (savedData.accentColor) document.documentElement.style.setProperty('--accent', savedData.accentColor);
    const fontMap = { small: '13px', medium: '15px', large: '17px' };
    const zoomMap = { small: '0.875', medium: '1', large: '1.125' };
    if (savedData.fontSize) {
      document.documentElement.style.setProperty('--base-font-size', fontMap[savedData.fontSize] || '15px');
      document.documentElement.style.setProperty('--app-zoom', zoomMap[savedData.fontSize] || '1');
    }
    if (savedData.defaultView) this.currentView = savedData.defaultView;
    this._checkRecurringTasks();
    this.bindNav();
    this.bindExport();
    this._applyNavVisibility();
    this.render();
    // Offer tutorial to first-time users
    if (!savedData._tutorialSeen) {
      setTimeout(() => this._offerTutorial(), 600);
      Store.update(d => { d._tutorialSeen = true; });
    }
    // Pre-fetch vault data in background (only if vault is configured)
    if (this.serverConfig && this.serverConfig.useVault && this.serverConfig.vaultPath) {
      try {
        const [stats, suggestions, growth, vaultTasks] = await Promise.all([
          VaultAPI.getStats().catch(() => null),
          VaultAPI.getSuggestions().catch(() => null),
          VaultAPI.getGrowth().catch(() => null),
          VaultAPI.getTasks().catch(() => null),
        ]);
        this.vaultStats = stats;
        this.vaultSuggestions = suggestions;
        this.growthData = growth;
        this.vaultTasks = vaultTasks;
        this.vaultAvailable = !!stats && !stats.vaultDisabled;
        // Re-render to show vault data
        this.render();
        // Auto weekly export check
        this.checkAutoWeeklyExport();
      } catch { this.vaultAvailable = false; }
    } else {
      this.vaultAvailable = false;
      // Hide vault nav item
      const vaultNav = document.querySelector('[data-view="vault"]');
      if (vaultNav) vaultNav.style.display = 'none';
    }
  },

  checkAutoWeeklyExport() {
    const data = Store.get();
    if (!data.autoWeeklyExport || !this.vaultAvailable) return;
    // Get current ISO week string
    const now = new Date();
    const jan1 = new Date(now.getFullYear(), 0, 1);
    const weekNum = Math.ceil(((now - jan1) / 864e5 + jan1.getDay() + 1) / 7);
    const currentWeek = `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
    // Only export if we haven't already exported this week
    if (data.lastWeeklyExport === currentWeek) return;
    // Only export if it's a new week (not the very first time)
    // Export the previous week's review
    console.log(`[Nexus] Auto-exporting weekly review for ${currentWeek}`);
    const customTags = Store.get().weeklyReviewTags || ['lesson', 'people', 'food'];
    fetch('/api/vault/weekly-review/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customTags })
    })
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          Store.update(d => d.lastWeeklyExport = currentWeek);
          console.log(`[Nexus] Weekly review exported to ${res.file}`);
        }
      })
      .catch(() => {});
  },

  toggleAutoWeeklyExport() {
    const data = Store.get();
    Store.update(d => d.autoWeeklyExport = !d.autoWeeklyExport);
    this.render();
  },

  // ─── Setup Wizard ──────────────────────────────
  _setupStep: 1,
  _setupUseVault: false,
  _setupVaultPath: '',
  _setupRapidLog: '02 Rapid logging.md',
  _setupTaskSource: 'both',
  _setupBrowsePath: '',
  _setupFolders: [],
  _setupProjects: [],   // [{name,deadline,color,icon}]
  _setupUseTemplate: false,
  _setupTemplateDismissed: false,

  showSetupWizard() {
    document.getElementById('sidebar').style.display = 'none';
    this._renderSetup();
  },

  rerunSetup() {
    // Reset wizard state but preserve all user data
    this._setupStep = 1;
    this._setupUseVault = false;
    this._setupVaultPath = '';
    this._setupRapidLog = '02 Rapid logging.md';
    this._setupTaskSource = 'both';
    this._setupBrowsePath = '';
    this._setupFolders = [];
    this._setupProjects = [];
    this._setupUseTemplate = false;
    this._setupTemplateDismissed = false;
    this.showSetupWizard();
  },

  _applyMastersTemplate() {
    this._setupUseTemplate = true;
    this._setupTemplateDismissed = true;
    const hasIt = this._setupProjects.find(p => p._template === 'masters');
    if (!hasIt) {
      const d = new Date(); d.setMonth(d.getMonth() + 12);
      const deadline = localDateKey(d).slice(0, 7);
      this._setupProjects.unshift({ id: 'template-masters', name: "Master's Exam", icon: '\uD83C\uDF93', color: '#7c6ff7', deadline, _template: 'masters' });
    }
    this._renderSetup();
  },

  _renderSetup() {
    const step = this._setupStep;
    const TOTAL = 5;
    const content = document.getElementById('content');
    content.style.marginLeft = '0';
    content.style.maxWidth = '520px';
    content.style.margin = '40px auto';
    content.style.padding = '0 20px';

    const progressBar = `
      <div style="display:flex; gap:6px; justify-content:center; margin-bottom:28px;">
        ${Array.from({length:TOTAL},(_,i)=>`<div style="width:32px;height:4px;border-radius:2px;background:${i<step?'var(--accent)':'var(--border)'}"></div>`).join('')}
      </div>`;

    if (step === 1) {
      content.innerHTML = `
        ${progressBar}
        <div style="text-align:center; margin-bottom:24px;">
          <div style="font-size:52px;">◈</div>
          <h1 style="margin:8px 0 4px;">Welcome to Nexus</h1>
          <p class="view-subtitle">Your personal evolution hub. Let's set you up in 5 steps.</p>
        </div>
        <div class="card" style="padding:20px;">
          <label style="font-size:13px; font-weight:600; display:block; margin-bottom:6px;">What should we call you?</label>
          <input type="text" id="setup-name" class="strat-settings-input" placeholder="e.g. Alex" style="width:100%; margin-bottom:10px;" value="${escapeHTML(Store.get().userName || '')}">
          <p style="font-size:12px; color:var(--text-dim); margin-bottom:16px;">Nexus will greet you personally on your dashboard — with a different motivational message every day. You can always change this in Settings.</p>
          <div style="text-align:right; display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:11px; color:var(--text-dim); font-style:italic;">Optional — skip if you prefer.</span>
            <button class="btn btn-primary" onclick="
              const n=document.getElementById('setup-name').value.trim();
              if(n) Store.update(d=>{d.userName=n;});
              App._setupStep=2; App._renderSetup();">Next →</button>
          </div>
        </div>`;

    } else if (step === 2) {
      const projects = this._setupProjects;
      const deadlineDefault = (() => { const d = new Date(); d.setMonth(d.getMonth() + 12); return localDateKey(d).slice(0,7); })();
      content.innerHTML = `
        ${progressBar}
        <div style="text-align:center; margin-bottom:20px;">
          <div style="font-size:40px;">🎯</div>
          <h1 style="margin:8px 0 4px;">Your Projects</h1>
          <p class="view-subtitle">Add the study goals or projects you are working towards.</p>
        </div>

        ${!this._setupTemplateDismissed ? `
        <div class="card" style="padding:18px; margin-bottom:12px; border:1px solid var(--accent); background:linear-gradient(135deg, var(--bg-card) 0%, rgba(124,111,247,0.08) 100%);">
          <div style="display:flex; align-items:flex-start; gap:12px;">
            <div style="font-size:32px; line-height:1;">🎓</div>
            <div style="flex:1;">
              <div style="font-size:14px; font-weight:700; margin-bottom:4px;">Try an example template?</div>
              <div style="font-size:12px; color:var(--text-dim); margin-bottom:10px;">We have prepared a <strong style="color:var(--text);">Master's Exam</strong> project template to show you how Nexus works. Great if you are studying for a major exam or degree.</div>
              <div style="font-size:11px; color:var(--text-dim); margin-bottom:12px; padding:8px 10px; background:var(--bg-input); border-radius:6px; line-height:1.8;">
                10 sections · ~250 topics, ready to check off:<br>
                <span style="color:var(--text);">Basic Science · Trauma · Foot &amp; Ankle · Arthroplasty · OORU · Paeds · Spine · Sport · Hand · VIVA Operative</span>
              </div>
              <div style="display:flex; gap:8px;">
                <button class="btn btn-primary btn-sm" onclick="App._applyMastersTemplate()">✓ Yes, use this template</button>
                <button class="btn btn-ghost btn-sm" onclick="App._setupTemplateDismissed=true; App._renderSetup();">No thanks, I'll build my own</button>
              </div>
            </div>
          </div>
        </div>
        ` : this._setupUseTemplate && projects.find(p=>p._template==='masters') ? `
        <div style="display:flex; align-items:center; gap:8px; padding:10px 14px; background:rgba(124,111,247,0.1); border:1px solid rgba(124,111,247,0.3); border-radius:8px; margin-bottom:12px; font-size:12px; color:var(--accent);">
          <span>🎓</span> <span>Master's Exam template added — you can customise it any time in Strategy.</span>
        </div>
        ` : ''}

        <div class="card" style="padding:20px; margin-bottom:12px;">
          ${projects.length === 0 ? `<p style="font-size:13px; color:var(--text-dim); margin-bottom:12px;">No projects yet. Add your first one below.</p>` : `
            <div style="margin-bottom:12px;">
              ${projects.map((p,i)=>`
                <div style="display:flex; align-items:center; gap:8px; padding:8px; background:var(--bg-input); border-radius:8px; margin-bottom:6px;">
                  <span style="width:20px; height:20px; border-radius:50%; background:${escapeHTML(p.color||'#7c6ff7')}; display:inline-block;"></span>
                  <span>${escapeHTML(p.icon)}</span>
                  <span style="flex:1; font-size:13px;">${escapeHTML(p.name)}</span>
                  <span style="font-size:11px; color:var(--text-dim);">${p.deadline ? 'Due '+p.deadline : ''}</span>
                  <button class="btn btn-ghost btn-sm" style="color:var(--red); padding:2px 6px;" onclick="
                    App._setupProjects.splice(${i},1);
                    if(App._setupProjects.every(p=>!p._template)) App._setupUseTemplate=false;
                    App._renderSetup();">✕</button>
                </div>`).join('')}
            </div>`}
          <details ${projects.length===0?'open':''}>
            <summary style="font-size:13px; color:var(--accent); cursor:pointer; margin-bottom:10px;">${projects.length===0?'+ Add a project':'+ Add another project'}</summary>
            <div style="margin-top:10px;">
              <div style="display:flex; gap:8px; margin-bottom:8px;">
                <input type="text" id="sp-icon" class="strat-settings-input" placeholder="🎯" style="width:52px; text-align:center;" value="🎯">
                <input type="text" id="sp-name" class="strat-settings-input" placeholder="Project name" style="flex:1;">
              </div>
              <div style="display:flex; gap:8px; margin-bottom:10px;">
                <input type="month" id="sp-deadline" class="strat-settings-input" style="flex:1;">
                <input type="color" id="sp-color" value="#7c6ff7" style="width:40px; height:36px; border:none; background:none; cursor:pointer;">
              </div>
              <button class="btn btn-primary btn-sm" onclick="
                const icon=document.getElementById('sp-icon').value.trim()||'🎯';
                const name=document.getElementById('sp-name').value.trim();
                const deadline=document.getElementById('sp-deadline').value;
                const color=document.getElementById('sp-color').value;
                if(!name){toast('Project name required');return;}
                App._setupProjects.push({id:uid(),name,deadline,color,icon});
                App._renderSetup();">Add</button>
            </div>
          </details>
        </div>
        <div style="display:flex; gap:8px; justify-content:space-between;">
          <button class="btn btn-ghost" onclick="App._setupStep=1; App._renderSetup();">← Back</button>
          <button class="btn btn-primary" onclick="App._setupStep=3; App._renderSetup();">${projects.length===0?'Skip →':'Next →'}</button>
        </div>`;

    } else if (step === 3) {
      content.innerHTML = `
        ${progressBar}
        <div style="text-align:center; margin-bottom:24px;">
          <div style="font-size:40px;">📓</div>
          <h1 style="margin:8px 0 4px;">Obsidian Vault</h1>
          <p class="view-subtitle">Nexus can sync with Obsidian for journaling, tasks, and reviews.</p>
        </div>
        <div class="card" style="padding:20px;">
          <p style="font-size:13px; color:var(--text-dim); margin-bottom:16px;">Do you use Obsidian and want to connect your vault?</p>
          <div style="display:flex; gap:12px; margin-bottom:12px;">
            <button class="btn btn-primary" style="flex:1;" onclick="App._setupUseVault=true; App._setupTaskSource='both'; App._setupStep=4; App._browseFolders(''); App._renderSetup();">Yes, connect vault</button>
            <button class="btn btn-ghost" style="flex:1;" onclick="App._setupUseVault=false; App._setupTaskSource='nexus'; App._setupStep=5; App._renderSetup();">No vault — use Nexus only</button>
          </div>
          <p style="font-size:11px; color:var(--text-dim);">You can connect it later in Strategy → Settings.</p>
        </div>
        <div style="text-align:left; margin-top:12px;">
          <button class="btn btn-ghost" onclick="App._setupStep=2; App._renderSetup();">← Back</button>
        </div>`;

    } else if (step === 4) {
      content.innerHTML = `
        ${progressBar}
        <div style="text-align:center; margin-bottom:20px;">
          <h1 style="margin:8px 0 4px;">Select Vault Folder</h1>
          <p class="view-subtitle">Navigate to your Obsidian vault folder.</p>
        </div>
        <div class="card" style="padding:20px;">
          <div style="font-size:12px; color:var(--text-dim); margin-bottom:8px;">Current: <strong>${escapeHTML(this._setupBrowsePath || '/')}</strong></div>
          <div style="max-height:200px; overflow-y:auto; border:1px solid var(--border); border-radius:8px; margin-bottom:12px;">
            <div style="padding:8px 12px; cursor:pointer; border-bottom:1px solid var(--border); color:var(--accent);" onclick="App._browseFolders(App._setupBrowseParent || '/')">← Parent folder</div>
            ${this._setupFolders.map(f => `
              <div style="padding:8px 12px; cursor:pointer; border-bottom:1px solid var(--border);" onmouseover="this.style.background='var(--bg-card)'" onmouseout="this.style.background=''" onclick="App._browseFolders('${f.path.replace(/'/g, "\\'")}')">📁 ${escapeHTML(f.name)}</div>
            `).join('')}
            ${this._setupFolders.length === 0 ? '<div style="padding:12px; font-size:12px; color:var(--text-dim);">No subfolders here</div>' : ''}
          </div>
          <input type="text" id="setup-vault-path" class="strat-settings-input" placeholder="Or type path manually" value="${escapeHTML(this._setupVaultPath || this._setupBrowsePath || '')}" style="width:100%; margin-bottom:12px;">
          <label style="font-size:12px; color:var(--text-dim); display:block; margin-bottom:4px;">Daily journal / rapid log filename:</label>
          <input type="text" id="setup-rapid-log" class="strat-settings-input" placeholder="e.g. Daily Notes.md" value="${escapeHTML(this._setupRapidLog)}" style="width:100%; margin-bottom:4px;">
          <div style="font-size:11px; color:var(--text-dim); margin-bottom:12px;">The .md file Nexus reads for your daily journal entries.</div>
          <div style="display:flex; gap:8px; justify-content:space-between;">
            <button class="btn btn-ghost" onclick="App._setupStep=3; App._renderSetup();">← Back</button>
            <button class="btn btn-primary" onclick="
              App._setupVaultPath=document.getElementById('setup-vault-path').value;
              App._setupRapidLog=document.getElementById('setup-rapid-log').value||'02 Rapid logging.md';
              App._setupStep=5; App._renderSetup();">Select this folder →</button>
          </div>
        </div>`;

    } else if (step === 5) {
      const taskLabels = { both:'Both (Nexus + Vault tasks)', nexus:'Nexus tasks only', vault:'Vault tasks only' };
      content.innerHTML = `
        ${progressBar}
        <div style="text-align:center; margin-bottom:24px;">
          <div style="font-size:52px; color:var(--green);">✓</div>
          <h1 style="margin:8px 0 4px;">All Set!</h1>
          <p class="view-subtitle">Review your setup before launching.</p>
        </div>
        <div class="card" style="padding:20px; margin-bottom:12px;">
          <table style="width:100%; border-collapse:collapse; font-size:13px;">
            <tr style="border-bottom:1px solid var(--border);">
              <td style="padding:8px 0; color:var(--text-dim); width:130px;">Projects</td>
              <td style="padding:8px 0;">${this._setupProjects.length > 0 ? this._setupProjects.map(p=>`${p.icon} ${escapeHTML(p.name)}`).join(', ') : '<span style="color:var(--text-dim);">None added</span>'}</td>
            </tr>
            <tr style="border-bottom:1px solid var(--border);">
              <td style="padding:8px 0; color:var(--text-dim);">Obsidian vault</td>
              <td style="padding:8px 0;">${this._setupUseVault ? `<span style="color:var(--green);">✓</span> ${escapeHTML(this._setupVaultPath)||'(path not set)'}` : '<span style="color:var(--text-dim);">Not connected</span>'}</td>
            </tr>
            ${this._setupUseVault ? `<tr style="border-bottom:1px solid var(--border);">
              <td style="padding:8px 0; color:var(--text-dim);">Journal file</td>
              <td style="padding:8px 0;">${escapeHTML(this._setupRapidLog)}</td>
            </tr>` : ''}
            <tr>
              <td style="padding:8px 0; color:var(--text-dim);">Task source</td>
              <td style="padding:8px 0;">
                <select class="strat-settings-input" id="setup-tasksrc" style="font-size:12px;">
                  <option value="both" ${this._setupTaskSource==='both'?'selected':''}>Both (Nexus + Vault)</option>
                  <option value="nexus" ${this._setupTaskSource==='nexus'?'selected':''}>Nexus only</option>
                  <option value="vault" ${this._setupTaskSource==='vault'?'selected':''}>Vault only</option>
                </select>
              </td>
            </tr>
          </table>
        </div>
        <div style="display:flex; gap:8px; justify-content:space-between;">
          <button class="btn btn-ghost" onclick="App._setupStep=${this._setupUseVault ? 4 : 3}; App._renderSetup();">← Back</button>
          <button class="btn btn-primary" onclick="App._setupTaskSource=document.getElementById('setup-tasksrc').value; App._completeSetup();">🚀 Launch Nexus</button>
        </div>`;
    }
  },

  async _browseFolders(dirPath) {
    try {
      const res = await fetch('/api/browse-folders?path=' + encodeURIComponent(dirPath));
      const data = await res.json();
      this._setupBrowsePath = data.current;
      this._setupBrowseParent = data.parent;
      this._setupFolders = data.folders || [];
      this._setupVaultPath = data.current;
      if (this._setupStep === 3) this._renderSetup();
    } catch {}
  },

  async _completeSetup() {
    // Save vault config to server
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vaultPath: this._setupUseVault ? this._setupVaultPath : '',
        useVault: this._setupUseVault,
        rapidLogFile: this._setupRapidLog
      })
    });
    // Save projects + taskSource to Store
    await Store.init();
    Store.update(d => {
      d.taskSource = this._setupTaskSource;
      if (this._setupProjects.length > 0) {
        if (!d.strategy.projects) d.strategy.projects = [];
        for (const p of this._setupProjects) {
          if (!d.strategy.projects.find(x => x.name === p.name)) {
            const proj = Object.assign({}, p);
            delete proj._template;
            d.strategy.projects.push(proj);
          }
        }
      }
      // Add Master's Exam template checklist
      if (this._setupUseTemplate) {
        const mkItem = text => ({ id: uid(), text, done: false, revisions: [] });
        const templateCL = {
          id: uid(),
          name: "Master's Exam",
          icon: '🎓',
          color: '#7c6ff7',
          description: "Master's degree orthopaedic surgery exam preparation",
          captureTag: '#masters_exam',
          deadline: this._setupProjects.find(p=>p._template==='masters')?.deadline || '',
          sections: [
            { name: 'Basic Science', items: [
              mkItem('Bone graft'), mkItem('Fat embolism'), mkItem('OM'), mkItem('Osteoporosis'),
              mkItem('A/B (emp vs prophy)'), mkItem('Preop prophy against infection'), mkItem('Theatre design'),
              mkItem('DVT'), mkItem('SSG vs FTSG'), mkItem('PE'), mkItem('Sutures'), mkItem('Tourniquet'),
              mkItem('Fracture healing'), mkItem('Traction'), mkItem('Diathermy'), mkItem('Local anaesthesia'),
              mkItem('Bone growth factors'), mkItem('Bone formation (intramembranous+endochondral)'),
              mkItem('Drain'), mkItem('Bone cement + cementing tech'), mkItem('POP'),
              mkItem('Nerve injury (Seddon/Sunderland, nerve healing, repair principles)'),
              mkItem('Wound healing (phases, factors affecting healing)'),
              mkItem('Biomechanics (stress/strain, viscoelasticity, implant failure modes)'),
              mkItem('Blood transfusion / cell salvage'), mkItem('Nutrition and surgical outcomes'),
            ]},
            { name: 'Trauma', items: [
              mkItem('Open fracture'), mkItem('DCO-SIRS/CARS/ERB/FLOW'), mkItem('NOF'),
              mkItem('Non-union + malunion'), mkItem('Compartment syndrome \u2013 leg, forearm, hand and foot'),
              mkItem('ILN'), mkItem('Plating'), mkItem('DHS'), mkItem('Lag screw'),
              mkItem('Cortical vs cancellous screw'), mkItem('Distal radius fracture'),
              mkItem('Tibial plateau fracture'), mkItem('Pilon fracture'),
              mkItem('Diaphyseal femur fracture / subtrochanteric fracture'),
              mkItem('Pelvis and acetabular fracture'), mkItem('Polytrauma management / damage control resuscitation'),
              mkItem('Pathological fracture management'), mkItem('Nerve and vascular injury with fracture'),
              mkItem('Periprosthetic fracture'), mkItem('Floating knee'),
            ]},
            { name: 'Foot and Ankle', items: [
              mkItem('Talus fracture'), mkItem('Calcaneal fracture'), mkItem('Lisfranc'),
              mkItem('Malleolar fracture'), mkItem('5th metatarsal fracture'), mkItem('Charcot foot'),
              mkItem('Hallux valgus'), mkItem('High and low ankle sprain'), mkItem('Peroneal tendon subluxation'),
              mkItem('Posterior tibial tendon dysfunction'), mkItem('TA rupture'), mkItem('Tarsal tunnel'),
              mkItem('Plantar fasciitis'), mkItem('Tibiotalar impingement'), mkItem('DFU'), mkItem('Ankle OA'),
              mkItem('Toe deformities (hammer / claw / mallet toe)'), mkItem("Morton's neuroma"),
              mkItem('Metatarsalgia'), mkItem('Subtalar OA'), mkItem('Ankle ligament reconstruction (Brostrom)'),
            ]},
            { name: 'Arthroplasty', items: [
              mkItem('DVT'), mkItem('Infection'), mkItem('RA knee'), mkItem('AVN hip'),
              mkItem('Polyethylene + cementing'), mkItem('TKR'), mkItem('THR'), mkItem('HTO'), mkItem('UKA'),
              mkItem('Obesity in arthroplasty'), mkItem('Revision TKR'), mkItem('Revision THR'),
              mkItem('Bearing surfaces (ceramic, metal, XLPE)'), mkItem('Dislocation after THR'),
              mkItem('Leg length discrepancy'), mkItem('Instability after TKR'), mkItem('Stiffness after TKR'),
              mkItem('Painful TKR / THR workup'), mkItem('Patella resurfacing'),
              mkItem('Cementless vs cemented fixation principles'), mkItem('Templating'),
            ]},
            { name: 'OORU', items: [
              mkItem('Biopsy'), mkItem('Metastasis - Bone, Spine'), mkItem('Cell cycle + chemotherapy and radiotherapy'),
              mkItem('Bone tumour'), mkItem('Soft tissue tumour'), mkItem('Osteosarcoma'),
              mkItem("Ewing's sarcoma"), mkItem('Chondrosarcoma'), mkItem('Giant cell tumour (GCT)'),
              mkItem('Osteochondroma / enchondroma'), mkItem('Limb salvage principles'),
              mkItem('Surgical margins (Enneking staging)'),
            ]},
            { name: 'Paeds', items: [
              mkItem('DDH'), mkItem('SCFE'), mkItem('Perthes'), mkItem("Blount's disease"), mkItem('CP'),
              mkItem('Trauma - femur'), mkItem('NAI'), mkItem('Pes cavus'), mkItem('OI'),
              mkItem('Supracondylar fracture'), mkItem('Lateral condyle fracture'), mkItem('Rickets'),
              mkItem('SED'), mkItem('MED'), mkItem('Achondroplasia'), mkItem('Sacral agenesis'),
              mkItem('In-toeing gait'), mkItem('Spina bifida'), mkItem('CTEV'), mkItem('Flexible flat foot'),
              mkItem('Vertical talus'), mkItem('Tarsal coalition'), mkItem('Arthrogryposis'),
              mkItem('Congenital pseudarthrosis of the tibia'), mkItem('Neurofibromatosis'),
              mkItem('Hip septic arthritis vs transient synovitis'), mkItem("Nursemaid's elbow"),
              mkItem('Medial epicondyle fracture'), mkItem('Radial head / neck fracture in children'),
              mkItem('Monteggia / Galeazzi in children'), mkItem('Leg length discrepancy (paeds)'),
              mkItem('Limb lengthening principles (Ilizarov)'), mkItem('Obstetric brachial plexus palsy'),
              mkItem('Congenital coxa vara'),
            ]},
            { name: 'Spine', items: [
              mkItem('Disc herniation'), mkItem('Degenerative spine'), mkItem('Sagittal balance'),
              mkItem('Spinal cord injury'), mkItem('Spinal stenosis'), mkItem('Approach to scoliosis'),
              mkItem('TB / Pyogenic spine'), mkItem('Thoracolumbar fracture'), mkItem('Spine mets'),
              mkItem('Cervical fracture'), mkItem('Cervical myelopathy'), mkItem('Cauda equina'),
              mkItem("Scheuermann's kyphosis"), mkItem('DISH'), mkItem('Discogenic back pain'), mkItem('AS'),
              mkItem('Degenerative spondylolisthesis'), mkItem('Adult isthmic spondylolisthesis'),
              mkItem('Cervical facet dislocation'), mkItem('Atlanto-axial instability (C1/C2)'),
              mkItem('Odontoid fracture'), mkItem("Hangman's fracture"), mkItem('Cervical radiculopathy'),
              mkItem('Lumbar spondylolysis'), mkItem('Failed back surgery syndrome'),
              mkItem('Spinal tumours (intradural vs extradural)'), mkItem('Ossification of PLL (OPLL)'),
            ]},
            { name: 'Sport', items: [
              mkItem('ACL'), mkItem('PCL'), mkItem('PLC'), mkItem('Patellofemoral instability'),
              mkItem('Chondral injury mx'), mkItem('Meniscus injury'), mkItem('Subacromial impingement'),
              mkItem('Frozen shoulder'), mkItem('Rotator cuff tear'), mkItem('Rotator cuff arthropathy'),
              mkItem('Shoulder instability (AMBRI)'), mkItem('SLAP'), mkItem('TUBS'),
              mkItem('Posterior instability'), mkItem('ACJ'), mkItem('Multiligament knee injury'),
              mkItem('Knee dislocation'), mkItem('MCL injury'), mkItem('FAI / Hip labral tear'),
              mkItem('Hamstring injuries'), mkItem('Patellar tendinopathy / quadriceps tendon rupture'),
              mkItem('Distal biceps tendon rupture'), mkItem('Medial elbow instability (UCL / Tommy John)'),
              mkItem('Elbow OCD / lateral elbow pain in athletes'),
            ]},
            { name: 'Hand', items: [
              mkItem('Finger tip'), mkItem('Hand infection'), mkItem('Flexor tendon + rehab'),
              mkItem('Brachial plexus'), mkItem('Scaphoid fracture'),
              mkItem('Radial / median / ulnar nerve entrapment'), mkItem('Flexor tendon injuries and repair'),
              mkItem('Extensor tendon injuries and repair'), mkItem('Pulley system'), mkItem('Trigger finger'),
              mkItem("De Quervain's tenosynovitis"), mkItem('Finger reimplantation'),
              mkItem('Congenital hand'), mkItem('Congenital arm'), mkItem('TFCC'),
              mkItem('Metacarpal fracture'), mkItem('SNAC'), mkItem('VISI'), mkItem('DISI'), mkItem('SLAC'),
              mkItem('Perilunate dislocation'), mkItem('Tendon transfer principle'),
              mkItem("Dupuytren's contracture"), mkItem('Ganglion'),
              mkItem('CMC OA (thumb basal joint arthritis)'), mkItem('Rheumatoid hand'),
              mkItem('DRUJ instability'), mkItem('High vs low nerve injury \u2013 functional consequences'),
              mkItem('Wrist instability (unifying framework)'),
              mkItem('Reconstructive ladder / flap classification for hand'),
            ]},
            { name: 'VIVA Operative', items: [
              mkItem('Lumbar Discectomy'), mkItem('Laminectomy'), mkItem('Pedicle screw insertion'),
              mkItem('Anterior approach cervical + ACDF'), mkItem('Hip approaches'), mkItem('Radius approach'),
              mkItem('Humerus approach'), mkItem('Elbow approaches'), mkItem('Deltopectoral'),
              mkItem('Knee scope'), mkItem('TKR'), mkItem('Safe zone ext fix'), mkItem('Iliac crest bone graft'),
              mkItem('Wound debridement open fracture + traumatic wound'), mkItem('Ray amputation'),
              mkItem('BKA/AKA'), mkItem('Fasciotomies'), mkItem('CTR'), mkItem('TFR'), mkItem('Halo vest'),
              mkItem('Skull tongs'), mkItem('Bipolar hemi'), mkItem('Wrist block'), mkItem('Ankle block'),
              mkItem('Digital block'), mkItem('Hand incisions'), mkItem('THR operative steps'),
              mkItem('ORIF distal radius'), mkItem('ORIF tibial plateau'), mkItem('Ankle ORIF'),
              mkItem('Retrograde femoral nail'), mkItem('Tension band wiring'),
              mkItem('Ilizarov / circular frame application'), mkItem('ACL reconstruction'),
              mkItem('Hallux valgus correction (scarf / chevron)'), mkItem('Nerve repair / graft'),
              mkItem('Knee approaches (medial parapatellar etc.)'),
            ]},
          ]
        };
        if (!d.checklists) d.checklists = [];
        if (!d.checklists.find(c => c.name === templateCL.name)) {
          d.checklists.push(templateCL);
        }
      }
    });
    // Reload to start fresh with full app
    window.location.reload();
  },

  navigateTo(view, pushHistory, stateExtra) {
    this.currentView = view;
    document.querySelectorAll('#nav-links li').forEach(l => l.classList.toggle('active', l.dataset.view === view));
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebar-overlay')?.classList.remove('show');
    if (pushHistory !== false) {
      const state = { view, ...(stateExtra || {}) };
      history.pushState(state, '', '#' + view);
    }
    if (view === 'vault' && this.vaultMode === 'browse') {
      this.render();
      this.vaultNavigate(this.vaultPath);
    } else if (view === 'growth' && !this.growthData) {
      this.render();
      VaultAPI.getGrowth().then(data => { this.growthData = data; this.render(); }).catch(() => {});
    } else if (view === 'journal' || view === 'today' || view === 'calendar') {
      this.render();
      this.loadVaultDailyEntries();
    } else {
      this.render();
    }
  },

  bindNav() {
    document.querySelectorAll('#nav-links li').forEach(li => {
      li.addEventListener('click', () => this.navigateTo(li.dataset.view));
    });
    // Handle browser back/forward
    window.addEventListener('popstate', (e) => {
      const state = e.state || {};
      const view = state.view || (location.hash ? location.hash.slice(1) : 'dashboard');
      // Restore strategy sub-state
      if (view === 'strategy') {
        this.strategyTab = state.strategyTab || 'roadmap';
        this.strategyProject = state.strategyProject || null;
      }
      if (Views[view]) {
        this.navigateTo(view, false);
      } else {
        this.navigateTo('dashboard', false);
      }
    });
    // Set initial history state
    history.replaceState({ view: this.currentView }, '', '#' + this.currentView);
  },

  bindExport() {
    // Use event delegation — export-btn is in Settings, not always in DOM
    document.body.addEventListener('click', (e) => {
      if (e.target.closest('#export-btn')) Store.exportJSON();
    });
    document.getElementById('import-file').addEventListener('change', (e) => {
      if (e.target.files[0]) Store.importJSON(e.target.files[0]);
    });
    document.getElementById('checklist-upload-file')?.addEventListener('change', e => {
      App.handleChecklistFile(e.target.files[0]);
      e.target.value = '';
    });
  },

  render() {
    // Focus mode: render focus view directly
    if (this.focusMode) {
      let html = Views.focus();
      document.getElementById('content').innerHTML = html;
      return;
    }
    const view = Views[this.currentView];
    if (view) {
      let html = view();

      // FAB (floating quick-add) — shown on all views except capture
      if (this.currentView !== 'capture') {
        html += `
          <div class="fab-container ${this.fabExpanded ? 'fab-open' : ''}">
            ${this.fabExpanded ? `
              <div class="fab-input-row">
                <input type="text" id="fab-input" class="fab-text-input" placeholder="Quick capture..."
                  onkeydown="if(event.key==='Enter'){App.fabAdd();event.preventDefault();} if(event.key==='Escape'){App.fabExpanded=false;App.render();}">
                <button class="btn btn-primary btn-sm" onclick="App.fabAdd()">Add</button>
              </div>
            ` : ''}
            <button class="fab-btn" onclick="App.toggleFab()" title="Quick capture">
              ${this.fabExpanded ? '&times;' : '+'}
            </button>
          </div>
        `;
      }

      if (this.showShortcutHelp) {
        html += `
          <div class="shortcut-help-overlay" onclick="App.showShortcutHelp=false; App.render();">
            <div class="shortcut-help-card" onclick="event.stopPropagation()">
              <h3>Keyboard Shortcuts</h3>
              <div class="shortcut-row"><span>Dashboard</span><span class="shortcut-key">D</span></div>
              <div class="shortcut-row"><span>Today</span><span class="shortcut-key">Y</span></div>
              <div class="shortcut-row"><span>Capture</span><span class="shortcut-key">C</span></div>
              <div class="shortcut-row"><span>Tasks</span><span class="shortcut-key">T</span></div>
              <div class="shortcut-row"><span>Journal</span><span class="shortcut-key">J</span></div>
              <div class="shortcut-row"><span>Goals</span><span class="shortcut-key">G</span></div>
              <div class="shortcut-row"><span>Vault Search</span><span class="shortcut-key">/</span></div>
              <div class="shortcut-row"><span>Vault</span><span class="shortcut-key">V</span></div>
              <div class="shortcut-row"><span>Focus Mode</span><span class="shortcut-key">F</span></div>
              <div class="shortcut-row"><span>This Help</span><span class="shortcut-key">?</span></div>
              <div style="text-align:center; margin-top:16px;">
                <button class="btn btn-ghost btn-sm" onclick="App.showShortcutHelp=false; App.render();">Close</button>
              </div>
            </div>
          </div>`;
      }
      document.getElementById('content').innerHTML = html;

      // Stop Early reason modal
      if (this._showStopReasonModal) {
        const modal = document.createElement('div');
        modal.className = 'stop-reason-overlay';
        modal.innerHTML = `
          <div class="stop-reason-modal">
            <h3 style="margin-bottom:16px; font-size:16px;">Why did you stop early?</h3>
            <div class="stop-reason-options">
              <button class="btn btn-ghost" onclick="App.confirmEarlyStop('Got distracted')">Got distracted</button>
              <button class="btn btn-ghost" onclick="App.confirmEarlyStop('Emergency')">Emergency</button>
              <button class="btn btn-ghost" onclick="App.confirmEarlyStop('Finished early')">Finished early</button>
            </div>
            <input type="text" id="stop-reason-custom" class="strat-settings-input" placeholder="Custom reason..." style="margin-top:8px;"
              onkeydown="if(event.key==='Enter')App.confirmEarlyStop(this.value)">
            <div style="display:flex;gap:8px;margin-top:12px;">
              <button class="btn btn-primary btn-sm" onclick="const v=document.getElementById('stop-reason-custom').value; App.confirmEarlyStop(v||'No reason given')">Submit</button>
              <button class="btn btn-ghost btn-sm" onclick="App._showStopReasonModal=false; App.resumeTimer();">Cancel</button>
            </div>
          </div>`;
        document.getElementById('content').appendChild(modal);
      }

      // Tag line results overlay
      if (this._tagLineResults) {
        const overlay = document.createElement('div');
        overlay.className = 'tag-line-overlay';
        const entries = this._tagLineResults.entries || [];
        overlay.innerHTML = `
          <div class="tag-line-panel">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
              <span style="font-size:14px; font-weight:600; color:var(--accent);">#${escapeHTML(this._tagLineQuery || '')} &mdash; ${this._tagLineResults.count || 0} entries</span>
              <button class="btn btn-ghost btn-sm" onclick="App._tagLineResults=null; App._tagLineQuery=''; App.render();">Close</button>
            </div>
            ${entries.slice(0, 50).map(e => `
              <div class="lesson-item" style="padding:6px 0; border-bottom:1px solid var(--border);">
                <div style="font-size:11px; color:var(--text-dim);">${escapeHTML(e.date || '')}${e.source ? ' &middot; ' + escapeHTML(e.source) : ''}</div>
                <div style="font-size:13px;">${escapeHTML(e.text || '')}</div>
              </div>
            `).join('')}
            ${entries.length > 50 ? '<div style="font-size:12px; color:var(--text-dim); padding:8px;">Showing 50 of ' + entries.length + ' entries</div>' : ''}
          </div>`;
        document.getElementById('content').appendChild(overlay);
      }

      // Auto-focus FAB input when expanded
      if (this.fabExpanded) {
        setTimeout(() => document.getElementById('fab-input')?.focus(), 50);
      }
      // Re-position tutorial spotlight after render
      if (this._tutorialActive) {
        requestAnimationFrame(() => this._positionTutorialTooltip());
      }
    }
  },

  // ─── Capture Actions ──────────────────────────
  _editingCapture: null,

  saveEditCapture(id) {
    const el = document.getElementById('edit-capture-' + id);
    if (!el) return;
    const text = el.value.trim();
    if (!text) { toast('Cannot be empty'); return; }
    Store.update(d => {
      const c = d.captures.find(c => c.id === id);
      if (c) c.text = text;
    });
    this._editingCapture = null;
    toast('Capture updated');
    this.render();
  },

  deleteCapture(id) {
    if (!confirm('Delete this capture?')) return;
    Store.update(d => d.captures = d.captures.filter(c => c.id !== id));
    toast('Capture deleted');
    this.render();
  },

  togglePinCapture(id) {
    let pinned = false;
    Store.update(d => {
      const c = d.captures.find(c => c.id === id);
      if (c) { c.pinned = !c.pinned; pinned = c.pinned; }
    });
    toast(pinned ? 'Pinned' : 'Unpinned');
    this.render();
  },

  captureToTask(id) {
    const data = Store.get();
    const capture = data.captures.find(c => c.id === id);
    if (!capture) return;
    Store.update(d => {
      d.tasks.push({ id: uid(), text: capture.text.replace(/#\w+/g, '').trim(), done: false, created: Date.now(), source: 'capture' });
    });
    toast('Added to tasks');
    this.render();
  },

  // ─── Task Actions ─────────────────────────────
  addTask() {
    const input = document.getElementById('task-input');
    const catInput = document.getElementById('task-category');
    const dueInput = document.getElementById('task-due');
    const recurInput = document.getElementById('task-recurring');
    const text = input.value.trim();
    if (!text) return;
    const category = catInput.value.trim();
    const due = dueInput?.value || '';
    const recurring = recurInput?.value || '';
    Store.update(d => d.tasks.push({ id: uid(), text, category, due, recurring, done: false, created: Date.now() }));
    if (this.vaultAvailable) {
      VaultAPI.addCapture(`- [ ] ${text}${category ? ' #' + category : ''}`).catch(() => {});
    }
    toast('Task added');
    this.render();
  },

  toggleTask(id) {
    let taskText = '';
    let justDone = false;
    Store.update(d => {
      const task = d.tasks.find(t => t.id === id);
      if (task) {
        task.done = !task.done;
        taskText = task.text;
        justDone = task.done;
        if (task.done && task.recurring) task.lastCompleted = todayKey();
      }
    });
    if (justDone && this.vaultAvailable) {
      VaultAPI.addCapture(`Completed task: ${taskText}`).catch(() => {});
    }
    this.render();
  },

  deleteTask(id) {
    if (!confirm('Delete this task?')) return;
    Store.update(d => d.tasks = d.tasks.filter(t => t.id !== id));
    toast('Task deleted');
    this.render();
  },

  // ─── Subtasks ──────────────────────────────────
  _expandedTasks: {},

  toggleExpandTask(id) {
    this._expandedTasks[id] = !this._expandedTasks[id];
    this.render();
  },

  addSubtask(taskId) {
    const input = document.getElementById('subtask-' + taskId);
    const text = input?.value.trim();
    if (!text) return;
    Store.update(d => {
      const t = d.tasks.find(x => x.id === taskId);
      if (t) {
        if (!t.subtasks) t.subtasks = [];
        t.subtasks.push({ text, done: false });
      }
    });
    this.render();
  },

  toggleSubtask(taskId, idx) {
    Store.update(d => {
      const t = d.tasks.find(x => x.id === taskId);
      if (t && t.subtasks && t.subtasks[idx]) t.subtasks[idx].done = !t.subtasks[idx].done;
    });
    this.render();
  },

  deleteSubtask(taskId, idx) {
    Store.update(d => {
      const t = d.tasks.find(x => x.id === taskId);
      if (t && t.subtasks) t.subtasks.splice(idx, 1);
    });
    this.render();
  },

  // ─── Recurring Tasks ──────────────────────────
  _checkRecurringTasks() {
    const data = Store.get();
    const today = todayKey();
    let changed = false;
    for (const t of data.tasks) {
      if (!t.recurring || !t.done) continue;
      // Check if task was completed before today (needs reset)
      const doneDate = t.lastCompleted || '';
      if (doneDate < today) {
        t.done = false;
        changed = true;
      }
    }
    if (changed) Store.update(d => {
      for (const t of d.tasks) {
        if (t.recurring && t.done) {
          const doneDate = t.lastCompleted || '';
          if (doneDate < today) t.done = false;
        }
      }
    });
  },

  setTaskFilter(f) {
    this.taskFilter = f;
    this.render();
  },

  clearDoneTasks() {
    if (!confirm('Delete all completed tasks? This cannot be undone.')) return;
    if (!confirm('Are you sure? All done tasks will be permanently deleted.')) return;
    Store.update(d => d.tasks = d.tasks.filter(t => !t.done));
    this.taskFilter = 'all';
    toast('Cleared completed tasks');
    this.render();
  },

  setVaultTaskTab(tab) {
    this.vaultTaskTab = tab;
    this.render();
  },

  async toggleVaultTask(source, line) {
    try {
      const result = await VaultAPI.toggleTask(source, line);
      if (result.error) {
        toast('Vault error: ' + result.error);
        return;
      }
      // Refresh vault tasks
      this.vaultTasks = await VaultAPI.getTasks();
      this.render();
      toast('Task toggled');
    } catch (err) {
      toast('Could not toggle vault task — check vault connection');
    }
  },

  // ─── Journal Actions ──────────────────────────
  async loadVaultDailyEntries() {
    if (!this.vaultAvailable) return;
    try {
      // Load enough days to cover the calendar view (45 = current month + previous month buffer)
      const today = new Date();
      const entries = [];
      for (let i = 0; i < 45; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = localDateKey(d);
        const data = await VaultAPI.getDaily(dateStr);
        if (data.found && data.lines.length > 0) {
          entries.push({ date: data.date, lines: data.lines });
        }
      }
      this.vaultDailyEntries = entries;
      if (['journal', 'today', 'calendar'].includes(this.currentView)) this.render();
    } catch {}
  },

  addJournal() {
    const input = document.getElementById('journal-input');
    const text = input.value.trim();
    if (!text) return;
    updateStreak(Store);
    Store.update(d => d.journal.push({ id: uid(), text, date: todayKey(), created: Date.now() }));
    this._patchGrowthTags(text);
    // Bridge to vault if toggle is on
    const toggle = document.getElementById('journal-vault-toggle');
    if (toggle && toggle.checked) {
      VaultAPI.addDaily(text).then(() => this.loadVaultDailyEntries()).catch(() => {});
    }
    toast('Journal entry saved');
    this.render();
  },

  _editingJournal: null,

  saveEditJournal(id) {
    const el = document.getElementById('edit-journal-' + id);
    if (!el) return;
    const text = el.value.trim();
    if (!text) { toast('Cannot be empty'); return; }
    Store.update(d => {
      const j = d.journal.find(j => j.id === id);
      if (j) j.text = text;
    });
    this._editingJournal = null;
    toast('Journal updated');
    this.render();
  },

  deleteJournal(id) {
    if (!confirm('Delete this journal entry?')) return;
    Store.update(d => d.journal = d.journal.filter(j => j.id !== id));
    toast('Entry deleted');
    this.render();
  },

  // ─── Goal Actions ─────────────────────────────
  addGoal() {
    const input = document.getElementById('goal-input');
    const targetInput = document.getElementById('goal-target');
    const freqInput = document.getElementById('goal-frequency');
    const text = input.value.trim();
    const target = parseInt(targetInput.value) || 10;
    const frequency = freqInput ? freqInput.value : 'once';
    if (!text) return;
    Store.update(d => d.goals.push({ id: uid(), text, target, current: 0, frequency, achieved: false, created: Date.now() }));
    toast('Goal added');
    this.render();
  },

  incrementGoal(id, amount) {
    let justAchieved = false;
    Store.update(d => {
      const goal = d.goals.find(g => g.id === id);
      if (!goal) return;
      const wasAchieved = goal.achieved;
      goal.current = Math.max(0, goal.current + amount);
      if (!wasAchieved && goal.current >= goal.target && goal.target > 0) {
        goal.achieved = true;
        goal.achievedDate = localDateKey();
        justAchieved = true;
      }
    });
    if (justAchieved) toast('🏆 Goal achieved!');
    this.render();
  },

  showGoalPrompt(id, type) {
    this._goalPrompt = { id, type };
    this.render();
    // Focus textarea after render
    setTimeout(() => { const el = document.getElementById('goal-reason-input'); if (el) el.focus(); }, 50);
  },

  archiveGoal(id) {
    const reason = (document.getElementById('goal-reason-input')?.value || '').trim();
    Store.update(d => {
      const g = d.goals.find(g => g.id === id);
      if (!g) return;
      g.achieved = true;
      g.achievedDate = g.achievedDate || localDateKey();
      g.achievedReason = reason;
    });
    this._goalPrompt = null;
    toast('🏆 Achievement archived! You should be proud.');
    this._writeGoalMd();
    this.render();
  },

  giveUpGoal(id) {
    const reason = (document.getElementById('goal-reason-input')?.value || '').trim();
    Store.update(d => {
      const g = d.goals.find(g => g.id === id);
      if (!g) return;
      g.gaveUp = true;
      g.gaveUpDate = localDateKey();
      g.gaveUpReason = reason;
    });
    this._goalPrompt = null;
    toast('Goal set aside. Every detour is part of the journey. 💙');
    this._writeGoalMd();
    this.render();
  },

  deleteGoal(id) {
    if (!confirm('Remove this goal permanently?')) return;
    Store.update(d => d.goals = d.goals.filter(g => g.id !== id));
    toast('Goal removed');
    this._writeGoalMd();
    this.render();
  },

  _writeGoalMd() {
    if (!this.vaultAvailable) return;
    const data = Store.get();
    const active = (data.goals || []).filter(g => !g.achieved && !g.gaveUp);
    const achieved = (data.goals || []).filter(g => g.achieved);
    const gaveUp = (data.goals || []).filter(g => g.gaveUp);
    const lines = ['# Nexus Goals', ''];
    lines.push('## Active Goals', '');
    if (active.length) {
      active.forEach(g => {
        const pct = g.target > 0 ? Math.min(100, Math.round(g.current / g.target * 100)) : 0;
        const freq = g.frequency && g.frequency !== 'once' ? ` *(${g.frequency})*` : '';
        lines.push(`- [ ] **${g.text}**${freq} — ${g.current}/${g.target} (${pct}%)`);
      });
    } else { lines.push('*No active goals.*'); }
    lines.push('');
    if (achieved.length) {
      lines.push('## 🏆 Achieved Goals', '');
      achieved.forEach(g => {
        lines.push(`- [x] **${g.text}** — achieved on ${g.achievedDate || '?'}`);
        if (g.achievedReason) lines.push(`  - *"${g.achievedReason}"*`);
      });
      lines.push('');
    }
    if (gaveUp.length) {
      lines.push('## Given Up Goals', '');
      gaveUp.forEach(g => {
        lines.push(`- ~~${g.text}~~ — set aside on ${g.gaveUpDate || '?'}`);
        if (g.gaveUpReason) lines.push(`  - *"${g.gaveUpReason}"*`);
      });
      lines.push('');
    }
    const content = lines.join('\n');
    fetch('/api/vault/goal-write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    }).catch(() => {});
  },

  // ─── Strategy Actions ──────────────────────────
  setStrategyMonth(m) {
    this.strategyMonth = m;
    this.render();
  },

  calYear(delta) {
    this.calendarYear = (this.calendarYear || new Date().getFullYear()) + delta;
    this.render();
  },

  setStrategyTab(t) {
    this.strategyTab = t;
    if (t === 'projects') {
      this.strategyProject = null; // Show project list first
      history.pushState({ view: 'strategy', strategyTab: 'projects', strategyProject: null }, '', '#strategy');
    } else {
      this.strategyProject = null;
      history.pushState({ view: 'strategy', strategyTab: 'roadmap' }, '', '#strategy');
    }
    this.render();
  },

  showStrategyAddForm() {
    const form = document.getElementById('strat-add-form');
    if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
  },

  liveAllocVal(month, key, val) {
    const el = document.getElementById('alloc-val-' + month + '-' + key);
    if (el) el.textContent = val + '%';
  },

  saveStratAlloc(month, key, val) {
    Store.update(d => {
      if (!d.strategy.allocations) d.strategy.allocations = {};
      if (!d.strategy.allocations[month]) d.strategy.allocations[month] = {};
      d.strategy.allocations[month][key] = +val;
    });
    this.render();
  },

  addStrategyMilestone() {
    const text = document.getElementById('strat-ms-text').value.trim();
    if (!text) return;
    const stream = document.getElementById('strat-ms-stream').value;
    const priority = document.getElementById('strat-ms-priority').value;
    const month = this.strategyMonth;
    Store.update(d => {
      if (!d.strategy.milestones[month]) d.strategy.milestones[month] = [];
      d.strategy.milestones[month].push({ id: uid(), stream, text, priority, done: false });
    });
    this.render();
  },

  toggleStrategyMilestone(month, idx) {
    let milestone = null;
    Store.update(d => {
      const ms = d.strategy.milestones[month];
      if (ms && ms[idx]) {
        ms[idx].done = !ms[idx].done;
        milestone = { ...ms[idx] };
      }
    });
    // Log to nexus_project/Milestones.md when marking done
    if (milestone && milestone.done && App.vaultAvailable) {
      const label = milestone.stream ? `[${milestone.stream}] ` : '';
      fetch('/api/vault/project-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectFile: 'nexus_project/Milestones.md',
          text: `${label}${milestone.text} (${month})`,
          projectName: 'Milestones'
        })
      }).catch(() => {});
    }
    this.render();
  },

  deleteStrategyMilestone(month, idx) {
    Store.update(d => {
      if (d.strategy.milestones[month]) {
        d.strategy.milestones[month].splice(idx, 1);
      }
    });
    this.render();
  },

  saveStrategyNote(month, text) {
    Store.update(d => {
      d.strategy.notes[month] = text;
    });
  },

  saveExamDate() {
    const input = document.getElementById('settings-exam-date');
    if (!input || !input.value) return;
    Store.update(d => {
      d.strategy.examDate = input.value;
    });
    this.render();
  },

  // ─── Checklist Methods ─────────────────────────
  uploadChecklist() {
    document.getElementById('checklist-upload-file')?.click();
  },

  handleChecklistFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const cl = parseChecklistMD(e.target.result, file.name.replace(/\.[^.]+$/, ''));
      const safe = cl.name.replace(/[/\\?%*:|"<>]/g, '-');
      cl.vaultFile = `nexus_project/${safe}.md`;
      Store.update(d => { if (!d.checklists) d.checklists = []; d.checklists.push(cl); });
      toast(`Checklist "${cl.name}" uploaded — ${cl.sections.flatMap(s => s.items).length} items`);
      App.strategyTab = 'projects';
      App.strategyProject = cl.id;
      App._projAddOpen = false;
      if (App.vaultAvailable) {
        fetch('/api/vault/create-project-file', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: cl.name, vaultFile: cl.vaultFile }) }).catch(() => {});
      }
      this.render();
    };
    reader.readAsText(file);
  },

  toggleChecklistItem(clId, secIdx, itemIdx) {
    let logEntry = null;
    Store.update(d => {
      const cl = (d.checklists || []).find(c => c.id === clId);
      if (cl && cl.sections[secIdx] && cl.sections[secIdx].items[itemIdx]) {
        const item = cl.sections[secIdx].items[itemIdx];
        item.done = !item.done;
        if (item.done && App.vaultAvailable) {
          const secName = cl.sections[secIdx].name || '';
          const projectFile = cl.vaultFile || (cl.projectId
            ? (() => { const proj = (d.strategy.projects||[]).find(p=>p.id===cl.projectId); return proj ? proj.name.replace(/[/\\?%*:|"<>]/g,'-')+'.md' : null; })()
            : null);
          if (projectFile) {
            logEntry = {
              projectName: cl.name,
              projectFile,
              text: `✓ ${secName ? '[' + secName + '] ' : ''}${item.text}`
            };
          }
        }
      }
    });
    if (logEntry) {
      fetch('/api/vault/project-log', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logEntry) }).catch(() => {});
    }
    this._autoSyncProject(clId);
    this.render();
  },

  deleteChecklist(clId) {
    const cl = (Store.get().checklists || []).find(c => c.id === clId);
    if (!confirm(`Delete project "${cl?.name || 'this project'}"?`)) return;
    Store.update(d => { d.checklists = (d.checklists || []).filter(c => c.id !== clId); });
    toast('Project deleted');
    if (cl?.vaultFile && this.vaultAvailable) {
      if (confirm(`Also delete ${cl.vaultFile} from vault?`)) {
        fetch('/api/vault/file', { method: 'DELETE', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: cl.vaultFile, force: true }) }).catch(() => {});
      }
    }
    this.render();
  },

  linkChecklist(clId, projectId) {
    Store.update(d => {
      const cl = (d.checklists || []).find(c => c.id === clId);
      if (cl) cl.projectId = projectId || null;
    });
    this.render();
  },

  updateChecklistMeta(clId, field, value) {
    Store.update(d => {
      const cl = (d.checklists || []).find(c => c.id === clId);
      if (cl) cl[field] = value;
    });
    this._autoSyncProject(clId);
    this.render();
  },

  toggleGanttExpand(clId) {
    if (!this._ganttExpanded) this._ganttExpanded = {};
    this._ganttExpanded[clId] = !this._ganttExpanded[clId];
    this.render();
  },

  jumpToProjectSection(projectId, sectionIdx) {
    this.currentView = 'strategy';
    this.strategyTab = 'projects';
    this.strategyProject = projectId;
    this._scrollToSection = sectionIdx;
    history.pushState({ view: 'strategy', strategyTab: 'projects', strategyProject: projectId }, '', '#strategy');
    this.render();
    if (typeof sectionIdx === 'number') {
      setTimeout(() => {
        const details = document.querySelectorAll('#content details');
        if (details[sectionIdx]) {
          details[sectionIdx].open = true;
          details[sectionIdx].scrollIntoView({ behavior: 'smooth', block: 'start' });
          details[sectionIdx].style.outline = '2px solid var(--accent)';
          details[sectionIdx].style.borderRadius = '6px';
          setTimeout(() => { details[sectionIdx].style.outline = ''; }, 2000);
        }
        this._scrollToSection = null;
      }, 100);
    }
  },

  setStrategyProject(id) {
    this.strategyTab = 'projects';
    this.strategyProject = id;
    this._projAddOpen = false;
    history.pushState({ view: 'strategy', strategyTab: 'projects', strategyProject: id }, '', '#strategy');
    this.render();
  },

  openStrategyProject(id) {
    // Navigate from any view → strategy/projects/project with proper history chain
    this.strategyTab = 'projects';
    this.strategyProject = id;
    this.navigateTo('strategy', true, { strategyTab: 'projects', strategyProject: id });
  },

  addBlankProject(name) {
    name = (name || '').trim();
    if (!name) { toast('Enter a project name'); return; }
    const safe = name.replace(/[/\\?%*:|"<>]/g, '-');
    const vaultFile = `nexus_project/${safe}.md`;
    const cl = { id: uid(), name, icon: '📋', projectId: null, uploadedAt: Date.now(), sections: [], vaultFile };
    Store.update(d => { if (!d.checklists) d.checklists = []; d.checklists.push(cl); });
    this.strategyProject = cl.id;
    this._projAddOpen = false;
    toast(`Project "${name}" created`);
    if (this.vaultAvailable) {
      fetch('/api/vault/create-project-file', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, vaultFile }) }).catch(() => {});
    }
    this.render();
  },

  _syncTimers: {},
  _autoSyncProject(clId) {
    if (!this.vaultAvailable) return;
    clearTimeout(this._syncTimers[clId]);
    this._syncTimers[clId] = setTimeout(() => this.syncProjectToVault(clId, true), 1500);
  },

  async syncProjectToVault(clId, silent = false) {
    const data = Store.get();
    const cl = (data.checklists || []).find(c => c.id === clId);
    if (!cl) return;
    const allItems = (cl.sections || []).flatMap(s => s.items || []);
    const done = allItems.filter(it => (it.revisions || []).length > 0 || it.done).length;
    try {
      const r = await fetch('/api/vault/project-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checklist: cl, done, total: allItems.length })
      });
      const result = await r.json();
      if (result.success) {
        Store.update(d => {
          const c = (d.checklists || []).find(c => c.id === clId);
          if (c) c.lastVaultSync = localDateKey();
        });
        if (!silent) toast(`Synced "${cl.name}" → vault`);
        this.render();
      } else { if (!silent) toast('Sync failed: ' + (result.error || 'unknown error')); }
    } catch { if (!silent) toast('Sync failed — is vault connected?'); }
  },

  async exportFullVault() {
    if (!confirm('This will zip your ENTIRE Obsidian vault folder. This can be very large (potentially gigabytes) and may take a while. Make sure you have enough disk space.\n\nContinue?')) return;
    try {
      toast('Zipping vault… this may take a while');
      const r = await fetch('/api/vault/export-full-vault');
      if (!r.ok) { const err = await r.json(); return toast('Export failed: ' + (err.error || 'unknown')); }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `obsidian_vault_${localDateKey()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { toast('Export failed'); }
  },

  async exportNexusProject() {
    if (!confirm('This will zip the nexus_project/ folder from your vault. Files might be large. Continue?')) return;
    try {
      const r = await fetch('/api/vault/export-nexus-project');
      if (!r.ok) { const err = await r.json(); return toast('Export failed: ' + (err.error || 'unknown')); }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nexus_project_${localDateKey()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { toast('Export failed'); }
  },

  _importWizard: null, // null | { step: 1|2a|2b|3, choice: null|'backup'|'vault', preview: null, newVault: '' }

  openImportWizard() {
    this._importWizard = { step: 1, choice: null, preview: null, newVault: '' };
    this.render();
    setTimeout(() => document.getElementById('import-wizard-modal')?.scrollIntoView({ behavior: 'smooth' }), 100);
  },

  _renderImportWizard() {
    const wz = this._importWizard;
    if (!wz) return '';
    const steps = {
      1: `
        <div style="font-size:13px; font-weight:600; margin-bottom:14px;">What would you like to do?</div>
        <div style="display:flex; flex-direction:column; gap:10px;">
          <label style="display:flex; align-items:center; gap:10px; cursor:pointer; padding:10px; background:var(--bg-input); border-radius:8px; border:1px solid ${wz.choice==='backup'?'var(--accent)':'var(--border)'};" onclick="App._importWizard.choice='backup'; App.render();">
            <span style="font-size:18px;">&#128190;</span>
            <div><div style="font-weight:600;">Restore Nexus Backup</div><div style="font-size:11px; color:var(--text-dim);">Import a JSON backup to restore tasks, journal, captures, checklists</div></div>
          </label>
          <label style="display:flex; align-items:center; gap:10px; cursor:pointer; padding:10px; background:var(--bg-input); border-radius:8px; border:1px solid ${wz.choice==='vault'?'var(--accent)':'var(--border)'};" onclick="App._importWizard.choice='vault'; App.render();">
            <span style="font-size:18px;">&#128218;</span>
            <div><div style="font-weight:600;">Connect Obsidian Vault</div><div style="font-size:11px; color:var(--text-dim);">Point Nexus to an existing vault folder for journal sync</div></div>
          </label>
        </div>
        <div style="display:flex; gap:8px; margin-top:14px; justify-content:flex-end;">
          <button class="btn btn-ghost btn-sm" onclick="App._importWizard=null; App.render();">Cancel</button>
          <button class="btn btn-primary btn-sm" onclick="App._wizardNext()" ${!wz.choice?'disabled':''}>Next &#8594;</button>
        </div>`,
      '2a': `
        <div style="font-size:13px; font-weight:600; margin-bottom:10px;">&#128190; Restore Nexus Backup</div>
        ${wz.preview ? `
          <div style="padding:10px; background:var(--bg-input); border-radius:8px; margin-bottom:10px; font-size:12px; color:var(--text-dim);">
            Found: ${wz.preview.tasks} tasks &middot; ${wz.preview.journal} journal entries &middot; ${wz.preview.captures} captures &middot; ${wz.preview.checklists} projects
          </div>
          <div style="color:var(--amber); font-size:11px; margin-bottom:10px;">&#9888; This will replace all current app data.</div>
          <div style="display:flex; gap:8px; justify-content:flex-end;">
            <button class="btn btn-ghost btn-sm" onclick="App._importWizard.preview=null; App.render();">&#8592; Back</button>
            <button class="btn btn-primary btn-sm" onclick="App._wizardConfirmImport()">Confirm &amp; Restore</button>
          </div>` : `
          <div style="display:flex; gap:8px; align-items:center; margin-bottom:10px;">
            <input type="file" id="wizard-import-file" accept=".json" style="flex:1; font-size:12px;" onchange="App._wizardPreviewImport(this.files[0])">
          </div>
          <div style="display:flex; gap:8px; justify-content:flex-end;">
            <button class="btn btn-ghost btn-sm" onclick="App._importWizard.step=1; App.render();">&#8592; Back</button>
          </div>`}`,
      '2b': `
        <div style="font-size:13px; font-weight:600; margin-bottom:10px;">&#128218; Connect Obsidian Vault</div>
        <div style="font-size:11px; color:var(--text-dim); margin-bottom:8px;">Enter the full path to your Obsidian vault folder:</div>
        <input type="text" id="wizard-vault-path" class="strat-settings-input" style="width:100%; margin-bottom:6px;"
          placeholder="${process?.platform === 'win32' ? 'C:\\Users\\...\\Obsidian\\Vault' : '/Users/.../Documents/Obsidian/Vault'}"
          value="${escapeHTML((App.serverConfig||{}).vaultPath||'')}">
        <div style="font-size:11px; color:var(--text-dim); margin-bottom:12px;">Windows: use forward slashes or double backslashes</div>
        <div style="display:flex; gap:8px; justify-content:flex-end;">
          <button class="btn btn-ghost btn-sm" onclick="App._importWizard.step=1; App.render();">&#8592; Back</button>
          <button class="btn btn-primary btn-sm" onclick="App._wizardSaveVault()">Save &amp; Connect</button>
        </div>`,
      3: `
        <div style="text-align:center; padding:10px 0;">
          <div style="font-size:28px; margin-bottom:8px;">&#10003;</div>
          <div style="font-size:14px; font-weight:600; margin-bottom:6px;">All set!</div>
          ${wz.doneMsg ? `<div style="font-size:12px; color:var(--text-dim); margin-bottom:12px;">${wz.doneMsg}</div>` : ''}
          <button class="btn btn-primary btn-sm" onclick="App._importWizard=null; App.render();">Close</button>
        </div>`,
    };
    return `<div id="import-wizard-modal" class="card" style="border:2px solid var(--accent); margin-top:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <div class="strat-section-label" style="margin:0;">&#9874; Import &amp; Setup Wizard</div>
        <span style="font-size:11px; color:var(--text-dim);">Step ${wz.step === 1 ? 1 : 2} of 3</span>
      </div>
      ${steps[wz.step] || ''}
    </div>`;
  },

  _wizardNext() {
    const wz = this._importWizard;
    if (!wz) return;
    wz.step = wz.choice === 'backup' ? '2a' : '2b';
    this.render();
  },

  _wizardPreviewImport(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const d = JSON.parse(e.target.result);
        this._importWizard._pendingData = d;
        this._importWizard.preview = {
          tasks: (d.tasks || []).length,
          journal: (d.journal || []).length,
          captures: (d.captures || []).length,
          checklists: (d.checklists || []).length,
        };
        this.render();
      } catch { toast('Invalid JSON file'); }
    };
    reader.readAsText(file);
  },

  _wizardConfirmImport() {
    const wz = this._importWizard;
    if (!wz?._pendingData) return;
    const data = wz._pendingData;
    Store._data = Store._merge(data);
    Store._saveToServer();
    this._importWizard = { step: 3, doneMsg: `Restored: ${(data.tasks||[]).length} tasks, ${(data.journal||[]).length} journal entries, ${(data.checklists||[]).length} projects.` };
    toast('Data imported successfully');
    this.render();
  },

  async _wizardSaveVault() {
    const input = document.getElementById('wizard-vault-path');
    if (!input?.value.trim()) return toast('Enter a vault path first');
    const vaultPath = input.value.trim();
    try {
      await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vaultPath }) });
      this.serverConfig = { ...(this.serverConfig || {}), vaultPath };
      await this.loadVaultData();
      this._importWizard = { step: 3, doneMsg: `Vault connected: ${vaultPath}` };
      this.render();
    } catch { toast('Failed to save vault path'); }
  },

  createProjectVaultFile(clId) {
    const cl = (Store.get().checklists || []).find(c => c.id === clId);
    if (!cl) return;
    const safe = cl.name.replace(/[/\\?%*:|"<>]/g, '-');
    const vaultFile = `nexus_project/${safe}.md`;
    fetch('/api/vault/create-project-file', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: cl.name, vaultFile }) })
      .then(r => r.json())
      .then(() => {
        Store.update(d => { const c = (d.checklists||[]).find(x=>x.id===clId); if(c) c.vaultFile = vaultFile; });
        toast(`Vault file created: ${vaultFile}`);
        this.render();
      }).catch(() => toast('Failed to create vault file'));
  },

  deleteChecklistSection(clId, secIdx) {
    if (!confirm('Delete this section and all its items?')) return;
    Store.update(d => {
      const cl = (d.checklists||[]).find(c => c.id === clId);
      if (cl) cl.sections.splice(secIdx, 1);
    });
    this._autoSyncProject(clId);
    this.render();
  },

  addChecklistSection(clId, name) {
    name = (name || '').trim();
    if (!name) return;
    Store.update(d => {
      const cl = (d.checklists||[]).find(c => c.id === clId);
      if (cl) cl.sections.push({ name, items: [] });
    });
    this._autoSyncProject(clId);
    this.render();
  },

  addChecklistItem(clId, secIdx, text) {
    text = (text || '').trim();
    if (!text) return;
    Store.update(d => {
      const cl = (d.checklists||[]).find(c => c.id === clId);
      if (cl && cl.sections[secIdx]) {
        cl.sections[secIdx].items.push({ id: uid(), text, tag: null, status: 'not-started', revisions: [] });
      }
    });
    this._autoSyncProject(clId);
    this.render();
  },

  deleteChecklistItem(clId, secIdx, itemIdx) {
    Store.update(d => {
      const cl = (d.checklists||[]).find(c => c.id === clId);
      if (cl && cl.sections[secIdx]) cl.sections[secIdx].items.splice(itemIdx, 1);
    });
    this._autoSyncProject(clId);
    this.render();
  },

  addRevision(clId, secIdx, itemIdx) {
    Store.update(d => {
      const cl = (d.checklists||[]).find(c => c.id === clId);
      if (cl && cl.sections[secIdx] && cl.sections[secIdx].items[itemIdx]) {
        const item = cl.sections[secIdx].items[itemIdx];
        if (!item.revisions) item.revisions = [];
        item.revisions.push({ date: todayKey() });
        // Migrate old done flag
        delete item.done;
      }
    });
    this._autoSyncProject(clId);
    this.render();
  },

  removeRevision(clId, secIdx, itemIdx, revIdx) {
    Store.update(d => {
      const cl = (d.checklists||[]).find(c => c.id === clId);
      if (cl && cl.sections[secIdx] && cl.sections[secIdx].items[itemIdx]) {
        const item = cl.sections[secIdx].items[itemIdx];
        if (item.revisions) item.revisions.splice(revIdx, 1);
      }
    });
    this.render();
  },

  cycleItemStatus(clId, secIdx, itemIdx) {
    const statusNext = { 'not-started': 'weak', weak: 'moderate', moderate: 'strong', strong: 'not-started' };
    Store.update(d => {
      const cl = (d.checklists||[]).find(c => c.id === clId);
      if (cl && cl.sections[secIdx] && cl.sections[secIdx].items[itemIdx]) {
        const item = cl.sections[secIdx].items[itemIdx];
        const cur = item.status || 'not-started';
        item.status = statusNext[cur] || 'weak';
      }
    });
    this.render();
  },

  // ─── Inline editing methods ────────────────────
  startEditItem(clId, secIdx, itemIdx) {
    this._editingItem = { clId, secIdx, itemIdx };
    this._editingSection = null;
    this._editingProject = null;
    this.render();
  },

  saveEditItem(clId, secIdx, itemIdx, newText) {
    newText = (newText || '').trim();
    if (!newText) return;
    Store.update(d => {
      const cl = (d.checklists||[]).find(c => c.id === clId);
      if (cl && cl.sections[secIdx] && cl.sections[secIdx].items[itemIdx]) {
        cl.sections[secIdx].items[itemIdx].text = newText;
      }
    });
    this._editingItem = null;
    this.render();
  },

  startEditSection(clId, secIdx) {
    this._editingSection = { clId, secIdx };
    this._editingItem = null;
    this._editingProject = null;
    this.render();
  },

  saveEditSection(clId, secIdx, newName) {
    newName = (newName || '').trim();
    if (!newName) return;
    Store.update(d => {
      const cl = (d.checklists||[]).find(c => c.id === clId);
      if (cl && cl.sections[secIdx]) cl.sections[secIdx].name = newName;
    });
    this._editingSection = null;
    this.render();
  },

  startEditProject(clId) {
    this._editingProject = clId;
    this._editingItem = null;
    this._editingSection = null;
    this.render();
  },

  saveEditProject(clId, newName, newIcon) {
    newName = (newName || '').trim();
    if (!newName) return;
    const oldCl = (Store.get().checklists || []).find(c => c.id === clId);
    const oldName = oldCl ? oldCl.name : null;
    Store.update(d => {
      const cl = (d.checklists||[]).find(c => c.id === clId);
      if (cl) { cl.name = newName; if (newIcon) cl.icon = newIcon.trim(); }
    });
    // Rename vault project folder if name changed and vault available
    if (oldName && oldName !== newName && this.vaultAvailable) {
      const safeName = n => n.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
      fetch('/api/vault/project-rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldName: safeName(oldName), newName: safeName(newName) })
      }).catch(() => {});
    }
    this._editingProject = null;
    this.render();
  },

  // ─── Quick capture from project ────────────────
  logProjectCapture(clId) {
    const textEl = document.getElementById('proj-log-text');
    const tagEl = document.getElementById('proj-log-tag');
    const text = (textEl?.value || '').trim();
    const tag = (tagEl?.value || '#study').trim();
    if (!text) { toast('Enter something to log'); return; }
    const taggedText = tag ? `${tag} ${text}` : text;
    Store.update(d => {
      d.captures.push({ id: uid(), text: taggedText, created: Date.now() });
      // Save tag back to checklist
      const cl = (d.checklists||[]).find(c => c.id === clId);
      if (cl) cl.captureTag = tag;
    });
    if (textEl) textEl.value = '';
    toast(`Logged to Capture`);
    this.render();
  },

  importTopicsAsProject() {
    const data = Store.get();
    const topics = data.topics || [];
    if (!topics.length) return;
    // Group by category
    const catMap = {};
    for (const t of topics) {
      const cat = t.category || 'Uncategorized';
      if (!catMap[cat]) catMap[cat] = [];
      catMap[cat].push(t);
    }
    const sections = Object.entries(catMap).map(([name, items]) => ({
      name,
      items: items.map(t => ({
        id: uid(),
        text: t.name,
        tag: null,
        status: t.status || 'not-started',
        revisions: t.lastStudied ? [{ date: t.lastStudied }] : []
      }))
    }));
    const cl = { id: uid(), name: 'My Topics', icon: '📚', projectId: null, uploadedAt: Date.now(), sections, _fromTopics: true };
    Store.update(d => {
      if (!d.checklists) d.checklists = [];
      d.checklists.push(cl);
      d._topicsImportDismissed = true;
    });
    this.strategyProject = cl.id;
    toast(`Imported ${topics.length} topics as a Project`);
    this.render();
  },

  dismissTopicsImport() {
    Store.update(d => { d._topicsImportDismissed = true; });
    this.render();
  },

  // ─── Project Methods ───────────────────────────
  addProject() {
    const icon = document.getElementById('new-proj-icon')?.value.trim() || '🎯';
    const name = document.getElementById('new-proj-name')?.value.trim();
    const deadline = document.getElementById('new-proj-deadline')?.value;
    const color = document.getElementById('new-proj-color')?.value || '#7c6ff7';
    if (!name) { toast('Project name required'); return; }
    const projId = uid();
    Store.update(d => {
      if (!d.strategy.projects) d.strategy.projects = [];
      d.strategy.projects.push({ id: projId, name, deadline, color, icon });
    });
    if (App.vaultAvailable) {
      const today = localDateKey();
      const fileName = name.replace(/[/\\?%*:|"<>]/g, '-') + '.md';
      const initContent = `# ${name}\n\nCreated: ${today}\nDeadline: ${deadline}\n\n`;
      fetch('/api/vault/file', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: fileName, content: initContent }) })
        .then(r => r.json())
        .then(r => { if (r.success) toast(`Created ${fileName} in vault`); })
        .catch(() => {});
    }
    this.render();
  },

  updateProject(idx, field, value) {
    Store.update(d => {
      if (d.strategy.projects && d.strategy.projects[idx]) {
        d.strategy.projects[idx][field] = value;
      }
    });
    this.render();
  },

  deleteProject(id) {
    if (!confirm('Delete this project?')) return;
    const proj = (Store.get().strategy.projects || []).find(p => p.id === id);
    Store.update(d => { d.strategy.projects = (d.strategy.projects || []).filter(p => p.id !== id); });
    if (proj && App.vaultAvailable) {
      const fileName = proj.name.replace(/[/\\?%*:|"<>]/g, '-') + '.md';
      if (confirm(`Also delete ${fileName} from vault?`)) {
        fetch('/api/vault/file', { method: 'DELETE', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: fileName, force: true }) }).catch(() => {});
      }
    }
    this.render();
  },

  saveSchedule() {
    const rows = document.querySelectorAll('#schedule-editor .strat-settings-row');
    const schedule = [];
    rows.forEach(row => {
      const time = row.querySelector('.sched-time')?.value.trim();
      const activity = row.querySelector('.sched-activity')?.value.trim();
      const stream = row.querySelector('.sched-stream')?.value || null;
      if (time && activity) {
        schedule.push({ time, activity, stream: stream || null });
      }
    });
    Store.update(d => {
      d.strategy.schedule = schedule;
    });
    this.render();
  },

  addScheduleSlot() {
    const editor = document.getElementById('schedule-editor');
    if (!editor) return;
    const idx = editor.children.length;
    const row = document.createElement('div');
    row.className = 'strat-settings-row';
    row.dataset.slot = idx;
    row.innerHTML = `
      <input type="text" class="strat-settings-input sched-time" placeholder="Time" style="width:100px;">
      <input type="text" class="strat-settings-input sched-activity" placeholder="Activity" style="flex:1;">
      <select class="strat-settings-select sched-stream">
        <option value="" selected>None</option>
        <option value="exam">Exam</option>
        <option value="flex">Flex</option>
      </select>
      <button class="btn btn-ghost btn-sm" onclick="App.removeScheduleSlot(${idx})" title="Remove">&times;</button>
    `;
    editor.appendChild(row);
  },

  removeScheduleSlot(idx) {
    const rows = document.querySelectorAll('#schedule-editor .strat-settings-row');
    if (rows[idx]) rows[idx].remove();
  },

  resetSchedule() {
    Store.update(d => {
      d.strategy.schedule = [...WEEKLY_TEMPLATE];
    });
    this.render();
  },

  // ─── Growth Actions ─────────────────────────
  async searchGrowthTag(tag) {
    if (tag) {
      this.growthTagFilter = tag;
    } else {
      const input = document.getElementById('growth-tag-input');
      this.growthTagFilter = input ? input.value.trim() : '';
    }
    if (!this.growthTagFilter) return;
    try {
      this.growthTagEntries = await VaultAPI.getTagEntries(this.growthTagFilter);
      this.render();
    } catch {}
  },

  clearGrowthTag() {
    this.growthTagFilter = '';
    this.growthTagEntries = null;
    this.render();
  },

  refreshGrowth() {
    this._growthLoading = false;
    this.growthData = null;
    this.growthTagEntries = null;
    this.render();
  },

  setGrowthSort(sort) {
    this.growthSort = sort;
    this.render();
  },

  addKnowledgeArea(name, keywordsStr) {
    if (!name?.trim()) return;
    const kws = (keywordsStr || '').split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
    Store.update(d => {
      if (!d.customKnowledgeAreas) d.customKnowledgeAreas = [];
      const existing = d.customKnowledgeAreas.find(a => a.name === name.trim());
      if (existing) { existing.keywords = kws; }
      else d.customKnowledgeAreas.push({ name: name.trim(), keywords: kws });
    });
    this.render();
    setTimeout(() => {
      const n = document.getElementById('new-area-name'); if (n) n.value = '';
      const k = document.getElementById('new-area-keywords'); if (k) k.value = '';
    }, 0);
    // Refresh growth data so file counts update
    if (this.vaultAvailable) this.loadGrowthData?.();
  },

  saveKnowledgeAreaKeywords(name, keywordsStr) {
    const kws = (keywordsStr || '').split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
    Store.update(d => {
      const area = (d.customKnowledgeAreas || []).find(a => a.name === name);
      if (area) area.keywords = kws;
    });
    this._editingKbArea = null;
    this.render();
    if (this.vaultAvailable) this.loadGrowthData?.();
  },

  deleteKnowledgeArea(name) {
    Store.update(d => {
      d.customKnowledgeAreas = (d.customKnowledgeAreas || []).filter(a => a.name !== name);
    });
    this._editingKbArea = null;
    this.render();
  },

  async generateWeeklyReview() {
    // Try vault-based review first, fall back to local data
    if (this.vaultAvailable) {
      try {
        this.weeklyReview = await VaultAPI.getWeeklyReview();
        this.render();
        return;
      } catch {}
    }
    // Local data summary
    const data = Store.get();
    const now = new Date();
    const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
    const weekStr = localDateKey(weekAgo);

    // Journal entries this week
    const journalThisWeek = data.journal.filter(j => j.date >= weekStr);
    const totalWords = journalThisWeek.reduce((s, j) => s + (j.text || '').split(/\s+/).length, 0);
    const daysLogged = new Set(journalThisWeek.map(j => j.date)).size;

    // Tasks completed this week
    const tasksCompleted = data.tasks.filter(t => t.done).length;

    // Timer sessions this week
    const sessions = (data.timer?.sessions || []).filter(s => s.date >= weekStr);
    const totalStudyMin = sessions.reduce((s, x) => s + (x.duration || 0), 0);

    // Captures this week — extract tags
    const capturesThisWeek = data.captures.filter(c => new Date(c.created) >= weekAgo);
    const tagCounts = {};
    for (const c of capturesThisWeek) {
      const tags = (c.text.match(/#\w+/g) || []);
      for (const tag of tags) tagCounts[tag.slice(1)] = (tagCounts[tag.slice(1)] || 0) + 1;
    }
    for (const j of journalThisWeek) {
      const tags = (j.text || '').match(/#\w+/g) || [];
      for (const tag of tags) tagCounts[tag.slice(1)] = (tagCounts[tag.slice(1)] || 0) + 1;
    }
    const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([tag, count]) => ({ tag, count }));

    // Most active day
    const dayWordMap = {};
    for (const j of journalThisWeek) {
      dayWordMap[j.date] = (dayWordMap[j.date] || 0) + (j.text || '').split(/\s+/).length;
    }
    let mostActiveDay = '', mostActiveLines = 0;
    for (const [day, wc] of Object.entries(dayWordMap)) {
      if (wc > mostActiveLines) { mostActiveDay = day; mostActiveLines = wc; }
    }

    // Lessons from custom tags
    const reviewTags = data.weeklyReviewTags || ['lesson', 'people', 'food'];
    const lessons = [];
    for (const j of journalThisWeek) {
      const lines = (j.text || '').split('\n');
      for (const line of lines) {
        for (const tag of reviewTags) {
          if (line.toLowerCase().includes('#' + tag)) {
            lessons.push({ date: j.date, text: line.replace(/#\w+/g, '').trim() });
            break;
          }
        }
      }
    }

    this.weeklyReview = {
      daysLogged, totalWords, tasksCompleted, topTags,
      mostActiveDay, mostActiveLines,
      lessons: lessons.slice(0, 10),
      totalStudyMin, sessionCount: sessions.length
    };
    this.render();
  },

  // ─── Vault Actions ──────────────────────────
  async vaultNavigate(p) {
    this.vaultPath = p;
    this.vaultMode = 'browse';
    this.vaultFile = null;
    this.vaultIsSearching = false;
    this.vaultSearchResults = [];
    this.render();
    this.vaultLoadError = false;
    try {
      const data = await VaultAPI.listFiles(p);
      this.vaultFileList = data.files || [];
      this.render();
    } catch {
      this.vaultFileList = [];
      this.vaultLoadError = true;
      this.render();
    }
  },

  async openVaultFile(p) {
    // Add .md extension if missing
    if (!p.endsWith('.md')) p = p + '.md';
    this.currentView = 'vault';
    this.vaultMode = 'read';
    this.vaultFile = p;
    document.querySelectorAll('#nav-links li').forEach(l => {
      l.classList.toggle('active', l.dataset.view === 'vault');
    });
    this.render();
    try {
      const data = await VaultAPI.readFile(p);
      this.vaultFileContent = data.content || '';
      this.render();
    } catch {
      this.vaultFileContent = '> Error loading file.';
      this.render();
    }
  },

  vaultEdit() {
    this.vaultMode = 'edit';
    this.render();
  },

  vaultCancelEdit() {
    this.vaultMode = 'read';
    this.render();
  },

  async vaultSave() {
    const textarea = document.getElementById('vault-editor-area');
    if (!textarea || !this.vaultFile) return;
    const content = textarea.value;
    try {
      await VaultAPI.saveFile(this.vaultFile, content);
      this.vaultFileContent = content;
      this.vaultMode = 'read';
      this.render();
    } catch (err) {
      alert('Save failed: ' + err.message);
    }
  },

  vaultBack() {
    this.vaultMode = 'browse';
    this.vaultFile = null;
    this.render();
  },

  async vaultSearch() {
    const input = document.getElementById('vault-search');
    const q = input ? input.value.trim() : '';
    if (!q) return;
    this.vaultSearchQuery = q;
    this.vaultIsSearching = true;
    this.render();
    try {
      const data = await VaultAPI.search(q);
      this.vaultSearchResults = data.results || [];
      this.render();
    } catch {
      this.vaultSearchResults = [];
      this.render();
    }
  },

  vaultClearSearch() {
    this.vaultSearchQuery = '';
    this.vaultIsSearching = false;
    this.vaultSearchResults = [];
    this.render();
  },

  async vaultSearchByTag(tag) {
    this._tagLineResults = null;
    this._tagLineQuery = tag;
    this.render();
    try {
      const data = await VaultAPI.getTagEntries(tag);
      this._tagLineResults = data;
    } catch {
      // Fallback to old search if tag-entries not available
      this._tagLineResults = { tag, entries: [], count: 0 };
    }
    this.render();
  },

  async vaultNewFile() {
    const name = prompt('New file name (without .md):');
    if (!name) return;
    const filePath = (this.vaultPath ? this.vaultPath + '/' : '') + name.trim() + '.md';
    try {
      await VaultAPI.createFile(filePath, `# ${name.trim()}\n\n`);
      this.openVaultFile(filePath);
    } catch (err) {
      alert('Could not create file: ' + (err.message || 'Error'));
    }
  },

  // ─── Timer ──────────────────────────────────
  // timerState: { running, seconds, total, type, mode, elapsed, interval, completed, completedDuration, completedType }
  // mode: 'countdown' (default) or 'stopwatch' (ascending)
  timerState: {},
  showHabitEditor: false,
  showAllSessions: false,
  _timerNote: '',
  focusMode: false,
  fabExpanded: false,

  _tickTimer() {
    const el = document.querySelector('.timer-time');
    const ring = document.querySelector('.timer-progress-ring circle:nth-child(2)');
    const ts = this.timerState;
    const now = Date.now();

    if (ts.mode === 'stopwatch') {
      // Real elapsed = accumulated + current run
      const realElapsed = ts.accumulated + Math.floor((now - ts.startedAt) / 1000);
      ts.elapsed = realElapsed;
      if (el) {
        const h = Math.floor(realElapsed / 3600);
        const m = Math.floor((realElapsed % 3600) / 60);
        const s = realElapsed % 60;
        el.textContent = h > 0
          ? `${String(h)}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
          : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      }
      if (ring) {
        // Fill ring continuously over 60 min (3600s), clamped at 100%
        const pct = Math.min(realElapsed / 3600, 1) * 100;
        ring.setAttribute('stroke-dashoffset', 2 * Math.PI * 44 * (1 - pct / 100));
      }
    } else {
      // Real remaining = total - accumulated - current run
      const ran = ts.accumulated + Math.floor((now - ts.startedAt) / 1000);
      const remaining = Math.max(0, ts.total - ran);
      ts.seconds = remaining;
      if (remaining <= 0) {
        this.completeTimer();
        return;
      }
      if (el) {
        const m = Math.floor(remaining / 60);
        const s = remaining % 60;
        el.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      }
      if (ring) {
        const pct = (ts.total - remaining) / ts.total * 100;
        ring.setAttribute('stroke-dashoffset', 2 * Math.PI * 44 * (1 - pct / 100));
      }
    }
  },

  startTimer(minutes, type, mode) {
    if (this.timerState.interval) clearInterval(this.timerState.interval);
    const timerMode = mode || 'countdown';
    const now = Date.now();
    if (timerMode === 'stopwatch') {
      this.timerState = { running: true, mode: 'stopwatch', elapsed: 0, accumulated: 0, startedAt: now, type: type || 'Stopwatch', interval: null };
    } else {
      this.timerState = { running: true, mode: 'countdown', seconds: minutes * 60, total: minutes * 60, accumulated: 0, startedAt: now, type: type || 'Study', interval: null };
    }
    this.timerState.interval = setInterval(() => this._tickTimer(), 1000);
    this.render();
  },

  startCustomTimer() {
    const input = document.getElementById('timer-custom-min');
    const mins = parseInt(input?.value);
    if (!mins || mins < 1) {
      if (input) { input.focus(); input.style.border = '1px solid #e74c3c'; setTimeout(() => input.style.border = '', 1500); }
      return;
    }
    this.startTimer(mins, `${mins}m Session`, 'countdown');
  },

  resumeTimer() {
    const ts = this.timerState;
    if (ts.mode === 'stopwatch' && typeof ts.elapsed !== 'number') return;
    if (ts.mode !== 'stopwatch' && !ts.seconds) return;
    ts.running = true;
    ts.startedAt = Date.now();
    if (ts.interval) clearInterval(ts.interval);
    ts.interval = setInterval(() => this._tickTimer(), 1000);
    this.render();
  },

  pauseTimer() {
    if (this.timerState.interval) clearInterval(this.timerState.interval);
    const ts = this.timerState;
    // Accumulate time spent in this run
    const ran = Math.max(0, Math.floor((Date.now() - ts.startedAt) / 1000));
    ts.accumulated = (ts.accumulated || 0) + ran;
    ts.running = false;
    ts.interval = null;
    this.render();
  },

  resetTimer() {
    if (this.timerState.interval) clearInterval(this.timerState.interval);
    this.timerState = {};
    this._timerNote = '';
    this._pomodoroAuto = false;
    this._pomodoroCount = 0;
    this.render();
  },

  stopCountdownEarly() {
    if (this.timerState.interval) clearInterval(this.timerState.interval);
    const ts = this.timerState;
    const elapsed = (ts.accumulated || 0) + (ts.startedAt ? Math.max(0, Math.floor((Date.now() - ts.startedAt) / 1000)) : 0);
    this._earlyStopElapsed = elapsed;
    this._earlyStopType = ts.type || 'Study';
    this._earlyStopOriginalTotal = ts.total || 0;
    this._showStopReasonModal = true;
    ts.running = false;
    ts.interval = null;
    this.render();
  },

  confirmEarlyStop(reason) {
    const durationMin = Math.max(1, Math.round(this._earlyStopElapsed / 60));
    const originalMin = Math.round(this._earlyStopOriginalTotal / 60);
    const note = (this._timerNote || '').trim();
    Store.update(d => {
      if (!d.timer) d.timer = { sessions: [] };
      d.timer.sessions.push({
        date: todayKey(), duration: durationMin, type: this._earlyStopType,
        ts: Date.now(), note, stoppedEarly: true, reason: reason || 'No reason given', originalDuration: originalMin
      });
    });
    this._timerNotify(durationMin, this._earlyStopType);
    this.timerState = { completed: true, completedDuration: durationMin, completedType: this._earlyStopType };
    this._showStopReasonModal = false;
    this._pomodoroAuto = false;
    this._pomodoroCount = 0;
    this.render();
  },

  stopTimer() {
    if (this.timerState.interval) clearInterval(this.timerState.interval);
    const elapsed = this.timerState.elapsed || 0;
    const type = this.timerState.type || 'Stopwatch';
    const durationMin = Math.round(elapsed / 60);
    if (durationMin >= 1) {
      const note = (this._timerNote || '').trim();
      Store.update(d => {
        if (!d.timer) d.timer = { sessions: [] };
        d.timer.sessions.push({ date: todayKey(), duration: durationMin, type, ts: Date.now(), note });
      });
    }
    this._timerNotify(durationMin, type);
    this.timerState = { completed: true, completedDuration: durationMin, completedType: type };
    this.render();
  },

  _timerNotify(durationMin, type) {
    // Audio beep
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      osc.frequency.value = 800; osc.connect(ctx.destination); osc.start();
      setTimeout(() => osc.stop(), 200);
    } catch {}
    // Browser notification
    if (Notification.permission === 'granted') {
      new Notification('Timer Complete', { body: `${durationMin}min ${type} session done!`, icon: '/icon-192.svg' });
    }
  },

  // Pomodoro cycle: 25 focus → 5 break → 25 focus → 5 break → 25 focus → 15 long break
  _pomodoroCount: 0,
  _pomodoroAuto: false,

  completeTimer() {
    if (this.timerState.interval) clearInterval(this.timerState.interval);
    const duration = this.timerState.total || 0;
    const type = this.timerState.type || 'Study';
    const durationMin = Math.round(duration / 60);
    const note = (this._timerNote || '').trim();
    Store.update(d => {
      if (!d.timer) d.timer = { sessions: [] };
      d.timer.sessions.push({ date: todayKey(), duration: durationMin, type, ts: Date.now(), note });
    });
    this._timerNotify(durationMin, type);

    // Auto-cycle pomodoro
    if (this._pomodoroAuto && type.includes('Pomodoro')) {
      this._pomodoroCount++;
      this.timerState = { completed: true, completedDuration: durationMin, completedType: type };
      this.render();
      // Auto-start break after 2 seconds
      setTimeout(() => {
        if (this._pomodoroAuto) {
          const isLongBreak = this._pomodoroCount % 4 === 0;
          const breakMin = isLongBreak ? 15 : 5;
          this.startTimer(breakMin, `${isLongBreak ? 'Long' : 'Short'} Break`, 'countdown');
        }
      }, 2000);
      return;
    }
    if (this._pomodoroAuto && type.includes('Break')) {
      this.timerState = { completed: true, completedDuration: durationMin, completedType: type };
      this.render();
      // Auto-start next focus after 2 seconds
      setTimeout(() => {
        if (this._pomodoroAuto) {
          this.startTimer(25, 'Pomodoro', 'countdown');
        }
      }, 2000);
      return;
    }

    this.timerState = { completed: true, completedDuration: durationMin, completedType: type };
    this.render();
  },

  timerLogToCapture() {
    const ts = this.timerState;
    const noteEl = document.getElementById('timer-note');
    const note = (noteEl ? noteEl.value.trim() : '') || (this._timerNote || '').trim();
    const text = `Completed ${ts.completedDuration || 0}min ${ts.completedType || 'Study'} session${note ? ' — ' + note : ''}`;
    Store.update(d => d.captures.push({ id: uid(), text, created: Date.now() }));
    if (this.vaultAvailable) {
      VaultAPI.addCapture(text).catch(() => {});
    }
    toast('Session logged to captures');
    this.timerState = {};
    this._timerNote = '';
    this.render();
  },

  timerDismiss() {
    this.timerState = {};
    this._timerNote = '';
    this.render();
  },

  // ─── Habits ─────────────────────────────────
  toggleHabit(habitId) {
    let justCompleted = false;
    Store.update(d => {
      if (!d.habits) d.habits = { definitions: [], log: {} };
      const today = todayKey();
      if (!d.habits.log[today]) d.habits.log[today] = {};
      const was = d.habits.log[today][habitId];
      d.habits.log[today][habitId] = !was;
      justCompleted = !was;
    });
    if (justCompleted) {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        osc.frequency.value = 600; osc.type = 'sine';
        const gain = ctx.createGain();
        gain.gain.value = 0.1;
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(); setTimeout(() => { osc.stop(); ctx.close(); }, 100);
      } catch {}
      toast('Habit done!');
    }
    this.render();
  },

  addHabit() {
    const nameInput = document.getElementById('habit-name-input');
    const iconInput = document.getElementById('habit-icon-input');
    const name = nameInput ? nameInput.value.trim() : '';
    if (!name) return;
    const icon = iconInput ? iconInput.value.trim() || '\u2611' : '\u2611';
    Store.update(d => {
      if (!d.habits) d.habits = { definitions: [], log: {} };
      d.habits.definitions.push({ id: uid(), name, icon });
    });
    this.render();
  },

  deleteHabit(id) {
    Store.update(d => {
      if (!d.habits) return;
      d.habits.definitions = d.habits.definitions.filter(h => h.id !== id);
    });
    this.render();
  },

  // ─── Schedule ──────────────────────────────────
  _editSchedule: false,

  toggleScheduleSlot(idx) {
    const today = todayKey();
    const key = 'slot-' + idx;
    let justCompleted = false;
    Store.update(d => {
      if (!d.scheduleLog) d.scheduleLog = {};
      if (!d.scheduleLog[today]) d.scheduleLog[today] = {};
      const was = d.scheduleLog[today][key];
      d.scheduleLog[today][key] = !was;
      justCompleted = !was;
    });
    if (justCompleted) {
      const schedule = Store.get().strategy.schedule || WEEKLY_TEMPLATE;
      const slot = schedule[idx];
      if (slot) {
        const text = `Completed: ${slot.time} — ${slot.activity}`;
        Store.update(d => d.captures.push({ id: uid(), text, created: Date.now() }));
        if (this.vaultAvailable) {
          VaultAPI.addCapture(text).catch(() => {});
        }
      }
    }
    this.render();
  },

  addScheduleSlot() {
    const timeInput = document.getElementById('sched-new-time');
    const actInput = document.getElementById('sched-new-activity');
    const anytimeBox = document.getElementById('sched-anytime');
    const isAnytime = anytimeBox?.checked;
    const rawTime = timeInput?.value.trim();
    const activity = actInput?.value.trim();
    if (!activity) { toast('Enter an activity name'); return; }
    let time;
    let sortKey;
    if (isAnytime) {
      time = 'Anytime';
      sortKey = 'zz:zz'; // sort after all timed items
    } else if (rawTime) {
      // Store raw 24h (HH:MM) for reliable sorting; display uses locale format
      time = rawTime; // store as "HH:MM"
      sortKey = rawTime;
    } else {
      toast('Pick a time or check Anytime'); return;
    }
    Store.update(d => {
      if (!d.strategy.schedule) d.strategy.schedule = [...WEEKLY_TEMPLATE];
      d.strategy.schedule.push({ time, activity, stream: null, sortKey });
      // Sort: timed items by 24h key, Anytime items at the end
      d.strategy.schedule.sort((a, b) => {
        const ka = a.sortKey || (a.time === 'Anytime' ? 'zz:zz' : a.time);
        const kb = b.sortKey || (b.time === 'Anytime' ? 'zz:zz' : b.time);
        return ka.localeCompare(kb);
      });
    });
    this.render();
  },

  removeScheduleSlot(idx) {
    Store.update(d => {
      if (d.strategy.schedule) d.strategy.schedule.splice(idx, 1);
    });
    this.render();
  },

  // ─── Topics & Spaced Repetition ──────────────
  getTopicsDue() {
    const data = Store.get();
    const topics = data.topics || [];
    const today = todayKey();
    return topics.filter(t => {
      if (!t.lastStudied || t.status === 'not-started') return false;
      const intervals = { weak: 2, moderate: 5, strong: 14 };
      const interval = intervals[t.status] || 7;
      const last = new Date(t.lastStudied);
      last.setDate(last.getDate() + interval);
      return localDateKey(last) <= today;
    });
  },

  markTopicReviewed(id) {
    Store.update(d => {
      const topic = (d.topics || []).find(t => t.id === id);
      if (topic) topic.lastStudied = todayKey();
    });
    this.render();
  },

  addTopic() {
    const nameInput = document.getElementById('topic-name-input');
    const catInput = document.getElementById('topic-category-input');
    const name = nameInput ? nameInput.value.trim() : '';
    if (!name) return;
    const category = catInput ? catInput.value.trim() : '';
    Store.update(d => {
      if (!d.topics) d.topics = [];
      d.topics.push({ id: uid(), name, category, status: 'not-started', lastStudied: null });
    });
    this.render();
  },

  setTopicStatus(id, status) {
    Store.update(d => {
      const topic = (d.topics || []).find(t => t.id === id);
      if (topic) {
        topic.status = status;
        topic.lastStudied = todayKey();
      }
    });
    this.render();
  },

  cycleTopicStatus(id) {
    const order = ['not-started', 'weak', 'moderate', 'strong'];
    Store.update(d => {
      const topic = (d.topics || []).find(t => t.id === id);
      if (topic) {
        const idx = order.indexOf(topic.status);
        topic.status = order[(idx + 1) % order.length];
        if (topic.status !== 'not-started') topic.lastStudied = todayKey();
      }
    });
    this.render();
  },

  deleteTopic(id) {
    Store.update(d => {
      d.topics = (d.topics || []).filter(t => t.id !== id);
    });
    this.render();
  },

  loadTopicPreset() {
    const presetTopics = [
      { cat: 'Upper Limb', topics: ['Shoulder', 'Elbow', 'Wrist & Hand', 'Brachial Plexus'] },
      { cat: 'Lower Limb', topics: ['Hip', 'Knee', 'Ankle & Foot'] },
      { cat: 'Spine', topics: ['Cervical Spine', 'Thoracolumbar Spine', 'Deformities'] },
      { cat: 'Trauma', topics: ['Fracture Principles', 'Polytrauma', 'Pelvic & Acetabular'] },
      { cat: 'Paediatrics', topics: ['DDH', 'Clubfoot', 'Paediatric Fractures'] },
      { cat: 'Arthroplasty', topics: ['Primary TKA', 'Primary THA', 'Revision Arthroplasty'] },
      { cat: 'Other', topics: ['Tumors', 'Infections', 'Sports Medicine', 'Metabolic Bone'] },
    ];
    Store.update(d => {
      if (!d.topics) d.topics = [];
      for (const group of presetTopics) {
        for (const name of group.topics) {
          if (!d.topics.find(t => t.name === name)) {
            d.topics.push({ id: uid(), name, category: group.cat, status: 'not-started', lastStudied: null });
          }
        }
      }
    });
    this.render();
  },

  // ─── MCQ Score Tracker ──────────────────────
  addMcqScore() {
    const dateInput = document.getElementById('mcq-date');
    const sourceInput = document.getElementById('mcq-source');
    const scoreInput = document.getElementById('mcq-score');
    const totalInput = document.getElementById('mcq-total');
    const score = parseInt(scoreInput?.value);
    const total = parseInt(totalInput?.value);
    if (isNaN(score) || isNaN(total) || total <= 0) return;
    const date = dateInput?.value || todayKey();
    const source = sourceInput?.value?.trim() || '';
    Store.update(d => {
      if (!d.mcqScores) d.mcqScores = [];
      d.mcqScores.push({ id: uid(), date, source, score, total });
    });
    this.render();
  },

  deleteMcqScore(id) {
    Store.update(d => {
      d.mcqScores = (d.mcqScores || []).filter(s => s.id !== id);
    });
    this.render();
  },

  // ─── Focus Mode ─────────────────────────────
  toggleFocusMode() {
    this.focusMode = !this.focusMode;
    document.body.classList.toggle('focus-mode', this.focusMode);
    if (this.focusMode) {
      this.currentView = 'today';
      document.querySelectorAll('#nav-links li').forEach(l => l.classList.toggle('active', l.dataset.view === 'today'));
    }
    this.render();
  },

  // ─── Floating Quick-Add (FAB) ────────────────
  toggleFab() {
    this.fabExpanded = !this.fabExpanded;
    this.render();
  },

  async fabAdd() {
    const input = document.getElementById('fab-input');
    const text = input ? input.value.trim() : '';
    if (!text) return;
    Store.update(d => d.captures.push({ id: uid(), text, created: Date.now() }));
    if (this.vaultAvailable) {
      try { await VaultAPI.addCapture(text); } catch {}
    }
    this.fabExpanded = false;
    this.render();
  },

  // ─── Weekly Review Export ────────────────────
  async exportWeeklyReview() {
    try {
      const customTags = Store.get().weeklyReviewTags || ['lesson', 'people', 'food'];
      const res = await fetch('/api/vault/weekly-review/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customTags })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      this.weeklyExportMsg = 'Exported: ' + (data.file || 'weekly review');
      this.render();
      setTimeout(() => { this.weeklyExportMsg = null; this.render(); }, 3000);
    } catch (err) {
      alert('Export failed: ' + (err.message || 'Error'));
    }
  },

  // ─── Drag-to-Reorder ────────────────────────
  _dragIdx: null,

  onScheduleDragStart(e, idx) {
    this._dragIdx = idx;
    e.dataTransfer.effectAllowed = 'move';
  },

  onScheduleDrop(e, idx) {
    e.preventDefault();
    const from = this._dragIdx;
    if (from === null || from === idx) return;
    Store.update(d => {
      const arr = d.strategy.schedule;
      const item = arr.splice(from, 1)[0];
      arr.splice(idx, 0, item);
    });
    this._dragIdx = null;
    this.render();
  },

  onMilestoneDragStart(e, month, idx) {
    this._dragIdx = idx;
    this._dragMonth = month;
    e.dataTransfer.effectAllowed = 'move';
  },

  onMilestoneDrop(e, month, idx) {
    e.preventDefault();
    const from = this._dragIdx;
    if (from === null || from === idx || this._dragMonth !== month) return;
    Store.update(d => {
      const arr = d.strategy.milestones[month];
      if (!arr) return;
      const item = arr.splice(from, 1)[0];
      arr.splice(idx, 0, item);
    });
    this._dragIdx = null;
    this._dragMonth = null;
    this.render();
  },

  // ─── Search & Capture Filter ─────────────────
  searchQuery: '',
  captureTagFilter: '',

  // ─── Weekly Review Custom Tags ──────────────
  addWeeklyTag() {
    const input = document.getElementById('weekly-tag-input');
    const tag = (input?.value || '').trim().replace(/^#/, '').toLowerCase();
    if (!tag) return;
    Store.update(d => {
      if (!d.weeklyReviewTags) d.weeklyReviewTags = ['lesson', 'people', 'food'];
      if (!d.weeklyReviewTags.includes(tag)) d.weeklyReviewTags.push(tag);
    });
    this.render();
  },

  removeWeeklyTag(tag) {
    Store.update(d => {
      if (!d.weeklyReviewTags) return;
      d.weeklyReviewTags = d.weeklyReviewTags.filter(t => t !== tag);
    });
    this.render();
  },

  async updateVaultPath() {
    const input = document.getElementById('settings-vault-path');
    const vaultPath = (input?.value || '').trim();
    const useVault = !!vaultPath;
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vaultPath, useVault })
    });
    this.serverConfig = { ...this.serverConfig, vaultPath, useVault };
    // Re-check vault availability
    if (useVault) {
      try {
        const stats = await VaultAPI.getStats();
        this.vaultAvailable = !!stats && !stats.vaultDisabled;
        const vaultNav = document.querySelector('[data-view="vault"]');
        if (vaultNav) vaultNav.style.display = '';
      } catch { this.vaultAvailable = false; }
    } else {
      this.vaultAvailable = false;
      const vaultNav = document.querySelector('[data-view="vault"]');
      if (vaultNav) vaultNav.style.display = 'none';
    }
    toast(useVault ? 'Vault connected' : 'Vault disconnected');
    this.render();
  },

  setTaskSource(source) {
    Store.update(d => { d.taskSource = source; });
    this.render();
    toast('Task source updated');
  },

  async saveRapidLogFile() {
    const input = document.getElementById('settings-rapid-log');
    const rapidLogFile = (input?.value || '').trim();
    if (!rapidLogFile) return;
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rapidLogFile })
    });
    this.serverConfig = { ...this.serverConfig, rapidLogFile };
    toast('Journal filename saved');
    this.render();
  },

  // ─── Schedule/Habit Drag Reorder ────────────
  _schedDragIdx: null,

  onSchedDragStart(e, idx) {
    this._schedDragIdx = idx;
    e.dataTransfer.effectAllowed = 'move';
  },

  onSchedDrop(e, idx) {
    e.preventDefault();
    const from = this._schedDragIdx;
    if (from === null || from === idx) return;
    Store.update(d => {
      const arr = d.strategy.schedule || [];
      const item = arr.splice(from, 1)[0];
      arr.splice(idx, 0, item);
    });
    this._schedDragIdx = null;
    this.render();
  },

  onHabitDragStart(e, idx) {
    this._habitDragIdx = idx;
    e.dataTransfer.effectAllowed = 'move';
  },

  onHabitDrop(e, idx) {
    e.preventDefault();
    const from = this._habitDragIdx;
    if (from === null || from === idx) return;
    Store.update(d => {
      const arr = d.habits.definitions;
      const item = arr.splice(from, 1)[0];
      arr.splice(idx, 0, item);
    });
    this._habitDragIdx = null;
    this.render();
  },

  // ─── Dashboard Drag ─────────────────────────
  _dashDragKey: null,

  onDashDragStart(e, key) {
    this._dashDragKey = key;
    e.dataTransfer.effectAllowed = 'move';
  },

  onDashDrop(e, targetKey) {
    e.preventDefault();
    const fromKey = this._dashDragKey;
    if (!fromKey || fromKey === targetKey) return;
    const DEFAULT_LAYOUT = ['strategy-banner', 'stats-grid', 'open-tasks', 'recent-captures', 'suggestions', 'vault-insights', 'tag-cloud'];
    Store.update(d => {
      const layout = d.dashboardLayout || [...DEFAULT_LAYOUT];
      const fromIdx = layout.indexOf(fromKey);
      const toIdx = layout.indexOf(targetKey);
      if (fromIdx === -1 || toIdx === -1) return;
      layout.splice(fromIdx, 1);
      layout.splice(toIdx, 0, fromKey);
      d.dashboardLayout = layout;
    });
    this._dashDragKey = null;
    this.render();
  },

  // ─── Theme Toggle ────────────────────────────
  toggleTheme() {
    const data = Store.get();
    const newTheme = (data.theme || 'dark') === 'dark' ? 'light' : 'dark';
    Store.update(d => { d.theme = newTheme; });
    document.body.classList.toggle('light', newTheme === 'light');
    this._updateThemeToggle(newTheme);
    this.render();
  },

  _updateThemeToggle(theme) {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    const isLight = theme === 'light';
    btn.querySelector('.theme-toggle-icon').innerHTML = isLight ? '&#9788;' : '&#9790;';
    btn.querySelector('.theme-toggle-label').textContent = isLight ? 'Light mode' : 'Dark mode';
  },

  async checkForUpdates() {
    const btn = document.getElementById('update-nexus-btn');
    const status = document.getElementById('update-status');
    if (btn) btn.disabled = true;
    if (status) status.textContent = 'Updating...';
    try {
      const res = await fetch('/api/update', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        const msg = data.output || '';
        if (msg.includes('Already up to date') || msg.includes('Already up-to-date')) {
          if (status) status.textContent = 'Already up to date!';
          toast('Nexus is already up to date');
        } else {
          if (status) status.innerHTML = '<span style="color:var(--green);">Updated! Reload to apply.</span>';
          toast('Updated! Reloading...');
          setTimeout(() => window.location.reload(), 1500);
        }
      } else {
        if (status) status.innerHTML = `<span style="color:var(--red);">Failed: ${escapeHTML(data.error || 'Unknown error')}</span>`;
        toast('Update failed');
      }
    } catch (err) {
      if (status) status.innerHTML = '<span style="color:var(--red);">Network error</span>';
    }
    if (btn) btn.disabled = false;
  },

  setAccentColor(color) {
    Store.update(d => { d.accentColor = color; });
    document.documentElement.style.setProperty('--accent', color);
    this.render();
  },

  saveUserName() {
    const n = (document.getElementById('settings-username')?.value || '').trim();
    Store.update(d => { d.userName = n; });
    toast(n ? `Hi, ${n}! 👋 Dashboard greeting updated.` : 'Name cleared');
    this.render();
  },

  setFontSize(size) {
    Store.update(d => { d.fontSize = size; });
    const fontMap = { small: '13px', medium: '15px', large: '17px' };
    const zoomMap = { small: '0.875', medium: '1', large: '1.125' };
    document.documentElement.style.setProperty('--base-font-size', fontMap[size] || '15px');
    document.documentElement.style.setProperty('--app-zoom', zoomMap[size] || '1');
    this.render();
  },

  setDefaultView(view) {
    Store.update(d => { d.defaultView = view; });
    this.render();
  },

  toggleNavItem(view) {
    Store.update(d => {
      if (!d.hiddenNavItems) d.hiddenNavItems = [];
      const idx = d.hiddenNavItems.indexOf(view);
      if (idx >= 0) d.hiddenNavItems.splice(idx, 1);
      else d.hiddenNavItems.push(view);
    });
    this._applyNavVisibility();
    this.render();
  },

  _applyNavVisibility() {
    const hidden = Store.get().hiddenNavItems || [];
    document.querySelectorAll('#nav-links li[data-view]').forEach(li => {
      const v = li.dataset.view;
      if (v === 'dashboard' || v === 'settings') { li.style.display = ''; return; }
      li.style.display = hidden.includes(v) ? 'none' : '';
    });
  },

  // ─── Today Quick Add ────────────────────────
  async todayQuickAdd() {
    const input = document.getElementById('today-quick-input');
    const text = input ? input.value.trim() : '';
    if (!text) return;
    // Add to Nexus captures
    Store.update(d => d.captures.push({ id: uid(), text, created: Date.now() }));
    // Also log to vault Quick Captures file
    if (this.vaultAvailable) {
      try {
        await VaultAPI.addCapture(text);
      } catch {}
    }
    if (this.currentView === 'today') this.render();
  },

  // ─── Capture / Journal Export ────────────────
  exportCaptures() {
    const data = Store.get();
    const byTag = {};
    const noTag = [];
    for (const c of data.captures) {
      const tags = (c.text.match(/#\w+/g) || []);
      const date = c.created ? localDateKey(new Date(c.created)) : '?';
      if (tags.length) {
        for (const t of tags) {
          if (!byTag[t]) byTag[t] = [];
          byTag[t].push({ date, text: c.text });
        }
      } else {
        noTag.push({ date, text: c.text });
      }
    }
    const lines = [`# Captures Export — ${todayKey()}`, ''];
    for (const [tag, entries] of Object.entries(byTag).sort()) {
      lines.push(`## ${tag}`, '');
      for (const e of entries) lines.push(`- ${e.date}: ${e.text}`);
      lines.push('');
    }
    if (noTag.length) {
      lines.push('## (untagged)', '');
      for (const e of noTag) lines.push(`- ${e.date}: ${e.text}`);
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `captures-${todayKey()}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Captures exported');
  },

  exportJournal() {
    const data = Store.get();
    const entries = [...data.journal].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const lines = [`# Journal Export — ${todayKey()}`, ''];
    let lastDate = '';
    for (const e of entries) {
      if (e.date !== lastDate) {
        lines.push(`## ${e.date || 'Unknown date'}`, '');
        lastDate = e.date;
      }
      lines.push(`- ${e.text}`, '');
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `journal-${todayKey()}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Journal exported');
  },

  // ─── Capture with Vault Bridge ──────────────
  // Instantly patch in-memory growthData.tagTrends with tags from new text
  _patchGrowthTags(text) {
    const tags = (text.match(/#(\w+)/g) || []).map(t => t.slice(1).toLowerCase());
    if (!tags.length || !this.growthData) return;
    const month = localDateKey().slice(0, 7);
    if (!this.growthData.tagTrends) this.growthData.tagTrends = {};
    for (const tag of tags) {
      if (!this.growthData.tagTrends[tag]) this.growthData.tagTrends[tag] = {};
      this.growthData.tagTrends[tag][month] = (this.growthData.tagTrends[tag][month] || 0) + 1;
    }
  },

  addCapture() {
    const input = document.getElementById('capture-input');
    const text = input.value.trim();
    if (!text) return;
    Store.update(d => d.captures.push({ id: uid(), text, created: Date.now() }));
    this._patchGrowthTags(text);
    // Bridge to vault — save to Quick Captures file
    const toggle = document.getElementById('capture-vault-toggle');
    if (toggle && toggle.checked) {
      VaultAPI.addCapture(text).catch(() => {});
    }
    toast('Captured');
    this.render();
  },

  // ─── Interactive Tutorial ──────────────────────
  startTutorial() {
    this._tutorialActive = true;
    this._tutorialStep = 0;
    this.showShortcutHelp = false;
    this.fabExpanded = false;
    // Create persistent overlay on body (outside #content so render() won't destroy it)
    let overlay = document.getElementById('tutorial-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'tutorial-overlay';
      document.body.appendChild(overlay);
    }
    // Remove any tutorial offer modal
    document.getElementById('tutorial-offer')?.remove();
    this._tutorialResizeHandler = () => { if (this._tutorialActive) this._positionTutorialTooltip(); };
    window.addEventListener('resize', this._tutorialResizeHandler);
    this._renderTutorialStep();
  },

  endTutorial() {
    this._tutorialActive = false;
    document.getElementById('tutorial-overlay')?.remove();
    if (this._tutorialResizeHandler) {
      window.removeEventListener('resize', this._tutorialResizeHandler);
      this._tutorialResizeHandler = null;
    }
  },

  tutorialNext() {
    if (this._tutorialStep >= this._tutorialSteps.length - 1) {
      this.endTutorial();
      return;
    }
    this._tutorialStep++;
    this._renderTutorialStep();
  },

  tutorialBack() {
    if (this._tutorialStep <= 0) return;
    this._tutorialStep--;
    this._renderTutorialStep();
  },

  _renderTutorialStep() {
    const step = this._tutorialSteps[this._tutorialStep];
    const overlay = document.getElementById('tutorial-overlay');
    if (!overlay) return;

    // Switch view if needed
    if (step.view && step.view !== this.currentView) {
      this.currentView = step.view;
      // Update active nav highlight
      document.querySelectorAll('#nav-links li').forEach(li => {
        li.classList.toggle('active', li.dataset.view === step.view);
      });
      this.render();
    }

    const total = this._tutorialSteps.length;
    const current = this._tutorialStep + 1;
    const isFirst = this._tutorialStep === 0;
    const isLast = this._tutorialStep === total - 1;

    // Progress dots
    const dots = this._tutorialSteps.map((_, i) =>
      `<span class="tutorial-progress-dot ${i < this._tutorialStep ? 'done' : ''} ${i === this._tutorialStep ? 'active' : ''}"></span>`
    ).join('');

    const controls = `
      <div class="tutorial-progress">${dots}</div>
      <div class="tutorial-controls">
        <button class="btn btn-ghost btn-sm" onclick="App.endTutorial()" style="font-size:11px; opacity:0.7;">Skip</button>
        <span class="tutorial-step-indicator">${current} / ${total}</span>
        <div style="display:flex; gap:6px;">
          ${!isFirst ? '<button class="btn btn-ghost btn-sm" onclick="App.tutorialBack()">&#8592; Back</button>' : '<span></span>'}
          <button class="btn btn-primary btn-sm" onclick="App.tutorialNext()">${isLast ? 'Finish' : 'Next &#8594;'}</button>
        </div>
      </div>`;

    if (!step.target) {
      // Centered card (no spotlight)
      overlay.innerHTML = `
        <div class="tutorial-dimmer" onclick="App.endTutorial()"></div>
        <div class="tutorial-center-card" onclick="event.stopPropagation()">
          <h3>${step.title}</h3>
          <p>${step.body}</p>
          ${controls}
        </div>`;
      return;
    }

    // Target-based spotlight step
    overlay.innerHTML = `
      <div class="tutorial-spotlight"></div>
      <div class="tutorial-tooltip" data-position="${step.position}" onclick="event.stopPropagation()">
        <h3>${step.title}</h3>
        <p>${step.body}</p>
        ${controls}
      </div>`;

    // Position after DOM update
    requestAnimationFrame(() => this._positionTutorialTooltip());
  },

  _positionTutorialTooltip() {
    const step = this._tutorialSteps[this._tutorialStep];
    if (!step || !step.target) return;

    const target = document.querySelector(step.target);
    const spotlight = document.querySelector('.tutorial-spotlight');
    const tooltip = document.querySelector('.tutorial-tooltip');
    if (!target || !spotlight || !tooltip) {
      // Target not found — fall back to centered card
      const overlay = document.getElementById('tutorial-overlay');
      if (overlay) {
        const total = this._tutorialSteps.length;
        const current = this._tutorialStep + 1;
        const dots = this._tutorialSteps.map((_, i) =>
          `<span class="tutorial-progress-dot ${i < this._tutorialStep ? 'done' : ''} ${i === this._tutorialStep ? 'active' : ''}"></span>`
        ).join('');
        overlay.innerHTML = `
          <div class="tutorial-dimmer" onclick="App.endTutorial()"></div>
          <div class="tutorial-center-card" onclick="event.stopPropagation()">
            <h3>${step.title}</h3>
            <p>${step.body}</p>
            <div class="tutorial-progress">${dots}</div>
            <div class="tutorial-controls">
              <button class="btn btn-ghost btn-sm" onclick="App.endTutorial()" style="font-size:11px; opacity:0.7;">Skip</button>
              <span class="tutorial-step-indicator">${current} / ${this._tutorialSteps.length}</span>
              <div style="display:flex; gap:6px;">
                ${this._tutorialStep > 0 ? '<button class="btn btn-ghost btn-sm" onclick="App.tutorialBack()">&#8592; Back</button>' : '<span></span>'}
                <button class="btn btn-primary btn-sm" onclick="App.tutorialNext()">${this._tutorialStep >= total - 1 ? 'Finish' : 'Next &#8594;'}</button>
              </div>
            </div>
          </div>`;
      }
      return;
    }

    // Account for CSS zoom
    const zoom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-zoom') || '1') || 1;
    const rect = target.getBoundingClientRect();
    const pad = 6;

    // Position spotlight
    spotlight.style.top = (rect.top / zoom - pad) + 'px';
    spotlight.style.left = (rect.left / zoom - pad) + 'px';
    spotlight.style.width = (rect.width / zoom + pad * 2) + 'px';
    spotlight.style.height = (rect.height / zoom + pad * 2) + 'px';

    // Position tooltip
    const tRect = tooltip.getBoundingClientRect();
    const tW = tRect.width / zoom;
    const tH = tRect.height / zoom;
    const vW = window.innerWidth / zoom;
    const vH = window.innerHeight / zoom;
    let top, left;

    const pos = step.position;
    if (pos === 'right') {
      left = rect.right / zoom + 16;
      top = rect.top / zoom + (rect.height / zoom) / 2 - tH / 2;
    } else if (pos === 'left') {
      left = rect.left / zoom - 16 - tW;
      top = rect.top / zoom + (rect.height / zoom) / 2 - tH / 2;
    } else if (pos === 'top') {
      top = rect.top / zoom - 16 - tH;
      left = rect.left / zoom + (rect.width / zoom) / 2 - tW / 2;
    } else {
      top = rect.bottom / zoom + 16;
      left = rect.left / zoom + (rect.width / zoom) / 2 - tW / 2;
    }

    // Clamp to viewport
    top = Math.max(8, Math.min(top, vH - tH - 8));
    left = Math.max(8, Math.min(left, vW - tW - 8));

    tooltip.style.top = top + 'px';
    tooltip.style.left = left + 'px';
  },

  _offerTutorial() {
    const el = document.createElement('div');
    el.id = 'tutorial-offer';
    el.style.cssText = 'position:fixed;inset:0;z-index:10000;';
    el.innerHTML = `
      <div class="tutorial-dimmer"></div>
      <div class="tutorial-center-card" onclick="event.stopPropagation()">
        <div style="font-size:40px; margin-bottom:12px;">&#9670;</div>
        <h3>Welcome to Nexus!</h3>
        <p>Would you like a quick interactive tour of the features?</p>
        <div style="display:flex; gap:8px; justify-content:center;">
          <button class="btn btn-primary" onclick="document.getElementById('tutorial-offer').remove(); App.startTutorial();">Yes, show me around</button>
          <button class="btn btn-ghost" onclick="document.getElementById('tutorial-offer').remove();">Skip</button>
        </div>
      </div>`;
    document.body.appendChild(el);
  },
};
