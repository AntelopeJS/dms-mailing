import {
  type PageToolbarProps,
  type PeriodComparison,
  type PeriodPreset,
  pageToolbar,
} from "@antelopejs/interface-dms/base";
import type { ComponentBuilder } from "@antelopejs/interface-dms/component";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import type { PageLiveOptions } from "@antelopejs/interface-dms/page";
import { MODULE_ID } from "../constants";

/** Shortest interval, in seconds, between two refetches of a live block. */
const LIVE_MAX_RATE_SECONDS = 5;

/**
 * Direct / Pause of the pages fed by the sends topic. One `rememberKey` for
 * the module: pausing the Sends log pauses the Overview too.
 */
export const MAILING_LIVE: PageLiveOptions = {
  maxRate: LIVE_MAX_RATE_SECONDS,
  rememberKey: MODULE_ID,
};

/** What the paused toggle and a held table call the sends they missed. */
export const NEW_SENDS_LABEL = "$dms_mailing.live.new_sends";

/**
 * The comparisons every mailing toolbar offers, in its "vs …" menu: the
 * previous period by default, the same window a year back, or none, which
 * leaves the cards without a delta.
 */
export const MAILING_COMPARISONS: PeriodComparison[] = [
  "previous-period",
  "previous-year",
  "none",
];

/** The period a page's toolbar offers. */
export interface MailingToolbarPeriod {
  scope: string;
  presets: PeriodPreset[];
  defaultPreset: PeriodPreset;
}

/**
 * The DMS page toolbar of a mailing page: the provider pill on the left, then
 * "updated", Direct / Pause and the period with its comparison menu ("vs …").
 *
 * The page keeps it under its `header` static, the id the former header
 * block had, so a role granting it keeps granting the bar.
 */
export function mailingToolbar(
  period: MailingToolbarPeriod,
): ComponentBuilder<PageToolbarProps> {
  return pageToolbar({
    leading: {
      provider: CustomComponent("MailingProviderPill").meta({
        name: "$dms_mailing.permissions.provider_pill.name",
        description: "$dms_mailing.permissions.provider_pill.description",
        icon: "i-ph-plugs-connected",
      }),
    },
    live: { missedLabel: NEW_SENDS_LABEL },
    period: {
      id: period.scope,
      presets: period.presets,
      defaultPreset: period.defaultPreset,
      // More than one comparison: pageToolbar() draws them as a "vs …" menu
      // on the first one, the previous period.
      comparisons: MAILING_COMPARISONS,
    },
  }).meta({
    name: "$dms_mailing.permissions.page_header.name",
    description: "$dms_mailing.permissions.page_header.description",
    icon: "i-ph-sliders-horizontal",
  });
}
