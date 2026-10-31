import { expect } from "chai";
import { evaluateCondition } from "../../../engine";
import type { Condition } from "../../../types";

const condition = (operator: Condition["operator"], value = ""): Condition => ({
  path: "order.total",
  operator,
  value,
});

describe("[unit] engine/conditions", () => {
  it("treats truthy/falsy with JS semantics and missing as false", () => {
    expect(
      evaluateCondition(condition("truthy"), { order: { total: 1 } }),
    ).to.equal(true);
    expect(
      evaluateCondition(condition("truthy"), { order: { total: 0 } }),
    ).to.equal(false);
    expect(evaluateCondition(condition("falsy"), {})).to.equal(true);
  });
  it("compares as strings for eq/ne and as numbers for gt/lt", () => {
    expect(
      evaluateCondition(condition("eq", "42"), { order: { total: 42 } }),
    ).to.equal(true);
    expect(
      evaluateCondition(condition("ne", "42"), { order: { total: "42" } }),
    ).to.equal(false);
    expect(
      evaluateCondition(condition("gt", "10"), { order: { total: 11 } }),
    ).to.equal(true);
    expect(
      evaluateCondition(condition("lt", "10"), { order: { total: "abc" } }),
    ).to.equal(false);
  });
  it("writes a boolean, a null and a list the way String() does for eq", () => {
    expect(
      evaluateCondition(condition("eq", "true"), { order: { total: true } }),
    ).to.equal(true);
    expect(
      evaluateCondition(condition("eq", "null"), { order: { total: null } }),
    ).to.equal(true);
    expect(
      evaluateCondition(condition("eq", "a,b"), {
        order: { total: ["a", "b"] },
      }),
    ).to.equal(true);
    expect(evaluateCondition(condition("eq", "undefined"), {})).to.equal(true);
  });
  it("compares a Date as its time for gt/lt", () => {
    expect(
      evaluateCondition(condition("gt", "5"), {
        order: { total: new Date(10) },
      }),
    ).to.equal(true);
  });
});
