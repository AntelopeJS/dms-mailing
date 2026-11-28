import { expect } from "chai";
import type { SendTemplateParams } from "@antelopejs/interface-dms-mailing";
import { checkedIdempotencyKey, keyedSendId } from "../../services/keyed-send";

const PREPARED = { tenantId: "tenant-a", slug: "order-confirmation" };
const KEY = "order-1042:confirmed";
const MAX_KEY_LENGTH = 200;
const SHA256_HEX = /^[0-9a-f]{64}$/;

function params(idempotencyKey?: string): SendTemplateParams {
  return {
    tenantId: PREPARED.tenantId,
    to: "sofie@example.test",
    idempotencyKey,
  };
}

describe("[unit] the id a caller's key gives a send", () => {
  it("is the same for the same key, template and recipient whatever the address's case or name, which a random id would never match on a retry", () => {
    const first = keyedSendId(PREPARED, KEY, "Sofie@Example.test");
    const again = keyedSendId(PREPARED, KEY, {
      email: " sofie@example.test ",
      name: "Sofie",
    });
    expect(again).to.equal(first);
    expect(first).to.match(SHA256_HEX);
  });

  it("differs by key, template, tenant and recipient", () => {
    const base = keyedSendId(PREPARED, KEY, "sofie@example.test");
    expect(
      keyedSendId(PREPARED, "order-1043:confirmed", "sofie@example.test"),
    ).to.not.equal(base);
    expect(
      keyedSendId(
        { ...PREPARED, slug: "invoice-sent" },
        KEY,
        "sofie@example.test",
      ),
    ).to.not.equal(base);
    expect(
      keyedSendId(
        { ...PREPARED, tenantId: "tenant-b" },
        KEY,
        "sofie@example.test",
      ),
    ).to.not.equal(base);
    expect(keyedSendId(PREPARED, KEY, "marc@example.test")).to.not.equal(base);
  });
});

describe("[unit] the caller's key is checked", () => {
  it("answers no key when the call carries none", () => {
    expect(checkedIdempotencyKey(params())).to.equal(undefined);
  });

  it("answers the key up to 200 characters", () => {
    const longest = "k".repeat(MAX_KEY_LENGTH);
    expect(checkedIdempotencyKey(params(KEY))).to.equal(KEY);
    expect(checkedIdempotencyKey(params(longest))).to.equal(longest);
  });

  it("refuses an empty key and one past 200 characters with invalid_idempotency_key, which a key passed on as it is would claim rows under", () => {
    for (const key of ["", "k".repeat(MAX_KEY_LENGTH + 1)]) {
      expect(() => checkedIdempotencyKey(params(key)))
        .to.throw()
        .with.property("code", "invalid_idempotency_key");
    }
  });
});
