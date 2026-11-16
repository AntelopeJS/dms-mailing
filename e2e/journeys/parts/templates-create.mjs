import { check, mailing, pick, text } from "../../mailing.mjs";
import { created, refused, save, table } from "./templates-kit.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

export const journeys = [
  {
    id: "a-slug-is-unique-trimmed-and-bounded",
    title: "a slug is trimmed, unique per workspace, lower-case, at most 64 characters, and never changes",
    entryPoint: "POST /api/mailing/tables/templates/new, PUT /api/mailing/templates/:id/details",
    async run(/** @type {Ctx} */ ctx) {
      const first = await created(ctx, { slug: "  trim-me ", name: "  Trimmed  " });
      const row = await table(ctx, "read it", "GET", `/get?id=${first.id}`);
      await ctx.verify("the slug and the name are stored trimmed", [
        check("created", first.answer.status === 200 && first.id !== "", first.answer.body),
        check("slug trim-me", text(row.body, "slug") === "trim-me", row.body),
        check("name Trimmed", text(row.body, "name") === "Trimmed", row.body),
      ], { critical: true });
      const again = await created(ctx, { slug: "trim-me", name: "Again" });
      const copy = await mailing(ctx, "duplicate on the taken slug", "POST", `/templates/${first.id}/duplicate`, { body: { slug: "trim-me", name: "Copy" } });
      await ctx.verify("a taken slug is refused with 409 duplicate_slug on create and on duplicate", [
        refused(again.answer, 409, "duplicate_slug"),
        refused(copy, 409, "duplicate_slug"),
      ]);
      const upper = await created(ctx, { slug: "UPPER", name: "Upper" });
      const lead = await created(ctx, { slug: "-lead", name: "Lead" });
      const space = await created(ctx, { slug: "has space", name: "Space" });
      const max = await created(ctx, { slug: `a${"b".repeat(63)}`, name: "Max" });
      const over = await created(ctx, { slug: `a${"b".repeat(64)}`, name: "Over" });
      await ctx.verify("slug rules", [
        refused(upper.answer, 400, "invalid_template"),
        refused(lead.answer, 400, "invalid_template"),
        refused(space.answer, 400, "invalid_template"),
        check("64 characters are accepted", max.answer.status === 200, max.answer.body),
        refused(over.answer, 400, "invalid_template"),
      ]);
      const moved = await mailing(ctx, "change the slug", "PUT", `/templates/${first.id}/details`, { body: { slug: "other-slug", name: "Trimmed", category: null } });
      const kept = await mailing(ctx, "edit without the slug", "PUT", `/templates/${first.id}/details`, { body: { name: "Renamed" } });
      const after = await table(ctx, "read it again", "GET", `/get?id=${first.id}`);
      await ctx.verify("the slug is immutable", [
        refused(moved, 409, "slug_immutable"),
        check("an edit without the slug keeps it", kept.status === 200 && text(after.body, "slug") === "trim-me" && text(after.body, "name") === "Renamed", after.body),
      ]);
    },
  },
  {
    id: "names-categories-and-sources-are-checked",
    title: "a name is 1 to 120 characters, a category must be declared, a source template must exist, and null clears the category",
    entryPoint: "POST /api/mailing/tables/templates/new, PUT /api/mailing/templates/:id/details",
    async run(/** @type {Ctx} */ ctx) {
      const max = await created(ctx, { slug: "name-max", name: "n".repeat(120), category: "orders" });
      const over = await created(ctx, { slug: "name-over", name: "n".repeat(121) });
      const none = await created(ctx, { slug: "name-none" });
      const blank = await created(ctx, { slug: "name-blank", name: "   " });
      const category = await created(ctx, { slug: "cat-unknown", name: "Cat", category: "nope" });
      const source = await created(ctx, { slug: "src-missing", name: "Src", sourceTemplateId: "does-not-exist" });
      await ctx.verify("create guards", [
        check("120 characters are accepted", max.answer.status === 200, max.answer.body),
        refused(over.answer, 400, "invalid_template"),
        check("a missing name is a 400", none.answer.status === 400, none.answer.body),
        check("a blank name is a 400", blank.answer.status === 400, blank.answer.body),
        refused(category.answer, 422, "unknown_category"),
        refused(source.answer, 404, "template_not_found"),
      ]);
      const unknown = await mailing(ctx, "edit to an unknown category", "PUT", `/templates/${max.id}/details`, { body: { name: "n", category: "nope" } });
      const emptied = await mailing(ctx, "edit to a blank name", "PUT", `/templates/${max.id}/details`, { body: { name: "   ", category: "orders" } });
      const cleared = await mailing(ctx, "clear the category", "PUT", `/templates/${max.id}/details`, { body: { name: "Cleared", category: null } });
      const row = await table(ctx, "read it", "GET", `/get?id=${max.id}`);
      await ctx.verify("edit guards and clearing", [
        refused(unknown, 422, "unknown_category"),
        check("a blank name is refused", emptied.status >= 400, emptied.body),
        check("null clears the category", cleared.status === 200 && !text(row.body, "category") && text(row.body, "name") === "Cleared", row.body),
      ]);
    },
  },
  {
    id: "a-copy-keeps-every-locale-variable-and-test-datum",
    title: "creating from a template and duplicating copy every locale, the variables and the test data into a new draft",
    entryPoint: "POST /api/mailing/tables/templates/new with sourceTemplateId, POST /api/mailing/templates/:id/duplicate",
    async run(/** @type {Ctx} */ ctx) {
      const source = await created(ctx, { slug: "copy-source", name: "Copy source", category: "billing" });
      const body = {
        content: { locales: { en: { subject: "Hello {{customer.firstName}}", preheader: "", blocks: [] }, fr: { subject: "Bonjour {{customer.firstName}}", preheader: "", blocks: [] } } },
        variables: [{ path: "customer.firstName", type: "string", required: true }],
      };
      await save(ctx, source.id, body);
      await mailing(ctx, "set the test data", "POST", `/templates/${source.id}/test-data`, { body: { data: { customer: { firstName: "Sofie" } } } });
      await mailing(ctx, "publish the source", "POST", `/templates/${source.id}/publish`, { body: {} });
      const fromSource = await created(ctx, { slug: "copy-target", name: "Copy target", sourceTemplateId: source.id });
      const duplicated = await mailing(ctx, "duplicate", "POST", `/templates/${source.id}/duplicate`, { body: { slug: "copy-dup", name: "Copy dup" } });
      const dupId = text(duplicated.body, "id");
      const reads = [];
      for (const id of [fromSource.id, dupId]) reads.push(await mailing(ctx, "read the copy", "GET", `/templates/${id}/content`));
      const rows = [await table(ctx, "row of the copy", "GET", `/get?id=${fromSource.id}`), await table(ctx, "row of the duplicate", "GET", `/get?id=${dupId}`)];
      await ctx.verify("both copies are drafts with the locales, the variables and the test data", [
        ...reads.flatMap((read, index) => [
          check(`copy ${index}: English subject`, pick(read.body, "content", "locales", "en", "subject") === "Hello {{customer.firstName}}", read.body),
          check(`copy ${index}: French subject`, pick(read.body, "content", "locales", "fr", "subject") === "Bonjour {{customer.firstName}}", read.body),
          check(`copy ${index}: variables`, JSON.stringify(pick(read.body, "variables")) === JSON.stringify(body.variables), pick(read.body, "variables")),
          check(`copy ${index}: test data`, JSON.stringify(pick(read.body, "testData")) === JSON.stringify({ customer: { firstName: "Sofie" } }), read.body),
        ]),
        ...rows.map((row, index) => check(`copy ${index} is a draft in the same category`, text(row.body, "status") === "draft" && (index === 1 ? text(row.body, "category") === "billing" : true), row.body)),
      ]);
    },
  },
];

