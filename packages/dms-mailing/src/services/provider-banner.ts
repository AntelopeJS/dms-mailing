import type {
  BannerAction,
  BannerContent,
} from "@antelopejs/interface-dms/base";
import type { ComposedText } from "@antelopejs/interface-dms/base/types";
import { API_BASE_PATH } from "../constants";

/** What the provider banner is computed from. */
export interface ProviderHealth {
  /** Empty when no provider is connected. */
  providerName: string;
  providerReachable: boolean;
  /** Provider failures since `since`, the ones a send again may fix. */
  recentFailures: number;
  since: Date;
}

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

function replayAction(health: ProviderHealth): BannerAction {
  const count = health.recentFailures;
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
      description: key("confirm.description"),
      params: { count },
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
  return health.recentFailures ? [settings, replayAction(health)] : [settings];
}

/**
 * The send log's provider banner: `null` while the provider answers and no
 * send failed on it, otherwise what is wrong and the way out.
 */
export function buildProviderBanner(
  health: ProviderHealth,
): BannerContent | null {
  if (health.providerReachable && !health.recentFailures) return null;
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
