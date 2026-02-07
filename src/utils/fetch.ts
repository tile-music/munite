import * as log from "../utils/logger.ts";

const RETRY_COUNT: number = Number(Deno.env.get("RETRY_COUNT")) || 5;
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
  let attemptsLeft = RETRY_COUNT;
  let backoff = INITIAL_BACKOFF_MS;
  let lastError: unknown;

  while (attemptsLeft > 0) {
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
      lastError = error;
      attemptsLeft -= 1;

      if (attemptsLeft === 0) break;

      log.debug(
        `fetch failed, retrying in ${backoff}ms (${attemptsLeft} attempts left)`,
        error
      );

      await sleep(backoff);
      backoff *= 2;
    }
  }

  throw new Error(
    `Request retried too many times: ${args[0]}\nLast error: ${String(lastError)}`
  );
}

export default fetchRetry;
