#!/usr/bin/env node
const path = require("path");
const { startServer } = require("../src/server/server");

async function main() {
  // The app repo path is optional now -- omit it to pick (or re-pick) the
  // repo from inside the GUI. Still accepted directly for anyone who wants
  // the old one-liner behavior.
  const argPath = process.argv[2];
  const appRoot = argPath ? path.resolve(process.cwd(), argPath) : null;

  const { port } = await startServer(appRoot);
  const url = `http://localhost:${port}`;
  console.log(appRoot ? `CodeSherlock is running for ${appRoot}` : "CodeSherlock is running -- pick a repo from the browser.");
  console.log(`Open ${url} if it doesn't open automatically.`);

  try {
    const open = require("open");
    await open(url);
  } catch (e) {
    // headless environment or 'open' unavailable -- URL is already printed above
  }
}

main().catch((err) => {
  console.error("CodeSherlock failed to start:", err);
  process.exit(1);
});
