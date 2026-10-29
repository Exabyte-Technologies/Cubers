type Identity = { token: string | null; region: string };
export async function sessionRequest<T>(
  expected: Identity,
  current: () => Identity,
  run: () => Promise<T>,
  message: string,
): Promise<T> {
  const check = () => {
    const now = current();
    if (now.token !== expected.token || now.region !== expected.region)
      throw Object.assign(new Error(message), {
        status: 409,
        code: "SESSION_CHANGED",
      });
  };
  check();
  const result = await run();
  check();
  return result;
}
