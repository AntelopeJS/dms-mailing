import { expect } from "chai";
import type { MailingSend, MailingTemplate } from "../../db";
import {
  type AttentionItem,
  attentionFeedItem,
  buildAttentionItems,
} from "../../services/attention";

const send = (isTest: boolean): MailingSend =>
  ({ status: "sent", templateSlug: "welcome", isTest }) as MailingSend;

const NO_TEMPLATES: MailingTemplate[] = [];

const findExcluded = (items: AttentionItem[]) =>
  items.find((item) => item.id === "test-only-window");

describe("[unit] services/attention test-only window", () => {
  it("explains the empty figures when every send in the window is a test", () => {
    const items = buildAttentionItems({
      templates: NO_TEMPLATES,
      sends: [],
      excluded: [send(true), send(true)],
      tracking: null,
    });
    const item = findExcluded(items);
    expect(item).to.not.equal(undefined);
    expect(item).to.deep.include({
      tone: "neutral",
      title: "$dms_mailing.attention.test_only_window.title",
      description: "$dms_mailing.attention.test_only_window.description",
    });
    expect(item?.params).to.deep.equal({ count: 2 });
  });

  it("stays quiet when the window holds real sends too", () => {
    const items = buildAttentionItems({
      templates: NO_TEMPLATES,
      sends: [send(false)],
      excluded: [send(true)],
      tracking: null,
    });
    expect(findExcluded(items)).to.equal(undefined);
  });

  it("stays quiet when the window is genuinely empty", () => {
    const items = buildAttentionItems({
      templates: NO_TEMPLATES,
      sends: [],
      excluded: [],
      tracking: null,
    });
    expect(findExcluded(items)).to.equal(undefined);
  });
});

const findUntracked = (items: AttentionItem[]) =>
  items.find((item) => item.id === "untracked-rates");

const TRACKS_NOTHING = {
  name: "smtp",
  openTracking: false,
  clickTracking: false,
};
const TRACKS_EVERYTHING = {
  name: "postmark",
  openTracking: true,
  clickTracking: true,
};

describe("[unit] services/attention untracked rates", () => {
  it("explains the flat rates when the provider reports neither opens nor clicks", () => {
    const items = buildAttentionItems({
      templates: NO_TEMPLATES,
      sends: [send(false)],
      excluded: [],
      tracking: TRACKS_NOTHING,
    });
    const item = findUntracked(items);
    expect(item).to.not.equal(undefined);
    expect(item).to.deep.include({
      tone: "neutral",
      title: "$dms_mailing.attention.untracked_rates.title",
      description: "$dms_mailing.attention.untracked_rates.description",
    });
    expect(item?.params).to.deep.equal({ provider: "smtp" });
  });

  it("stays quiet when the provider tracks both", () => {
    const items = buildAttentionItems({
      templates: NO_TEMPLATES,
      sends: [send(false)],
      excluded: [],
      tracking: TRACKS_EVERYTHING,
    });
    expect(findUntracked(items)).to.equal(undefined);
  });

  it("still fires when only one of the two is tracked, since a rate stays flat", () => {
    const items = buildAttentionItems({
      templates: NO_TEMPLATES,
      sends: [send(false)],
      excluded: [],
      tracking: { ...TRACKS_NOTHING, openTracking: true },
    });
    expect(findUntracked(items)).to.not.equal(undefined);
  });

  // The notice explains figures the window actually shows. With nothing sent
  // there are no rates on screen to explain, and it would just be noise.
  it("stays quiet when the window holds no send at all", () => {
    const items = buildAttentionItems({
      templates: NO_TEMPLATES,
      sends: [],
      excluded: [],
      tracking: TRACKS_NOTHING,
    });
    expect(findUntracked(items)).to.equal(undefined);
  });

  // The provider may be unreachable; that is the provider card's business.
  it("stays quiet when the provider capabilities are unknown", () => {
    const items = buildAttentionItems({
      templates: NO_TEMPLATES,
      sends: [send(false)],
      excluded: [],
      tracking: null,
    });
    expect(findUntracked(items)).to.equal(undefined);
  });
});

describe("[unit] services/attention as a feed entry", () => {
  const problems: AttentionItem = {
    id: "problem-sends",
    tone: "error",
    icon: "i-ph-warning-octagon",
    title: "$dms_mailing.attention.problem_sends.title",
    description: "$dms_mailing.attention.problem_sends.description",
    action: "$dms_mailing.attention.problem_sends.action",
    to: "/modules/mailing/sends?view=problems",
    count: 3,
    params: { count: 3, bounced: 1, failed: 2, spam: 0 },
  };

  it("puts the explanation under the title and links to the next step", () => {
    expect(attentionFeedItem(problems)).to.deep.include({
      id: "problem-sends",
      tone: "error",
      title: problems.title,
      meta: [problems.description],
      to: problems.to,
    });
  });

  it("lists the counted details in place of the explanation", () => {
    const detail = {
      key: "$dms_mailing.attention.problem_sends.parts.failed",
      params: { count: { type: "count" as const, value: 2 } },
    };
    expect(
      attentionFeedItem({ ...problems, details: [detail] }).meta,
    ).to.deep.equal([detail]);
  });

  it("types the count so the title picks its plural form", () => {
    expect(attentionFeedItem(problems).params).to.deep.equal({
      count: { type: "count", value: 3 },
      bounced: 1,
      failed: 2,
      spam: 0,
    });
  });

  it("leaves an item without values without params", () => {
    const { count: _count, params: _params, ...plain } = problems;
    expect(attentionFeedItem(plain).params).to.equal(undefined);
  });
});
