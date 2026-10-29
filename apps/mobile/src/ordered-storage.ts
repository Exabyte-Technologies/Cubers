// Serialize updates to each credential/preference key so a slow old sign-out
// cannot finish after a newer sign-in and erase its stored session.
export function orderedWriter(
  raw: (key: string, value: string | null) => Promise<void>,
) {
  const pending = new Map<string, Promise<void>>();
  return async (key: string, value: string | null) => {
    const previous = pending.get(key) || Promise.resolve();
    const task = previous.catch(() => {}).then(() => raw(key, value));
    pending.set(key, task);
    try {
      await task;
    } finally {
      if (pending.get(key) === task) pending.delete(key);
    }
  };
}
