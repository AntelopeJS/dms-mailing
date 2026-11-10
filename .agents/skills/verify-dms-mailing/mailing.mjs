import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * @typedef {import("../../../packages/dms-mailing/node_modules/@antelopejs/dms/bin/control/journey.mjs").JourneyContext} Ctx
 * @typedef {import("../../../packages/dms-mailing/node_modules/@antelopejs/dms/bin/control/tab.mjs").Tab} Tab
 * @typedef {{ status: number | null, body: unknown, error: string | null, folder?: string }} Answer
 * @typedef {{ folder: string, status: number | null, headers: Record<string, string>, bytes: Buffer, text: string, json: unknown }} Raw
 * @typedef {Record<string, unknown>} Row
 * @typedef {{ name: string, pass: boolean, detail: string }} Check
 */

/** The module's HTTP API, which the dashboard calls. */
export const MAILING = "/api/mailing";

/** The verification playground's trusted backend calls (`playground/src/fixture.ts`). */
export const FIXTURE = "/verify-mailing";

/** The tenant of a single-tenant DMS. */
export const TENANT = "default";

/**
 * @param {unknown} value Anything a JSON answer holds
 * @returns {value is Row} Whether it is an object
 */
export function isRow(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} value Anything a JSON answer holds
 * @returns {value is string} Whether it is a string
 */
export function isText(value) {
  return typeof value === "string";
}

/**
 * Reads a nested field of a JSON answer.
 *
 * @param {unknown} value The answer
 * @param {...string} path The field names, outermost first
 * @returns {unknown} The field, or undefined when a step is missing
 */
export function pick(value, ...path) {
  let current = value;
  for (const step of path) {
    if (!isRow(current)) return undefined;
    current = current[step];
  }
  return current;
}

/**
 * @param {unknown} value The answer
 * @param {...string} path The field names
 * @returns {string} The field when it is a string, else the empty string
 */
export function text(value, ...path) {
  const found = pick(value, ...path);
  return isText(found) ? found : "";
}

/**
 * The objects of an array field of a JSON answer.
 *
 * @param {unknown} value The answer
 * @param {...string} path The field names, outermost first
 * @returns {Row[]} The array's objects, empty when the field is not an array
 */
export function list(value, ...path) {
  const found = path.length === 0 ? value : pick(value, ...path);
  return Array.isArray(found) ? found.filter(isRow) : [];
}

/**
 * @param {unknown} value Anything a JSON answer holds
 * @returns {Row} The value when it is an object, else an empty object
 */
export function asRow(value) {
  return isRow(value) ? value : {};
}

/**
 * The strings of an array field of a JSON answer.
 *
 * @param {unknown} value The answer
 * @param {...string} path The field names, outermost first
 * @returns {string[]} The array's strings, empty when the field is not an array
 */
export function texts(value, ...path) {
  const found = pick(value, ...path);
  return Array.isArray(found) ? found.filter(isText) : [];
}

/**
 * @param {unknown} value The answer
 * @param {...string} path The field names
 * @returns {string[]} The `name` of each object of the array field
 */
export function names(value, ...path) {
  return list(value, ...path).map((row) => text(row, "name"));
}

/**
 * A check, in the shape `ctx.record` takes.
 *
 * @param {string} name What is checked
 * @param {unknown} pass Whether it holds
 * @param {unknown} detail What was observed
 * @returns {Check} The check
 */
export function check(name, pass, detail) {
  return { name, pass: pass === true, detail: isText(detail) ? detail : (JSON.stringify(detail) ?? "undefined") };
}

/**
 * @param {Ctx} ctx The journey
 * @param {string} label What the call does
 * @param {string} method The HTTP method
 * @param {string} path The path under the mailing API
 * @param {{ body?: unknown, as?: string }} [options] The JSON body, and the account (`admin` by default, `anon` for nobody)
 * @returns {Promise<Answer>} The answer
 */
export function mailing(ctx, label, method, path, options = {}) {
  return ctx.api(label, { method, path: `${MAILING}${path}`, body: options.body, as: options.as });
}

/**
 * Calls one function of `@antelopejs/interface-dms-mailing` through the verification playground's trusted backend.
 * `{ "$date": "<ISO string>" }` in an argument becomes a `Date`.
 *
 * @param {Ctx} ctx The journey
 * @param {string} label What the call does
 * @param {"send" | "record" | "template" | "category" | "sender" | "import"} fn The function: SendTemplate, RecordEmailEvent, DeclareTemplate, DeclareTemplateCategory, DeclareSender or ImportSends
 * @param {unknown[]} args The arguments, as the interface takes them
 * @returns {Promise<{ answer: Answer, ok: boolean, result: unknown, error: Row | null }>} What the function resolved with, or how it rejected (`name`, `message`, `code`, `field`)
 */
export async function calling(ctx, label, fn, args) {
  const answer = await ctx.api(label, { method: "POST", path: `${FIXTURE}/call`, body: { fn, args }, as: "anon" });
  const ok = pick(answer.body, "ok") === true;
  const error = pick(answer.body, "error");
  return { answer, ok, result: pick(answer.body, "result"), error: isRow(error) ? error : null };
}

/**
 * @param {string} body A response body
 * @returns {unknown} Its JSON value, or undefined when it is not JSON
 */
export function parseJson(body) {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

/**
 * The session token of an account, after one authenticated call signed it in.
 *
 * @param {Ctx} ctx The journey
 * @param {string} account The account
 * @returns {Promise<string | undefined>} The token
 */
export async function tokenOf(ctx, account) {
  if (!ctx.state.tokens?.[account]) await ctx.api(`sign ${account} in`, { method: "GET", path: `${MAILING}/settings`, as: account });
  return ctx.state.tokens?.[account];
}

/**
 * A request to any URL with its response headers and bytes kept in the evidence, redirects not followed.
 *
 * @param {Ctx} ctx The journey
 * @param {string} label What the request does
 * @param {{ url?: string, path?: string, origin?: "api" | "web", method?: string, headers?: Record<string, string>, as?: string, body?: Buffer }} request What to send; `as` adds the account's session token
 * @returns {Promise<Raw>} The answer
 */
export async function raw(ctx, label, request) {
  const folder = ctx.step(label);
  const origin = request.origin === "web" ? ctx.state.webUrl : ctx.state.apiUrl;
  const url = request.url ?? `${origin}${request.path ?? "/"}`;
  const method = request.method ?? "GET";
  /** @type {Record<string, string>} */
  const headers = { ...request.headers };
  if (request.as) headers.authorization = `Bearer ${(await tokenOf(ctx, request.as)) ?? ""}`;
  const shown = Object.fromEntries(Object.entries(headers).map(([name, value]) => [name, /auth|cookie/i.test(name) ? "<session>" : value]));
  writeFileSync(join(folder, "request.json"), `${JSON.stringify({ method, url, headers: shown, bodyBytes: request.body?.byteLength ?? 0 }, null, 2)}\n`);
  const response = await fetch(url, { method, headers, redirect: "manual", body: request.body });
  const bytes = Buffer.from(await response.arrayBuffer());
  /** @type {Record<string, string>} */
  const received = {};
  for (const [name, value] of response.headers) received[name] = value;
  const body = bytes.toString("utf8");
  writeFileSync(join(folder, "response.json"), `${JSON.stringify({ status: response.status, headers: received, bytes: bytes.byteLength, sha256: sha256(bytes), body: body.slice(0, 4000) }, null, 2)}\n`);
  return { folder, status: response.status, headers: received, bytes, text: body, json: parseJson(body) };
}

/**
 * Records checks against the evidence folder `raw` made.
 *
 * @param {Ctx} ctx The journey
 * @param {Raw} answer The answer
 * @param {Check[]} checks The checks
 * @returns {boolean} Whether they all passed
 */
export function recordRaw(ctx, answer, checks) {
  return ctx.record(answer.folder, checks);
}

/**
 * @param {Uint8Array} bytes Some bytes
 * @returns {string} Their SHA-256, hex
 */
export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}


/**
 * Restarts the backend with `VERIFY_MAILING_*` variables set (see `playground/antelope.config.ts`), runs `body`, then
 * restarts it with the variables it had, so later journeys get the module's defaults back.
 *
 * @param {Ctx} ctx The journey
 * @param {Record<string, string>} env The variables
 * @param {() => Promise<void>} body What to do under that configuration
 * @returns {Promise<void>}
 */
export async function withConfig(ctx, env, body) {
  const previous = { ...ctx.state.extraEnv };
  ctx.state.extraEnv = { ...previous, ...env };
  try {
    await ctx.restartBackend();
    await body();
  } finally {
    ctx.state.extraEnv = previous;
    await ctx.restartBackend();
  }
}

/**
 * Creates a member with a role that holds `permissions` and signs it up, so tabs and API calls can act as it.
 *
 * @param {Ctx} ctx The journey
 * @param {string} name The account name
 * @param {string[]} permissions The permission ids of the role (`mailing.send` and the ids of pages)
 * @param {string} [language] The member's language, `en` by default
 * @returns {Promise<{ roleId: string, userId: string, email: string }>} The role, the user and the address
 */
export async function member(ctx, name, permissions, language = "en") {
  const invite = await fixture(ctx, `invite ${name}`, "POST", "/member", { name, permissions, language });
  const email = text(invite.body, "email");
  const password = ctx.password();
  const signup = await ctx.api(`${name} signs up`, {
    method: "POST",
    path: "/api/auth/signup",
    body: { name, email, password, lang: language, token: text(invite.body, "token") },
    as: "anon",
  });
  const userId = text(signup.body, "user", "_id");
  ctx.addAccount(name, { email, password, userId });
  await ctx.verify(`${name} is a member`, [check("the signup answers a session", signup.status === 200 && userId !== "", signup.status)], { critical: true });
  return { roleId: text(invite.body, "roleId"), userId, email };
}

/**
 * Calls the verification playground's trusted backend over plain HTTP (the member endpoint).
 *
 * @param {Ctx} ctx The journey
 * @param {string} label What the call does
 * @param {string} method The HTTP method
 * @param {string} path The path under the fixture
 * @param {unknown} [body] The JSON body
 * @returns {Promise<Answer>} The answer
 */
export function fixture(ctx, label, method, path, body) {
  return ctx.api(label, { method, path: `${FIXTURE}${path}`, body, as: "anon" });
}
