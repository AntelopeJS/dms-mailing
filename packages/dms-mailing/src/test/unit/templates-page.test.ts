import { expect } from "chai";
import { TemplatesPageController } from "../../pages/templates";

const GALLERY_DISPLAY_ID = "mailing:gallery";

describe("[unit] pages/templates displays", () => {
  it("offers the gallery under the module-namespaced display id, by default", async () => {
    const { options } = await TemplatesPageController.table.serialize();
    expect(options?.displays?.map((display) => display.id)).to.deep.equal([
      GALLERY_DISPLAY_ID,
      "table",
    ]);
    expect(options?.defaultDisplay).to.equal(GALLERY_DISPLAY_ID);
  });
});
