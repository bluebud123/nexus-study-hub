// ═══════════════════════════════════════════════════
//  Nexus — Vault API Client
// ═══════════════════════════════════════════════════

export const VaultAPI = {
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
