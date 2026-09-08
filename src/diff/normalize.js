const { parse } = require("@babel/parser");
const generateModule = require("@babel/generator");
const generate = generateModule.default || generateModule;

const PARSER_OPTIONS = {
  sourceType: "module",
  plugins: ["jsx", "classProperties", "optionalChaining", "nullishCoalescingOperator", "objectRestSpread"]
};

/**
 * Normalizes a function/method source snippet so formatting differences
 * (quotes, indentation, trailing commas, comments) don't masquerade as real
 * logic changes in the diff. Re-parses the snippet and regenerates it
 * through Babel's generator -- synchronous, and it's the same parser family
 * already used everywhere else in the pipeline, so nothing new to install.
 * Falls back to whitespace collapsing if the snippet can't stand alone.
 */
function normalize(codeSnippet) {
  const attempts = [
    `(${codeSnippet})`,
    `const __codesherlock_wrap = ${codeSnippet};`,
    `class __CodesherlockWrap { ${codeSnippet} }`
  ];

  for (const attempt of attempts) {
    try {
      const ast = parse(attempt, PARSER_OPTIONS);
      const { code } = generate(ast, { comments: false, compact: false, retainLines: false });
      return code.trim();
    } catch (e) {
      continue;
    }
  }

  return codeSnippet
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join("\n");
}

module.exports = { normalize };
