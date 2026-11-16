import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const FIXTURES_DIR = join(__dirname, "../../../src/test/fixtures");
const answersSchema = z.record(z.string(), z.unknown());

/** API answers recorded from a known-good run, keyed by the request. */
export type GoldenAnswers = Map<string, unknown>;

/** The answers recorded in `fixtures/<name>`. */
export function readGolden(name: string): GoldenAnswers {
  const text = readFileSync(join(FIXTURES_DIR, name), "utf8");
  return new Map(Object.entries(answersSchema.parse(JSON.parse(text))));
}

/** Records `answers` as `fixtures/<name>`, the reference later runs compare with. */
export function recordGolden(name: string, answers: GoldenAnswers): void {
  const text = JSON.stringify(Object.fromEntries(answers), null, 2);
  writeFileSync(join(FIXTURES_DIR, name), `${text}\n`);
}
