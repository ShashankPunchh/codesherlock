# CodeSherlock

Every override leaves a clue.

Scans a Punchh/PAR React Native app repo's `src/protos/**/*.proto.js` monkey-patch overrides and tells you, per method, whether it's a cosmetic tweak, a real-but-moderate edit, a full rewrite, or a brand-new addition that doesn't exist in the framework at all -- based on an actual diff against the matched MFW source version, never on "a method got touched" alone.

## One-time setup (admin)

Before this does real diffing, fill in `src/config/packages.config.json`:

```json
{
  "diffVerified": {
    "@punchh/react-native-punchh-components": { "repoUrl": "https://github.com/<org>/<repo>.git", "tagPrefix": "v" },
    "@punchh/react-native-punchh-olo": { "repoUrl": "https://github.com/<org>/<repo>.git", "tagPrefix": "v" }
  }
}
```

`tagPrefix` + the version pinned in an app's `package.json` must produce a real git tag in that repo (e.g. `v` + `4.0.2` -> tag `v4.0.2`).

Until this is filled in, the tool still runs and still lists every proto override -- it just marks each one "unresolved: no-repo-configured" instead of guessing.

## Running it

```
npm install
npm start
```

That's it -- no path argument required. The app repo is now picked from inside the GUI:

1. **First run:** setup screen asks for a GitHub personal access token (`repo` scope, since these are private repos). It's validated live against both configured repos before being saved to your OS keychain (or a locally-encrypted file if your machine can't use the native keychain). You won't be asked again unless the token stops working, at which point you'll see a reconnect screen instead of a confusing git error.
2. **Repo picker:** shows a folder browser (server-side, since a webpage can't get a real path from a native file picker) starting from your home folder, plus a manual path field if you'd rather paste one. Folders that directly contain a `package.json` are flagged "app repo" so you know when you've gone deep enough. It remembers your last pick, so you won't see this screen again next time unless you use "Change repo" in the dashboard header.
3. **Dashboard:** runs the scan and shows the report.

Power users can still skip step 2 with `npm start -- /path/to/AppRepo` (the folder that directly contains that app's `package.json` and `src/`, e.g. `KuraRewards/`, not the outer wrapper folder).

## What it actually checks

- Walks `src/protos/**/*.proto.js`, parses each with a real JS/JSX parser (not regex), and extracts every `Class.prototype.method = ...` / `Class.method = ...` monkey-patch, plus which `@punchh/*` package it targets.
- For `punchh-components` and `punchh-olo`: shallow-clones the exact version-tagged source (cached locally so repeat runs and other apps on the same version are instant), builds a class/method index from it, and diffs each override's normalized source against the real original method.
- Classifies each override: `addition` (method doesn't exist upstream at all), `cosmetic` (near-identical after normalizing formatting), `moderate` (a real but contained edit), `heavy` (large rewrite, or any override of `render`).
- Anything it can't verify -- a package with no configured repo, a version tag that doesn't exist, a class it can't find in the fetched source -- is labeled `unresolved`, never silently scored.
- Also surfaces `patch-package` entries (`patches/*.patch`) separately, since those customize third-party libraries directly and aren't part of the proto convention at all.

## Dashboard

Summary cards, a filterable/searchable table of every proto file, click-to-expand inline diffs per method, one-click JSON export of the full report, and a settings button to disconnect/reconnect your token.

## Project layout

```
bin/codesherlock.js        CLI entry point
src/scanner/                parses src/protos/**/*.proto.js
src/fetch/                  git fetch + cache + class/method index builder
src/diff/                   normalization + method-level diff/classification
src/pipeline/runScan.js     wires scanner -> fetch -> index -> diff into one report
src/auth/                   PAT validation + secure storage (keychain, with fallback)
src/server/                 local Express server + API
public/index.html           the setup screen + dashboard UI
src/config/packages.config.json   repo/tag mapping (fill this in)
test/                        fixture-based tests for the parser, index builder, and diff engine
```

## Tests

```
npm run test:scan -- /path/to/AppRepo   # sanity-check the proto scanner against a real repo
npm run test:diff                       # diff engine classification, synthetic fixtures
node test/run-index-fixture-test.js     # class/method index builder, synthetic fixtures
```

## Known limitations (by design, not oversight)

- Diffing only covers `punchh-components` and `punchh-olo` for now. `menu-framework`, `payment-processor`, and `pickup` overrides are listed but marked "not diff-verified."
- `meta.json` theme/feature-toggle config is intentionally excluded from scoring -- it's expected white-label configuration, not code override.
- The diff is text/AST-normalized, not a true structural diff -- a method that's reordered but logically identical could still show as moderately changed.
