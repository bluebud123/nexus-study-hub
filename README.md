# Nexus — Your Evolution Hub

A personal study dashboard with optional Obsidian vault integration. Built for exam preparation, habit tracking, and daily journaling. Runs entirely on your own machine — no cloud, no accounts.

**Works on Windows, macOS, and Linux.**

## Features

- **Dashboard** — Greeting, streak badges, goal & habits summary, daily quest nudge, tag cloud
- **Today** — Study timer (Pomodoro/stopwatch), habits, tasks, daily schedule
- **Capture** — Quick thoughts with #tag filtering, pin, and convert-to-task
- **Tasks** — To-do list (+ vault task sync if Obsidian connected)
- **Journal** — Daily log with optional AI-generated insights (bring your own key)
- **Goals** — Long-term goal tracking with archive (achieved) and give-up flows
- **Calendar** — Monthly overview with journal, task, habit, and capture dots
- **Vault** — Browse and search your Obsidian vault (when connected)
- **Growth** — Heatmap, streaks, session history, tag trends, knowledge areas, lessons
- **Strategy** — Roadmap, projects/checklists with revision tracking, milestone progress
- **Focus Mode** — Distraction-free timer + tasks view
- **Settings** — Profile, vault connection, appearance (24-colour palette), AI settings, export & import

---

## Installation

### Step 1 — Install Node.js

Node.js is the engine that runs Nexus. You only need to do this once.

1. Go to [https://nodejs.org](https://nodejs.org)
2. Download the **LTS** version (the button on the left)
3. Run the installer — keep all defaults
4. Restart your computer after installing

**Verify it worked** — open Terminal (Mac/Linux) or Command Prompt (Windows) and type:
```
node --version
```
You should see a version number like `v20.x.x`.

---

### Step 2 — Download Nexus

You don't need a GitHub account to download.

1. Go to [https://github.com/bluebud123/nexus-study-hub](https://github.com/bluebud123/nexus-study-hub)
2. Click the green **`< > Code`** button
3. Click **Download ZIP**
4. Extract the ZIP to a folder you'll remember

> **Tip:** Don't put it in Downloads — files there can get cleaned up accidentally.
>
> Good locations:
> - **Windows:** `C:\Apps\nexus-study-hub`
> - **Mac:** `/Users/yourname/Apps/nexus-study-hub`

---

### Step 3 — Run the App

#### Windows (easiest)
Double-click `start-nexus.bat` inside the folder. A black window will open — keep it open.

Or using Command Prompt:
```
cd C:\Apps\nexus-study-hub
node server.js
```

#### macOS / Linux
Open **Terminal**, then:
```bash
cd ~/Apps/nexus-study-hub
node server.js
```

Or make it a one-click launcher — create a file called `start-nexus.command` with:
```bash
#!/bin/bash
cd "$(dirname "$0")"
node server.js
```
Then run `chmod +x start-nexus.command` once in Terminal, and double-click it anytime.

---

Then open **http://localhost:3456** in your browser.

### Step 4 — Load Sample Data (optional)

If this is your first time, you can start with example data to see how everything looks:

```bash
# Mac / Linux
cp nexus-data.sample.json nexus-data.json

# Windows (Command Prompt)
copy nexus-data.sample.json nexus-data.json
```

The sample includes a study checklist, tasks, journal entries, habits, and goals. Replace it with your own data whenever you're ready — or just start fresh by leaving `nexus-data.json` absent (the app creates an empty one on first run).

### Step 5 — First-Run Setup

A setup wizard will guide you through:
- Setting your name
- Connecting your Obsidian vault folder (optional)
- Adding your first project (a Master's Exam template is available)

No Obsidian? No problem — the app works fully without it.

---

## Updating to a New Version

Your personal data (`nexus-data.json`, `nexus-config.json`) is **never touched** by updates.

### Option A — Download ZIP (no Git required)

1. Go to the GitHub repo → **`< > Code`** → **Download ZIP**
2. Extract to a temporary folder
3. **Copy your data files** from the old folder to the new one:
   - `nexus-data.json`
   - `nexus-config.json`
   - `backups/` folder (optional, for safety)
4. Replace the old folder with the new one
5. Start the app as usual

### Option B — Git Pull

If you cloned with `git clone`, updating is one command:

```bash
git pull
```

Then restart the app. Your `nexus-data.json` and `nexus-config.json` are gitignored — they are never overwritten.

---

## Data & Privacy

- All data saved **locally** in `nexus-data.json` (auto-created on first run)
- Settings saved in `nexus-config.json`
- Auto-backup keeps the last 10 hourly snapshots in `backups/`
- No cloud, no accounts, no tracking — everything stays on your machine

---

## Keyboard Shortcuts

All shortcuts use **Ctrl+Shift+** (Windows/Linux) or **Cmd+Shift+** (Mac) to avoid accidental activation.

| Shortcut | Action |
|----------|--------|
| Ctrl+Shift+D | Dashboard |
| Ctrl+Shift+Y | Today |
| Ctrl+Shift+C | Capture |
| Ctrl+Shift+T | Tasks |
| Ctrl+Shift+J | Journal |
| Ctrl+Shift+G | Goals |
| Ctrl+Shift+V | Vault |
| Ctrl+Shift+S | Search |
| Ctrl+Shift+F | Focus Mode |

---

## Vault Connection (Obsidian)

When you connect your Obsidian vault folder in Settings, Nexus gains extra features:

- **Rapid log** — journal entries can be saved to your daily vault note
- **Capture bridge** — captures are appended to a quick-capture file in your vault
- **Calendar** — vault daily entries show as journal dots on the calendar
- **Growth** — tag trends include vault entries; knowledge areas match vault files by keyword
- **Task sync** — reads tasks (checkboxes) from vault markdown files

**Vault path examples:**
- Windows: `C:\Users\yourname\Documents\MyVault`
- Mac: `/Users/yourname/Documents/MyVault`

---

## Desktop App (Electron)

Run Nexus as a standalone desktop app — no browser, no terminal window visible to the user.

### Build from source

**Prerequisites:** Node.js installed (see above)

```bash
# Install dependencies (one-time)
npm install

# Run as desktop app (dev mode)
npm run electron

# Build installer
npm run build:win    # Windows → dist/Nexus Setup.exe
npm run build:mac    # macOS  → dist/Nexus.dmg
npm run build:linux  # Linux  → dist/Nexus.AppImage
```

The built installer bundles everything — users don't need Node.js installed.

---

## AI Insights (optional, bring your own key)

Nexus can analyse your journal entries and give you weekly reflections. It uses your **own** API key — no subscription, no data sent to Nexus servers.

**Supported providers:** Claude (Anthropic), ChatGPT (OpenAI), Gemini (Google)

**Setup:**
1. Go to **Settings → AI Settings**
2. Select your provider
3. Paste your API key (stored locally in `nexus-data.json`, never shared)
4. Toggle **AI features on**
5. Open **Journal** → click **✨ AI Insights**

**Cost:** Uses the cheapest model for each provider (Haiku / GPT-4o-mini / Gemini Flash). A typical request costs less than $0.01.

To remove your key at any time: Settings → AI Settings → **Clear Key**.

---

## Cross-Device Sync

Nexus is local-first — data lives in `nexus-data.json`. To sync across devices, see **[sync.md](sync.md)** for a full guide covering:

- **Syncthing** — free, P2P, no cloud account required (recommended)
- **Private Git repo** — free, with helper scripts included
- **Cloud folder** — OneDrive / Google Drive / Dropbox
- **Self-hosted VPS** — full control, ~$4/month

---

## Troubleshooting

**"node is not recognized" / "command not found: node"**
Node.js isn't installed or wasn't added to PATH. Re-run the Node.js installer and restart your computer.

**Port already in use**
Another app is using port 3456. Open `server.js` and change `3456` near the top to another number like `3457`, then open `http://localhost:3457`.

**Windows: Black window closes immediately**
Right-click `start-nexus.bat` → **Run as administrator**, or open Command Prompt and run `node server.js` to see the error message.

**Mac: "permission denied" on start-nexus.command**
Run once in Terminal:
```bash
chmod +x ~/Apps/nexus-study-hub/start-nexus.command
```

**Mac: "cannot be opened because the developer cannot be verified"**
Right-click the file → **Open** → **Open** in the dialog. This only needs to be done once.

**I lost my data after updating**
Check the `backups/` folder — hourly snapshots are saved there automatically. You can restore by copying the most recent backup file and renaming it to `nexus-data.json`.
