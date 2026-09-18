import { expect } from "chai";
import { renderFallbackHtml } from "../../../engine";
import type { ResolvedEmail } from "../../../types";

const EMAIL: ResolvedEmail = {
  subject: "Hello",
  preheader: "Pre",
  missing: [],
  hiddenBlockIds: [],
  blocks: [
    { id: "h", type: "heading", text: "Hi <Sofie>", align: "left", size: 23 },
    {
      id: "b",
      type: "button",
      text: "Go",
      href: "https://x.test/?a=1&b=2",
      align: "center",
    },
    { id: "l", type: "list", rows: [{ label: "Chair", value: "64" }] },
    {
      id: "f",
      type: "footer",
      text: "Antelope",
      unsubscribeLabel: "Unsub",
      preferencesLabel: "Prefs",
      unsubscribeUrl: "https://u",
      preferencesUrl: "",
    },
  ],
};

describe("[unit] engine/fallback-html", () => {
  const html = renderFallbackHtml(EMAIL, "en");
  it("produces a full document with the subject as title and escaped content", () => {
    expect(html).to.match(/^<!DOCTYPE html>/);
    expect(html).to.include("<title>Hello</title>");
    expect(html).to.include("Hi &lt;Sofie&gt;");
    expect(html).to.include('href="https://x.test/?a=1&amp;b=2"');
  });
  it("renders list rows and only the footer links that have a url", () => {
    expect(html).to.include("Chair");
    expect(html).to.include('href="https://u"');
    expect(html).to.not.include("Prefs");
  });
});

const withHref = (href: string): ResolvedEmail => ({
  subject: "S",
  preheader: "P",
  missing: [],
  hiddenBlockIds: [],
  blocks: [{ id: "b", type: "button", text: "Go", href, align: "left" }],
});

describe("[unit] engine/fallback-html link schemes", () => {
  // A link target can come straight from an interpolated variable, so it is
  // recipient-supplied data. Escaping the entities is not enough: the scheme
  // itself has to be one a mail client may follow.
  it("keeps the schemes an e-mail legitimately uses", () => {
    for (const href of [
      "https://x.test/a?b=1",
      "http://x.test",
      "mailto:a@b.test",
      "/relative/path",
      "{{order.trackUrl}}",
    ]) {
      expect(renderFallbackHtml(withHref(href), "en")).to.contain("href=");
      expect(renderFallbackHtml(withHref(href), "en")).to.not.contain(
        'href="#"',
      );
    }
  });

  it("neutralises a scheme that carries code", () => {
    for (const href of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      " javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox",
    ]) {
      expect(renderFallbackHtml(withHref(href), "en")).to.contain('href="#"');
      expect(renderFallbackHtml(withHref(href), "en")).to.not.contain("alert");
    }
  });
});
