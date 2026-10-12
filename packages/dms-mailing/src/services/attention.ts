import type { ActivityFeedItem } from "@antelopejs/interface-dms/base";
import type {
  ComposedText,
  ComposedTextParam,
} from "@antelopejs/interface-dms/base/types";
import type { SendSummary, MailingTemplate } from "../db";
import { isResolvedStage, PROBLEM_STATUSES } from "../types";
import { isDeliveryUntracked, type ProviderTracking } from "./metrics";

export type AttentionTone = "error" | "warning" | "neutral";

export interface AttentionItem {
  id: string;
  tone: AttentionTone;
  icon: string;
  title: string;
  description: string;
  /** The verb of the next step, an i18n key ("Review problems"). */
  action: string;
  to: string;
  /** The figure the title leads with, shown bold. */
  count?: number;
  params?: Record<string, ComposedTextParam>;
  /** Details shown in place of `description` where a feed lists them. */
  details?: ComposedText[];
}

const TEMPLATES_PAGE = "/modules/mailing/templates";
const TEMPLATES_ATTENTION_PAGE = `${TEMPLATES_PAGE}?tab=all&attention=1`;
const SENDS_PAGE = "/modules/mailing/sends";
const SENDS_PROBLEMS_PAGE = `${SENDS_PAGE}?view=problems`;
/** A settings form section, by the id the DMS form gives its anchor. */
const SETTINGS_SECTION = "/modules/mailing/settings#dms-form-content-section-";
const SENDER_SETTINGS = `${SETTINGS_SECTION}sender`;
const PROVIDER_SETTINGS = `${SETTINGS_SECTION}provider`;
const STALE_DRAFT_DAYS = 7;
const DAY_MS = 86_400_000;

const isStaleDraft = (template: MailingTemplate, now: number): boolean =>
  template.status === "draft" &&
  !template.publishedAt &&
  now - new Date(template.updatedAt).getTime() > STALE_DRAFT_DAYS * DAY_MS;

function problemsItem(sends: SendSummary[]): AttentionItem[] {
  const problems = sends.filter(
    (send) =>
      PROBLEM_STATUSES.includes(send.status) && !isResolvedStage(send.stage),
  );
  if (!problems.length) return [];
  return [
    {
      id: "problem-sends",
      tone: "error",
      icon: "i-ph-warning-octagon",
      title: "$dms_mailing.attention.problem_sends.title",
      description: "$dms_mailing.attention.problem_sends.description",
      action: "$dms_mailing.attention.problem_sends.action",
      to: SENDS_PROBLEMS_PAGE,
      count: problems.length,
      params: problemBreakdown(problems),
      details: problemDetails(problems),
    },
  ];
}

function staleDraftsItem(templates: MailingTemplate[]): AttentionItem[] {
  const stale = templates.filter((template) =>
    isStaleDraft(template, Date.now()),
  );
  if (!stale.length) return [];
  return [
    {
      id: "stale-drafts",
      tone: "neutral",
      icon: "i-ph-pencil-simple",
      title: "$dms_mailing.attention.stale_drafts.title",
      description: "$dms_mailing.attention.stale_drafts.description",
      action: "$dms_mailing.attention.stale_drafts.action",
      to: TEMPLATES_ATTENTION_PAGE,
      count: stale.length,
      params: { count: stale.length, days: STALE_DRAFT_DAYS },
    },
  ];
}

const publishedBy = (template: MailingTemplate, end: Date): boolean =>
  !template.publishedAt ||
  new Date(template.publishedAt).getTime() <= end.getTime();

/**
 * Live templates no send of the window used. Only the window is read, so the
 * item says "not sent in this period" rather than "never sent", and leaves
 * out a template published after the window closed.
 */
function unusedLiveItem(window: AttentionWindow): AttentionItem[] {
  const used = new Set(window.sends.map((send) => send.templateSlug));
  const unused = window.templates.filter(
    (template) =>
      template.status === "live" &&
      !used.has(template.slug) &&
      publishedBy(template, window.windowEnd),
  );
  if (!unused.length) return [];
  return [
    {
      id: "unused-live",
      tone: "warning",
      icon: "i-ph-eye-slash",
      title: "$dms_mailing.attention.unused_live.title",
      description: "$dms_mailing.attention.unused_live.description",
      action: "$dms_mailing.attention.unused_live.action",
      to: TEMPLATES_ATTENTION_PAGE,
      count: unused.length,
      params: { count: unused.length, names: namesOf(unused) },
    },
  ];
}

/**
 * Every send the Overview window holds, split the way the business view counts
 * them: `sends` are the ones behind the figures, `excluded` the test sends the
 * business audience drops.
 */
export interface AttentionWindow {
  templates: MailingTemplate[];
  sends: SendSummary[];
  excluded: SendSummary[];
  /** When the window closes. */
  windowEnd: Date;
  /** What the configured provider can report; `null` when it is unreachable. */
  tracking: ProviderTracking | null;
  /** Whether the settings name the address e-mails go out from. */
  isSenderSet: boolean;
}

function testOnlyWindowItem(window: AttentionWindow): AttentionItem[] {
  if (window.sends.length || !window.excluded.length) return [];
  return [
    {
      id: "test-only-window",
      tone: "neutral",
      icon: "i-ph-flask",
      title: "$dms_mailing.attention.test_only_window.title",
      description: "$dms_mailing.attention.test_only_window.description",
      action: "$dms_mailing.attention.test_only_window.action",
      to: SENDS_PAGE,
      count: window.excluded.length,
      params: { count: window.excluded.length },
    },
  ];
}

function senderMissingItem(window: AttentionWindow): AttentionItem[] {
  if (window.isSenderSet) return [];
  return [
    {
      id: "sender-missing",
      tone: "warning",
      icon: "i-ph-at",
      title: "$dms_mailing.attention.sender_missing.title",
      description: "$dms_mailing.attention.sender_missing.description",
      action: "$dms_mailing.attention.sender_missing.action",
      to: SENDER_SETTINGS,
    },
  ];
}

/**
 * With nothing reported back, every send stays "sent": the delivery figures
 * show "—" and this item says why, and where the webhook that would report
 * them is set.
 */
function untrackedDeliveryItem(window: AttentionWindow): AttentionItem[] {
  if (!isDeliveryUntracked(window.sends, window.tracking)) return [];
  return [
    {
      id: "untracked-delivery",
      tone: "neutral",
      icon: "i-ph-plugs",
      title: "$dms_mailing.attention.untracked_delivery.title",
      description: "$dms_mailing.attention.untracked_delivery.description",
      action: "$dms_mailing.attention.untracked_delivery.action",
      to: PROVIDER_SETTINGS,
      params: { provider: window.tracking?.name ?? "" },
    },
  ];
}

const showsEngagement = (send: SendSummary): boolean =>
  send.opens > 0 || send.clicks > 0;

/**
 * Open and click rates can only move if something reports those events: the
 * provider itself, or its webhook. Said only while the window shows none at
 * all, so the item never contradicts rates the webhook does fill; when the
 * delivery itself is unmeasured, that item says it already.
 */
function untrackedRatesItem(window: AttentionWindow): AttentionItem[] {
  const { tracking } = window;
  if (!tracking || !window.sends.length) return [];
  if (tracking.openTracking && tracking.clickTracking) return [];
  if (isDeliveryUntracked(window.sends, tracking)) return [];
  if (window.sends.some(showsEngagement)) return [];
  return [
    {
      id: "untracked-rates",
      tone: "neutral",
      icon: "i-ph-eye-slash",
      title: "$dms_mailing.attention.untracked_rates.title",
      description: "$dms_mailing.attention.untracked_rates.description",
      action: "$dms_mailing.attention.untracked_rates.action",
      to: PROVIDER_SETTINGS,
      params: { provider: tracking.name },
    },
  ];
}

const MAX_LISTED_NAMES = 2;
const LIST_SEPARATOR = ", ";
const MORE_NAMES_KEY = "$dms_mailing.attention.more_names";

/** The first names, and how many others there are ("A, B and 2 more"). */
function namesOf(templates: MailingTemplate[]): ComposedTextParam {
  const names = templates
    .slice(0, MAX_LISTED_NAMES)
    .map((template) => template.name)
    .join(LIST_SEPARATOR);
  const more = templates.length - MAX_LISTED_NAMES;
  if (more <= 0) return names;
  return {
    key: MORE_NAMES_KEY,
    params: { names, count: { type: "count", value: more } },
  };
}

function problemBreakdown(problems: SendSummary[]): Record<string, number> {
  const countOf = (status: string) =>
    problems.filter((send) => send.status === status).length;
  return {
    count: problems.length,
    bounced: countOf("bounced"),
    failed: countOf("failed"),
    spam: countOf("spam"),
  };
}

const PROBLEM_PARTS = ["bounced", "failed", "spam"] as const;
const PROBLEM_PART_KEY = "$dms_mailing.attention.problem_sends.parts.";

/** One counted detail per problem kind present ("2 provider failures"). */
function problemDetails(problems: SendSummary[]): ComposedText[] {
  return PROBLEM_PARTS.map((status) => ({
    status,
    count: problems.filter((send) => send.status === status).length,
  }))
    .filter((part) => part.count > 0)
    .map((part) => ({
      key: `${PROBLEM_PART_KEY}${part.status}`,
      params: { count: { type: "count", value: part.count } },
    }));
}

const localeCodes = (template: MailingTemplate): string[] =>
  (template.locales || "").split(",").filter(Boolean);

/**
 * Live templates missing a locale the workspace writes in elsewhere: the
 * locales any live template carries stand for the workspace's languages,
 * since the server holds no list of its own.
 */
export function missingLocaleTemplates(
  templates: MailingTemplate[],
): MailingTemplate[] {
  const live = templates.filter((template) => template.status === "live");
  const known = new Set(live.flatMap(localeCodes));
  return live.filter((template) => {
    const own = new Set(localeCodes(template));
    return [...known].some((code) => !own.has(code));
  });
}

function missingLocalesItem(templates: MailingTemplate[]): AttentionItem[] {
  const missing = missingLocaleTemplates(templates);
  if (!missing.length) return [];
  return [
    {
      id: "missing-locales",
      tone: "warning",
      icon: "i-ph-translate",
      title: "$dms_mailing.attention.missing_locales.title",
      description: "$dms_mailing.attention.missing_locales.description",
      action: "$dms_mailing.attention.missing_locales.action",
      to: TEMPLATES_ATTENTION_PAGE,
      count: missing.length,
      params: { count: missing.length, names: namesOf(missing) },
    },
  ];
}

export function buildAttentionItems(window: AttentionWindow): AttentionItem[] {
  return [
    ...problemsItem(window.sends),
    ...missingLocalesItem(window.templates),
    ...senderMissingItem(window),
    ...untrackedDeliveryItem(window),
    ...testOnlyWindowItem(window),
    ...untrackedRatesItem(window),
    ...unusedLiveItem(window),
    ...staleDraftsItem(window.templates),
  ];
}

const COUNT_PARAM = "count";

function feedParams(
  item: AttentionItem,
): Record<string, ComposedTextParam> | undefined {
  const params: Record<string, ComposedTextParam> = { ...item.params };
  const count = item.count ?? item.params?.[COUNT_PARAM];
  if (typeof count === "number") {
    params[COUNT_PARAM] = { type: "count", value: count };
  }
  return Object.keys(params).length ? params : undefined;
}

/**
 * An attention item as an `ActivityFeed` entry: the explanation (or its
 * counted details) under the title, the verb of the next step as its trailing
 * text, the whole entry linking to that step.
 */
export function attentionFeedItem(item: AttentionItem): ActivityFeedItem {
  return {
    id: item.id,
    icon: item.icon,
    tone: item.tone,
    title: item.title,
    meta: item.details?.length ? item.details : [item.description],
    params: feedParams(item),
    time: item.action,
    to: item.to,
  };
}
