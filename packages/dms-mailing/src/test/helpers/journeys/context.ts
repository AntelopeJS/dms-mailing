import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { z } from "zod";
import { capturedMail, type CapturedMail } from "../mail-store";
import { OWNER_CREDENTIALS } from "../owner";
import { SETUP_TOKEN } from "../setup-token";
import { FIXTURE_PREFIX, serveFixture } from "./fixture";
import { abortMessage, type Check, type JourneyEnd, type Step } from "./judge";
import type { Json } from "./json";
import { applyJourneyEnvironment } from "./switches";

/** An account a journey acts as. */
export interface Account {
  email: string;
  password: string;
  userId: string | null;
}

/**
 * The run the journeys share, in the fields the journeys read of the e2e
 * kit's run state: the API (which is also the dashboard origin here, since no
 * dashboard runs), the checkout, a scratch folder, the accounts and their
 * session tokens, and the `VERIFY_MAILING_*` variables of the next restart.
 */
export interface JourneyState {
  id: string;
  apiUrl: string;
  webUrl: string;
  repo: string;
  dir: string;
  evidence: string;
  tokens: Record<string, string>;
  accounts: Record<string, Account>;
  extraEnv: Record<string, string>;
  journeyCount: number;
}

/** A call to the backend as an account (`admin` by default, `anon` for nobody) or with an explicit token. */
export interface ApiRequest {
  method: string;
  path: string;
  body?: Json;
  as?: string;
  token?: string;
}

/** What the backend answered, `status` null when no answer came. */
export interface ApiAnswer {
  status: number | null;
  body: unknown;
  error: string | null;
  folder: string;
}

const EXPECT_TIMEOUT_MS = 15_000;
const POLL_MS = 250;
const REQUEST_TIMEOUT_MS = 30_000;
const UNIQUE_BYTES = 3;
const PASSWORD_BYTES = 9;
const UNAUTHORIZED = 401;
const accessToken = z.object({ access_token: z.string() });

class JourneyAbort extends Error {
  constructor(readonly step: string) {
    super(abortMessage(step));
  }
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function writeJson(file: string, value: Json | Check[] | CapturedMail[]): void {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

/** Sends one request and keeps `request.json` and `response.json` in `folder`, the token left out. */
async function recordedRequest(
  folder: string,
  url: string,
  request: ApiRequest,
): Promise<ApiAnswer> {
  const headers = new Headers({ accept: "application/json" });
  if (request.body !== undefined)
    headers.set("content-type", "application/json");
  if (request.token) headers.set("authorization", `Bearer ${request.token}`);
  const shown = { method: request.method, url, body: request.body ?? null };
  writeJson(join(folder, "request.json"), shown);
  let answer: ApiAnswer;
  try {
    const response = await fetch(url, {
      method: request.method,
      headers,
      body:
        request.body === undefined ? undefined : JSON.stringify(request.body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await response.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    answer = { status: response.status, body, error: null, folder };
  } catch (error) {
    answer = { status: null, body: null, error: String(error), folder };
  }
  writeFileSync(join(folder, "response.json"), JSON.stringify(answer, null, 2));
  return answer;
}

/**
 * What a journey drives the stack through, in-process: the API as an account,
 * the trusted fixture routes, the mail the SMTP fixture kept, and checks
 * recorded into numbered step folders under the run's evidence folder. It is
 * the part of the e2e kit's `JourneyContext` the HTTP and command-line
 * journeys use; there is no browser.
 */
export class JourneyContext {
  readonly folder: string;
  readonly steps: Step[] = [];
  readonly end: JourneyEnd = { error: null, abortedAt: null };
  readonly startedAt = new Date().toISOString();
  private index = 0;

  constructor(
    readonly state: JourneyState,
    readonly feature: string,
    readonly journey: string,
  ) {
    this.folder = join(state.evidence, feature, journey);
    rmSync(this.folder, { recursive: true, force: true });
    mkdirSync(this.folder, { recursive: true });
  }

  /** A new numbered step folder. */
  step(label: string): string {
    this.index += 1;
    const folder = join(
      this.folder,
      `${String(this.index).padStart(2, "0")}-${slug(label)}`,
    );
    mkdirSync(folder, { recursive: true });
    return folder;
  }

  /** Records the checks of a step folder; a failed critical step ends the journey. */
  record(
    folder: string,
    checks: Check[],
    options: { critical?: boolean } = {},
  ): boolean {
    const name = relative(this.folder, folder);
    this.steps.push({ name, checks });
    writeJson(join(folder, "checks.json"), checks);
    const passed = checks.every((check) => check.pass);
    if (!passed && options.critical) throw new JourneyAbort(name);
    return passed;
  }

  /** Records a step of checks, which may be promises; with `critical` a failure ends the journey. */
  async verify(
    label: string,
    checks: (Check | Promise<Check>)[],
    options: { critical?: boolean } = {},
  ): Promise<boolean> {
    const folder = this.step(label);
    const settled = await Promise.all(
      checks.map((check) => Promise.resolve(check)),
    );
    return this.record(folder, settled, options);
  }

  /**
   * Calls the backend as `request.as`, signing the account in once more when
   * its token is refused, or with an explicit token and no retry. A path
   * under `/playground-mailing` reaches the trusted fixture routes in-process.
   */
  async api(label: string, request: ApiRequest): Promise<ApiAnswer> {
    const folder = (): string => this.step(`api ${label}`);
    if (request.path.startsWith(`${FIXTURE_PREFIX}/`)) {
      return this.fixture(folder(), request);
    }
    const url = `${this.state.apiUrl}${request.path}`;
    if (request.token) return recordedRequest(folder(), url, request);
    const account = request.as ?? "admin";
    if (account === "anon") return recordedRequest(folder(), url, request);
    if (!this.state.tokens[account]) await this.signIn(account);
    const send = (): Promise<ApiAnswer> =>
      recordedRequest(folder(), url, {
        ...request,
        token: this.state.tokens[account],
      });
    const first = await send();
    if (first.status !== UNAUTHORIZED) return first;
    await this.signIn(account);
    return send();
  }

  /** Adds an account the journey created (an invited member) so the API can act as it. */
  addAccount(name: string, credentials: Account): void {
    this.state.accounts = { ...this.state.accounts, [name]: credentials };
  }

  /** An address unique to this run and journey. */
  email(name: string): string {
    return `${name}+${this.state.id}-${slug(this.journey)}@verify.local`.toLowerCase();
  }

  /** A string unique to this journey, for names a journey creates. */
  unique(prefix: string): string {
    return `${prefix} ${randomBytes(UNIQUE_BYTES).toString("hex")}`;
  }

  /** A password the DMS policy accepts: an uppercase letter, a digit and a symbol, eight characters or more. */
  password(): string {
    return `Vr1!${randomBytes(PASSWORD_BYTES).toString("base64url").replace(/[-_]/g, "x")}`;
  }

  /** The credentials of the workspace's owner, the account `admin`. */
  adminCredentials(): typeof OWNER_CREDENTIALS {
    return OWNER_CREDENTIALS;
  }

  /** The setup token the backend accepts for the first registration. */
  setupToken(): string {
    return SETUP_TOKEN;
  }

  /**
   * The mail the SMTP fixture kept since the journey started, waiting until
   * `accept` matches one or the timeout passes; `match` is the latest match.
   */
  async mail(
    accept: (message: CapturedMail) => boolean,
    timeoutMs = EXPECT_TIMEOUT_MS,
  ): Promise<{
    folder: string;
    messages: CapturedMail[];
    match: CapturedMail | undefined;
  }> {
    const deadline = Date.now() + timeoutMs;
    const since = (): CapturedMail[] =>
      capturedMail().filter((message) => message.receivedAt >= this.startedAt);
    let messages = since();
    while (!messages.some(accept) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      messages = since();
    }
    const folder = this.step("mail");
    writeJson(join(folder, "mail.json"), messages);
    return { folder, messages, match: messages.findLast(accept) };
  }

  /**
   * What a restart of the backend gives the journey in-process: the
   * configuration `state.extraEnv` describes, applied to the running stack,
   * and the module's in-memory caches dropped. The data is the database's,
   * which a restart keeps.
   */
  restartBackend(): Promise<void> {
    return applyJourneyEnvironment(this.state.extraEnv);
  }

  /**
   * Runs the journey's body; a critical step that fails in it, or an error it
   * throws, ends it, and the judge reads how from `end`.
   */
  async drive(run: (context: JourneyContext) => Promise<void>): Promise<void> {
    try {
      await run(this);
    } catch (failure) {
      if (failure instanceof JourneyAbort) this.end.abortedAt = failure.step;
      else
        this.end.error =
          failure instanceof Error
            ? (failure.stack ?? failure.message)
            : String(failure);
    }
  }

  private async fixture(
    folder: string,
    request: ApiRequest,
  ): Promise<ApiAnswer> {
    writeJson(join(folder, "request.json"), {
      method: request.method,
      path: request.path,
      body: request.body ?? null,
    });
    const answer = await serveFixture(request.path, request.body ?? null);
    const recorded = { ...answer, error: null, folder };
    writeFileSync(
      join(folder, "response.json"),
      JSON.stringify(recorded, null, 2),
    );
    return recorded;
  }

  private async signIn(account: string): Promise<void> {
    const credentials = this.state.accounts[account];
    if (!credentials) throw new Error(`No account ${account} in the run`);
    const login = await recordedRequest(
      this.step(`login ${account}`),
      `${this.state.apiUrl}/api/auth/login`,
      {
        method: "POST",
        path: "/api/auth/login",
        body: { email: credentials.email, password: credentials.password },
      },
    );
    const token = accessToken.safeParse(login.body);
    if (token.success) {
      this.state.tokens = {
        ...this.state.tokens,
        [account]: token.data.access_token,
      };
    }
  }
}
