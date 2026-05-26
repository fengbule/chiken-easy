import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";

function round(value, digits = 2) {
  const scale = 10 ** digits;
  return Math.round((Number(value) || 0) * scale) / scale;
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function hostPath(hostRoot, targetPath) {
  if (!targetPath.startsWith("/")) return path.join(hostRoot, targetPath);
  return path.join(hostRoot, targetPath.slice(1));
}

function readHostProc(hostRoot, targetPath) {
  return readText(hostPath(hostRoot, targetPath));
}

function parseKeyValueTable(text, separator = ":") {
  const map = {};
  for (const line of String(text || "").split("\n")) {
    const index = line.indexOf(separator);
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    map[key] = value;
  }
  return map;
}

function parseMemInfo(hostRoot) {
  const map = parseKeyValueTable(readHostProc(hostRoot, "/proc/meminfo"));
  const procTotal = Number((map.MemTotal || "0").split(/\s+/)[0]) * 1024;
  const procAvailable = Number((map.MemAvailable || "0").split(/\s+/)[0]) * 1024;
  const total = procTotal || os.totalmem();
  const available = procAvailable || os.freemem();
  const swapTotal = Number((map.SwapTotal || "0").split(/\s+/)[0]) * 1024;
  const swapFree = Number((map.SwapFree || "0").split(/\s+/)[0]) * 1024;
  const used = Math.max(0, total - available);
  const swapUsed = Math.max(0, swapTotal - swapFree);
  return {
    total,
    used,
    free: Math.max(0, available),
    usage: total > 0 ? round((used / total) * 100) : 0,
    swapTotal,
    swapUsed,
    swapFree: Math.max(0, swapFree),
    swapUsage: swapTotal > 0 ? round((swapUsed / swapTotal) * 100) : 0
  };
}

function parseCpuSample(hostRoot) {
  const firstLine = readHostProc(hostRoot, "/proc/stat").split("\n")[0] || "";
  const values = firstLine
    .trim()
    .split(/\s+/)
    .slice(1)
    .map((value) => Number(value) || 0);

  if (!values.length) {
    const fallback = os.cpus();
    if (!fallback.length) return null;
    const idle = fallback.reduce((sum, cpu) => sum + Number(cpu.times?.idle || 0), 0);
    const total = fallback.reduce((sum, cpu) => sum + Object.values(cpu.times || {}).reduce((inner, value) => inner + (Number(value) || 0), 0), 0);
    return { idle, total };
  }
  const idle = (values[3] || 0) + (values[4] || 0);
  const total = values.reduce((sum, value) => sum + value, 0);
  return { idle, total };
}

function parseNetSample(hostRoot) {
  const interfaces = [];
  let rxTotal = 0;
  let txTotal = 0;

  for (const row of readHostProc(hostRoot, "/proc/net/dev").split("\n").slice(2)) {
    if (!row.includes(":")) continue;
    const [nameRaw, valuesRaw] = row.split(":");
    const name = String(nameRaw || "").trim();
    if (!name || name === "lo") continue;
    const values = String(valuesRaw || "")
      .trim()
      .split(/\s+/)
      .map((value) => Number(value) || 0);

    const rx = values[0] || 0;
    const tx = values[8] || 0;
    rxTotal += rx;
    txTotal += tx;
    interfaces.push({ name, rxTotal: rx, txTotal: tx });
  }

  if (!interfaces.length) {
    interfaces.push(
      ...Object.entries(os.networkInterfaces())
        .filter(([, rows]) => (rows || []).some((row) => row && !row.internal))
        .map(([name]) => ({ name, rxTotal: 0, txTotal: 0 }))
    );
  }

  return { interfaces, rxTotal, txTotal };
}

function parseUptime(hostRoot) {
  const raw = readHostProc(hostRoot, "/proc/uptime").trim();
  const seconds = Number(raw.split(/\s+/)[0]);
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : Math.round(os.uptime());
}

function runCommand(command, args = [], options = {}) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: 30000, maxBuffer: 1024 * 1024, ...options }, (error, stdout, stderr) => {
      resolve({ ok: !error, output: `${stdout || ""}${stderr || ""}`.trim() });
    });
  });
}

async function readDiskUsage(hostRoot) {
  const target = hostRoot && hostRoot !== "/" ? hostRoot : "/";
  const result = await runCommand("df", ["-Pk", target]);
  if (!result.ok) {
    return { total: 0, used: 0, free: 0, usage: 0, mount: target };
  }

  const rows = result.output.split("\n").filter(Boolean);
  const last = rows[rows.length - 1] || "";
  const parts = last.trim().split(/\s+/);
  if (parts.length < 6) {
    return { total: 0, used: 0, free: 0, usage: 0, mount: target };
  }

  const total = (Number(parts[1]) || 0) * 1024;
  const used = (Number(parts[2]) || 0) * 1024;
  const free = (Number(parts[3]) || 0) * 1024;
  const usage = Number(String(parts[4] || "0").replace("%", "")) || 0;
  const mount = parts[5] || target;
  return { total, used, free, usage: round(usage), mount };
}

export function createProbeCollector(options = {}) {
  const hostRoot = String(options.hostRoot || "/").trim() || "/";
  const cpuMeta = os.cpus();
  let lastCpu = null;
  let lastNet = null;

  return async function collectProbe() {
    const now = Date.now();
    const cpuSample = parseCpuSample(hostRoot);
    const netSample = parseNetSample(hostRoot);
    const memory = parseMemInfo(hostRoot);
    const disk = await readDiskUsage(hostRoot);
    const load = os.loadavg();

    let cpuUsage = 0;
    if (cpuSample && lastCpu) {
      const totalDelta = cpuSample.total - lastCpu.total;
      const idleDelta = cpuSample.idle - lastCpu.idle;
      if (totalDelta > 0) {
        cpuUsage = round(((totalDelta - idleDelta) / totalDelta) * 100);
      }
    }
    lastCpu = cpuSample;

    let rxRate = 0;
    let txRate = 0;
    if (lastNet) {
      const seconds = Math.max(1, (now - lastNet.at) / 1000);
      rxRate = round(Math.max(0, (netSample.rxTotal - lastNet.rxTotal) / seconds));
      txRate = round(Math.max(0, (netSample.txTotal - lastNet.txTotal) / seconds));
    }
    lastNet = { ...netSample, at: now };

    return {
      collectedAt: new Date(now).toISOString(),
      uptimeSec: parseUptime(hostRoot),
      cpu: {
        usage: cpuUsage,
        cores: cpuMeta.length,
        model: cpuMeta[0]?.model || "",
        load1: round(load[0] || 0),
        load5: round(load[1] || 0),
        load15: round(load[2] || 0)
      },
      memory,
      disk,
      network: {
        interfaces: netSample.interfaces.map((item) => item.name),
        rxRate,
        txRate,
        rxTotal: netSample.rxTotal,
        txTotal: netSample.txTotal,
        total: netSample.rxTotal + netSample.txTotal
      }
    };
  };
}
