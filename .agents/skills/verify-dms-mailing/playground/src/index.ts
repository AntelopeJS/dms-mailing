import { Hook, RegisterHook } from "@antelopejs/interface-dms/hooks";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { provision } from "./calls";
import "./export";
import "./fixture";

const STEPS = z.array(z.object({ fn: z.string(), args: z.array(z.unknown()) }));

/**
 * Ships the calls the file named by `VERIFY_MAILING_DECLARE` lists for every
 * tenant the DMS provisions: the way the docs tell a project to ship
 * templates, categories and the sender as code, from
 * `Hook.TENANT_BEING_PROVISIONED` registered in `construct()`.
 */
export function construct(): void {
  const file = process.env.VERIFY_MAILING_DECLARE;
  if (!file) return;
  RegisterHook(Hook.TENANT_BEING_PROVISIONED, ({ tenantId }) =>
    provision(STEPS.parse(JSON.parse(readFileSync(file, "utf8").replaceAll("$tenant", tenantId)))),);
}

export function start(): void {}
