import { expect } from "chai";
import {
  contentSystemPaths,
  footerForCategory,
  hasFooterLinksByDefault,
  localeSystemPaths,
  missingSystemVariables,
  resolveEmail,
  systemVariables,
} from "../../../engine";
import type { FooterBlock, LocaleContent } from "../../../types";

const footer = (overrides: Partial<FooterBlock> = {}): FooterBlock => ({
  id: "f",
  type: "footer",
  text: "Antelope",
  unsubscribeLabel: "Unsubscribe",
  preferencesLabel: "Preferences",
  visibleIf: null,
  ...overrides,
});

const locale = (block: FooterBlock, subject = "Hello"): LocaleContent => ({
  subject,
  preheader: "",
  blocks: [block],
});

describe("[unit] engine/system-variables", () => {
  it("declares the URL of every footer link that has a label", () => {
    expect(localeSystemPaths(locale(footer()))).to.deep.equal([
      "unsubscribeUrl",
      "preferencesUrl",
    ]);
    expect(
      localeSystemPaths(locale(footer({ preferencesLabel: " " }))),
    ).to.deep.equal(["unsubscribeUrl"]);
  });

  it("declares nothing for a footer without links", () => {
    const bare = footer({ unsubscribeLabel: "", preferencesLabel: "" });
    expect(localeSystemPaths(locale(bare))).to.deep.equal([]);
  });

  it("counts a system URL referenced as a token", () => {
    const bare = footer({ unsubscribeLabel: "", preferencesLabel: "" });
    const content = locale(bare, "Manage: {{preferencesUrl}}");
    expect(localeSystemPaths(content)).to.deep.equal(["preferencesUrl"]);
  });

  it("merges the locales of a content", () => {
    const content = {
      locales: {
        en: locale(footer({ preferencesLabel: "" })),
        fr: locale(footer({ unsubscribeLabel: "" })),
      },
    };
    expect(contentSystemPaths(content)).to.deep.equal([
      "unsubscribeUrl",
      "preferencesUrl",
    ]);
  });

  it("types them as urls, required only for a marketing template", () => {
    expect(systemVariables(["unsubscribeUrl"], "marketing")).to.deep.equal([
      { path: "unsubscribeUrl", type: "url", required: true },
    ]);
    expect(systemVariables(["unsubscribeUrl"], "orders")).to.deep.equal([
      { path: "unsubscribeUrl", type: "url", required: false },
    ]);
  });

  it("reports the required URLs a marketing send lacks", () => {
    const content = locale(footer());
    expect(missingSystemVariables(content, "marketing", {})).to.deep.equal([
      "unsubscribeUrl",
      "preferencesUrl",
    ]);
    expect(
      missingSystemVariables(content, "marketing", {
        unsubscribeUrl: "https://u",
        preferencesUrl: "https://p",
      }),
    ).to.deep.equal([]);
    expect(missingSystemVariables(content, "orders", {})).to.deep.equal([]);
  });

  it("keeps the links of uncategorised and marketing footers only", () => {
    expect(hasFooterLinksByDefault("")).to.equal(true);
    expect(hasFooterLinksByDefault("marketing")).to.equal(true);
    expect(hasFooterLinksByDefault("account")).to.equal(false);
    const content = { locales: { en: locale(footer()) } };
    const [stripped] = footerForCategory(content, "account").locales.en.blocks;
    expect(stripped).to.include({
      type: "footer",
      unsubscribeLabel: "",
      preferencesLabel: "",
      text: "Antelope",
    });
    expect(footerForCategory(content, "marketing")).to.equal(content);
  });

  it("leaves out a link whose label was cleared, whatever the data", () => {
    const content = locale(footer({ unsubscribeLabel: "" }));
    const email = resolveEmail(content, {
      unsubscribeUrl: "https://u",
      preferencesUrl: "https://p",
    });
    const [resolved] = email.blocks;
    expect(resolved?.type === "footer" && resolved.unsubscribeUrl).to.equal("");
    expect(resolved?.type === "footer" && resolved.preferencesUrl).to.equal(
      "https://p",
    );
  });
});
