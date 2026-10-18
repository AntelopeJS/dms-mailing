import { expect } from "chai";
import { SendsPageController } from "../../pages/sends";

const SEND_DRAWER = "MailingSendDrawer";

describe("[unit] pages/sends row click", () => {
  it("opens a send in a wide side panel over the log", async () => {
    const { options } = await SendsPageController.table.serialize();
    const details = options?.rowActions?.custom?.find(
      (action) => action.isDefault,
    );
    expect(JSON.stringify(details?.target)).to.contain(SEND_DRAWER);
    expect(details?.target).to.deep.include({
      type: "sidePanel",
      overlay: true,
      size: "3xl",
      positionLabel: "$dms_mailing.sends.drawer.position",
    });
  });
});
