// React Native's AbortSignal polyfill does not provide AbortSignal.timeout().
// Use only the AbortController APIs implemented on both native and web.
export async function withTimeout<T>(
  request: (signal: AbortSignal) => Promise<T>,
  milliseconds: number,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), milliseconds);
  try {
    return await request(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}
