const fs = require("fs");
const path = require("path");
const { scanApp } = require("../scanner/parseProtos");
const { fetchPackageAtVersion } = require("../fetch/fetchPackage");
const { buildClassIndex, serializeIndex, deserializeIndex } = require("../fetch/buildClassIndex");
const { classifyOverride } = require("../diff/diffEngine");
const packagesConfig = require("../config/packages.config.json");

const INDEX_CACHE_SUFFIX = ".codesherlock-index.json";

function readAppPackageJson(appRoot) {
  const pkgPath = path.join(appRoot, "package.json");
  if (!fs.existsSync(pkgPath)) return null;
  return JSON.parse(fs.readFileSync(pkgPath, "utf8"));
}

function listPatchPackageEntries(appRoot) {
  const patchesDir = path.join(appRoot, "patches");
  if (!fs.existsSync(patchesDir)) return [];
  return fs.readdirSync(patchesDir).filter((f) => f.endsWith(".patch"));
}

function getOrBuildIndex(dir) {
  const cachePath = path.join(dir, INDEX_CACHE_SUFFIX);
  if (fs.existsSync(cachePath)) {
    try {
      return deserializeIndex(JSON.parse(fs.readFileSync(cachePath, "utf8")));
    } catch (e) {
      // fall through and rebuild
    }
  }
  const index = buildClassIndex(dir);
  try {
    fs.writeFileSync(cachePath, JSON.stringify(serializeIndex(index)));
  } catch (e) {
    // cache write failures aren't fatal
  }
  return index;
}

function classify(pkgName) {
  if (packagesConfig.diffVerified[pkgName]) return "diffVerified";
  return "notVerified";
}

/**
 * Runs the full pipeline: scan proto files, fetch matching MFW source for
 * diff-verified packages, build a class index per version, then classify
 * every override with a real method-level diff (never presence-only).
 */
async function runScan(appRoot, token) {
  const appPkg = readAppPackageJson(appRoot);
  if (!appPkg) {
    return { ok: false, error: `No package.json found at ${appRoot}` };
  }

  const deps = { ...(appPkg.dependencies || {}), ...(appPkg.devDependencies || {}) };
  const punchhPackages = Object.keys(deps).filter((name) => name.startsWith("@punchh/"));

  const fetchResults = {};
  const indexes = {};
  punchhPackages.forEach((pkgName) => {
    if (classify(pkgName) !== "diffVerified") return;
    const version = deps[pkgName];
    const result = fetchPackageAtVersion(pkgName, version, packagesConfig.diffVerified, token);
    fetchResults[pkgName] = result;
    if (result.ok) {
      indexes[pkgName] = getOrBuildIndex(result.dir);
    }
  });

  const protoFiles = scanApp(appRoot, punchhPackages);

  const files = protoFiles.map((pf) => {
    if (pf.isEmpty) {
      return {
        file: path.relative(appRoot, pf.filePath),
        package: pf.imports[0] ? pf.imports[0].source : null,
        overrides: [],
        verdict: "empty",
        methods: 0
      };
    }

    const perOverride = pf.overrides.map((ov) => {
      const pkgName = ov.sourcePackage;
      const isDiffVerified = classify(pkgName) === "diffVerified";
      if (!isDiffVerified) {
        return {
          ...ov,
          verdict: "unresolved",
          reason: "not-diff-verified",
          diff: [{ t: "ctx", s: `${pkgName} is not diff-verified yet -- method touched but not compared` }]
        };
      }
      const index = indexes[pkgName];
      const entry = index ? index.get(ov.className) : null;
      return classifyOverride(ov, entry, fetchResults[pkgName]);
    });

    const verdictOrder = ["heavy", "moderate", "cosmetic", "addition", "unresolved"];
    const worst = verdictOrder.find((v) => perOverride.some((o) => o.verdict === v)) || "cosmetic";

    return {
      file: path.relative(appRoot, pf.filePath),
      package: pf.imports[0] ? pf.imports[0].source : null,
      overrides: perOverride,
      verdict: worst,
      methods: perOverride.length
    };
  });

  const summary = {
    totalProtoFiles: files.length,
    heavy: files.filter((f) => f.verdict === "heavy").length,
    moderate: files.filter((f) => f.verdict === "moderate").length,
    cosmetic: files.filter((f) => f.verdict === "cosmetic").length,
    addition: files.filter((f) => f.verdict === "addition").length,
    unresolved: files.filter((f) => f.verdict === "unresolved").length,
    empty: files.filter((f) => f.verdict === "empty").length
  };

  return {
    ok: true,
    appRoot,
    scannedAt: new Date().toISOString(),
    diffVerifiedPackages: punchhPackages.filter((p) => classify(p) === "diffVerified"),
    notVerifiedPackages: punchhPackages.filter((p) => classify(p) !== "diffVerified"),
    fetchResults,
    patchPackageEntries: listPatchPackageEntries(appRoot),
    summary,
    files
  };
}

module.exports = { runScan };
