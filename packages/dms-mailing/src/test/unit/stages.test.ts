import { expect } from "chai";
import { SEND_STATUSES, stageOf } from "../../types";

describe("[unit] types/sends stageOf", () => {
  it("files every status under one send log tab", () => {
    expect(SEND_STATUSES.map(stageOf)).to.deep.equal([
      "in_progress",
      "in_progress",
      "delivered",
      "engaged",
      "engaged",
      "problem",
      "problem",
      "problem",
      "unsubscribed",
    ]);
  });
});
