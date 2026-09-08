const packagesConfig = require("../config/packages.config.json");

function parseOwnerRepo(repoUrl) {
  const match = repoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

/**
 * Validates a PAT by actually calling the GitHub API against the two
 * configured repos, so a bad token (or one missing repo access) fails
 * loudly at setup time instead of surfacing as a confusing clone error
 * later.
 */
async function validateToken(token) {
  const targets = Object.values(packagesConfig.diffVerified)
    .map((cfg) => cfg.repoUrl)
    .filter((url) => url && url !== "TODO_FILL_ME")
    .map(parseOwnerRepo)
    .filter(Boolean);

  if (targets.length === 0) {
    return {
      valid: false,
      reason: "not-configured",
      message: "No repo URLs configured yet in packages.config.json -- ask an admin to fill those in first."
    };
  }

  const results = [];
  for (const target of targets) {
    try {
      const res = await fetch(`https://api.github.com/repos/${target.owner}/${target.repo}`, {
        headers: {
          Authorization: `token ${token}`,
          "User-Agent": "codesherlock",
          Accept: "application/vnd.github+json"
        }
      });
      results.push({ target: `${target.owner}/${target.repo}`, ok: res.status === 200, status: res.status });
    } catch (e) {
      results.push({ target: `${target.owner}/${target.repo}`, ok: false, status: null, error: String(e.message || e) });
    }
  }

  const allOk = results.every((r) => r.ok);
  return {
    valid: allOk,
    results,
    message: allOk
      ? "Token verified against all configured repos."
      : "Token could not access one or more required repos. Check scopes (needs repo) and repo access."
  };
}

module.exports = { validateToken };
