import axios, { type AxiosInstance } from "axios";

const DEFAULT_BASE_URL = "http://127.0.0.1:5019";

export function getBaseUrl(): string {
  return process.env.TEST_API_BASE_URL ?? DEFAULT_BASE_URL;
}

export function createClient(): AxiosInstance {
  return axios.create({
    baseURL: getBaseUrl(),
    validateStatus: () => true,
    headers: {
      "x-antelopejs-namespace": "default",
      /** The DMS frontend states the reader's language on every request. */
      "x-content-language": "en",
    },
  });
}

export function authorizedClient(token: string): AxiosInstance {
  const client = createClient();
  client.defaults.headers.common.Authorization = `Bearer ${token}`;
  return client;
}

/** The tenant the test client's namespace header reaches. */
const TEST_TENANT_ID = "default";
const EVENTS_BASE_PATH = "/api/mailing/events";

/** The webhook address a provider posts the test tenant's events to. */
export function eventsPath(provider: string): string {
  return `${EVENTS_BASE_PATH}/${provider}/${TEST_TENANT_ID}`;
}
