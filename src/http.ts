/** Bounded HTTP reads against fixed public endpoints; no payload logging. */
export class ApiError extends Error {
  constructor(public code: string, message: string, public retryable = false, public upstreamCode?: string) {
    super(message);
  }
}

export type RequestOptions = {
  headers?: Record<string, string>;
  fetcher?: typeof fetch; timeoutMs?: number; retries?: number;
  sleep?: (ms: number) => Promise<void>;
  signal?: AbortSignal;
};

export async function getJson(url: URL, options: RequestOptions = {}): Promise<unknown> {
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? 30000;
  // Orchestration owns production retries so each tool call consumes one attempt.
  const retries = options.retries ?? 0;
  if (!Number.isInteger(retries) || retries < 0 || retries > 2 || timeoutMs <= 0) {
    throw new ApiError("configuration", "Invalid HTTP timeout or retry limit");
  }
  for (let attempt = 0; ; attempt++) {
    if (options.signal?.aborted) throw new ApiError("cancelled", "Tool request cancelled");
    const controller = new AbortController();
    const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(url, {
        signal, headers: {Accept: "application/json", ...options.headers}, redirect: "error",
      });
      if (!response.ok) {
        // Preserve only the machine-readable error code, never raw upstream payloads.
        let upstreamCode: string | undefined;
        if (response.status === 404) {
          try {
            const body = await response.json() as {error?: {code?: unknown}};
            if (typeof body?.error?.code === "string") upstreamCode = body.error.code;
          } catch (error) {
            if (signal.aborted) throw error;
          }
        }
        throw new ApiError(`http_${response.status}`, `Upstream HTTP ${response.status}`,
          response.status === 429 || response.status >= 500, upstreamCode);
      }
      try { return await response.json(); }
      catch (error) {
        if (signal.aborted) throw error;
        throw new ApiError("invalid_json", "Upstream returned invalid JSON");
      }
    } catch (error) {
      const failure = options.signal?.aborted ? new ApiError("cancelled", "Tool request cancelled") : error instanceof ApiError ? error : new ApiError(
        controller.signal.aborted ? "timeout" : "network",
        controller.signal.aborted ? "Upstream request timed out" : "Upstream network request failed", true);
      if (!failure.retryable || attempt >= retries) throw failure;
      clearTimeout(timer);
      await (options.sleep ?? ((ms) => new Promise(resolve => setTimeout(resolve, ms))))(250 * 2 ** attempt);
    } finally { clearTimeout(timer); }
  }
}
