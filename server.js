// ═══════════════════════════════════════════════════
//  Nexus Server — Static files + Vault API
// ═══════════════════════════════════════════════════
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const CONFIG = {
  port: process.env.PORT ? parseInt(process.env.PORT) : 3456,
  vaultPath: '',
  useVault: false,
  staticDir: __dirname,
  rapidLogFile: '02 Rapid logging.md',
  monthlyLogFile: '03 Monthly log.md',
  captureFile: '04 Quick captures.md',
  weeklyReviewFile: '05 Weekly Reviews.md',
};

// Load saved config from nexus-config.json
const CONFIG_FILE = path.join(__dirname, 'nexus-config.json');
try {
  const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  if (saved.vaultPath) CONFIG.vaultPath = saved.vaultPath;
  if (saved.useVault !== undefined) CONFIG.useVault = saved.useVault;
  if (saved.rapidLogFile) CONFIG.rapidLogFile = saved.rapidLogFile;
  if (saved.captureFile) CONFIG.captureFile = saved.captureFile;
  if (saved.weeklyReviewFile) CONFIG.weeklyReviewFile = saved.weeklyReviewFile;
} catch {}

function saveConfig() {
  const toSave = { vaultPath: CONFIG.vaultPath, useVault: CONFIG.useVault, setupComplete: true, rapidLogFile: CONFIG.rapidLogFile };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(toSave, null, 2), 'utf8');
}

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

// ── Write Lock ────────────────────────────────────
let writeLock = false;
async function withWriteLock(fn) {
  while (writeLock) await new Promise(r => setTimeout(r, 50));
  writeLock = true;
  try { return await fn(); } finally { writeLock = false; }
}

// ── Helpers ───────────────────────────────────────
function safePath(rel) {
  const resolved = path.resolve(CONFIG.vaultPath, rel);
  if (!resolved.startsWith(path.resolve(CONFIG.vaultPath))) return null;
  return resolved;
}

function jsonRes(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

function errRes(res, msg, status = 400) {
  jsonRes(res, { error: msg }, status);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 5e6) reject(new Error('Too large')); });
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch { reject(new Error('Invalid JSON')); } });
  });
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ── Nexus Data Store (single nexus-data.json) ──────
const NEXUS_DATA_FILE = path.join(__dirname, 'nexus-data.json');
const NEXUS_BACKUP_DIR = path.join(__dirname, 'backups');

async function nexusBestBackup() {
  try {
    const files = await fs.promises.readdir(NEXUS_BACKUP_DIR);
    let best = null, bestSize = 0;
    for (const f of files.filter(f => f.endsWith('.json'))) {
      const fp = path.join(NEXUS_BACKUP_DIR, f);
      const stat = await fs.promises.stat(fp);
      if (stat.size > bestSize) { bestSize = stat.size; best = fp; }
    }
    return best;
  } catch { return null; }
}

async function nexusDataRead() {
  try {
    const stat = await fs.promises.stat(NEXUS_DATA_FILE);
    if (stat.size < 10000) {
      // Suspiciously small — restore from best backup
      const backup = await nexusBestBackup();
      if (backup) {
        const raw = await fs.promises.readFile(backup, 'utf8');
        await fs.promises.writeFile(NEXUS_DATA_FILE, raw, 'utf8');
        console.log(`[nexus] Auto-restored from ${path.basename(backup)} (${stat.size}B → ${raw.length}B)`);
        return JSON.parse(raw);
      }
    }
    return JSON.parse(await fs.promises.readFile(NEXUS_DATA_FILE, 'utf8'));
  } catch {
    const backup = await nexusBestBackup();
    if (backup) {
      try {
        const raw = await fs.promises.readFile(backup, 'utf8');
        await fs.promises.writeFile(NEXUS_DATA_FILE, raw, 'utf8');
        return JSON.parse(raw);
      } catch {}
    }
    return null;
  }
}

async function nexusDataWrite(data) {
  await withWriteLock(async () => {
    const tmp = NEXUS_DATA_FILE + '.tmp';
    await fs.promises.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
    await fs.promises.rename(tmp, NEXUS_DATA_FILE);
  });
  // Hourly auto-backup in backups/
  try {
    await fs.promises.mkdir(NEXUS_BACKUP_DIR, { recursive: true });
    const backupName = `nexus-data-${new Date().toISOString().slice(0, 13)}.json`;
    const backupFile = path.join(NEXUS_BACKUP_DIR, backupName);
    try { await fs.promises.access(backupFile); } catch {
      const tmp = backupFile + '.tmp';
      await fs.promises.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
      await fs.promises.rename(tmp, backupFile);
      // Keep last 10
      const files = (await fs.promises.readdir(NEXUS_BACKUP_DIR))
        .filter(f => f.startsWith('nexus-data-') && f.endsWith('.json')).sort().reverse();
      for (const old of files.slice(10)) await fs.promises.unlink(path.join(NEXUS_BACKUP_DIR, old)).catch(() => {});
    }
  } catch {}
}

// ── Tag Extraction ────────────────────────────────
function extractTags(content) {
  const tags = {};
  let inCode = false;
  for (const line of content.split('\n')) {
    if (line.trim().startsWith('```')) { inCode = !inCode; continue; }
    if (inCode) continue;
    const matches = line.match(/(?:^|\s)#([a-zA-Z]\w*)/g);
    if (matches) {
      for (const m of matches) {
        const tag = m.trim().slice(1).toLowerCase();
        tags[tag] = (tags[tag] || 0) + 1;
      }
    }
  }
  return tags;
}

// ── Daily Entry Parser ────────────────────────────
const DATE_HEADER = /^(?:####\s+)?(\d{4}-\d{2}-\d{2})\s*$/;

function parseDailyEntries(content) {
  const entries = [];
  let currentDate = null;
  let currentLines = [];

  for (const line of content.split('\n')) {
    const m = line.match(DATE_HEADER);
    if (m) {
      if (currentDate) entries.push({ date: currentDate, lines: currentLines });
      currentDate = m[1];
      currentLines = [];
    } else if (currentDate) {
      currentLines.push(line);
    }
  }
  if (currentDate) entries.push({ date: currentDate, lines: currentLines });
  return entries;
}

function parseTasks(content) {
  const tasks = [];
  const lines = content.split('\n');
  for (const line of lines) {
    const unchecked = line.match(/^[\s]*-\s+\[\s\]\s+(.*)/);
    const checked = line.match(/^[\s]*-\s+\[x\]\s+(.*)/i);
    if (unchecked) tasks.push({ text: unchecked[1].trim(), done: false });
    else if (checked) tasks.push({ text: checked[1].trim(), done: true });
  }
  return tasks;
}

// ── Rich Task Parser (Obsidian Tasks Plugin) ─────
function parseTasksRich(content, sourceFile) {
  const tasks = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const unchecked = line.match(/^([\s]*)-\s+\[\s\]\s+(.*)/);
    const checked = line.match(/^([\s]*)-\s+\[x\]\s+(.*)/i);
    if (!unchecked && !checked) continue;

    const done = !!checked;
    const indent = (unchecked || checked)[1].length;
    let raw = (unchecked || checked)[2].trim();

    // Extract metadata
    const dueMatch = raw.match(/\u{1F4C5}\s*(\d{4}-\d{2}-\d{2})/u);
    const doneMatch = raw.match(/\u2705\s*(\d{4}-\d{2}-\d{2})/u);
    const scheduledMatch = raw.match(/\u23F3\s*(\d{4}-\d{2}-\d{2})/u);
    const createdMatch = raw.match(/\u2795\s*(\d{4}-\d{2}-\d{2})/u);

    // Priority
    let priority = 'normal';
    if (/\u23EB/u.test(raw)) priority = 'highest';
    else if (/\u{1F53C}/u.test(raw)) priority = 'high';
    else if (/\u{1F53D}/u.test(raw)) priority = 'low';
    else if (/\u23EC/u.test(raw)) priority = 'lowest';

    // Extract tags
    const tagMatches = raw.match(/(^|\s)#([a-zA-Z]\w*)/g) || [];
    const tags = tagMatches.map(m => m.trim().slice(1).toLowerCase());

    // Clean display text: remove emoji metadata but keep tags
    let text = raw
      .replace(/\u{1F4C5}\s*\d{4}-\d{2}-\d{2}/gu, '')
      .replace(/\u2705\s*\d{4}-\d{2}-\d{2}/gu, '')
      .replace(/\u23F3\s*\d{4}-\d{2}-\d{2}/gu, '')
      .replace(/\u2795\s*\d{4}-\d{2}-\d{2}/gu, '')
      .replace(/[\u23EB\u23EC]/gu, '')
      .replace(/[\u{1F53C}\u{1F53D}]/gu, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    tasks.push({
      text,
      done,
      dueDate: dueMatch ? dueMatch[1] : null,
      doneDate: doneMatch ? doneMatch[1] : null,
      scheduledDate: scheduledMatch ? scheduledMatch[1] : null,
      createdDate: createdMatch ? createdMatch[1] : null,
      priority,
      tags,
      source: sourceFile,
      line: i + 1,
      indent,
    });
  }
  return tasks;
}

// ── Vault Tasks Aggregator ───────────────────────
async function aggregateVaultTasks() {
  const vp = CONFIG.vaultPath;
  const allTasks = [];

  async function walk(dir, rel) {
    const items = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const item of items) {
      if (item.name.startsWith('.')) continue;
      const full = path.join(dir, item.name);
      const relPath = rel ? rel + '/' + item.name : item.name;
      if (item.isDirectory()) {
        await walk(full, relPath);
      } else if (item.name.endsWith('.md')) {
        // Skip the task management file itself (it only has queries)
        if (item.name === '00 Task management.md') continue;
        const content = await fs.promises.readFile(full, 'utf8');
        const tasks = parseTasksRich(content, relPath);
        allTasks.push(...tasks);
      }
    }
  }

  await walk(vp, '');

  // Group by category matching "00 Task management.md" queries
  const active = allTasks.filter(t => !t.done && t.tags.includes('active'));
  const exam = allTasks.filter(t => !t.done && t.tags.includes('exam'));
  const backlog = allTasks.filter(t => !t.done && t.tags.length === 0);
  const archived = allTasks.filter(t => t.done);
  // Other: not done, has tags but not #active or #exam
  const other = allTasks.filter(t => !t.done && t.tags.length > 0 && !t.tags.includes('active') && !t.tags.includes('exam'));

  // Sort: active by due date, archived by done date (recent first)
  const sortByDue = (a, b) => {
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return 0;
  };
  active.sort(sortByDue);
  exam.sort(sortByDue);
  backlog.sort(sortByDue);
  other.sort(sortByDue);
  archived.sort((a, b) => {
    if (a.doneDate && b.doneDate) return b.doneDate.localeCompare(a.doneDate);
    return 0;
  });

  return {
    active,
    exam,
    backlog,
    other,
    archived: archived.slice(0, 50), // Limit archived to recent 50
    summary: {
      total: allTasks.length,
      done: archived.length,
      pending: allTasks.length - archived.length,
      activeCount: active.length,
      examCount: exam.length,
      backlogCount: backlog.length,
      otherCount: other.length,
    },
  };
}

// ── Vault Stats ───────────────────────────────────
async function computeStats() {
  const vp = CONFIG.vaultPath;
  let totalFiles = 0;
  let allTags = {};
  let totalTasks = 0;
  let completedTasks = 0;
  let wikilinks = 0;

  async function walk(dir) {
    const items = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const item of items) {
      if (item.name.startsWith('.')) continue;
      const full = path.join(dir, item.name);
      if (item.isDirectory()) {
        await walk(full);
      } else if (item.name.endsWith('.md')) {
        totalFiles++;
        const content = await fs.promises.readFile(full, 'utf8');
        const tags = extractTags(content);
        for (const [t, c] of Object.entries(tags)) allTags[t] = (allTags[t] || 0) + c;
        const tasks = parseTasks(content);
        totalTasks += tasks.length;
        completedTasks += tasks.filter(t => t.done).length;
        const wl = content.match(/\[\[[^\]]+\]\]/g);
        if (wl) wikilinks += wl.length;
      }
    }
  }

  await walk(vp);

  // Parse rapid log for daily stats
  let dailyEntries = [];
  try {
    const rapidContent = await fs.promises.readFile(path.join(vp, CONFIG.rapidLogFile), 'utf8');
    dailyEntries = parseDailyEntries(rapidContent);
  } catch {}

  const dates = dailyEntries.map(e => e.date).sort();
  const now = new Date();
  const thisWeekStart = new Date(now);
  thisWeekStart.setDate(now.getDate() - now.getDay());
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  return {
    totalFiles,
    totalDailyEntries: dailyEntries.length,
    dailyDates: dailyEntries.map(e => e.date).filter(Boolean),
    dateRange: { first: dates[0] || null, last: dates[dates.length - 1] || null },
    totalTasks,
    completedTasks,
    pendingTasks: totalTasks - completedTasks,
    tagCounts: allTags,
    wikilinks,
    entriesThisWeek: dailyEntries.filter(e => new Date(e.date) >= thisWeekStart).length,
    entriesThisMonth: dailyEntries.filter(e => new Date(e.date) >= thisMonthStart).length,
  };
}

// ── Weekly Review ─────────────────────────────────
async function computeWeeklyReview(customTags) {
  const vp = CONFIG.vaultPath;
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = weekAgo.toISOString().slice(0, 10);
  const todayStr2 = today.toISOString().slice(0, 10);

  // Default tag sections + any custom ones
  const sectionTags = ['lesson', 'people', 'food', ...(customTags || [])];
  const uniqueTags = [...new Set(sectionTags)];

  // Parse rapid log for this week's entries
  let weekEntries = [];
  let weekTags = {};
  const tagSections = {};  // { tagName: [{date, text}] }
  for (const t of uniqueTags) tagSections[t] = [];
  let totalWords = 0;
  let daysLogged = 0;
  try {
    const content = await fs.promises.readFile(path.join(vp, CONFIG.rapidLogFile), 'utf8');
    const allEntries = parseDailyEntries(content);
    weekEntries = allEntries.filter(e => e.date >= weekAgoStr && e.date <= todayStr2);
    daysLogged = weekEntries.length;
    for (const entry of weekEntries) {
      const text = entry.lines.join('\n');
      totalWords += text.split(/\s+/).filter(w => w).length;
      const tags = extractTags(text);
      for (const [t, c] of Object.entries(tags)) {
        weekTags[t] = (weekTags[t] || 0) + c;
      }
      for (const line of entry.lines) {
        for (const tag of uniqueTags) {
          const re = new RegExp(`#${tag}\\b`, 'i');
          if (re.test(line)) {
            tagSections[tag].push({ date: entry.date, text: line.replace(/^[\s\-*]+/, '').replace(/#\w+/g, '').trim() });
          }
        }
      }
    }
  } catch {}

  // Tasks completed this week
  let tasksCompleted = 0;
  let tasksCreated = 0;
  try {
    const vaultTasks = await aggregateVaultTasks();
    const allTasks = [...(vaultTasks.archived || [])];
    tasksCompleted = allTasks.filter(t => t.doneDate && t.doneDate >= weekAgoStr).length;
    const pending = [...(vaultTasks.active || []), ...(vaultTasks.exam || []), ...(vaultTasks.backlog || []), ...(vaultTasks.other || [])];
    tasksCreated = pending.length + tasksCompleted; // approximate
  } catch {}

  // Top tags sorted by count
  const topTags = Object.entries(weekTags)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }));

  // Highlights: longest entry, most active day
  let mostActiveDay = null;
  let mostActiveLines = 0;
  for (const e of weekEntries) {
    if (e.lines.length > mostActiveLines) {
      mostActiveLines = e.lines.length;
      mostActiveDay = e.date;
    }
  }

  return {
    weekStart: weekAgoStr,
    weekEnd: todayStr2,
    daysLogged,
    totalWords,
    tasksCompleted,
    topTags,
    tagSections,
    mostActiveDay,
    mostActiveLines,
    entryCount: weekEntries.length,
  };
}

// ── Growth Metrics ────────────────────────────────
async function computeGrowth() {
  const vp = CONFIG.vaultPath;

  // Clinical cases by month
  const clinicalCases = {};
  const files = await fs.promises.readdir(vp);
  for (const f of files) {
    if (/^(Long|Short)\s+case/i.test(f) && f.endsWith('.md')) {
      const dateMatch = f.match(/(\d{6})/);
      if (dateMatch) {
        const d = dateMatch[1];
        const month = '20' + d.slice(0, 2) + '-' + d.slice(2, 4);
        clinicalCases[month] = (clinicalCases[month] || 0) + 1;
      }
    }
  }

  // Parse rapid log
  let dailyEntries = [];
  let lessons = [];
  let tagTrends = {};
  let loggingDays = [];
  try {
    const rapidContent = await fs.promises.readFile(path.join(vp, CONFIG.rapidLogFile), 'utf8');
    dailyEntries = parseDailyEntries(rapidContent);
    loggingDays = dailyEntries.map(e => e.date);

    for (const entry of dailyEntries) {
      const month = entry.date.slice(0, 7);
      const text = entry.lines.join('\n');
      const tags = extractTags(text);
      for (const [t, c] of Object.entries(tags)) {
        if (!tagTrends[t]) tagTrends[t] = {};
        tagTrends[t][month] = (tagTrends[t][month] || 0) + c;
      }
      // Extract lessons
      for (const line of entry.lines) {
        if (/#lesson/i.test(line)) {
          lessons.push({ date: entry.date, text: line.replace(/^[\s\-*]+/, '').replace(/#\w+/g, '').trim() });
        }
      }
    }
  } catch {}

  // Also include app captures in tag trends
  try {
    const storeRaw = await fs.promises.readFile(path.join(__dirname, 'nexus-data.json'), 'utf8');
    const store = JSON.parse(storeRaw);
    for (const cap of (store.captures || [])) {
      if (!cap.text || !cap.created) continue;
      const month = new Date(cap.created).toISOString().slice(0, 7);
      const tags = extractTags(cap.text);
      for (const [t, c] of Object.entries(tags)) {
        if (!tagTrends[t]) tagTrends[t] = {};
        tagTrends[t][month] = (tagTrends[t][month] || 0) + c;
      }
    }
  } catch {}

  // Writing volume by month
  const writingVolume = {};
  for (const entry of dailyEntries) {
    const month = entry.date.slice(0, 7);
    const words = entry.lines.join(' ').split(/\s+/).filter(w => w).length;
    if (!writingVolume[month]) writingVolume[month] = { words: 0, lines: 0 };
    writingVolume[month].words += words;
    writingVolume[month].lines += entry.lines.length;
  }

  // Knowledge areas from file names
  const knowledgeAreas = {};
  const allFiles = await fs.promises.readdir(vp, { withFileTypes: true });
  for (const f of allFiles) {
    if (!f.name.endsWith('.md')) continue;
    let area = 'General';
    const n = f.name.toLowerCase();
    if (/long case|short case|scoliosis|spine|hip|knee|shoulder|ankle|dfu|fracture/.test(n)) area = 'Clinical Cases';
    else if (/project|scoliox|model|label.?studio|sam/.test(n)) area = 'AI/Tech Projects';
    else if (/exam|viva|mcq|quiz/.test(n)) area = 'Exam Prep';
    else if (/travel|vietnam|bangkok|japan|hong.?kong/.test(n)) area = 'Travel';
    else if (/cash|stock|bill|fund/.test(n)) area = 'Finance';
    else if (/exercise|gym|food/.test(n)) area = 'Health';
    else if (/rapid|monthly|mental|index|journal|goal|gratitude/.test(n)) area = 'Personal System';

    const stat = await fs.promises.stat(path.join(vp, f.name));
    if (!knowledgeAreas[area]) knowledgeAreas[area] = { fileCount: 0, lastUpdated: null };
    knowledgeAreas[area].fileCount++;
    const mod = stat.mtime.toISOString().slice(0, 10);
    if (!knowledgeAreas[area].lastUpdated || mod > knowledgeAreas[area].lastUpdated) {
      knowledgeAreas[area].lastUpdated = mod;
    }
  }

  // Streak computation
  const sortedDays = [...loggingDays].sort().reverse();
  let currentStreak = 0;
  let longestStreak = 0;
  if (sortedDays.length > 0) {
    let streak = 1;
    let maxStreak = 1;
    const today = todayStr();
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);
    if (sortedDays[0] === today || sortedDays[0] === yesterdayStr) {
      currentStreak = 1;
      for (let i = 1; i < sortedDays.length; i++) {
        const prev = new Date(sortedDays[i - 1]);
        const curr = new Date(sortedDays[i]);
        const diff = (prev - curr) / 864e5;
        if (Math.round(diff) === 1) { currentStreak++; } else break;
      }
    }
    for (let i = 1; i < sortedDays.length; i++) {
      const prev = new Date(sortedDays[i - 1]);
      const curr = new Date(sortedDays[i]);
      const diff = (prev - curr) / 864e5;
      if (Math.round(diff) === 1) { streak++; maxStreak = Math.max(maxStreak, streak); }
      else { streak = 1; }
    }
    longestStreak = Math.max(maxStreak, currentStreak);
  }

  return {
    clinicalCases: Object.entries(clinicalCases).map(([month, count]) => ({ month, count })).sort((a, b) => a.month.localeCompare(b.month)),
    lessons: lessons.slice(-50),
    tagTrends,
    writingVolume: Object.entries(writingVolume).map(([month, v]) => ({ month, ...v })).sort((a, b) => a.month.localeCompare(b.month)),
    loggingDays,
    knowledgeAreas: Object.entries(knowledgeAreas).map(([area, v]) => ({ area, ...v })).sort((a, b) => b.fileCount - a.fileCount),
    currentStreak,
    longestStreak,
  };
}

// ── Suggestions ───────────────────────────────────
async function computeSuggestions() {
  const suggestions = [];
  const vp = CONFIG.vaultPath;
  const today = todayStr();

  try {
    const rapidContent = await fs.promises.readFile(path.join(vp, CONFIG.rapidLogFile), 'utf8');
    const entries = parseDailyEntries(rapidContent);

    // Missing today's entry?
    const hasToday = entries.some(e => e.date === today);
    if (!hasToday) {
      suggestions.push({ icon: '\u270D\uFE0F', text: "You haven't logged today yet. What happened?", action: 'log' });
    }

    // Stale tasks
    const allTasks = [];
    for (const entry of entries) {
      for (const line of entry.lines) {
        if (/^\s*-\s+\[\s\]/.test(line)) {
          allTasks.push({ date: entry.date, text: line.replace(/^[\s\-]*\[\s\]\s*/, '').trim() });
        }
      }
    }
    const staleCount = allTasks.filter(t => {
      const age = (new Date(today) - new Date(t.date)) / 864e5;
      return age > 7;
    }).length;
    if (staleCount > 0) {
      suggestions.push({ icon: '\u23F3', text: `${staleCount} vault tasks are older than 7 days. Time for migration review?`, action: 'review_tasks' });
    }

    // Logging streak
    const sortedDates = entries.map(e => e.date).sort().reverse();
    let streak = 0;
    if (sortedDates.length > 0) {
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      if (sortedDates[0] === today || sortedDates[0] === yesterday.toISOString().slice(0, 10)) {
        streak = 1;
        for (let i = 1; i < sortedDates.length; i++) {
          const diff = (new Date(sortedDates[i - 1]) - new Date(sortedDates[i])) / 864e5;
          if (diff === 1) streak++; else break;
        }
      }
    }
    if (streak >= 3) {
      suggestions.push({ icon: '\uD83D\uDD25', text: `${streak}-day logging streak! Keep the momentum.`, action: null });
    }

    // Monthly review
    const dayOfMonth = new Date().getDate();
    if (dayOfMonth >= 28) {
      suggestions.push({ icon: '\uD83D\uDCCB', text: "End of month approaching. Time for a monthly reflection?", action: 'monthly_review' });
    }

    // Tag velocity
    const thisMonth = today.slice(0, 7);
    const lastMonthDate = new Date(); lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
    const lastMonth = lastMonthDate.toISOString().slice(0, 7);
    let thisExam = 0, lastExam = 0, thisCases = 0;
    for (const entry of entries) {
      const m = entry.date.slice(0, 7);
      const text = entry.lines.join('\n');
      if (m === thisMonth) {
        thisExam += (text.match(/#exam/gi) || []).length;
        thisCases += entry.lines.filter(l => /\[\[.*case/i.test(l)).length;
      } else if (m === lastMonth) {
        lastExam += (text.match(/#exam/gi) || []).length;
      }
    }
    if (thisExam > lastExam && lastExam > 0) {
      suggestions.push({ icon: '\uD83D\uDCC8', text: `Exam prep intensifying: ${thisExam} entries vs ${lastExam} last month.`, action: null });
    }
    if (thisCases > 0) {
      suggestions.push({ icon: '\uD83C\uDFE5', text: `${thisCases} clinical cases logged this month. Your exposure is growing.`, action: null });
    }

  } catch {}

  return suggestions;
}

// ── API Router ────────────────────────────────────
async function handleAPI(req, res, pathname, query) {
  const method = req.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  try {
    // Guard: vault APIs require vault to be enabled
    if (pathname.startsWith('/api/vault/') && (!CONFIG.useVault || !CONFIG.vaultPath)) {
      return jsonRes(res, { error: 'Vault not configured', vaultDisabled: true });
    }

    // ── List Files ──
    if (pathname === '/api/vault/files' && method === 'GET') {
      const rel = query.path || '';
      const full = safePath(rel);
      if (!full) return errRes(res, 'Invalid path', 403);

      const items = await fs.promises.readdir(full, { withFileTypes: true });
      const files = [];
      for (const item of items) {
        if (item.name.startsWith('.')) continue;
        const itemPath = path.join(full, item.name);
        const stat = await fs.promises.stat(itemPath);
        if (item.isDirectory()) {
          const children = (await fs.promises.readdir(itemPath)).filter(n => !n.startsWith('.')).length;
          files.push({ name: item.name, path: rel ? rel + '/' + item.name : item.name, isFolder: true, children, modified: stat.mtime.toISOString() });
        } else if (item.name.endsWith('.md')) {
          files.push({ name: item.name, path: rel ? rel + '/' + item.name : item.name, isFolder: false, size: stat.size, modified: stat.mtime.toISOString() });
        }
      }
      files.sort((a, b) => {
        if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
        return b.modified.localeCompare(a.modified);
      });
      return jsonRes(res, { files });
    }

    // ── Read File ──
    if (pathname === '/api/vault/file' && method === 'GET') {
      const rel = query.path;
      if (!rel) return errRes(res, 'path required');
      const full = safePath(rel);
      if (!full) return errRes(res, 'Invalid path', 403);
      const content = await fs.promises.readFile(full, 'utf8');
      const stat = await fs.promises.stat(full);
      return jsonRes(res, { path: rel, content, modified: stat.mtime.toISOString(), size: stat.size });
    }

    // ── Create File ──
    if (pathname === '/api/vault/file' && method === 'POST') {
      const body = await parseBody(req);
      if (!body.path) return errRes(res, 'path required');
      const full = safePath(body.path);
      if (!full) return errRes(res, 'Invalid path', 403);
      if (fs.existsSync(full)) return errRes(res, 'File already exists', 409);
      await withWriteLock(async () => {
        await fs.promises.writeFile(full, body.content || '', 'utf8');
      });
      return jsonRes(res, { success: true, path: body.path }, 201);
    }

    // ── Update File ──
    if (pathname === '/api/vault/file' && method === 'PUT') {
      const body = await parseBody(req);
      if (!body.path || body.content === undefined) return errRes(res, 'path and content required');
      const full = safePath(body.path);
      if (!full) return errRes(res, 'Invalid path', 403);
      await withWriteLock(async () => {
        const tmp = full + '.tmp';
        await fs.promises.writeFile(tmp, body.content, 'utf8');
        await fs.promises.rename(tmp, full);
      });
      return jsonRes(res, { success: true, path: body.path });
    }

    // ── Delete File ──
    if (pathname === '/api/vault/file' && method === 'DELETE') {
      const body = await parseBody(req);
      if (!body.path) return errRes(res, 'path required');
      if (!body.force) return errRes(res, 'Set force:true to confirm deletion', 400);
      const full = safePath(body.path);
      if (!full) return errRes(res, 'Invalid path', 403);
      if (!fs.existsSync(full)) return jsonRes(res, { success: true, notFound: true });
      await fs.promises.unlink(full);
      return jsonRes(res, { success: true });
    }

    // ── Search ──
    if (pathname === '/api/vault/search' && method === 'GET') {
      const q = (query.q || '').toLowerCase();
      if (!q) return errRes(res, 'q required');
      const results = [];

      async function searchDir(dir, rel) {
        const items = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const item of items) {
          if (item.name.startsWith('.')) continue;
          const full = path.join(dir, item.name);
          const relPath = rel ? rel + '/' + item.name : item.name;
          if (item.isDirectory()) {
            await searchDir(full, relPath);
          } else if (item.name.endsWith('.md')) {
            const content = await fs.promises.readFile(full, 'utf8');
            if (content.toLowerCase().includes(q) || item.name.toLowerCase().includes(q)) {
              const lines = content.split('\n');
              const matchLines = [];
              for (let i = 0; i < lines.length && matchLines.length < 3; i++) {
                if (lines[i].toLowerCase().includes(q)) {
                  matchLines.push({ line: i + 1, text: lines[i].trim().slice(0, 200) });
                }
              }
              results.push({ path: relPath, name: item.name, matches: matchLines });
            }
          }
          if (results.length >= 50) return;
        }
      }

      await searchDir(CONFIG.vaultPath, '');
      return jsonRes(res, { query: query.q, results });
    }

    // ── Tags ──
    if (pathname === '/api/vault/tags' && method === 'GET') {
      const allTags = {};
      const tagFiles = {};

      async function scanDir(dir, rel) {
        const items = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const item of items) {
          if (item.name.startsWith('.')) continue;
          const full = path.join(dir, item.name);
          const relPath = rel ? rel + '/' + item.name : item.name;
          if (item.isDirectory()) {
            await scanDir(full, relPath);
          } else if (item.name.endsWith('.md')) {
            const content = await fs.promises.readFile(full, 'utf8');
            const tags = extractTags(content);
            for (const [t, c] of Object.entries(tags)) {
              allTags[t] = (allTags[t] || 0) + c;
              if (!tagFiles[t]) tagFiles[t] = [];
              if (!tagFiles[t].includes(relPath)) tagFiles[t].push(relPath);
            }
          }
        }
      }

      await scanDir(CONFIG.vaultPath, '');
      const tags = Object.entries(allTags)
        .map(([tag, count]) => ({ tag: '#' + tag, count, files: tagFiles[tag] || [] }))
        .sort((a, b) => b.count - a.count);
      return jsonRes(res, { tags });
    }

    // ── Stats ──
    if (pathname === '/api/vault/stats' && method === 'GET') {
      const stats = await computeStats();
      return jsonRes(res, stats);
    }

    // ── Daily Entries ──
    if (pathname === '/api/vault/daily' && method === 'GET') {
      const date = query.date || todayStr();
      const full = path.join(CONFIG.vaultPath, CONFIG.rapidLogFile);
      const content = await fs.promises.readFile(full, 'utf8');
      const entries = parseDailyEntries(content);
      const entry = entries.find(e => e.date === date);
      return jsonRes(res, { date, lines: entry ? entry.lines.filter(l => l.trim()) : [], found: !!entry });
    }

    if (pathname === '/api/vault/daily' && method === 'POST') {
      const body = await parseBody(req);
      if (!body.text) return errRes(res, 'text required');
      const today = todayStr();
      const full = path.join(CONFIG.vaultPath, CONFIG.rapidLogFile);

      await withWriteLock(async () => {
        let content = await fs.promises.readFile(full, 'utf8');
        const headerPattern = new RegExp(`^(####\\s+)?${today.replace(/-/g, '\\-')}\\s*$`, 'm');
        const bullet = `- ${body.text}`;

        if (headerPattern.test(content)) {
          // Append at end of existing day's section (before next #### header)
          const lines = content.split('\n');
          const headerIdx = lines.findIndex(l => headerPattern.test(l));
          let insertIdx = headerIdx + 1;
          while (insertIdx < lines.length && !lines[insertIdx].startsWith('####')) {
            insertIdx++;
          }
          lines.splice(insertIdx, 0, bullet);
          content = lines.join('\n');
        } else {
          // Add new header at top (after any front matter)
          const lines = content.split('\n');
          let insertIdx = 0;
          // Skip YAML front matter
          if (lines[0] && lines[0].trim() === '---') {
            for (let i = 1; i < lines.length; i++) {
              if (lines[i].trim() === '---') { insertIdx = i + 1; break; }
            }
          }
          // Skip title/header lines
          while (insertIdx < lines.length && ((lines[insertIdx].startsWith('#') && !lines[insertIdx].startsWith('####')) || lines[insertIdx].trim() === '')) {
            insertIdx++;
          }
          const newSection = `#### ${today}\n${bullet}\n`;
          lines.splice(insertIdx, 0, newSection);
          content = lines.join('\n');
        }

        const tmp = full + '.tmp';
        await fs.promises.writeFile(tmp, content, 'utf8');
        await fs.promises.rename(tmp, full);
      });

      return jsonRes(res, { success: true, date: today }, 201);
    }

    // ── Quick Captures (separate file) ──
    if (pathname === '/api/vault/capture' && method === 'POST') {
      const body = await parseBody(req);
      if (!body.text) return errRes(res, 'text required');
      const today = todayStr();
      const full = path.join(CONFIG.vaultPath, CONFIG.captureFile);

      await withWriteLock(async () => {
        let content = '';
        try {
          content = await fs.promises.readFile(full, 'utf8');
        } catch {
          // File doesn't exist yet — create with a header
          content = '# Quick Captures\n\n';
        }

        const headerPattern = new RegExp(`^(####\\s+)?${today.replace(/-/g, '\\-')}\\s*$`, 'm');
        const now = new Date();
        const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
        const bullet = `- \\[${time}\\] ${body.text}`;

        if (headerPattern.test(content)) {
          const lines = content.split('\n');
          const headerIdx = lines.findIndex(l => headerPattern.test(l));
          let insertIdx = headerIdx + 1;
          while (insertIdx < lines.length && !lines[insertIdx].startsWith('####')) {
            insertIdx++;
          }
          lines.splice(insertIdx, 0, bullet);
          content = lines.join('\n');
        } else {
          const lines = content.split('\n');
          let insertIdx = 0;
          if (lines[0] && lines[0].trim() === '---') {
            for (let i = 1; i < lines.length; i++) {
              if (lines[i].trim() === '---') { insertIdx = i + 1; break; }
            }
          }
          while (insertIdx < lines.length && ((lines[insertIdx].startsWith('#') && !lines[insertIdx].startsWith('####')) || lines[insertIdx].trim() === '')) {
            insertIdx++;
          }
          const newSection = `#### ${today}\n${bullet}\n`;
          lines.splice(insertIdx, 0, newSection);
          content = lines.join('\n');
        }

        const tmp = full + '.tmp';
        await fs.promises.writeFile(tmp, content, 'utf8');
        await fs.promises.rename(tmp, full);
      });

      return jsonRes(res, { success: true, date: today }, 201);
    }

    // ── Create Project File in nexus_project/ ──
    if (pathname === '/api/vault/create-project-file' && method === 'POST') {
      if (!CONFIG.vaultPath) return errRes(res, 'Vault not configured');
      const body = await parseBody(req);
      if (!body.name || !body.vaultFile) return errRes(res, 'name and vaultFile required');
      const full = safePath(body.vaultFile);
      if (!full) return errRes(res, 'Invalid path', 403);
      const dir = path.dirname(full);
      const today = todayStr();
      await fs.promises.mkdir(dir, { recursive: true });
      let exists = false;
      try { await fs.promises.access(full); exists = true; } catch {}
      if (!exists) {
        const content = `# ${body.name}\nCreated: ${today}\n\n`;
        await fs.promises.writeFile(full, content, 'utf8');
      }
      return jsonRes(res, { success: true, vaultFile: body.vaultFile });
    }

    // ── Project Log (append checklist check to project MD) ──
    if (pathname === '/api/vault/project-log' && method === 'POST') {
      if (!CONFIG.vaultPath) return errRes(res, 'Vault not configured');
      const body = await parseBody(req);
      if (!body.projectFile || !body.text) return errRes(res, 'projectFile and text required');
      const full = safePath(body.projectFile);
      if (!full) return errRes(res, 'Invalid path', 403);
      const today = todayStr();
      const now = new Date();
      const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
      const bullet = `- [${time}] ${body.text}`;
      const headerPattern = new RegExp(`^(####\\s+)?${today.replace(/-/g, '\\-')}\\s*$`, 'm');

      await withWriteLock(async () => {
        await fs.promises.mkdir(path.dirname(full), { recursive: true });
        let content = '';
        try { content = await fs.promises.readFile(full, 'utf8'); } catch { content = `# ${body.projectName || 'Project'}\n\n`; }

        if (headerPattern.test(content)) {
          const lines = content.split('\n');
          const headerIdx = lines.findIndex(l => headerPattern.test(l));
          let insertIdx = headerIdx + 1;
          while (insertIdx < lines.length && !lines[insertIdx].startsWith('####')) insertIdx++;
          lines.splice(insertIdx, 0, bullet);
          content = lines.join('\n');
        } else {
          content = content.trimEnd() + `\n\n#### ${today}\n${bullet}\n`;
        }

        const tmp = full + '.tmp';
        await fs.promises.writeFile(tmp, content, 'utf8');
        await fs.promises.rename(tmp, full);
      });

      return jsonRes(res, { success: true, date: today }, 201);
    }

    // ── Tasks (structured) ──
    if (pathname === '/api/vault/tasks' && method === 'GET') {
      const tasks = await aggregateVaultTasks();
      return jsonRes(res, tasks);
    }

    // ── Toggle Task ──
    if (pathname === '/api/vault/tasks/toggle' && method === 'POST') {
      const body = await parseBody(req);
      if (!body.source || !body.line) return errRes(res, 'source and line required');
      const full = safePath(body.source);
      if (!full) return errRes(res, 'Invalid path', 403);

      await withWriteLock(async () => {
        const content = await fs.promises.readFile(full, 'utf8');
        const lines = content.split('\n');
        const idx = body.line - 1;
        if (idx < 0 || idx >= lines.length) throw new Error('Line out of range');

        const line = lines[idx];
        // Toggle: [ ] -> [x] or [x] -> [ ]
        if (/^(\s*)-\s+\[\s\]/.test(line)) {
          // Add done date
          const today = todayStr();
          lines[idx] = line.replace(/\[\s\]/, '[x]').replace(/\s*$/, ` \u2705 ${today}`);
        } else if (/^(\s*)-\s+\[x\]/i.test(line)) {
          // Remove done date and uncheck
          lines[idx] = line.replace(/\[x\]/i, '[ ]').replace(/\s*\u2705\s*\d{4}-\d{2}-\d{2}\s*$/, '');
        } else {
          throw new Error('Line is not a task checkbox');
        }

        const tmp = full + '.tmp';
        await fs.promises.writeFile(tmp, lines.join('\n'), 'utf8');
        await fs.promises.rename(tmp, full);
      });

      return jsonRes(res, { success: true });
    }

    // ── Tag Entries (for growth filtering) ──
    if (pathname === '/api/vault/tag-entries' && method === 'GET') {
      const tag = (query.tag || '').toLowerCase();
      if (!tag) return errRes(res, 'tag required');
      const entries = [];

      // Search rapid log first
      try {
        const rapidContent = await fs.promises.readFile(path.join(CONFIG.vaultPath, CONFIG.rapidLogFile), 'utf8');
        const dailyEntries = parseDailyEntries(rapidContent);
        for (const entry of dailyEntries) {
          for (const line of entry.lines) {
            if (line.toLowerCase().includes('#' + tag)) {
              entries.push({
                date: entry.date,
                text: line.replace(/^[\s\-*>|]+/, '').trim(),
                source: CONFIG.rapidLogFile,
              });
            }
          }
        }
      } catch {}

      // Walk all vault .md files for tagged lines
      async function walkForTag(dir, rel) {
        try {
          const items = await fs.promises.readdir(dir, { withFileTypes: true });
          for (const item of items) {
            if (item.name.startsWith('.')) continue;
            const full = path.join(dir, item.name);
            const relPath = rel ? rel + '/' + item.name : item.name;
            if (item.isDirectory()) {
              await walkForTag(full, relPath);
            } else if (item.name.endsWith('.md') && item.name !== CONFIG.rapidLogFile && item.name !== CONFIG.weeklyReviewFile) {
              try {
                const content = await fs.promises.readFile(full, 'utf8');
                const dailyEntries = parseDailyEntries(content);
                if (dailyEntries.length > 0) {
                  for (const entry of dailyEntries) {
                    for (const line of entry.lines) {
                      if (line.toLowerCase().includes('#' + tag)) {
                        entries.push({ date: entry.date, text: line.replace(/^[\s\-*>|]+/, '').trim(), source: relPath });
                      }
                    }
                  }
                } else {
                  const stat = await fs.promises.stat(full);
                  const fileDate = stat.mtime.toISOString().slice(0, 10);
                  for (const line of content.split('\n')) {
                    if (line.toLowerCase().includes('#' + tag)) {
                      entries.push({ date: fileDate, text: line.replace(/^[\s\-*>|]+/, '').trim(), source: relPath });
                    }
                  }
                }
              } catch {}
            }
          }
        } catch {}
      }
      if (CONFIG.vaultPath) await walkForTag(CONFIG.vaultPath, '');

      // Also search app captures (nexus-data.json)
      try {
        const storeRaw = await fs.promises.readFile(path.join(__dirname, 'nexus-data.json'), 'utf8');
        const store = JSON.parse(storeRaw);
        for (const cap of (store.captures || [])) {
          if (cap.text && cap.text.toLowerCase().includes('#' + tag)) {
            const d = cap.created ? new Date(cap.created).toISOString().slice(0, 10) : '0000-00-00';
            entries.push({ date: d, text: cap.text.trim(), source: 'app' });
          }
        }
      } catch {}

      // Sort by date descending, cap at 200
      entries.sort((a, b) => b.date.localeCompare(a.date));
      const capped = entries.slice(0, 200);

      return jsonRes(res, { tag, entries: capped, count: entries.length });
    }

    // ── Weekly Review ──
    if (pathname === '/api/vault/weekly-review' && method === 'GET') {
      const review = await computeWeeklyReview();
      return jsonRes(res, review);
    }

    // ── Weekly Review Export ──
    if (pathname === '/api/vault/weekly-review/export' && method === 'POST') {
      const body = await parseBody(req);
      const customTags = body.customTags || [];  // e.g. ['people', 'food', 'movie']
      const review = await computeWeeklyReview(customTags);
      const today = new Date();
      // Get ISO week number
      const jan1 = new Date(today.getFullYear(), 0, 1);
      const weekNum = Math.ceil(((today - jan1) / 864e5 + jan1.getDay() + 1) / 7);
      const weekStr = `${today.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;

      // Build collapsible callout block for this week
      const weekStart = new Date(review.weekStart);
      const weekEnd = new Date(review.weekEnd);
      const fmtDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

      let block = `> [!summary]- ${weekStr} (${fmtDate(weekStart)} – ${fmtDate(weekEnd)})\n`;
      block += `> **Stats**\n`;
      block += `> - Days logged: ${review.daysLogged}/7\n`;
      block += `> - Words written: ${review.totalWords.toLocaleString()}\n`;
      block += `> - Tasks completed: ${review.tasksCompleted}\n`;
      block += `> - Most active day: ${review.mostActiveDay || 'N/A'}\n`;
      block += `>\n`;

      if (review.topTags.length > 0) {
        block += `> **Top Tags**\n`;
        block += review.topTags.map(t => `> - #${t.tag} (${t.count})`).join('\n') + '\n';
        block += `>\n`;
      }

      // Dynamic tag sections
      for (const [tag, entries] of Object.entries(review.tagSections || {})) {
        if (entries.length > 0) {
          const label = tag.charAt(0).toUpperCase() + tag.slice(1);
          block += `> **${label}**\n`;
          block += entries.map(e => `> - ${e.date}: ${e.text}`).join('\n') + '\n';
          block += `>\n`;
        }
      }

      block += '\n';

      // Write to single 05 Weekly Reviews.md file
      const reviewFile = path.join(CONFIG.vaultPath, CONFIG.weeklyReviewFile);

      await withWriteLock(async () => {
        let content = '';
        try {
          content = await fs.promises.readFile(reviewFile, 'utf8');
        } catch {
          content = '# Weekly Reviews\n\n';
        }

        // Check if this week already exists — replace it
        const calloutPattern = new RegExp(`> \\[!summary\\]- ${weekStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} .*?(?=\\n> \\[!summary\\]|\\n*$)`, 's');
        if (calloutPattern.test(content)) {
          content = content.replace(calloutPattern, block.trim());
        } else {
          // Insert after the # header (newest on top)
          const lines = content.split('\n');
          let insertIdx = 0;
          // Skip header lines
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('#') || lines[i].trim() === '') {
              insertIdx = i + 1;
            } else {
              break;
            }
          }
          lines.splice(insertIdx, 0, block);
          content = lines.join('\n');
        }

        const tmp = reviewFile + '.tmp';
        await fs.promises.writeFile(tmp, content, 'utf8');
        await fs.promises.rename(tmp, reviewFile);
      });

      return jsonRes(res, { success: true, file: CONFIG.weeklyReviewFile }, 201);
    }

    // ── Growth ──
    if (pathname === '/api/vault/growth' && method === 'GET') {
      const growth = await computeGrowth();
      return jsonRes(res, growth);
    }

    // ── Suggestions ──
    if (pathname === '/api/vault/suggestions' && method === 'GET') {
      const suggestions = await computeSuggestions();
      return jsonRes(res, { suggestions });
    }

    // ── Nexus App Data ──
    if (pathname === '/api/nexus-data' && method === 'GET') {
      return jsonRes(res, await nexusDataRead());
    }

    if (pathname === '/api/nexus-data' && method === 'POST') {
      const body = await parseBody(req);
      await nexusDataWrite(body);
      return jsonRes(res, { success: true });
    }

    // ── Project → Vault Sync (accepts single checklist or {checklists:[...]}) ──
    if (pathname === '/api/vault/project-sync' && method === 'POST') {
      if (!CONFIG.vaultPath) return errRes(res, 'Vault not configured');
      const body = await parseBody(req);
      const list = body.checklists || (body.checklist ? [body.checklist] : []);
      if (!list.length) return errRes(res, 'checklists required');
      const today = todayStr();
      const synced = [];
      for (const checklist of list) {
        if (!checklist || !checklist.name) continue;
        const sn = checklist.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
        const projDir = path.join(CONFIG.vaultPath, 'nexus_project', sn);
        await fs.promises.mkdir(projDir, { recursive: true });

        // Build checklist.md
        let clMd = `# ${checklist.name} Checklist\n`;
        clMd += `> Deadline: ${checklist.deadline || 'none'} | Last synced: ${today}\n\n`;
        if (checklist.description) clMd += `${checklist.description}\n\n`;
        for (const sec of (checklist.sections || [])) {
          clMd += `## ${sec.name || 'General'}\n`;
          for (const it of (sec.items || [])) {
            const isDone = (it.revisions || []).length > 0 || it.done;
            clMd += `- [${isDone ? 'x' : ' '}] ${it.text}\n`;
          }
          clMd += '\n';
        }
        const clFile = path.join(projDir, 'checklist.md');
        await fs.promises.writeFile(clFile + '.tmp', clMd, 'utf8');
        await fs.promises.rename(clFile + '.tmp', clFile);

        // Append to log.md only if progress changed today
        const allItems = (checklist.sections || []).flatMap(s => s.items || []);
        const done = allItems.filter(it => (it.revisions || []).length > 0 || it.done).length;
        const total = allItems.length;
        const pct = total ? Math.round(done / total * 100) : 0;
        const logFile = path.join(projDir, 'log.md');
        const logHeader = `# ${checklist.name} Log\n`;
        let logContent = logHeader;
        try { logContent = await fs.promises.readFile(logFile, 'utf8'); } catch {}
        if (!logContent.startsWith('#')) logContent = logHeader + logContent;
        // Only append if today's entry not already present
        if (!logContent.includes(`## ${today}`)) {
          logContent += `\n## ${today} — ${done}/${total} (${pct}%)\n`;
        }
        await fs.promises.writeFile(logFile + '.tmp', logContent, 'utf8');
        await fs.promises.rename(logFile + '.tmp', logFile);
        synced.push(`nexus_project/${sn}/checklist.md`);
      }
      return jsonRes(res, { success: true, synced });
    }

    // ── Write goal.md to vault ──
    if (pathname === '/api/vault/goal-write' && method === 'POST') {
      if (!CONFIG.vaultPath) return errRes(res, 'Vault not configured');
      const body = await parseBody(req);
      const { content } = body;
      if (!content) return errRes(res, 'content required');
      const goalFile = path.join(CONFIG.vaultPath, 'nexus_goals.md');
      try {
        await fs.promises.writeFile(goalFile, content, 'utf8');
        return jsonRes(res, { success: true, path: 'nexus_goals.md' });
      } catch (e) {
        return errRes(res, 'Failed to write nexus_goals.md: ' + e.message);
      }
    }

    // ── Rename project folder in vault ──
    if (pathname === '/api/vault/project-rename' && method === 'POST') {
      if (!CONFIG.vaultPath) return errRes(res, 'Vault not configured');
      const body = await parseBody(req);
      const { oldName, newName } = body;
      if (!oldName || !newName) return errRes(res, 'oldName and newName required');
      const oldDir = path.join(CONFIG.vaultPath, 'nexus_project', oldName);
      const newDir = path.join(CONFIG.vaultPath, 'nexus_project', newName);
      try {
        await fs.promises.access(oldDir);
        await fs.promises.rename(oldDir, newDir);
        return jsonRes(res, { success: true, renamed: `nexus_project/${oldName} → nexus_project/${newName}` });
      } catch (e) {
        return jsonRes(res, { success: false, note: 'Folder not found or rename failed: ' + e.message });
      }
    }

    // ── Export nexus_project/ or full vault as zip (Windows: PowerShell) ──
    if ((pathname === '/api/vault/export-nexus-project' || pathname === '/api/vault/export-full-vault') && method === 'GET') {
      if (!CONFIG.vaultPath) return errRes(res, 'Vault not configured');
      const isFullVault = pathname === '/api/vault/export-full-vault';
      const sourceDir = isFullVault ? CONFIG.vaultPath : path.join(CONFIG.vaultPath, 'nexus_project');
      const zipLabel = isFullVault ? 'obsidian_vault' : 'nexus_project';
      if (!isFullVault) {
        try { await fs.promises.access(sourceDir); } catch { return errRes(res, 'nexus_project folder not found — sync a project first'); }
      }
      const zipName = `${zipLabel}_${todayStr()}.zip`;
      const zipPath = path.join(CONFIG.staticDir, zipName);
      const { execFile } = require('child_process');
      await new Promise((resolve, reject) => {
        if (process.platform === 'win32') {
          execFile('powershell', ['-NoProfile', '-Command',
            `Compress-Archive -Path "${sourceDir}" -DestinationPath "${zipPath}" -Force`
          ], { timeout: 300000 }, (err) => err ? reject(err) : resolve());
        } else {
          execFile('zip', ['-r', zipPath, sourceDir], { timeout: 300000 }, (err) => err ? reject(err) : resolve());
        }
      });
      const zipData = await fs.promises.readFile(zipPath);
      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${zipName}"`,
        'Content-Length': zipData.length,
      });
      res.end(zipData);
      await fs.promises.unlink(zipPath).catch(() => {});
      return;
    }

    // ── Config API ──
    if (pathname === '/api/config' && method === 'GET') {
      let setupComplete = false;
      try { const s = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); setupComplete = !!s.setupComplete; } catch {}
      return jsonRes(res, { vaultPath: CONFIG.vaultPath, useVault: CONFIG.useVault, setupComplete, rapidLogFile: CONFIG.rapidLogFile });
    }

    if (pathname === '/api/config' && method === 'POST') {
      const body = await parseBody(req);
      if (body.vaultPath !== undefined) CONFIG.vaultPath = body.vaultPath;
      if (body.useVault !== undefined) CONFIG.useVault = !!body.useVault;
      if (body.rapidLogFile !== undefined && body.rapidLogFile.trim()) CONFIG.rapidLogFile = body.rapidLogFile.trim();
      saveConfig();
      return jsonRes(res, { success: true });
    }

    // ── Browse folders (for vault path picker) ──
    if (pathname === '/api/browse-folders' && method === 'GET') {
      const dir = query.path || (process.platform === 'win32' ? 'C:/' : '/');
      try {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        const folders = entries
          .filter(e => e.isDirectory() && !e.name.startsWith('.'))
          .map(e => ({ name: e.name, path: path.join(dir, e.name).replace(/\\/g, '/') }))
          .sort((a, b) => a.name.localeCompare(b.name));
        return jsonRes(res, { current: dir.replace(/\\/g, '/'), folders, parent: path.dirname(dir).replace(/\\/g, '/') });
      } catch {
        return jsonRes(res, { current: dir, folders: [], parent: path.dirname(dir).replace(/\\/g, '/') });
      }
    }

    errRes(res, 'Not found', 404);
  } catch (err) {
    console.error('API Error:', err);
    errRes(res, err.message || 'Internal error', 500);
  }
}

// ── Server ────────────────────────────────────────
const nexusServer = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, 'http://localhost');
  const pathname = parsed.pathname;
  const query = Object.fromEntries(parsed.searchParams);

  // API routes
  if (pathname.startsWith('/api/')) {
    return handleAPI(req, res, pathname, query);
  }

  // Static files
  let filePath = path.join(CONFIG.staticDir, pathname === '/' ? 'index.html' : pathname);
  if (!path.resolve(filePath).startsWith(path.resolve(CONFIG.staticDir))) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  const ext = path.extname(filePath);
  const contentType = MIME[ext] || 'text/plain';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

nexusServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[Nexus] Port ${CONFIG.port} already in use. Close the other instance and try again.`);
  } else {
    console.error('[Nexus] Server error:', err.message);
  }
  process.exit(1);
});

nexusServer.listen(CONFIG.port, () => {
  console.log('========================================');
  console.log(`Nexus running at http://localhost:${CONFIG.port}`);
  console.log(`Vault: ${CONFIG.useVault ? CONFIG.vaultPath : 'disabled'}`);
  console.log('========================================');
});

// ── Crash Logger ─────────────────────────────────
const LOG_FILE = path.join(__dirname, 'nexus-crash.log');
function logCrash(type, err) {
  const line = `[${new Date().toISOString()}] ${type}: ${err && (err.stack || err.message || err)}\n`;
  console.error(line.trim());
  try { fs.appendFileSync(LOG_FILE, line); } catch {}
}

// ── Global crash guards ───────────────────────────
process.on('uncaughtException', (err) => {
  logCrash('uncaughtException', err);
  // Keep running — do not exit
});

process.on('unhandledRejection', (reason) => {
  logCrash('unhandledRejection', reason instanceof Error ? reason : new Error(String(reason)));
  // Keep running — do not exit
});
