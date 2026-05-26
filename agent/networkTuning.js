import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";

const MANAGED_CONFIG_PATH = "/etc/sysctl.d/99-chiken-network.conf";
const MANAGED_MARKER = "# Managed by chiken-easy network tuning";
const BACKUP_FILE_NAME = "rollback.json";
const APPLY_PROFILES = new Set(["enable-bbr", "enable-bbr2", "set-cubic", "remove-chiken-tuning"]);
const ALL_PROFILES = new Set([...APPLY_PROFILES, "rollback"]);
const ALL_ACTIONS = new Set(["inspect", "dry-run", "apply", "rollback"]);

function cleanText(value) {
  return String(value ?? "").trim();
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeSlashPath(targetPath) {
  const text = cleanText(targetPath || "/");
  if (!text.startsWith("/")) return `/${text}`;
  return text;
}

function hostPath(hostPrefix, targetPath) {
  const normalized = normalizeSlashPath(targetPath);
  const prefix = cleanText(hostPrefix || "/");
  if (!prefix || prefix === "/") return normalized;
  return path.join(prefix, normalized.slice(1));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function writeText(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, value, "utf8");
}

function fileExists(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function parseKeyValueFile(text) {
  const result = {};
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 0) continue;
    const key = cleanText(line.slice(0, index));
    const value = cleanText(line.slice(index + 1));
    if (!key) continue;
    result[key] = value;
  }
  return result;
}

function parseOsRelease(text) {
  const data = {};
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    const value = line
      .slice(index + 1)
      .trim()
      .replace(/^"/, "")
      .replace(/"$/, "");
    data[key] = value;
  }
  return data;
}

function procSysPath(procRoot, key) {
  return path.join(cleanText(procRoot || "/proc") || "/proc", "sys", ...String(key || "").split("."));
}

function readSysctlValue(procRoot, key) {
  return readText(procSysPath(procRoot, key)).trim();
}

function writeSysctlValue(key, value) {
  fs.writeFileSync(procSysPath("/proc", key), `${cleanText(value)}\n`, "utf8");
}

function splitWords(value) {
  return cleanText(value)
    .split(/\s+/)
    .map((item) => cleanText(item))
    .filter(Boolean);
}

function commandResult(ok, output = "", code = 0) {
  return { ok: Boolean(ok), output: cleanText(output), code: Number(code || 0) || 0 };
}

function execAllowed(command, args = [], options = {}) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: 30000, maxBuffer: 2 * 1024 * 1024, ...options }, (error, stdout, stderr) => {
      resolve(commandResult(!error, `${stdout || ""}${stderr || ""}`, error?.code || 0));
    });
  });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function pickStatusError(status, fallback) {
  if (!status) return fallback;
  if (Array.isArray(status.errors) && status.errors.length) return status.errors.join("; ");
  return cleanText(status.error || fallback);
}

function buildManagedConfig(profile, targetSettings, currentConfig = {}) {
  const lines = [
    MANAGED_MARKER,
    `# profile=${profile}`,
    `# updated_at=${nowIso()}`
  ];

  const qdisc = cleanText(targetSettings.defaultQdisc || currentConfig["net.core.default_qdisc"]);
  const congestionControl = cleanText(targetSettings.congestionControl || currentConfig["net.ipv4.tcp_congestion_control"]);
  if (qdisc) lines.push(`net.core.default_qdisc=${qdisc}`);
  if (congestionControl) lines.push(`net.ipv4.tcp_congestion_control=${congestionControl}`);
  return `${lines.join("\n")}\n`;
}

function readManagedConfigSnapshot(runtime) {
  const content = readText(runtime.configPath);
  return {
    path: MANAGED_CONFIG_PATH,
    hostPath: runtime.configPath,
    exists: fileExists(runtime.configPath),
    managedByChiken: content.includes(MANAGED_MARKER),
    sha256: content ? sha256(content) : "",
    content,
    values: parseKeyValueFile(content),
    profile: cleanText((content.match(/#\s*profile=([^\r\n]+)/) || [])[1])
  };
}

function summarizeSnapshot(status) {
  return {
    congestionControl: cleanText(status?.current?.congestionControl),
    qdisc: cleanText(status?.current?.defaultQdisc),
    availableCongestionControls: status?.current?.availableCongestionControls || [],
    persisted: Boolean(status?.current?.persisted),
    managedProfile: cleanText(status?.current?.managedProfile),
    proxyImpact: "Evaluate alongside proxy-check latency, packet loss, and throughput."
  };
}

function loadBackup(runtime) {
  if (!fileExists(runtime.backupPath)) return null;
  try {
    return JSON.parse(readText(runtime.backupPath));
  } catch {
    return null;
  }
}

function saveBackup(runtime, payload) {
  ensureDir(path.dirname(runtime.backupPath));
  writeText(runtime.backupPath, `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}

function removeBackup(runtime) {
  if (!fileExists(runtime.backupPath)) return false;
  fs.rmSync(runtime.backupPath, { force: true });
  return true;
}

async function commandExists(command) {
  const result = await execAllowed(command, ["--help"]);
  return result.ok || result.code !== 0;
}

async function readKernelInfo() {
  const [kernel, arch] = await Promise.all([execAllowed("uname", ["-r"]), execAllowed("uname", ["-m"])]);
  return {
    kernel: cleanText(kernel.output) || os.release(),
    arch: cleanText(arch.output) || os.arch()
  };
}

async function probeModule(moduleName) {
  const module = cleanText(moduleName);
  if (!module) return false;
  const result = await execAllowed("modprobe", ["-n", "-q", module]);
  return result.ok;
}

async function loadModule(moduleName) {
  const module = cleanText(moduleName);
  if (!module) return commandResult(false, "module name is required");
  return execAllowed("modprobe", [module], { timeout: 60000 });
}

function createDirectRuntime(options = {}) {
  const stateDir = cleanText(options.stateDir || path.resolve("agent-state")) || path.resolve("agent-state");
  const networkStateDir = path.join(stateDir, "network-tuning");
  ensureDir(networkStateDir);

  return {
    helperMode: Boolean(options.helperMode),
    hostPrefix: cleanText(options.hostPrefix || "/") || "/",
    procRoot: cleanText(options.procRoot || "/proc") || "/proc",
    serviceMode: cleanText(options.serviceMode || "systemd") || "systemd",
    configPath: hostPath(options.hostPrefix || "/", MANAGED_CONFIG_PATH),
    backupPath: path.join(networkStateDir, BACKUP_FILE_NAME),
    inspectConfigPath: MANAGED_CONFIG_PATH,
    canModify: process.platform === "linux" && typeof process.getuid === "function" && process.getuid() === 0,
    stateDir: networkStateDir
  };
}

async function inspectRuntime(runtime) {
  const osReleaseText =
    readText(hostPath(runtime.hostPrefix, "/etc/os-release")) || readText(hostPath(runtime.hostPrefix, "/usr/lib/os-release"));
  const osRelease = parseOsRelease(osReleaseText);
  const config = readManagedConfigSnapshot(runtime);
  const current = {
    congestionControl: readSysctlValue(runtime.procRoot, "net.ipv4.tcp_congestion_control"),
    availableCongestionControls: splitWords(readSysctlValue(runtime.procRoot, "net.ipv4.tcp_available_congestion_control")),
    defaultQdisc: readSysctlValue(runtime.procRoot, "net.core.default_qdisc"),
    persisted: config.exists,
    managedProfile: config.profile || "",
    managedConfigPath: MANAGED_CONFIG_PATH,
    managedByChiken: config.managedByChiken,
    configValues: config.values
  };

  const kernelInfo = await readKernelInfo();
  const [hasModprobe, hasSysctlBinary, bbrModule, bbr2Module, fqModule] = await Promise.all([
    commandExists("modprobe"),
    commandExists("sysctl"),
    probeModule("tcp_bbr"),
    probeModule("tcp_bbr2"),
    probeModule("sch_fq")
  ]);

  const bbrLoaded = current.availableCongestionControls.includes("bbr");
  const bbr2Loaded = current.availableCongestionControls.includes("bbr2");
  const fqLoaded = current.defaultQdisc === "fq" || fileExists("/sys/module/sch_fq");
  const support = {
    bbr: bbrLoaded || bbrModule,
    bbr2: bbr2Loaded || bbr2Module,
    fq: fqLoaded || fqModule,
    cubic: current.availableCongestionControls.includes("cubic"),
    canModify: runtime.canModify,
    hasModprobe,
    hasSysctlBinary,
    helperMode: runtime.helperMode,
    applyTransport: runtime.helperMode ? "host-helper" : "direct",
    profiles: Array.from(APPLY_PROFILES)
  };

  const backup = loadBackup(runtime);
  const risks = [
    "BBR changes host-wide TCP behavior and can affect all services on this machine.",
    "BBR does not guarantee better results across all mainland China carriers or all routes.",
    "Always compare proxy-check latency, loss, throughput, and real application behavior before keeping the change."
  ];

  if (!support.canModify) risks.push("The current runtime is not root, so apply and rollback are unavailable.");
  if (!support.fq) risks.push("The fq qdisc is not explicitly available, so BBR enablement is unsafe here.");
  if (!support.bbr) risks.push("The kernel does not clearly expose BBR support yet.");
  if (support.bbr2 && !bbr2Loaded) risks.push("BBR2 support appears module-based or vendor-specific; use it only after explicit dry-run review.");

  let recommendation = {
    profile: "",
    title: "Manual review required",
    reason: "Inspect current congestion control, qdisc, and proxy-check data before making changes.",
    canApply: support.canModify
  };

  if (!support.canModify) {
    recommendation = {
      profile: "",
      title: "Apply blocked",
      reason: "Network tuning needs root privileges on the agent target.",
      canApply: false
    };
  } else if (current.congestionControl === "bbr" && current.defaultQdisc === "fq") {
    recommendation = {
      profile: "",
      title: "Already using BBR + fq",
      reason: "This host is already on the common BBR profile; validate with proxy-check before changing again.",
      canApply: true
    };
  } else if (support.bbr && support.fq) {
    recommendation = {
      profile: "enable-bbr",
      title: "BBR is the safer first trial",
      reason: "The kernel reports BBR support and fq is available. Start with BBR, not BBR2.",
      canApply: true
    };
  } else if (support.bbr2 && support.fq) {
    recommendation = {
      profile: "enable-bbr2",
      title: "Only consider BBR2 with extra caution",
      reason: "BBR is not clearly available, but BBR2 appears supported. Use dry-run and be ready to rollback.",
      canApply: true
    };
  } else if (support.cubic) {
    recommendation = {
      profile: "set-cubic",
      title: "Keep or restore Cubic",
      reason: "The host lacks a clear BBR path, so Cubic is the safer baseline.",
      canApply: true
    };
  }

  return {
    ok: true,
    action: "inspect",
    status: {
      system: {
        platform: process.platform,
        distro: cleanText(osRelease.PRETTY_NAME || osRelease.NAME || "unknown"),
        kernel: kernelInfo.kernel,
        arch: kernelInfo.arch,
        isRoot: runtime.canModify,
        serviceMode: runtime.serviceMode,
        sysctl: {
          procRoot: runtime.procRoot,
          configPath: MANAGED_CONFIG_PATH,
          configHostPath: runtime.configPath,
          writable: runtime.canModify
        }
      },
      current,
      support,
      recommendation,
      risks,
      backup: backup
        ? {
            exists: true,
            createdAt: backup.createdAt,
            profile: cleanText(backup.profile),
            previous: summarizeSnapshot(backup.beforeStatus)
          }
        : {
            exists: false,
            createdAt: "",
            profile: "",
            previous: null
          }
    },
    output: "network tuning inspection complete"
  };
}

function ensureLinux(status) {
  if (status?.status?.system?.platform !== "linux") throw new Error("network tuning only supports Linux agents");
}

function ensureApplyProfile(profile) {
  const normalized = cleanText(profile);
  if (!APPLY_PROFILES.has(normalized)) throw new Error(`unsupported network tuning profile: ${normalized || "empty"}`);
  return normalized;
}

function ensureAnyProfile(profile) {
  const normalized = cleanText(profile);
  if (!ALL_PROFILES.has(normalized)) throw new Error(`unsupported network tuning profile: ${normalized || "empty"}`);
  return normalized;
}

function buildProfileTarget(profile, status, backup) {
  const current = status.status.current || {};
  const previous = backup?.beforeStatus?.status?.current || {};
  const fallbackQdisc = cleanText(previous.defaultQdisc || current.defaultQdisc || "fq_codel") || "fq_codel";

  if (profile === "enable-bbr") {
    return {
      supported: Boolean(status.status.support?.bbr && status.status.support?.fq),
      error: status.status.support?.bbr ? "fq qdisc support is required for BBR" : "BBR is not supported on this system",
      congestionControl: "bbr",
      defaultQdisc: "fq",
      module: "tcp_bbr",
      removeConfig: false
    };
  }

  if (profile === "enable-bbr2") {
    return {
      supported: Boolean(status.status.support?.bbr2 && status.status.support?.fq),
      error: status.status.support?.bbr2 ? "fq qdisc support is required for BBR2" : "BBR2 is not explicitly supported on this system",
      congestionControl: "bbr2",
      defaultQdisc: "fq",
      module: "tcp_bbr2",
      removeConfig: false
    };
  }

  if (profile === "set-cubic") {
    return {
      supported: Boolean(status.status.support?.cubic),
      error: "Cubic is not reported in available congestion control algorithms",
      congestionControl: "cubic",
      defaultQdisc: fallbackQdisc,
      module: "",
      removeConfig: false
    };
  }

  if (profile === "remove-chiken-tuning") {
    return {
      supported: true,
      error: "",
      congestionControl: cleanText(previous.congestionControl || "cubic") || "cubic",
      defaultQdisc: fallbackQdisc,
      module: "",
      removeConfig: true
    };
  }

  throw new Error(`unsupported network tuning profile: ${profile}`);
}

function buildDryRunPlan(profile, inspectResult, backup) {
  const normalized = ensureAnyProfile(profile);
  if (normalized === "rollback") {
    return {
      ok: Boolean(backup),
      profile: "rollback",
      supported: Boolean(backup),
      target: backup ? summarizeSnapshot(backup.beforeStatus) : null,
      steps: backup
        ? [
            "Restore the previous runtime congestion control and qdisc from backup.",
            "Restore or remove /etc/sysctl.d/99-chiken-network.conf based on the saved pre-change state.",
            "Recheck current network tuning status."
          ]
        : ["No rollback backup is available yet."],
      error: backup ? "" : "rollback backup not found"
    };
  }

  const target = buildProfileTarget(normalized, inspectResult, backup);
  return {
    ok: Boolean(target.supported),
    profile: normalized,
    supported: Boolean(target.supported),
    target: {
      congestionControl: target.congestionControl,
      defaultQdisc: target.defaultQdisc,
      removeManagedConfig: Boolean(target.removeConfig),
      managedConfigPath: MANAGED_CONFIG_PATH
    },
    steps: [
      "Capture a rollback backup in the agent state directory before changing anything.",
      target.module ? `Load kernel support with modprobe ${target.module} if the module is available but not active yet.` : "No kernel module load is required for this profile.",
      target.removeConfig
        ? "Remove /etc/sysctl.d/99-chiken-network.conf and move runtime settings toward a safer baseline."
        : `Write ${MANAGED_CONFIG_PATH} with qdisc=${target.defaultQdisc} and congestion_control=${target.congestionControl}.`,
      `Apply runtime sysctl values: net.core.default_qdisc=${target.defaultQdisc}, net.ipv4.tcp_congestion_control=${target.congestionControl}.`,
      "Run a post-change inspection and compare proxy-check metrics before deciding to keep the change."
    ],
    error: target.supported ? "" : target.error
  };
}

function createRollbackBackup(runtime, profile, beforeStatus) {
  return saveBackup(runtime, {
    createdAt: nowIso(),
    profile,
    beforeStatus: clone(beforeStatus),
    configSnapshot: readManagedConfigSnapshot(runtime)
  });
}

function restoreManagedConfig(runtime, backup) {
  const snapshot = backup?.configSnapshot;
  if (!snapshot) throw new Error("backup config snapshot is missing");
  if (snapshot.exists) writeText(runtime.configPath, snapshot.content);
  else if (fileExists(runtime.configPath)) fs.rmSync(runtime.configPath, { force: true });
}

function applyRuntimeTarget(target) {
  if (cleanText(target.defaultQdisc)) writeSysctlValue("net.core.default_qdisc", target.defaultQdisc);
  if (cleanText(target.congestionControl)) writeSysctlValue("net.ipv4.tcp_congestion_control", target.congestionControl);
}

async function tryLoadModule(moduleName, status) {
  const module = cleanText(moduleName);
  if (!module) return commandResult(true, "module load skipped");
  const alreadyAvailable = (status.status.current?.availableCongestionControls || []).includes(module === "tcp_bbr2" ? "bbr2" : "bbr");
  if (alreadyAvailable) return commandResult(true, "module already active");
  const probe = await probeModule(module);
  if (!probe) return commandResult(false, `${module} is not available on this system`);
  return loadModule(module);
}

async function applyProfile(runtime, profile) {
  const beforeStatus = await inspectRuntime(runtime);
  ensureLinux(beforeStatus);
  if (!beforeStatus.status.support.canModify) throw new Error("network tuning requires root privileges");
  const existingBackup = loadBackup(runtime);
  const target = buildProfileTarget(profile, beforeStatus, existingBackup);
  if (!target.supported) {
    return {
      ok: false,
      action: "apply",
      profile,
      status: beforeStatus.status,
      before: summarizeSnapshot(beforeStatus.status),
      after: summarizeSnapshot(beforeStatus.status),
      plan: buildDryRunPlan(profile, beforeStatus, existingBackup),
      output: target.error || "profile is not supported on this system"
    };
  }

  const plan = buildDryRunPlan(profile, beforeStatus, existingBackup);
  const backup = createRollbackBackup(runtime, profile, beforeStatus);
  try {
    const moduleLoad = await tryLoadModule(target.module, beforeStatus);
    if (!moduleLoad.ok && target.module) throw new Error(moduleLoad.output || `failed to load ${target.module}`);

    if (target.removeConfig) {
      if (fileExists(runtime.configPath)) fs.rmSync(runtime.configPath, { force: true });
    } else {
      writeText(runtime.configPath, buildManagedConfig(profile, target, beforeStatus.status.current?.configValues || {}));
    }

    applyRuntimeTarget(target);
    const afterStatus = await inspectRuntime(runtime);
    const after = summarizeSnapshot(afterStatus.status);
    if (cleanText(after.congestionControl) !== cleanText(target.congestionControl)) {
      throw new Error(`post-check congestion control mismatch: expected ${target.congestionControl}, got ${after.congestionControl || "empty"}`);
    }
    if (cleanText(after.qdisc) !== cleanText(target.defaultQdisc)) {
      throw new Error(`post-check qdisc mismatch: expected ${target.defaultQdisc}, got ${after.qdisc || "empty"}`);
    }

    return {
      ok: true,
      action: "apply",
      profile,
      status: afterStatus.status,
      before: summarizeSnapshot(beforeStatus.status),
      after,
      backup: {
        createdAt: backup.createdAt,
        profile: backup.profile,
        path: runtime.backupPath
      },
      plan,
      output: `${profile} applied successfully`
    };
  } catch (error) {
    let rollbackOutput = "";
    try {
      restoreManagedConfig(runtime, backup);
      applyRuntimeTarget({
        defaultQdisc: cleanText(backup.beforeStatus?.status?.current?.defaultQdisc),
        congestionControl: cleanText(backup.beforeStatus?.status?.current?.congestionControl)
      });
      rollbackOutput = "automatic rollback completed";
    } catch (rollbackError) {
      rollbackOutput = `automatic rollback failed: ${rollbackError.message}`;
    }

    const failedStatus = await inspectRuntime(runtime);
    return {
      ok: false,
      action: "apply",
      profile,
      status: failedStatus.status,
      before: summarizeSnapshot(beforeStatus.status),
      after: summarizeSnapshot(failedStatus.status),
      backup: {
        createdAt: backup.createdAt,
        profile: backup.profile,
        path: runtime.backupPath
      },
      plan,
      output: [cleanText(error.message), rollbackOutput].filter(Boolean).join("; ")
    };
  }
}

async function rollbackProfile(runtime) {
  const beforeStatus = await inspectRuntime(runtime);
  ensureLinux(beforeStatus);
  if (!beforeStatus.status.support.canModify) throw new Error("network tuning rollback requires root privileges");
  const backup = loadBackup(runtime);
  const plan = buildDryRunPlan("rollback", beforeStatus, backup);
  if (!backup) {
    return {
      ok: false,
      action: "rollback",
      profile: "rollback",
      status: beforeStatus.status,
      before: summarizeSnapshot(beforeStatus.status),
      after: summarizeSnapshot(beforeStatus.status),
      plan,
      output: "rollback backup not found"
    };
  }

  try {
    restoreManagedConfig(runtime, backup);
    applyRuntimeTarget({
      defaultQdisc: cleanText(backup.beforeStatus?.status?.current?.defaultQdisc),
      congestionControl: cleanText(backup.beforeStatus?.status?.current?.congestionControl)
    });
    const afterStatus = await inspectRuntime(runtime);
    return {
      ok: true,
      action: "rollback",
      profile: "rollback",
      status: afterStatus.status,
      before: summarizeSnapshot(beforeStatus.status),
      after: summarizeSnapshot(afterStatus.status),
      plan,
      output: "network tuning rollback completed"
    };
  } catch (error) {
    const failedStatus = await inspectRuntime(runtime);
    return {
      ok: false,
      action: "rollback",
      profile: "rollback",
      status: failedStatus.status,
      before: summarizeSnapshot(beforeStatus.status),
      after: summarizeSnapshot(failedStatus.status),
      plan,
      output: cleanText(error.message) || "network tuning rollback failed"
    };
  }
}

function parseHelperPayload(output) {
  const lines = String(output || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]);
    } catch {}
  }
  return null;
}

async function runViaHelper(payload, options = {}) {
  const helperImage = cleanText(options.helperImage || "chiken-easy:latest") || "chiken-easy:latest";
  const agentContainer = cleanText(options.agentContainerName || "chiken-agent") || "chiken-agent";
  const stateDir = cleanText(options.stateDir || path.resolve("agent-state")) || path.resolve("agent-state");
  const encodedPayload = Buffer.from(JSON.stringify({ ...payload, _helper: true }), "utf8").toString("base64");
  const args = [
    "run",
    "--rm",
    "--network",
    "host",
    "--privileged",
    "--volumes-from",
    agentContainer,
    "-v",
    "/etc:/host/etc",
    "-v",
    "/lib/modules:/lib/modules:ro",
    "-e",
    `CHIKEN_NETWORK_TUNING_PAYLOAD_B64=${encodedPayload}`,
    "-e",
    `CHIKEN_NETWORK_TUNING_STATE_DIR=${stateDir}`,
    helperImage,
    "node",
    "agent/networkHelper.js"
  ];
  const result = await execAllowed("docker", args, { timeout: 180000 });
  if (!result.ok) {
    return {
      ok: false,
      action: cleanText(payload.action),
      profile: cleanText(payload.profile),
      output: result.output || "failed to start docker network tuning helper"
    };
  }
  const parsed = parseHelperPayload(result.output);
  if (!parsed || typeof parsed !== "object") {
    return {
      ok: false,
      action: cleanText(payload.action),
      profile: cleanText(payload.profile),
      output: `helper returned unreadable output: ${result.output}`
    };
  }
  return parsed;
}

export async function executeNetworkTuningDirect(payload = {}, options = {}) {
  const runtime = createDirectRuntime(options);
  const action = cleanText(payload.action || "inspect") || "inspect";
  if (!ALL_ACTIONS.has(action)) {
    return {
      ok: false,
      action,
      profile: cleanText(payload.profile),
      output: `unsupported network tuning action: ${action}`
    };
  }

  if (action === "inspect") return inspectRuntime(runtime);

  const inspectResult = await inspectRuntime(runtime);
  const backup = loadBackup(runtime);

  if (action === "dry-run") {
    const profile = ensureAnyProfile(payload.profile || "enable-bbr");
    const plan = buildDryRunPlan(profile, inspectResult, backup);
    return {
      ok: Boolean(plan.ok),
      action: "dry-run",
      profile,
      status: inspectResult.status,
      before: summarizeSnapshot(inspectResult.status),
      after: summarizeSnapshot(inspectResult.status),
      plan,
      output: plan.ok ? "network tuning dry-run ready" : plan.error || "network tuning dry-run failed"
    };
  }

  if (action === "apply") {
    const profile = ensureApplyProfile(payload.profile);
    return applyProfile(runtime, profile);
  }

  if (action === "rollback") {
    return rollbackProfile(runtime);
  }

  return {
    ok: false,
    action,
    profile: cleanText(payload.profile),
    output: `unhandled network tuning action: ${action}`
  };
}

export function createNetworkTuningManager(options = {}) {
  const serviceMode = cleanText(options.serviceMode || "systemd") || "systemd";
  const stateDir = cleanText(options.stateDir || path.resolve("agent-state")) || path.resolve("agent-state");
  const helperImage = cleanText(options.helperImage || "chiken-easy:latest") || "chiken-easy:latest";
  const agentContainerName = cleanText(options.agentContainerName || "chiken-agent") || "chiken-agent";
  const hostPrefix = cleanText(options.hostPrefix || "/") || "/";
  const procRoot = cleanText(options.procRoot || "/proc") || "/proc";

  return {
    async handle(payload = {}) {
      if (serviceMode === "docker" && !payload._helper) {
        return runViaHelper(payload, { helperImage, agentContainerName, stateDir });
      }
      return executeNetworkTuningDirect(payload, {
        helperMode: Boolean(payload._helper),
        hostPrefix,
        procRoot,
        serviceMode,
        stateDir
      });
    }
  };
}

export { MANAGED_CONFIG_PATH, APPLY_PROFILES };
