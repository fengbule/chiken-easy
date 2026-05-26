import path from "path";
import { executeNetworkTuningDirect } from "./networkTuning.js";

function cleanText(value) {
  return String(value ?? "").trim();
}

async function main() {
  const encoded = cleanText(process.env.CHIKEN_NETWORK_TUNING_PAYLOAD_B64);
  if (!encoded) {
    console.log(JSON.stringify({ ok: false, action: "helper", output: "CHIKEN_NETWORK_TUNING_PAYLOAD_B64 is required" }));
    return;
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
    const result = await executeNetworkTuningDirect(payload, {
      helperMode: true,
      hostPrefix: "/host",
      procRoot: "/proc",
      serviceMode: "docker",
      stateDir: cleanText(process.env.CHIKEN_NETWORK_TUNING_STATE_DIR || path.resolve("agent-state")) || path.resolve("agent-state")
    });
    console.log(JSON.stringify(result));
  } catch (error) {
    console.log(JSON.stringify({ ok: false, action: "helper", output: error.message || "network helper failed" }));
  }
}

main();
