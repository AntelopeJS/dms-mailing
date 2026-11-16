import { expect } from "chai";
import { sendRow } from "../helpers/rows";

const tenantId = `send-tallies-${Date.now()}`;
const AT = new Date("2004-01-02T10:00:00.000Z");

async function sendModel() {
  const { GetModel } =
    await import("@antelopejs/interface-database-decorators");
  const { SendModel } = await import("../../db");
  return GetModel(SendModel, tenantId);
}

describe("[integration] send tallies", () => {
  it("merges a domain written with non-ASCII capitals with its lower case", async () => {
    const sends = await sendModel();
    const recipients = ["a@MÜNCHEN.DE", "b@münchen.de", "c@Example.TEST"];
    for (const [index, recipientEmail] of recipients.entries())
      await sends.insertImported(
        sendRow({ _id: `tally-${index}`, createdAt: AT, recipientEmail }),
      );

    const tallies = await sends.tally(
      { from: AT, to: new Date(AT.getTime() + 1), isTestLeftOut: true },
      { by: "domain" },
    );

    const keys = new Set(tallies.map((tally) => tally.key));
    expect(keys).to.deep.equal(new Set(["example.test", "münchen.de"]));
    const munich = tallies.filter((tally) => tally.key === "münchen.de");
    expect(munich.reduce((total, tally) => total + tally.count, 0)).to.equal(2);
  });
});
