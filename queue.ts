/*
 * Create a message queue for processing API requests, to be executed
 * at a maximum rate to avoid rate limiting issues.
 */

export type Queue = {
    items: QueueItem[];
    process: () => void;
    enqueue: (url: string, options?: RequestInit) => Promise<Response>;
};

/**
 * A single request in the queue.
 */
type QueueItem = {
    url: string;
    options?: RequestInit;
    resolve: (value: Response) => void;
    reject: (reason?: unknown) => void;
};

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
