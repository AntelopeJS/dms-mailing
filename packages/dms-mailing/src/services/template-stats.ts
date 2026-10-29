import type { SendSummary } from "../db";
import { aggregate, groupBy } from "./metrics";
import { PROBLEM_STATUSES } from "../types";

/** What a template card and the details drawer say about recent sends. */
export interface TemplateStats {
  id: string;
  slug: string;
  sends: number;
  openRate: number;
  problems: number;
  lastSentAt: string | null;
}

export interface SourceCount {
  source: string;
  count: number;
}

/** Recipients who asked for a locale the template did not carry. */
export interface FallbackCount {
  requested: string;
  used: string;
  count: number;
}

export interface TemplatePerformance extends TemplateStats {
  sources: SourceCount[];
  fallbacks: FallbackCount[];
}

const UNKNOWN_SOURCE = "";
const MAX_SOURCES = 5;

const isProblem = (send: SendSummary): boolean =>
  PROBLEM_STATUSES.includes(send.status);

function lastSentAt(sends: SendSummary[]): string | null {
  const latest = sends.reduce<Date | null>((current, send) => {
    const at = new Date(send.createdAt);
    return !current || at > current ? at : current;
  }, null);
  return latest ? latest.toISOString() : null;
}

export function statsOf(
  id: string,
  slug: string,
  sends: SendSummary[],
): TemplateStats {
  return {
    id,
    slug,
    sends: sends.length,
    openRate: aggregate(sends).openRate ?? 0,
    problems: sends.filter(isProblem).length,
    lastSentAt: lastSentAt(sends),
  };
}

/** Sends grouped by the code path that made them, busiest first. */
export function sourcesOf(sends: SendSummary[]): SourceCount[] {
  return [...groupBy(sends, (send) => send.source ?? UNKNOWN_SOURCE)]
    .map(([source, rows]) => ({ source, count: rows.length }))
    .sort((left, right) => right.count - left.count)
    .slice(0, MAX_SOURCES);
}

/** Whether `send` went out in another locale than the one it asked for. */
function isRequestedFallback(
  send: SendSummary,
): send is SendSummary & { requestedLocale: string } {
  return Boolean(send.requestedLocale && send.requestedLocale !== send.locale);
}

export function isFallback(send: SendSummary): boolean {
  return isRequestedFallback(send);
}

export function fallbacksOf(sends: SendSummary[]): FallbackCount[] {
  const fallbacks = sends.filter(isRequestedFallback);
  return [
    ...groupBy(fallbacks, (send) => `${send.requestedLocale}>${send.locale}`),
  ].map(([, rows]) => {
    const first = rows[0];
    return {
      requested: first.requestedLocale,
      used: first.locale,
      count: rows.length,
    };
  });
}

export function performanceOf(
  id: string,
  slug: string,
  sends: SendSummary[],
): TemplatePerformance {
  return {
    ...statsOf(id, slug, sends),
    sources: sourcesOf(sends),
    fallbacks: fallbacksOf(sends),
  };
}
