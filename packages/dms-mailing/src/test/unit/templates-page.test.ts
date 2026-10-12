import { expect } from "chai";
import { TemplatesPageController } from "../../pages/templates";

const GALLERY_DISPLAY_ID = "mailing:gallery";
const GALLERY_PAGE_SIZE = 24;

describe("[unit] pages/templates displays", () => {
  it("offers the gallery under the module-namespaced display id, by default", async () => {
    const { options } = await TemplatesPageController.table.serialize();
    expect(options?.displays?.map((display) => display.id)).to.deep.equal([
      GALLERY_DISPLAY_ID,
      "table",
    ]);
    expect(options?.defaultDisplay).to.equal(GALLERY_DISPLAY_ID);
  });

  it("deletes only archived templates, after a confirmation naming them", async () => {
    const { options } = await TemplatesPageController.table.serialize();
    const remove = options?.rowActions?.delete;
    expect(remove).to.deep.include({
      rule: {
        and: [
          { field: "status", equals: "archived" },
          { field: "hasSends", notEquals: true },
        ],
      },
    });
    expect(JSON.stringify(remove)).to.contain("confirm.delete_title");
  });

  it("pages the gallery by whole rows of cards", async () => {
    const { options } = await TemplatesPageController.table.serialize();
    expect(options?.pageSize).to.equal(GALLERY_PAGE_SIZE);
  });
});
