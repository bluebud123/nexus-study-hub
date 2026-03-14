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
- **Strategy** — Roadmap, monthly allocations, topic tracker, project vault logging
- **Search** — Search across captures, tasks, journal, and goals
- **Focus Mode** — Distraction-free timer + tasks view
- **PWA** — Install as a standalone app from your browser

---

## Installation (First Time)

### Step 1 — Install Node.js

Node.js is the engine that runs Nexus. You only need to do this once.

1. Go to [https://nodejs.org](https://nodejs.org)
2. Download the **LTS** version (the button on the left)
3. Run the installer — click Next through all the steps, keep all defaults
4. When done, you have Node.js installed

### Step 2 — Download Nexus

You don't need a GitHub account to download.

1. Go to [https://github.com/bluebud123/nexus-study-hub](https://github.com/bluebud123/nexus-study-hub)
2. Click the green **`< > Code`** button
3. Click **Download ZIP**
4. Extract the ZIP to a folder you'll remember (e.g. `C:\Apps\nexus-study-hub`)

> **Tip:** Don't put it in Downloads — files there can get cleaned up accidentally.

### Step 3 — Run the App

**On Windows (easiest):**
Double-click `start-nexus.bat` inside the folder. A black window will open — that's normal, keep it open.

**Or using Command Prompt / Terminal:**
```
cd C:\Apps\nexus-study-hub
node server.js
```

Then open **http://localhost:3456** in your browser.

### Step 4 — First-Run Setup

A setup wizard will guide you through:
- Setting your exam date (or skip if not applicable)
- Connecting your Obsidian vault folder (optional)

No Obsidian? No problem — the app works fully without it.

---

## Updating to a New Version

Your personal data (`nexus-data.json`, `nexus-config.json`) is **never touched** by updates — it stays safe.

### Option A — Download ZIP (Beginner, no Git required)

1. Go to [https://github.com/bluebud123/nexus-study-hub](https://github.com/bluebud123/nexus-study-hub)
2. Click **`< > Code`** → **Download ZIP**
3. Extract the ZIP somewhere temporary (e.g. your Desktop)
4. **Copy** your data files from the old folder to the new folder:
   - `nexus-data.json`
   - `nexus-config.json`
   - `backups/` folder (optional, for safety)
5. Replace the old folder with the new folder
6. Run `start-nexus.bat` as usual

> Your data files are not inside the ZIP — they only exist in your local folder, so this copy step is important.

### Option B — Git Pull (If you used `git clone` to install)

If you downloaded using `git clone` originally, updating is one command:

1. Open Command Prompt / Terminal inside the Nexus folder
2. Run:
   ```
   git pull
   ```
3. Restart the app

Your `nexus-data.json` and `nexus-config.json` are gitignored — they will never be overwritten by a pull.

---

## Data & Privacy

- All data is saved **locally** in `nexus-data.json` (auto-created on first run)
- Settings saved in `nexus-config.json`
- Auto-backup keeps the last 5 hourly snapshots in `backups/`
- No cloud, no accounts, no tracking — everything stays on your machine

---

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

---

## Troubleshooting

**App won't start — "node is not recognized"**
Node.js isn't installed or wasn't added to PATH. Re-run the Node.js installer and check "Add to PATH" during setup, then restart your computer.

**Port already in use**
Another app is using port 3456. Open `server.js` and change `3456` near the top to another number like `3457`, then open `http://localhost:3457` instead.

**Black window closes immediately when I double-click the .bat file**
Right-click `start-nexus.bat` → **Run as administrator**, or open a Command Prompt and run `node server.js` to see the error message.

**I lost my data after updating**
Check the `backups/` folder inside the app directory — hourly snapshots are saved there automatically.
