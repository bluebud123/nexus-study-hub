// ═══════════════════════════════════════════════════
//  Nexus — Views Hub
//  Imports all split view modules and assembles the
//  Views object. This keeps backward compatibility
//  with App.render() which calls Views[view]().
// ═══════════════════════════════════════════════════

// App reference — set by entry point to break circular dependency
let App;
export function _setApp(a) {
  App = a;
  // Propagate to all split modules via window.App (already set by entry point)
}

export { App };

import { dashboard }               from './views/dashboard.js';
import { today }                   from './views/today.js';
import { capture }                 from './views/capture.js';
import { tasks }                   from './views/tasks.js';
import { journal }                 from './views/journal.js';
import { vault, _vaultBrowser, _vaultReader, _vaultEditor } from './views/vault.js';
import { growth }                  from './views/growth.js';
import { strategy }                from './views/strategy.js';
import { goals }                   from './views/goals.js';
import { calendar }                from './views/calendar.js';
import { settings }                from './views/settings.js';
import { shortcuts }               from './views/shortcuts.js';
import { search }                  from './views/search.js';
import { focus }                   from './views/focus.js';

export const Views = {
  dashboard,
  today,
  capture,
  tasks,
  journal,
  vault,
  _vaultBrowser,
  _vaultReader,
  _vaultEditor,
  growth,
  strategy,
  goals,
  calendar,
  settings,
  shortcuts,
  search,
  focus,
};
