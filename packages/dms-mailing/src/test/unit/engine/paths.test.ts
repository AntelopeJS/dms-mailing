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
  it("reads a list by index and by length", () => {
    expect(getPath(DATA, "order.lines.0.label")).to.equal("A");
    expect(getPath(DATA, "order.lines.length")).to.equal(1);
    expect(getPath(DATA, "order.lines.1.label")).to.equal(undefined);
    expect(getPath(DATA, "order.lines.label")).to.equal(undefined);
  });
  it("reads the fields of a money value", () => {
    const data = { total: { value: 987420, currency: "EUR" } };
    expect(getPath(data, "total.currency")).to.equal("EUR");
    expect(getPath(data, "total.value")).to.equal(987420);
  });
  it("reads a key a record owns, whatever it is called", () => {
    expect(getPath({ valueOf: 3, toString: "t" }, "valueOf")).to.equal(3);
    expect(getPath({ valueOf: 3, toString: "t" }, "toString")).to.equal("t");
  });
});

describe("[unit] engine/paths inherited members", () => {
  /**
   * Data is a record of values, so a path names a key the record owns. Before
   * the typed variables, `{{toString}}` wrote the function's source into the
   * e-mail and `{{when.getTime}}` did the same for a Date's method.
   */
  it("reads no member a record inherits", () => {
    expect(getPath({ a: 1 }, "toString")).to.equal(undefined);
    expect(getPath({ a: 1 }, "hasOwnProperty")).to.equal(undefined);
    expect(getPath({ a: { b: 1 } }, "a.valueOf")).to.equal(undefined);
  });

  it("reads no member of a Date", () => {
    expect(getPath({ when: new Date(0) }, "when.getTime")).to.equal(undefined);
  });

  it("reads no member of a string, a number or a boolean", () => {
    expect(getPath({ a: "text" }, "a.length")).to.equal(undefined);
    expect(getPath({ a: 1 }, "a.toFixed")).to.equal(undefined);
    expect(getPath({ a: true }, "a.valueOf")).to.equal(undefined);
  });
});

describe("[unit] engine/paths reserved keys", () => {
  /**
   * A token path is authored, not recipient-supplied, but `{{constructor}}`
   * still resolved to the Object constructor and String()'d its source into the
   * e-mail. Nothing legitimate walks through these.
   */
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
