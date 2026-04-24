# System Monitor Widget

Small always-on-top Electron overlay for CPU, thermal, GPU, RAM, battery, network, and storage. A tray icon handles background use, hiding the widget, optional startup, and quitting.

---

## What you need

- **Git** (to clone the repository)
- **Node.js** (LTS recommended, e.g. v20 or v22) and **npm** (comes with Node)
- **Windows 64-bit** if you want to build the portable `.exe` (the scripts target Windows)

---

## After you clone the repo

### 1. Go into the project folder

The app lives under `desktop-widget`. If you cloned the parent repo `wiggets`:

```bash
cd desktop-widget
```

If your clone only contains this app, you may already be at the project root; use the folder that has `package.json`.

### 2. Install dependencies

```bash
npm install
```

This downloads Electron (large download) and other packages into `node_modules/`. That folder is listed in `.gitignore` and must **not** be committed.

**If Electron fails to install** (error about deleting `node_modules/electron` or missing `path.txt`), remove the broken folder and install again:

```bash
rmdir /s /q node_modules\electron
npm install electron --save-dev
```

(On PowerShell you can use `Remove-Item -Recurse -Force node_modules\electron`.)

### 3. Run the app in development

```bash
npm start
```

Always run the app this way (or via the built `.exe`). **Do not open `index.html` in a normal browser**; the system APIs and tray only work inside Electron.

**Tray-only first launch** (no widget until you open it from the tray):

```bash
npm run start:bg
```

### 4. (Optional) Build a portable Windows executable

```bash
npm run dist
```

When it finishes, open the `release` folder. You should see something like:

`SystemMonitorWidget-<version>-portable.exe`

Double-click that file to run without Node installed. The `release/` directory is ignored by Git.

---

## Git and `.gitignore`

This repository’s root is the **`desktop-widget`** folder (where `.git` lives). The **`.gitignore` file there** tells Git to skip `node_modules/`, `release/`, build artifacts, logs, local env files, and common IDE junk.

After cloning, a normal workflow is:

```bash
git add .
git status
```

You should **not** see `node_modules` or `release` staged. If you ever committed them by mistake:

```bash
git rm -r --cached node_modules
git rm -r --cached release
```

Then commit the updated `.gitignore` and your source files only.

---

## Notes on accuracy and hardware

- **CPU % (Windows)** uses performance-style counters so it usually tracks Task Manager better than raw Node CPU sampling.
- **CPU temperature** may show **N/A** on many desktops where Windows does not expose a reliable sensor via WMI.
- **NVIDIA GPU** load and temperature appear when the driver stack exposes them (e.g. via `nvidia-smi`); other vendors may only show the adapter name.
