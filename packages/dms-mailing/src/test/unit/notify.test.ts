import { expect } from "chai";
import {
  type BounceNotificationInput,
  bounceIdempotencyKey,
  bounceNotification,
  deliverBounceNotification,
  type IdempotentNotificationTarget,
  shouldNotify,
} from "../../services/notify";

const OWNER_IDS = ["owner-1", "owner-2"];

const INPUT: BounceNotificationInput = {
  sendId: "send-1",
  templateSlug: "welcome",
  recipientEmail: "a@b.test",
  type: "bounced",
};

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

describe("[unit] services/notify", () => {
  it("notifies once per problem status, never for happy events", () => {
    expect(shouldNotify("bounced")).to.equal(true);
    expect(shouldNotify("spam")).to.equal(true);
    expect(shouldNotify("opened")).to.equal(false);
  });

  it("builds a notification pointing at the sends page", () => {
    const notification = bounceNotification(INPUT);
    expect(notification.linkTo).to.equal("/modules/mailing/sends?tab=problems");
    expect(notification.params).to.deep.equal({
      slug: "welcome",
      email: "a@b.test",
    });
  });

  it("keys a bounce on the send it belongs to and its event type", () => {
    expect(bounceIdempotencyKey(INPUT)).to.equal("send-1:bounced");
    expect(bounceIdempotencyKey({ ...INPUT, type: "spam" })).to.equal(
      "send-1:spam",
    );
  });

  it("delivers through the idempotent path with a stable key", async () => {
    const recorded: RecordedDelivery[] = [];
    const target = recordingTarget(recorded);

    await deliverBounceNotification(target, OWNER_IDS, INPUT);
    await deliverBounceNotification(target, OWNER_IDS, INPUT);

    expect(recorded).to.deep.equal([
      { userIds: OWNER_IDS, idempotencyKey: "send-1:bounced" },
      { userIds: OWNER_IDS, idempotencyKey: "send-1:bounced" },
    ]);
  });
});
