import { readFileSync } from "node:fs";
import { MAILING, TENANT, calling, check, isRow, isText, list, mailing, pick, raw, text } from "../../mailing.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */
/** @typedef {import("../../mailing.mjs").Row} Row */
/** @typedef {Awaited<ReturnType<Ctx["mail"]>>["messages"][number]} Mail */

/** The header a provider (or its relay) carries the workspace's secret in. */
export const SECRET_HEADER = "x-mailing-webhook-secret";

/**
 * A heading block, the smallest valid piece of content.
 *
 * @param {string} id The block id
 * @param {string} body The text, tokens allowed
 * @returns {Row} The block
 */
export function paragraph(id, body) {
  return { id, type: "paragraph", text: body, align: "left", visibleIf: null };
}

/**
 * Declares a published template through `DeclareTemplate` and checks it was created.
 *
 * @param {Ctx} ctx The journey
 * @param {string} slug The slug
 * @param {{ locales?: Record<string, { subject: string, blocks: Row[] }>, variables?: Row[], category?: string, name?: Record<string, string>, testData?: Row }} [options] What differs from a one-paragraph template
 * @returns {Promise<{ id: string, slug: string }>} The template
 */
export async function declareLive(ctx, slug, options = {}) {
  const locales = options.locales ?? { en: { subject: `Subject ${slug}`, blocks: [paragraph("p", "Hello {{customer.name}}")] } };
  const declared = await calling(ctx, `declare ${slug}`, "template", [
    {
      tenantId: TENANT,
      slug,
      name: options.name ?? { en: slug },
      category: options.category ?? "orders",
      content: { locales: Object.fromEntries(Object.entries(locales).map(([locale, entry]) => [locale, { preheader: "", ...entry }])) },
      variables: options.variables ?? [{ path: "customer.name", type: "string", required: false }],
      testData: options.testData ?? {},
    },
  ]);
  await ctx.verify(`${slug} is declared and published`, [
    check("created as version 1", declared.ok && pick(declared.result, "outcome") === "created" && pick(declared.result, "version") === 1, declared.result ?? declared.error),
  ], { critical: true });
  return { id: text(declared.result, "templateId"), slug };
}

/**
 * `SendTemplate` through the fixture, for the default tenant.
 *
 * @param {Ctx} ctx The journey
 * @param {string} label What the call does
 * @param {string} slug The template
 * @param {Row} params The send parameters without the tenant
 * @returns {Promise<{ ok: boolean, result: unknown, error: Row | null, results: Row[] }>} The outcome, with one result per recipient
 */
export async function sendCode(ctx, label, slug, params) {
  const sent = await calling(ctx, label, "send", [slug, { tenantId: TENANT, ...params }]);
  return { ok: sent.ok, result: sent.result, error: sent.error, results: list(sent.result, "results") };
}

/**
 * Imports past sends through `ImportSends`; the fastest way to get sends with chosen message ids, dates and events.
 *
 * @param {Ctx} ctx The journey
 * @param {string} label What the call does
 * @param {Row[]} sends The imported sends
 * @returns {Promise<{ ok: boolean, result: unknown, error: Row | null, ids: string[] }>} The outcome and the send ids
 */
export async function importSends(ctx, label, sends) {
  const done = await calling(ctx, label, "import", [{ tenantId: TENANT, sends }]);
  return { ok: done.ok, result: done.result, error: done.error, ids: stringsOf(pick(done.result, "sendIds")) };
}

/**
 * @param {unknown} value A JSON array
 * @returns {string[]} Its strings
 */
export function stringsOf(value) {
  return Array.isArray(value) ? value.filter(isText) : [];
}

/**
 * The workspace's webhook secret, read through the settings.
 *
 * @param {Ctx} ctx The journey
 * @returns {Promise<string>} The secret
 */
export async function secretOf(ctx) {
  const settings = await mailing(ctx, "read the settings", "GET", "/settings");
  return text(settings.body, "webhookSecret");
}

/**
 * Posts an event to the webhook as a provider would.
 *
 * @param {Ctx} ctx The journey
 * @param {string} label What the call does
 * @param {{ provider?: string, tenant?: string, secret?: string | null, body?: unknown, rawBody?: string }} request The event, the secret (null for none)
 * @returns {Promise<import("../../mailing.mjs").Raw>} The answer
 */
export function postEvent(ctx, label, request) {
  const headers = { "content-type": "application/json" };
  if (request.secret) headers[SECRET_HEADER] = request.secret;
  const body = request.rawBody ?? JSON.stringify(request.body);
  return raw(ctx, label, {
    path: `${MAILING}/events/${request.provider ?? "postmark"}/${request.tenant ?? TENANT}`,
    method: "POST",
    headers,
    body: Buffer.from(body),
  });
}

/**
 * The send, its events and its suppression entry.
 *
 * @param {Ctx} ctx The journey
 * @param {string} id The send id
 * @returns {Promise<{ send: Row | undefined, events: Row[], suppression: unknown }>} The detail
 */
export async function sendDetail(ctx, id) {
  const detail = await mailing(ctx, `read send ${id.slice(0, 8)}`, "GET", `/sends/${id}`);
  const send = pick(detail.body, "send");
  return { send: isRow(send) ? send : undefined, events: list(detail.body, "events"), suppression: pick(detail.body, "suppression") };
}

/**
 * The rows of the suppression list, newest first.
 *
 * @param {Ctx} ctx The journey
 * @param {string} [as] The account
 * @returns {Promise<Row[]>} The entries
 */
export async function suppressionRows(ctx, as) {
  const rows = await mailing(ctx, "list the suppression list", "GET", "/tables/suppressions/list?limit=200", { as });
  return list(rows.body, "results");
}

/**
 * @param {Row[]} rows Suppression rows
 * @param {string} email The address
 * @returns {Row | undefined} Its entry
 */
export function entryOf(rows, email) {
  return rows.find((row) => text(row, "email") === email);
}

/**
 * Waits for the mail sink to hold the message sent last, so that every message sent before it has arrived too.
 *
 * @param {Ctx} ctx The journey
 * @param {string} address The recipient of a message that was sent last
 * @returns {Promise<{ messages: Mail[] }>} Every message since the journey started
 */
export async function settledMail(ctx, address) {
  const arrived = await ctx.mail((message) => message.to.some((to) => to.includes(address)));
  return { messages: arrived.messages };
}

/**
 * @param {string} body A quoted-printable body
 * @returns {string} The decoded UTF-8 text
 */
export function decodeQuotedPrintable(body) {
  const joined = body.replace(/=\r?\n/g, "");
  const bytes = [];
  for (let index = 0; index < joined.length; index += 1) {
    const hex = joined.slice(index + 1, index + 3);
    if (joined[index] === "=" && /^[0-9A-F]{2}$/i.test(hex)) {
      bytes.push(Number.parseInt(hex, 16));
      index += 2;
    } else {
      bytes.push(...Buffer.from(joined[index] ?? ""));
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

/**
 * The parts of a captured message, read from its raw file.
 *
 * @param {{ file: string }} message A message of the mail sink
 * @returns {{ head: string, contentType: string, parts: { type: string, text: string }[] }} The header block, the top content type and each part decoded
 */
export function partsOf(message) {
  const source = readFileSync(message.file, "utf8");
  const [head, ...rest] = source.split(/\r?\n\r?\n/);
  const flat = (head ?? "").replace(/\r?\n[ \t]+/g, " ");
  const boundary = /boundary="?([^";\s]+)"?/i.exec(flat)?.[1];
  const contentType = /^Content-Type:\s*([^;\r\n]+)/im.exec(flat)?.[1]?.trim() ?? "";
  if (!boundary) return { head: flat, contentType, parts: [{ type: contentType, text: decodeQuotedPrintable(rest.join("\n\n")) }] };
  const chunks = source.split(`--${boundary}`).slice(1).filter((chunk) => !chunk.startsWith("--"));
  const parts = chunks.map((chunk) => {
    const [partHead = "", ...body] = chunk.replace(/^\r?\n/, "").split(/\r?\n\r?\n/);
    const type = /^Content-Type:\s*([^;\r\n]+)/im.exec(partHead)?.[1]?.trim() ?? "";
    const encoded = /^Content-Transfer-Encoding:\s*quoted-printable/im.test(partHead);
    const text = body.join("\n\n").replace(/\r?\n$/, "");
    return { type, text: encoded ? decodeQuotedPrintable(text) : text };
  });
  return { head: flat, contentType, parts };
}

/**
 * @param {string} value A header value with RFC 2047 encoded words (UTF-8, Q or B)
 * @returns {string} The decoded text
 */
export function decodeMimeWords(value) {
  return value
    .replace(/\?=\s+=\?UTF-8\?[QB]\?/gi, "?==?UTF-8?Q?")
    .replace(/=\?UTF-8\?([QB])\?(.*?)\?=/gi, (/** @type {string} */ _, /** @type {string} */ kind, /** @type {string} */ body) => (kind.toUpperCase() === "B" ? Buffer.from(body, "base64").toString("utf8") : decodeQuotedPrintable(body.replace(/_/g, " "))));
}

/**
 * @param {string} head The unfolded header block of a message
 * @returns {string} Its decoded subject
 */
export function subjectOfHead(head) {
  return decodeMimeWords(/^Subject:\s*(.*)$/im.exec(head)?.[1] ?? "");
}
