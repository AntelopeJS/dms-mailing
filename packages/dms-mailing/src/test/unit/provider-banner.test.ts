import { expect } from "chai";
import {
  buildProviderBanner,
  type ProviderHealth,
} from "../../services/provider-banner";

const SINCE = new Date("2026-10-10T09:00:00.000Z");

const health = (overrides: Partial<ProviderHealth> = {}): ProviderHealth => ({
  providerName: "Brevo",
  providerReachable: true,
  recentFailures: 0,
  since: SINCE,
  ...overrides,
});

const KEY = "$dms_mailing.sends.banner.";

describe("[unit] services/provider-banner", () => {
  it("shows nothing while the provider answers and nothing failed", () => {
    expect(buildProviderBanner(health())).to.equal(null);
  });

  it("names the missing provider and links to its settings", () => {
    const banner = buildProviderBanner(
      health({ providerName: "", providerReachable: false }),
    );
    expect(banner?.tone).to.equal("error");
    expect(banner?.title).to.deep.equal({
      key: `${KEY}missing_title`,
      params: { provider: { key: `${KEY}the_provider` } },
    });
    expect(banner?.description).to.deep.equal({
      key: `${KEY}missing_description`,
    });
    expect(banner?.actions).to.have.length(1);
  });

  it("says the provider is not answering when it is configured", () => {
    const banner = buildProviderBanner(health({ providerReachable: false }));
    expect(banner?.title).to.deep.equal({
      key: `${KEY}unreachable_title`,
      params: { provider: "Brevo" },
    });
  });

  it("counts the failures and offers to send them again", () => {
    const banner = buildProviderBanner(health({ recentFailures: 4 }));
    expect(banner?.description).to.deep.equal({
      key: `${KEY}failures_description`,
      params: { count: { type: "count", value: 4 }, provider: "Brevo" },
    });
    const replay = banner?.actions?.[1];
    expect(replay).to.deep.include({ label: `${KEY}send_again` });
    expect(replay && "target" in replay ? replay.target : null).to.deep.include(
      {
        type: "api",
        method: "POST",
        body: { since: SINCE.toISOString() },
      },
    );
  });
});
