import { expect } from "chai";
import { GetPermission } from "@antelopejs/interface-dms/permissions";
import { MAILING_SEND_PERMISSION } from "../../constants";

const SENDS_PAGE_PERMISSION = "modules.mailing.sends";
const SETTINGS_PAGE_PERMISSION = "settings.mailing.settings";
const REMOVED_PERMISSIONS = [
  "mailing.access",
  "mailing.templates.manage",
  "mailing.settings.manage",
];

describe("[unit] permissions", () => {
  it("makes the send permission depend on the sends page permission", async () => {
    const permission = await GetPermission(MAILING_SEND_PERMISSION);
    expect(permission?.dependencies).to.deep.equal([SENDS_PAGE_PERMISSION]);
  });

  it("registers the settings page default permission", async () => {
    expect(await GetPermission(SETTINGS_PAGE_PERMISSION)).to.not.equal(
      undefined,
    );
  });

  it("no longer registers the page-access permissions", async () => {
    for (const id of REMOVED_PERMISSIONS) {
      expect(await GetPermission(id), id).to.equal(undefined);
    }
  });
});
