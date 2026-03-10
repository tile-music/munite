import * as log from "../utils/logger.ts";
import type { Queue, QueueItem } from "../types/queue.ts";
import fetchRetry from "../utils/fetch.ts";

export function createQueue(reqPerSec: number = 1): Queue {
    const items: QueueItem[] = [];
    const interval = 1000 / reqPerSec;

    let running = false;
    let lastExecution = 0;

    async function sleep(ms: number) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    async function drain() {
        if (running) return;
        running = true;

        while (items.length > 0) {
            const now = Date.now();
            const timeSinceLast = now - lastExecution;

            if (timeSinceLast < interval) {
                await sleep(interval - timeSinceLast);

            }

            const req = items.shift();
            if (!req) continue;

            lastExecution = Date.now();

            try {
                log.debug(`Processing request to ${req.url}`, req.options);
                const response = await fetchRetry(req.url, req.options);
                req.resolve(response);
            } catch (err) {
                req.reject(err);
            }
        }

        running = false;
    }

    function enqueue(
        url: string,
        options?: Parameters<typeof fetch>[1],
    ): Promise<Response> {
        return new Promise((resolve, reject) => {
            items.push({ url, options, resolve, reject });
            drain(); // trigger processing
        });
    }

    return {
        items,
        process: drain, // kept for compatibility
        enqueue,
    };
}
