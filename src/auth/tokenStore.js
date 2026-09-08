const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const SERVICE_NAME = "codesherlock";
const ACCOUNT_NAME = "github-pat";
const FALLBACK_DIR = path.join(os.homedir(), ".codesherlock");
const FALLBACK_KEY_FILE = path.join(FALLBACK_DIR, "keyfile");
const FALLBACK_CRED_FILE = path.join(FALLBACK_DIR, "credentials.enc");

let keytar = null;
try {
  keytar = require("keytar");
} catch (e) {
  keytar = null;
}

function ensureFallbackKey() {
  fs.mkdirSync(FALLBACK_DIR, { recursive: true, mode: 0o700 });
  if (!fs.existsSync(FALLBACK_KEY_FILE)) {
    fs.writeFileSync(FALLBACK_KEY_FILE, crypto.randomBytes(32), { mode: 0o600 });
  }
  return fs.readFileSync(FALLBACK_KEY_FILE);
}

function fallbackSave(token) {
  const key = ensureFallbackKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, authTag, encrypted]).toString("base64");
  fs.writeFileSync(FALLBACK_CRED_FILE, payload, { mode: 0o600 });
}

function fallbackLoad() {
  if (!fs.existsSync(FALLBACK_CRED_FILE) || !fs.existsSync(FALLBACK_KEY_FILE)) return null;
  try {
    const key = fs.readFileSync(FALLBACK_KEY_FILE);
    const payload = Buffer.from(fs.readFileSync(FALLBACK_CRED_FILE, "utf8"), "base64");
    const iv = payload.subarray(0, 12);
    const authTag = payload.subarray(12, 28);
    const encrypted = payload.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch (e) {
    return null;
  }
}

function fallbackClear() {
  if (fs.existsSync(FALLBACK_CRED_FILE)) fs.rmSync(FALLBACK_CRED_FILE);
}

/**
 * Prefers the OS-native credential store (Keychain / Credential Manager /
 * Secret Service) via keytar. Falls back to a locally-encrypted file if
 * keytar isn't available on this machine -- flagged clearly so it's a known
 * degradation, not a silent one.
 */
async function saveToken(token) {
  if (keytar) {
    try {
      await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, token);
      return { ok: true, backend: "keychain" };
    } catch (e) {
      // fall through to file-based fallback
    }
  }
  fallbackSave(token);
  return { ok: true, backend: "encrypted-file" };
}

async function loadToken() {
  if (keytar) {
    try {
      const token = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
      if (token) return token;
    } catch (e) {
      // fall through to file-based fallback
    }
  }
  return fallbackLoad();
}

async function clearToken() {
  if (keytar) {
    try {
      await keytar.deletePassword(SERVICE_NAME, ACCOUNT_NAME);
    } catch (e) {
      // ignore
    }
  }
  fallbackClear();
}

module.exports = { saveToken, loadToken, clearToken };
