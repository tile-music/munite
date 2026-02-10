import * as log from "../utils/logger.ts";
import { getConfig } from "../core/config.ts";

const INITIAL_BACKOFF_MS = 100;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  // Retry only on transient failures
  return (
    status === 429 ||               // rate limited
    (status >= 500 && status < 600) // server errors
  );
}

async function fetchRetry(
  ...args: Parameters<typeof fetch>
): Promise<Response> {
  const retry_count = Number(getConfig().retry_count) || 5;
  let attempts_left = retry_count;
  let backoff = INITIAL_BACKOFF_MS;
  let last_error: unknown;

  while (attempts_left > 0) {
    try {
      const response = await fetch(...args);

      if (!response.ok) {
        if (isRetryableStatus(response.status)) {
          throw new Error(
            `Retryable HTTP error ${response.status} ${response.statusText}`
          );
        }

        // Non-retryable HTTP error: return immediately
        return response;
      }

      return response;
    } catch (error) {
      last_error = error;
      attempts_left -= 1;

      if (attempts_left === 0) break;

      log.debug(
        `fetch failed, retrying in ${backoff}ms (${attempts_left} attempts left)`,
        error
      );

      await sleep(backoff);
      backoff *= 2;
    }
  }

  throw new Error(
    `Request retried too many times: ${args[0]}\nLast error: ${String(last_error)}`
  );
}

export default fetchRetry;
