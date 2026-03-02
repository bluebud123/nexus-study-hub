# Nexus — Your Evolution Hub

A personal study dashboard with Obsidian vault integration. Built for exam preparation, habit tracking, and daily journaling.

## Features

- **Dashboard** — Exam countdown, streaks, recent captures
- **Today** — Study timer (Pomodoro/custom/stopwatch), habits, tasks, schedule
- **Capture** — Quick thoughts with #tag filtering
- **Tasks** — To-do list synced with Obsidian vault
- **Journal** — Daily log feeding into streaks and weekly reviews
- **Goals** — Long-term goal tracking with milestones
- **Vault** — Browse and search your Obsidian vault
- **Growth** — Stats, heatmap, MCQ performance, weekly review export
- **Strategy** — Exam roadmap, monthly allocations, topic tracker, spaced repetition
- **Focus Mode** — Distraction-free timer + tasks view

## Setup

### Requirements
- [Node.js](https://nodejs.org/) (v16 or later)

### Quick Start

1. **Clone this repo**
   ```
   git clone https://github.com/bluebud123/nexus-study-hub.git
   cd nexus-study-hub
   ```

2. **Configure your Obsidian vault** (optional)
   Open `server.js` and edit the `CONFIG` section at the top:
   ```js
   const CONFIG = {
     vaultPath: 'D:\\Obsidian\\A bullet journal',  // your vault path
     dailyFolder: '01 Daily',
     // ...
   };
   ```
   If you don't use Obsidian, the app still works — vault features will just be disabled.

3. **Run the app**
   ```
   node server.js
   ```
   Then open **http://localhost:3456** in your browser.

   Or on Windows, double-click `start-nexus.bat`.

### Data Storage
- All data is saved locally in `nexus-data.json` (auto-created on first run)
- Auto-backup keeps the last 5 hourly snapshots in `backups/`
- No cloud, no accounts — your data stays on your machine

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| D | Dashboard |
| Y | Today |
| C | Capture |
| T | Tasks |
| J | Journal |
| G | Goals |
| V | Vault |
| S | Search |
| F | Focus Mode |
| ? | Shortcuts & Guide |

## License

MIT
