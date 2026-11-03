import { z } from "zod";
import {
  DeclareSender,
  DeclareTemplate,
  DeclareTemplateCategory,
  ImportSends,
  RecordEmailEvent,
  SendTemplate,
} from "@antelopejs/interface-dms-mailing";

const ERROR_EXTRAS = z.object({ code: z.unknown(), field: z.unknown(), details: z.unknown() }).partial();

const FUNCTIONS = new Map([
  ["send", SendTemplate],
  ["record", RecordEmailEvent],
  ["template", DeclareTemplate],
  ["category", DeclareTemplateCategory],
  ["sender", DeclareSender],
  ["import", ImportSends],
]);

/**
 * Turns the tagged values a journey sends over JSON into the values the
 * interface takes: `{ "$date": "<ISO string>" }` becomes a `Date`.
 *
 * @param {unknown} value A value from a journey's JSON
 * @returns {unknown} The value with its dates revived
 */
function revive(value) {
  if (Array.isArray(value)) return value.map(revive);
  if (!(value instanceof Object)) return value;
  const entries = Object.entries(value);
  const [first] = entries;
  if (entries.length === 1 && first[0] === "$date") return new Date(String(first[1]));
  return Object.fromEntries(entries.map(([key, entry]) => [key, revive(entry)]));
}

/**
 * Calls one function of `@antelopejs/interface-dms-mailing` with the arguments as a journey wrote them,
 * unchecked, so a journey can pass what a careless caller passes.
 *
 * @param {string} name The function: send, record, template, category, sender or import
 * @param {unknown[]} args The arguments
 * @returns {Promise<{ ok: boolean, result?: object | string | number | boolean | null, error?: object }>} What it resolved with, or how it rejected
 */
export async function call(name, args) {
  const target = FUNCTIONS.get(name);
  if (!target) return { ok: false, error: { name: "UnknownFunction", message: `no interface function ${name}` } };
  try {
    const result = await target(...args.map(revive));
    return { ok: true, result: result ?? null };
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    const extra = ERROR_EXTRAS.parse(failure);
    return { ok: false, error: { name: failure.name, message: failure.message, ...extra } };
  }
}

/**
 * Runs the steps in order for one tenant.
 *
 * @param {{ fn: string, args: unknown[] }[]} steps The calls
 * @returns {Promise<void>}
 */
export async function provision(steps) {
  for (const step of steps) await call(step.fn, step.args);
}
