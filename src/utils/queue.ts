import * as log from "../utils/logger.ts";
import type { Queue, QueueItem } from "../types/queue.ts";

function enqueue(
    items: QueueItem[],
    url: string,
    options?: RequestInit,
): Promise<Response> {
    return new Promise((resolve, reject) => {
        items.push({ url, options, resolve, reject });
    });
}

async function process(items: QueueItem[]) {
    if (items.length === 0) return;

    const req = items.shift();
    if (!req) return;
    try {
        log.debug(`Processing request to ${req.url}`, req.options);
        const response = await fetch(req.url, req.options);
        req.resolve(response);
    } catch (err) {
        req.reject(err);
    }
}

export function createQueue(): Queue {
    const items: QueueItem[] = [];
    return {
        items,
        process: () => process(items),
        enqueue: (url: string, options?: RequestInit) =>
            enqueue(items, url, options),
    };
}
