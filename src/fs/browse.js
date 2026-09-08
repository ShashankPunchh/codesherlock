const fs = require("fs");
const os = require("os");
const path = require("path");

const HIDDEN_OR_NOISY = new Set(["node_modules", "Pods", "build", "DerivedData", ".git"]);

function hasPackageJson(dirPath) {
  try {
    return fs.existsSync(path.join(dirPath, "package.json"));
  } catch (e) {
    return false;
  }
}

/**
 * Lists subdirectories of a path for the in-GUI folder browser. Runs
 * server-side (this is a local Node process with real filesystem access),
 * so the browser only ever renders what this returns -- there's no way for
 * a webpage to get a real absolute path out of a native file picker, so the
 * browsing has to happen here instead.
 */
function listDirectory(dirPath) {
  const resolved = dirPath ? path.resolve(dirPath) : os.homedir();

  let stat;
  try {
    stat = fs.statSync(resolved);
  } catch (e) {
    return { ok: false, reason: "not-found" };
  }
  if (!stat.isDirectory()) {
    return { ok: false, reason: "not-a-directory" };
  }

  let entries;
  try {
    entries = fs.readdirSync(resolved, { withFileTypes: true });
  } catch (e) {
    return { ok: false, reason: "permission-denied" };
  }

  const dirs = entries
    .filter((e) => e.isDirectory())
    .filter((e) => !e.name.startsWith(".") && !HIDDEN_OR_NOISY.has(e.name))
    .map((e) => {
      const full = path.join(resolved, e.name);
      return { name: e.name, path: full, isAppRepo: hasPackageJson(full) };
    })
    .sort((a, b) => (a.isAppRepo === b.isAppRepo ? a.name.localeCompare(b.name) : a.isAppRepo ? -1 : 1));

  const parent = path.dirname(resolved);

  return {
    ok: true,
    path: resolved,
    parent: parent === resolved ? null : parent,
    isAppRepo: hasPackageJson(resolved),
    entries: dirs
  };
}

/**
 * Confirms a candidate path is a usable app repo before committing to it --
 * fails clearly ("no package.json here") instead of the scan silently
 * finding zero proto files later.
 */
function validateAppRepo(dirPath) {
  const resolved = path.resolve(dirPath || "");
  if (!fs.existsSync(resolved)) {
    return { ok: false, reason: "path-does-not-exist" };
  }
  if (!fs.statSync(resolved).isDirectory()) {
    return { ok: false, reason: "not-a-directory" };
  }
  const pkgPath = path.join(resolved, "package.json");
  if (!fs.existsSync(pkgPath)) {
    return { ok: false, reason: "no-package-json" };
  }
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  } catch (e) {
    return { ok: false, reason: "invalid-package-json" };
  }
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const punchhCount = Object.keys(deps).filter((d) => d.startsWith("@punchh/")).length;
  const protosDir = path.join(resolved, "src", "protos");
  const hasProtos = fs.existsSync(protosDir);

  return {
    ok: true,
    path: resolved,
    appName: pkg.name || path.basename(resolved),
    punchhPackageCount: punchhCount,
    hasProtosFolder: hasProtos
  };
}

module.exports = { listDirectory, validateAppRepo };
