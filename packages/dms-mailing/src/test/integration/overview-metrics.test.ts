import { expect } from "chai";
import { z } from "zod";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";
import { checkedText, parsedBody } from "../helpers/checked";

const funnelBodySchema = z.object({
  steps: z.array(z.object({ id: z.string() })),
});

const HTTP_OK = 200;
const DAY_MS = 86_400_000;
const TABLE = "/api/mailing/tables/templates";
const METRICS = "/api/mailing/metrics";

const seriesSchema = z
  .array(z.object({ data: z.array(z.object({ x: z.string() })) }))
  .nonempty();

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
    const id = checkedText.parse(created.data._id);
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

    const funnel = await client.get(
      `${METRICS}/funnel?from=${from}&to=${to}&comparison=none`,
    );
    for (const step of funnel.data.steps) {
      expect(step).to.not.have.property("previousCount");
    }
    for (const list of ["domains", "top-templates"]) {
      const top = await client.get(
        `${METRICS}/${list}?from=${from}&to=${to}&comparison=none`,
      );
      expect(top.status).to.equal(HTTP_OK);
      for (const item of top.data.items) {
        expect(item).to.not.have.property("delta");
      }
    }
  });

  it("counts the funnel of the compared window too", async () => {
    const session = await ensureOwnerSession();
    const client = authorizedClient(session.accessToken);
    const from = new Date(Date.now() - DAY_MS).toISOString();
    const to = new Date(Date.now() + DAY_MS).toISOString();
    const funnel = await client.get(
      `${METRICS}/funnel?from=${from}&to=${to}&comparison=previous-year`,
    );
    expect(funnel.status).to.equal(HTTP_OK);
    const sent = parsedBody(funnel, funnelBodySchema).steps.find(
      (step) => step.id === "sent",
    );
    expect(sent).to.have.property("previousCount").that.is.a("number");
  });

  it("overlaps the previous period with the current one", async () => {
    const session = await ensureOwnerSession();
    const client = authorizedClient(session.accessToken);
    const from = new Date(Date.now() - 2 * DAY_MS).toISOString();
    const to = new Date(Date.now() + DAY_MS).toISOString();
    const volume = await client.get(`${METRICS}/volume?from=${from}&to=${to}`);
    const [axisSeries] = seriesSchema.parse(volume.data.series);
    const [comparedSeries] = seriesSchema.parse(volume.data.comparisonSeries);
    const axis = axisSeries.data.map((point) => point.x);
    const compared = comparedSeries.data.map((point) => point.x);
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
    const [series] = seriesSchema.parse(volume.data.series);
    const points = series.data;
    expect(points.length).to.be.greaterThan(1);
    expect(new Date(points[0]?.x ?? "").getTime()).to.be.lessThan(Date.now());
  });
});
