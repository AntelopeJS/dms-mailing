import type { ActivityFeedItem } from "@antelopejs/interface-dms/base";
import type { ComposedTextParam } from "@antelopejs/interface-dms/base/types";
import type { SendSummary, MailingTemplate } from "../db";
import { PROBLEM_STATUSES } from "../types";

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
  params?: Record<string, string | number>;
}

const TEMPLATES_PAGE = "/modules/mailing/templates";
const TEMPLATES_ATTENTION_PAGE = `${TEMPLATES_PAGE}?tab=attention`;
const SENDS_PAGE = "/modules/mailing/sends";
const SENDS_PROBLEMS_PAGE = `${SENDS_PAGE}?view=problems`;
const SETTINGS_PAGE = "/modules/mailing/settings";
const STALE_DRAFT_DAYS = 7;
const DAY_MS = 86_400_000;

const isStaleDraft = (template: MailingTemplate, now: number): boolean =>
  template.status === "draft" &&
  !template.publishedAt &&
  now - new Date(template.updatedAt).getTime() > STALE_DRAFT_DAYS * DAY_MS;

function problemsItem(sends: SendSummary[]): AttentionItem[] {
  const problems = sends.filter((send) =>
    PROBLEM_STATUSES.includes(send.status),
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

function neverSentItem(
  templates: MailingTemplate[],
  sends: SendSummary[],
): AttentionItem[] {
  const used = new Set(sends.map((send) => send.templateSlug));
  const unused = templates.filter(
    (template) => template.status === "live" && !used.has(template.slug),
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
  /** What the configured provider can report; `null` when it is unreachable. */
  tracking: ProviderTracking | null;
}

/** The provider features the Overview's rates depend on. */
export interface ProviderTracking {
  name: string;
  openTracking: boolean;
  clickTracking: boolean;
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

/**
 * Open and click rates can only move if the provider reports those events. An
 * SMTP provider reports neither, so the rates sit at 0 % forever — which reads
 * as "nobody opened it" rather than "nobody can tell". Say so next to the
 * figures, and only while the window actually shows some.
 */
function untrackedRatesItem(window: AttentionWindow): AttentionItem[] {
  const { tracking } = window;
  if (!tracking || !window.sends.length) return [];
  if (tracking.openTracking && tracking.clickTracking) return [];
  return [
    {
      id: "untracked-rates",
      tone: "neutral",
      icon: "i-ph-eye-slash",
      title: "$dms_mailing.attention.untracked_rates.title",
      description: "$dms_mailing.attention.untracked_rates.description",
      action: "$dms_mailing.attention.untracked_rates.action",
      to: SETTINGS_PAGE,
      params: { provider: tracking.name },
    },
  ];
}

const MAX_LISTED_NAMES = 2;
const LIST_SEPARATOR = ", ";

function namesOf(templates: MailingTemplate[]): string {
  return templates
    .slice(0, MAX_LISTED_NAMES)
    .map((template) => template.name)
    .join(LIST_SEPARATOR);
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
    return own.size > 0 && [...known].some((code) => !own.has(code));
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
    ...testOnlyWindowItem(window),
    ...untrackedRatesItem(window),
    ...neverSentItem(window.templates, window.sends),
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
 * An attention item as an `ActivityFeed` entry: the explanation under the
 * title, the next step's verb on the right, the whole entry linking to it.
 */
export function attentionFeedItem(item: AttentionItem): ActivityFeedItem {
  return {
    id: item.id,
    icon: item.icon,
    tone: item.tone,
    title: item.title,
    meta: [item.description],
    params: feedParams(item),
    time: item.action,
    to: item.to,
  };
}
