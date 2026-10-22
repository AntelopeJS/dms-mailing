import { expect } from "chai";
import type { MailingSend, MailingTemplate } from "../../db";
import {
  type AttentionItem,
  type AttentionWindow,
  attentionFeedItem,
  buildAttentionItems,
} from "../../services/attention";

const sendWith = (
  status: MailingSend["status"],
  isTest: boolean,
  opens = 0,
  clicks = 0,
): MailingSend =>
  ({ status, templateSlug: "welcome", isTest, opens, clicks }) as MailingSend;

const send = (isTest: boolean): MailingSend => sendWith("sent", isTest);

const NO_TEMPLATES: MailingTemplate[] = [];
const WINDOW_END = new Date("2026-09-30T00:00:00.000Z");

const windowWith = (overrides: Partial<AttentionWindow>): AttentionWindow => ({
  templates: NO_TEMPLATES,
  sends: [],
  excluded: [],
  windowEnd: WINDOW_END,
  tracking: null,
  isSenderSet: true,
  ...overrides,
});

const findItem = (items: AttentionItem[], id: string) =>
  items.find((item) => item.id === id);

const findExcluded = (items: AttentionItem[]) =>
  findItem(items, "test-only-window");

describe("[unit] services/attention test-only window", () => {
  it("explains the empty figures when every send in the window is a test", () => {
    const items = buildAttentionItems(
      windowWith({ excluded: [send(true), send(true)] }),
    );
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
    const items = buildAttentionItems(
      windowWith({ sends: [send(false)], excluded: [send(true)] }),
    );
    expect(findExcluded(items)).to.equal(undefined);
  });

  it("stays quiet when the window is genuinely empty", () => {
    expect(findExcluded(buildAttentionItems(windowWith({})))).to.equal(
      undefined,
    );
  });
});

const findUntracked = (items: AttentionItem[]) =>
  findItem(items, "untracked-rates");
const findUntrackedDelivery = (items: AttentionItem[]) =>
  findItem(items, "untracked-delivery");

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

const reported = (
  status: MailingSend["status"],
  opens = 0,
  clicks = 0,
): MailingSend => sendWith(status, false, opens, clicks);

describe("[unit] services/attention untracked delivery", () => {
  it("says delivery is not measured when nothing reported any event back", () => {
    const items = buildAttentionItems(
      windowWith({ sends: [send(false)], tracking: TRACKS_NOTHING }),
    );
    expect(findUntrackedDelivery(items)).to.deep.include({
      title: "$dms_mailing.attention.untracked_delivery.title",
      to: "/modules/mailing/settings#dms-form-content-section-provider",
    });
    expect(findUntrackedDelivery(items)?.params).to.deep.equal({
      provider: "smtp",
    });
    expect(findUntracked(items)).to.equal(undefined);
  });

  it("stays quiet once the webhook reports a delivery", () => {
    const items = buildAttentionItems(
      windowWith({
        sends: [send(false), reported("delivered")],
        tracking: TRACKS_NOTHING,
      }),
    );
    expect(findUntrackedDelivery(items)).to.equal(undefined);
  });

  it("stays quiet when the provider tracks events itself", () => {
    const items = buildAttentionItems(
      windowWith({ sends: [send(false)], tracking: TRACKS_EVERYTHING }),
    );
    expect(findUntrackedDelivery(items)).to.equal(undefined);
  });
});

describe("[unit] services/attention untracked rates", () => {
  it("explains the flat rates when deliveries come back but no open or click", () => {
    const items = buildAttentionItems(
      windowWith({ sends: [reported("delivered")], tracking: TRACKS_NOTHING }),
    );
    const item = findUntracked(items);
    expect(item).to.not.equal(undefined);
    expect(item).to.deep.include({
      tone: "neutral",
      title: "$dms_mailing.attention.untracked_rates.title",
      description: "$dms_mailing.attention.untracked_rates.description",
    });
    expect(item?.params).to.deep.equal({ provider: "smtp" });
  });

  // The webhook may report opens the provider does not track itself: the
  // item would then contradict the rates on screen.
  it("stays quiet once the window shows an open or a click", () => {
    const items = buildAttentionItems(
      windowWith({
        sends: [reported("delivered"), reported("opened", 1)],
        tracking: TRACKS_NOTHING,
      }),
    );
    expect(findUntracked(items)).to.equal(undefined);
  });

  it("stays quiet when the provider tracks both", () => {
    const items = buildAttentionItems(
      windowWith({
        sends: [reported("delivered")],
        tracking: TRACKS_EVERYTHING,
      }),
    );
    expect(findUntracked(items)).to.equal(undefined);
  });

  it("still fires when only one of the two is tracked, since a rate stays flat", () => {
    const items = buildAttentionItems(
      windowWith({
        sends: [reported("delivered")],
        tracking: { ...TRACKS_NOTHING, openTracking: true },
      }),
    );
    expect(findUntracked(items)).to.not.equal(undefined);
  });

  it("stays quiet when the window holds no send at all", () => {
    const items = buildAttentionItems(windowWith({ tracking: TRACKS_NOTHING }));
    expect(findUntracked(items)).to.equal(undefined);
    expect(findUntrackedDelivery(items)).to.equal(undefined);
  });

  // The provider may be unreachable; that is the provider card's business.
  it("stays quiet when the provider capabilities are unknown", () => {
    const items = buildAttentionItems(windowWith({ sends: [send(false)] }));
    expect(findUntracked(items)).to.equal(undefined);
    expect(findUntrackedDelivery(items)).to.equal(undefined);
  });
});

const liveTemplate = (
  slug: string,
  publishedAt = new Date("2026-09-01T00:00:00.000Z"),
): MailingTemplate =>
  ({
    slug,
    name: `Template ${slug}`,
    status: "live",
    locales: "en",
    publishedAt,
    updatedAt: publishedAt,
  }) as MailingTemplate;

describe("[unit] services/attention live templates without a send", () => {
  it("counts live templates the window did not use", () => {
    const items = buildAttentionItems(
      windowWith({ templates: [liveTemplate("welcome"), liveTemplate("bye")] }),
    );
    expect(findItem(items, "unused-live")).to.deep.include({
      count: 2,
      title: "$dms_mailing.attention.unused_live.title",
      to: "/modules/mailing/templates?tab=attention",
    });
  });

  it("leaves out a template published after the window closed", () => {
    const later = new Date(WINDOW_END.getTime() + 1);
    const items = buildAttentionItems(
      windowWith({
        templates: [liveTemplate("welcome"), liveTemplate("new", later)],
        sends: [send(false)],
      }),
    );
    expect(findItem(items, "unused-live")).to.equal(undefined);
  });

  it("names two templates and counts the others", () => {
    const templates = ["a", "b", "c", "d"].map((slug) => liveTemplate(slug));
    const item = findItem(
      buildAttentionItems(windowWith({ templates })),
      "unused-live",
    );
    expect(item?.params?.names).to.deep.equal({
      key: "$dms_mailing.attention.more_names",
      params: {
        names: "Template a, Template b",
        count: { type: "count", value: 2 },
      },
    });
  });

  it("names every template when there are two at most", () => {
    const item = findItem(
      buildAttentionItems(windowWith({ templates: [liveTemplate("a")] })),
      "unused-live",
    );
    expect(item?.params?.names).to.equal("Template a");
  });
});

describe("[unit] services/attention sender", () => {
  it("asks for a sender address while none is set", () => {
    const item = findItem(
      buildAttentionItems(windowWith({ isSenderSet: false })),
      "sender-missing",
    );
    expect(item).to.deep.include({
      tone: "warning",
      title: "$dms_mailing.attention.sender_missing.title",
      to: "/modules/mailing/settings#dms-form-content-section-sender",
    });
  });

  it("stays quiet once the sender is set", () => {
    expect(
      findItem(buildAttentionItems(windowWith({})), "sender-missing"),
    ).to.equal(undefined);
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

  it("writes the next step's verb as the trailing text", () => {
    expect(attentionFeedItem(problems).time).to.equal(problems.action);
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

describe("[unit] services/attention problem sends", () => {
  const withStage = (
    status: MailingSend["status"],
    stage: MailingSend["stage"],
  ): MailingSend =>
    ({
      status,
      stage,
      templateSlug: "welcome",
      isTest: false,
      opens: 0,
      clicks: 0,
    }) as MailingSend;

  it("leaves out the problems a send again resolved, like the Problems tab", () => {
    const items = buildAttentionItems(
      windowWith({
        sends: [
          withStage("failed", "problem"),
          withStage("bounced", "problem"),
          withStage("failed", "resolved"),
        ],
      }),
    );
    const item = findItem(items, "problem-sends");
    expect(item?.count).to.equal(2);
    expect(item?.params).to.deep.include({ count: 2, failed: 1, bounced: 1 });
  });

  it("stays quiet when every problem was sent again", () => {
    const items = buildAttentionItems(
      windowWith({ sends: [withStage("failed", "resolved")] }),
    );
    expect(findItem(items, "problem-sends")).to.equal(undefined);
  });
});
