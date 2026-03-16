// ═══════════════════════════════════════════════════
//  Nexus — Entry Point
//  Imports all modules, wires globals, boots the app.
// ═══════════════════════════════════════════════════
import { Store } from './js/store.js';
import { App } from './js/app.js';
import { Views, _setApp } from './js/views.js';
import { VaultAPI } from './js/vault-api.js';
import {
  uid, timeAgo, formatDate, contrastColor, formatTime,
  localDateKey, todayKey, escapeHTML, toast,
  addMonths, curMonthKey, monthLabel, getRoadmapMonths,
  getGreeting, renderMarkdown, updateStreak, parseChecklistMD
} from './js/utils.js';

// Wire cross-references (breaks circular dependency)
_setApp(App);

// ── Expose globals for inline onclick handlers ────
window.App = App;
window.Store = Store;
window.Views = Views;
window.VaultAPI = VaultAPI;

// Expose utility functions used in inline handlers
window.escapeHTML = escapeHTML;
window.contrastColor = contrastColor;
window.formatDate = formatDate;
window.formatTime = formatTime;
window.localDateKey = localDateKey;
window.todayKey = todayKey;
window.uid = uid;
window.timeAgo = timeAgo;
window.toast = toast;
window.curMonthKey = curMonthKey;
window.renderMarkdown = renderMarkdown;
window.parseChecklistMD = parseChecklistMD;
window.updateStreak = updateStreak;

// ── Keyboard Shortcuts ────────────────────────────
document.addEventListener('keydown', (e) => {
  // Tutorial keyboard navigation
  if (App._tutorialActive) {
    if (e.key === 'Escape') { App.endTutorial(); e.preventDefault(); }
    if (e.key === 'ArrowRight' || e.key === 'Enter') { App.tutorialNext(); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { App.tutorialBack(); e.preventDefault(); }
    return;
  }
  // ESC key — close modals, cancel edits, go back
  if (e.key === 'Escape') {
    e.preventDefault();
    if (App.showShortcutHelp) { App.showShortcutHelp = false; App.render(); return; }
    if (App.fabExpanded) { App.fabExpanded = false; App.render(); return; }
    if (App.focusMode) { App.toggleFocusMode(); return; }
    if (App._editingCapture) { App._editingCapture = null; App.render(); return; }
    if (App._editingJournal) { App._editingJournal = null; App.render(); return; }
    if (App._importWizard) { App._importWizard = false; App.render(); return; }
    if (history.state && history.state.view !== 'dashboard') { history.back(); }
    return;
  }
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
    App.navigateTo('search');
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
