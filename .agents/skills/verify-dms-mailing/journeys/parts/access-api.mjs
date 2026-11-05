import { check, mailing, member, pick, raw } from "../../mailing.mjs";
import { declareLive, postEvent, secretOf } from "./api-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

const SETTINGS = "modules.mailing.configure.settings";
const SUPPRESSIONS = "modules.mailing.configure.suppressions";
const TEMPLATES = "modules.mailing.main.templates";
const SENDS = "modules.mailing.main.sends";

/** Every route of the mailing API with the permission its guard names. */
const ROUTES = [
  ["GET", "/settings", SETTINGS], ["PUT", "/settings", SETTINGS], ["POST", "/settings/webhook-secret/rotate", SETTINGS], ["GET", "/settings/webhook-status", SETTINGS],
  ["POST", "/settings/webhook-test", SETTINGS], ["GET", "/settings/retention-preview", SETTINGS], ["GET", "/settings/category-usage", SETTINGS],
  ["GET", "/tables/suppressions/list?limit=1", `${SUPPRESSIONS}.table.list`], ["POST", "/suppressions", SUPPRESSIONS], ["DELETE", "/suppressions/x", SUPPRESSIONS],
  ["GET", "/tables/templates/list?limit=1", `${TEMPLATES}.table.list`], ["GET", "/templates/overview", TEMPLATES], ["GET", "/templates/starters", TEMPLATES], ["GET", "/templates/categories", TEMPLATES],
  ["GET", "/tables/sends/list?limit=1", `${SENDS}.table.list`], ["GET", "/sends/stats", SENDS], ["POST", "/templates/x/send", SENDS], ["POST", "/templates/x/test-send", SENDS],
  ["POST", "/sends/x/replay", SENDS], ["POST", "/sends/replay-failed", SENDS],
];

/** The permission ids a role editor could grant for the module. */
const EVERYTHING = ["mailing.send", SETTINGS, SUPPRESSIONS, `${SUPPRESSIONS}.table.list`, TEMPLATES, `${TEMPLATES}.table.list`, SENDS, `${SENDS}.table.list`];

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} */
export const accessJourneys = [
  {
    id: "every-mailing-route-answers-401-without-a-session-and-403-to-a-member",
    title: "every route of the mailing API answers 401 without a session and 403 `Forbidden: missing permission <page>` to a member even when its role grants every mailing permission (mailing.send and the page grants), while the owner is let in; the mailing.send gate is never reached by a member",
    entryPoint: "every /api/mailing route",
    async run(ctx) {
      await declareLive(ctx, "access-order", { variables: [] });
      await member(ctx, "everything", EVERYTHING);
      const failures = [];
      for (const [method, path, permission] of ROUTES) {
        const anonymous = await mailing(ctx, `${method} ${path} as nobody`, method, path, { as: "anon", body: method === "GET" ? undefined : {} });
        const asMember = await mailing(ctx, `${method} ${path} as a member`, method, path, { as: "everything", body: method === "GET" ? undefined : {} });
        const ok = anonymous.status === 401 && asMember.status === 403 && asMember.body === `Forbidden: missing permission ${permission}`;
        if (!ok) failures.push(`${method} ${path}: ${anonymous.status} / ${asMember.status} ${JSON.stringify(asMember.body)}`);
      }
      await ctx.verify(`all ${ROUTES.length} routes: 401 for nobody, 403 naming the permission for a member`, [check("no route deviates", failures.length === 0, failures)]);
      const reads = ROUTES.filter(([method]) => method === "GET");
      const owner = [];
      for (const [, path] of reads) {
        const answer = await mailing(ctx, `GET ${path} as the owner`, "GET", path);
        if (answer.status !== 200) owner.push(`${path}: ${answer.status}`);
      }
      await ctx.verify("the owner reads every GET route", [check("all 200", owner.length === 0, owner)]);
      const wild = await member(ctx, "wildcard", ["*"]);
      const via = await mailing(ctx, "a member holding every permission reads the settings", "GET", "/settings", { as: "wildcard" });
      await ctx.verify("the refusal comes from the permission, not from the account", [check("a role granting everything passes the guard", via.status === 200 && wild.userId !== "", via.status)]);
    },
  },
  {
    id: "the-webhook-is-the-one-route-that-needs-no-session",
    title: "the provider webhook answers without a session (the secret is its only gate: 403 webhook_refused, never 401), a member's session does not replace the secret, and the secret opens it",
    entryPoint: "POST /api/mailing/events/:provider/:tenantId",
    async run(ctx) {
      const template = await declareLive(ctx, "public-hook-order", { variables: [] });
      const secret = await secretOf(ctx);
      const refused = await postEvent(ctx, "no session, no secret", { body: { messageId: "x", type: "opened" } });
      await member(ctx, "bystander", ["*"]);
      const withSession = await raw(ctx, "a member's session without the secret", { path: "/api/mailing/events/postmark/default", method: "POST", as: "bystander", headers: { "content-type": "application/json" }, body: Buffer.from(JSON.stringify({ messageId: "x", type: "opened" })) });
      const ok = await postEvent(ctx, "no session, the secret", { secret, body: { messageId: "x", type: "opened" } });
      await ctx.verify("the secret alone gates the webhook", [
        check("no session and no secret: 403 missing_secret, not 401", refused.status === 403 && pick(refused.json, "reason") === "missing_secret", refused.text),
        check("a session without the secret: still 403 missing_secret", withSession.status === 403 && pick(withSession.json, "reason") === "missing_secret", withSession.text),
        check("the secret without a session: 200", ok.status === 200 && pick(ok.json, "recorded") === false, ok.text),
        check("the template was only a prerequisite", template.slug === "public-hook-order", template),
      ]);
    },
  },
];
