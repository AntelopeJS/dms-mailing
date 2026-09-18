import { expect } from "chai";
import { MODULE_ID } from "../../constants";

describe("[unit] smoke", () => {
  it("exposes the module id", () => {
    expect(MODULE_ID).to.equal("mailing");
  });
});
