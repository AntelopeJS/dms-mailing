import { HTTPResult } from "@antelopejs/interface-api";
import { expect } from "chai";
import { MailingSettingsController } from "../../routes/settings";
import { SuppressionsController } from "../../routes/suppressions";

const SETTINGS_BODY = {
  blockOnMissingVariables: "yes",
  logRetentionDays: "forever",
};
const SUPPRESSION_BODY = { email: "not-an-address" };
const EXPECTED_SETTINGS =
  '{"message":"$dms_mailing.errors.invalid_settings","issues":[{"code":"invalid_type","expected":"number","received":"string","path":["logRetentionDays"],"message":"Expected number, received string"},{"code":"invalid_type","expected":"boolean","received":"string","path":["missingVariables"],"message":"Expected boolean, received string"}]}';
const EXPECTED_SUPPRESSION =
  '{"message":"$dms_mailing.suppressions.errors.invalid","issues":[{"validation":"email","code":"invalid_string","message":"Invalid email","path":["email"]}]}';

async function refusal(
  attempt: () => Promise<object>,
): Promise<[number, string, string]> {
  try {
    await attempt();
  } catch (thrown: unknown) {
    expect(thrown).to.be.instanceOf(HTTPResult);
    if (thrown instanceof HTTPResult) {
      return [thrown.getStatus(), thrown.getContentType(), thrown.getBody()];
    }
  }
  throw new Error("not refused");
}

describe("[unit] routes refuse a body with zod's issues in JSON", () => {
  it("answers a refused settings write", async () => {
    const controller = new MailingSettingsController();

    expect(
      await refusal(() =>
        controller.update(Buffer.from(JSON.stringify(SETTINGS_BODY))),
      ),
    ).to.deep.equal([400, "application/json", EXPECTED_SETTINGS]);
  });

  it("answers a refused manual suppression", async () => {
    const controller = new SuppressionsController();

    expect(await refusal(() => controller.add(SUPPRESSION_BODY))).to.deep.equal(
      [400, "application/json", EXPECTED_SUPPRESSION],
    );
  });
});
