// ═══════════════════════════════════════════════════
//  Nexus — Goals View
// ═══════════════════════════════════════════════════
import { escapeHTML } from '../utils.js';
import { Store } from '../store.js';

export function goals() {
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
            const prompt = window.App._goalPrompt;
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
        <details style="margin-top:24px;">
          <summary class="strat-section-label" style="margin-bottom:8px; color:#a78bfa; cursor:pointer; list-style:none;">🏆 Achieved Goals <span style="font-size:12px; opacity:0.7;">(${achievedGoals.length})</span></summary>
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
        </details>
      ` : ''}

      ${(() => { const gaveUp = (data.goals || []).filter(g => g.gaveUp); return gaveUp.length ? `
        <details style="margin-top:24px;">
          <summary class="strat-section-label" style="margin-bottom:8px; color:var(--text-dim); cursor:pointer; list-style:none;">Given Up Goals <span style="font-size:12px; opacity:0.7;">(${gaveUp.length})</span></summary>
          <div class="item-list">
            ${gaveUp.map(g => `
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
        </details>
      ` : ''; })()}
    `;
  }
