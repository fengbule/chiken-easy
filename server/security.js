import crypto from "crypto";

const LEGACY_HASH_PREFIX = "legacy_sha256";
const SCRYPT_HASH_PREFIX = "scrypt";

function cleanText(value) {
  return String(value ?? "").trim();
}

function toBase64Url(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const raw = cleanText(value).replace(/-/g, "+").replace(/_/g, "/");
  const padding = raw.length % 4;
  const padded = raw + (padding ? "=".repeat(4 - padding) : "");
  return Buffer.from(padded, "base64");
}

export function maskSecret(value, visible = 4) {
  const text = cleanText(value);
  if (!text) return "";
  if (text.length <= visible) return `${"*".repeat(Math.max(1, text.length - 1))}${text.slice(-1)}`;
  return `${text.slice(0, Math.min(2, visible))}${"*".repeat(Math.max(4, text.length - visible - 2))}${text.slice(-visible)}`;
}

export function maskIp(value) {
  const text = cleanText(value);
  if (!text) return "";
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(text)) {
    const parts = text.split(".");
    return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
  }
  if (text.includes(":")) {
    const parts = text.split(":");
    if (parts.length > 2) {
      return `${parts.slice(0, 2).join(":")}:xxxx`;
    }
  }
  return maskSecret(text, 3);
}

export function hashApiToken(token) {
  return crypto.createHash("sha256").update(cleanText(token)).digest("hex");
}

export function createLegacyPasswordHash(password, salt) {
  const nextSalt = cleanText(salt) || toBase64Url(crypto.randomBytes(12));
  const digest = crypto.createHash("sha256").update(`${nextSalt}:${cleanText(password)}`).digest("hex");
  return `${LEGACY_HASH_PREFIX}$${nextSalt}$${digest}`;
}

export function createPasswordHash(password) {
  const salt = crypto.randomBytes(16);
  const derivedKey = crypto.scryptSync(cleanText(password), salt, 64);
  return `${SCRYPT_HASH_PREFIX}$${toBase64Url(salt)}$${toBase64Url(derivedKey)}`;
}

export function verifyPassword(password, hashValue) {
  const hash = cleanText(hashValue);
  if (!hash) return { ok: false, needsUpgrade: false, scheme: "" };
  const parts = hash.split("$");
  if (parts[0] === SCRYPT_HASH_PREFIX && parts.length === 3) {
    const salt = fromBase64Url(parts[1]);
    const expected = fromBase64Url(parts[2]);
    const actual = crypto.scryptSync(cleanText(password), salt, expected.length);
    return {
      ok: crypto.timingSafeEqual(actual, expected),
      needsUpgrade: false,
      scheme: SCRYPT_HASH_PREFIX
    };
  }
  if (parts[0] === LEGACY_HASH_PREFIX && parts.length === 3) {
    const actual = crypto.createHash("sha256").update(`${parts[1]}:${cleanText(password)}`).digest("hex");
    return {
      ok: crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(parts[2])),
      needsUpgrade: true,
      scheme: LEGACY_HASH_PREFIX
    };
  }
  return { ok: false, needsUpgrade: false, scheme: "" };
}

function normalizeMasterKey(masterKey) {
  const input = cleanText(masterKey || process.env.CHIKEN_MASTER_KEY);
  if (!input) return null;
  return crypto.createHash("sha256").update(input).digest();
}

export function hasMasterKey(masterKey) {
  return Boolean(normalizeMasterKey(masterKey));
}

export function encryptSecret(value, masterKey) {
  const plainText = cleanText(value);
  if (!plainText) return "";
  const key = normalizeMasterKey(masterKey);
  if (!key) return plainText;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `enc$v1$${toBase64Url(iv)}$${toBase64Url(authTag)}$${toBase64Url(ciphertext)}`;
}

export function decryptSecret(value, masterKey) {
  const raw = cleanText(value);
  if (!raw) return "";
  if (!raw.startsWith("enc$v1$")) return raw;
  const key = normalizeMasterKey(masterKey);
  if (!key) throw new Error("master key required to decrypt secret");
  const parts = raw.split("$");
  if (parts.length !== 5) throw new Error("invalid encrypted secret");
  const iv = fromBase64Url(parts[2]);
  const authTag = fromBase64Url(parts[3]);
  const ciphertext = fromBase64Url(parts[4]);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plainText = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plainText.toString("utf8");
}

export function sanitizeSensitiveText(value) {
  return String(value ?? "")
    .replace(/(password|private.?key|token|secret|webhook)\s*[:=]\s*([^\s]+)/gi, (_, key) => `${key}=***`)
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, (ip) => maskIp(ip));
}

export function redactObject(input, options = {}) {
  const {
    secretKeys = new Set(["password", "privateKey", "token", "webhook", "telegramToken", "apiToken", "agentToken", "secret", "authorization"]),
    dropKeys = new Set(),
    revealFlags = true
  } = options;

  if (Array.isArray(input)) return input.map((item) => redactObject(item, options));
  if (!input || typeof input !== "object") return input;

  const output = {};
  for (const [key, value] of Object.entries(input)) {
    if (dropKeys.has(key)) continue;
    if (secretKeys.has(key)) {
      if (revealFlags) output[`has${key.charAt(0).toUpperCase()}${key.slice(1)}`] = Boolean(cleanText(value));
      continue;
    }
    output[key] = redactObject(value, options);
  }
  return output;
}
