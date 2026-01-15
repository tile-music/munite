/*
 * Create a message queue for processing API requests, to be executed
 * at a maximum rate to avoid rate limiting issues.
 */
type Queue = {
    items: QueueItem[];
    process: () => void;
    enqueue: (
        url: string,
        options?: Parameters<typeof fetch>[1],
    ) => Promise<Response>;
};

/**
 * A single request in the queue.
 */
type QueueItem = {
    url: string;
    options?: Parameters<typeof fetch>[1];
    resolve: (value: Response) => void;
    reject: (reason?: unknown) => void;
};

export type { Queue, QueueItem };
