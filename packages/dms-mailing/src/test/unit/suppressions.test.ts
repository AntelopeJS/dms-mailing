import { expect } from "chai";
import { normalizeAddress, suppressionIdOf } from "../../db";
import type { MailingSuppression } from "../../db";
import { suppressedError } from "../../services/checked-send";
import {
  summarizeSuppression,
  suppressionReasonOf,
} from "../../services/suppressions";

describe("[unit] services/suppressions", () => {
  it("suppresses a hard bounce, a complaint and an unsubscription", () => {
    const real = { isTest: false, isSoftBounce: false };
    expect(suppressionReasonOf({ ...real, type: "bounced" })).to.equal(
      "hard_bounce",
    );
    expect(suppressionReasonOf({ ...real, type: "spam" })).to.equal(
      "complaint",
    );
    expect(suppressionReasonOf({ ...real, type: "unsubscribed" })).to.equal(
      "unsubscribe",
    );
    expect(suppressionReasonOf({ ...real, type: "failed" })).to.equal(null);
    expect(suppressionReasonOf({ ...real, type: "opened" })).to.equal(null);
  });

  it("leaves a temporary bounce off the list", () => {
    expect(
      suppressionReasonOf({
        type: "bounced",
        isTest: false,
        isSoftBounce: true,
      }),
    ).to.equal(null);
  });

  it("takes only a test's hard bounce, not the editor's own gestures", () => {
    const test = { isTest: true, isSoftBounce: false };
    expect(suppressionReasonOf({ ...test, type: "bounced" })).to.equal(
      "hard_bounce",
    );
    expect(suppressionReasonOf({ ...test, type: "spam" })).to.equal(null);
    expect(suppressionReasonOf({ ...test, type: "unsubscribed" })).to.equal(
      null,
    );
  });

  it("keys an address whatever its case and spaces", () => {
    expect(normalizeAddress("  Ana@Example.COM ")).to.equal("ana@example.com");
    expect(suppressionIdOf(" Ana@Example.COM")).to.equal(
      suppressionIdOf("ana@example.com"),
    );
    expect(suppressionIdOf("ana@example.com")).to.match(/^[0-9a-f]{32}$/);
    expect(suppressionIdOf("bob@example.com")).to.not.equal(
      suppressionIdOf("ana@example.com"),
    );
  });

  it("words a suppressed send by its reason and drops an empty send id", () => {
    const row: MailingSuppression = {
      _id: "id",
      email: "ana@example.com",
      reason: "manual",
      sendId: "",
      createdAt: new Date(0),
    };
    expect(suppressedError(row)).to.equal(
      "$dms_mailing.errors.suppressed.manual",
    );
    expect(summarizeSuppression(row)).to.deep.equal({
      id: "id",
      email: "ana@example.com",
      reason: "manual",
      createdAt: new Date(0),
      sendId: undefined,
    });
  });
});
