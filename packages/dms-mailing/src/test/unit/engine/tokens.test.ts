import { expect } from "chai";
import { extractTokens, interpolate } from "../../../engine";

describe("[unit] engine/tokens", () => {
  it("extracts unique trimmed token paths in order", () => {
    expect(
      extractTokens("Hi {{ customer.firstName }}, {{order.ref}} {{order.ref}}"),
    ).to.deep.equal(["customer.firstName", "order.ref"]);
  });
  it("interpolates known paths and reports missing ones", () => {
    const result = interpolate("Hi {{customer.firstName}}, ref {{order.ref}}", {
      customer: { firstName: "Sofie" },
    });
    expect(result.text).to.equal("Hi Sofie, ref {{order.ref}}");
    expect(result.missing).to.deep.equal(["order.ref"]);
  });
  it("renders numbers and booleans as text and treats null as missing", () => {
    const result = interpolate("{{count}}-{{flag}}-{{nothing}}", {
      count: 3,
      flag: false,
      nothing: null,
    });
    expect(result.text).to.equal("3-false-{{nothing}}");
    expect(result.missing).to.deep.equal(["nothing"]);
  });
});

describe("[unit] engine/tokens send mode", () => {
  // A real send never shows a recipient the braces of a missing value; the
  // preview keeps them so the author sees the gap.
  it("blanks a missing token but still reports it", () => {
    const result = interpolate(
      "Hi {{customer.firstName}}, ref {{order.ref}}",
      { order: { ref: "A1" } },
      "send",
    );
    expect(result.text).to.equal("Hi , ref A1");
    expect(result.missing).to.deep.equal(["customer.firstName"]);
  });
  it("leaves what breaks the token grammar as typed", () => {
    expect(
      interpolate("{{user-name}} {{first name}}", { "user-name": "B" }, "send")
        .text,
    ).to.equal("{{user-name}} {{first name}}");
  });
});
