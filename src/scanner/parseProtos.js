const fs = require("fs");
const path = require("path");
const { parse } = require("@babel/parser");
const traverseModule = require("@babel/traverse");
const traverse = traverseModule.default || traverseModule;

const PARSER_OPTIONS = {
  sourceType: "module",
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

function findProtoFiles(appRoot) {
  const protosDir = path.join(appRoot, "src", "protos");
  const results = [];
  if (!fs.existsSync(protosDir)) return results;

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".proto.js")) {
        results.push(full);
      }
    }
  }
  walk(protosDir);
  return results;
}

function isMemberOf(node, targetName) {
  return node && node.type === "Identifier" && node.name === targetName;
}

function extractAssignmentTarget(assignExpr, knownIdentifiers) {
  const left = assignExpr.left;
  if (!left || left.type !== "MemberExpression") return null;

  // Case: X.prototype.method = ...
  if (
    left.object &&
    left.object.type === "MemberExpression" &&
    left.object.property &&
    left.object.property.name === "prototype" &&
    left.object.object &&
    left.object.object.type === "Identifier" &&
    knownIdentifiers.has(left.object.object.name)
  ) {
    return {
      className: left.object.object.name,
      method: left.property.name || (left.property.value !== undefined ? String(left.property.value) : "[computed]"),
      isStatic: false
    };
  }

  // Case: X.method = ... (static)
  if (
    left.object &&
    left.object.type === "Identifier" &&
    knownIdentifiers.has(left.object.name)
  ) {
    return {
      className: left.object.name,
      method: left.property.name || (left.property.value !== undefined ? String(left.property.value) : "[computed]"),
      isStatic: true
    };
  }

  return null;
}

function parseProtoFile(filePath, knownPackagePrefixes) {
  const source = fs.readFileSync(filePath, "utf8");
  let ast;
  try {
    ast = parse(source, PARSER_OPTIONS);
  } catch (err) {
    return {
      filePath,
      parseError: err.message,
      imports: [],
      overrides: [],
      isEmpty: true
    };
  }

  const knownIdentifiers = new Map(); // localName -> { imported, source }
  const overrides = [];

  traverse(ast, {
    ImportDeclaration(p) {
      const src = p.node.source.value;
      const matchesKnown = knownPackagePrefixes.some((prefix) => src === prefix || src.startsWith(prefix));
      if (!matchesKnown) return;
      p.node.specifiers.forEach((spec) => {
        if (spec.type === "ImportSpecifier") {
          knownIdentifiers.set(spec.local.name, {
            imported: spec.imported.name,
            source: src
          });
        } else if (spec.type === "ImportDefaultSpecifier") {
          knownIdentifiers.set(spec.local.name, {
            imported: "default",
            source: src
          });
        }
      });
    }
  });

  if (knownIdentifiers.size === 0) {
    return {
      filePath,
      imports: [],
      overrides: [],
      isEmpty: true
    };
  }

  traverse(ast, {
    AssignmentExpression(p) {
      const target = extractAssignmentTarget(p.node, knownIdentifiers);
      if (!target) return;
      const rightNode = p.node.right;
      const codeSlice = source.slice(rightNode.start, rightNode.end);
      const meta = knownIdentifiers.get(target.className);
      overrides.push({
        className: target.className,
        sourcePackage: meta ? meta.source : null,
        method: target.method,
        isStatic: target.isStatic,
        isRender: target.method === "render",
        code: codeSlice,
        line: p.node.loc ? p.node.loc.start.line : null
      });
    }
  });

  return {
    filePath,
    imports: Array.from(knownIdentifiers.entries()).map(([local, meta]) => ({
      local,
      imported: meta.imported,
      source: meta.source
    })),
    overrides,
    isEmpty: overrides.length === 0
  };
}

function scanApp(appRoot, knownPackagePrefixes) {
  const files = findProtoFiles(appRoot);
  return files.map((f) => parseProtoFile(f, knownPackagePrefixes));
}

module.exports = { findProtoFiles, parseProtoFile, scanApp };
