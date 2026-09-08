const { diffLines, diffChars } = require("diff");
const { normalize } = require("./normalize");

const THRESHOLDS = {
  cosmetic: 0.9,
  moderate: 0.55
};

/**
 * Character-level similarity, not line-level. A single-line function where
 * one token changes (e.g. a boolean literal flip) should not score the same
 * as a full-body rewrite just because "1 of 3 lines changed" -- character
 * granularity reflects how much of the actual code changed, not how the
 * change happened to be laid out across lines.
 */
function similarityFromCharDiff(original, updated) {
  const parts = diffChars(original, updated);
  let changedChars = 0;
  parts.forEach((part) => {
    if (part.added || part.removed) changedChars += part.value.length;
  });
  const totalChars = Math.max(original.length, updated.length, 1);
  const similarity = 1 - Math.min(changedChars / totalChars, 1);
  return Math.max(0, Math.min(1, similarity));
}

function toDiffLines(parts) {
  const lines = [];
  parts.forEach((part) => {
    const type = part.added ? "add" : part.removed ? "del" : "ctx";
    part.value
      .split("\n")
      .filter((l) => l.length > 0)
      .forEach((l) => lines.push({ t: type, s: l }));
  });
  return lines;
}

/**
 * Diffs one overridden method against the original implementation from the
 * matched MFW source version. Never assumes "method touched = fully custom" --
 * classification is driven by an actual line diff of normalized source.
 */
function diffMethod(overrideCode, originalCode, isRender) {
  const normOverride = normalize(overrideCode);
  const normOriginal = normalize(originalCode);

  if (normOverride === normOriginal) {
    return { verdict: "cosmetic", similarity: 1, diff: [{ t: "ctx", s: "identical after formatting normalization" }] };
  }

  const parts = diffLines(normOriginal, normOverride);
  const similarity = similarityFromCharDiff(normOriginal, normOverride);

  let verdict;
  if (isRender) {
    verdict = similarity >= THRESHOLDS.cosmetic ? "moderate" : "heavy";
  } else if (similarity >= THRESHOLDS.cosmetic) {
    verdict = "cosmetic";
  } else if (similarity >= THRESHOLDS.moderate) {
    verdict = "moderate";
  } else {
    verdict = "heavy";
  }

  return { verdict, similarity: Math.round(similarity * 100) / 100, diff: toDiffLines(parts) };
}

/**
 * Classifies a single proto override against a version-matched class index.
 * - Method not in original at all -> "addition" (new surface area, not a
 *   modification of existing behavior).
 * - Class itself unresolved (fetch failed, version tag missing) -> "unresolved".
 * - Otherwise -> real method-level diff, never a presence-only guess.
 */
function classifyOverride(override, classIndexEntry, fetchStatus) {
  if (!fetchStatus || fetchStatus.ok === false) {
    const reason = fetchStatus ? fetchStatus.reason : "not-diff-verified";
    const detail = fetchStatus && fetchStatus.detail ? ` -- ${fetchStatus.detail}` : "";
    return {
      ...override,
      verdict: "unresolved",
      reason,
      diff: [{ t: "ctx", s: `source fetch failed: ${reason}${detail}` }]
    };
  }

  if (!classIndexEntry) {
    return {
      ...override,
      verdict: "unresolved",
      reason: "class-not-found-in-source",
      diff: [{ t: "ctx", s: `${override.className} not found in fetched source -- check export name / version` }]
    };
  }

  const bucket = override.isStatic ? classIndexEntry.statics : classIndexEntry.methods;
  const hasOwn = bucket && Object.prototype.hasOwnProperty.call(bucket, override.method);
  const originalCode = hasOwn ? bucket[override.method] : undefined;

  if (originalCode === undefined) {
    return {
      ...override,
      verdict: "addition",
      diff: [{ t: "add", s: override.code.split("\n")[0] + " ..." }]
    };
  }

  const result = diffMethod(override.code, originalCode, override.isRender);
  return { ...override, ...result };
}

module.exports = { diffMethod, classifyOverride };
