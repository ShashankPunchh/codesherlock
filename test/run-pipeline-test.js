const { runScan } = require("../src/pipeline/runScan");

const appRoot = process.argv[2];
if (!appRoot) {
  console.error("Usage: node test/run-pipeline-test.js <path-to-app-root>");
  process.exit(1);
}

runScan(appRoot, null).then((report) => {
  if (!report.ok) {
    console.error("Scan failed:", report.error);
    process.exit(1);
  }
  console.log("diffVerifiedPackages:", report.diffVerifiedPackages);
  console.log("notVerifiedPackages:", report.notVerifiedPackages);
  console.log("fetchResults:", report.fetchResults);
  console.log("summary:", report.summary);
  console.log("patchPackageEntries:", report.patchPackageEntries);
  console.log("\nSample file entries:");
  report.files.slice(0, 3).forEach((f) => {
    console.log(" -", f.file, "| verdict:", f.verdict, "| methods:", f.methods);
  });
});
