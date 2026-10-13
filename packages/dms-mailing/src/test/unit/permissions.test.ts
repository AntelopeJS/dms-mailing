import { expect } from "chai";
import {
  GetPermission,
  IsModuleScopedPermission,
} from "@antelopejs/interface-dms/permissions";
import { MAILING_SEND_PERMISSION } from "../../constants";

const SENDS_PAGE_PERMISSION = "modules.mailing.main.sends";
const SETTINGS_PAGE_PERMISSION = "modules.mailing.configure.settings";
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

  it("keeps the settings page inside the module, owner-only", async () => {
    expect(IsModuleScopedPermission(SETTINGS_PAGE_PERMISSION)).to.equal(true);
    expect(await GetPermission(SETTINGS_PAGE_PERMISSION)).to.equal(undefined);
  });

  it("titles the send permission with i18n keys", async () => {
    const permission = await GetPermission(MAILING_SEND_PERMISSION);
    expect(permission?.title).to.match(/^\$dms_mailing\./);
    expect(permission?.description).to.match(/^\$dms_mailing\./);
  });

  it("no longer registers the page-access permissions", async () => {
    for (const id of REMOVED_PERMISSIONS) {
      expect(await GetPermission(id), id).to.equal(undefined);
    }
  });
});
