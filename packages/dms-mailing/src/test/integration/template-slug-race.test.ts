import { expect } from "chai";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const HTTP_CONFLICT = 409;
const TABLE = "/api/mailing/tables/templates";
const TEMPLATES = "/api/mailing/templates";
/** Rounds of one race each: a lost race shows within a few on Linux. */
const ROUNDS = 50;
const RACERS = 5;
const RACE_TIMEOUT_MS = 60_000;

type Client = ReturnType<typeof authorizedClient>;

interface Outcome {
  round: number;
  statuses: number[];
  rows: number;
}

async function client(): Promise<Client> {
  const session = await ensureOwnerSession();
  return authorizedClient(session.accessToken);
}

async function models(tenantId?: string) {
  const { GetModel } =
    await import("@antelopejs/interface-database-decorators");
  const { DEFAULT_TENANT_ID } =
    await import("@antelopejs/interface-dms/constants");
  const { TemplateModel, TemplateSlugModel } = await import("../../db");
  const tenant = tenantId ?? DEFAULT_TENANT_ID;
  return {
    tenant,
    templates: GetModel(TemplateModel, tenant),
    claims: GetModel(TemplateSlugModel, tenant),
  };
}

async function templatesModel() {
  return (await models()).templates;
}

/** Removes the templates and claims a test left, so later suites list what they expect. */
async function removeSlugs(prefix: string, tenantId?: string): Promise<void> {
  const { templates, claims } = await models(tenantId);
  const rows = await templates.table.run();
  const ids = rows
    .filter((row) => row.slug.startsWith(prefix))
    .map((row) => row._id);
  await Promise.all(ids.map((id) => templates.delete(id)));
  const claimed = await claims.table.run();
  await Promise.all(
    claimed
      .filter((row) => row.slug.startsWith(prefix))
      .map((row) => claims.delete(row._id)),
  );
}

/** Runs the rounds one after the other, each a race of RACERS requests. */
async function race(
  prefix: string,
  request: (slug: string) => Promise<{ status: number }>,
): Promise<Outcome[]> {
  const templates = await templatesModel();
  const outcomes: Outcome[] = [];
  for (let round = 0; round < ROUNDS; round++) {
    const slug = `${prefix}-${round}`;
    const responses = await Promise.all(
      Array.from({ length: RACERS }, () => request(slug)),
    );
    const rows = (await templates.getBy("slug", slug)).length;
    outcomes.push({
      round,
      statuses: responses.map((response) => response.status),
      rows,
    });
  }
  return outcomes;
}

/** The rounds that did not end with one 200, conflicts for the rest and one row. */
function lostRounds(outcomes: Outcome[]): Outcome[] {
  return outcomes.filter(
    ({ statuses, rows }) =>
      statuses.filter((status) => status === HTTP_OK).length !== 1 ||
      statuses.filter((status) => status === HTTP_CONFLICT).length !==
        RACERS - 1 ||
      rows !== 1,
  );
}

describe("[integration] template slug races", function () {
  this.timeout(RACE_TIMEOUT_MS);
  const stamp = Date.now();

  it("creates one template per slug when creations race", async () => {
    const prefix = `slug-race-new-${stamp}`;
    const api = await client();
    try {
      const outcomes = await race(prefix, (slug) =>
        api.post(`${TABLE}/new`, { slug, name: slug, category: "orders" }),
      );
      expect(lostRounds(outcomes), "rounds that broke the slug").to.deep.equal(
        [],
      );
    } finally {
      await removeSlugs(prefix);
    }
  });

  it("creates one copy per slug when duplications race", async () => {
    const prefix = `slug-race-copy-${stamp}`;
    const api = await client();
    const source = await api.post(`${TABLE}/new`, {
      slug: `${prefix}-source`,
      name: "Source",
      category: "orders",
    });
    expect(source.status, JSON.stringify(source.data)).to.equal(HTTP_OK);
    const sourceId = source.data._id as string;
    try {
      const outcomes = await race(`${prefix}-copy`, (slug) =>
        api.post(`${TEMPLATES}/${sourceId}/duplicate`, { slug, name: slug }),
      );
      expect(lostRounds(outcomes), "rounds that broke the slug").to.deep.equal(
        [],
      );
    } finally {
      await removeSlugs(prefix);
    }
  });

  it("frees the slug of a deleted template for a new one", async () => {
    const slug = `slug-race-freed-${stamp}`;
    const api = await client();
    try {
      const created = await api.post(`${TABLE}/new`, { slug, name: slug });
      expect(created.status, JSON.stringify(created.data)).to.equal(HTTP_OK);
      const id = created.data._id as string;
      await api.post(`${TEMPLATES}/${id}/archive`, {});
      const deleted = await api.delete(`${TABLE}/delete?id=${id}`);
      expect(deleted.status, JSON.stringify(deleted.data)).to.equal(HTTP_OK);
      const { claims } = await models();
      expect(await claims.getBy("slug", slug)).to.deep.equal([]);

      const again = await api.post(`${TABLE}/new`, { slug, name: slug });
      expect(again.status, JSON.stringify(again.data)).to.equal(HTTP_OK);
      const [claim] = await claims.getBy("slug", slug);
      expect(claim?.templateId).to.equal(again.data._id);
    } finally {
      await removeSlugs(slug);
    }
  });

  it("takes over a claim whose template is gone", async () => {
    const slug = `slug-race-stale-${stamp}`;
    const api = await client();
    const { tenant, claims } = await models();
    const { templateSlugIdOf } = await import("../../db");
    try {
      await claims.insert({
        _id: templateSlugIdOf(tenant, slug),
        slug,
        templateId: "a-template-deleted-before-its-claim",
      });
      const created = await api.post(`${TABLE}/new`, { slug, name: slug });
      expect(created.status, JSON.stringify(created.data)).to.equal(HTTP_OK);
      const [claim] = await claims.getBy("slug", slug);
      expect(claim?.templateId).to.equal(created.data._id);
    } finally {
      await removeSlugs(slug);
    }
  });

  it("keeps slugs per tenant: another tenant's template does not take it", async () => {
    const slug = `slug-race-tenant-${stamp}`;
    const otherTenant = `slug-race-tenant-${stamp}`;
    const api = await client();
    const { assertSlugClaimed } = await import("../../services/templates");
    const other = await models(otherTenant);
    try {
      const [otherId] = await other.templates.insert({ slug, name: slug });
      await assertSlugClaimed(otherTenant, slug, otherId as string);

      const created = await api.post(`${TABLE}/new`, { slug, name: slug });
      expect(created.status, JSON.stringify(created.data)).to.equal(HTTP_OK);
      expect(await other.templates.get(otherId as string)).to.not.equal(
        undefined,
      );
    } finally {
      await removeSlugs(slug);
      await removeSlugs(slug, otherTenant);
    }
  });

  it("refuses a slug duplicated before claims existed, without failing", async () => {
    const slug = `slug-race-legacy-${stamp}`;
    const api = await client();
    const templates = await templatesModel();
    try {
      await templates.insert([
        { slug, name: slug },
        { slug, name: slug },
      ]);
      const created = await api.post(`${TABLE}/new`, { slug, name: slug });
      expect(created.status, JSON.stringify(created.data)).to.equal(
        HTTP_CONFLICT,
      );
      expect(await templates.getBy("slug", slug)).to.have.length(2);
    } finally {
      await removeSlugs(slug);
    }
  });
});
