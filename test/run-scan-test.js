const path = require("path");
const { scanApp } = require("../src/scanner/parseProtos");

const appRoot = process.argv[2];
if (!appRoot) {
  console.error("Usage: node test/run-scan-test.js <path-to-app-root>");
  process.exit(1);
}

const knownPackages = [
  "@punchh/react-native-punchh-components",
  "@punchh/react-native-punchh-olo",
  "@punchh/react-native-menu-framework",
  "@punchh/react-native-punchh-payment-processor",
  "@punchh/react-native-punchh-pickup"
];

const results = scanApp(appRoot, knownPackages);

console.log(`Scanned ${results.length} proto files under ${appRoot}\n`);

const empty = results.filter((r) => r.isEmpty);
const withOverrides = results.filter((r) => !r.isEmpty);

console.log(`Empty / no-op proto files: ${empty.length}`);
empty.slice(0, 5).forEach((r) => console.log("  - " + path.relative(appRoot, r.filePath)));

console.log(`\nFiles with overrides: ${withOverrides.length}`);
let totalOverrides = 0;
withOverrides.forEach((r) => (totalOverrides += r.overrides.length));
console.log(`Total overrides found: ${totalOverrides}\n`);

console.log("Sample detail -- first 5 files with overrides:");
withOverrides.slice(0, 5).forEach((r) => {
  console.log("\n" + path.relative(appRoot, r.filePath));
  r.overrides.forEach((ov) => {
    console.log(
      `  ${ov.className}${ov.isStatic ? "." : ".prototype."}${ov.method}()` +
        (ov.isRender ? "  [render]" : "") +
        `  <- ${ov.sourcePackage}`
    );
  });
});

const parseErrors = results.filter((r) => r.parseError);
if (parseErrors.length > 0) {
  console.log(`\nParse errors: ${parseErrors.length}`);
  parseErrors.forEach((r) => console.log("  - " + path.relative(appRoot, r.filePath) + ": " + r.parseError));
} else {
  console.log("\nNo parse errors.");
}
