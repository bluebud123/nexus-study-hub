// ═══════════════════════════════════════════════════
//  Nexus — Capture View
// ═══════════════════════════════════════════════════
import { formatDate, escapeHTML } from '../utils.js';
import { Store } from '../store.js';

export function capture() {
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
    const activeTag = window.App.captureTagFilter || '';
    if (activeTag) {
      captures = captures.filter(c => c.text.toLowerCase().includes(activeTag));
    }

    // Pinned first
    captures.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

    return `
      <h1 class="view-title">Capture <button class="btn btn-ghost btn-sm" onclick="App.exportCaptures()" style="font-size:11px; vertical-align:middle; margin-left:8px;">⬇ Export .md</button></h1>
      <p class="view-subtitle">Quick thoughts, ideas, anything — get it out of your head</p>

      <div style="margin-bottom:20px;">
        <textarea id="capture-input" placeholder="What's on your mind? Use #tags to categorize (Enter to save, Ctrl+Enter for new line)" rows="3"
          onkeydown="if(event.key==='Enter'){if(event.ctrlKey||event.shiftKey){return;}App.addCapture(); event.preventDefault();}"></textarea>
        <div style="margin-top:10px; display:flex; justify-content:space-between; align-items:center;">
          ${window.App.vaultAvailable ? `
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
            <span class="tag-badge ${activeTag === tag ? 'tag-active' : ''}" onclick="App.captureTagFilter='${tag}'; App.render();">${tag} (${count})</span>
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
              ${window.App._editingCapture === c.id ? `
                <textarea id="edit-capture-${c.id}" class="capture-edit-area" rows="3" onkeydown="if(event.key==='Enter'&&!event.ctrlKey&&!event.shiftKey){App.saveEditCapture('${c.id}');event.preventDefault();} if(event.key==='Escape'){App._editingCapture=null;App.render();}">${escapeHTML(c.text)}</textarea>
                <div style="display:flex;gap:6px;margin-top:6px;">
                  <button class="btn btn-primary btn-sm" onclick="App.saveEditCapture('${c.id}')">Save</button>
                  <button class="btn btn-ghost btn-sm" onclick="App._editingCapture=null;App.render();">Cancel</button>
                </div>
              ` : `
                <div class="capture-text" ondblclick="App._editingCapture='${c.id}';App.render();setTimeout(()=>{const t=document.getElementById('edit-capture-${c.id}');if(t){t.focus();t.selectionStart=t.value.length;}},50);">${escapeHTML(c.text)}</div>
              `}
              <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
                <div class="capture-time">${formatDate(c.created)}</div>
                <div style="display:flex; gap:4px; align-items:center;">
                  ${window.App._editingCapture !== c.id ? `<button class="btn btn-ghost btn-sm" style="font-size:10px; padding:2px 6px;" onclick="App._editingCapture='${c.id}';App.render();setTimeout(()=>{const t=document.getElementById('edit-capture-${c.id}');if(t){t.focus();t.selectionStart=t.value.length;}},50);">Edit</button>` : ''}
                  ${tags.length ? tags.map(t => `<span class="tag-badge-sm">${t}</span>`).join('') : ''}
                </div>
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
  }
