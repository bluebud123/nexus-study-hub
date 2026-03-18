// ═══════════════════════════════════════════════════
//  Nexus — Utility Functions & Constants
// ═══════════════════════════════════════════════════

// ── ID & Time Helpers ─────────────────────────────
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function timeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function formatDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
  });
}

export function contrastColor(hex) {
  if (!hex || hex.startsWith('var(')) return '#fff';
  const c = hex.replace('#', '');
  const r = parseInt(c.substr(0, 2), 16) || 0;
  const g = parseInt(c.substr(2, 2), 16) || 0;
  const b = parseInt(c.substr(4, 2), 16) || 0;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.55 ? '#1a1a2e' : '#ffffff';
}

export function formatTime(t) {
  if (!t || t === 'Anytime') return null;
  if (!/^\d{1,2}:\d{2}$/.test(t)) return t;
  const [h, m] = t.split(':').map(Number);
  const d = new Date(); d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function localDateKey(date) {
  const d = date || new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function todayKey() {
  return localDateKey(new Date());
}

export function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

// ── Month/Roadmap Helpers ─────────────────────────
export function addMonths(yyyymm, n) {
  const [y, m] = yyyymm.split('-').map(Number);
  let nm = (m - 1 + n) % 12;
  const ny = y + Math.floor((m - 1 + n) / 12);
  if (nm < 0) { nm += 12; }
  return ny + '-' + String(nm + 1).padStart(2, '0');
}

export function curMonthKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

export function monthLabel(key) {
  if (!key || !key.includes('-')) return key;
  const [y, m] = key.split('-').map(Number);
  const shortName = new Date(y, m - 1, 1).toLocaleString(undefined, { month: 'short' });
  const curYear = new Date().getFullYear();
  return shortName + (y !== curYear ? " '" + String(y).slice(2) : '');
}

export function getRoadmapMonths(strategy, checklists) {
  const cur = curMonthKey();
  const start = strategy.roadmapStart || addMonths(cur, -2);
  let end = strategy.roadmapEnd || addMonths(cur, 6);
  for (const cl of (checklists || [])) {
    if (cl.deadline) {
      const dlMonth = cl.deadline.slice(0, 7);
      if (dlMonth > end) end = dlMonth;
    }
  }
  const months = [];
  let k = start;
  let guard = 0;
  while (k <= end && guard++ < 60) {
    months.push({ key: k, label: monthLabel(k) });
    k = addMonths(k, 1);
  }
  return months;
}

// ── Greetings ─────────────────────────────────────
const GREETINGS = [
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
  "Burning the midnight oil{n}? Make it count.",
  "Late night study session{n}? Proud of your dedication.",
  "Hey{n}, night owls get things done too. Keep going.",
  "Working late{n}? Remember to take breaks \u2014 you matter.",
  "The night is yours{n}. Deep focus awaits.",
  "Still going{n}? That\u2019s the spirit. One more session.",
  "Hey{n}, night mode activated. Let\u2019s get things done.",
  "The dedicated ones study while others sleep{n}.",
  "Late night clarity{n} \u2014 the best insights come in the quiet.",
  "Welcome back{n}. Every session brings you closer.",
  "Hello{n}. You showed up \u2014 that\u2019s already a win.",
  "Hey there{n}. Let\u2019s make today count.",
  "Welcome back{n}. Your future self will thank you for this.",
  "Hello{n}. Focus on progress, not perfection.",
];

export function getGreeting(userName) {
  const h = new Date().getHours();
  const d = new Date().getDate();
  const n = userName ? `, ${userName}` : '';
  let pool;
  if (h >= 6 && h < 12)       pool = GREETINGS.slice(0, 12);
  else if (h >= 12 && h < 17) pool = GREETINGS.slice(12, 24);
  else if (h >= 17 && h < 21) pool = GREETINGS.slice(24, 36);
  else                         pool = GREETINGS.slice(36, 45);
  const msg = pool[d % pool.length];
  return msg.replace('{n}', n);
}

// ── Constants ─────────────────────────────────────
export const DEFAULT_ALLOC = {};
export const DEFAULT_MILESTONES = {};
export const WEEKLY_TEMPLATE = [
  { time: '6:00 AM', activity: 'Review flashcards / quick MCQs (30 min)', stream: 'exam' },
  { time: '7:00 AM', activity: 'Clinical duties at NOCERAL', stream: null },
  { time: '5:00 PM', activity: 'Focused study block (2-3 hrs)', stream: 'exam' },
  { time: '8:00 PM', activity: 'Secondary stream work (1-1.5 hrs)', stream: 'flex' },
  { time: '9:30 PM', activity: 'Light review / next day planning', stream: 'exam' },
];

// ── Markdown Rendering ───────────────────────────
export function preprocessObsidian(md) {
  md = md.replace(/```dataviewjs[\s\S]*?```/g, '<div class="vault-info-block">Dataview query — view in Obsidian</div>');
  md = md.replace(/```tasks[\s\S]*?```/g, '<div class="vault-info-block">Tasks query — view in Obsidian</div>');
  md = md.replace(/\s+\^[a-zA-Z0-9]+$/gm, '');
  md = md.replace(/!\[\[([^\]]+)\]\]/g, '<div class="vault-info-block">Embedded: $1</div>');
  md = md.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '<a class="wikilink" onclick="App.openVaultFile(\'$1\')">$2</a>');
  md = md.replace(/\[\[([^\]#]+)#([^\]]+)\]\]/g, '<a class="wikilink" onclick="App.openVaultFile(\'$1\')">$1 &rsaquo; $2</a>');
  md = md.replace(/\[\[([^\]]+)\]\]/g, '<a class="wikilink" onclick="App.openVaultFile(\'$1\')">$1</a>');
  md = md.replace(/(^|\s)#([a-zA-Z]\w*)/gm, '$1<span class="vault-tag" onclick="App.vaultSearchByTag(\'$2\')">#$2</span>');
  md = md.replace(/~~(.*?)~~/g, '<del>$1</del>');
  md = md.replace(/^(\s*)- \[-\]\s+(.*)/gm, '$1<li class="task-cancelled"><input type="checkbox" disabled> <del>$2</del></li>');
  return md;
}

export function renderMarkdown(raw) {
  const preprocessed = preprocessObsidian(raw);
  if (typeof marked !== 'undefined') {
    return marked.parse(preprocessed);
  }
  return '<pre>' + escapeHTML(raw) + '</pre>';
}

// ── Streak & Checklist Helpers ────────────────────
export function updateStreak(Store) {
  Store.update(data => {
    const today = todayKey();
    if (data.streak.lastDate === today) return;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yKey = localDateKey(yesterday);
    if (data.streak.lastDate === yKey) {
      data.streak.count++;
    } else if (data.streak.lastDate !== today) {
      data.streak.count = 1;
    }
    data.streak.lastDate = today;
  });
}

export function parseChecklistMD(text, fallbackName) {
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

// ── Colour Palette ────────────────────────────────
// Curated set of 24 colours: 12 muted/professional + 12 vivid/expressive
export const COLOUR_PALETTE = [
  // Row 1 — muted / professional
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#0ea5e9', '#64748b', '#78716c',
  // Row 2 — vivid / expressive
  '#a855f7', '#e879f9', '#fb7185', '#fb923c',
  '#facc15', '#4ade80', '#34d399', '#22d3ee',
  '#60a5fa', '#818cf8', '#f472b6', '#fbbf24',
];
