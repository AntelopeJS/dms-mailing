import { expect } from "chai";
import type { MailingWebhookStatus } from "../../db";
import {
  isWebhookTestEvent,
  refusalBody,
  secretRefusal,
  sendWebhookTest,
  toWebhookStatus,
  WEBHOOK_SECRET_HEADER,
  WEBHOOK_TEST_MESSAGE_ID,
  type WebhookFetch,
} from "../../services/webhook-status";
import { checkedText } from "../helpers/checked";

const SECRET = "s".repeat(48);
const URL = "https://api.example.test/api/mailing/events/smtp/default";
const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;

const answering =
  (status: number, body: unknown, calls: RequestInit[] = []): WebhookFetch =>
  async (_url, init) => {
    calls.push(init);
    return new Response(JSON.stringify(body), { status });
  };

describe("[unit] services/webhook-status", () => {
  it("tells a missing secret from a wrong one", () => {
    expect(secretRefusal(undefined, SECRET)).to.equal("missing_secret");
    expect(secretRefusal("", SECRET)).to.equal("missing_secret");
    expect(secretRefusal("wrong", SECRET)).to.equal("bad_secret");
    expect(secretRefusal(SECRET, undefined)).to.equal("bad_secret");
    expect(secretRefusal(SECRET, SECRET)).to.equal(null);
  });

  it("answers a refusal in words naming the header", () => {
    const body = refusalBody("bad_secret");
    expect(body).to.deep.include({
      error: "webhook_refused",
      reason: "bad_secret",
    });
    expect(body.message).to.contain(WEBHOOK_SECRET_HEADER);
    expect(isWebhookTestEvent(WEBHOOK_TEST_MESSAGE_ID)).to.equal(true);
    expect(isWebhookTestEvent("a-real-id")).to.equal(false);
  });

  it("reads an empty status as nothing received nor refused", () => {
    expect(toWebhookStatus(undefined)).to.deep.equal({
      lastReceived: null,
      lastRefused: null,
    });
    const at = new Date(0);
    const row: MailingWebhookStatus = {
      _id: "default",
      receivedAt: at,
      receivedProvider: "postmark",
      receivedType: "delivered",
      isReceivedMatched: true,
      refusedAt: at,
      refusedProvider: "postmark",
      refusedReason: "bad_secret",
    };
    expect(toWebhookStatus(row)).to.deep.equal({
      lastReceived: {
        at,
        provider: "postmark",
        type: "delivered",
        isMatched: true,
        isTest: false,
      },
      lastRefused: { at, provider: "postmark", reason: "bad_secret" },
    });
  });

  it("posts the test event with the secret and reads the answer", async () => {
    const calls: RequestInit[] = [];
    const outcome = await sendWebhookTest(
      URL,
      SECRET,
      answering(HTTP_OK, { recorded: false, test: true }, calls),
    );
    expect(outcome).to.deep.include({
      isReceived: true,
      url: URL,
      httpStatus: HTTP_OK,
    });
    expect(calls[0]?.headers).to.have.property(WEBHOOK_SECRET_HEADER, SECRET);
    expect(JSON.parse(checkedText(calls[0]?.body)).messageId).to.equal(
      WEBHOOK_TEST_MESSAGE_ID,
    );
  });

  it("names the refusal or the network error of a failed test", async () => {
    const refused = await sendWebhookTest(
      URL,
      SECRET,
      answering(HTTP_FORBIDDEN, refusalBody("bad_secret")),
    );
    expect(refused).to.deep.include({
      isReceived: false,
      httpStatus: HTTP_FORBIDDEN,
      refusal: "bad_secret",
    });
    const unreachable = await sendWebhookTest(URL, SECRET, async () => {
      throw new Error("connect ECONNREFUSED 10.0.0.1:443");
    });
    expect(unreachable.isReceived).to.equal(false);
    expect(unreachable.networkError).to.contain("ECONNREFUSED");
    expect(unreachable.httpStatus).to.equal(undefined);
  });
});
