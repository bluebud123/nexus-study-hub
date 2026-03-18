// ═══════════════════════════════════════════════════
//  Nexus — Vault View
// ═══════════════════════════════════════════════════
import { escapeHTML, renderMarkdown } from '../utils.js';

export function vault() {
    const mode = window.App.vaultMode || 'browse';
    const vaultPath = window.App.vaultPath || '';

    if (mode === 'read' && window.App.vaultFile) {
      return _vaultReader();
    }
    if (mode === 'edit' && window.App.vaultFile) {
      return _vaultEditor();
    }
    return _vaultBrowser();
  }

export function _vaultBrowser() {
    const vaultPath = window.App.vaultPath || '';
    const files = window.App.vaultFileList || [];
    const searchQuery = window.App.vaultSearchQuery || '';
    const searchResults = window.App.vaultSearchResults || [];
    const isSearching = window.App.vaultIsSearching || false;

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
            <div class="empty-icon">${window.App.vaultLoadError ? '&#9888;' : '&#128218;'}</div>
            <div class="empty-text">${window.App.vaultLoadError ? 'Could not load vault — check your vault path in Settings.' : 'Loading vault...'}</div>
          </div>
        `}
      ` : ''}
    `;
  }

export function _vaultReader() {
    const file = window.App.vaultFile;
    const content = window.App.vaultFileContent || '';
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
  }

export function _vaultEditor() {
    const file = window.App.vaultFile;
    const content = window.App.vaultFileContent || '';

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
  }
