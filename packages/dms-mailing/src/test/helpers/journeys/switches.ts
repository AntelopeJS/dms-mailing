import { ImplementInterface } from "@antelopejs/interface-core";
import { GetApiBaseUrl } from "@antelopejs/interface-dms/api-base-url";
import { GetClientBaseUrl } from "@antelopejs/interface-dms/client-base-url";
import {
  GetCapabilities,
  type ProviderCapabilities,
} from "@antelopejs/interface-email";
import { z } from "zod";
import { resetCapabilitiesCache } from "../../../services/provider";
import { SMTP_DOWN_VARIABLE } from "../mail-store";

const UNSET = "unset";

/**
 * The `VERIFY_MAILING_*` variables a journey sets before it restarts the
 * backend, as the e2e playground reads them. `VERIFY_MAILING_PROVIDER`
 * `fake` swaps the provider's capabilities only (its name, or none while
 * `VERIFY_MAILING_PROVIDER_NAME` is unset): sends still reach the SMTP
 * fixture. `down` makes the SMTP fixture refuse every connection. A base URL
 * set to `unset` answers none. Any other variable has no in-process
 * equivalent and is refused.
 */
const switchesSchema = z
  .object({
    VERIFY_MAILING_PROVIDER: z.enum(["fake", "down"]).optional(),
    VERIFY_MAILING_PROVIDER_NAME: z.string().optional(),
    VERIFY_MAILING_CLIENT_BASE_URL: z.string().optional(),
    VERIFY_MAILING_API_BASE_URL: z.string().optional(),
  })
  .strict();

type Switches = z.infer<typeof switchesSchema>;

interface Defaults {
  capabilities: ProviderCapabilities;
  clientBaseUrl: string | undefined;
  apiBaseUrl: string | undefined;
}

let current: Switches = {};
let installed: Promise<void> | undefined;

function fakeCapabilities(name: string | undefined) {
  if (name === undefined) {
    return Promise.reject(
      new Error("the verification provider reports no capabilities"),
    );
  }
  return Promise.resolve({
    name,
    features: {
      batch: true,
      templates: false,
      providerTemplates: false,
      scheduling: false,
      openTracking: true,
      clickTracking: true,
      inlineAttachments: false,
      tags: true,
      metadata: true,
      priority: false,
    },
  });
}

function originOf(value: string | undefined): string | undefined {
  return value === undefined || value === UNSET ? undefined : value;
}

function originsSwitched(): boolean {
  return (
    current.VERIFY_MAILING_CLIENT_BASE_URL !== undefined ||
    current.VERIFY_MAILING_API_BASE_URL !== undefined
  );
}

/**
 * Puts a wrapper in front of the provider's capabilities and the DMS origins,
 * once: it answers what the switches ask for, and otherwise what the provider
 * and the DMS answered before the wrapper went in. These answers come from
 * configuration and do not change while the stack runs, which is why the
 * wrapper replays them instead of calling the implementation it replaced.
 */
async function install(): Promise<void> {
  const defaults: Defaults = {
    capabilities: await GetCapabilities(),
    clientBaseUrl: await GetClientBaseUrl(),
    apiBaseUrl: await GetApiBaseUrl(),
  };
  ImplementInterface(
    { GetCapabilities },
    {
      GetCapabilities: () =>
        current.VERIFY_MAILING_PROVIDER === "fake"
          ? fakeCapabilities(current.VERIFY_MAILING_PROVIDER_NAME)
          : Promise.resolve(defaults.capabilities),
    },
  );
  ImplementInterface(
    { GetClientBaseUrl },
    {
      GetClientBaseUrl: () =>
        Promise.resolve(
          originsSwitched()
            ? originOf(current.VERIFY_MAILING_CLIENT_BASE_URL)
            : defaults.clientBaseUrl,
        ),
    },
  );
  ImplementInterface(
    { GetApiBaseUrl },
    {
      GetApiBaseUrl: () =>
        Promise.resolve(
          originsSwitched()
            ? originOf(current.VERIFY_MAILING_API_BASE_URL)
            : defaults.apiBaseUrl,
        ),
    },
  );
}

/**
 * Gives the running stack the configuration `environment` describes, as a
 * restart of the playground's backend with those variables would, and drops
 * the provider capabilities the module keeps in memory. An empty environment
 * is the module's defaults.
 */
export async function applyJourneyEnvironment(
  environment: Readonly<Record<string, string>>,
): Promise<void> {
  const switches = switchesSchema.parse(environment);
  if (Object.keys(switches).length > 0) {
    installed ??= install();
    await installed;
  }
  current = switches;
  process.env[SMTP_DOWN_VARIABLE] =
    switches.VERIFY_MAILING_PROVIDER === "down" ? "1" : "0";
  resetCapabilitiesCache();
}
