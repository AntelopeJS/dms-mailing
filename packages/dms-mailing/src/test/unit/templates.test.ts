import { expect } from "chai";
import { blankContent, localesOf } from "../../services/templates";
import type { LocaleContent, TemplateContent } from "../../types";

const emptyLocale = (): LocaleContent => ({
  subject: "",
  preheader: "",
  blocks: [],
});

describe("[unit] services/templates localesOf", () => {
  it("lists the locale codes present in the content", () => {
    const content: TemplateContent = {
      locales: { en: emptyLocale(), fr: emptyLocale() },
    };
    expect(localesOf(content)).to.equal("en,fr");
  });

  it("answers an empty string for content without locales", () => {
    const content: TemplateContent = { locales: {} };
    expect(localesOf(content)).to.equal("");
  });
});

describe("[unit] services/templates blankContent", () => {
  it("carries only a footer with the unsubscribe and preferences labels", () => {
    const content = blankContent("en");
    const locale = content.locales.en as LocaleContent;
    expect(Object.keys(content.locales)).to.deep.equal(["en"]);
    expect(locale.blocks).to.have.lengthOf(1);
    const [footer] = locale.blocks;
    expect(footer?.type).to.equal("footer");
    expect(footer).to.include({
      unsubscribeLabel: "Unsubscribe",
      preferencesLabel: "Preferences",
    });
  });

  it("invents no subject, preheader or footer prose", () => {
    const locale = blankContent("en").locales.en as LocaleContent;
    expect(locale.subject).to.equal("");
    expect(locale.preheader).to.equal("");
    expect(locale.blocks[0]).to.include({ text: "" });
  });

  it("localises the labels and falls back to English", () => {
    const french = blankContent("fr").locales.fr as LocaleContent;
    expect(french.blocks[0]).to.include({ unsubscribeLabel: "Se désinscrire" });
    const unknown = blankContent("de").locales.de as LocaleContent;
    expect(unknown.blocks[0]).to.include({ unsubscribeLabel: "Unsubscribe" });
  });
});
