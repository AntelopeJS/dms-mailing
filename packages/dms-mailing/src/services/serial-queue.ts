/** The tail of each key's queue: the task queued last, failures swallowed. */
const tails = new Map<string, Promise<unknown>>();

/**
 * Runs `task` once every task queued before it under `key` has settled, so
 * writers that rewrite a whole row or set of rows never interleave.
 * Serialization is process-local: another process writing the same rows is
 * not coordinated.
 */
export function inQueue<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = tails.get(key) ?? Promise.resolve();
  const next = previous.then(task, task);
  const tail = next.catch(() => undefined);
  tails.set(key, tail);
  void tail.then(() => {
    if (tails.get(key) === tail) tails.delete(key);
  });
  return next;
}
