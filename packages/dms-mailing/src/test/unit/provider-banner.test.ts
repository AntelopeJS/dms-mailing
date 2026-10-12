import { expect } from "chai";
import {
  buildProviderBanner,
  isProviderFailing,
  type ProviderHealth,
} from "../../services/provider-banner";

const SINCE = new Date("2026-10-10T09:00:00.000Z");

const health = (overrides: Partial<ProviderHealth> = {}): ProviderHealth => ({
  providerName: "Brevo",
  providerReachable: true,
  recentFailures: 0,
  transportFailures: 0,
  suppressedFailures: 0,
  recentSends: 20,
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

  it("leaves a recipient's lone rejection to its own row", () => {
    expect(buildProviderBanner(health({ recentFailures: 1 }))).to.equal(null);
    expect(
      buildProviderBanner(health({ recentFailures: 3, recentSends: 200 })),
    ).to.equal(null);
  });

  it("speaks up on any connection failure", () => {
    expect(
      isProviderFailing(health({ recentFailures: 1, transportFailures: 1 })),
    ).to.equal(true);
  });

  it("says when only the first failures go again", () => {
    const banner = buildProviderBanner(
      health({ recentFailures: 150, recentSends: 300 }),
    );
    const replay = banner?.actions?.[1];
    expect(
      replay && "confirm" in replay ? replay.confirm : null,
    ).to.deep.include({
      description: `${KEY}confirm.description_capped`,
      params: { count: 100, total: 150 },
    });
  });

  it("leaves the failures to suppressed addresses out of the send again", () => {
    const banner = buildProviderBanner(
      health({ recentFailures: 4, suppressedFailures: 2 }),
    );
    const replay = banner?.actions?.[1];
    const confirm = replay && "confirm" in replay ? replay.confirm : null;
    expect(confirm).to.deep.include({
      description: `${KEY}confirm.description`,
      params: { count: 2 },
    });
    expect(confirm).to.have.deep.property("impact", [
      { icon: "i-ph-prohibit", label: `${KEY}confirm.suppressed`, count: 2 },
    ]);
  });

  it("offers no send again when every failure goes to a suppressed address", () => {
    const banner = buildProviderBanner(
      health({
        recentFailures: 3,
        suppressedFailures: 3,
        transportFailures: 1,
      }),
    );
    expect(banner?.actions).to.have.length(1);
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
