import { expect } from "chai";
import { resolveEmail } from "../../../engine";
import type { LocaleContent } from "../../../types";

const CONTENT: LocaleContent = {
  subject: "Order {{order.ref}}",
  preheader: "Thanks {{customer.firstName}}",
  blocks: [
    {
      id: "h",
      type: "heading",
      text: "Thanks {{customer.firstName}}",
      align: "left",
      size: 23,
      visibleIf: null,
    },
    {
      id: "l",
      type: "list",
      source: "order.lines",
      labelPath: "label",
      valuePath: "total",
      visibleIf: null,
    },
    {
      id: "t",
      type: "total",
      label: "Total",
      value: "{{order.total}}",
      visibleIf: null,
    },
    {
      id: "i",
      type: "if",
      condition: { path: "order.hasGift", operator: "truthy", value: "" },
      visibleIf: null,
      children: [
        {
          id: "gift",
          type: "paragraph",
          text: "Gift inside",
          align: "left",
          visibleIf: null,
        },
      ],
      elseChildren: [
        {
          id: "nogift",
          type: "paragraph",
          text: "No gift",
          align: "left",
          visibleIf: null,
        },
      ],
    },
    {
      id: "b",
      type: "button",
      text: "Track",
      href: "{{order.trackUrl}}",
      align: "center",
      visibleIf: { path: "order.shipped", operator: "truthy", value: "" },
    },
    {
      id: "f",
      type: "footer",
      text: "Antelope",
      unsubscribeLabel: "Unsubscribe",
      preferencesLabel: "Preferences",
      visibleIf: null,
    },
  ],
};

const DATA = {
  customer: { firstName: "Sofie" },
  order: {
    ref: "CMD-1",
    total: "70,50 €",
    hasGift: true,
    lines: [
      { label: "Chair", total: "64" },
      { label: "Shipping", total: "6,50" },
    ],
  },
  unsubscribeUrl: "https://u",
};

describe("[unit] engine/resolve", () => {
  const email = resolveEmail(CONTENT, DATA);
  it("interpolates subject and preheader", () => {
    expect(email.subject).to.equal("Order CMD-1");
    expect(email.preheader).to.equal("Thanks Sofie");
  });
  it("expands lists, picks the if branch and flattens it", () => {
    expect(email.blocks.map((block) => block.id)).to.deep.equal([
      "h",
      "l",
      "t",
      "gift",
      "f",
    ]);
    const list = email.blocks[1]!;
    expect(list.type === "list" && list.rows).to.deep.equal([
      { label: "Chair", value: "64" },
      { label: "Shipping", value: "6,50" },
    ]);
  });
  it("hides blocks whose visibleIf is false and reports them", () => {
    expect(email.hiddenBlockIds).to.deep.equal(["nogift", "b"]);
  });
  // The only unresolved user path in this fixture is the tracking URL of the
  // button, which `order.shipped` hides — so it is not reported. The two
  // directions of that rule are covered below.
  it("resolves the footer's system urls without reporting them missing", () => {
    expect(email.missing).to.deep.equal([]);
    const footer = email.blocks[4]!;
    expect(footer.type === "footer" && footer.unsubscribeUrl).to.equal(
      "https://u",
    );
    expect(footer.type === "footer" && footer.preferencesUrl).to.equal("");
  });
});

describe("[unit] engine/resolve hidden blocks", () => {
  const hiddenParagraph = {
    subject: "S",
    preheader: "",
    blocks: [
      {
        id: "p1",
        type: "paragraph" as const,
        align: "left" as const,
        text: "A gift: {{order.giftMessage}}",
        visibleIf: {
          path: "order.hasGift",
          operator: "truthy" as const,
          value: "",
        },
      },
    ],
  };

  // `blockOnMissingVariables` refuses a send whose resolved e-mail reports a
  // missing variable. A block the condition hides is never rendered, so what it
  // references must not count — otherwise conditional content makes that
  // setting unusable.
  it("does not report a variable only a hidden block references", () => {
    const email = resolveEmail(hiddenParagraph, { order: { hasGift: false } });
    expect(email.blocks).to.have.lengthOf(0);
    expect(email.hiddenBlockIds).to.deep.equal(["p1"]);
    expect(email.missing).to.deep.equal([]);
  });

  it("still reports it when the block is shown", () => {
    const email = resolveEmail(hiddenParagraph, { order: { hasGift: true } });
    expect(email.blocks).to.have.lengthOf(1);
    expect(email.missing).to.deep.equal(["order.giftMessage"]);
  });
});

describe("[unit] engine/resolve system variables", () => {
  // `unsubscribeUrl` and `preferencesUrl` are filled by the runtime, so a
  // template referencing one must not ask the author to declare it.
  it("keeps system paths out of the missing list, unlike user paths", () => {
    const email = resolveEmail(
      {
        subject: "{{unsubscribeUrl}} {{preferencesUrl}} {{order.ref}}",
        preheader: "",
        blocks: [],
      },
      {},
    );
    expect(email.missing).to.deep.equal(["order.ref"]);
  });
});
