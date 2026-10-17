import { Hook, RegisterHook } from "@antelopejs/interface-dms/hooks";

/** A promise opened once, and the calls that wait for it. */
export interface ReadyGate {
  open(): void;
  /** `task`, run once the gate is open. */
  after<Args extends unknown[], Result>(
    task: (...args: Args) => Promise<Result>,
  ): (...args: Args) => Promise<Result>;
}

export function createReadyGate(): ReadyGate {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return {
    open: () => open(),
    after:
      (task) =>
      async (...args) => {
        await opened;
        return task(...args);
      },
  };
}

/**
 * Opens once the DMS reports its schemas registered, which it does from its
 * own `start()`. Modules construct and start in parallel, so a project
 * declaring its content early waits here instead of failing.
 */
const databaseGate = createReadyGate();

/**
 * The DMS fires the hook on every start and runs a handler registered after
 * that at once: whatever the load order, the first firing opens the gate.
 * Its handlers run in series, so this one is registered first thing in
 * `construct()`, ahead of handlers that may wait on the gate.
 */
export function registerDatabaseReady(): void {
  RegisterHook(Hook.DATABASE_INITIALIZED, () => databaseGate.open());
}

/** `task`, run once the database is ready. */
export const afterDatabaseReady: ReadyGate["after"] = (task) =>
  databaseGate.after(task);
