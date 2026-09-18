import type { ProviderCapabilities } from "@antelopejs/interface-email";
import { expect } from "chai";
import {
  CAPABILITIES_TTL_MS,
  readCapabilities,
  resetCapabilitiesCache,
} from "../../services/provider";

const CAPABILITIES = {
  name: "smtp",
  features: { openTracking: false, clickTracking: false },
} as ProviderCapabilities;

function countingLoader() {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    load: () => {
      calls += 1;
      return Promise.resolve(CAPABILITIES);
    },
  };
}

describe("[unit] provider capabilities cache", () => {
  beforeEach(resetCapabilitiesCache);
  afterEach(resetCapabilitiesCache);

  it("asks the provider once inside the window", async () => {
    const loader = countingLoader();
    await readCapabilities(loader.load, 1000);
    await readCapabilities(loader.load, 1000 + CAPABILITIES_TTL_MS - 1);
    expect(loader.calls).to.equal(1);
  });

  it("asks again once the window has passed", async () => {
    const loader = countingLoader();
    await readCapabilities(loader.load, 1000);
    await readCapabilities(loader.load, 1000 + CAPABILITIES_TTL_MS);
    expect(loader.calls).to.equal(2);
  });

  // An unreachable provider is polled by the dashboard like any other: retrying
  // on every request would turn one outage into a burst of failing calls.
  it("memoises a failure instead of retrying on every request", async () => {
    let calls = 0;
    const failing = () => {
      calls += 1;
      return Promise.reject(new Error("down"));
    };
    expect(await readCapabilities(failing, 1000)).to.equal(null);
    expect(await readCapabilities(failing, 1500)).to.equal(null);
    expect(calls).to.equal(1);
  });
});
