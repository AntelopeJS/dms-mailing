import { expect } from "chai";
import { fingerprintOf } from "../../services/fingerprint";

describe("[unit] fingerprintOf", () => {
  it("ignores key order and undefined fields", () => {
    expect(fingerprintOf({ a: 1, b: { c: [1, { d: 2, e: 3 }] } })).to.equal(
      fingerprintOf({ b: { c: [1, { e: 3, d: 2 }] }, a: 1, f: undefined }),
    );
  });

  it("tells apart values that differ, array order included", () => {
    expect(fingerprintOf({ list: [1, 2] })).to.not.equal(
      fingerprintOf({ list: [2, 1] }),
    );
    expect(fingerprintOf({ name: "a" })).to.not.equal(
      fingerprintOf({ name: "b" }),
    );
  });
});
