# Nexus — Your Evolution Hub

A personal study dashboard with optional Obsidian vault integration. Built for exam preparation, habit tracking, and daily journaling.

## Features

- **Dashboard** — Exam countdown, streaks, recent captures
- **Today** — Study timer (Pomodoro/custom/stopwatch), habits, tasks, schedule
- **Capture** — Quick thoughts with #tag filtering, pin, and convert-to-task
- **Tasks** — To-do list (+ vault task sync if Obsidian connected)
- **Journal** — Quick daily log feeding into streaks and weekly reviews
- **Goals** — Long-term goal tracking with milestones
- **Vault** — Browse and search your Obsidian vault (when connected)
- **Growth** — Stats, heatmap, session history, MCQ performance, weekly review export
- **Strategy** — Exam roadmap, monthly allocations, topic tracker, spaced repetition
- **Search** — Search across captures, tasks, journal, and goals
- **Focus Mode** — Distraction-free timer + tasks view
- **PWA** — Install as a standalone app from your browser

## Setup

### Requirements
- [Node.js](https://nodejs.org/) (v16 or later)

### Quick Start

1. **Clone this repo**
   ```
   git clone https://github.com/bluebud123/nexus-study-hub.git
   cd nexus-study-hub
   ```

2. **Run the app**
   ```
   node server.js
   ```
   Then open **http://localhost:3456** in your browser.

   Or on Windows, double-click `start-nexus.bat`.

3. **First-run setup**
   On first launch, a setup wizard will guide you through:
   - Setting your exam date
   - Connecting your Obsidian vault (optional — you can browse and select the folder)

   No Obsidian? No problem — the app works fully standalone.

### Data Storage
- All data is saved locally in `nexus-data.json` (auto-created on first run)
- Settings saved in `nexus-config.json`
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
