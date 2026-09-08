const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const CACHE_ROOT = path.join(os.homedir(), ".codesherlock", "cache");

function slug(pkgName) {
  return pkgName.replace(/[@/]/g, "_");
}

function cacheDirFor(pkgName, version) {
  return path.join(CACHE_ROOT, slug(pkgName), version);
}

function withEmbeddedToken(repoUrl, token) {
  return repoUrl.replace(/^https:\/\//, `https://x-access-token:${token}@`);
}

/**
 * Strips the token out of any string before it can reach a log line, an
 * error object, or the dashboard -- defense in depth. git itself sometimes
 * echoes the full remote URL (credentials included) back into stderr on
 * connection failures, so redacting err.message/err.stderr isn't enough on
 * its own; every string that might contain the token gets scrubbed here
 * regardless of where it came from.
 */
function redact(text, token) {
  if (!text) return text;
  let cleaned = String(text);
  if (token) cleaned = cleaned.split(token).join("[REDACTED]");
  cleaned = cleaned.replace(/x-access-token:[^@\s]+@/g, "x-access-token:[REDACTED]@");
  return cleaned;
}

/**
 * Shallow-clones a package's source at the version-matched tag into a local
 * cache. Returns { ok: true, dir } on success, or { ok: false, reason } if
 * the clone fails (missing tag, no access, network error) -- callers should
 * treat that repo/version as "unresolved", never guess. Never returns a raw
 * command line or unsanitized error text -- see redact() above.
 */
function fetchPackageAtVersion(pkgName, version, packageConfig, token) {
  const dest = cacheDirFor(pkgName, version);
  if (fs.existsSync(path.join(dest, ".git"))) {
    return { ok: true, dir: dest, cached: true };
  }

  const cfg = packageConfig[pkgName];
  if (!cfg || !cfg.repoUrl || cfg.repoUrl === "TODO_FILL_ME") {
    return { ok: false, reason: "no-repo-configured" };
  }

  const cleanVersion = String(version).replace(/^[\^~]/, "");
  const tag = `${cfg.tagPrefix || ""}${cleanVersion}`;
  const authedUrl = token ? withEmbeddedToken(cfg.repoUrl, token) : cfg.repoUrl;

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.rmSync(dest, { recursive: true, force: true });

  const args = ["clone", "--depth", "1", "--branch", tag, authedUrl, dest];

  try {
    execFileSync("git", args, { stdio: ["ignore", "pipe", "pipe"] });
    return { ok: true, dir: dest, cached: false };
  } catch (err) {
    fs.rmSync(dest, { recursive: true, force: true });
    const stderrText = err.stderr ? err.stderr.toString("utf8").trim() : "";
    const fallback = err.stdout ? err.stdout.toString("utf8").trim() : "";
    const raw = stderrText || fallback || "git exited with no output -- check that git is installed and reachable";
    return { ok: false, reason: "clone-failed", detail: redact(raw, token) };
  }
}

module.exports = { fetchPackageAtVersion, cacheDirFor, CACHE_ROOT };
