import { expect } from "chai";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const DAY_MS = 86_400_000;
const TABLE = "/api/mailing/tables/templates";
const METRICS = "/api/mailing/metrics";

interface SeriesPoint {
  x: string;
  y: number;
}

describe("[integration] overview metrics", () => {
  it("reads the first-run checklist facts in one call", async () => {
    const session = await ensureOwnerSession();
    const client = authorizedClient(session.accessToken);
    const created = await client.post(`${TABLE}/new`, {
      slug: "overview-setup",
      name: "Overview setup",
      category: "orders",
    });
    expect(created.status, JSON.stringify(created.data)).to.equal(HTTP_OK);
    const id = created.data[0] as string;
    await client.post(`/api/mailing/templates/${id}/publish`, {});
    await client.post(`/api/mailing/templates/${id}/test-send`, {
      to: ["setup@example.test"],
      locale: "en",
      data: { customer: { firstName: "Sofie" }, detailsUrl: "https://x" },
    });

    const setup = await client.get(`${METRICS}/setup`);
    expect(setup.status, JSON.stringify(setup.data)).to.equal(HTTP_OK);
    expect(setup.data).to.include({
      isProviderConnected: true,
      hasTestSend: true,
    });
    expect(setup.data.liveTemplateCount).to.be.at.least(1);
    expect(setup.data.isSenderSet).to.be.a("boolean");
  });

  it("drops the comparison when the selector turned it off", async () => {
    const session = await ensureOwnerSession();
    const client = authorizedClient(session.accessToken);
    const from = new Date(Date.now() - DAY_MS).toISOString();
    const to = new Date(Date.now() + DAY_MS).toISOString();
    const volume = await client.get(
      `${METRICS}/volume?from=${from}&to=${to}&comparison=none`,
    );
    expect(volume.status).to.equal(HTTP_OK);
    expect(volume.data.comparisonSeries).to.deep.equal([]);
    expect(volume.data).to.not.have.property("delta");

    const kpi = await client.get(
      `${METRICS}/kpi/sends?from=${from}&to=${to}&comparison=none`,
    );
    expect(kpi.data).to.not.have.property("previousValue");
  });

  it("overlaps the previous period with the current one", async () => {
    const session = await ensureOwnerSession();
    const client = authorizedClient(session.accessToken);
    const from = new Date(Date.now() - 2 * DAY_MS).toISOString();
    const to = new Date(Date.now() + DAY_MS).toISOString();
    const volume = await client.get(`${METRICS}/volume?from=${from}&to=${to}`);
    const axis = (volume.data.series[0].data as SeriesPoint[]).map(
      (point) => point.x,
    );
    const compared = (
      volume.data.comparisonSeries[0].data as SeriesPoint[]
    ).map((point) => point.x);
    expect(compared).to.deep.equal(axis);
  });

  it("reads a reversed window the right way round", async () => {
    const session = await ensureOwnerSession();
    const client = authorizedClient(session.accessToken);
    const later = new Date(Date.now() + DAY_MS).toISOString();
    const earlier = new Date(Date.now() - 2 * DAY_MS).toISOString();
    const volume = await client.get(
      `${METRICS}/volume?from=${later}&to=${earlier}`,
    );
    expect(volume.status).to.equal(HTTP_OK);
    const points = volume.data.series[0].data as SeriesPoint[];
    expect(points.length).to.be.greaterThan(1);
    expect(new Date(points[0]?.x ?? "").getTime()).to.be.lessThan(Date.now());
  });
});
