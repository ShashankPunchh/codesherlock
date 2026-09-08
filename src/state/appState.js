const fs = require("fs");
const os = require("os");
const path = require("path");

const STATE_DIR = path.join(os.homedir(), ".codesherlock");
const STATE_FILE = path.join(STATE_DIR, "state.json");

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch (e) {
    return {};
  }
}

function writeState(partial) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const merged = { ...readState(), ...partial };
  fs.writeFileSync(STATE_FILE, JSON.stringify(merged, null, 2));
  return merged;
}

function getLastRepoPath() {
  return readState().lastRepoPath || null;
}

function setLastRepoPath(repoPath) {
  writeState({ lastRepoPath: repoPath });
}

module.exports = { getLastRepoPath, setLastRepoPath };
