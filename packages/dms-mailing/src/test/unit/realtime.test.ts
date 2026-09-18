import { expect } from "chai";
import { realtimePageIds } from "../../realtime";

describe("[unit] realtime", () => {
  it("resolves the full page ids the sends topic is registered on", () => {
    expect(realtimePageIds()).to.deep.equal([
      "modules.mailing.sends",
      "modules.mailing.overview",
    ]);
  });
});
