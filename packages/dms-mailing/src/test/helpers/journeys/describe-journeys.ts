import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect } from "chai";
import { z } from "zod";
import { getBaseUrl } from "../http";
import { ensureOwnerSession, OWNER_CREDENTIALS } from "../owner";
import { JourneyContext, type JourneyState } from "./context";
import { failureReport, judge, type JudgedJourney } from "./judge";
import { applyJourneyEnvironment } from "./switches";
import { resetWorkspace } from "./workspace";

const DEFAULT_TIMEOUT_MS = 60_000;
const RESET_TIMEOUT_MS = 30_000;
const RUN_ID_BYTES = 4;
const WORKSPACE_MARKER = "pnpm-workspace.yaml";

/**
 * A journey of `e2e/journeys/<feature>.mjs`, as the e2e kit declares it: its
 * `run` drives the stack through a context and records checks;
 * `knownFailures` maps the name of each check that fails today to the
 * finding that makes it fail.
 */
const journeySchema = z
  .object({
    id: z.string(),
    title: z.string(),
    entryPoint: z.string(),
    knownFailures: z.record(z.string()).default({}),
    run: z
      .function()
      .args(z.instanceof(JourneyContext))
      .returns(z.promise(z.void())),
  })
  .strict();

/** A feature module: `journeys` the Playwright suite runs, `apiJourneys` this suite runs. */
const featureSchema = z.object({ apiJourneys: z.array(journeySchema) });

type Journey = z.infer<typeof journeySchema>;

/** The checkout's root: the first folder up from here that holds the pnpm workspace file. */
function repoRoot(from: string = __dirname): string {
  if (existsSync(join(from, WORKSPACE_MARKER))) return from;
  const parent = dirname(from);
  if (parent === from) throw new Error(`no ${WORKSPACE_MARKER} above ${from}`);
  return repoRoot(parent);
}

let run: Promise<JourneyState> | undefined;
let failed = false;
let cleanupRegistered = false;

async function openRun(): Promise<JourneyState> {
  const owner = await ensureOwnerSession();
  const dir = mkdtempSync(join(tmpdir(), "dms-mailing-journeys-"));
  const { email, password } = OWNER_CREDENTIALS;
  return {
    id: randomBytes(RUN_ID_BYTES).toString("hex"),
    apiUrl: getBaseUrl(),
    webUrl: getBaseUrl(),
    repo: repoRoot(),
    dir,
    evidence: join(dir, "evidence"),
    tokens: { admin: owner.accessToken },
    accounts: { admin: { email, password, userId: null } },
    extraEnv: {},
    journeyCount: 0,
  };
}

/** The run every journey of the process shares, opened by the first journey: the owner's session and an evidence folder under the OS temp folder. */
function runState(): Promise<JourneyState> {
  run ??= openRun();
  return run;
}

/** Removes the run's scratch and evidence folder once every journey passed; a failure keeps it for whoever reads the failure. */
async function removeRunUnlessFailed(): Promise<void> {
  if (failed || run === undefined) return;
  await rm((await run).dir, { recursive: true, force: true });
}

/** Gives the next journey a workspace that never opened Mailing, under the module's default configuration. */
async function freshWorkspace(): Promise<void> {
  const state = await runState();
  state.extraEnv = {};
  await applyJourneyEnvironment(state.extraEnv);
  await resetWorkspace();
}

async function runJourney(
  feature: string,
  journey: Journey,
): Promise<JudgedJourney> {
  const state = await runState();
  state.journeyCount += 1;
  const context = new JourneyContext(state, feature, journey.id);
  await context.drive(journey.run);
  if (context.steps.length === 0 && context.end.error === null) {
    context.end.error = "the journey recorded no check";
  }
  const judged = judge(context.steps, context.end, journey.knownFailures);
  if (judged.status !== "PASS") failed = true;
  return judged;
}

/** The HTTP and command-line journeys `e2e/journeys/<feature>.mjs` exports as `apiJourneys`. */
function loadApiJourneys(feature: string): Journey[] {
  const file = join(repoRoot(), "e2e", "journeys", `${feature}.mjs`);
  return featureSchema.parse(require(file)).apiJourneys;
}

/**
 * Declares one test per HTTP and command-line journey of a feature, named by
 * the journey's id. Each runs in-process against this stack on a workspace
 * reset before and after it, and fails with every failing check, every
 * known failure that now passes, and what ended it early.
 *
 * @param feature The feature module under `e2e/journeys`
 * @param timeouts The timeout of a journey slower than a minute, by id
 */
export function describeJourneys(
  feature: string,
  timeouts: Readonly<Record<string, number>> = {},
): void {
  const journeys = loadApiJourneys(feature);
  const ids = new Set(journeys.map((journey) => journey.id));
  const strays = Object.keys(timeouts).filter((id) => !ids.has(id));
  if (journeys.length === 0 || strays.length > 0) {
    throw new Error(
      `${feature}: ${journeys.length} API journeys, timeouts for unknown journeys: ${strays.join(", ")}`,
    );
  }
  if (!cleanupRegistered) {
    cleanupRegistered = true;
    after(function () {
      this.timeout(RESET_TIMEOUT_MS);
      return removeRunUnlessFailed();
    });
  }
  describe(`[journeys] ${feature}`, function () {
    this.timeout(RESET_TIMEOUT_MS);
    beforeEach(freshWorkspace);
    afterEach(freshWorkspace);
    for (const journey of journeys) {
      it(journey.id, async () => {
        const judged = await runJourney(feature, journey);
        expect(judged.status, failureReport(judged)).to.equal("PASS");
      }).timeout(
        Object.hasOwn(timeouts, journey.id)
          ? timeouts[journey.id]
          : DEFAULT_TIMEOUT_MS,
      );
    }
  });
}
