import { expect } from "chai";
import type { SendSummary } from "../../db";
import {
  crossesThreshold,
  deliverProblemsNotification,
  type IdempotentNotificationTarget,
  isAlreadyNotified,
  type ProblemNotificationInput,
  problemRate,
  problemsIdempotencyKey,
  problemsNotification,
  problemWindowOf,
  shouldNotify,
} from "../../services/notify";
import type { SendStatus } from "../../types";

const OWNER_IDS = ["owner-1", "owner-2"];

const INPUT: ProblemNotificationInput = {
  sendId: "send-1",
  templateSlug: "welcome",
  type: "bounced",
  isTest: false,
};

const AT = new Date("2026-10-11T14:20:00.000Z");

interface RecordedDelivery {
  userIds: string[];
  idempotencyKey: string;
}

function recordingTarget(
  recorded: RecordedDelivery[],
): IdempotentNotificationTarget {
  return {
    toUsersIdempotently: (userIds, idempotencyKey) => {
      recorded.push({ userIds, idempotencyKey });
      return Promise.resolve();
    },
  };
}

const summary = (status: SendStatus, isTest = false): SendSummary =>
  ({ status, isTest }) as SendSummary;

describe("[unit] services/notify", () => {
  it("only weighs the problems of real sends", () => {
    expect(shouldNotify(INPUT)).to.equal(true);
    expect(shouldNotify({ ...INPUT, type: "spam" })).to.equal(true);
    expect(shouldNotify({ ...INPUT, type: "opened" })).to.equal(false);
    expect(shouldNotify({ ...INPUT, isTest: true })).to.equal(false);
  });

  it("counts a template's hour without its tests", () => {
    const window = problemWindowOf([
      summary("bounced"),
      summary("failed"),
      summary("delivered"),
      summary("bounced", true),
    ]);
    expect(window).to.deep.equal({ sends: 3, problems: 2 });
    expect(problemRate(window)).to.equal(67);
  });

  it("alerts past a count and a share of the hour's sends", () => {
    expect(crossesThreshold({ sends: 3, problems: 2 })).to.equal(false);
    expect(crossesThreshold({ sends: 200, problems: 3 })).to.equal(false);
    expect(crossesThreshold({ sends: 40, problems: 3 })).to.equal(true);
  });

  it("aggregates the problems and opens the send that tipped them", () => {
    const notification = problemsNotification(INPUT, {
      sends: 20,
      problems: 4,
    });
    expect(notification.title).to.equal(
      "$dms_mailing.notifications.problems_title",
    );
    expect(notification.linkTo).to.equal(
      "/modules/mailing/sends?view=problems&record=send-1",
    );
    expect(notification.params).to.deep.equal({
      count: 4,
      slug: "welcome",
      rate: 20,
    });
  });

  it("keys one notification per template and clock hour", () => {
    const key = problemsIdempotencyKey(INPUT, AT);
    expect(problemsIdempotencyKey({ ...INPUT, sendId: "other" }, AT)).to.equal(
      key,
    );
    expect(
      problemsIdempotencyKey({ ...INPUT, templateSlug: "invoice" }, AT),
    ).to.not.equal(key);
    expect(
      problemsIdempotencyKey(INPUT, new Date("2026-10-11T15:01:00.000Z")),
    ).to.not.equal(key);
  });

  it("delivers through the idempotent path with the hour's key", async () => {
    const recorded: RecordedDelivery[] = [];
    const target = recordingTarget(recorded);
    const key = problemsIdempotencyKey(INPUT, AT);

    await deliverProblemsNotification(target, OWNER_IDS, key);

    expect(recorded).to.deep.equal([
      { userIds: OWNER_IDS, idempotencyKey: key },
    ]);
  });

  it("takes the hour's key already used as already notified", async () => {
    const duplicate = Object.assign(
      new Error("E11000 duplicate key error collection: user_notifications"),
      { code: 11000 },
    );
    const target: IdempotentNotificationTarget = {
      toUsersIdempotently: () => Promise.reject(duplicate),
    };
    await deliverProblemsNotification(target, OWNER_IDS, "welcome:1");
    expect(
      isAlreadyNotified(new Error("MongoBulkWriteError: E11000")),
    ).to.equal(true);
    expect(isAlreadyNotified(new Error("connection lost"))).to.equal(false);
  });

  it("still reports another delivery failure", async () => {
    const target: IdempotentNotificationTarget = {
      toUsersIdempotently: () => Promise.reject(new Error("connection lost")),
    };
    let caught: unknown;
    try {
      await deliverProblemsNotification(target, OWNER_IDS, "welcome:1");
    } catch (error) {
      caught = error;
    }
    expect(String(caught)).to.contain("connection lost");
  });
});
