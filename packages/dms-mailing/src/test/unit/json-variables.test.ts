import { HTTPResult } from "@antelopejs/interface-api";
import { expect } from "chai";
import { parseBody } from "../../data/body";
import type { JsonValue } from "../../types/json";
import { testDataSchema } from "../../validation/templates.schema";

/** The status of the HTTP answer `run` throws; `undefined` when it throws none. */
function thrownStatus(run: () => JsonValue): number | undefined {
  try {
    run();
  } catch (error) {
    return error instanceof HTTPResult ? error.getStatus() : undefined;
  }
  return undefined;
}

describe("[unit] data/body parseBody", () => {
  it("parses the JSON a body carries, of any shape", () => {
    expect(parseBody('{"a":[1,{"b":null}]}')).to.deep.equal({
      a: [1, { b: null }],
    });
    expect(parseBody(Buffer.from("[1,2]"))).to.deep.equal([1, 2]);
    expect(parseBody("5")).to.equal(5);
  });

  it("answers an empty object for an empty body", () => {
    expect(parseBody("")).to.deep.equal({});
    expect(parseBody(Buffer.alloc(0))).to.deep.equal({});
  });

  it("answers 400 for a body that is not JSON", () => {
    expect(thrownStatus(() => parseBody("{nope"))).to.equal(400);
  });
});

describe("[unit] validation test data", () => {
  it("accepts a JSON object, nested lists and records included", () => {
    const data = {
      order: { lines: [{ label: "A", price: 1.5, paid: false }] },
    };
    expect(testDataSchema.parse({ data }).data).to.deep.equal(data);
  });

  it("refuses what a JSON body cannot carry", () => {
    expect(
      testDataSchema.safeParse({ data: { when: new Date(0) } }).success,
    ).to.equal(false);
    expect(
      testDataSchema.safeParse({ data: { gone: undefined } }).success,
    ).to.equal(false);
    expect(testDataSchema.safeParse({ data: new Map() }).success).to.equal(
      false,
    );
  });

  it("refuses data that is not an object", () => {
    expect(testDataSchema.safeParse({ data: [] }).success).to.equal(false);
    expect(testDataSchema.safeParse({ data: null }).success).to.equal(false);
    expect(testDataSchema.safeParse({}).success).to.equal(false);
  });
});
