import { checkedText } from "./checked";
import { createClient } from "./http";
import { SETUP_TOKEN } from "./setup-token";

/** The account the test run onboards as the workspace's owner. */
export const OWNER_CREDENTIALS = {
  email: "owner@test.local",
  password: "TestPassw0rd!",
  firstName: "Test",
  lastName: "Owner",
};

const HTTP_BAD_REQUEST = 400;

export interface OwnerSession {
  accessToken: string;
  email: string;
}

let ownerSession: Promise<OwnerSession> | undefined;

/** Onboards the owner and signs it in once per test run; later calls reuse that session. */
export function ensureOwnerSession(): Promise<OwnerSession> {
  ownerSession ??= openOwnerSession();
  return ownerSession;
}

async function openOwnerSession(): Promise<OwnerSession> {
  const client = createClient();
  const registration = await client.post("/api/onboarding/register", {
    ...OWNER_CREDENTIALS,
    setupToken: SETUP_TOKEN,
  });
  const isRegistered = registration.status < HTTP_BAD_REQUEST;
  const isAlreadyRegistered = registration.status === HTTP_BAD_REQUEST;
  if (!isRegistered && !isAlreadyRegistered) {
    throw new Error(
      `Onboarding failed [${registration.status}]: ${JSON.stringify(registration.data)}`,
    );
  }
  const login = await client.post("/api/auth/login", {
    email: OWNER_CREDENTIALS.email,
    password: OWNER_CREDENTIALS.password,
  });
  if (login.status >= HTTP_BAD_REQUEST) {
    throw new Error(
      `Login failed [${login.status}]: ${JSON.stringify(login.data)}`,
    );
  }
  return {
    accessToken: checkedText.parse(login.data.access_token),
    email: OWNER_CREDENTIALS.email,
  };
}
