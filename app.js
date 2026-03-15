// ═══════════════════════════════════════════════════
//  Nexus — Personal Evolution Hub
//  Data lives in nexus-data.json (server-side).
// ═══════════════════════════════════════════════════

// ── Data Layer ──────────────────────────────────────
const Store = {
  _data: null,       // In-memory cache (loaded from server on init)
  _saving: false,    // Prevent concurrent saves
  _dirty: false,     // Needs save after current save finishes

  _defaults() {
    return {
      captures: [],
      tasks: [],
      journal: [],
      goals: [],
      checklists: [],
      _topicsImportDismissed: false,
      streak: { lastDate: null, count: 0 },
      strategy: {
        milestones: DEFAULT_MILESTONES,
        allocations: DEFAULT_ALLOC,
        notes: {},
        examDate: '',
        schedule: [...WEEKLY_TEMPLATE],
        projects: [],
      },
      timer: { sessions: [] },
      habits: { definitions: [], log: {} },
      mcqScores: [],
      topics: [],
      theme: 'dark',
      taskSource: 'both',
      autoWeeklyExport: true,
      lastWeeklyExport: null,
      weeklyReviewTags: ['lesson', 'people', 'food'],
      scheduleLog: {},
      dashboardLayout: ['strategy-banner', 'stats-grid', 'open-tasks', 'recent-captures', 'suggestions', 'vault-insights', 'tag-cloud'],
      customKnowledgeAreas: [],   // user-added area names
      hiddenKnowledgeAreas: [],   // vault-detected areas the user hid
    };
  },

  _merge(saved) {
    const defaults = this._defaults();
    const merged = { ...defaults, ...saved };
    merged.strategy = { ...defaults.strategy, ...(saved.strategy || {}) };
    merged.timer = { ...defaults.timer, ...(saved.timer || {}) };
    merged.habits = { ...defaults.habits, ...(saved.habits || {}) };
    if (!merged.scheduleLog) merged.scheduleLog = {};
    if (!merged.dashboardLayout) merged.dashboardLayout = defaults.dashboardLayout;
    if (!merged.checklists) merged.checklists = [];
    if (typeof merged._topicsImportDismissed === 'undefined') merged._topicsImportDismissed = false;
    if (!merged.strategy.projects) {
      merged.strategy.projects = [];
    }
    // Remove legacy hardcoded proj-exam that caused "231 days" on new installs
    merged.strategy.projects = (merged.strategy.projects || []).filter(
      p => !(p.id === 'proj-exam' && p.deadline === '2026-11-01')
    );
    // Migrate old short month keys (feb, mar…) to YYYY-MM format
    const _mMap = {jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};
    for (const field of ['milestones', 'allocations', 'notes']) {
      if (merged.strategy[field] && typeof merged.strategy[field] === 'object') {
        const migrated = {};
        for (const [k, v] of Object.entries(merged.strategy[field])) {
          migrated[_mMap[k] ? '2026-' + _mMap[k] : k] = v;
        }
        merged.strategy[field] = migrated;
      }
    }
    if (!merged.taskSource) merged.taskSource = 'both';
    return merged;
  },

  // Called once on app startup — loads from server
  async init() {
    try {
      const res = await fetch('/api/nexus-data');
      const saved = await res.json();
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        this._data = this._merge(saved);
      } else {
        // Also try migrating from localStorage (one-time)
        const local = localStorage.getItem('nexus_data');
        if (local) {
          this._data = this._merge(JSON.parse(local));
          await this._saveToServer();
          localStorage.removeItem('nexus_data');  // Clean up after migration
        } else {
          this._data = this._defaults();
        }
      }
    } catch {
      // Offline fallback
      this._data = this._defaults();
    }
  },

  async _saveToServer() {
    if (this._saving) { this._dirty = true; return; }
    this._saving = true;
    try {
      await fetch('/api/nexus-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this._data)
      });
    } catch { /* silent */ }
    this._saving = false;
    if (this._dirty) { this._dirty = false; this._saveToServer(); }
  },

  // Sync API — works from in-memory cache
  get() { return this._data || this._defaults(); },

  update(fn) {
    if (!this._data) this._data = this._defaults();
    fn(this._data);
    this._saveToServer();  // Fire-and-forget save to server
    return this._data;
  },

  exportJSON() {
    const blob = new Blob([JSON.stringify(this.get(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexus-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Data exported');
  },

  importJSON(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        this._data = this._merge(data);
        this._saveToServer();
        App.render();
      } catch {
        alert('Invalid file format.');
      }
    };
    reader.readAsText(file);
  }
};

// ── Utility ────────────────────────────────────────
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
  });
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

// ── Dynamic Roadmap Month Helpers ─────────────────
function addMonths(yyyymm, n) {
  const [y, m] = yyyymm.split('-').map(Number);
  let nm = (m - 1 + n) % 12;
  const ny = y + Math.floor((m - 1 + n) / 12);
  if (nm < 0) { nm += 12; }
  return ny + '-' + String(nm + 1).padStart(2, '0');
}

function curMonthKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// ── 50 personalised dashboard greetings ─────────────────────────────────────
const GREETINGS = [
  // Morning (0–11)
  "Good morning{n}. A fresh start \u2014 make it count.",
  "Rise and shine{n}! Today is full of potential.",
  "Morning{n}. Small steps forward still move you ahead.",
  "Hello{n}! A new day, a new chance to level up.",
  "Good morning{n}. Your future self is cheering you on.",
  "Wake up and be awesome{n}!",
  "Good morning{n}. Consistency beats perfection every time.",
  "Rise up{n}. What you do today shapes who you become.",
  "Good morning{n}. One focused session can change your trajectory.",
  "Morning{n}. The best time to start was yesterday \u2014 today is second best.",
  "Good morning{n}. Show up, stay curious, keep growing.",
  "Hey{n}, a brand new day just unlocked. Let\u2019s go.",
  // Afternoon (12–23)
  "Good afternoon{n}. Keep the momentum going!",
  "Afternoon{n}. Halfway through \u2014 finish strong.",
  "Hey{n}, hope the day is treating you well. Keep pushing!",
  "Good afternoon{n}. Progress over perfection, always.",
  "Afternoon check-in{n}: you\u2019re doing better than you think.",
  "Hey{n}! This is your reminder that you\u2019ve got this.",
  "Good afternoon{n}. Small wins add up to big things.",
  "Afternoon{n}. Your dedication today becomes tomorrow\u2019s result.",
  "Hey{n}, the grind doesn\u2019t stop \u2014 and neither do you.",
  "Good afternoon{n}. Stay focused, stay consistent.",
  "Afternoon{n}. Every hour of focus is an investment in yourself.",
  "Hey{n}! Mid-day energy check \u2014 you\u2019re still in it.",
  // Evening (24–35)
  "Good evening{n}. Reflect, recharge, and set up tomorrow.",
  "Evening{n}. Every bit of effort you put in today counts.",
  "Good evening{n}. End the day strong \u2014 even a little matters.",
  "Evening{n}. You made it through another day. Be proud.",
  "Good evening{n}. Rest is part of growth too.",
  "Hey{n}, how did today go? Log it and learn from it.",
  "Evening{n}. What\u2019s one thing you\u2019re grateful for today?",
  "Good evening{n}. The quiet hours ahead are golden.",
  "Hey{n}! Night sessions hit different \u2014 you\u2019ve got this.",
  "Good evening{n}. Today\u2019s effort is tomorrow\u2019s advantage.",
  "Evening{n}. Wind down wisely \u2014 a rested mind learns faster.",
  "Hey{n}, one last push before rest? Make it worthwhile.",
  // Night (36–44)
  "Burning the midnight oil{n}? Make it count.",
  "Late night study session{n}? Proud of your dedication.",
  "Hey{n}, night owls get things done too. Keep going.",
  "Working late{n}? Remember to take breaks \u2014 you matter.",
  "The night is yours{n}. Deep focus awaits.",
  "Still going{n}? That\u2019s the spirit. One more session.",
  "Hey{n}, night mode activated. Let\u2019s get things done.",
  "The dedicated ones study while others sleep{n}.",
  "Late night clarity{n} \u2014 the best insights come in the quiet.",
  // Universal (45–49)
  "Welcome back{n}. Every session brings you closer.",
  "Hello{n}. You showed up \u2014 that\u2019s already a win.",
  "Hey there{n}. Let\u2019s make today count.",
  "Welcome back{n}. Your future self will thank you for this.",
  "Hello{n}. Focus on progress, not perfection.",
];

function getGreeting(userName) {
  const h = new Date().getHours();
  const d = new Date().getDate();
  const n = userName ? `, ${userName}` : '';
  let pool;
  if (h >= 6 && h < 12)       pool = GREETINGS.slice(0, 12);
  else if (h >= 12 && h < 17) pool = GREETINGS.slice(12, 24);
  else if (h >= 17 && h < 21) pool = GREETINGS.slice(24, 36);
  else                         pool = GREETINGS.slice(36, 45);
  // Rotate through pool daily so greeting changes every day without being random
  const msg = pool[d % pool.length];
  return msg.replace('{n}', n);
}

function monthLabel(key) {
  if (!key || !key.includes('-')) return key;
  const [y, m] = key.split('-').map(Number);
  const shortName = new Date(y, m - 1, 1).toLocaleString('en', { month: 'short' });
  const curYear = new Date().getFullYear();
  return shortName + (y !== curYear ? " '" + String(y).slice(2) : '');
}

function getRoadmapMonths(strategy) {
  const cur = curMonthKey();
  const start = strategy.roadmapStart || addMonths(cur, -2);
  const end   = strategy.roadmapEnd   || addMonths(cur, 6);
  const months = [];
  let k = start;
  let guard = 0;
  while (k <= end && guard++ < 48) {
    months.push({ key: k, label: monthLabel(k) });
    k = addMonths(k, 1);
  }
  return months;
}

const DEFAULT_ALLOC = {};

const DEFAULT_MILESTONES = {};

const WEEKLY_TEMPLATE = [
  { time: '6:00 AM', activity: 'Review flashcards / quick MCQs (30 min)', stream: 'exam' },
  { time: '7:00 AM', activity: 'Clinical duties at NOCERAL', stream: null },
  { time: '5:00 PM', activity: 'Focused study block (2-3 hrs)', stream: 'exam' },
  { time: '8:00 PM', activity: 'Secondary stream work (1-1.5 hrs)', stream: 'flex' },
  { time: '9:30 PM', activity: 'Light review / next day planning', stream: 'exam' },
];

// ── Vault API Client ──────────────────────────────
const VaultAPI = {
  async listFiles(p = '') {
    const res = await fetch(`/api/vault/files?path=${encodeURIComponent(p)}`);
    return res.json();
  },
  async readFile(p) {
    const res = await fetch(`/api/vault/file?path=${encodeURIComponent(p)}`);
    return res.json();
  },
  async saveFile(p, content) {
    const res = await fetch('/api/vault/file', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: p, content })
    });
    return res.json();
  },
  async createFile(p, content = '') {
    const res = await fetch('/api/vault/file', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: p, content })
    });
    return res.json();
  },
  async search(q) {
    const res = await fetch(`/api/vault/search?q=${encodeURIComponent(q)}`);
    return res.json();
  },
  async getTags() {
    const res = await fetch('/api/vault/tags');
    return res.json();
  },
  async getStats() {
    const res = await fetch('/api/vault/stats');
    return res.json();
  },
  async getDaily(date) {
    const url = date ? `/api/vault/daily?date=${date}` : '/api/vault/daily';
    const res = await fetch(url);
    return res.json();
  },
  async addDaily(text) {
    const res = await fetch('/api/vault/daily', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    return res.json();
  },
  async addCapture(text) {
    const res = await fetch('/api/vault/capture', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    return res.json();
  },
  async getGrowth() {
    const res = await fetch('/api/vault/growth');
    return res.json();
  },
  async getSuggestions() {
    const res = await fetch('/api/vault/suggestions');
    return res.json();
  },
  async getTasks() {
    const res = await fetch('/api/vault/tasks');
    return res.json();
  },
  async toggleTask(source, line) {
    const res = await fetch('/api/vault/tasks/toggle', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, line })
    });
    return res.json();
  },
  async getTagEntries(tag) {
    const res = await fetch(`/api/vault/tag-entries?tag=${encodeURIComponent(tag)}`);
    return res.json();
  },
  async getWeeklyReview() {
    const res = await fetch('/api/vault/weekly-review');
    return res.json();
  },
};

// ── Markdown Rendering ────────────────────────────
function preprocessObsidian(md) {
  // Dataviewjs & tasks blocks -> styled info blocks
  md = md.replace(/```dataviewjs[\s\S]*?```/g, '<div class="vault-info-block">Dataview query — view in Obsidian</div>');
  md = md.replace(/```tasks[\s\S]*?```/g, '<div class="vault-info-block">Tasks query — view in Obsidian</div>');
  // Block references: strip ^blockid
  md = md.replace(/\s+\^[a-zA-Z0-9]+$/gm, '');
  // Transclusions
  md = md.replace(/!\[\[([^\]]+)\]\]/g, '<div class="vault-info-block">Embedded: $1</div>');
  // Wikilinks with alias: [[path|display]]
  md = md.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '<a class="wikilink" onclick="App.openVaultFile(\'$1\')">$2</a>');
  // Wikilinks with section: [[path#section]]
  md = md.replace(/\[\[([^\]#]+)#([^\]]+)\]\]/g, '<a class="wikilink" onclick="App.openVaultFile(\'$1\')">$1 &rsaquo; $2</a>');
  // Basic wikilinks: [[path]]
  md = md.replace(/\[\[([^\]]+)\]\]/g, '<a class="wikilink" onclick="App.openVaultFile(\'$1\')">$1</a>');
  // Hashtags -> clickable pills (not inside code or links)
  md = md.replace(/(^|\s)#([a-zA-Z]\w*)/gm, '$1<span class="vault-tag" onclick="App.vaultSearchByTag(\'$2\')">#$2</span>');
  // Strikethrough
  md = md.replace(/~~(.*?)~~/g, '<del>$1</del>');
  // Obsidian checkboxes: - [-] cancelled
  md = md.replace(/^(\s*)- \[-\]\s+(.*)/gm, '$1<li class="task-cancelled"><input type="checkbox" disabled> <del>$2</del></li>');
  return md;
}

function renderMarkdown(raw) {
  const preprocessed = preprocessObsidian(raw);
  if (typeof marked !== 'undefined') {
    return marked.parse(preprocessed);
  }
  // Fallback: basic rendering
  return '<pre>' + escapeHTML(raw) + '</pre>';
}

// ── Streak Tracker ─────────────────────────────────
function updateStreak() {
  Store.update(data => {
    const today = todayKey();
    if (data.streak.lastDate === today) return;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = yesterday.toISOString().slice(0, 10);

    if (data.streak.lastDate === yesterdayKey) {
      data.streak.count++;
    } else if (data.streak.lastDate !== today) {
      data.streak.count = 1;
    }
    data.streak.lastDate = today;
  });
}

// ── Checklist MD Parser ──────────────────────────
function parseChecklistMD(text, fallbackName) {
  const lines = text.split('\n');
  let name = fallbackName || 'Checklist';
  const sections = [];
  let cur = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('# ') && !line.startsWith('## ')) {
      name = line.slice(2).trim();
    } else if (line.startsWith('## ')) {
      cur = { name: line.slice(3).trim(), items: [] };
      sections.push(cur);
    } else {
      const m = line.match(/^(?:\d+\.|[-*])\s+(.+)/);
      if (m) {
        if (!cur) { cur = { name: 'General', items: [] }; sections.push(cur); }
        const t = m[1].trim();
        const tag = t.startsWith('[AI]') ? 'AI' : null;
        cur.items.push({ id: uid(), text: tag ? t.slice(4).trim() : t, tag, status: 'not-started', revisions: [] });
      }
    }
  }
  return { id: uid(), name, projectId: null, uploadedAt: Date.now(), sections };
}

// ── Views ──────────────────────────────────────────

const Views = {

  // ─── Dashboard ───────────────────────────────
  dashboard() {
    const data = Store.get();
    const openTasks = data.tasks.filter(t => !t.done).length;
    const nexusDone = data.tasks.filter(t => t.done).length;
    const doneTasks = (App.vaultStats ? App.vaultStats.completedTasks : 0) + nexusDone;
    const totalCaptures = data.captures.length;
    const journalEntries = (App.vaultStats ? App.vaultStats.totalDailyEntries : 0) + data.journal.length;
    const activeGoals = data.goals.length;

    // Compute real activity streak — same sources as Calendar view
    const activityDays = new Set();
    for (const j of data.journal) { if (j.date) activityDays.add(j.date); }
    for (const s of (data.timer?.sessions || [])) { if (s.date) activityDays.add(s.date); }
    for (const c of data.captures) {
      const d = new Date(c.created).toISOString().slice(0, 10);
      activityDays.add(d);
    }
    for (const e of (App.vaultDailyEntries || [])) { if (e.date) activityDays.add(e.date); }
    for (const d of (App.vaultStats?.dailyDates || [])) { activityDays.add(d); }
    for (const [date, log] of Object.entries(data.scheduleLog || {})) {
      if (Object.values(log).some(v => v)) activityDays.add(date);
    }
    for (const [date, log] of Object.entries((data.habits?.log) || {})) {
      if (Object.values(log).some(v => v)) activityDays.add(date);
    }
    let currentStreak = 0;
    const streakCheck = new Date();
    // Grace-for-today: if today has no activity yet, start counting from yesterday
    if (!activityDays.has(streakCheck.toISOString().slice(0, 10))) streakCheck.setDate(streakCheck.getDate() - 1);
    for (let i = 0; i < 365; i++) {
      const dk = streakCheck.toISOString().slice(0, 10);
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
    if (taskSource !== 'nexus' && App.vaultTasks) {
      vaultOpenTasks.push(...(App.vaultTasks.active || []).slice(0, 5));
    }
    const vaultPending = App.vaultTasks ? App.vaultTasks.summary.pending : 0;

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
        const projects = s.projects || [];
        const allMs = Object.values(s.milestones).flat();
        const doneMs = allMs.filter(m => m.done).length;
        const examDate = s.examDate ? new Date(s.examDate) : (projects[0]?.deadline ? new Date(projects[0].deadline) : null);
        return `
        <div class="card dash-strategy-banner">
          <div style="display:flex; flex-wrap:wrap; gap:12px; align-items:stretch;">
            ${projects.map(proj => {
              const dl = proj.deadline ? new Date(proj.deadline) : null;
              const dLeft = dl && !isNaN(dl) ? Math.max(0, Math.ceil((dl - new Date()) / 864e5)) : null;
              return `
              <div style="flex:1; min-width:120px; padding:12px 16px; background:${proj.color}15; border:1px solid ${proj.color}40; border-radius:10px;">
                <div style="font-size:10px; color:${proj.color}; font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">${escapeHTML(proj.icon || '')} ${escapeHTML(proj.name)}</div>
                <div style="font-size:28px; font-weight:800; color:${proj.color}; line-height:1.1; margin:4px 0;">${dLeft !== null ? dLeft : '—'}</div>
                <div style="font-size:11px; color:var(--text-dim);">${dLeft !== null ? 'days left' : 'no deadline'}</div>
              </div>`;
            }).join('')}
            <div style="flex:1; min-width:120px; padding:12px 16px; background:var(--bg-card); border:1px solid var(--border); border-radius:10px; cursor:pointer;" onclick="App.currentView='goals'; App.render();">
              <div style="font-size:10px; color:var(--text-dim); font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">Goals</div>
              <div style="font-size:28px; font-weight:800; color:#a78bfa; line-height:1.1; margin:4px 0;">${activeGoalsList.length}</div>
              <div style="font-size:11px; color:var(--text-dim);">${activeGoalsList.length === 1 ? '1 active' : activeGoalsList.length + ' active'}${achievedGoalsList.length ? ' · ' + achievedGoalsList.length + ' achieved' : ''}</div>
              ${activeGoalsList.length ? `<div style="margin-top:6px; display:flex; flex-direction:column; gap:3px;">${activeGoalsList.slice(0,2).map(g => {
                const pct = g.target > 0 ? Math.min(100, Math.round(g.current/g.target*100)) : 0;
                return `<div><div style="font-size:10px; color:var(--text-dim); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100px;">${escapeHTML(g.text)}</div><div style="height:3px; background:var(--border); border-radius:2px; margin-top:2px;"><div style="height:3px; width:${pct}%; background:#a78bfa; border-radius:2px;"></div></div></div>`;
              }).join('')}</div>` : '<div style="font-size:11px; color:var(--text-dim); margin-top:4px;">Set a goal →</div>'}
            </div>
            <div style="flex:1; min-width:120px; padding:12px 16px; background:var(--bg-card); border:1px solid var(--border); border-radius:10px; cursor:pointer;" onclick="App.currentView='strategy'; App.render();">
              <div style="font-size:10px; color:var(--text-dim); font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">Habits Today</div>
              <div style="font-size:28px; font-weight:800; color:#f472b6; line-height:1.1; margin:4px 0;">${checkedHabitsToday}<span style="font-size:14px; font-weight:400; color:var(--text-dim);">/${scheduleItems.length}</span></div>
              <div style="font-size:11px; color:var(--text-dim); margin-bottom:4px;">${scheduleItems.length === 0 ? 'No habits set' : habitPctToday === 100 ? 'All done! 🎉' : habitPctToday + '% complete'}</div>
              ${scheduleItems.length ? `<div class="progress-bar" style="margin-top:4px;"><div class="progress-fill" style="width:${habitPctToday}%; background:#f472b6;"></div></div>` : ''}
            </div>
          </div>
        </div>`;
      },

      'stats-grid': () => {
        const vaultActive = App.vaultTasks ? App.vaultTasks.summary.activeCount : 0;
        const openTaskCount = taskSource === 'nexus' ? openTasks
          : taskSource === 'vault' ? vaultActive
          : vaultActive + openTasks;  // 'both': sum vault + nexus
        return `
        <div class="stats-grid">
          <div class="stat-card"><div class="stat-number">${openTaskCount}</div><div class="stat-label">Open Tasks <span style="font-size:10px; color:var(--text-dim);">(active)</span></div></div>
          <div class="stat-card"><div class="stat-number">${doneTasks}</div><div class="stat-label">Completed</div></div>
          <div class="stat-card"><div class="stat-number">${totalCaptures}</div><div class="stat-label">Captures</div></div>
          <div class="stat-card"><div class="stat-number">${journalEntries}</div><div class="stat-label">Journal</div></div>
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
        if (!App.vaultAvailable || !App.vaultSuggestions || !App.vaultSuggestions.suggestions || !App.vaultSuggestions.suggestions.length) return '';
        return `
          <div class="card" style="border-left: 3px solid var(--amber);">
            <div class="strat-section-label">Nexus Suggests</div>
            ${App.vaultSuggestions.suggestions.map(s => `
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
        if (!App.vaultAvailable || !App.vaultStats) return '';
        return `
          <h3 style="margin:20px 0 12px; font-size:16px; color:var(--text-dim);">Vault Insights</h3>
          <div class="stats-grid">
            <div class="stat-card" onclick="document.querySelector('[data-view=vault]').click()" style="cursor:pointer;">
              <div class="stat-number" style="color:var(--green);">${App.vaultStats.totalFiles}</div>
              <div class="stat-label">Vault Files</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${App.vaultStats.totalDailyEntries}</div>
              <div class="stat-label">Daily Entries</div>
            </div>
            <div class="stat-card" onclick="document.querySelector('[data-view=tasks]').click()" style="cursor:pointer;">
              <div class="stat-number">${App.vaultTasks ? App.vaultTasks.summary.pending : App.vaultStats.pendingTasks}</div>
              <div class="stat-label">Vault Pending</div>
            </div>
            <div class="stat-card" onclick="document.querySelector('[data-view=growth]').click()" style="cursor:pointer;">
              <div class="stat-number">${App.vaultStats.entriesThisWeek}</div>
              <div class="stat-label">Journal This Week</div>
            </div>
          </div>`;
      },

      'tag-cloud': () => {
        if (!App.vaultAvailable || !App.vaultStats || !Object.keys(App.vaultStats.tagCounts || {}).length) return '';
        return `
          <div class="card">
            <div class="strat-section-label">Top Tags</div>
            <div class="vault-tag-cloud">
              ${Object.entries(App.vaultStats.tagCounts)
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
  },

  // ─── Today ──────────────────────────────────
  today() {
    const data = Store.get();
    const todayDate = todayKey();
    const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    // Today's vault daily log
    const todayLog = (App.vaultDailyEntries || []).find(d => d.date === todayDate);

    // Due / overdue vault tasks
    const vt = App.vaultTasks;
    let overdueTasks = [];
    let dueTodayTasks = [];
    let activeTasks = [];
    if (vt) {
      const allPending = [...(vt.active || []), ...(vt.exam || []), ...(vt.backlog || []), ...(vt.other || [])];
      overdueTasks = allPending.filter(t => t.dueDate && t.dueDate < todayDate);
      dueTodayTasks = allPending.filter(t => t.dueDate === todayDate);
      activeTasks = (vt.active || []).filter(t => !t.dueDate || t.dueDate > todayDate).slice(0, 5);
    }

    // Nexus tasks (open)
    const openTasks = data.tasks.filter(t => !t.done).slice(-5).reverse();

    // Strategy: current month allocation
    const now = new Date();
    const _cmk = curMonthKey();
    const curAlloc = data.strategy.allocations[_cmk] || {};
    const examDate = data.strategy.examDate ? new Date(data.strategy.examDate) : null;
    const daysLeft = examDate ? Math.max(0, Math.ceil((examDate - now) / 864e5)) : null;

    // Schedule
    const userSchedule = data.strategy.schedule || WEEKLY_TEMPLATE;
    const schedLog = data.scheduleLog || {};
    const todaySchedLog = schedLog[todayDate] || {};
    const schedDone = Object.keys(todaySchedLog).filter(k => todaySchedLog[k]).length;
    const scheduleHTML = userSchedule.map((slot, idx) => {
      const checked = todaySchedLog['slot-' + idx];
      const schedProj = (data.strategy.projects || []).find(p => p.id === slot.stream || p.name === slot.stream);
      const color = schedProj ? schedProj.color : slot.stream === 'flex' ? 'var(--accent)' : 'var(--text-dim)';
      const streak = schedSlotStreak(idx);
      return `<div class="today-sched-row ${checked ? 'sched-done' : ''}" style="align-items:center;">
        <input type="checkbox" class="sched-check" ${checked ? 'checked' : ''} onclick="event.stopPropagation(); App.toggleScheduleSlot(${idx})" style="accent-color:${color}; cursor:pointer; flex-shrink:0;">
        <span class="today-sched-time" style="color:${color};">${slot.time}</span>
        <span style="flex:1;" class="${checked ? 'sched-activity-done' : ''}">${escapeHTML(slot.activity)}</span>
        ${streak > 0 ? `<span class="habit-streak" title="${streak}-day streak"><span class="habit-streak-fire">&#128293;</span>${streak}d</span>` : ''}
      </div>`;
    }).join('');

    function miniTaskItem(t, isVault) {
      const safeSource = isVault && t.source ? t.source.replace(/'/g, "\\'") : '';
      const check = isVault
        ? `<div class="item-check ${t.done ? 'done' : ''}" onclick="App.toggleVaultTask('${safeSource}', ${t.line})"></div>`
        : `<div class="item-check ${t.done ? 'done' : ''}" onclick="App.toggleTask('${t.id}')"></div>`;
      const overdue = isVault && t.dueDate && t.dueDate < todayDate ? ' vtask-overdue' : '';
      const dueLabel = isVault && t.dueDate ? `<span class="vtask-due${overdue}">${t.dueDate}</span>` : '';
      return `<div class="item">${check}<div class="item-body"><div class="item-title">${escapeHTML(t.text)}</div><div class="item-meta">${dueLabel}</div></div></div>`;
    }

    // Timer state
    const ts = App.timerState || {};
    let timerDisplay, timerPct;
    if (ts.mode === 'stopwatch') {
      const e = ts.elapsed || 0;
      const h = Math.floor(e / 3600);
      const m = Math.floor((e % 3600) / 60);
      const s = e % 60;
      timerDisplay = h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
      timerPct = (e % 60) / 60 * 100;
    } else {
      const timerMins = Math.floor((ts.seconds || 0) / 60);
      const timerSecs = (ts.seconds || 0) % 60;
      timerDisplay = `${String(timerMins).padStart(2, '0')}:${String(timerSecs).padStart(2, '0')}`;
      timerPct = ts.total ? Math.round(((ts.total - (ts.seconds || 0)) / ts.total) * 100) : 0;
    }

    // Schedule slot streak helper
    function schedSlotStreak(idx) {
      let streak = 0;
      const d = new Date();
      for (let i = 0; i < 60; i++) {
        const dk = d.toISOString().slice(0, 10);
        if ((schedLog[dk] || {})['slot-' + idx]) { streak++; d.setDate(d.getDate() - 1); }
        else break;
      }
      return streak;
    }

    // Spaced repetition: topics due for review
    const topicsDue = App.getTopicsDue ? App.getTopicsDue() : [];

    return `
      <h1 class="view-title">${dayName}</h1>
      <p class="view-subtitle">${daysLeft !== null ? daysLeft + ' days to exam &middot; ' : ''}Focus: ${curAlloc.exam || 0}% exam</p>

      <!-- Quick Add -->
      <div class="today-quick-add">
        <input type="text" id="today-quick-input" placeholder="Quick capture... (press Enter)"
          onkeydown="if(event.key==='Enter'){App.todayQuickAdd(); event.preventDefault();}">
        <button class="btn btn-primary btn-sm" onclick="App.todayQuickAdd()">Add</button>
      </div>

      <!-- Study Timer -->
      <div class="card timer-card">
        <div class="strat-section-label">Study Timer</div>
        <div style="font-size:11px; color:var(--text-dim); margin-bottom:8px;">Start a timer to log study sessions. Sessions appear in Growth &gt; Session History.</div>
        <div class="timer-display">
          <div class="timer-progress-ring">
            <svg viewBox="0 0 100 100" width="120" height="120">
              <circle cx="50" cy="50" r="44" fill="none" stroke="var(--border)" stroke-width="6"/>
              <circle cx="50" cy="50" r="44" fill="none" stroke="${ts.mode === 'stopwatch' ? '#4ecdc4' : 'var(--accent)'}" stroke-width="6"
                stroke-dasharray="${2 * Math.PI * 44}" stroke-dashoffset="${2 * Math.PI * 44 * (1 - timerPct / 100)}"
                transform="rotate(-90 50 50)" stroke-linecap="round" style="transition: stroke-dashoffset 0.5s"/>
            </svg>
            <div class="timer-time">${timerDisplay}</div>
          </div>
        </div>
        <div class="timer-controls">
          ${ts.completed ? `
            <div style="text-align:center; margin-bottom:8px; color:var(--accent); font-weight:600;">✓ ${ts.completedDuration}min ${ts.completedType} done!</div>
            <input type="text" id="timer-note" class="strat-settings-input" placeholder="What did you study? (optional)" style="margin-bottom:8px; width:100%;" value="${escapeHTML(App._timerNote || '')}">
            <button class="btn btn-primary btn-sm" onclick="App.timerLogToCapture()">Log to Capture</button>
            <button class="btn btn-ghost btn-sm" onclick="App.timerDismiss()">Dismiss</button>
          ` : ts.running || (ts.seconds > 0 || ts.mode === 'stopwatch') ? `
            <input type="text" id="timer-note" class="strat-settings-input" placeholder="What are you studying? (optional)" style="margin-bottom:8px; width:100%;" value="${escapeHTML(App._timerNote || '')}"
              oninput="App._timerNote=this.value">
            ${ts.running ? `
              <button class="btn btn-ghost btn-sm" onclick="App.pauseTimer()">Pause</button>
              ${ts.mode === 'stopwatch' ? `<button class="btn btn-primary btn-sm" onclick="App.stopTimer()">Stop</button>` : `<button class="btn btn-ghost btn-sm" style="color:var(--red);" onclick="App.stopCountdownEarly()">Stop Early</button>`}
              <button class="btn btn-ghost btn-sm" onclick="App.resetTimer()">Reset</button>
            ` : `
              <button class="btn btn-primary btn-sm" onclick="App.resumeTimer()">Resume</button>
              ${ts.mode === 'stopwatch' ? `<button class="btn btn-primary btn-sm" onclick="App.stopTimer()">Stop</button>` : `<button class="btn btn-ghost btn-sm" style="color:var(--red);" onclick="App.stopCountdownEarly()">Stop Early</button>`}
              <button class="btn btn-ghost btn-sm" onclick="App.resetTimer()">Reset</button>
            `}
          ` : `
            <div class="timer-presets">
              <button class="btn btn-primary btn-sm" onclick="App._pomodoroAuto=true; App._pomodoroCount=0; App.startTimer(25, 'Pomodoro')">25m</button>
              <button class="btn btn-ghost btn-sm" onclick="App.startTimer(45, 'Deep Work')">45m</button>
              <button class="btn btn-ghost btn-sm" onclick="App.startTimer(15, 'Short')">15m</button>
            </div>
            <label style="font-size:11px; color:var(--text-dim); display:flex; align-items:center; gap:4px; cursor:pointer;">
              <input type="checkbox" ${App._pomodoroAuto ? 'checked' : ''} onchange="App._pomodoroAuto=this.checked" style="accent-color:var(--accent);"> Auto-cycle (25-5-25-5-25-15)
            </label>
            <div class="timer-custom-row">
              <input type="number" id="timer-custom-min" placeholder="Min" min="1" max="999" class="timer-custom-input"
                onkeydown="if(event.key==='Enter'){App.startCustomTimer(); event.preventDefault();}">
              <button class="btn btn-ghost btn-sm" onclick="App.startCustomTimer()">Start</button>
              <button class="btn btn-ghost btn-sm" onclick="App.startTimer(0, 'Stopwatch', 'stopwatch')" title="Count up">⏱ Stopwatch</button>
            </div>
          `}
        </div>
        ${ts.type && !ts.completed ? `<div style="font-size:11px; color:var(--text-dim); text-align:center; margin-top:4px;">${ts.type}${ts.mode === 'stopwatch' ? ' (counting up)' : ''}</div>` : ''}
        ${(() => {
          const todaySessions = (data.timer?.sessions || []).filter(s => s.date === todayDate);
          const todayStudyMins = todaySessions.reduce((sum, s) => sum + (s.duration || 0), 0);
          if (!todaySessions.length) return '';
          return `<div style="font-size:12px; color:var(--text-dim); text-align:center; margin-top:8px; border-top:1px solid var(--border); padding-top:8px;">
            Today: ${todayStudyMins}min across ${todaySessions.length} session${todaySessions.length !== 1 ? 's' : ''}
            ${todaySessions.map(s => `<span class="tag-badge-sm">${s.duration}m ${escapeHTML(s.type || '')}</span>`).join(' ')}
          </div>`;
        })()}
      </div>


      <!-- Topics Due for Review -->
      ${topicsDue.length > 0 ? `
        <div class="card today-alert-card" style="border-left:3px solid var(--amber);">
          <div class="strat-section-label" style="color:var(--amber);">Due for Review (${topicsDue.length})</div>
          <div class="item-list">
            ${topicsDue.map(t => `
              <div class="item" style="cursor:pointer;" onclick="App.markTopicReviewed('${t.id}')">
                <div class="item-check" style="background:var(--amber); opacity:0.6;"></div>
                <div class="item-body">
                  <div class="item-title">${escapeHTML(t.name)}</div>
                  <div class="item-meta">${t.category ? escapeHTML(t.category) + ' &middot; ' : ''}${t.status} &middot; last: ${t.lastStudied || 'never'}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${overdueTasks.length > 0 ? `
        <div class="card today-alert-card">
          <div class="strat-section-label" style="color:var(--red);">Overdue (${overdueTasks.length})</div>
          <div class="item-list">${overdueTasks.map(t => miniTaskItem(t, true)).join('')}</div>
        </div>
      ` : ''}

      ${dueTodayTasks.length > 0 ? `
        <div class="card">
          <div class="strat-section-label" style="color:var(--amber);">Due Today (${dueTodayTasks.length})</div>
          <div class="item-list">${dueTodayTasks.map(t => miniTaskItem(t, true)).join('')}</div>
        </div>
      ` : ''}

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
        <!-- Active Tasks -->
        <div class="card">
          <div class="strat-section-label">Active Tasks</div>
          ${activeTasks.length || openTasks.length ? `
            <div class="item-list">
              ${openTasks.map(t => miniTaskItem(t, false)).join('')}
              ${activeTasks.map(t => miniTaskItem(t, true)).join('')}
            </div>
          ` : '<div style="font-size:13px; color:var(--text-dim); padding:8px;">All clear!</div>'}
        </div>

        <!-- Schedule -->
        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <div class="strat-section-label" style="margin:0;">Habits</div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:11px; color:var(--text-dim);">${schedDone}/${userSchedule.length}</span>
              <span class="vtask-source" onclick="App._editSchedule=!App._editSchedule; App.render();">${App._editSchedule ? 'Done' : 'Edit'}</span>
            </div>
          </div>
          ${userSchedule.length > 0 ? (() => {
            const schedPct = Math.round((schedDone / userSchedule.length) * 100);
            return `<div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
              <div class="progress-bar" style="height:5px; flex:1;">
                <div class="progress-fill" style="width:${schedPct}%; background:${schedPct===100?'var(--green)':'var(--accent)'};"></div>
              </div>
              <span style="font-size:11px; color:${schedPct===100?'var(--green)':'var(--text-dim)'}; min-width:30px;">${schedPct}%</span>
            </div>`;
          })() : ''}
          ${scheduleHTML}
          ${App._editSchedule ? `
            <div style="margin-top:8px; border-top:1px solid var(--border); padding-top:8px;">
              <div class="strat-settings-row" style="margin-top:4px;">
                <input type="text" id="sched-new-time" class="strat-settings-input" placeholder="Time (e.g. 7:00 AM)" style="width:100px;">
                <input type="text" id="sched-new-activity" class="strat-settings-input" placeholder="Activity" style="flex:1;"
                  onkeydown="if(event.key==='Enter')App.addScheduleSlot()">
                <button class="btn btn-primary btn-sm" onclick="App.addScheduleSlot()">Add</button>
              </div>
              ${userSchedule.map((slot, idx) => `
                <div class="strat-settings-row" style="margin-top:4px;">
                  <span style="font-size:12px; color:var(--text-dim); min-width:70px;">${slot.time}</span>
                  <span style="font-size:12px; flex:1;">${escapeHTML(slot.activity)}</span>
                  <button class="btn btn-ghost btn-sm" onclick="App.removeScheduleSlot(${idx})" style="color:var(--red);">&times;</button>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      </div>

      <!-- Today's Rapid Log -->
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <div class="strat-section-label" style="margin:0;">Today's Log</div>
          <span class="vtask-source" onclick="App.openVaultFile('02 Rapid logging.md')">Open in Vault</span>
        </div>
        ${todayLog && todayLog.lines.filter(l => l.trim()).length > 0 ? `
          <div class="vault-daily-lines">${todayLog.lines.filter(l => l.trim()).map(l => escapeHTML(l)).join('<br>')}</div>
        ` : '<div style="font-size:13px; color:var(--text-dim);">Nothing logged yet today. Use the quick add above.</div>'}
      </div>
    `;
  },

  // ─── Capture ─────────────────────────────────
  capture() {
    const data = Store.get();
    let captures = [...data.captures].reverse();

    // Extract all tags across captures
    const allTags = {};
    for (const c of captures) {
      const tags = c.text.match(/#\w+/g) || [];
      for (const t of tags) allTags[t.toLowerCase()] = (allTags[t.toLowerCase()] || 0) + 1;
    }
    const tagList = Object.entries(allTags).sort((a, b) => b[1] - a[1]);

    // Filter by tag if active
    const activeTag = App.captureTagFilter || '';
    if (activeTag) {
      captures = captures.filter(c => c.text.toLowerCase().includes(activeTag));
    }

    // Pinned first
    captures.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

    return `
      <h1 class="view-title">Capture <button class="btn btn-ghost btn-sm" onclick="App.exportCaptures()" style="font-size:11px; vertical-align:middle; margin-left:8px;">⬇ Export .md</button></h1>
      <p class="view-subtitle">Quick thoughts, ideas, anything — get it out of your head</p>

      <div style="margin-bottom:20px;">
        <textarea id="capture-input" placeholder="What's on your mind? Use #tags to categorize" rows="3"></textarea>
        <div style="margin-top:10px; display:flex; justify-content:space-between; align-items:center;">
          ${App.vaultAvailable ? `
            <label class="vault-toggle-label">
              <input type="checkbox" id="capture-vault-toggle" checked>
              <span>Also log to vault</span>
            </label>
          ` : '<div></div>'}
          <button class="btn btn-primary" onclick="App.addCapture()">Capture</button>
        </div>
      </div>

      ${tagList.length ? `
        <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:16px;">
          <span class="tag-badge ${!activeTag ? 'tag-active' : ''}" onclick="App.captureTagFilter=''; App.render();">All</span>
          ${tagList.map(([tag, count]) => `
            <span class="tag-badge ${activeTag === tag ? 'tag-active' : ''}" onclick="App.captureTagFilter=${JSON.stringify(tag)}; App.render();">${tag} (${count})</span>
          `).join('')}
        </div>
      ` : ''}

      ${captures.length ? `
        <div class="capture-grid">
          ${captures.map(c => {
            const tags = c.text.match(/#\w+/g) || [];
            return `
            <div class="capture-card ${c.pinned ? 'capture-pinned' : ''}">
              <div class="capture-actions-row">
                <button class="capture-action-btn" onclick="App.togglePinCapture('${c.id}')" title="${c.pinned ? 'Unpin' : 'Pin'}">${c.pinned ? '&#9733;' : '&#9734;'}</button>
                <button class="capture-action-btn" onclick="App.captureToTask('${c.id}')" title="Convert to task">&#8594;T</button>
                <button class="item-delete" onclick="App.deleteCapture('${c.id}')">&times;</button>
              </div>
              <div class="capture-text">${escapeHTML(c.text)}</div>
              <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
                <div class="capture-time">${formatDate(c.created)}</div>
                ${tags.length ? `<div style="display:flex; gap:4px;">${tags.map(t => `<span class="tag-badge-sm">${t}</span>`).join('')}</div>` : ''}
              </div>
            </div>`;
          }).join('')}
        </div>
      ` : `
        <div class="empty-state">
          <div class="empty-icon">&#9889;</div>
          <div class="empty-text">${activeTag ? 'No captures with this tag.' : 'Your captures will appear here. Type anything above and hit Capture!'}</div>
        </div>
      `}
    `;
  },

  // ─── Tasks ───────────────────────────────────
  tasks() {
    const data = Store.get();
    const filter = App.taskFilter || 'active';
    let tasks = [...data.tasks].reverse();

    if (filter === 'done') tasks = tasks.filter(t => t.done);
    else {
      // Default (active): undone first (with #active tagged at top), then done at bottom
      tasks = tasks.filter(t => !t.done);
    }

    // Vault tasks
    const vt = App.vaultTasks;
    const vtab = App.vaultTaskTab || 'active';
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
    const vaultActive = App.vaultTasks ? App.vaultTasks.summary.activeCount : 0;
    const totalOpen = taskSrc === 'nexus' ? nexusOpen : taskSrc === 'vault' ? vaultActive : nexusOpen + vaultActive;
    return `
      <h1 class="view-title">Tasks ${totalOpen > 0 ? `<span style="font-size:14px; font-weight:600; color:var(--accent); background:var(--accent)18; border-radius:12px; padding:2px 10px; vertical-align:middle;">${totalOpen} open</span>` : ''}</h1>
      <p class="view-subtitle">Track what needs to get done</p>

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

      ${tasks.length ? `
        <div class="item-list">
          ${tasks.map(t => {
            const overdue = t.due && !t.done && t.due < todayKey();
            const subs = t.subtasks || [];
            const subsDone = subs.filter(s => s.done).length;
            const expanded = App._expandedTasks && App._expandedTasks[t.id];
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
  },

  // ─── Journal ─────────────────────────────────
  journal() {
    const data = Store.get();
    const entries = [...data.journal].reverse();
    const vaultDays = App.vaultDailyEntries || [];

    return `
      <h1 class="view-title">Journal <button class="btn btn-ghost btn-sm" onclick="App.exportJournal()" style="font-size:11px; vertical-align:middle; margin-left:8px;">⬇ Export .md</button></h1>
      <p class="view-subtitle">Reflect, learn, grow — one entry at a time</p>

      <div style="margin-bottom:24px;">
        <textarea id="journal-input" placeholder="What happened today? What did you learn?" rows="4"></textarea>
        <div style="margin-top:10px; display:flex; justify-content:space-between; align-items:center;">
          ${App.vaultAvailable ? `
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
              <div class="journal-text">${escapeHTML(e.text)}</div>
              <button class="btn btn-ghost btn-sm" style="margin-top:8px;" onclick="App.deleteJournal('${e.id}')">Delete</button>
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
  },

  // ─── Goals ───────────────────────────────────
  goals() {
    const data = Store.get();
    const activeGoals = (data.goals || []).filter(g => !g.achieved);
    const achievedGoals = (data.goals || []).filter(g => g.achieved);

    return `
      <h1 class="view-title">Goals</h1>
      <p class="view-subtitle">Set targets, track progress, level up</p>

      <div class="input-row">
        <input type="text" id="goal-input" placeholder="What's your goal?" onkeydown="if(event.key==='Enter')App.addGoal()">
        <input type="text" id="goal-target" placeholder="Target (number)" style="max-width:130px;" onkeydown="if(event.key==='Enter')App.addGoal()">
        <select id="goal-frequency" style="background:var(--bg-input); border:1px solid var(--border); color:var(--text); border-radius:6px; padding:6px 10px; font-size:12px; max-width:110px;">
          <option value="once">Once</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
        <button class="btn btn-primary" onclick="App.addGoal()">Add Goal</button>
      </div>

      ${activeGoals.length ? `
        <div class="strat-section-label" style="margin-top:16px; margin-bottom:8px;">Active Goals</div>
        <div class="item-list">
          ${activeGoals.map(g => {
            const pct = g.target > 0 ? Math.min(100, Math.round((g.current / g.target) * 100)) : 0;
            const freqBadge = g.frequency && g.frequency !== 'once' ? `<span style="font-size:10px;color:var(--text-dim);background:var(--bg-input);border-radius:4px;padding:1px 6px;margin-left:6px;">${g.frequency}</span>` : '';
            const prompt = App._goalPrompt;
            const isArchivePrompt = prompt?.id === g.id && prompt?.type === 'archive';
            const isGiveUpPrompt = prompt?.id === g.id && prompt?.type === 'giveup';
            const barColor = pct >= 100 ? 'var(--green)' : 'var(--accent)';
            return `
              <div class="card" style="${pct >= 100 ? 'border-left:3px solid var(--green);' : ''}">
                <div class="goal-header">
                  <span class="goal-title">${escapeHTML(g.text)}${freqBadge}</span>
                  <span class="goal-pct">${g.current} / ${g.target} (${pct}%)</span>
                </div>
                <div class="progress-bar">
                  <div class="progress-fill" style="width:${pct}%; background:${barColor}"></div>
                </div>
                <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;">
                  <button class="btn btn-ghost btn-sm" onclick="App.incrementGoal('${g.id}', -1)">-1</button>
                  <button class="btn btn-primary btn-sm" onclick="App.incrementGoal('${g.id}', 1)">+1</button>
                  <button class="btn btn-ghost btn-sm" onclick="App.incrementGoal('${g.id}', 5)">+5</button>
                  <button class="btn btn-ghost btn-sm" onclick="App.incrementGoal('${g.id}', 10)">+10</button>
                  <div style="flex:1;"></div>
                  ${pct >= 100 ? `<button class="btn btn-sm" style="background:var(--green);color:#fff;" onclick="App.showGoalPrompt('${g.id}','archive')">🏆 Archive</button>` : ''}
                  <button class="btn btn-ghost btn-sm" style="color:var(--red);" onclick="App.showGoalPrompt('${g.id}','giveup')">Give Up</button>
                </div>
                ${isArchivePrompt ? `
                  <div style="margin-top:12px; padding:12px; background:var(--bg-input); border-radius:8px; border-left:3px solid var(--green);">
                    <div style="font-size:13px; font-weight:600; color:var(--green); margin-bottom:6px;">🎉 Amazing work! What made you succeed?</div>
                    <div style="font-size:12px; color:var(--text-dim); margin-bottom:8px;">Reflect on your win — this will inspire your future self.</div>
                    <textarea id="goal-reason-input" placeholder="e.g. Stayed consistent, broke it into smaller steps, had a study buddy..." style="width:100%; min-height:64px; background:var(--bg-card); border:1px solid var(--border); color:var(--text); border-radius:6px; padding:8px; font-size:12px; resize:vertical; box-sizing:border-box;"></textarea>
                    <div style="display:flex; gap:8px; margin-top:8px; justify-content:flex-end;">
                      <button class="btn btn-ghost btn-sm" onclick="App._goalPrompt=null;App.render()">Cancel</button>
                      <button class="btn btn-sm" style="background:var(--green);color:#fff;" onclick="App.archiveGoal('${g.id}')">Save & Archive 🏆</button>
                    </div>
                  </div>
                ` : ''}
                ${isGiveUpPrompt ? `
                  <div style="margin-top:12px; padding:12px; background:var(--bg-input); border-radius:8px; border-left:3px solid var(--red);">
                    <div style="font-size:13px; font-weight:600; color:var(--text); margin-bottom:6px;">It's okay to let go — every step taught you something.</div>
                    <div style="font-size:12px; color:var(--text-dim); margin-bottom:8px;">What held you back? Being honest helps you grow.</div>
                    <textarea id="goal-reason-input" placeholder="e.g. Life got busy, goal was too ambitious, priorities shifted..." style="width:100%; min-height:64px; background:var(--bg-card); border:1px solid var(--border); color:var(--text); border-radius:6px; padding:8px; font-size:12px; resize:vertical; box-sizing:border-box;"></textarea>
                    <div style="display:flex; gap:8px; margin-top:8px; justify-content:flex-end;">
                      <button class="btn btn-ghost btn-sm" onclick="App._goalPrompt=null;App.render()">Cancel</button>
                      <button class="btn btn-ghost btn-sm" style="color:var(--red);" onclick="App.giveUpGoal('${g.id}')">Give Up Goal</button>
                    </div>
                  </div>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>
      ` : `
        <div class="empty-state">
          <div class="empty-icon">&#9650;</div>
          <div class="empty-text">No active goals. Set a target like "Complete 500 MCQs" and track your progress!</div>
        </div>
      `}

      ${achievedGoals.length ? `
        <div class="strat-section-label" style="margin-top:24px; margin-bottom:8px; color:#a78bfa;">🏆 Achieved Goals</div>
        <div class="item-list">
          ${achievedGoals.map(g => `
            <div class="card" style="opacity:0.9; border-left:3px solid #a78bfa;">
              <div class="goal-header">
                <span class="goal-title" style="color:var(--text);">✓ ${escapeHTML(g.text)}</span>
                <span style="font-size:11px; color:#a78bfa;">${g.achievedDate || ''}</span>
              </div>
              ${g.achievedReason ? `<div style="font-size:12px; color:var(--text-dim); margin-top:6px; padding:6px 8px; background:var(--bg-input); border-radius:6px; font-style:italic;">"${escapeHTML(g.achievedReason)}"</div>` : ''}
              <div style="margin-top:8px; display:flex; justify-content:flex-end;">
                <button class="btn btn-ghost btn-sm" onclick="App.deleteGoal('${g.id}')">Remove</button>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}

      ${((data.goals || []).filter(g => g.gaveUp)).length ? `
        <div class="strat-section-label" style="margin-top:24px; margin-bottom:8px; color:var(--text-dim);">Given Up Goals</div>
        <div class="item-list">
          ${(data.goals || []).filter(g => g.gaveUp).map(g => `
            <div class="card" style="opacity:0.65; border-left:3px solid var(--border);">
              <div class="goal-header">
                <span class="goal-title" style="color:var(--text-dim); text-decoration:line-through;">${escapeHTML(g.text)}</span>
                <span style="font-size:11px; color:var(--text-dim);">${g.gaveUpDate || ''}</span>
              </div>
              ${g.gaveUpReason ? `<div style="font-size:12px; color:var(--text-dim); margin-top:6px; padding:6px 8px; background:var(--bg-input); border-radius:6px; font-style:italic;">"${escapeHTML(g.gaveUpReason)}"</div>` : ''}
              <div style="margin-top:8px; display:flex; justify-content:flex-end;">
                <button class="btn btn-ghost btn-sm" onclick="App.deleteGoal('${g.id}')">Remove</button>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    `;
  },

  // ─── Strategy ──────────────────────────────────
  strategy() {
    const data = Store.get();
    const s = data.strategy;
    const roadmapMonths = getRoadmapMonths(s);
    const month = App.strategyMonth || curMonthKey();
    const tab = App.strategyTab || 'roadmap';
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
      if (!App.calendarYear) App.calendarYear = parseInt(month.slice(0,4), 10) || new Date().getFullYear();
      const calYear = App.calendarYear;
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
          if (!App._ganttExpanded) App._ganttExpanded = {};
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
                const isExpanded = !!App._ganttExpanded[row.id];
                const curKey = curMonthKey();
                const maxBarH = 43;
                const mainRow = `
                <div class="gantt-row">
                  <div class="gantt-label-wide gantt-proj-label" title="${escapeHTML(row.name)}" style="border-left:3px solid ${row.color}; cursor:pointer;" onclick="App.toggleGanttExpand('${row.id}')"><span style="color:${row.color};">${row.icon||'📋'}</span> <span style="color:var(--text); font-size:13px; font-weight:700;">${escapeHTML(row.name)}</span></div>
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
                const sectionRows = isExpanded ? row.sections.filter(sec => sec.total > 0).map(sec => `
                <div class="gantt-row gantt-section-row">
                  <div class="gantt-label-wide gantt-section-label-cell" onclick="App.jumpToProjectSection('${row.id}')" style="cursor:pointer;" title="Go to project">
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

        <!-- Notes -->
        <div class="card">
          <div class="strat-section-label">Notes \u2014 ${mLabel}</div>
          <textarea id="strat-notes" placeholder="What went well? What needs adjustment?"
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
            const prompt = App._goalPrompt;
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
                <div style="font-size:11px;font-weight:700;color:#a78bfa;margin-top:10px;margin-bottom:6px;">🏆 Achieved</div>
                ${achievedGoals.map(g => `
                  <div style="padding:6px 8px;margin-bottom:4px;background:var(--bg-input);border-radius:6px;border-left:2px solid #a78bfa;">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                      <span style="font-size:12px;color:#a78bfa;">✓ ${escapeHTML(g.text)}</span>
                      <span style="font-size:10px;color:var(--text-dim);">${g.achievedDate || ''}</span>
                    </div>
                    ${g.achievedReason ? `<div style="font-size:11px;color:var(--text-dim);margin-top:2px;font-style:italic;">"${escapeHTML(g.achievedReason)}"</div>` : ''}
                  </div>`).join('')}
              ` : ''}
              ${gaveUpGoals.length ? `
                <div style="font-size:11px;font-weight:700;color:var(--text-dim);margin-top:10px;margin-bottom:6px;">Given Up</div>
                ${gaveUpGoals.map(g => `
                  <div style="padding:6px 8px;margin-bottom:4px;background:var(--bg-input);border-radius:6px;opacity:0.6;">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                      <span style="font-size:12px;color:var(--text-dim);text-decoration:line-through;">${escapeHTML(g.text)}</span>
                      <span style="font-size:10px;color:var(--text-dim);">${g.gaveUpDate || ''}</span>
                    </div>
                    ${g.gaveUpReason ? `<div style="font-size:11px;color:var(--text-dim);margin-top:2px;font-style:italic;">"${escapeHTML(g.gaveUpReason)}"</div>` : ''}
                  </div>`).join('')}
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
      const activeId = App.strategyProject || checklists[0]?.id || null;
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
              style="${isActive ? `border-color:${clPillColor}; color:${clPillColor};` : ''}">
              ${escapeHTML(cl.icon || '📋')} ${escapeHTML(cl.name)}
              <span style="font-size:10px; opacity:0.7; margin-left:4px;">${revDone}/${allItems.length}</span>
            </button>`;
          }).join('')}

          <!-- + Add button -->
          <div style="position:relative; display:inline-block;">
            <button class="strat-month-pill" onclick="App._projAddOpen=!App._projAddOpen; App.render();" style="color:var(--accent); border-color:var(--accent)60;">+ Add</button>
            ${App._projAddOpen ? `
              <div style="position:absolute; top:36px; left:0; z-index:100; background:var(--bg-card); border:1px solid var(--border); border-radius:10px; padding:10px; min-width:220px; box-shadow:0 4px 20px rgba(0,0,0,0.3);">
                <button class="btn btn-primary" style="width:100%; margin-bottom:8px;" onclick="App._projAddOpen=false; App.uploadChecklist()">⬆ Upload .md file</button>
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
          const isEditingProj = App._editingProject === activeCL.id;

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
                      <input type="color" value="${clColor}" style="width:28px; height:28px; border:none; background:none; cursor:pointer; border-radius:6px;" title="Color"
                        onchange="App.updateChecklistMeta('${activeCL.id}', 'color', this.value)">
                      ${daysLeft !== null ? `<span style="font-size:11px; color:var(--text-dim);">${daysLeft} days left</span>` : ''}
                      <span style="font-size:11px; color:var(--text-dim);">${revDone}/${allItems.length} reviewed</span>
                    </div>
                    <textarea placeholder="Add a description…" rows="2"
                      style="width:100%; margin-top:8px; font-size:12px; background:var(--bg-input); border:1px solid var(--border); border-radius:6px; color:var(--text); padding:6px 8px; resize:vertical; box-sizing:border-box;"
                      onchange="App.updateChecklistMeta('${activeCL.id}', 'description', this.value)">${escapeHTML(activeCL.description||'')}</textarea>
                  `}
                </div>
                <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                  ${App.vaultAvailable ? `<span style="font-size:10px; color:var(--green); opacity:0.7;" title="Auto-syncs to vault when items are checked">&#8593; vault${activeCL.lastVaultSync ? ' · ' + activeCL.lastVaultSync : ''}</span>` : ''}
                  ${App.vaultAvailable && !activeCL.vaultFile ? `<button class="btn btn-ghost btn-sm" style="color:var(--accent); font-size:11px;" onclick="App.createProjectVaultFile('${activeCL.id}')" title="Create vault MD file">📁 Link vault</button>` : ''}
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
              const isEditingSec = App._editingSection && App._editingSection.clId === activeCL.id && App._editingSection.secIdx === secIdx;

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
                      const revs = item.revisions || (item.done ? [{date: new Date(activeCL.uploadedAt).toISOString().slice(0,10)}] : []);
                      const itemStatus = item.status || (item.done ? 'weak' : 'not-started');
                      const statusColor = statusColors[itemStatus] || 'var(--text-dim)';
                      const isEditingIt = App._editingItem && App._editingItem.clId === activeCL.id && App._editingItem.secIdx === secIdx && App._editingItem.itemIdx === itemIdx;

                      return `
                        <div style="display:flex; align-items:flex-start; gap:6px; padding:5px 0; border-bottom:1px solid rgba(255,255,255,0.04);">
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
        ${(s.projects || []).map(proj => {
          const dl = proj.deadline ? new Date(proj.deadline) : null;
          const dLeft = dl && !isNaN(dl) ? Math.max(0, Math.ceil((dl - new Date()) / 864e5)) : null;
          return `<div class="stat-card" style="border-color:${proj.color}40;">
            <div style="font-size:11px; color:${proj.color}; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">${escapeHTML(proj.icon || '')} ${escapeHTML(proj.name)}</div>
            <div class="stat-number" style="color:${proj.color}; font-size:28px;">${dLeft !== null ? dLeft : '\u2014'}</div>
            <div class="stat-label">${dLeft !== null ? 'days left' : 'no deadline'}</div>
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
  },

  // ─── Vault ──────────────────────────────────
  vault() {
    const mode = App.vaultMode || 'browse';
    const vaultPath = App.vaultPath || '';

    if (mode === 'read' && App.vaultFile) {
      return Views._vaultReader();
    }
    if (mode === 'edit' && App.vaultFile) {
      return Views._vaultEditor();
    }
    return Views._vaultBrowser();
  },

  _vaultBrowser() {
    const vaultPath = App.vaultPath || '';
    const files = App.vaultFileList || [];
    const searchQuery = App.vaultSearchQuery || '';
    const searchResults = App.vaultSearchResults || [];
    const isSearching = App.vaultIsSearching || false;

    // Breadcrumb
    const parts = vaultPath ? vaultPath.split('/') : [];
    let breadcrumb = `<span class="vault-crumb" onclick="App.vaultNavigate('')">Vault</span>`;
    let accumulated = '';
    for (const p of parts) {
      accumulated += (accumulated ? '/' : '') + p;
      const safePath = accumulated.replace(/'/g, "\\'");
      breadcrumb += ` <span class="vault-crumb-sep">/</span> <span class="vault-crumb" onclick="App.vaultNavigate('${safePath}')">${escapeHTML(p)}</span>`;
    }

    return `
      <h1 class="view-title">Vault</h1>
      <p class="view-subtitle">Your Obsidian knowledge base</p>

      <div class="vault-toolbar">
        <div class="vault-breadcrumb">${breadcrumb}</div>
        <div class="vault-search-row">
          <input type="text" id="vault-search" placeholder="Search vault..." value="${escapeHTML(searchQuery)}"
            onkeydown="if(event.key==='Enter')App.vaultSearch()">
          <button class="btn btn-primary btn-sm" onclick="App.vaultSearch()">Search</button>
          <button class="btn btn-ghost btn-sm" onclick="App.vaultNewFile()">+ New</button>
        </div>
      </div>

      ${isSearching && searchResults.length > 0 ? `
        <div class="card" style="margin-bottom:16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div class="strat-section-label" style="margin-bottom:0;">Search Results (${searchResults.length})</div>
            <button class="btn btn-ghost btn-sm" onclick="App.vaultClearSearch()">Clear</button>
          </div>
          <div class="item-list">
            ${searchResults.map(r => `
              <div class="item" style="cursor:pointer;" onclick="App.openVaultFile('${r.path.replace(/'/g, "\\'")}')">
                <div class="item-body">
                  <div class="item-title">${escapeHTML(r.name)}</div>
                  <div class="item-meta">${r.matches.map(m => `Line ${m.line}: ${escapeHTML(m.text.slice(0, 80))}`).join(' | ')}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : isSearching ? '<div class="empty-state" style="padding:20px;"><div class="empty-text">No results found.</div></div>' : ''}

      ${!isSearching ? `
        ${files.length ? `
          <div class="vault-file-grid">
            ${files.map(f => {
              const safePath = f.path.replace(/'/g, "\\'");
              if (f.isFolder) {
                return `
                  <div class="vault-file-card vault-folder" onclick="App.vaultNavigate('${safePath}')">
                    <div class="vault-file-icon">\uD83D\uDCC1</div>
                    <div class="vault-file-name">${escapeHTML(f.name)}</div>
                    <div class="vault-file-meta">${f.children} items</div>
                  </div>`;
              }
              const sizeKB = f.size ? Math.round(f.size / 1024) : 0;
              const modDate = f.modified ? new Date(f.modified).toLocaleDateString() : '';
              return `
                <div class="vault-file-card" onclick="App.openVaultFile('${safePath}')">
                  <div class="vault-file-icon">\uD83D\uDCC4</div>
                  <div class="vault-file-name">${escapeHTML(f.name.replace('.md', ''))}</div>
                  <div class="vault-file-meta">${sizeKB}KB &middot; ${modDate}</div>
                </div>`;
            }).join('')}
          </div>
        ` : `
          <div class="empty-state">
            <div class="empty-icon">${App.vaultLoadError ? '&#9888;' : '&#128218;'}</div>
            <div class="empty-text">${App.vaultLoadError ? 'Could not load vault — check your vault path in Settings.' : 'Loading vault...'}</div>
          </div>
        `}
      ` : ''}
    `;
  },

  _vaultReader() {
    const file = App.vaultFile;
    const content = App.vaultFileContent || '';
    const rendered = renderMarkdown(content);

    return `
      <div class="vault-header">
        <button class="btn btn-ghost btn-sm" onclick="App.vaultBack()">&larr; Back</button>
        <h2 class="vault-file-title">${escapeHTML(file.replace('.md', '').split('/').pop())}</h2>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-ghost btn-sm" onclick="App.vaultEdit()">Edit</button>
        </div>
      </div>
      <div class="vault-rendered card">${rendered}</div>
    `;
  },

  _vaultEditor() {
    const file = App.vaultFile;
    const content = App.vaultFileContent || '';

    return `
      <div class="vault-header">
        <button class="btn btn-ghost btn-sm" onclick="App.vaultCancelEdit()">&larr; Cancel</button>
        <h2 class="vault-file-title">Editing: ${escapeHTML(file.split('/').pop())}</h2>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-primary btn-sm" onclick="App.vaultSave()">Save</button>
        </div>
      </div>
      <textarea id="vault-editor-area" class="vault-editor-textarea">${escapeHTML(content)}</textarea>
    `;
  },

  // ─── Growth ─────────────────────────────────
  growth() {
    const data = Store.get();
    const g = App.growthData;
    if (!g) {
      // Trigger load if not already in flight
      if (!App._growthLoading) {
        App._growthLoading = true;
        VaultAPI.getGrowth().then(d => { App.growthData = d; App._growthLoading = false; App.render(); }).catch(() => { App._growthLoading = false; App.render(); });
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
        const dateStr = cellDate.toISOString().slice(0, 10);
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
        _appLessons.push({ date: cap.created ? new Date(cap.created).toISOString().slice(0,10) : '—', text: (cap.text||'').replace(/#\w+/g,'').trim(), src: '📱' });
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
          dayMap[d.toISOString().slice(0, 10)] = 0;
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
            ${App.weeklyReview ? `<button class="btn btn-ghost btn-sm" onclick="App.exportWeeklyReview()">Export to Vault</button>` : ''}
            <button class="btn btn-primary btn-sm" onclick="App.generateWeeklyReview()">
              ${App.weeklyReview ? 'Refresh' : 'Generate'}
            </button>
          </div>
        </div>
        ${App.weeklyReview ? (() => {
          const wr = App.weeklyReview;
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
        ${App.weeklyExportMsg ? `<div style="font-size:12px; color:var(--green); margin-top:8px;">${escapeHTML(App.weeklyExportMsg)}</div>` : ''}
      </div>

      <!-- Study Time -->
      <div class="card">
        <div class="strat-section-label">Study Time</div>
        ${(() => {
          const sessions = (Store.get().timer || {}).sessions || [];
          const thisWeek = sessions.filter(s => {
            const d = new Date(); d.setDate(d.getDate() - 7);
            return s.date >= d.toISOString().slice(0, 10);
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
          <span style="font-size:11px; color:var(--text-dim); cursor:pointer;" onclick="App.showAllSessions=!App.showAllSessions; App.render();">${App.showAllSessions ? 'Show less' : 'Show all'}</span>
        </div>
        ${(() => {
          const sessions = [...((Store.get().timer || {}).sessions || [])].reverse();
          const shown = App.showAllSessions ? sessions : sessions.slice(0, 5);
          if (!shown.length) return '<div style="font-size:12px; color:var(--text-dim);">No sessions yet. Start a timer!</div>';
          return shown.map(s => `
            <div style="display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid var(--border); flex-wrap:wrap;">
              <span style="font-size:11px; color:var(--text-dim); min-width:80px;">${new Date(s.ts).toLocaleDateString('en', { month:'short', day:'numeric' })}</span>
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
            value="${escapeHTML(App.growthTagFilter)}"
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
        ${App.growthTagEntries ? `
          <div class="growth-tag-results">
            <div style="display:flex; justify-content:space-between; align-items:center; margin:12px 0 8px;">
              <span style="font-size:13px; font-weight:600; color:var(--accent);">#${escapeHTML(App.growthTagFilter)} — ${App.growthTagEntries.count} entries</span>
              <button class="btn btn-ghost btn-sm" onclick="App.clearGrowthTag()">Clear</button>
            </div>
            ${App.growthTagEntries.entries.slice(0, 30).map(e => `
              <div class="lesson-item">
                <div class="lesson-date">
                  ${e.date}${e.source === 'app' ? ' <span style="font-weight:400; opacity:0.5; font-size:10px;">· app</span>' : ''}
                </div>
                <div class="lesson-text">${escapeHTML(e.text)}</div>
              </div>
            `).join('')}
            ${App.growthTagEntries.count > 30 ? `<div style="font-size:12px; color:var(--text-dim); padding:8px;">Showing 30 of ${App.growthTagEntries.count} entries</div>` : ''}
          </div>
        ` : ''}
      </div>

      <!-- Knowledge Areas -->
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <div class="strat-section-label" style="margin-bottom:0;">Knowledge Areas</div>
          <select class="growth-sort-select" onchange="App.setGrowthSort(this.value)">
            <option value="files" ${App.growthSort === 'files' ? 'selected' : ''}>By File Count</option>
            <option value="recent" ${App.growthSort === 'recent' ? 'selected' : ''}>By Last Updated</option>
            <option value="name" ${App.growthSort === 'name' ? 'selected' : ''}>By Name</option>
          </select>
        </div>
        <div style="font-size:11px; color:var(--text-dim); margin-bottom:12px; line-height:1.5;">
          Auto-detected from your vault folder structure. Add your own areas or hide ones you don't need.
          ${(data.hiddenKnowledgeAreas||[]).length ? `<span style="margin-left:6px; cursor:pointer; color:var(--accent); text-decoration:underline;" onclick="App.resetHiddenAreas()">Restore hidden (${data.hiddenKnowledgeAreas.length})</span>` : ''}
        </div>
        ${(() => {
          const hidden = new Set(data.hiddenKnowledgeAreas || []);
          const custom = (data.customKnowledgeAreas || []).map(name => ({ area: name, fileCount: null, lastUpdated: null, custom: true }));
          let areas = [
            ...(g.knowledgeAreas || []).filter(a => !hidden.has(a.area)),
            ...custom.filter(a => !hidden.has(a.area))
          ];
          if (App.growthSort === 'recent') areas.sort((a, b) => (b.lastUpdated || '').localeCompare(a.lastUpdated || ''));
          else if (App.growthSort === 'name') areas.sort((a, b) => a.area.localeCompare(b.area));
          const maxFiles = Math.max(...areas.map(x => x.fileCount || 0), 1);
          return areas.map(a => {
            const pct = a.fileCount ? Math.round((a.fileCount / maxFiles) * 100) : 0;
            const meta = a.custom ? '<span style="font-size:10px;color:var(--accent);margin-left:4px;">custom</span>' : (a.fileCount !== null ? a.fileCount + ' files' + (a.lastUpdated ? ' &middot; ' + a.lastUpdated : '') : '');
            return `<div style="margin-bottom:10px; display:flex; align-items:center; gap:8px;">
              <div style="flex:1;">
                <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;">
                  <span>${escapeHTML(a.area)}${a.custom ? '<span style="font-size:10px;color:var(--accent);margin-left:4px;">✎</span>' : ''}</span>
                  <span style="color:var(--text-dim); font-size:11px;">${meta}</span>
                </div>
                ${!a.custom ? `<div class="progress-bar" style="margin-top:0;"><div class="progress-fill" style="width:${pct}%;background:var(--accent);"></div></div>` : ''}
              </div>
              <button onclick="App.hideKnowledgeArea('${escapeHTML(a.area)}')" title="Hide this area" style="background:none;border:none;cursor:pointer;color:var(--text-dim);font-size:13px;padding:0 2px;opacity:0.5;flex-shrink:0;" onmouseover="this.style.opacity=1;this.style.color='var(--red)'" onmouseout="this.style.opacity=0.5;this.style.color='var(--text-dim)'">✕</button>
            </div>`;
          }).join('') || '<div style="font-size:12px;color:var(--text-dim);">No areas yet — connect a vault or add a custom area below.</div>';
        })()}
        <!-- Add custom area -->
        <div style="display:flex; gap:6px; margin-top:10px; border-top:1px solid var(--border); padding-top:10px;">
          <input type="text" id="new-area-input" placeholder="Add a knowledge area..." class="strat-settings-input" style="flex:1; font-size:12px;"
            onkeydown="if(event.key==='Enter') App.addKnowledgeArea(this.value)">
          <button class="btn btn-ghost btn-sm" onclick="App.addKnowledgeArea(document.getElementById('new-area-input')?.value)">+ Add</button>
        </div>
      </div>

      <!-- Lessons -->
      <div class="card">
        <div class="strat-section-label">Recent Lessons</div>
        <div style="font-size:11px; color:var(--text-dim); margin-bottom:10px;">Tag any capture, journal entry, or vault note with <code style="background:var(--bg-input);padding:1px 4px;border-radius:3px;">#lesson</code> to see it here.</div>
        ${lessonsHTML || '<div style="font-size:12px; color:var(--text-dim); padding:8px 0;">No #lesson entries found yet.</div>'}
      </div>
    `;
  },

  // ─── Focus Mode View ──────────────────────────
  focus() {
    const data = Store.get();
    const ts = App.timerState || {};
    let timerDisplay, timerPct;
    if (ts.mode === 'stopwatch') {
      const e = ts.elapsed || 0;
      const h = Math.floor(e / 3600);
      const m = Math.floor((e % 3600) / 60);
      const s = e % 60;
      timerDisplay = h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
      timerPct = (e % 60) / 60 * 100;
    } else {
      const timerMins = Math.floor((ts.seconds || 0) / 60);
      const timerSecs = (ts.seconds || 0) % 60;
      timerDisplay = `${String(timerMins).padStart(2, '0')}:${String(timerSecs).padStart(2, '0')}`;
      timerPct = ts.total ? Math.round(((ts.total - (ts.seconds || 0)) / ts.total) * 100) : 0;
    }

    // Open tasks
    const openTasks = data.tasks.filter(t => !t.done).slice(-10).reverse();
    const vt = App.vaultTasks;
    let activeTasks = [];
    if (vt) {
      activeTasks = [...(vt.active || []), ...(vt.exam || [])].filter(t => !t.done).slice(0, 10);
    }

    function miniTaskItem(t, isVault) {
      const todayDate = todayKey();
      const safeSource = isVault && t.source ? t.source.replace(/'/g, "\\'") : '';
      const check = isVault
        ? `<div class="item-check ${t.done ? 'done' : ''}" onclick="App.toggleVaultTask('${safeSource}', ${t.line})"></div>`
        : `<div class="item-check ${t.done ? 'done' : ''}" onclick="App.toggleTask('${t.id}')"></div>`;
      return `<div class="item">${check}<div class="item-body"><div class="item-title">${escapeHTML(t.text)}</div></div></div>`;
    }

    return `
      <div class="focus-header">
        <h2>Focus Mode</h2>
        <button class="btn btn-ghost btn-sm" onclick="App.toggleFocusMode()">Exit Focus</button>
      </div>

      <!-- Timer -->
      <div class="card timer-card" style="max-width:400px; margin:0 auto;">
        <div class="timer-display">
          <div class="timer-progress-ring">
            <svg viewBox="0 0 100 100" width="160" height="160">
              <circle cx="50" cy="50" r="44" fill="none" stroke="var(--border)" stroke-width="6"/>
              <circle cx="50" cy="50" r="44" fill="none" stroke="${ts.mode === 'stopwatch' ? '#4ecdc4' : 'var(--accent)'}" stroke-width="6"
                stroke-dasharray="${2 * Math.PI * 44}" stroke-dashoffset="${2 * Math.PI * 44 * (1 - timerPct / 100)}"
                transform="rotate(-90 50 50)" stroke-linecap="round" style="transition: stroke-dashoffset 0.5s"/>
            </svg>
            <div class="timer-time" style="font-size:32px;">${timerDisplay}</div>
          </div>
        </div>
        <div class="timer-controls">
          ${ts.completed ? `
            <div style="text-align:center; margin-bottom:8px; color:var(--accent); font-weight:600;">✓ ${ts.completedDuration}min ${ts.completedType} done!</div>
            <input type="text" id="timer-note" class="strat-settings-input" placeholder="What did you study? (optional)" style="margin-bottom:8px; width:100%;" value="${escapeHTML(App._timerNote || '')}">
            <button class="btn btn-primary" onclick="App.timerLogToCapture()">Log to Capture</button>
            <button class="btn btn-ghost" onclick="App.timerDismiss()">Dismiss</button>
          ` : ts.running || (ts.seconds > 0 || ts.mode === 'stopwatch') ? `
            <input type="text" id="timer-note" class="strat-settings-input" placeholder="What are you studying? (optional)" style="margin-bottom:8px; width:100%;" value="${escapeHTML(App._timerNote || '')}"
              oninput="App._timerNote=this.value">
            ${ts.running ? `
              <button class="btn btn-ghost" onclick="App.pauseTimer()">Pause</button>
              ${ts.mode === 'stopwatch' ? `<button class="btn btn-primary" onclick="App.stopTimer()">Stop</button>` : `<button class="btn btn-ghost" style="color:var(--red);" onclick="App.stopCountdownEarly()">Stop Early</button>`}
              <button class="btn btn-ghost" onclick="App.resetTimer()">Reset</button>
            ` : `
              <button class="btn btn-primary" onclick="App.resumeTimer()">Resume</button>
              ${ts.mode === 'stopwatch' ? `<button class="btn btn-primary" onclick="App.stopTimer()">Stop</button>` : `<button class="btn btn-ghost" style="color:var(--red);" onclick="App.stopCountdownEarly()">Stop Early</button>`}
              <button class="btn btn-ghost" onclick="App.resetTimer()">Reset</button>
            `}
          ` : `
            <div class="timer-presets">
              <button class="btn btn-primary" onclick="App._pomodoroAuto=true; App._pomodoroCount=0; App.startTimer(25, 'Pomodoro')">25 min</button>
              <button class="btn btn-ghost" onclick="App.startTimer(45, 'Deep Work')">45 min</button>
              <button class="btn btn-ghost" onclick="App.startTimer(15, 'Short')">15 min</button>
            </div>
            <label style="font-size:11px; color:var(--text-dim); display:flex; align-items:center; gap:4px; cursor:pointer; margin-top:4px;">
              <input type="checkbox" ${App._pomodoroAuto ? 'checked' : ''} onchange="App._pomodoroAuto=this.checked" style="accent-color:var(--accent);"> Auto-cycle (25-5-25-5-25-15)
            </label>
            <div class="timer-custom-row">
              <input type="number" id="timer-custom-min" placeholder="Min" min="1" max="999" class="timer-custom-input"
                onkeydown="if(event.key==='Enter'){App.startCustomTimer(); event.preventDefault();}">
              <button class="btn btn-ghost" onclick="App.startCustomTimer()">Start</button>
              <button class="btn btn-ghost" onclick="App.startTimer(0, 'Stopwatch', 'stopwatch')" title="Count up">⏱ Stopwatch</button>
            </div>
          `}
        </div>
        ${ts.type && !ts.completed ? `<div style="font-size:11px; color:var(--text-dim); text-align:center; margin-top:4px;">${ts.type}${ts.mode === 'stopwatch' ? ' (counting up)' : ''}</div>` : ''}
      </div>

      <!-- Quick Add -->
      <div class="today-quick-add" style="max-width:400px; margin:16px auto;">
        <input type="text" id="today-quick-input" placeholder="Quick capture..."
          onkeydown="if(event.key==='Enter'){App.todayQuickAdd(); event.preventDefault();}">
        <button class="btn btn-primary btn-sm" onclick="App.todayQuickAdd()">Add</button>
      </div>

      <!-- Tasks -->
      <div class="card" style="max-width:500px; margin:0 auto;">
        <div class="strat-section-label">Tasks</div>
        <div class="item-list">
          ${openTasks.map(t => miniTaskItem(t, false)).join('')}
          ${activeTasks.map(t => miniTaskItem(t, true)).join('')}
          ${!openTasks.length && !activeTasks.length ? '<div style="font-size:13px; color:var(--text-dim); padding:8px;">All clear!</div>' : ''}
        </div>
      </div>
    `;
  },

  // ─── Search ──────────────────────────────────
  search() {
    const q = (App.searchQuery || '').toLowerCase();
    const data = Store.get();
    let results = [];

    if (q.length >= 2) {
      // Search captures
      for (const c of data.captures) {
        if (c.text.toLowerCase().includes(q)) {
          results.push({ type: 'Capture', text: c.text, date: c.created, id: c.id });
        }
      }
      // Search tasks
      for (const t of data.tasks) {
        if (t.text.toLowerCase().includes(q)) {
          results.push({ type: 'Task', text: t.text, date: t.created, done: t.done });
        }
      }
      // Search journal
      for (const j of data.journal) {
        if (j.text.toLowerCase().includes(q)) {
          results.push({ type: 'Journal', text: j.text, date: j.created });
        }
      }
      // Search goals
      for (const g of data.goals) {
        if (g.text.toLowerCase().includes(q)) {
          results.push({ type: 'Goal', text: g.text, date: g.created });
        }
      }
      // Sort by date (newest first)
      results.sort((a, b) => (b.date || 0) - (a.date || 0));
    }

    return `
      <h1 class="view-title">Search</h1>
      <p class="view-subtitle">Find anything across captures, tasks, journal, goals</p>

      <div class="today-quick-add" style="margin-bottom:20px;">
        <input type="text" id="search-input" placeholder="Type to search... (min 2 chars)"
          value="${escapeHTML(App.searchQuery || '')}"
          oninput="clearTimeout(App._searchDebounce); App._searchDebounce=setTimeout(()=>{App.searchQuery=this.value; App.render();},150);"
          onkeydown="if(event.key==='Escape'){clearTimeout(App._searchDebounce); this.value=''; App.searchQuery=''; App.render();}">
      </div>

      ${q.length >= 2 ? `
        <div style="font-size:12px; color:var(--text-dim); margin-bottom:12px;">${results.length > 50 ? `Showing 50 of ${results.length}` : results.length} result${results.length !== 1 ? 's' : ''} for "${escapeHTML(q)}"</div>
        ${results.length ? `
          <div class="item-list">
            ${results.slice(0, 50).map(r => `
              <div class="item" style="border-left:3px solid ${r.type === 'Capture' ? 'var(--accent)' : r.type === 'Task' ? 'var(--green)' : r.type === 'Journal' ? 'var(--amber)' : '#888'}; padding-left:12px;">
                <div class="item-body">
                  <div class="item-title">${escapeHTML(r.text)}</div>
                  <div class="item-meta">
                    <span class="search-type-badge">${r.type}</span>
                    ${r.date ? timeAgo(r.date) : ''}
                    ${r.done ? ' (done)' : ''}
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        ` : '<div class="empty-state"><div class="empty-text">No results found.</div></div>'}
      ` : '<div class="empty-state"><div class="empty-text">Start typing to search...</div></div>'}
    `;
  },

  // ─── Calendar View ──────────────────────────
  calendar() {
    const data = Store.get();
    const now = new Date();
    const viewMonth = App._calMonth ?? now.getMonth();
    const viewYear = App._calYear ?? now.getFullYear();
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const monthName = new Date(viewYear, viewMonth).toLocaleString('en', { month: 'long', year: 'numeric' });
    const todayStr = todayKey();

    // Build data maps for the month
    const journalMap = {};
    for (const j of data.journal) { journalMap[j.date] = j; }
    // Vault daily entries
    const vaultJournalMap = {};
    for (const e of (App.vaultDailyEntries || [])) { if (e.date) vaultJournalMap[e.date] = e; }
    const taskMap = {};
    for (const t of data.tasks) {
      if (t.due) { if (!taskMap[t.due]) taskMap[t.due] = []; taskMap[t.due].push(t); }
    }
    // Vault tasks due dates
    const vaultTaskMap = {};
    for (const t of [...(App.vaultTasks?.active||[]), ...(App.vaultTasks?.backlog||[]), ...(App.vaultTasks?.other||[])]) {
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
      const d = new Date(c.created).toISOString().slice(0, 10);
      if (!captureMap[d]) captureMap[d] = [];
      captureMap[d].push(c);
    }

    // Activity streak computation
    const activityDays = new Set();
    for (const j of data.journal) activityDays.add(j.date);
    for (const s of (data.timer?.sessions || [])) activityDays.add(s.date);
    for (const c of data.captures) {
      const d = new Date(c.created).toISOString().slice(0, 10);
      activityDays.add(d);
    }
    for (const e of (App.vaultDailyEntries || [])) activityDays.add(e.date);
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
      const dk = checkDate.toISOString().slice(0, 10);
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
      const todayDk = d.toISOString().slice(0, 10);
      if (!journalMap[todayDk] && !vaultJournalMap[todayDk]) d.setDate(d.getDate() - 1);
      for (let i = 0; i < 365; i++) {
        const dk = d.toISOString().slice(0, 10);
        if (journalMap[dk] || vaultJournalMap[dk]) { journalStreak++; d.setDate(d.getDate() - 1); }
        else break;
      }
    }

    // Habit streak: consecutive days with ≥1 schedule slot checked
    // Grace-for-today: if today has no habit checked, start from yesterday
    const calUserSched = data.strategy?.schedule || [];
    let habitStreak = 0;
    { const d = new Date();
      const todayDk = d.toISOString().slice(0, 10);
      const todayLog = (data.scheduleLog || {})[todayDk] || {};
      if (!calUserSched.some((_, idx) => todayLog['slot-' + idx])) d.setDate(d.getDate() - 1);
      for (let i = 0; i < 365; i++) {
        const dk = d.toISOString().slice(0, 10);
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
    const sel = App._calSelected || todayStr;
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
        <div class="strat-section-label" style="margin-bottom:10px;">${new Date(sel + 'T12:00:00').toLocaleDateString('en', { weekday:'long', month:'long', day:'numeric' })}</div>
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
  },

  // ─── Shortcuts (Help Page) ──────────────────
  shortcuts() {
    const data = Store.get();
    const customTags = data.weeklyReviewTags || ['lesson', 'people', 'food'];

    return `
      <h1 class="view-title">Shortcuts & Guide</h1>
      <p class="view-subtitle">How to use Nexus</p>

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
          ${App.vaultAvailable ? `<span style="color:var(--green);">&#10003; Connected</span> — ${escapeHTML((App.serverConfig || {}).vaultPath || '')}`
            : 'Not connected. Connect your Obsidian vault to enable journaling sync, task sync, and weekly reviews.'}
        </div>
        <div style="display:flex; gap:8px; margin-bottom:8px;">
          <input type="text" id="settings-vault-path" class="strat-settings-input" placeholder="Vault folder path (e.g. D:/Obsidian/My Vault)" style="flex:1;" value="${escapeHTML((App.serverConfig || {}).vaultPath || '')}">
          <button class="btn btn-primary btn-sm" onclick="App.updateVaultPath()">Save</button>
        </div>
        <div style="font-size:12px; color:var(--text-dim); margin-bottom:4px;">Daily journal / rapid log filename:</div>
        <div style="display:flex; gap:8px;">
          <input type="text" id="settings-rapid-log" class="strat-settings-input" placeholder="e.g. Daily Notes.md or 02 Rapid logging.md" style="flex:1;" value="${escapeHTML((App.serverConfig || {}).rapidLogFile || '02 Rapid logging.md')}">
          <button class="btn btn-primary btn-sm" onclick="App.saveRapidLogFile()">Save</button>
        </div>
        <div style="font-size:11px; color:var(--text-dim); margin-top:4px;">The markdown file in your vault used for daily journaling. Each user may have a different filename.</div>
      </div>
    `;
  },

  // ─── Settings (standalone) ──────────────────
  settings() {
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

          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-size:13px; font-weight:600;">Accent Color</div>
              <div style="font-size:11px; color:var(--text-dim);">Primary highlight color throughout the app</div>
            </div>
            <input type="color" value="${accentColor}" style="width:36px; height:36px; border:none; background:none; cursor:pointer; border-radius:8px;"
              onchange="App.setAccentColor(this.value)">
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
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
          <button class="btn btn-primary btn-sm" id="export-btn">&#11015; Export App Data (JSON)</button>
          <button class="btn btn-ghost btn-sm" onclick="App.exportNexusProject()" ${!App.vaultAvailable ? 'disabled title="Connect vault first"' : ''}>
            &#11015; Export nexus_project/ <span style="font-size:10px; color:var(--amber);">&#9888; may be large</span>
          </button>
          <button class="btn btn-ghost btn-sm" onclick="App.exportFullVault()" ${!App.vaultAvailable ? 'disabled title="Connect vault first"' : ''} style="border-color:var(--amber)40;">
            &#11015; Export Full Vault <span style="font-size:10px; color:var(--red);">&#9888; can be GBs</span>
          </button>
        </div>
        <div style="font-size:11px; color:var(--text-dim); margin-bottom:14px;">
          <strong>App Data</strong> = tasks, journal, captures, checklists, settings (small JSON).<br>
          <strong>nexus_project/</strong> = your project checklists as Markdown (small).<br>
          <strong>Full Vault</strong> = your entire linked Obsidian vault folder as a zip. This can be very large — only use if you want a local backup and have enough disk space.
        </div>
        <div style="font-size:12px; font-weight:600; color:var(--text); margin-bottom:6px;">Import / Restore</div>
        <button class="btn btn-ghost btn-sm" id="import-wizard-btn" onclick="App.openImportWizard()">&#9874; Import &amp; Setup Wizard</button>
        <div style="font-size:11px; color:var(--text-dim); margin-top:4px; margin-bottom:14px;">Step-by-step: restore a backup, connect a vault, or set up fresh.</div>
        <div style="border-top:1px solid var(--border); padding-top:12px; margin-top:4px;">
          <div style="font-size:12px; font-weight:600; color:var(--text); margin-bottom:4px;">Onboarding</div>
          <div style="font-size:11px; color:var(--text-dim); margin-bottom:8px;">Re-run the step-by-step setup wizard. Your existing data will not be deleted.</div>
          <button class="btn btn-ghost btn-sm" onclick="App.rerunSetup()">&#9654; Replay Setup Wizard</button>
        </div>
      </div>

      <!-- Import Wizard Modal (rendered inline when active) -->
      ${App._importWizard ? App._renderImportWizard() : ''}
    `;
  }
};

// ── App Controller ─────────────────────────────────
const App = {
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
  weeklyReview: null,
  showShortcutHelp: false,

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
    // Register PWA service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    updateStreak();
    // Apply saved theme + appearance preferences
    const savedData = Store.get();
    const savedTheme = savedData.theme || 'dark';
    if (savedTheme === 'light') document.body.classList.add('light');
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
      const deadline = d.toISOString().slice(0, 7);
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
      const deadlineDefault = (() => { const d = new Date(); d.setMonth(d.getMonth() + 12); return d.toISOString().slice(0,7); })();
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

  bindNav() {
    document.querySelectorAll('#nav-links li').forEach(li => {
      li.addEventListener('click', () => {
        this.currentView = li.dataset.view;
        document.querySelectorAll('#nav-links li').forEach(l => l.classList.remove('active'));
        li.classList.add('active');
        // Close mobile sidebar
        document.getElementById('sidebar')?.classList.remove('open');
        document.getElementById('sidebar-overlay')?.classList.remove('show');
        // Load vault files when entering vault view
        if (li.dataset.view === 'vault' && this.vaultMode === 'browse') {
          this.render();
          this.vaultNavigate(this.vaultPath);
        } else if (li.dataset.view === 'growth' && !this.growthData) {
          this.render();
          VaultAPI.getGrowth().then(data => { this.growthData = data; this.render(); }).catch(() => {});
        } else if (li.dataset.view === 'journal' || li.dataset.view === 'today') {
          this.render();
          this.loadVaultDailyEntries();
        } else {
          this.render();
        }
      });
    });
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
    }
  },

  // ─── Capture Actions ──────────────────────────
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
      // Load last 10 days of entries
      const today = new Date();
      const entries = [];
      for (let i = 0; i < 10; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().slice(0, 10);
        const data = await VaultAPI.getDaily(dateStr);
        if (data.found && data.lines.length > 0) {
          entries.push({ date: data.date, lines: data.lines });
        }
      }
      this.vaultDailyEntries = entries;
      if (this.currentView === 'journal' || this.currentView === 'today') this.render();
    } catch {}
  },

  addJournal() {
    const input = document.getElementById('journal-input');
    const text = input.value.trim();
    if (!text) return;
    updateStreak();
    Store.update(d => d.journal.push({ id: uid(), text, date: todayKey(), created: Date.now() }));
    // Bridge to vault if toggle is on
    const toggle = document.getElementById('journal-vault-toggle');
    if (toggle && toggle.checked) {
      VaultAPI.addDaily(text).then(() => this.loadVaultDailyEntries()).catch(() => {});
    }
    toast('Journal entry saved');
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
        goal.achievedDate = new Date().toISOString().slice(0, 10);
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
      g.achievedDate = g.achievedDate || new Date().toISOString().slice(0, 10);
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
      g.gaveUpDate = new Date().toISOString().slice(0, 10);
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

  jumpToProjectSection(projectId) {
    this.currentView = 'strategy';
    this.strategyTab = 'projects';
    this.strategyProject = projectId;
    this.render();
  },

  setStrategyProject(id) {
    this.strategyProject = id;
    this._projAddOpen = false;
    this.render();
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
          if (c) c.lastVaultSync = new Date().toISOString().slice(0, 10);
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
      a.download = `obsidian_vault_${new Date().toISOString().slice(0,10)}.zip`;
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
      a.download = `nexus_project_${new Date().toISOString().slice(0,10)}.zip`;
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
      const today = new Date().toISOString().slice(0, 10);
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

  hideKnowledgeArea(name) {
    Store.update(d => {
      if (!d.hiddenKnowledgeAreas) d.hiddenKnowledgeAreas = [];
      if (!d.hiddenKnowledgeAreas.includes(name)) d.hiddenKnowledgeAreas.push(name);
      // Also remove from custom if it was custom
      d.customKnowledgeAreas = (d.customKnowledgeAreas || []).filter(n => n !== name);
    });
    this.render();
  },

  addKnowledgeArea(name) {
    if (!name?.trim()) return;
    Store.update(d => {
      if (!d.customKnowledgeAreas) d.customKnowledgeAreas = [];
      if (!d.customKnowledgeAreas.includes(name.trim())) d.customKnowledgeAreas.push(name.trim());
      // Un-hide if it was hidden before
      d.hiddenKnowledgeAreas = (d.hiddenKnowledgeAreas || []).filter(n => n !== name.trim());
    });
    this.render();
    setTimeout(() => { const el = document.getElementById('new-area-input'); if (el) el.value = ''; }, 0);
  },

  resetHiddenAreas() {
    Store.update(d => { d.hiddenKnowledgeAreas = []; });
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
    const weekStr = weekAgo.toISOString().slice(0, 10);

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
    const time = timeInput?.value.trim();
    const activity = actInput?.value.trim();
    if (!time || !activity) return;
    Store.update(d => {
      if (!d.strategy.schedule) d.strategy.schedule = [...WEEKLY_TEMPLATE];
      d.strategy.schedule.push({ time, activity, stream: null });
      d.strategy.schedule.sort((a, b) => a.time.localeCompare(b.time));
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
      return last.toISOString().slice(0, 10) <= today;
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

  // ─── Habit Drag Reorder ─────────────────────
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
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.innerHTML = newTheme === 'dark' ? '&#9788;' : '&#9790;';
    this.render();
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
      const date = c.created ? new Date(c.created).toISOString().slice(0, 10) : '?';
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
  addCapture() {
    const input = document.getElementById('capture-input');
    const text = input.value.trim();
    if (!text) return;
    Store.update(d => d.captures.push({ id: uid(), text, created: Date.now() }));
    // Bridge to vault — save to Quick Captures file
    const toggle = document.getElementById('capture-vault-toggle');
    if (toggle && toggle.checked) {
      VaultAPI.addCapture(text).catch(() => {});
    }
    toast('Captured');
    this.render();
  },
};

// ── Keyboard Shortcuts ────────────────────────────
// All shortcuts require Ctrl+Shift+ to prevent accidental activation.
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
  if (e.metaKey || e.altKey) return;

  // Ctrl+Shift+letter shortcuts
  if (!e.ctrlKey || !e.shiftKey) return;
  e.preventDefault();

  const key = e.key.toLowerCase();
  if (key === 'c') {
    document.querySelector('[data-view="capture"]')?.click();
    setTimeout(() => document.getElementById('capture-input')?.focus(), 50);
  } else if (key === 't') {
    document.querySelector('[data-view="tasks"]')?.click();
    setTimeout(() => document.getElementById('task-input')?.focus(), 50);
  } else if (key === 'j') {
    document.querySelector('[data-view="journal"]')?.click();
    setTimeout(() => document.getElementById('journal-input')?.focus(), 50);
  } else if (key === 'd') {
    document.querySelector('[data-view="dashboard"]')?.click();
  } else if (key === 'y') {
    document.querySelector('[data-view="today"]')?.click();
  } else if (key === 'v') {
    document.querySelector('[data-view="vault"]')?.click();
  } else if (key === 'g') {
    document.querySelector('[data-view="strategy"]')?.click();
  } else if (key === 's') {
    App.currentView = 'search'; App.render();
    setTimeout(() => document.getElementById('search-input')?.focus(), 50);
  } else if (key === 'f') {
    App.toggleFocusMode();
  } else if (key === '/') {
    document.querySelector('[data-view="vault"]')?.click();
    setTimeout(() => document.getElementById('vault-search')?.focus(), 50);
  } else if (key === '?') {
    App.showShortcutHelp = !App.showShortcutHelp;
    App.render();
  }
});

// ── Boot ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => App.init());
