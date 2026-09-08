const path = require("path");
const assert = require("assert");
const { buildClassIndex } = require("../src/fetch/buildClassIndex");

const index = buildClassIndex(path.join(__dirname, "fixtures"));

assert.ok(index.has("LocationScene"), "ES5 prototype-style class should be indexed");
const loc = index.get("LocationScene");
assert.ok(loc.methods.componentDidMount, "componentDidMount should be captured");
assert.ok(loc.methods.render, "render should be captured");

assert.ok(index.has("UserModel"), "ES6 class should be indexed");
const um = index.get("UserModel");
assert.ok(um.methods.isMemberEditable, "instance method should be captured");
assert.ok(um.statics.fromJson, "static method should be captured");
assert.ok(!Object.prototype.hasOwnProperty.call(um.methods, "constructor"), "constructor should be excluded");

console.log("Indexed classes:", Array.from(index.keys()));
console.log("LocationScene methods:", Object.keys(loc.methods));
console.log("UserModel methods:", Object.keys(um.methods), "statics:", Object.keys(um.statics));
console.log("\nAll class index fixtures passed.");
