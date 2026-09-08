const assert = require("assert");
const { diffMethod, classifyOverride } = require("../src/diff/diffEngine");

// Fixture 1: near-identical (one boolean flipped) -> should classify cosmetic
const original1 = "function () {\n  return true;\n}";
const override1 = "function () {\n  return false;\n}";
const r1 = diffMethod(override1, original1, false);
console.log("Fixture 1 (boolean flip):", r1.verdict, "similarity=" + r1.similarity);
assert.notStrictEqual(r1.verdict, "heavy", "a single boolean-literal flip is a real but tiny edit -- must not read as a full rewrite");

// Fixture 2: substantially rewritten body -> should classify heavy
const original2 = `function () {
  return this.state.value;
}`;
const override2 = `function () {
  this.trackEvent('viewed');
  const computed = this.props.items.map((i) => i.id).filter(Boolean);
  if (computed.length > 0) {
    this.setState({ cached: computed });
  }
  return computed.length > 0 ? computed : this.state.value;
}`;
const r2 = diffMethod(override2, original2, false);
console.log("Fixture 2 (real rewrite):", r2.verdict, "similarity=" + r2.similarity);
assert.strictEqual(r2.verdict, "heavy", "a substantially rewritten method should classify heavy");

// Fixture 3: moderate change -- added a guard clause, kept the rest
const original3 = `function (redeemable) {
  const ts = moment(redeemable.expiring_on).utc();
  return ts.diff(moment());
}`;
const override3 = `function (redeemable) {
  if (!redeemable) return null;
  const ts = moment(redeemable.expiring_on).utc();
  return ts.diff(moment());
}`;
const r3 = diffMethod(override3, original3, false);
console.log("Fixture 3 (guard clause added):", r3.verdict, "similarity=" + r3.similarity);
assert.ok(r3.verdict === "cosmetic" || r3.verdict === "moderate", "a single added guard clause should not be heavy");

// Fixture 4: method doesn't exist in original at all -> addition, via classifyOverride
const classIndexEntry = { methods: { existingMethod: original1 }, statics: {} };
const overrideDescriptor = { className: "Foo", method: "brandNewMethod", isStatic: false, code: "function(){ return 42; }", isRender: false };
const r4 = classifyOverride(overrideDescriptor, classIndexEntry, { ok: true });
console.log("Fixture 4 (net-new method):", r4.verdict);
assert.strictEqual(r4.verdict, "addition", "a method absent from the original class should be an addition, not heavy/cosmetic");

// Fixture 5: unresolved fetch (simulates repo URL not configured yet)
const r5 = classifyOverride(overrideDescriptor, null, { ok: false, reason: "no-repo-configured" });
console.log("Fixture 5 (unresolved fetch):", r5.verdict, r5.reason);
assert.strictEqual(r5.verdict, "unresolved");

console.log("\nAll diff engine fixtures passed.");
