# System Monitor Widget

Small always-on-top Electron overlay for CPU, thermal, GPU, RAM, battery, network, and storage. Tray icon for background use and quitting.

## Requirements

- Node.js (for development)
- Windows x64 (portable build target)

## Setup

```bash
npm install
```

## Run

```bash
npm start
```

Do not open `index.html` in a browser; metrics and tray behavior require Electron.

Tray-only first launch:

```bash
npm run start:bg
```

## Build portable `.exe`

```bash
npm run dist
```

Output: `release/SystemMonitorWidget-1.0.0-portable.exe` (name includes version from `package.json`).

## Notes

- CPU % on Windows uses performance counters so it tracks Task Manager more closely than raw Node sampling.
- Some sensors (CPU temperature) may show N/A depending on hardware and drivers; NVIDIA GPU stats need a working driver/`nvidia-smi` path when applicable.
