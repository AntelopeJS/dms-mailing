import {
  GetCapabilities,
  type ProviderCapabilities,
} from "@antelopejs/interface-email";

/**
 * How long a capability read stays good. The provider card and the Overview's
 * attention list both ask on every request, and for a hosted provider
 * `GetCapabilities` is a network call — but what it answers only changes when
 * the project is reconfigured, so a short window costs nothing.
 */
export const CAPABILITIES_TTL_MS = 60_000;

type CapabilityLoader = () => Promise<ProviderCapabilities>;

interface CacheEntry {
  at: number;
  value: ProviderCapabilities | null;
}

let entry: CacheEntry | undefined;

/** Drops the memo so the next read hits the provider. For tests and teardown. */
export function resetCapabilitiesCache(): void {
  entry = undefined;
}

/**
 * The provider's capabilities, or `null` when it cannot be reached. A failure
 * is memoised too: an unreachable provider must not be retried once per request
 * while the dashboard polls.
 */
export async function readCapabilities(
  load: CapabilityLoader = GetCapabilities,
  now: number = Date.now(),
): Promise<ProviderCapabilities | null> {
  if (entry && now - entry.at < CAPABILITIES_TTL_MS) return entry.value;
  try {
    const value = await load();
    entry = { at: now, value };
    return value;
  } catch {
    entry = { at: now, value: null };
    return null;
  }
}
