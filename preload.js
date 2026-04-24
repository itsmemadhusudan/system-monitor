const { contextBridge } = require("electron");
const { execFileSync } = require("child_process");
const path = require("path");
const si = require("systeminformation");

const POWERSHELL_EXE = process.env.SystemRoot
  ? path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
  : "powershell.exe";

function runPowerShell(command) {
  try {
    return execFileSync(POWERSHELL_EXE, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
      encoding: "utf8",
      timeout: 10000,
      windowsHide: true
    }).trim();
  } catch {
    return "";
  }
}

/** Last numeric line or first number in stdout (PowerShell often adds blank lines). */
function parseCpuPercentOutput(text) {
  if (!text) return null;
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(/^([\d.,]+)\s*$/);
    if (m) {
      const n = parseFloat(m[1].replace(",", "."));
      if (Number.isFinite(n)) return n;
    }
  }
  const m = text.match(/(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function clampPct(n) {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, n));
}

/**
 * CPU % aligned with Task Manager on Windows.
 * Win32_Processor.LoadPercentage is often wrong/stuck; prefer perf counters + per-core fallback.
 */
function windowsCpuLoadPct(siCpuLoad) {
  if (process.platform !== "win32") return null;

  const qFormatted =
    "(Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor | Where-Object { $_.Name -eq '_Total' } | Select-Object -ExpandProperty PercentProcessorTime)";
  const n1 = clampPct(parseCpuPercentOutput(runPowerShell(qFormatted)));
  if (n1 != null) return n1;

  const qUtility =
    "(Get-Counter '\\Processor Information(_Total)\\% Processor Utility' -ErrorAction SilentlyContinue).CounterSamples[0].CookedValue";
  const n2 = clampPct(parseCpuPercentOutput(runPowerShell(qUtility)));
  if (n2 != null) return n2;

  const qLegacy =
    "(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average";
  const n3 = clampPct(parseCpuPercentOutput(runPowerShell(qLegacy)));
  if (n3 != null) return n3;

  const cores = siCpuLoad?.cpus;
  if (Array.isArray(cores) && cores.length > 0) {
    const loads = cores.map((c) => Number(c.load)).filter((x) => Number.isFinite(x));
    if (loads.length) {
      const avg = loads.reduce((a, b) => a + b, 0) / loads.length;
      const n4 = clampPct(avg);
      if (n4 != null) return n4;
    }
  }

  return null;
}

function summarizeGraphics(gfx) {
  if (!gfx || !Array.isArray(gfx.controllers)) return [];
  return gfx.controllers.map((c) => ({
    model: String(c.model || c.name || "GPU").trim(),
    vendor: String(c.vendor || "").trim(),
    utilizationGpu: c.utilizationGpu != null && !Number.isNaN(Number(c.utilizationGpu)) ? Number(c.utilizationGpu) : null,
    memoryUsed: c.memoryUsed != null ? Number(c.memoryUsed) : null,
    memoryTotal: c.memoryTotal != null ? Number(c.memoryTotal) : c.vram != null ? Number(c.vram) : null,
    temperatureGpu: c.temperatureGpu != null && !Number.isNaN(Number(c.temperatureGpu)) ? Number(c.temperatureGpu) : null
  }));
}

function mergeStorage(sizes, blocks) {
  const byMount = new Map();
  for (const b of blocks || []) {
    const m = String(b.mount || b.identifier || "")
      .trim()
      .toUpperCase();
    if (m) byMount.set(m, b);
    const n = String(b.name || "")
      .trim()
      .toUpperCase();
    if (n) {
      byMount.set(`${n}:`, b);
      byMount.set(n, b);
    }
  }

  return (sizes || [])
    .filter((s) => Number(s.size) > 0)
    .map((s) => {
      const mount = String(s.mount || s.fs || "").trim();
      const mu = mount.toUpperCase();
      const b = byMount.get(mu) || byMount.get(mu.replace(/:$/, "")) || null;
      return {
        mount,
        used: Number(s.used),
        total: Number(s.size),
        use: Number(s.use),
        fsType: String(s.type || ""),
        removable: !!(b && b.removable),
        label: b ? String(b.label || "").trim() : "",
        model: b ? String(b.model || "").trim() : "",
        physical: b ? String(b.physical || "").trim() : ""
      };
    })
    .sort((a, b) => a.mount.localeCompare(b.mount, undefined, { numeric: true }));
}

async function getDashboard() {
  const settled = await Promise.allSettled([
    si.currentLoad(),
    si.cpuTemperature(),
    si.graphics(),
    si.mem(),
    si.battery(),
    si.networkStats(),
    si.fsSize(),
    si.blockDevices()
  ]);

  const val = (i) => (settled[i].status === "fulfilled" ? settled[i].value : null);

  let cpuLoad = val(0);
  if (process.platform === "win32" && cpuLoad) {
    const pct = windowsCpuLoadPct(cpuLoad);
    if (pct != null) {
      cpuLoad = {
        ...cpuLoad,
        currentLoad: pct,
        currentLoadSource: "perf"
      };
    }
  }

  return {
    cpuLoad,
    cpuTemp: val(1),
    graphics: summarizeGraphics(val(2)),
    mem: val(3),
    battery: val(4),
    network: val(5),
    storage: mergeStorage(val(6), val(7))
  };
}

contextBridge.exposeInMainWorld("api", {
  getDashboard
});
