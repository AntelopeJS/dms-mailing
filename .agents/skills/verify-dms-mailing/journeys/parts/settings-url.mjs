import { check, mailing, pick, withConfig } from "../../mailing.mjs";

/** @typedef {import("../../mailing.mjs").Ctx} Ctx */

const EVENTS = "/api/mailing/events";
const SERVER_NAME = "~Acme  Mail (EU)_v2!";
const DASHBOARD = "https://dashboard.verify.example";
const API = "https://api.verify.example/";

/**
 * Reads the settings under a configuration and names what they state.
 *
 * @param {Ctx} ctx The journey
 * @param {string} label What the configuration is
 * @param {Record<string, string>} env The playground switches
 * @returns {Promise<{ provider: unknown, url: unknown }>} The provider row and the webhook URL
 */
async function settingsUnder(ctx, label, env) {
  /** @type {{ provider: unknown, url: unknown }} */
  const seen = { provider: undefined, url: undefined };
  await withConfig(ctx, env, async () => {
    const settings = await mailing(ctx, `read the settings with ${label}`, "GET", "/settings");
    seen.provider = pick(settings.body, "provider");
    seen.url = pick(settings.body, "webhookUrl");
  });
  return seen;
}

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} */
export const urlJourneys = [
  {
    id: "the-webhook-url-names-the-provider-in-lower-case-with-hyphens",
    title: "The webhook URL carries the provider name in lower case with each run of other characters turned into one hyphen (digits kept), and `provider` when the provider has no name or cannot be asked",
    entryPoint: "GET /api/mailing/settings",
    async run(ctx) {
      const base = `${ctx.state.webUrl}${EVENTS}`;
      const named = await settingsUnder(ctx, `the provider "${SERVER_NAME}"`, { VERIFY_MAILING_PROVIDER: "fake", VERIFY_MAILING_PROVIDER_NAME: SERVER_NAME });
      await ctx.verify("a name with capitals, runs of spaces and symbols, an underscore and a digit", [
        check("the provider row states the name as the provider reports it", named.provider === SERVER_NAME, named.provider),
        check("the URL names it -acme-mail-eu-v2- (lower case, one hyphen per run of other characters, digits kept, edges not trimmed)", named.url === `${base}/-acme-mail-eu-v2-/default`, named.url),
      ]);
      const empty = await settingsUnder(ctx, "a provider whose name is empty", { VERIFY_MAILING_PROVIDER: "fake", VERIFY_MAILING_PROVIDER_NAME: "" });
      await ctx.verify("a provider with an empty name", [
        check("the provider row is empty", empty.provider === "", empty.provider),
        check("the URL names the provider `provider`", empty.url === `${base}/provider/default`, empty.url),
      ]);
      const unreachable = await settingsUnder(ctx, "a provider that cannot be asked", { VERIFY_MAILING_PROVIDER: "fake" });
      await ctx.verify("a provider that reports no capabilities", [
        check("the provider row is empty", unreachable.provider === "", unreachable.provider),
        check("the URL names the provider `provider`", unreachable.url === `${base}/provider/default`, unreachable.url),
      ]);
    },
  },
  {
    id: "the-webhook-url-origin-falls-back-from-the-dashboard-to-the-api-to-the-server",
    title: "The webhook URL starts with the dashboard origin (clientBaseUrl); without it, the API origin (apiBaseUrl) with its trailing slash dropped; without that, the origin the server was reached on",
    entryPoint: "GET /api/mailing/settings",
    async run(ctx) {
      const path = `${EVENTS}/nodemailer/default`;
      const both = await settingsUnder(ctx, "both base URLs set", { VERIFY_MAILING_CLIENT_BASE_URL: DASHBOARD, VERIFY_MAILING_API_BASE_URL: API });
      const apiOnly = await settingsUnder(ctx, "only the API base URL set", { VERIFY_MAILING_CLIENT_BASE_URL: "unset", VERIFY_MAILING_API_BASE_URL: API });
      const neither = await settingsUnder(ctx, "no base URL", { VERIFY_MAILING_CLIENT_BASE_URL: "unset", VERIFY_MAILING_API_BASE_URL: "unset" });
      await ctx.verify("each branch of the origin states a different one", [
        check("clientBaseUrl and apiBaseUrl set: the dashboard origin", both.url === `${DASHBOARD}${path}`, both.url),
        check("only apiBaseUrl set: the API origin, its trailing slash dropped", apiOnly.url === `https://api.verify.example${path}`, apiOnly.url),
        check("neither set: the origin the server was reached on", neither.url === `${new URL(ctx.state.apiUrl).origin}${path}`, neither.url),
      ]);
    },
  },
];
