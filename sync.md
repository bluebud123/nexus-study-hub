# Cross-Device Sync Options for Nexus

Nexus stores all data in `nexus-data.json` locally. Here are your options to sync across devices, from free to cheap.

---

## Option 1: Syncthing (Free, Recommended)

**What it is:** Open-source, P2P file sync. No cloud account, no monthly fee. Works on Windows, Mac, Linux, Android, iOS.

**Setup:**
1. Download Syncthing from https://syncthing.net/ on both devices
2. Add the Nexus folder on both devices
3. Done — `nexus-data.json` syncs automatically whenever you're on the same network (or over the internet)

**Pros:** Free forever, private, no third party, works offline when on same network
**Cons:** Both devices need Syncthing running; needs network access to sync

---

## Option 2: Private Git Repo (Free)

Use a private GitHub/GitLab repo as a sync mechanism with a helper script.

**Setup:**
1. Create a private GitHub repo
2. Add `nexus-data.json` to it (remove it from `.gitignore` in your private fork)
3. Use the helper script below to push/pull

**sync-data.sh** (Mac/Linux):
```bash
#!/bin/bash
cd "$(dirname "$0")"
git add nexus-data.json
git commit -m "sync $(date '+%Y-%m-%d %H:%M')" --allow-empty
git push origin main
echo "Data pushed to GitHub"
```

**sync-data.bat** (Windows):
```bat
@echo off
cd /d "%~dp0"
git add nexus-data.json
git commit -m "sync %date% %time%" --allow-empty
git push origin main
echo Data pushed to GitHub
pause
```

**On the other device:** `git pull origin main` before opening Nexus.

---

## Option 3: Cloud Folder (Free tier available)

Point both devices to the same folder via:
- **OneDrive** (5GB free) — works on Windows natively
- **Google Drive** (15GB free) — needs Drive for Desktop app
- **Dropbox** (2GB free)

Just move the entire Nexus folder into the synced folder on both machines.

**Pros:** Automatic, no setup needed beyond installing the cloud app
**Cons:** Data goes through a cloud provider (less private)

---

## Option 4: Self-Hosted Sync (~$4-6/month)

For full control with automatic sync across any number of devices:

1. Rent a small VPS (Hetzner CAX11: €3.79/month, DigitalOcean: $4/month)
2. Install Syncthing on the VPS as a relay
3. All your devices sync through the VPS even when not on the same network

This gives you Syncthing's privacy with always-available sync.

---

## Conflict Handling

Nexus doesn't have real-time conflict resolution. Best practice:
- Only edit on one device at a time
- Sync before opening on a second device
- If a conflict occurs, the backup files in `nexus_data/backups/` can be used to recover
