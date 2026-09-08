const fs = require("fs");
const path = require("path");
const { parse } = require("@babel/parser");
const traverseModule = require("@babel/traverse");
const traverse = traverseModule.default || traverseModule;

const PARSER_OPTIONS = {
  sourceType: "unambiguous",
  plugins: [
    "jsx",
    "classProperties",
    "classPrivateProperties",
    "classPrivateMethods",
    "optionalChaining",
    "nullishCoalescingOperator",
    "objectRestSpread",
    "dynamicImport",
    "exportDefaultFrom",
    "exportNamespaceFrom",
    "topLevelAwait"
  ]
};

const IGNORED_DIR_NAMES = new Set(["node_modules", "__tests__", "test", "tests", ".git", "android", "ios"]);

function walkSourceFiles(rootDir) {
  const results = [];
  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }
    for (const entry of entries) {
      if (IGNORED_DIR_NAMES.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && /\.(js|jsx)$/.test(entry.name) && !/\.test\.js$/.test(entry.name)) {
        results.push(full);
      }
    }
  }
  walk(rootDir);
  return results;
}

function ensureEntry(index, className, file) {
  if (!index.has(className)) {
    index.set(className, { className, file, methods: Object.create(null), statics: Object.create(null) });
  }
  return index.get(className);
}

function classMethodsFromBody(classBody, code) {
  const methods = Object.create(null);
  const statics = Object.create(null);
  classBody.body.forEach((member) => {
    if (member.type !== "ClassMethod" && member.type !== "ClassProperty") return;
    const name = member.key && (member.key.name || member.key.value);
    if (!name) return;
    if (member.type === "ClassMethod" && member.kind === "constructor") return;
    let src = null;
    if (member.type === "ClassMethod") {
      src = code.slice(member.start, member.end);
    } else if (member.type === "ClassProperty" && member.value) {
      src = code.slice(member.value.start, member.value.end);
    }
    if (!src) return;
    if (member.static) statics[name] = src;
    else methods[name] = src;
  });
  return { methods, statics };
}

function indexFile(filePath, index) {
  const code = fs.readFileSync(filePath, "utf8");
  let ast;
  try {
    ast = parse(code, PARSER_OPTIONS);
  } catch (e) {
    return;
  }

  const knownFunctionDeclNames = new Set();

  traverse(ast, {
    ClassDeclaration(p) {
      const name = p.node.id && p.node.id.name;
      if (!name) return;
      const entry = ensureEntry(index, name, filePath);
      const { methods, statics } = classMethodsFromBody(p.node.body, code);
      Object.assign(entry.methods, methods);
      Object.assign(entry.statics, statics);
    },
    ClassExpression(p) {
      const name = p.node.id && p.node.id.name;
      if (!name) return;
      const entry = ensureEntry(index, name, filePath);
      const { methods, statics } = classMethodsFromBody(p.node.body, code);
      Object.assign(entry.methods, methods);
      Object.assign(entry.statics, statics);
    },
    FunctionDeclaration(p) {
      if (p.node.id) knownFunctionDeclNames.add(p.node.id.name);
    },
    AssignmentExpression(p) {
      const left = p.node.left;
      if (!left || left.type !== "MemberExpression") return;

      // X.prototype.method = function(){}
      if (
        left.object &&
        left.object.type === "MemberExpression" &&
        left.object.property &&
        left.object.property.name === "prototype" &&
        left.object.object &&
        left.object.object.type === "Identifier"
      ) {
        const className = left.object.object.name;
        const methodName = left.property.name || String(left.property.value);
        const entry = ensureEntry(index, className, filePath);
        entry.methods[methodName] = code.slice(p.node.right.start, p.node.right.end);
        return;
      }

      // X.method = function(){} (static) -- only if X looks like a class/constructor
      if (left.object && left.object.type === "Identifier") {
        const className = left.object.name;
        const methodName = left.property.name || String(left.property.value);
        if (index.has(className) || knownFunctionDeclNames.has(className) || /^[A-Z]/.test(className)) {
          const entry = ensureEntry(index, className, filePath);
          entry.statics[methodName] = code.slice(p.node.right.start, p.node.right.end);
        }
      }
    }
  });
}

function buildClassIndex(rootDir) {
  const index = new Map();
  const files = walkSourceFiles(rootDir);
  files.forEach((f) => indexFile(f, index));
  return index;
}

function serializeIndex(index) {
  const obj = {};
  for (const [key, val] of index.entries()) obj[key] = val;
  return obj;
}

function deserializeIndex(obj) {
  const index = new Map();
  Object.entries(obj).forEach(([key, val]) => {
    index.set(key, {
      className: val.className,
      file: val.file,
      methods: Object.assign(Object.create(null), val.methods),
      statics: Object.assign(Object.create(null), val.statics)
    });
  });
  return index;
}

module.exports = { buildClassIndex, walkSourceFiles, serializeIndex, deserializeIndex };
