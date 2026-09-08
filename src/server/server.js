const path = require("path");
const express = require("express");
const { saveToken, loadToken, clearToken } = require("../auth/tokenStore");
const { validateToken } = require("../auth/githubValidate");
const { runScan } = require("../pipeline/runScan");
const { listDirectory, validateAppRepo } = require("../fs/browse");
const { getLastRepoPath, setLastRepoPath } = require("../state/appState");

/**
 * appRootArg is now optional -- if omitted (GUI-only launch), we fall back
 * to the last repo the user picked in the GUI, and if there's no history
 * either, the dashboard shows the repo picker before anything else.
 */
function startServer(appRootArg) {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, "..", "..", "public")));

  let currentAppRoot = appRootArg || getLastRepoPath() || null;

  app.get("/api/status", async (req, res) => {
    const token = await loadToken();
    const repoCheck = currentAppRoot ? validateAppRepo(currentAppRoot) : { ok: false, reason: "not-set" };
    res.json({
      hasToken: Boolean(token),
      appRoot: currentAppRoot,
      hasValidRepo: repoCheck.ok,
      repoInfo: repoCheck.ok ? repoCheck : null
    });
  });

  app.post("/api/token", async (req, res) => {
    const { token } = req.body || {};
    if (!token || !token.trim()) {
      return res.status(400).json({ ok: false, message: "Enter a token first." });
    }
    const validation = await validateToken(token.trim());
    if (!validation.valid) {
      return res.status(401).json({ ok: false, message: validation.message, results: validation.results });
    }
    const stored = await saveToken(token.trim());
    res.json({ ok: true, backend: stored.backend });
  });

  app.post("/api/token/clear", async (req, res) => {
    await clearToken();
    res.json({ ok: true });
  });

  app.get("/api/browse", (req, res) => {
    const result = listDirectory(req.query.path);
    res.json(result);
  });

  app.get("/api/repo", (req, res) => {
    const repoCheck = currentAppRoot ? validateAppRepo(currentAppRoot) : { ok: false, reason: "not-set" };
    res.json({ appRoot: currentAppRoot, ...repoCheck });
  });

  app.post("/api/repo", (req, res) => {
    const { path: candidatePath } = req.body || {};
    if (!candidatePath || !candidatePath.trim()) {
      return res.status(400).json({ ok: false, reason: "empty-path" });
    }
    const result = validateAppRepo(candidatePath.trim());
    if (!result.ok) {
      return res.status(400).json(result);
    }
    currentAppRoot = result.path;
    setLastRepoPath(result.path);
    res.json(result);
  });

  app.get("/api/scan", async (req, res) => {
    const token = await loadToken();
    if (!token) {
      return res.status(401).json({ ok: false, message: "No token connected yet." });
    }
    if (!currentAppRoot) {
      return res.status(400).json({ ok: false, message: "No app repo selected yet." });
    }
    try {
      const report = await runScan(currentAppRoot, token);
      res.json(report);
    } catch (err) {
      res.status(500).json({ ok: false, message: String(err.message || err) });
    }
  });

  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      resolve({ server, port });
    });
  });
}

module.exports = { startServer };
