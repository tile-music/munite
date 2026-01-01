import * as log from "../utils/logger.ts";

const RETRY_COUNT : number = Number(Deno.env.get("RETRY_COUNT")) || 5;

async function fetchRetry(
    ...args : Parameters<typeof fetch>
) : ReturnType<typeof fetch> {
  let count : number = RETRY_COUNT;
  let backoff = 100;
  while(count > 0) {
    try {
      return await fetch(...args);
    } catch(error) {
      log.debug(
          "fetch failed probably due to rate limit, retrying in"
          + backoff + "ms."
      )
    }

    await new Promise(resolve => setTimeout(resolve, backoff));
    backoff *= 2;
    count -= 1;
  }

  throw new Error(`Request retried too many times ${args[0]}`);
}

export default fetchRetry;
