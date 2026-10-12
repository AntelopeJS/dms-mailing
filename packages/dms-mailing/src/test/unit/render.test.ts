import { expect } from "chai";
import { setConfig } from "../../config";
import { renderEmailHtml, stripRenderMarkers } from "../../services/render";
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

describe("[unit] services/render markers", () => {
  it("drops Vue's fragment markers but keeps Outlook's conditional comments", () => {
    const html =
      "<!--[--><p>a</p><!--]--><!----><!--[if mso]><b>x</b><![endif]-->";
    expect(stripRenderMarkers(html)).to.equal(
      "<p>a</p><!--[if mso]><b>x</b><![endif]-->",
    );
  });

  it("drops the v-if placeholders and teleport anchors of a development build", () => {
    const html =
      "<!--v-if--><p>a</p><!--teleport start--><!--teleport end--><!--teleport start anchor--><!--teleport anchor-->";
    expect(stripRenderMarkers(html)).to.equal("<p>a</p>");
  });
});
