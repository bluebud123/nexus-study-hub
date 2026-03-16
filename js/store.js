// ═══════════════════════════════════════════════════
//  Nexus — Data Store
// ═══════════════════════════════════════════════════
import { DEFAULT_MILESTONES, DEFAULT_ALLOC, WEEKLY_TEMPLATE, localDateKey, toast } from './utils.js';

export const Store = {
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

    // ── Data validation: ensure arrays are arrays, objects are objects ──
    const arrayFields = ['captures', 'tasks', 'journal', 'goals', 'checklists', 'mcqScores', 'topics'];
    for (const f of arrayFields) {
      if (!Array.isArray(merged[f])) merged[f] = defaults[f] || [];
    }
    if (!merged.streak || typeof merged.streak !== 'object') merged.streak = defaults.streak;
    if (!merged.habits || typeof merged.habits !== 'object') merged.habits = defaults.habits;
    if (!Array.isArray(merged.habits.definitions)) merged.habits.definitions = [];
    if (!merged.habits.log || typeof merged.habits.log !== 'object') merged.habits.log = {};
    if (!Array.isArray(merged.strategy.schedule)) merged.strategy.schedule = defaults.strategy.schedule;
    if (!Array.isArray(merged.strategy.projects)) merged.strategy.projects = [];

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
      toast('Could not connect to server — running with defaults');
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
    } catch {
      toast('Could not save — will retry');
    }
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
    a.download = `nexus-backup-${localDateKey()}.json`;
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
        window.App?.render();
      } catch {
        alert('Invalid file format.');
      }
    };
    reader.readAsText(file);
  }
};
