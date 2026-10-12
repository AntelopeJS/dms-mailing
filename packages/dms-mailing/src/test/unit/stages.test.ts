import { expect } from "chai";
import { isResolvedStage, SEND_STATUSES, stageOf } from "../../types";

describe("[unit] types/sends stageOf", () => {
  it("files every status under one send log tab", () => {
    expect(SEND_STATUSES.map((status) => stageOf(status))).to.deep.equal([
      "in_progress",
      "in_progress",
      "delivered",
      "engaged",
      "engaged",
      "problem",
      "problem",
      "problem",
      "unsubscribed",
      "suppressed",
    ]);
  });

  it("files a problem someone sent again as resolved, nothing else", () => {
    expect(stageOf("failed", true)).to.equal("resolved");
    expect(stageOf("bounced", true)).to.equal("resolved");
    expect(stageOf("delivered", true)).to.equal("delivered");
    expect(isResolvedStage(stageOf("spam", true))).to.equal(true);
    expect(isResolvedStage("problem")).to.equal(false);
  });
});
