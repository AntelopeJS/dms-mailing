import type {
  BannerAction,
  BannerContent,
} from "@antelopejs/interface-dms/base";
import type { ComposedText } from "@antelopejs/interface-dms/base/types";
import { API_BASE_PATH } from "../constants";
import { MAX_BULK_REPLAY } from "./send-stats";

/** What the provider banner is computed from. */
export interface ProviderHealth {
  /** Empty when no provider is connected. */
  providerName: string;
  providerReachable: boolean;
  /** Provider failures since `since`, the ones a send again may fix. */
  recentFailures: number;
  /** Of those, the ones where the provider could not be reached at all. */
  transportFailures: number;
  /**
   * Of those, the ones whose address is on the suppression list: a send
   * again leaves them out, nothing would reach it.
   */
  suppressedFailures: number;
  /** Real sends since `since`, the base of the failure rate. */
  recentSends: number;
  since: Date;
}

/** Fewer failures than this in the hour are a recipient's, not the provider's. */
export const FAILING_MIN_COUNT = 3;
/** Share of the hour's sends, in percent, that must have failed. */
export const FAILING_MIN_RATE = 10;

const PERCENT = 100;

type BannerState = "missing" | "unreachable" | "failing";

const KEY = "$dms_mailing.sends.banner.";
const SETTINGS_PROVIDER_PAGE = "/modules/mailing/settings#provider";

const TITLE_KEYS: Record<BannerState, string> = {
  missing: "missing_title",
  unreachable: "unreachable_title",
  failing: "failures_title",
};

const key = (path: string): string => `${KEY}${path}`;

function bannerState(health: ProviderHealth): BannerState {
  if (health.providerReachable) return "failing";
  return health.providerName ? "unreachable" : "missing";
}

const providerParam = (health: ProviderHealth): ComposedText | string =>
  health.providerName || { key: key("the_provider") };

function description(health: ProviderHealth, state: BannerState): ComposedText {
  if (!health.recentFailures) return { key: key(`${state}_description`) };
  return {
    key: key("failures_description"),
    params: {
      count: { type: "count", value: health.recentFailures },
      provider: providerParam(health),
    },
  };
}

/**
 * Whether the failures add up to a provider problem: any connection failure,
 * or enough failures, and a large enough share of the hour's sends. A single
 * recipient's rejection is told on its own row, not here.
 */
export function isProviderFailing(health: ProviderHealth): boolean {
  if (health.transportFailures) return true;
  const rate = health.recentSends
    ? (health.recentFailures * PERCENT) / health.recentSends
    : 0;
  return health.recentFailures >= FAILING_MIN_COUNT && rate >= FAILING_MIN_RATE;
}

/** The failures a send again would send: not those to a suppressed address. */
const sendableFailures = (health: ProviderHealth): number =>
  Math.max(health.recentFailures - health.suppressedFailures, 0);

function confirmTexts(total: number) {
  const count = Math.min(total, MAX_BULK_REPLAY);
  const isCapped = total > count;
  return {
    description: key(
      isCapped ? "confirm.description_capped" : "confirm.description",
    ),
    params: isCapped ? { count, total } : { count },
  };
}

/** The failures left out, listed in the dialog so its count adds up. */
function confirmImpact(health: ProviderHealth) {
  if (!health.suppressedFailures) return {};
  return {
    impact: [
      {
        icon: "i-ph-prohibit",
        label: key("confirm.suppressed"),
        count: health.suppressedFailures,
      },
    ],
  };
}

function replayAction(health: ProviderHealth): BannerAction {
  return {
    label: key("send_again"),
    icon: "i-ph-arrow-clockwise",
    color: "error",
    target: {
      type: "api",
      url: `${API_BASE_PATH}/sends/replay-failed`,
      method: "POST",
      body: { since: health.since.toISOString() },
      successMessage: key("replayed"),
    },
    confirm: {
      title: key("confirm.title"),
      ...confirmTexts(sendableFailures(health)),
      ...confirmImpact(health),
      color: "warning",
      icon: "i-ph-arrow-clockwise",
      confirmLabel: key("confirm.confirm"),
      cancelLabel: key("confirm.cancel"),
    },
  };
}

function actions(health: ProviderHealth): BannerAction[] {
  const settings: BannerAction = {
    label: key("settings"),
    to: SETTINGS_PROVIDER_PAGE,
    variant: "outline",
    color: "neutral",
  };
  return sendableFailures(health)
    ? [settings, replayAction(health)]
    : [settings];
}

/**
 * The send log's provider banner: `null` while the provider answers and its
 * failures do not add up to a provider problem, otherwise what is wrong and
 * the way out.
 */
export function buildProviderBanner(
  health: ProviderHealth,
): BannerContent | null {
  if (health.providerReachable && !isProviderFailing(health)) return null;
  const state = bannerState(health);
  return {
    tone: "error",
    icon: "i-ph-plugs",
    title: {
      key: key(TITLE_KEYS[state]),
      params: { provider: providerParam(health) },
    },
    description: description(health, state),
    actions: actions(health),
  };
}
