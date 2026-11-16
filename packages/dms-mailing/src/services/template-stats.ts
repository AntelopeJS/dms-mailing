import type { FallbackTally, SendTally } from "../db";
import { aggregate, byFirstSend, countOf, tallyGroups } from "./metrics";
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

const MAX_SOURCES = 5;

const isProblem = (send: SendTally): boolean =>
  PROBLEM_STATUSES.includes(send.status);

function lastSentAt(sends: SendTally[]): string | null {
  if (!sends.length) return null;
  return new Date(
    Math.max(...sends.map((send) => send.lastAtMs)),
  ).toISOString();
}

/** A template's figures, from its sends tallied by any group. */
export function statsOf(
  id: string,
  slug: string,
  sends: SendTally[],
): TemplateStats {
  return {
    id,
    slug,
    sends: countOf(sends),
    openRate: aggregate(sends).openRate ?? 0,
    problems: countOf(sends, isProblem),
    lastSentAt: lastSentAt(sends),
  };
}

/**
 * Sends per code path that made them, busiest first, from tallies by source;
 * a tie keeps the source whose first send came first.
 */
export function sourcesOf(bySource: SendTally[]): SourceCount[] {
  return [...tallyGroups(bySource)]
    .map(([source, rows]) => ({ source: String(source), count: countOf(rows) }))
    .sort((left, right) => right.count - left.count)
    .slice(0, MAX_SOURCES);
}

/**
 * The locale fallbacks, the one whose first send came first, first; a tie on
 * the millisecond follows the requested then the used locale.
 */
export function fallbacksOf(fallbacks: FallbackTally[]): FallbackCount[] {
  return [...fallbacks]
    .sort(
      byFirstSend(
        (fallback) => fallback.firstAtMs,
        (fallback) => `${fallback.requested}>${fallback.used}`,
      ),
    )
    .map(({ requested, used, count }) => ({ requested, used, count }));
}

export function performanceOf(
  id: string,
  slug: string,
  bySource: SendTally[],
  fallbacks: FallbackTally[],
): TemplatePerformance {
  return {
    ...statsOf(id, slug, bySource),
    sources: sourcesOf(bySource),
    fallbacks: fallbacksOf(fallbacks),
  };
}
