import { expect } from "chai";
import { setConfig } from "../../config";
import { renderEmailHtml } from "../../services/render";
import type { ResolvedEmail } from "../../types";

const EMAIL: ResolvedEmail = {
  subject: "S",
  preheader: "",
  blocks: [
    { id: "h", type: "heading", text: "Hello", align: "left", size: 23 },
  ],
  missing: [],
  hiddenBlockIds: [],
};

describe("[unit] services/render", () => {
  it("uses the fallback renderer when the DMS html-render chain is disabled", async () => {
    setConfig({ useHtmlRender: false });
    const html = await renderEmailHtml(EMAIL, "en");
    expect(html).to.include("<title>S</title>");
    expect(html).to.include("Hello");
  });
});
