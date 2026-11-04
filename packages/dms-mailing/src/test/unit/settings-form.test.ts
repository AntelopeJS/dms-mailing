import { expect } from "chai";
import { z } from "zod";
import { mailingSettingsForm } from "../../pages/settings/form";
import { MODULE_DEFAULT_SETTINGS } from "../../types";

const formOptionsSchema = z.object({
  fields: z.array(
    z.object({
      id: z.string(),
      defaultValue: z.unknown().optional(),
      offersDefault: z.boolean().optional(),
    }),
  ),
});

async function fieldsById() {
  const { options } = await mailingSettingsForm.serialize();
  const { fields } = formOptionsSchema.parse(options);
  return new Map(fields.map((field) => [field.id, field]));
}

describe("[unit] pages/settings form module defaults", () => {
  it("offers the module defaults, as the form holds them", async () => {
    const fields = await fieldsById();
    expect(fields.get("fallbackLocale")).to.include({
      defaultValue: MODULE_DEFAULT_SETTINGS.fallbackLocale,
      offersDefault: true,
    });
    /** `blockOnMissingVariables: false` is the "send" choice of the form. */
    expect(fields.get("missingVariables")).to.include({
      defaultValue: "send",
      offersDefault: true,
    });
  });

  it("offers none where one click would delete or move data", async () => {
    const fields = await fieldsById();
    for (const id of ["logRetentionDays", "categories", "senderEmail"]) {
      expect(fields.get(id)?.offersDefault, id).to.equal(undefined);
    }
  });
});
