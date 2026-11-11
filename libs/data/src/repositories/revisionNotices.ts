import type { DomainChat } from '../domain';

/*
 * Reading the messages that revision notices point at.
 *
 * The socket library ships the same three helpers (`revisedIdsOf`, `readRevisedTargets`,
 * `defaultClassify`), and its sync plan uses them for the live path. They are restated here, matching
 * the library's behaviour, because the library has one entry point and it loads the whole socket
 * client — and with it a wire codec that needs `TextEncoder` the moment it is imported. The data layer
 * otherwise takes only types from that package, and every package that loads `@chatic/data` (the cache
 * adapters' tests among them) would start loading the socket client too.
 */

/** The messages the revision notices among `rows` point at (`edit$.chatId`), each once. */
export const revisedIdsOf = (rows: Array<Pick<DomainChat, 'subType' | 'edit$'>>): string[] =>
    [...new Set(rows.filter(row => row?.subType === 'edit').map(row => `${row.edit$?.chatId ?? ''}`))].filter(Boolean);

/**
 * Reads those messages together. Reading only: what to retry is the caller's call. `changed` holds the
 * rows read (an answer without an id is dropped); `failed` the reads that threw, with their errors.
 */
export const readRevisedTargets = async <T extends { id?: string }>(
    ids: string[],
    get: (id: string) => Promise<T | undefined>
): Promise<{ changed: T[]; failed: Array<{ id: string; error: unknown }> }> => {
    const reads = await Promise.all(
        ids.map(async id => {
            try {
                return { id, row: await get(id), error: undefined as unknown };
            } catch (error) {
                return { id, row: undefined, error: error ?? new Error(`read failed - ${id}`) };
            }
        })
    );
    return {
        changed: reads.map(read => read.row).filter((row): row is T => !!row?.id),
        failed: reads.filter(read => read.error !== undefined).map(({ id, error }) => ({ id, error })),
    };
};

/**
 * Whether a failed read means the message is gone for this reader — a socket error whose message opens
 * with 403 or 404 — rather than a moment's trouble. Reading it again would not help.
 */
export const isGoneFailure = (error: unknown): boolean => {
    const message = error instanceof Error ? error.message : `${error ?? ''}`;
    const code = /^\s*(\d{3})\b/.exec(message)?.[1];
    return code === '403' || code === '404';
};
