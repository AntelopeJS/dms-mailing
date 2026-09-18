import { expect } from "chai";
import { getPath, normalizePath } from "../../../engine";

const DATA = {
  order: { ref: "CMD-1", lines: [{ label: "A" }] },
  customer: { firstName: "Sofie" },
};

describe("[unit] engine/paths", () => {
  it("reads nested values", () => {
    expect(getPath(DATA, "order.ref")).to.equal("CMD-1");
    expect(getPath(DATA, "order.lines")).to.deep.equal([{ label: "A" }]);
  });
  it("returns undefined for missing segments without throwing", () => {
    expect(getPath(DATA, "order.missing.deep")).to.equal(undefined);
    expect(getPath(null, "a")).to.equal(undefined);
  });
  it("strips the array suffix used in declarations", () => {
    expect(normalizePath("order.lines[]")).to.equal("order.lines");
  });
});

describe("[unit] engine/paths reserved keys", () => {
  // A token path is authored, not recipient-supplied, but `{{constructor}}`
  // still resolved to the Object constructor and String()'d its source into the
  // e-mail. Nothing legitimate walks through these.
  it("refuses to walk the prototype chain", () => {
    expect(getPath({ a: 1 }, "constructor")).to.equal(undefined);
    expect(getPath({ a: 1 }, "__proto__")).to.equal(undefined);
    expect(getPath({ a: 1 }, "prototype")).to.equal(undefined);
    expect(
      getPath({ a: { __proto__: { leaked: 1 } } }, "a.__proto__"),
    ).to.equal(undefined);
  });

  it("still reads an ordinary path", () => {
    expect(getPath({ a: { b: 2 } }, "a.b")).to.equal(2);
  });
});
