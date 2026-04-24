const { app, BrowserWindow, screen, Tray, Menu, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");

let mainWindow = null;
let tray = null;
let isAppQuitting = false;

function prefsPath() {
  return path.join(app.getPath("userData"), "widget-prefs.json");
}

function loadPrefs() {
  try {
    return JSON.parse(fs.readFileSync(prefsPath(), "utf8"));
  } catch {
    return {};
  }
}

function savePrefs(prefs) {
  try {
    fs.mkdirSync(path.dirname(prefsPath()), { recursive: true });
    fs.writeFileSync(prefsPath(), JSON.stringify(prefs), "utf8");
  } catch (e) {
    console.error(e);
  }
}

function wantsSilentArgv() {
  return ["--silent", "--background", "--tray"].some((flag) => process.argv.includes(flag));
}

function shouldStartHiddenInTray() {
  return wantsSilentArgv() || !!loadPrefs().startHidden;
}

function trayIcon() {
  const fromExe = nativeImage.createFromPath(process.execPath);
  if (!fromExe.isEmpty()) {
    return fromExe.resize({ width: 16, height: 16 });
  }
  return nativeImage.createFromBuffer(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    )
  );
}

function setWindowsStartup(enabled) {
  if (process.platform !== "win32" && process.platform !== "darwin") return;
  try {
    if (enabled) {
      app.setLoginItemSettings({
        openAtLogin: true,
        path: process.execPath,
        args: ["--silent"]
      });
    } else {
      app.setLoginItemSettings({ openAtLogin: false });
    }
  } catch (e) {
    console.error(e);
  }
}

function buildTrayMenu() {
  const prefs = loadPrefs();
  let loginOpen = false;
  try {
    loginOpen = app.getLoginItemSettings().openAtLogin;
  } catch {
    loginOpen = false;
  }

  return Menu.buildFromTemplate([
    {
      label: "Show widget",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.setAlwaysOnTop(true);
        }
      }
    },
    {
      label: "Hide widget",
      click: () => {
        mainWindow?.hide();
      }
    },
    { type: "separator" },
    {
      label: "Start hidden in tray",
      type: "checkbox",
      checked: !!prefs.startHidden,
      click: (item) => {
        const next = { ...loadPrefs(), startHidden: item.checked };
        savePrefs(next);
        if (tray) tray.setContextMenu(buildTrayMenu());
      }
    },
    {
      label: "Run at Windows startup",
      type: "checkbox",
      checked: loginOpen,
      enabled: process.platform === "win32" || process.platform === "darwin",
      visible: process.platform === "win32" || process.platform === "darwin",
      click: (item) => {
        setWindowsStartup(item.checked);
        if (tray) tray.setContextMenu(buildTrayMenu());
      }
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => quitCompletely()
    }
  ]);
}

function createTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
  tray = new Tray(trayIcon());
  tray.setToolTip("System Monitor Widget");
  tray.setContextMenu(buildTrayMenu());

  tray.on("click", () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) mainWindow.hide();
    else {
      mainWindow.show();
      mainWindow.setAlwaysOnTop(true);
    }
  });
}

function quitCompletely() {
  isAppQuitting = true;
  if (tray) {
    tray.destroy();
    tray = null;
  }
  if (mainWindow) {
    mainWindow.destroy();
    mainWindow = null;
  }
  app.quit();
}

function createWindow() {
  const winWidth = 340;
  const winHeight = 460;
  const margin = 16;
  const { workArea } = screen.getPrimaryDisplay();

  mainWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: workArea.x + workArea.width - winWidth - margin,
    y: workArea.y + margin,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  });

  mainWindow.on("close", (e) => {
    if (isAppQuitting) return;
    e.preventDefault();
    mainWindow.hide();
  });

  mainWindow.once("ready-to-show", () => {
    if (shouldStartHiddenInTray()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
    }
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const wins = BrowserWindow.getAllWindows();
    if (wins.length === 0) return;
    const w = wins[0];
    if (w.isMinimized()) w.restore();
    w.show();
    w.setAlwaysOnTop(true);
    w.focus();
  });

  app.whenReady().then(() => {
    if (process.platform === "win32") {
      app.setAppUserModelId("com.desktopwidget.systemmonitor");
    }
    createWindow();
    createTray();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      if (!tray) createTray();
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("before-quit", () => {
    isAppQuitting = true;
  });
}
