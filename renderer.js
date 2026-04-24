function bytesToGb(bytes) {
  return (bytes / 1024 / 1024 / 1024).toFixed(2);
}

function bitsToMbps(bitsPerSecond) {
  if (bitsPerSecond == null || Number.isNaN(bitsPerSecond)) return "0.00";
  return (bitsPerSecond / 1024 / 1024).toFixed(2);
}

function setValue(id, text) {
  const el = document.getElementById(id);
  if (el) el.innerText = text;
}

function pickCpuTemp(t) {
  if (!t) return null;
  if (t.main != null && !Number.isNaN(Number(t.main))) return Number(t.main);
  if (t.max != null && !Number.isNaN(Number(t.max))) return Number(t.max);
  const cores = Array.isArray(t.cores) ? t.cores.filter((n) => n != null && !Number.isNaN(Number(n))).map(Number) : [];
  if (cores.length) return Math.max(...cores);
  return null;
}

function formatThermal(cpuTemp, gfxList) {
  const parts = [];
  const ct = pickCpuTemp(cpuTemp);
  if (ct != null) parts.push(`CPU ${ct.toFixed(1)}°C`);
  if (cpuTemp?.chipset != null && !Number.isNaN(Number(cpuTemp.chipset))) {
    parts.push(`Chipset ${Number(cpuTemp.chipset).toFixed(1)}°C`);
  }

  for (const g of gfxList || []) {
    if (g.temperatureGpu != null) {
      const name = g.model.length > 20 ? `${g.model.slice(0, 18)}…` : g.model;
      parts.push(`${name} ${g.temperatureGpu.toFixed(0)}°C`);
    }
  }

  if (parts.length) return parts.join(" · ");
  return "N/A (no WMI / sensors)";
}

function formatGpu(gfxList) {
  if (!gfxList || !gfxList.length) return "N/A";
  return gfxList
    .map((g) => {
      const name = g.model.length > 16 ? `${g.model.slice(0, 14)}…` : g.model;
      if (g.utilizationGpu != null) {
        let extra = "";
        if (g.memoryTotal != null && g.memoryTotal > 0 && g.memoryUsed != null) {
          const u = g.memoryUsed / 1024;
          const t = g.memoryTotal / 1024;
          if (t > 0.1) extra = ` · VRAM ${u.toFixed(0)}/${t.toFixed(0)} GB`;
        }
        return `${name} ${g.utilizationGpu.toFixed(0)}%${extra}`;
      }
      return `${name}: —`;
    })
    .join("\n");
}

function formatStorage(volumes) {
  if (!volumes || !volumes.length) return "N/A";
  return volumes
    .map((v) => {
      const tag = v.removable ? "USB/removable" : v.physical || v.fsType || "disk";
      const label = v.label ? ` "${v.label}"` : "";
      const model = v.model && v.model.length > 0 ? ` · ${v.model.slice(0, 24)}` : "";
      return `${v.mount}${label}  ${bytesToGb(v.used)}/${bytesToGb(v.total)} GB (${v.use.toFixed(0)}%) · ${tag}${model}`;
    })
    .join("\n");
}

/** Sum throughput on all non-internal interfaces that look active (closer to Task Manager totals). */
function aggregateNetwork(rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const candidates = rows.filter((n) => n && !n.internal);
  const active = candidates.filter((n) => n.operstate === "up");
  const use = active.length ? active : candidates.length ? candidates : rows;
  let rx = 0;
  let tx = 0;
  for (const n of use) {
    rx += Number(n.rx_sec) || 0;
    tx += Number(n.tx_sec) || 0;
  }
  return { rx_sec: rx, tx_sec: tx, iface: use.length > 1 ? "all" : use[0]?.iface };
}

async function update() {
  if (!window.api || typeof window.api.getDashboard !== "function") {
    ["cpu", "thermal", "gpu", "ram", "battery", "network", "storage"].forEach((id) => setValue(id, "N/A"));
    return;
  }

  let dash;
  try {
    dash = await window.api.getDashboard();
  } catch {
    return;
  }

  const cpu = dash.cpuLoad;
  const mem = dash.mem;
  const battery = dash.battery;
  const network = aggregateNetwork(dash.network);

  const batteryValue = battery?.hasBattery
    ? `${Math.round(battery.percent)}% ${battery.isCharging ? "(Charging)" : ""}`.trim()
    : "N/A";

  setValue("cpu", cpu?.currentLoad != null ? `${Number(cpu.currentLoad).toFixed(1)}%` : "N/A");
  setValue("thermal", formatThermal(dash.cpuTemp, dash.graphics));
  setValue("gpu", formatGpu(dash.graphics));
  setValue(
    "ram",
    mem?.used != null && mem?.total != null ? `${bytesToGb(mem.used)} / ${bytesToGb(mem.total)} GB` : "N/A"
  );
  setValue("battery", batteryValue);
  setValue(
    "network",
    network && network.rx_sec != null
      ? `${bitsToMbps(network.rx_sec * 8)}↓ / ${bitsToMbps(network.tx_sec * 8)}↑ Mbps`
      : "N/A"
  );
  setValue("storage", formatStorage(dash.storage));
}

update();
setInterval(update, 2000);
