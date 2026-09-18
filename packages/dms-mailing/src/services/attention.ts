import type { MailingSend, MailingTemplate } from "../db";
import { PROBLEM_STATUSES } from "../types";

export type AttentionTone = "error" | "warning" | "neutral";

export interface AttentionItem {
  id: string;
  tone: AttentionTone;
  icon: string;
  title: string;
  description: string;
  to: string;
  params?: Record<string, string | number>;
}

const TEMPLATES_PAGE = "/modules/mailing/templates";
const SENDS_PAGE = "/modules/mailing/sends";
const SENDS_PROBLEMS_PAGE = `${SENDS_PAGE}?tab=problems`;
const STALE_DRAFT_DAYS = 7;
const DAY_MS = 86_400_000;

const isStaleDraft = (template: MailingTemplate, now: number): boolean =>
  template.status === "draft" &&
  !template.publishedAt &&
  now - new Date(template.updatedAt).getTime() > STALE_DRAFT_DAYS * DAY_MS;

function problemsItem(sends: MailingSend[]): AttentionItem[] {
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
      to: SENDS_PROBLEMS_PAGE,
      params: { count: problems.length },
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
      to: TEMPLATES_PAGE,
      params: { count: stale.length },
    },
  ];
}

function neverSentItem(
  templates: MailingTemplate[],
  sends: MailingSend[],
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
      to: TEMPLATES_PAGE,
      params: { count: unused.length },
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
  sends: MailingSend[];
  excluded: MailingSend[];
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
      to: SENDS_PAGE,
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
      to: SENDS_PAGE,
      params: { provider: tracking.name },
    },
  ];
}

export function buildAttentionItems(window: AttentionWindow): AttentionItem[] {
  return [
    ...problemsItem(window.sends),
    ...testOnlyWindowItem(window),
    ...untrackedRatesItem(window),
    ...neverSentItem(window.templates, window.sends),
    ...staleDraftsItem(window.templates),
  ];
}
