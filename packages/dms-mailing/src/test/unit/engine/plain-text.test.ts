import { expect } from "chai";
import { labelSeparatorOf, renderPlainText } from "../../../engine";
import type { ResolvedEmail } from "../../../types";

const EMAIL: ResolvedEmail = {
  subject: "Hello",
  preheader: "Pre",
  missing: [],
  hiddenBlockIds: [],
  blocks: [
    {
      id: "f",
      type: "footer",
      text: "Antelope SA",
      unsubscribeLabel: "Unsubscribe",
      preferencesLabel: "Preferences",
      unsubscribeUrl: "https://u",
      preferencesUrl: "",
    },
    { id: "h", type: "heading", text: "Hi Sofie", align: "left", size: 23 },
    { id: "p", type: "paragraph", text: "Line one\nLine two", align: "left" },
    { id: "l", type: "list", rows: [{ label: "Chair", value: "64" }] },
    { id: "t", type: "total", label: "Total", value: "64" },
    {
      id: "b",
      type: "button",
      text: "Track",
      href: "https://x.test/track",
      align: "left",
    },
    { id: "c", type: "code", text: "123456" },
  ],
};

describe("[unit] engine/plain-text", () => {
  const text = renderPlainText(EMAIL);

  it("writes the blocks in order, the footer last", () => {
    expect(text.indexOf("Hi Sofie")).to.equal(0);
    expect(text.indexOf("Antelope SA")).to.be.greaterThan(
      text.indexOf("123456"),
    );
  });

  it("keeps line breaks, list rows, totals and button targets", () => {
    expect(text).to.include("Line one\nLine two");
    expect(text).to.include("Chair: 64");
    expect(text).to.include("Total: 64");
    expect(text).to.include("Track: https://x.test/track");
  });

  it("writes only the footer links that have a URL", () => {
    expect(text).to.include("Unsubscribe: https://u");
    expect(text).to.not.include("Preferences");
  });

  it("writes a hero's alt text only when the HTML shows its image", () => {
    const hero = (imageUrl: string) =>
      renderPlainText({
        ...EMAIL,
        blocks: [{ id: "i", type: "hero", imageUrl, alt: "Banner" }],
      });
    expect(hero("https://x.test/banner.png")).to.equal("Banner");
    expect(hero("")).to.equal("");
  });

  it("drops an empty footer", () => {
    const bare = renderPlainText({
      ...EMAIL,
      blocks: [
        {
          id: "f",
          type: "footer",
          text: " ",
          unsubscribeLabel: "",
          preferencesLabel: "",
          unsubscribeUrl: "",
          preferencesUrl: "",
        },
      ],
    });
    expect(bare).to.equal("");
  });
});

describe("[unit] engine/plain-text punctuation", () => {
  const NO_BREAK_SPACE = " ";

  it("spaces the colon off its label in French, with a no-break space", () => {
    const text = renderPlainText(EMAIL, "fr");
    expect(text).to.include(`Chair${NO_BREAK_SPACE}: 64`);
    expect(text).to.include(`Total${NO_BREAK_SPACE}: 64`);
    expect(text).to.include(`Track${NO_BREAK_SPACE}: https://x.test/track`);
  });

  it("reads the language of a regional locale, English by default", () => {
    expect(labelSeparatorOf("fr-BE")).to.equal(`${NO_BREAK_SPACE}: `);
    expect(labelSeparatorOf("en-GB")).to.equal(": ");
    expect(labelSeparatorOf()).to.equal(": ");
  });
});
