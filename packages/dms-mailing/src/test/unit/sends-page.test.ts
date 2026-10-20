import { expect } from "chai";
import { SendsPageController } from "../../pages/sends";

const SEND_DRAWER = "MailingSendDrawer";

describe("[unit] pages/sends row click", () => {
  it("opens a send in a right drawer keeping the side panel's row options", async () => {
    const { options } = await SendsPageController.table.serialize();
    const details = options?.rowActions?.custom?.find(
      (action) => action.isDefault,
    );
    expect(JSON.stringify(details?.target)).to.contain(SEND_DRAWER);
    expect(details?.target).to.deep.include({
      type: "drawer",
      direction: "right",
      title: "$dms_mailing.sends.actions.details",
      positionLabel: "$dms_mailing.sends.drawer.position",
      deepLink: true,
      notFound: {},
    });
    // The DMS's default width: the user's resize is remembered.
    expect(details?.target).to.not.have.property("size");
  });
});
